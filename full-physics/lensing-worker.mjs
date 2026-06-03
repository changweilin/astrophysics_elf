/*
 * Add-only off-thread gravitational-lensing renderer (Phase 6, P6.1).
 *
 * Produces an RGBA image of what an observer pointed at the Kerr-Newman object
 * sees: the shadow (capture region), the photon ring, a lensed background
 * starfield, and the Doppler-beamed / redshifted accretion disc. All physics
 * comes from the already-benchmarked add-only modules (ray-tracing.mjs,
 * radiation-models.mjs) — this file only classifies each traced ray into a
 * pixel color.
 *
 * This module is deliberately DOM-light:
 *   - `renderLensingImage(params, camera, options)` is pure and node-testable;
 *     it returns a Uint8ClampedArray RGBA buffer plus metadata.
 *   - `attachLensingWorkerGlobal(scope)` wires it to a Web Worker message loop
 *     for the browser (see lensing.js / window.KNLensing in P6.2). It is NOT
 *     called automatically, so importing this file has no side effects.
 *
 * Units: G = c = 4 pi epsilon_0 = 1.
 */

import {
  clamp,
  contravariantVelocity,
  iscoRadiusKerrApprox,
  metric,
  orbitalOmegaKerrNewman,
  sanitizeParams,
  zamoFrame,
} from "./kn-full-physics.mjs";
import {
  dopplerBoost,
  estimateEquatorialDiscHit,
  makeCameraRay,
  photonRingSamples,
  redshiftFactor,
  traceCameraRays,
  tracePhotonRay,
} from "./ray-tracing.mjs";
import {
  composeFalseColor,
  diskInnerRadius,
  localDiskVelocity,
  renderDiscHit,
} from "./radiation-models.mjs";
import {
  findISCO,
  solveCircularMassiveOrbit,
} from "./orbit-diagnostics.mjs";

const TAU = Math.PI * 2;

/* ---- deterministic muted starfield ------------------------------------- *
 * The pixel -> escaped-direction map is already lensed by geodesic
 * integration, so warping a fixed sky reproduces Einstein-ring arcs. The sky
 * itself is a cheap hash-based field of faint stars, kept dim (never neon).   */

function hashAngle(theta, phi, salt) {
  // Map a sky direction to a pseudo-random [0,1). Quantized so neighbouring
  // rays sample the same "star cell" and arcs read continuously.
  const u = Math.floor((phi / TAU + 4) * 220) | 0;
  const v = Math.floor((theta / Math.PI) * 140) | 0;
  let h = (u * 73856093) ^ (v * 19349663) ^ (salt * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
}

/* The lensed background is sampled along the direction the ray is HEADING at its
 * endpoint, not where the ray currently IS. Most of a geodesic's bending happens
 * near periapsis (a few M), so by the truncation point (r ~ 40) the photon is
 * already on its near-straight asymptote and the endpoint TANGENT is the true
 * sky direction. Validated against rays integrated to r ~ 4000
 * (run-lensing-sky-sample.mjs): the heading reproduces the asymptotic direction
 * to ~0.002 rad (~0.1 deg), vs ~0.2-0.4 rad for the endpoint POSITION angle the
 * first pass used. (A 1/r analytic tail correction and a brute-force longer
 * affine budget were both tried and are worse / impractical respectively, so the
 * heading is kept.) Spin oblateness is ignored (a/r -> 0 at the sky); falls back
 * to the position angles if the velocity degenerates or the metric is singular
 * near a horizon. */
export function asymptoticSkyDirection(params, state) {
  const r = state.r;
  const theta = state.theta;
  const phi = state.phi;
  if (!Number.isFinite(r) || !Number.isFinite(theta) || !Number.isFinite(phi)) {
    return { theta: Math.PI / 2, phi: 0 };
  }
  let u;
  try { u = contravariantVelocity(params, state); } catch (e) { return { theta, phi }; }
  const ur = u[1];
  const ut = u[2];
  const up = u[3];
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  // d/dlambda of the Cartesian position in spherical coords (heading vector).
  const vx = ur * st * cp + r * ut * ct * cp - r * up * st * sp;
  const vy = ur * st * sp + r * ut * ct * sp + r * up * st * cp;
  const vz = ur * ct - r * ut * st;
  const n = Math.hypot(vx, vy, vz);
  if (!(n > 1e-9)) return { theta, phi };
  return { theta: Math.acos(clamp(vz / n, -1, 1)), phi: Math.atan2(vy, vx) };
}

function starfieldColor(theta, phi) {
  const t = Number.isFinite(theta) ? theta : Math.PI / 2;
  const p = Number.isFinite(phi) ? phi : 0;
  // Sparse stars: only the brightest tail of the hash lights up, gently.
  const seed = hashAngle(t, p, 1);
  let star = 0;
  if (seed > 0.992) star = (seed - 0.992) / 0.008; // top ~0.8% of cells
  const twinkle = 0.18 + 0.55 * star * star; // soft, capped well below 1
  const base = 0.018; // dim navy backdrop
  const v = clamp(base + twinkle * star, 0, 0.42);
  return { r: v * 0.68, g: v * 0.78, b: clamp(v + 0.012, 0, 0.5) };
}

/* ---- photon-ring grazing glow ------------------------------------------ *
 * Rays whose perihelion grazes the photon sphere pile up into the bright
 * ring that outlines the shadow. We read perihelion from the recorded frames
 * and brighten with a soft Gaussian around r_photon.                          */

function ringGlow(trace, rPhoton) {
  const frames = trace.result?.frames ?? [];
  if (!frames.length || !Number.isFinite(rPhoton) || rPhoton <= 0) return 0;
  let peri = Infinity;
  for (const f of frames) if (Number.isFinite(f.r) && f.r < peri) peri = f.r;
  if (!Number.isFinite(peri)) return 0;
  const width = 0.32 * rPhoton; // soft band around the photon orbit
  const d = (peri - rPhoton) / width;
  return Math.exp(-0.5 * d * d); // 0..1
}

/* ---- disc Doppler / redshift approximation ----------------------------- *
 * Exact per-ray redshift needs the photon 4-momentum at the disc crossing,
 * which estimateEquatorialDiscHit does not yet carry. For P6.1 we approximate
 * the shift factor g from the local circular velocity (kinematic Doppler) and
 * a generic gravitational redshift; this is enough to beam one side of the
 * disc brighter/bluer. A later pass can swap in the exact redshiftFactor().   */

function discShiftApprox(params, hit, camera) {
  const { omega } = localDiskVelocity(params, hit.r, { prograde: true });
  const v = clamp(Math.abs(omega) * hit.r, 0, 0.999);
  const incl = camera.theta ?? Math.PI / 2; // angle from spin pole
  const camPhi = camera.phi ?? 0;
  // Prograde tangential velocity projected onto the in-plane line of sight.
  const los = -Math.sin(hit.phi - camPhi) * Math.sin(incl);
  const vlos = v * los;
  const gamma = 1 / Math.sqrt(Math.max(1e-6, 1 - v * v));
  const gDoppler = 1 / (gamma * (1 - vlos)); // relativistic Doppler (kinematic)
  const gGrav = Math.sqrt(clamp(1 - (2 * params.M) / Math.max(hit.r, 2.001 * params.M), 0.05, 1));
  return clamp(gDoppler * gGrav, 0.1, 4);
}

/* ---- exact per-ray disc redshift (PHASE6-LENSING-PLAN.md sec 7) -------- *
 * The kinematic discShiftApprox above estimates the line-of-sight velocity by a
 * geometric projection. The exact factor uses the photon's own conserved momenta:
 * along a Kerr-Newman geodesic Pt and Pphi are constant (the metric is t- and
 * phi-independent), so the disc-crossing photon carries the SAME Pt/Pphi recorded
 * on finalState. Both the disc emitter (a circular orbit, u^mu = u^t(1,0,0,omega))
 * and the camera observer (a ZAMO, eT) have only t/phi components, so the photon's
 * r/theta momenta drop out of -k.u entirely and the exact g = nu_obs / nu_emit
 * needs nothing beyond Pt/Pphi. This is also why g is azimuth-invariant (Pphi is
 * the conserved generator of axial rotation), so the LUT can cache it per pixel.   */

function discFourVelocity(params, r, prograde = true) {
  const omega = orbitalOmegaKerrNewman(params, r, prograde);
  if (!Number.isFinite(omega)) return null;
  let cov;
  try { cov = metric(params, r, Math.PI / 2).cov; } catch (e) { return null; }
  const denom = -(cov[0][0] + 2 * omega * cov[0][3] + omega * omega * cov[3][3]);
  if (!(denom > 0)) return null; // circular orbit not timelike here (inside ISCO/photon region)
  const ut = 1 / Math.sqrt(denom);
  return [ut, 0, 0, ut * omega];
}

// The camera observer is a ZAMO at the camera position (only t/phi components),
// shared by the circular and plunging redshift paths. Returns null if the ZAMO
// frame degenerates (camera inside the ergoregion edge cases).
function cameraObserverFourVelocity(params, camera) {
  try {
    const theta = clamp(camera.theta ?? Math.PI / 2, 1e-7, Math.PI - 1e-7);
    return zamoFrame(params, camera.r ?? 24, theta).eT;
  } catch (e) { return null; }
}

function discRedshiftExact(params, hit, camera, trace) {
  const fs = trace?.result?.finalState;
  const Pt = fs?.Pt;
  const Pphi = fs?.Pphi;
  if (!Number.isFinite(Pt) || !Number.isFinite(Pphi)) return null;
  const uEmit = discFourVelocity(params, hit.r, true);
  if (!uEmit) return null; // no timelike circular orbit (inside ISCO) -> plunging path
  const uObs = cameraObserverFourVelocity(params, camera);
  if (!uObs) return null;
  // Only Pt/Pphi enter (the 4-velocities have no r/theta parts), so leave Pr/Ptheta zero.
  const photonState = { r: hit.r, theta: Math.PI / 2, phi: hit.phi, Pt, Pr: 0, Ptheta: 0, Pphi };
  const rf = redshiftFactor(params, photonState, { fourVelocity: uEmit }, { fourVelocity: uObs });
  return Number.isFinite(rf.g) ? clamp(rf.g, 0.05, 8) : null;
}

/* ---- inside-ISCO plunging-region disc redshift (PHASE6-LENSING-PLAN sec 7) -- *
 * Down to the ISCO the disc follows stable circular geodesics, so discRedshiftExact
 * (the circular emitter) applies. Inside the ISCO no timelike circular orbit exists
 * and the previous code dropped back to the kinematic discShiftApprox. Instead model
 * the gas as geodesically PLUNGING: it leaves the marginally stable orbit carrying
 * that orbit's conserved energy E_isco and angular momentum L_isco (Cunningham 1975;
 * Reynolds & Begelman 1997), so the emitter at r < r_isco is the equatorial timelike
 * geodesic with (E,L) = (E_isco, L_isco). Unlike the circular case this u^mu has a
 * radial part u^r != 0, so the photon's own radial momentum P_r at the crossing now
 * enters -k.u and must be supplied (u^theta is still 0, so P_theta drops out). The
 * factor stays azimuth-invariant for the LUT: rotating the camera azimuth rotates the
 * whole photon+crossing rigidly, leaving P_r (and Pt/Pphi) at the crossing unchanged. */

// Conserved (E, L) of the marginally stable circular orbit, evaluated once per
// build. E = -u_t, L = u_phi at the ISCO. The charge-ignoring Kerr analytic ISCO
// is the fallback; the primary path uses the benchmarked numeric Kerr-Newman ISCO
// solver (findISCO) and reads E, L straight off the converged circular orbit so
// the charge Q enters both the radius and the conserved quantities.
function iscoConservedELApprox(params, prograde = true) {
  const rIsco = iscoRadiusKerrApprox(params, prograde);
  const u = discFourVelocity(params, rIsco, prograde); // [u^t, 0, 0, u^phi]
  if (!u) return null;
  let cov;
  try { cov = metric(params, rIsco, Math.PI / 2).cov; } catch (e) { return null; }
  const uTcov = cov[0][0] * u[0] + cov[0][3] * u[3];
  const uPcov = cov[3][0] * u[0] + cov[3][3] * u[3];
  if (!Number.isFinite(uTcov) || !Number.isFinite(uPcov)) return null;
  return { rIsco, E: -uTcov, L: uPcov };
}

function iscoConservedEL(params, prograde = true) {
  try {
    const isco = findISCO(params, { prograde, rMax: 30 * (params.M ?? 1) });
    if (isco?.found && Number.isFinite(isco.rISCO)) {
      const orbit = solveCircularMassiveOrbit(params, { r: isco.rISCO, prograde });
      if (Number.isFinite(orbit?.energy) && Number.isFinite(orbit?.angularMomentumZ)) {
        return { rIsco: isco.rISCO, E: orbit.energy, L: orbit.angularMomentumZ };
      }
    }
  } catch (e) { /* fall back to the Kerr analytic ISCO */ }
  return iscoConservedELApprox(params, prograde);
}

// Equatorial timelike geodesic 4-velocity with conserved (E, L), infalling (u^r < 0).
function plungingFourVelocity(params, r, E, L) {
  let inv;
  try { inv = metric(params, r, Math.PI / 2).inv; } catch (e) { return null; }
  const gtt = inv[0][0];
  const gtp = inv[0][3];
  const gpp = inv[3][3];
  const grr = inv[1][1];
  // Raise the conserved lower components u_t = -E, u_phi = L.
  const uT = -gtt * E + gtp * L;
  const uP = -gtp * E + gpp * L;
  // u.u = -1 fixes u_r: the t/phi part is g^{ab} u_a u_b with (u_t, u_phi) = (-E, L).
  const tphiNorm = gtt * E * E - 2 * gtp * E * L + gpp * L * L;
  const radial = (-1 - tphiNorm) / grr;
  if (!(radial >= 0)) return null; // (E, L) is not timelike at this r -> no valid plunge
  const uCovR = -Math.sqrt(radial);  // infalling
  const uR = grr * uCovR;            // u^r = g^{rr} u_r < 0
  return [uT, uR, 0, uP];
}

// Linearly interpolate the photon's radial momentum P_r at the disc crossing,
// reusing the same theta-bracket fraction estimateEquatorialDiscHit used. The
// crossing sits between frames[frameIndex-1] and frames[frameIndex].
function crossingRadialMomentum(trace, hit) {
  const frames = trace?.result?.frames ?? [];
  const i = hit.frameIndex;
  if (!(i >= 1) || i >= frames.length) return null;
  const prev = frames[i - 1];
  const next = frames[i];
  if (!Number.isFinite(prev?.Pr) || !Number.isFinite(next?.Pr)) return null;
  const prevOffset = prev.theta - Math.PI / 2;
  const nextOffset = next.theta - Math.PI / 2;
  const frac = Math.abs(prevOffset) /
    Math.max(Math.abs(prevOffset) + Math.abs(nextOffset), 1e-12);
  return prev.Pr + (next.Pr - prev.Pr) * frac;
}

function discRedshiftPlunge(params, hit, camera, trace, iscoEL) {
  if (!iscoEL || !(hit.r < iscoEL.rIsco)) return null;
  const fs = trace?.result?.finalState;
  const Pt = fs?.Pt;
  const Pphi = fs?.Pphi;
  if (!Number.isFinite(Pt) || !Number.isFinite(Pphi)) return null;
  const Pr = crossingRadialMomentum(trace, hit);
  if (!Number.isFinite(Pr)) return null;
  const uEmit = plungingFourVelocity(params, hit.r, iscoEL.E, iscoEL.L);
  if (!uEmit) return null;
  const uObs = cameraObserverFourVelocity(params, camera);
  if (!uObs) return null;
  // u^theta = 0, so P_theta still drops out; the real P_r is required because u^r != 0.
  const photonState = { r: hit.r, theta: Math.PI / 2, phi: hit.phi, Pt, Pr, Ptheta: 0, Pphi };
  const rf = redshiftFactor(params, photonState, { fourVelocity: uEmit }, { fourVelocity: uObs });
  return Number.isFinite(rf.g) ? clamp(rf.g, 0.05, 8) : null;
}

/* Resolve the disc redshift g at a crossing. The ISCO is the physical boundary:
 * outside it the gas is on a stable circular orbit (exact circular emitter); inside
 * it the gas plunges geodesically (plunging emitter). The split is on r vs r_ISCO,
 * NOT on whether a circular orbit exists — timelike but UNSTABLE circular orbits
 * persist between the photon orbit and the ISCO, yet accreting gas does not occupy
 * them, so discRedshiftExact must not be used there. Kinematic estimate is the last
 * resort (degenerate frames, or no ISCO found). */
function resolveDiscG(params, hit, camera, trace, geom) {
  const iscoEL = geom?.iscoEL;
  if (iscoEL && hit.r < iscoEL.rIsco) {
    const plunge = discRedshiftPlunge(params, hit, camera, trace, iscoEL);
    if (plunge != null) return plunge;
  } else {
    const exact = discRedshiftExact(params, hit, camera, trace);
    if (exact != null) return exact;
  }
  return discShiftApprox(params, hit, camera);
}

function tintFromTemperature(temperature) {
  // Map a rough color temperature into composeFalseColor's [0,1] tint, where
  // higher -> bluer-white, lower -> redder. Muted by design.
  return clamp(0.35 + 0.5 * Math.tanh(temperature * 2.2), 0, 1);
}

/* ---- per-ray shading --------------------------------------------------- *
 * shadeSample is the single source of truth for pixel color. It takes an
 * already-resolved sample (captured flag, escaped sky direction, optional disc
 * crossing, photon-ring glow) and is shared by both the direct per-ray renderer
 * (shadeRay) and the deflection-LUT reshade path (shadeLUTImage). The LUT path
 * needs the color logic decoupled from a live trace, so all of it lives here.
 * `sample.skyPhi` and `sample.discHit.phi` are absolute azimuths (the LUT path
 * adds the camera azimuth back in before calling).                            */

const SHADOW_COLOR = { r: 0.020, g: 0.022, b: 0.030 }; // deep, slightly cool dark

function shadeSample(params, sample, camera, disc, geom, options) {
  // captureFrac lets the LUT upsample anti-alias the shadow edge: in the
  // transition band it carries a 0..1 weight so the escaped shading blends into
  // shadow instead of stair-stepping. The direct per-ray renderer passes a plain
  // captured boolean (0 or 1), reproducing the original hard edge exactly.
  const capFrac = sample.captureFrac != null
    ? sample.captureFrac
    : (sample.captured ? 1 : 0);
  if (capFrac >= 1) {
    // Inside the shadow: no ring glow — a plunging ray passes THROUGH r_photon
    // on its way to the horizon, so adding glow would light up the whole shadow.
    // The bright ring is light that orbited and escaped, added on the branch below.
    return { ...SHADOW_COLOR };
  }

  // Escaped (or grazing) ray: start from the lensed starfield backdrop.
  let col = starfieldColor(sample.skyTheta, sample.skyPhi);

  // Accretion disc contribution, if a disc is configured and this ray hit it.
  if (disc && sample.discHit && sample.discHit.hit) {
    const hit = sample.discHit;
    // Prefer the exact redshift carried on the sample (per-ray conserved Pt/Pphi);
    // fall back to the kinematic estimate when it could not be computed.
    const g = Number.isFinite(hit.g) ? hit.g : discShiftApprox(params, hit, camera);
    const rendered = renderDiscHit(params, hit, {
      ...disc,
      redshiftFactor: g,
      inclination: camera.theta,
      // Pin the radiative zero-torque boundary at the ISCO (not the geometric
      // inner edge): the bright inner edge stays at the ISCO and a disc reaching
      // into the plunging region is dim there, matching the thin-disc model.
      torqueRadius: geom?.iscoEL?.rIsco,
    });
    const fc = composeFalseColor(rendered.observedIntensity, {
      exposure: disc.exposure ?? 140,
      temperatureTint: tintFromTemperature(rendered.restFrame?.colorTemperature ?? 0.4),
    });
    // Disc emission adds over the backdrop, weighted by its own alpha.
    col = {
      r: col.r * (1 - fc.a) + fc.r,
      g: col.g * (1 - fc.a) + fc.g,
      b: col.b * (1 - fc.a) + fc.b,
    };
  }

  // Photon ring: a warm rim where rays graze the photon sphere.
  const glow = sample.ringGlow ?? 0;
  if (glow > 0) {
    const k = 0.55 * glow; // muted amplitude
    col = {
      r: clamp(col.r + k, 0, 1),
      g: clamp(col.g + k * 0.86, 0, 1),
      b: clamp(col.b + k * 0.52, 0, 1),
    };
  }

  // Anti-aliased shadow edge: blend the escaped shading toward shadow across the
  // transition band (capFrac in (0,1)). Zero for fully-escaped pixels.
  if (capFrac > 0) {
    col = {
      r: col.r + (SHADOW_COLOR.r - col.r) * capFrac,
      g: col.g + (SHADOW_COLOR.g - col.g) * capFrac,
      b: col.b + (SHADOW_COLOR.b - col.b) * capFrac,
    };
  }

  return col;
}

function shadeRay(params, trace, camera, disc, geom, options) {
  const status = trace.classification?.status ?? "unknown";
  const captured = status === "captured" || status === "integration-failed";
  const fs = trace.result?.finalState ?? {};
  const discHit = disc
    ? estimateEquatorialDiscHit(trace, { innerR: geom.innerR, outerR: geom.outerR })
    : null;
  if (discHit && discHit.hit) {
    discHit.g = resolveDiscG(params, discHit, camera, trace, geom);
  }
  // Lensed background sampled along the ray's asymptotic heading (skip for
  // captured rays, whose endpoint sits at the horizon).
  const sky = captured ? { theta: fs.theta, phi: fs.phi } : asymptoticSkyDirection(params, fs);
  return shadeSample(params, {
    captured,
    skyTheta: sky.theta,
    skyPhi: sky.phi,
    discHit,
    ringGlow: ringGlow(trace, geom.rPhoton),
  }, camera, disc, geom, options);
}

/* ---- diagnostic per-pixel class (for smoke tests) ---------------------- */

function classifyPixel(params, trace, disc, geom) {
  const status = trace.classification?.status ?? "unknown";
  if (status === "captured" || status === "integration-failed") return 1;
  if (disc) {
    const hit = estimateEquatorialDiscHit(trace, { innerR: geom.innerR, outerR: geom.outerR });
    if (hit.hit) return 2;
  }
  if (ringGlow(trace, geom.rPhoton) > 0.35) return 3;
  return 0;
}

/* ---- shared trace setup (used by both the direct renderer and the LUT) -- */

function lensingTraceOptions(width, height, camera, options) {
  return {
    width,
    height,
    // Affine budget must be long enough for outward rays to actually reach
    // escapeRadius; otherwise they truncate as "active" and the starfield warp
    // samples a mid-flight direction. ~3x the camera->escape gap is a safe default.
    targetAffine: options.targetAffine ?? 90,
    initialStep: options.initialStep ?? 0.05,
    minStep: options.minStep ?? 1e-5,
    maxStep: options.maxStep ?? 0.12,
    recordEvery: options.recordEvery ?? 6,
    escapeRadius: options.escapeRadius ?? 70,
    stopAtHorizon: options.stopAtHorizon ?? true,
    fovY: options.fovY ?? camera.fovY ?? Math.PI / 6,
    ...(options.trace ?? {}),
  };
}

function lensingGeometry(p, camera, disc, options) {
  const ring = photonRingSamples(p, {
    cameraR: camera.r ?? 24,
    count: options.ringSamples ?? 8,
  });
  const rPhoton = Number.isFinite(ring.prograde?.rPhoton)
    ? ring.prograde.rPhoton
    : (ring.retrograde?.rPhoton ?? 3 * p.M);
  const innerR = disc ? (disc.innerR ?? diskInnerRadius(p, disc)) : 0;
  const outerR = disc ? (disc.outerR ?? innerR * 12) : 0;
  // (E, L) of the marginally stable orbit, shared by every disc-hit pixel that
  // crosses inside the ISCO (plunging-region redshift). Prograde to match the disc.
  const iscoEL = disc ? iscoConservedEL(p, true) : null;
  return { ring, rPhoton, geom: { rPhoton, innerR, outerR, iscoEL } };
}

/* ---- main renderer ----------------------------------------------------- */

export function renderLensingImage(params = {}, camera = {}, options = {}) {
  const p = sanitizeParams(params);
  const width = Math.max(1, Math.floor(options.width ?? camera.width ?? 96));
  const height = Math.max(1, Math.floor(options.height ?? camera.height ?? 96));
  const disc = options.disc ?? null;

  const traceOptions = lensingTraceOptions(width, height, camera, options);
  const traced = traceCameraRays(p, camera, traceOptions);
  const { ring, rPhoton, geom } = lensingGeometry(p, camera, disc, options);

  const buffer = new Uint8ClampedArray(width * height * 4);
  // Optional per-pixel class map for diagnostics/smoke tests:
  // 0 = sky/background, 1 = captured (shadow), 2 = disc hit, 3 = photon-ring grazing.
  const statusMap = options.debugStatus ? new Uint8Array(width * height) : null;
  for (const trace of traced.traced) {
    const px = trace.pixelX;
    const py = trace.pixelY;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const cell = py * width + px;
    const idx = cell * 4;
    const col = shadeRay(p, trace, camera, disc, geom, options);
    buffer[idx] = col.r * 255;
    buffer[idx + 1] = col.g * 255;
    buffer[idx + 2] = col.b * 255;
    buffer[idx + 3] = 255;
    if (statusMap) statusMap[cell] = classifyPixel(p, trace, disc, geom);
  }

  const result = {
    width,
    height,
    params: p,
    camera: traced.camera,
    counts: traced.counts,
    photonRing: {
      angularRadius: ring.angularRadius,
      angularDiameter: ring.angularDiameter,
      rPhoton,
    },
    buffer,
  };
  if (statusMap) result.statusMap = statusMap;
  return result;
}

/* ---- deflection LUT (fast path, PHASE6-LENSING-PLAN.md sec 4.5) --------- *
 * Per-ray GR integration is the cost (~1.4 ms/ray), so the panel can only
 * afford a low base resolution. But the screen->outcome map is *invariant under
 * camera azimuth* (Kerr-Newman is axisymmetric) and *smooth away from the shadow
 * edge*. buildDeflectionLUT traces the grid ONCE and stores, per base pixel, the
 * resolved outcome: capture flag, escaped sky direction, photon-ring glow, and
 * the disc-crossing radius/azimuth. shadeLUTImage then renders any display
 * resolution by bilinearly interpolating that map (smooth upsample, no extra
 * integration) and re-applies the camera azimuth cheaply — fixing the blocky
 * upscale and enabling smooth azimuth rotation. Sky/disc azimuths are stored
 * RELATIVE to the build camera azimuth so shadeLUTImage can add any new azimuth.
 *
 * What this LUT does NOT change: inclination (camera.theta) and (M,Q,a) alter the
 * geodesics themselves, so changing those requires a rebuild.                   */

export function buildDeflectionLUT(params = {}, camera = {}, options = {}) {
  const p = sanitizeParams(params);
  const width = Math.max(1, Math.floor(options.width ?? camera.width ?? 72));
  const height = Math.max(1, Math.floor(options.height ?? camera.height ?? 40));
  const disc = options.disc ?? null;

  const traceOptions = lensingTraceOptions(width, height, camera, options);
  const traced = traceCameraRays(p, camera, traceOptions);
  const { ring, rPhoton, geom } = lensingGeometry(p, camera, disc, options);
  const camPhi0 = camera.phi ?? 0;

  const n = width * height;
  const capture = new Uint8Array(n);          // 1 = shadow (captured / failed)
  const skyTheta = new Float32Array(n);        // escaped sky direction (polar)
  const skyPhi = new Float32Array(n);          // escaped sky azimuth, relative to camPhi0
  const ringGlowArr = new Float32Array(n);     // 0..1 photon-ring glow
  const discHit = new Uint8Array(n);           // 1 = ray crosses the disc
  const discR = new Float32Array(n);           // disc crossing radius
  const discPhi = new Float32Array(n);         // disc crossing azimuth, relative to camPhi0
  const discG = new Float32Array(n);           // exact redshift factor at the crossing (azimuth-invariant)
  skyTheta.fill(Math.PI / 2);

  for (const trace of traced.traced) {
    const px = trace.pixelX;
    const py = trace.pixelY;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const cell = py * width + px;
    const status = trace.classification?.status ?? "unknown";
    const captured = status === "captured" || status === "integration-failed";
    capture[cell] = captured ? 1 : 0;
    ringGlowArr[cell] = ringGlow(trace, rPhoton);
    if (captured) continue;
    const fs = trace.result?.finalState ?? {};
    const sky = asymptoticSkyDirection(p, fs);
    skyTheta[cell] = sky.theta;
    skyPhi[cell] = sky.phi - camPhi0;
    if (disc) {
      const hit = estimateEquatorialDiscHit(trace, { innerR: geom.innerR, outerR: geom.outerR });
      if (hit.hit) {
        discHit[cell] = 1;
        discR[cell] = hit.r;
        discPhi[cell] = hit.phi - camPhi0;
        // Redshift is azimuth-invariant, so cache it per pixel: exact circular
        // emitter outside the ISCO, plunging-region geodesic emitter inside it,
        // kinematic estimate only as a last resort.
        discG[cell] = resolveDiscG(p, hit, camera, trace, geom);
      }
    }
  }

  return {
    width,
    height,
    params: p,
    camera: traced.camera,
    counts: traced.counts,
    photonRing: {
      angularRadius: ring.angularRadius,
      angularDiameter: ring.angularDiameter,
      rPhoton,
    },
    geom,
    hasDisc: !!disc,
    base: { capture, skyTheta, skyPhi, ringGlow: ringGlowArr, discHit, discR, discPhi, discG },
  };
}

function clampInt(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/* Bilinearly sample the LUT at fractional base coords, resolving the boundary
 * cases that plain interpolation would smear: the capture/disc flags use a
 * weighted >=0.5 vote, and sky/disc directions are blended as vectors (over only
 * the contributing neighbours) so azimuth wraparound cannot streak. `camPhi` is
 * the new absolute camera azimuth; relative LUT azimuths get it added back.     */
function sampleLUT(b, bw, bh, fx, fy, camPhi, hasDisc) {
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const x0 = clampInt(ix, 0, bw - 1);
  const x1 = clampInt(ix + 1, 0, bw - 1);
  const y0 = clampInt(iy, 0, bh - 1);
  const y1 = clampInt(iy + 1, 0, bh - 1);
  const tx = clamp(fx - ix, 0, 1);
  const ty = clamp(fy - iy, 0, 1);
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const i00 = y0 * bw + x0;
  const i10 = y0 * bw + x1;
  const i01 = y1 * bw + x0;
  const i11 = y1 * bw + x1;

  const capFrac = w00 * b.capture[i00] + w10 * b.capture[i10] +
    w01 * b.capture[i01] + w11 * b.capture[i11];

  // Escaped sky direction: blend unit vectors over the non-captured neighbours.
  let vx = 0, vy = 0, vz = 0, wsum = 0;
  const accSky = (i, w) => {
    if (b.capture[i]) return;
    const th = b.skyTheta[i];
    const ph = b.skyPhi[i] + camPhi;
    const st = Math.sin(th);
    vx += w * st * Math.cos(ph);
    vy += w * st * Math.sin(ph);
    vz += w * Math.cos(th);
    wsum += w;
  };
  accSky(i00, w00); accSky(i10, w10); accSky(i01, w01); accSky(i11, w11);
  // No escaped neighbour contributes -> fully inside the shadow.
  if (wsum <= 0) return { captured: true, captureFrac: 1 };
  let skyTheta = Math.PI / 2;
  let skyPhi = camPhi;
  {
    const nrm = Math.hypot(vx, vy, vz) || 1;
    skyTheta = Math.acos(clamp(vz / nrm, -1, 1));
    skyPhi = Math.atan2(vy, vx);
  }

  const ringGlowVal = w00 * b.ringGlow[i00] + w10 * b.ringGlow[i10] +
    w01 * b.ringGlow[i01] + w11 * b.ringGlow[i11];

  let discHit = null;
  if (hasDisc) {
    const discFrac = w00 * b.discHit[i00] + w10 * b.discHit[i10] +
      w01 * b.discHit[i01] + w11 * b.discHit[i11];
    if (discFrac >= 0.5) {
      // Blend the crossing point in Cartesian to dodge azimuth wraparound; the
      // exact redshift g is azimuth-invariant so it blends as a plain scalar.
      let dx = 0, dy = 0, dg = 0, dw = 0;
      const accDisc = (i, w) => {
        if (!b.discHit[i]) return;
        const r = b.discR[i];
        const ph = b.discPhi[i] + camPhi;
        dx += w * r * Math.cos(ph);
        dy += w * r * Math.sin(ph);
        dg += w * b.discG[i];
        dw += w;
      };
      accDisc(i00, w00); accDisc(i10, w10); accDisc(i01, w01); accDisc(i11, w11);
      if (dw > 0) {
        dx /= dw; dy /= dw;
        discHit = { hit: true, r: Math.hypot(dx, dy), phi: Math.atan2(dy, dx), g: dg / dw };
      }
    }
  }

  return { captured: capFrac >= 1, captureFrac: capFrac, skyTheta, skyPhi, ringGlow: ringGlowVal, discHit };
}

export function shadeLUTImage(lut, options = {}) {
  const bw = lut.width;
  const bh = lut.height;
  const outW = Math.max(1, Math.floor(options.width ?? bw));
  const outH = Math.max(1, Math.floor(options.height ?? bh));
  const params = lut.params;
  const geom = lut.geom;
  const disc = options.disc ?? (lut.hasDisc ? {} : null);
  const camPhi = Number.isFinite(options.cameraPhi) ? options.cameraPhi : (lut.camera?.phi ?? 0);
  const camera = { r: lut.camera?.r, theta: lut.camera?.theta ?? Math.PI / 2, phi: camPhi };
  const b = lut.base;

  const buffer = new Uint8ClampedArray(outW * outH * 4);
  for (let oy = 0; oy < outH; oy++) {
    // Map output pixel centre to fractional base-grid coords.
    const fy = outH > 1 ? (oy + 0.5) / outH * bh - 0.5 : (bh - 1) / 2;
    for (let ox = 0; ox < outW; ox++) {
      const fx = outW > 1 ? (ox + 0.5) / outW * bw - 0.5 : (bw - 1) / 2;
      const sample = sampleLUT(b, bw, bh, fx, fy, camPhi, !!disc);
      const col = shadeSample(params, sample, camera, disc, geom, options);
      const idx = (oy * outW + ox) * 4;
      buffer[idx] = col.r * 255;
      buffer[idx + 1] = col.g * 255;
      buffer[idx + 2] = col.b * 255;
      buffer[idx + 3] = 255;
    }
  }

  return {
    width: outW,
    height: outH,
    params,
    camera: { ...lut.camera, phi: camPhi },
    counts: lut.counts,
    photonRing: lut.photonRing,
    buffer,
  };
}

/* ---- equatorial bent-ray overlay (top-down main view) ------------------ *
 * Traces a fan of true null geodesics confined to the equatorial plane
 * (theta = pi/2, no polar component because the camera sits in the plane and we
 * only vary the in-plane angle). Returns each ray as a flat [x, y, x, y, ...]
 * polyline in equatorial Cartesian coords for the top-down renderer to draw the
 * bending of light around the hole. Cheap (~a dozen rays), computed per (M,Q,a)
 * change off-thread, and cached by the caller.                                 */

export function traceEquatorialRays(params = {}, options = {}) {
  const p = sanitizeParams(params);
  const count = Math.max(2, Math.floor(options.count ?? 13));
  const cameraR = options.cameraR ?? 40;
  const fovY = options.fovY ?? Math.PI / 3;
  const camera = { r: cameraR, theta: Math.PI / 2, phi: options.phi ?? 0, fovY };
  const rays = [];
  for (let i = 0; i < count; i++) {
    const x = count > 1 ? (i / (count - 1)) * 2 - 1 : 0; // -1..1 across the FOV
    // aspect = 1 and y = 0 keep the ray's local direction in the equatorial
    // plane (no theta component), so theta stays pi/2 along the geodesic.
    const ray = makeCameraRay(p, camera, { x, y: 0, pixelX: i, pixelY: 0 }, { aspect: 1, fovY });
    const traced = tracePhotonRay(p, ray, {
      targetAffine: options.targetAffine ?? 70,
      initialStep: options.initialStep ?? 0.05,
      maxStep: options.maxStep ?? 0.2,
      recordEvery: options.recordEvery ?? 3,
      escapeRadius: options.escapeRadius ?? cameraR + 8,
      stopAtHorizon: true,
    });
    const frames = traced.result?.frames ?? [];
    const points = [];
    for (const f of frames) {
      if (!Number.isFinite(f.r) || !Number.isFinite(f.phi)) continue;
      points.push(f.r * Math.cos(f.phi), f.r * Math.sin(f.phi));
    }
    rays.push({
      captured: traced.classification?.status === "captured",
      points,
    });
  }
  const ring = photonRingSamples(p, { cameraR, count: 4 });
  const bCrit = Math.abs(
    Number.isFinite(ring.prograde?.impactParameter)
      ? ring.prograde.impactParameter
      : (ring.retrograde?.impactParameter ?? 0),
  );
  return { params: p, cameraR, bCrit, rays };
}

/* ---- Web Worker boundary (browser only; no auto-attach) ---------------- */

export function handleLensingWorkerMessage(rawMessage = {}) {
  const id = rawMessage.id;
  const type = rawMessage.type ?? rawMessage.action ?? "render-lensing";
  try {
    if (type === "equatorial-rays") {
      const payload = rawMessage.payload ?? {};
      const data = traceEquatorialRays(payload.params ?? {}, payload.options ?? {});
      return { message: { id, type, ok: true, payload: data }, transfer: [] };
    }
    if (type === "build-lut") {
      const payload = rawMessage.payload ?? {};
      const lut = buildDeflectionLUT(payload.params ?? {}, payload.camera ?? {}, payload.options ?? {});
      // Transfer every base buffer to avoid a structured-clone copy of the grid.
      const b = lut.base;
      return {
        message: { id, type, ok: true, payload: lut },
        transfer: [
          b.capture.buffer, b.skyTheta.buffer, b.skyPhi.buffer,
          b.ringGlow.buffer, b.discHit.buffer, b.discR.buffer, b.discPhi.buffer,
          b.discG.buffer,
        ],
      };
    }
    if (type !== "render-lensing") {
      throw new Error(`Unknown lensing worker message type: ${type}`);
    }
    const payload = rawMessage.payload ?? {};
    const image = renderLensingImage(payload.params ?? {}, payload.camera ?? {}, payload.options ?? {});
    return {
      message: {
        id,
        type,
        ok: true,
        payload: {
          width: image.width,
          height: image.height,
          camera: image.camera,
          counts: image.counts,
          photonRing: image.photonRing,
        },
        buffer: image.buffer,
      },
      transfer: [image.buffer.buffer],
    };
  } catch (error) {
    return {
      message: {
        id,
        type,
        ok: false,
        error: { name: error.name ?? "Error", message: error.message ?? String(error) },
      },
      transfer: [],
    };
  }
}

export function attachLensingWorkerGlobal(scope = globalThis) {
  if (!scope.addEventListener || !scope.postMessage) {
    throw new Error("attachLensingWorkerGlobal requires a Worker-like global scope.");
  }
  scope.addEventListener("message", (event) => {
    const { message, transfer } = handleLensingWorkerMessage(event.data);
    scope.postMessage(message, transfer);
  });
}
