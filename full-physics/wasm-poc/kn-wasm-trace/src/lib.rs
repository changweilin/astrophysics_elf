// kn_wasm_trace — faithful Rust/WASM port of the Kerr-Newman geodesic
// ray-trace kernel:
//   - kn-full-physics.mjs: metric (BL cov+inv), kineticMomentum (q=0 photon),
//     hamiltonian, partialHamiltonian (central diff, 1e-5*scale steps,
//     radial/pole floors), derivatives, zamoFrame, nullVectorFromLocal,
//     canonicalMomentum.
//   - adaptive-integrator.mjs: rk45Pair (Dormand-Prince), adaptiveStep
//     (same error norm, safety 0.9, factor clamp 0.2..4, horizon
//     interpolation guard), integrateAdaptive core loop.
//   - ray-tracing.mjs: cameraSampleToLocalDirection + makeCameraRay init,
//     classifyRayResult, estimateEquatorialDiscHit (streamed over the same
//     recordEvery frame cadence).
//   - lensing-worker.mjs: asymptoticSkyDirection, crossingRadialMomentum,
//     perihelion min-r (ringGlow input).
// Same algorithm, same constants, f64 throughout. Zero dependencies;
// plain #[no_mangle] extern "C" exports over flat f64 pointers.
//
// JS-semantics notes:
//   - jmax/jmin/jclamp propagate NaN like Math.max/min (Rust f64::max does
//     not), so degenerate steps reject/fail exactly like the JS kernel.
//   - Summation order of the sparse metric contractions matches the JS
//     nested-loop order; the skipped terms are exact zeros.

use std::f64::consts::PI;

const POLE_EPS: f64 = 1e-7; // kn-full-physics.mjs POLE_EPS
const EPS_PHYS: f64 = 1e-12; // kn-full-physics.mjs EPS
const EPS_INT: f64 = 1e-14; // adaptive-integrator.mjs EPS
const EPS_RAY: f64 = 1e-12; // ray-tracing.mjs EPS

#[inline(always)]
fn jmax(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if b > a {
        b
    } else {
        a
    }
}

#[inline(always)]
fn jmin(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if b < a {
        b
    } else {
        a
    }
}

#[inline(always)]
fn jclamp(v: f64, lo: f64, hi: f64) -> f64 {
    jmin(hi, jmax(lo, v))
}

#[inline(always)]
fn wrap_angle(phi: f64) -> f64 {
    let tau = PI * 2.0;
    ((phi + PI) % tau + tau) % tau - PI
}

#[inline(always)]
fn hypot3(x: f64, y: f64, z: f64) -> f64 {
    x.hypot(y).hypot(z)
}

#[derive(Clone, Copy)]
struct Params {
    m: f64,
    q: f64,
    a: f64,
}

#[derive(Clone, Copy)]
struct Horizons {
    r_plus: f64,
    naked: bool,
}

fn horizons(p: &Params) -> Horizons {
    let disc = p.m * p.m - p.a * p.a - p.q * p.q;
    if disc < 0.0 {
        Horizons { r_plus: f64::NAN, naked: true }
    } else {
        Horizons { r_plus: p.m + disc.sqrt(), naked: false }
    }
}

struct Env {
    p: Params,
    hz: Horizons,
}

// State layout mirrors DYNAMIC_KEYS: t, r, theta, phi, Pt, Pr, Ptheta, Pphi.
type State = [f64; 8];
const IR: usize = 1;
const ITH: usize = 2;
const IPH: usize = 3;
const IPT: usize = 4;
const IPR: usize = 5;
const IPTH: usize = 6;
const IPPH: usize = 7;

struct Metric {
    gtt: f64,
    gtphi: f64,
    grr: f64,
    gthth: f64,
    gphph: f64,
    itt: f64,
    itphi: f64,
    irr: f64,
    ithth: f64,
    iphph: f64,
}

// metric(): returns None where the JS version throws.
fn metric(p: &Params, r: f64, theta: f64) -> Option<Metric> {
    let s = theta.sin();
    let s2 = s * s;
    let c = theta.cos();
    let sig = r * r + p.a * p.a * c * c;
    let del = r * r - 2.0 * p.m * r + p.a * p.a + p.q * p.q;
    if sig <= 0.0 {
        return None;
    }
    if del.abs() < EPS_PHYS {
        return None;
    }
    let common = 2.0 * p.m * r - p.q * p.q;
    let gtt = -(1.0 - common / sig);
    let gtphi = -p.a * s2 * common / sig;
    let grr = sig / del;
    let gthth = sig;
    let w = r * r + p.a * p.a;
    let gphph = s2 * ((w * w - del * p.a * p.a * s2) / sig);
    let det = gtt * gphph - gtphi * gtphi;
    Some(Metric {
        gtt,
        gtphi,
        grr,
        gthth,
        gphph,
        itt: gphph / det,
        itphi: -gtphi / det,
        irr: del / sig,
        ithth: 1.0 / sig,
        iphph: gtt / det,
    })
}

// hamiltonian() for a photon (chargeToMass = 0, kinetic momentum == canonical).
// Term order matches the JS i,j nested loop over the sparse inverse metric.
fn hamiltonian(p: &Params, s: &State) -> Option<f64> {
    let g = metric(p, s[IR], s[ITH])?;
    let (pt, pr, pth, pph) = (s[IPT], s[IPR], s[IPTH], s[IPPH]);
    let mut v = 0.0;
    v += 0.5 * g.itt * pt * pt;
    v += 0.5 * g.itphi * pt * pph;
    v += 0.5 * g.irr * pr * pr;
    v += 0.5 * g.ithth * pth * pth;
    v += 0.5 * g.itphi * pph * pt;
    v += 0.5 * g.iphph * pph * pph;
    Some(v)
}

// partialHamiltonian(): central difference with identical steps and floors.
fn partial_h(env: &Env, s: &State, key: usize) -> Option<f64> {
    let base = s[key];
    let scale = jmax(1.0, base.abs());
    let h = 1e-5 * scale;
    if key == IR {
        let floor = if env.hz.naked {
            1e-4
        } else {
            jmax(1e-4, env.hz.r_plus + 1e-5)
        };
        let hi = base + h;
        let lo = jmax(floor, base - h);
        if hi == lo {
            return Some(0.0);
        }
        let mut sp = *s;
        sp[IR] = hi;
        let mut sm = *s;
        sm[IR] = lo;
        return Some((hamiltonian(&env.p, &sp)? - hamiltonian(&env.p, &sm)?) / (hi - lo));
    }
    if key == ITH {
        let hi = jclamp(base + h, POLE_EPS, PI - POLE_EPS);
        let lo = jclamp(base - h, POLE_EPS, PI - POLE_EPS);
        if hi == lo {
            return Some(0.0);
        }
        let mut sp = *s;
        sp[ITH] = hi;
        let mut sm = *s;
        sm[ITH] = lo;
        return Some((hamiltonian(&env.p, &sp)? - hamiltonian(&env.p, &sm)?) / (hi - lo));
    }
    Some(0.0)
}

fn derivatives(env: &Env, s: &State) -> Option<State> {
    let g = metric(&env.p, s[IR], s[ITH])?;
    // contravariantVelocity: inv . P (photon kinetic momentum == P).
    let u0 = g.itt * s[IPT] + g.itphi * s[IPPH];
    let u1 = g.irr * s[IPR];
    let u2 = g.ithth * s[IPTH];
    let u3 = g.itphi * s[IPT] + g.iphph * s[IPPH];
    let dpr = -(partial_h(env, s, IR)?);
    let dpth = -(partial_h(env, s, ITH)?);
    Some([u0, u1, u2, u3, 0.0, dpr, dpth, 0.0])
}

// sanitizeDynamicState()
#[inline(always)]
fn sanitize(mut s: State) -> State {
    s[ITH] = jclamp(s[ITH], 1e-7, PI - 1e-7);
    s[IPH] = wrap_angle(s[IPH]);
    s
}

// addCombination(): sequential accumulation in term order, then sanitize.
fn addc(s: &State, terms: &[(f64, &State)]) -> State {
    let mut n = *s;
    for k in 0..8 {
        let mut v = s[k];
        for (scale, d) in terms {
            v += scale * d[k];
        }
        n[k] = v;
    }
    sanitize(n)
}

fn interpolate(l: &State, r: &State, fraction: f64) -> State {
    let f = jclamp(fraction, 0.0, 1.0);
    let mut n = *l;
    for k in 0..8 {
        n[k] = l[k] + (r[k] - l[k]) * f;
    }
    sanitize(n)
}

fn max_scaled_error(base: &State, high: &State, low: &State, atol: f64, rtol: f64) -> f64 {
    let mut worst = 0.0;
    for k in 0..8 {
        let scale = atol + rtol * jmax(base[k].abs(), high[k].abs());
        let err = (high[k] - low[k]).abs() / jmax(scale, EPS_INT);
        if err > worst {
            worst = err;
        }
    }
    worst
}

// rk45Pair(): Dormand-Prince coefficients, identical constant expressions.
fn rk45_pair(env: &Env, s: &State, h: f64) -> Option<(State, State)> {
    let k1 = derivatives(env, s)?;
    let k2 = derivatives(env, &addc(s, &[(h * (1.0 / 5.0), &k1)]))?;
    let k3 = derivatives(
        env,
        &addc(s, &[(h * (3.0 / 40.0), &k1), (h * (9.0 / 40.0), &k2)]),
    )?;
    let k4 = derivatives(
        env,
        &addc(
            s,
            &[
                (h * (44.0 / 45.0), &k1),
                (h * (-56.0 / 15.0), &k2),
                (h * (32.0 / 9.0), &k3),
            ],
        ),
    )?;
    let k5 = derivatives(
        env,
        &addc(
            s,
            &[
                (h * (19372.0 / 6561.0), &k1),
                (h * (-25360.0 / 2187.0), &k2),
                (h * (64448.0 / 6561.0), &k3),
                (h * (-212.0 / 729.0), &k4),
            ],
        ),
    )?;
    let k6 = derivatives(
        env,
        &addc(
            s,
            &[
                (h * (9017.0 / 3168.0), &k1),
                (h * (-355.0 / 33.0), &k2),
                (h * (46732.0 / 5247.0), &k3),
                (h * (49.0 / 176.0), &k4),
                (h * (-5103.0 / 18656.0), &k5),
            ],
        ),
    )?;
    let high = addc(
        s,
        &[
            (h * (35.0 / 384.0), &k1),
            (h * (500.0 / 1113.0), &k3),
            (h * (125.0 / 192.0), &k4),
            (h * (-2187.0 / 6784.0), &k5),
            (h * (11.0 / 84.0), &k6),
        ],
    );
    let k7 = derivatives(env, &high)?;
    let low = addc(
        s,
        &[
            (h * (5179.0 / 57600.0), &k1),
            (h * (7571.0 / 16695.0), &k3),
            (h * (393.0 / 640.0), &k4),
            (h * (-92097.0 / 339200.0), &k5),
            (h * (187.0 / 2100.0), &k6),
            (h * (1.0 / 40.0), &k7),
        ],
    );
    Some((high, low))
}

struct Opts {
    target_affine: f64,
    initial_step: f64,
    min_step: f64,
    max_step: f64,
    atol: f64,
    rtol: f64,
    record_every: u32,
    escape_radius: f64,
    horizon_buffer: f64,
    max_steps: u32,
    safety: f64,
    max_attempts: u32,
    stop_at_horizon: bool,
    has_disc: bool,
    disc_inner: f64,
    disc_outer: f64,
}

enum Attempt {
    Horizon { state: State, used_frac: f64 },
    Accepted { state: State, suggested: f64, final_h: f64 },
    Rejected { suggested: f64 },
    Error,
}

enum StepRes {
    Accepted {
        state: State,
        used: f64,
        suggested: f64,
        rejected: u32,
        final_h: f64,
        terminal: u8, // 0 none, 1 captured (horizon guard), 2 singularity
    },
    Failed {
        rejected: u32,
    },
}

fn try_attempt(env: &Env, s: &State, o: &Opts, h: f64, horizon_stop: f64) -> Attempt {
    let (high, low) = match rk45_pair(env, s, h) {
        Some(v) => v,
        None => return Attempt::Error,
    };
    if o.stop_at_horizon && s[IR] > horizon_stop && high[IR] <= horizon_stop {
        let fraction = (s[IR] - horizon_stop) / jmax(s[IR] - high[IR], EPS_INT);
        let mut term = interpolate(s, &high, fraction);
        term[IR] = horizon_stop;
        return Attempt::Horizon {
            state: term,
            used_frac: jclamp(fraction, 0.0, 1.0),
        };
    }
    let err = max_scaled_error(s, &high, &low, o.atol, o.rtol);
    let accepted = err <= 1.0;
    let factor = if err <= EPS_INT {
        4.0
    } else {
        jclamp(o.safety * err.powf(-1.0 / 5.0), 0.2, 4.0)
    };
    let suggested = jclamp(h * factor, o.min_step, o.max_step);
    if accepted {
        // The JS hamiltonian(pair.high) call sits inside the try{}: a throw
        // here falls into the step-shrinking catch branch, so mirror that.
        match hamiltonian(&env.p, &high) {
            Some(fh) => Attempt::Accepted { state: high, suggested, final_h: fh },
            None => Attempt::Error,
        }
    } else {
        Attempt::Rejected { suggested }
    }
}

fn adaptive_step(env: &Env, s: &State, o: &Opts, step_size: f64, horizon_stop: f64) -> StepRes {
    let mut h = jclamp(step_size.abs(), o.min_step, o.max_step);
    let mut attempts: u32 = 0;
    while attempts < o.max_attempts {
        attempts += 1;
        match try_attempt(env, s, o, h, horizon_stop) {
            Attempt::Horizon { state, used_frac } => {
                return StepRes::Accepted {
                    state,
                    used: h * used_frac,
                    suggested: o.min_step,
                    rejected: attempts - 1,
                    final_h: f64::NAN, // horizon guard keeps the previous lastHamiltonian
                    terminal: if env.hz.naked { 2 } else { 1 },
                };
            }
            Attempt::Accepted { state, suggested, final_h } => {
                return StepRes::Accepted {
                    state,
                    used: h,
                    suggested,
                    rejected: attempts - 1,
                    final_h,
                    terminal: 0,
                };
            }
            Attempt::Rejected { suggested } => {
                h = suggested;
            }
            Attempt::Error => {
                if h <= o.min_step * (1.0 + 1e-9) {
                    return StepRes::Failed { rejected: attempts };
                }
                h = jmax(o.min_step, h * 0.25);
            }
        }
    }
    StepRes::Failed { rejected: o.max_attempts }
}

#[derive(Clone, Copy)]
struct IntOut {
    final_state: State,
    ev_captured: bool,
    ev_singularity: bool,
    ev_escaped: bool,
    ev_failed: bool,
    accepted: u32,
    rejected: u32,
    affine: f64,
    initial_h: f64,
    last_h: f64,
    peri: f64, // min r over RECORDED frames (ringGlow input); +inf if none
    disc_hit: bool,
    disc_r: f64,
    disc_phi: f64,
    disc_pr: f64,
    init_pt: f64,
    init_pphi: f64,
}

// integrateAdaptive() core loop with the per-ray outcome extraction streamed
// over the recorded-frame cadence (identical recordEvery / terminal-frame
// conditions, so the perihelion and the disc-crossing scan see exactly the
// frames the JS version stores).
fn integrate_adaptive(env: &Env, init: &State, o: &Opts) -> IntOut {
    let state0 = sanitize(*init);
    let mut out = IntOut {
        final_state: state0,
        ev_captured: false,
        ev_singularity: false,
        ev_escaped: false,
        ev_failed: false,
        accepted: 0,
        rejected: 0,
        affine: 0.0,
        initial_h: f64::NAN,
        last_h: f64::NAN,
        peri: f64::INFINITY,
        disc_hit: false,
        disc_r: 0.0,
        disc_phi: 0.0,
        disc_pr: 0.0,
        init_pt: state0[IPT],
        init_pphi: state0[IPPH],
    };
    let mut state = state0;
    let initial_h = match hamiltonian(&env.p, &state) {
        Some(v) => v,
        None => {
            out.ev_failed = true;
            return out;
        }
    };
    out.initial_h = initial_h;
    let mut last_h = initial_h;
    let horizon_stop = if !env.hz.naked {
        env.hz.r_plus + o.horizon_buffer
    } else {
        1e-3
    };
    let record_every = if o.record_every < 1 { 1 } else { o.record_every };
    let mut affine = 0.0;
    let mut step_size = o.initial_step;
    let mut accepted: u32 = 0;
    let mut rejected: u32 = 0;

    // Streaming frame state for the disc-crossing scan.
    let mut have_frame = false;
    let (mut pf_r, mut pf_th, mut pf_ph, mut pf_pr) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);

    let mut i: u32 = 0;
    while i < o.max_steps && affine < o.target_affine {
        i += 1;
        let remaining = o.target_affine - affine;
        match adaptive_step(env, &state, o, jmin(step_size, remaining), horizon_stop) {
            StepRes::Failed { rejected: rj } => {
                rejected += rj;
                out.ev_failed = true;
                break;
            }
            StepRes::Accepted { state: ns, used, suggested, rejected: rj, final_h, terminal } => {
                rejected += rj;
                state = ns;
                affine += used;
                step_size = suggested;
                accepted += 1;
                if terminal == 0 {
                    last_h = final_h;
                }
                // terminalStatus ?? statusAfterStep
                let status: u8 = if terminal == 1 {
                    1
                } else if terminal == 2 {
                    4
                } else if !env.hz.naked && state[IR] <= env.hz.r_plus {
                    1
                } else if env.hz.naked && state[IR] <= 1e-3 {
                    4
                } else if state[IR] >= o.escape_radius {
                    2
                } else {
                    0
                };
                if accepted % record_every == 0 || status != 0 || affine >= o.target_affine {
                    let fr = state[IR];
                    let fth = state[ITH];
                    let fph = state[IPH];
                    let fpr = state[IPR];
                    if fr.is_finite() && fr < out.peri {
                        out.peri = fr;
                    }
                    if o.has_disc && have_frame && !out.disc_hit {
                        // estimateEquatorialDiscHit on consecutive frames.
                        let prev_off = pf_th - PI / 2.0;
                        let next_off = fth - PI / 2.0;
                        if prev_off == 0.0 || prev_off * next_off <= 0.0 {
                            let frac = prev_off.abs() / jmax(prev_off.abs() + next_off.abs(), EPS_RAY);
                            let r = pf_r + (fr - pf_r) * frac;
                            if r >= o.disc_inner && r <= o.disc_outer {
                                out.disc_hit = true;
                                out.disc_r = r;
                                out.disc_phi = pf_ph + (fph - pf_ph) * frac;
                                // crossingRadialMomentum: same fraction, applied to Pr.
                                out.disc_pr = pf_pr + (fpr - pf_pr) * frac;
                            }
                        }
                    }
                    pf_r = fr;
                    pf_th = fth;
                    pf_ph = fph;
                    pf_pr = fpr;
                    have_frame = true;
                }
                if status != 0 {
                    match status {
                        1 => out.ev_captured = true,
                        2 => out.ev_escaped = true,
                        4 => out.ev_singularity = true,
                        _ => {}
                    }
                    break;
                }
            }
        }
    }

    out.final_state = state;
    out.accepted = accepted;
    out.rejected = rejected;
    out.affine = affine;
    out.last_h = last_h;
    out
}

#[derive(Clone, Copy)]
struct Camera {
    r: f64,
    theta: f64,
    phi: f64,
    fovy: f64,
    roll: f64,
    radial_sign: f64,
    local_energy: f64,
}

// cameraSampleToLocalDirection + normalize3
fn camera_dir(cam: &Camera, px: u32, py: u32, w: u32, h: u32) -> Option<[f64; 3]> {
    let width = w as f64;
    let height = h as f64;
    let x = (px as f64 + 0.5) / width * 2.0 - 1.0;
    let y = 1.0 - (py as f64 + 0.5) / height * 2.0;
    let half_y = (cam.fovy / 2.0).tan();
    let aspect = width / height;
    let sx = x * half_y * aspect;
    let sy = y * half_y;
    let cr = cam.roll.cos();
    let sr = cam.roll.sin();
    let rolled_phi = sx * cr - sy * sr;
    let rolled_theta = sx * sr + sy * cr;
    let v = [cam.radial_sign, rolled_theta, rolled_phi];
    let n = hypot3(v[0], v[1], v[2]);
    if n <= EPS_RAY {
        return None;
    }
    Some([v[0] / n, v[1] / n, v[2] / n])
}

// makePhotonState equivalent: zamoFrame + nullVectorFromLocal +
// canonicalMomentum (chargeToMass = 0).
fn make_photon_state(p: &Params, cam: &Camera, dir: &[f64; 3]) -> Option<State> {
    let r = cam.r;
    let theta = jclamp(cam.theta, POLE_EPS, PI - POLE_EPS);
    let phi = cam.phi;
    let norm = hypot3(dir[0], dir[1], dir[2]);
    if norm <= EPS_PHYS {
        return None;
    }
    let g = metric(p, r, theta)?;
    let alpha2 = -1.0 / g.itt;
    if alpha2 <= 0.0 {
        return None;
    }
    let alpha = alpha2.sqrt();
    let omega = -g.gtphi / g.gphph;
    let nr = dir[0] / norm;
    let nt = dir[1] / norm;
    let np = dir[2] / norm;
    let e = cam.local_energy;
    let k0 = e * (1.0 / alpha);
    let k1 = e * (nr * (1.0 / g.grr.sqrt()));
    let k2 = e * (nt * (1.0 / g.gthth.sqrt()));
    let k3 = e * (omega / alpha + np * (1.0 / g.gphph.sqrt()));
    // canonical momentum = cov . k (charge 0)
    let pt = g.gtt * k0 + g.gtphi * k3;
    let pr = g.grr * k1;
    let pth = g.gthth * k2;
    let pph = g.gtphi * k0 + g.gphph * k3;
    Some([0.0, r, theta, phi, pt, pr, pth, pph])
}

// asymptoticSkyDirection (lensing-worker.mjs)
fn asymptotic_sky(p: &Params, s: &State) -> (f64, f64) {
    let r = s[IR];
    let theta = s[ITH];
    let phi = s[IPH];
    if !r.is_finite() || !theta.is_finite() || !phi.is_finite() {
        return (PI / 2.0, 0.0);
    }
    let g = match metric(p, r, theta) {
        Some(g) => g,
        None => return (theta, phi),
    };
    let ur = g.irr * s[IPR];
    let ut = g.ithth * s[IPTH];
    let up = g.itphi * s[IPT] + g.iphph * s[IPPH];
    let st = theta.sin();
    let ct = theta.cos();
    let sp = phi.sin();
    let cp = phi.cos();
    let vx = ur * st * cp + r * ut * ct * cp - r * up * st * sp;
    let vy = ur * st * sp + r * ut * ct * sp + r * up * st * cp;
    let vz = ur * ct - r * ut * st;
    let n = hypot3(vx, vy, vz);
    if !(n > 1e-9) {
        return (theta, phi);
    }
    ((jclamp(vz / n, -1.0, 1.0)).acos(), vy.atan2(vx))
}

struct Outcome {
    status: u8, // 0 active, 1 captured, 2 escaped, 3 integration-failed
    peri: f64,
    sky_th: f64,
    sky_ph: f64,
    disc_hit: bool,
    disc_r: f64,
    disc_phi: f64,
    disc_pr: f64,
    pt: f64,
    pphi: f64,
    res: IntOut,
}

fn trace_one(env: &Env, cam: &Camera, o: &Opts, px: u32, py: u32, w: u32, h: u32) -> Outcome {
    let failed = |res: IntOut| Outcome {
        status: 3,
        peri: f64::INFINITY,
        sky_th: PI / 2.0,
        sky_ph: 0.0,
        disc_hit: false,
        disc_r: 0.0,
        disc_phi: 0.0,
        disc_pr: 0.0,
        pt: 0.0,
        pphi: 0.0,
        res,
    };
    let empty = IntOut {
        final_state: [0.0; 8],
        ev_captured: false,
        ev_singularity: false,
        ev_escaped: false,
        ev_failed: true,
        accepted: 0,
        rejected: 0,
        affine: 0.0,
        initial_h: f64::NAN,
        last_h: f64::NAN,
        peri: f64::INFINITY,
        disc_hit: false,
        disc_r: 0.0,
        disc_phi: 0.0,
        disc_pr: 0.0,
        init_pt: f64::NAN,
        init_pphi: f64::NAN,
    };
    let dir = match camera_dir(cam, px, py, w, h) {
        Some(d) => d,
        None => return failed(empty),
    };
    let st = match make_photon_state(&env.p, cam, &dir) {
        Some(s) => s,
        None => return failed(empty),
    };
    let res = integrate_adaptive(env, &st, o);
    let fs = res.final_state;
    let fr = fs[IR];
    // classifyRayResult
    let mut status: u8 = 0;
    if res.ev_captured {
        status = 1;
    }
    if !env.hz.naked && fr.is_finite() && fr <= env.hz.r_plus + o.horizon_buffer {
        status = 1;
    }
    if fr.is_finite() && fr >= o.escape_radius {
        status = 2;
    }
    if res.ev_failed {
        status = 3;
    }
    let captured = status == 1 || status == 3;
    let (sky_th, sky_ph) = if captured {
        (fs[ITH], fs[IPH])
    } else {
        asymptotic_sky(&env.p, &fs)
    };
    Outcome {
        status,
        peri: res.peri,
        sky_th,
        sky_ph,
        disc_hit: res.disc_hit,
        disc_r: res.disc_r,
        disc_phi: res.disc_phi,
        disc_pr: res.disc_pr,
        pt: fs[IPT],
        pphi: fs[IPPH],
        res,
    }
}

unsafe fn read_inputs(
    params_ptr: *const f64,
    camera_ptr: *const f64,
    opts_ptr: *const f64,
) -> (Env, Camera, Opts) {
    let p = Params {
        m: *params_ptr.add(0),
        q: *params_ptr.add(1),
        a: *params_ptr.add(2),
    };
    let hz = horizons(&p);
    let cam = Camera {
        r: *camera_ptr.add(0),
        theta: *camera_ptr.add(1),
        phi: *camera_ptr.add(2),
        fovy: *camera_ptr.add(3),
        roll: *camera_ptr.add(4),
        radial_sign: *camera_ptr.add(5),
        local_energy: *camera_ptr.add(6),
    };
    let o = Opts {
        target_affine: *opts_ptr.add(0),
        initial_step: *opts_ptr.add(1),
        min_step: *opts_ptr.add(2),
        max_step: *opts_ptr.add(3),
        atol: *opts_ptr.add(4),
        rtol: *opts_ptr.add(5),
        record_every: *opts_ptr.add(6) as u32,
        escape_radius: *opts_ptr.add(7),
        horizon_buffer: *opts_ptr.add(8),
        max_steps: *opts_ptr.add(9) as u32,
        safety: *opts_ptr.add(10),
        max_attempts: *opts_ptr.add(11) as u32,
        stop_at_horizon: *opts_ptr.add(12) != 0.0,
        has_disc: *opts_ptr.add(13) != 0.0,
        disc_inner: *opts_ptr.add(14),
        disc_outer: *opts_ptr.add(15),
    };
    (Env { p, hz }, cam, o)
}

/// Trace a full camera grid; one call per LUT rebuild. Outputs are flat,
/// pre-allocated arrays of length width*height in row-major (py, px) order.
#[no_mangle]
pub unsafe extern "C" fn trace_ray_batch(
    params_ptr: *const f64,
    camera_ptr: *const f64,
    opts_ptr: *const f64,
    width: u32,
    height: u32,
    out_status: *mut u8,
    out_peri: *mut f32,
    out_sky_theta: *mut f32,
    out_sky_phi: *mut f32,
    out_disc_hit: *mut u8,
    out_disc_r: *mut f32,
    out_disc_phi: *mut f32,
    out_disc_pr: *mut f32,
    out_pt: *mut f64,
    out_pphi: *mut f64,
) -> u32 {
    let (env, cam, o) = read_inputs(params_ptr, camera_ptr, opts_ptr);
    let mut idx = 0usize;
    for py in 0..height {
        for px in 0..width {
            let oc = trace_one(&env, &cam, &o, px, py, width, height);
            *out_status.add(idx) = oc.status;
            *out_peri.add(idx) = oc.peri as f32;
            *out_sky_theta.add(idx) = oc.sky_th as f32;
            *out_sky_phi.add(idx) = oc.sky_ph as f32;
            *out_disc_hit.add(idx) = oc.disc_hit as u8;
            *out_disc_r.add(idx) = oc.disc_r as f32;
            *out_disc_phi.add(idx) = oc.disc_phi as f32;
            *out_disc_pr.add(idx) = oc.disc_pr as f32;
            *out_pt.add(idx) = oc.pt;
            *out_pphi.add(idx) = oc.pphi;
            idx += 1;
        }
    }
    (width * height) as u32
}

/// Single-ray diagnostic (conservation ledger parity). Writes 20 f64 slots:
/// 0 status, 1 affine, 2 acceptedSteps, 3 rejectedSteps, 4 initialH, 5 lastH,
/// 6 hamiltonianDrift, 7 initPt, 8 initPphi, 9..16 final state (t..Pphi),
/// 17 periR, 18 discHit, 19 discR.
#[no_mangle]
pub unsafe extern "C" fn trace_single_diag(
    params_ptr: *const f64,
    camera_ptr: *const f64,
    opts_ptr: *const f64,
    width: u32,
    height: u32,
    px: u32,
    py: u32,
    out: *mut f64,
) {
    let (env, cam, o) = read_inputs(params_ptr, camera_ptr, opts_ptr);
    let oc = trace_one(&env, &cam, &o, px, py, width, height);
    *out.add(0) = oc.status as f64;
    *out.add(1) = oc.res.affine;
    *out.add(2) = oc.res.accepted as f64;
    *out.add(3) = oc.res.rejected as f64;
    *out.add(4) = oc.res.initial_h;
    *out.add(5) = oc.res.last_h;
    *out.add(6) = oc.res.last_h - oc.res.initial_h;
    *out.add(7) = oc.res.init_pt;
    *out.add(8) = oc.res.init_pphi;
    for k in 0..8 {
        *out.add(9 + k) = oc.res.final_state[k];
    }
    *out.add(17) = oc.peri;
    *out.add(18) = if oc.disc_hit { 1.0 } else { 0.0 };
    *out.add(19) = oc.disc_r;
}

/// Bump-free allocator for the JS side (8-byte aligned, never freed — PoC).
#[no_mangle]
pub extern "C" fn wasm_alloc(len: u32) -> u32 {
    let size = if len == 0 { 8 } else { len as usize };
    let layout = match std::alloc::Layout::from_size_align(size, 8) {
        Ok(l) => l,
        Err(_) => return 0,
    };
    unsafe { std::alloc::alloc(layout) as u32 }
}

/// No-op export for measuring the raw JS<->WASM call boundary.
#[no_mangle]
pub extern "C" fn noop() -> u32 {
    1
}

/// Touch `len` bytes so a bulk-copy benchmark cannot be optimized away.
#[no_mangle]
pub unsafe extern "C" fn checksum_bytes(ptr: *const u8, len: u32) -> u32 {
    let mut acc: u32 = 0;
    for i in 0..len as usize {
        acc = acc.wrapping_add(*ptr.add(i) as u32);
    }
    acc
}
