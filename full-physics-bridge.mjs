/* Bridge: full Kerr-Newman physics (ESM) → window.KNFull for the browser demo.
 *
 * The legacy Newtonian-ish KNphysics integrator continues to drive sim.js. This
 * bridge exposes the higher-fidelity engine purely as a *diagnostic backend*:
 * geometry, numerical ISCO/photon-orbit, tidal tensor, region classification,
 * and Blandford-Znajek jet power are recomputed against the live (M, Q, a, B)
 * parameters so the UI can show calibrated numbers next to the visual loop.
 */

import { PhysicsEngine } from "./full-physics/physics-engine.mjs";
import {
  findISCO,
  findPhotonCircularOrbit,
  classifyOrbitRegion,
  solveCircularMassiveOrbit,
} from "./full-physics/orbit-diagnostics.mjs";
import { tidalTensorDiagnostics } from "./full-physics/tidal-tensor.mjs";
import { OBJECT_LIBRARY } from "./full-physics/object-library.mjs";
import {
  blandfordZnajekJet,
  horizons,
  staticLimitRadius,
  horizonAngularVelocity,
  horizonArea,
  surfaceGravity,
  horizonElectricPotential,
  metric,
  zamoFrame,
  makeMassiveState,
} from "./full-physics/kn-full-physics.mjs";
import { integrateAdaptive } from "./full-physics/adaptive-integrator.mjs";
import { binaryInspiralProfile } from "./full-physics/binary-inspiral.mjs";

const PI_2 = Math.PI / 2;
const POLE_EPS = 1e-7;

/* ---- object library -> demo spawn catalog ------------------------------- *
 * The demo's picker (panel-bottom.jsx / mobile-panels.jsx) spawns bodies with the
 * schema { name, name_zh, kind, radius, binding, charge, spawnR }, where kind is
 * one of the five the drop flow understands (name prefix + CSS + glyph). This maps
 * the richer full-physics OBJECT_LIBRARY onto that schema so the picker can source
 * a single, physically-grounded catalog instead of a hardcoded list. The pickers
 * keep their inline list as a fallback when this bridge has not loaded.           */
const DEMO_KIND = {
  planet: "planet", gas: "gas", star: "star", "compact-star": "star",
  ship: "ship", probe: "probe", plasma: "probe", disc: "gas",
};
// Traditional-Chinese labels for the demo's bilingual tr(en, zh) cards, keyed by
// the (ASCII) library id. Other locales fall back to the English label via tr().
const ZH_LABEL = {
  rockyPlanet: "岩質行星", gasGiant: "氣態巨行星", mainSequenceStar: "主序星",
  whiteDwarf: "白矮星", neutronStar: "中子星", crewedShip: "載人飛船",
  neutralProbe: "中性探測器", chargedProbePositive: "帶正電探測器",
  chargedProbeNegative: "帶負電探測器", magnetizedPlasmaBlob: "磁化電漿團",
};

function buildDemoObjectCatalog() {
  const out = [];
  for (const spec of Object.values(OBJECT_LIBRARY)) {
    // Only massive, destructible bodies the spawner can place: skip null geodesics
    // (photon) and indestructible parcels (binding = Infinity, e.g. dust).
    if (spec.kind === "photon" || !Number.isFinite(spec.binding)) continue;
    const kind = DEMO_KIND[spec.kind];
    if (!kind) continue;
    out.push({
      id: spec.id,
      name: spec.label,
      name_zh: ZH_LABEL[spec.id] ?? spec.label,
      kind,
      radius: spec.radius,
      binding: spec.binding,
      charge: spec.chargeToMass ?? 0,
      spawnR: Math.round(spec.defaultOrbit?.r ?? 12),
      description: spec.description,
    });
  }
  return out;
}

function sanitize(params) {
  const M = Math.max(1e-4, Number(params?.M) || 1.5);
  const Q = Number(params?.Q) || 0;
  const a = Number(params?.a) || 0;
  const B = Math.max(0, Number(params?.B) || 0);
  return { M, Q, a, B };
}

function paramsKey(p) {
  return `${p.M.toFixed(6)}|${p.Q.toFixed(6)}|${p.a.toFixed(6)}|${p.B.toFixed(6)}`;
}

function cartesianToPolarEquatorial(x, y) {
  const r = Math.hypot(x, y);
  const phi = Math.atan2(y, x);
  return { r: Math.max(r, 1e-3), theta: PI_2, phi };
}

class FullPhysicsBridge {
  constructor() {
    this.engine = new PhysicsEngine({ M: 1.5, Q: 0, a: 0.5, B: 0.3 });
    this._geometryCache = { key: null, value: null };
    this._orbitCache    = { key: null, value: null };
    this._jetCache      = { key: null, accretion: -1, value: null };
    this._jetDiagCache  = { key: null, value: null };
    this._previewCache  = { key: null, value: null };
    this._inspiralCache = { key: null, value: null };
    this._scalarCache   = new Map(); // bucketed (M,Q,a) -> { iscoPrograde, photonPrograde }
    // Static spawn catalog derived from the full-physics object library.
    this.objectCatalog = buildDemoObjectCatalog();
    // Off-thread worker for the heavy ISCO/photon root-finding (orbitDiagnostics).
    this._worker = null;
    this._workerOk = false;
    this._pending = new Map();   // request id -> { resolve, reject }
    this._seq = 0;
    this._latest = {};           // channel -> { params, key } pending the worker
    this._busy = {};             // channel -> bool (single-flight, latest-wins)
    this._initWorker();
  }

  /* ---- off-thread worker plumbing (mirrors lensing.js) ------------------- */

  _initWorker() {
    if (typeof Worker === "undefined") return; // -> synchronous fallback
    try {
      this._worker = new Worker("physics-worker-entry.mjs", { type: "module" });
      this._worker.onmessage = (event) => this._onWorkerMessage(event.data);
      this._worker.onerror = () => this._onWorkerFailure();
      this._workerOk = true;
    } catch (err) {
      this._worker = null;
      this._workerOk = false;
    }
  }

  _onWorkerMessage(data) {
    if (!data || data.id == null) return;
    const pend = this._pending.get(data.id);
    if (!pend) return;
    this._pending.delete(data.id);
    if (data.ok) pend.resolve(data.result);
    else pend.reject(new Error(data.error || "physics worker failed"));
  }

  /* A module-worker load failure surfaces async; disable it and let the
   * synchronous getters take over so no diagnostic is permanently stuck stale. */
  _onWorkerFailure() {
    this._workerOk = false;
    for (const pend of this._pending.values()) pend.reject(new Error("physics worker terminated"));
    this._pending.clear();
    this._busy = {};
    this._latest = {};
    this._emitUpdate(); // prompt a re-render so consumers re-read via the sync fallback
  }

  _postRaw(type, params) {
    return new Promise((resolve, reject) => {
      const id = ++this._seq;
      this._pending.set(id, { resolve, reject });
      try {
        this._worker.postMessage({ id, type, payload: { params } });
      } catch (err) {
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  /* Latest-wins single-flight per channel: while one request is in flight, later
   * requests only remember the newest params so a fast slider drag cannot back up
   * a queue of stale computes. onResult runs on the main thread with the result. */
  _requestLatest(channel, type, params, key, onResult) {
    this._latest[channel] = { params, key, onResult };
    if (this._busy[channel]) return;
    this._drain(channel, type);
  }

  _drain(channel, type) {
    const job = this._latest[channel];
    if (!job) return;
    this._latest[channel] = null;
    this._busy[channel] = true;
    this._postRaw(type, job.params).then(
      (result) => { job.onResult(result); },
      () => { /* worker failed; sync getters resume */ },
    ).finally(() => {
      this._busy[channel] = false;
      if (this._latest[channel]) this._drain(channel, type);
    });
  }

  _emitUpdate() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("knfull-update"));
    }
  }

  syncParams(params) {
    const p = sanitize(params);
    const cur = this.engine.params;
    if (cur.M !== p.M || cur.Q !== p.Q || cur.a !== p.a || cur.B !== p.B) {
      this.engine.params = p;
      if (this.engine.simulator) this.engine.simulator.params = p;
      if (this.engine.jet)       this.engine.jet.params = p;
    }
    return p;
  }

  /* Rich geometry summary with derived horizon quantities. Cached per (M,Q,a,B). */
  geometry(params) {
    const p = this.syncParams(params);
    const key = paramsKey(p);
    if (this._geometryCache.key === key) return this._geometryCache.value;
    const h = horizons(p);
    const value = {
      params: p,
      horizons: h,
      staticLimitEquator: staticLimitRadius(p, PI_2),
      staticLimitPole:    staticLimitRadius(p, POLE_EPS),
      horizonAngularVelocity: horizonAngularVelocity(p),
      horizonArea:            horizonArea(p),
      surfaceGravity:         surfaceGravity(p),
      horizonElectricPotential: horizonElectricPotential(p),
    };
    this._geometryCache = { key, value };
    return value;
  }

  _orbitSync(p) {
    try {
      return {
        params: p,
        isco: {
          prograde:   findISCO(p, { samples: 180, prograde: true }),
          retrograde: findISCO(p, { samples: 180, prograde: false }),
        },
        photonOrbit: {
          prograde:   findPhotonCircularOrbit(p, { samples: 180, prograde: true }),
          retrograde: findPhotonCircularOrbit(p, { samples: 180, prograde: false }),
        },
      };
    } catch (err) {
      return { params: p, error: err.message };
    }
  }

  // A pending shape so panels render "—" rather than crash before the first
  // worker result lands (only used when there is no last-known value to reuse).
  _orbitPlaceholder(p) {
    const nanR = { rISCO: NaN }, nanP = { rPhoton: NaN };
    return { params: p, pending: true, isco: { prograde: nanR, retrograde: nanR }, photonOrbit: { prograde: nanP, retrograde: nanP } };
  }

  /* Numerical ISCO and photon-circular-orbit radii (prograde & retrograde). The
   * root-finding is the heaviest synchronous compute, so it runs in the physics
   * worker: this returns the cached value, or the last-known / a placeholder while
   * the worker recomputes, then fires `knfull-update` so the panels re-render with
   * the fresh result. Falls back to a synchronous solve when no worker is available
   * (or `options.force` is set, used by callers that need an immediate exact value). */
  orbitDiagnostics(params, options = {}) {
    const p = this.syncParams(params);
    const key = paramsKey(p);
    if (this._orbitCache.key === key && !options.force) return this._orbitCache.value;
    if (this._workerOk && !options.force) {
      this._requestLatest("orbit", "orbit-diagnostics", p, key, (value) => {
        this._orbitCache = { key, value };
        this._emitUpdate();
      });
      // Reuse the last-known result (trails the slider by a frame) until the
      // worker answers; placeholder only on the very first request.
      return this._orbitCache.value ?? this._orbitPlaceholder(p);
    }
    const value = this._orbitSync(p);
    this._orbitCache = { key, value };
    return value;
  }

  /* Exact Kerr-Newman geometry scalars (prograde) for the demo's physics.js to
   * delegate to: the numeric ISCO and photon-orbit radii, which physics.js
   * otherwise approximates with the charge-IGNORING Kerr analytic forms. findISCO
   * is a heavy nested solve, so the result is cached in a small map under a coarse
   * (M,Q,a) bucket — a slider drag reuses neighbouring buckets and a steady scene
   * is a free lookup. Falls back to NaN (the caller keeps its analytic form) on
   * any solver failure. */
  geometryScalars(params) {
    const p = sanitize(params);
    const b = (v, s) => Math.round(v / s) * s;
    const key = `${b(p.M, 0.05).toFixed(2)}|${b(p.Q, 0.02).toFixed(2)}|${b(p.a, 0.02).toFixed(2)}`;
    const hit = this._scalarCache.get(key);
    if (hit) return hit;
    let iscoPrograde = NaN, photonPrograde = NaN;
    try { iscoPrograde = findISCO(p, { prograde: true, samples: 100 }).rISCO; } catch (e) { /* keep NaN */ }
    try { photonPrograde = findPhotonCircularOrbit(p, { prograde: true, samples: 160 }).rPhoton; } catch (e) { /* keep NaN */ }
    const value = { iscoPrograde, photonPrograde };
    if (this._scalarCache.size > 48) this._scalarCache.clear();
    this._scalarCache.set(key, value);
    return value;
  }

  /* Region classification at a Cartesian equatorial point. */
  regionAt(params, x, y) {
    const p = this.syncParams(params);
    const pol = cartesianToPolarEquatorial(x, y);
    try {
      return classifyOrbitRegion(p, pol.r, pol.theta);
    } catch {
      return null;
    }
  }

  /* Circular orbit energy / L_z at a given radius, using the full Hamiltonian. */
  circularOrbit(params, r, opts = {}) {
    const p = this.syncParams(params);
    try {
      return solveCircularMassiveOrbit(p, {
        r,
        theta: PI_2,
        prograde: opts.prograde ?? true,
        chargeToMass: opts.chargeToMass ?? 0,
      });
    } catch (err) {
      return { error: err.message };
    }
  }

  /* Tidal tensor + survival label for a body at (x, y) with radius/binding. */
  tidalDiagnostics(params, x, y, body = {}) {
    const p = this.syncParams(params);
    const pol = cartesianToPolarEquatorial(x, y);
    try {
      return tidalTensorDiagnostics(p, {
        r: pol.r, theta: pol.theta, phi: pol.phi,
      }, {
        radius:  body.radius  ?? 0.4,
        binding: body.binding ?? 1,
      });
    } catch (err) {
      return { error: err.message };
    }
  }

  /* Blandford-Znajek jet power + opening angle from spin, B, and accretion rate. */
  jetPower(params, accretionRate = 0) {
    const p = this.syncParams(params);
    const key = paramsKey(p);
    if (this._jetCache.key === key && this._jetCache.accretion === accretionRate) {
      return this._jetCache.value;
    }
    const value = blandfordZnajekJet(p, { accretionRate, magneticField: p.B });
    this._jetCache = { key, accretion: accretionRate, value };
    return value;
  }

  /* Dynamic MHD-jet diagnostics: settle the reduced multi-zone jet engine
   * (mhd-jet-engine.mjs, owned by the facade) for the current (M,Q,a,B) and
   * accretion rate, then report the calibrated quantities the demo's analytic
   * jetMetrics does NOT model — column magnetization sigma, kink-instability
   * risk, and synchrotron radiative luminosity — alongside the converged bulk
   * Lorentz factor and opening angle. The accretion rate is bucketed and the
   * result cached per (params, bucket) so the costly settle runs only on change. */
  jetDiagnostics(params, accretionRate = 0) {
    const p = this.syncParams(params);
    const acc = Math.max(0, Math.round((accretionRate || 0) / 0.05) * 0.05);
    const key = paramsKey(p) + "|" + acc.toFixed(2);
    if (this._jetDiagCache.key === key) return this._jetDiagCache.value;

    // Re-seed the jet column for this geometry, then evolve to a settled column.
    if (this.engine.jet) this.engine.jet.setParams(p);
    const input = { magneticField: p.B, accretionRate: acc };
    const STEPS = 300;
    const TAIL = 80; // average the bursty (reconnection/synchrotron) terms over the tail
    let snap = null, radSum = 0, recSum = 0, n = 0;
    for (let i = 0; i < STEPS; i++) {
      snap = this.engine.updateJet(input); // lazily creates the engine on first use
      if (i >= STEPS - TAIL) {
        radSum += snap.global.radiativeLuminosity;
        recSum += snap.global.reconnectionLuminosity;
        n++;
      }
    }
    const g = snap ? snap.global : {};
    const value = {
      valid: (g.totalPower > 0) || (g.bzPower > 0),
      bzPower: g.bzPower ?? 0,
      totalPower: g.totalPower ?? 0,
      lorentzFactor: g.lorentzFactor ?? 1,
      openingAngleDeg: g.openingAngleDeg ?? 0,
      magnetization: g.magnetizationBase ?? 0,
      kinkRisk: g.kinkRisk ?? 0,
      radiativeLuminosity: n ? radSum / n : (g.radiativeLuminosity ?? 0),
      reconnectionLuminosity: n ? recSum / n : (g.reconnectionLuminosity ?? 0),
      massFlux: g.massFlux ?? 0,
    };
    this._jetDiagCache = { key, value };
    return value;
  }

  /* Quasi-circular binary black-hole inspiral (Peters 1964 + leading PN phasing).
   * Independent of the lab's single-hole (M,Q,a,B): a self-contained two-body
   * calculator that answers "how many orbits to merge, and how that scales with
   * m1 / m2". Masses are in solar masses; see full-physics/binary-inspiral.mjs.
   * Cached on the JSON of the (small) input so a preset toggle is a free lookup. */
  binaryInspiral(input = {}) {
    const key = JSON.stringify(input);
    if (this._inspiralCache.key === key) return this._inspiralCache.value;
    let value;
    try { value = binaryInspiralProfile(input); }
    catch (err) { value = { error: err.message }; }
    this._inspiralCache = { key, value };
    return value;
  }

  /* Exact-GR trajectory preview for the launch overlay. The demo's
   * predictTrajectory integrates the pseudo-Newtonian acceleration so the dashed
   * line matches the live bodies; this returns the EXACT Kerr-Newman geodesic for
   * the same launch as a second reference line. Inputs/outputs are the demo's
   * equatorial Cartesian (x, y, vx, vy with c = 1); the result is the same
   * { pts: [x0,y0,x1,y1,...], fate } shape. Returns { pts: [] } when the launch is
   * superluminal in these coordinates or the geometry degenerates. Cached on a
   * coarse bucket of the inputs so a near-stationary aim reuses the path.        */
  previewGeodesic(params, x0, y0, vx0, vy0, opts = {}) {
    const p = this.syncParams(params);
    const snap = (v, s) => Math.round((v || 0) / s) * s;
    const key = `${paramsKey(p)}|${snap(x0, 0.25)},${snap(y0, 0.25)},${snap(vx0, 0.004)},${snap(vy0, 0.004)}`;
    if (this._previewCache.key === key) return this._previewCache.value;
    const value = this._computePreviewGeodesic(p, x0, y0, vx0, vy0, opts) || { pts: [], fate: "bound" };
    this._previewCache = { key, value };
    return value;
  }

  _computePreviewGeodesic(p, x0, y0, vx0, vy0, opts) {
    const r0 = Math.hypot(x0, y0);
    if (!(r0 > 1e-3)) return null;
    const phi0 = Math.atan2(y0, x0);
    // Equatorial Boyer-Lindquist coordinate velocities from the Cartesian launch.
    const Vr = (x0 * vx0 + y0 * vy0) / r0;
    const Vphi = (x0 * vy0 - y0 * vx0) / (r0 * r0);
    // Project onto the ZAMO orthonormal frame to get the local 3-velocity that
    // makeMassiveState expects (V^r = alpha vR / sqrt(g_rr); V^phi = omega + alpha vPhi / sqrt(g_phiphi)).
    let frame, g;
    try { frame = zamoFrame(p, r0, PI_2); g = metric(p, r0, PI_2); } catch (e) { return null; }
    const vRloc = (Vr * Math.sqrt(g.cov[1][1])) / frame.alpha;
    const vPhiloc = ((Vphi - frame.omega) * Math.sqrt(g.cov[3][3])) / frame.alpha;
    if (!(Math.hypot(vRloc, vPhiloc) < 0.9995)) return null; // superluminal here -> no GR line
    let state;
    try {
      state = makeMassiveState(p, { r: r0, theta: PI_2, phi: phi0, velocity: [vRloc, 0, vPhiloc], chargeToMass: 0 });
    } catch (e) { return null; }

    const escapeR = opts.escapeRadius ?? 60;
    let result;
    try {
      result = integrateAdaptive(p, state, {
        targetAffine: opts.targetAffine ?? 45,
        initialStep: 0.05, minStep: 1e-4, maxStep: 0.6,
        recordEvery: opts.recordEvery ?? 1,
        escapeRadius: escapeR,
        stopAtHorizon: true,
        horizonBuffer: 1e-2,
        maxSteps: opts.maxSteps ?? 700,
      });
    } catch (e) { return null; }

    const frames = result.frames ?? [];
    const maxPts = opts.maxPts ?? 480;
    const pts = [];
    for (const f of frames) {
      if (!Number.isFinite(f.r) || !Number.isFinite(f.phi)) continue;
      pts.push(f.r * Math.cos(f.phi), f.r * Math.sin(f.phi));
      if (pts.length >= maxPts) break;
    }
    const h = horizons(p);
    const finalR = result.finalState?.r ?? r0;
    let fate = "bound";
    if (finalR >= escapeR) fate = "escape";
    else if (!h.naked && finalR <= h.rPlus + 1e-2) fate = "capture";
    else if (h.naked && finalR < 0.4) fate = "capture";
    return { pts, fate };
  }
}

const bridge = new FullPhysicsBridge();
window.KNFull = bridge;
window.dispatchEvent(new CustomEvent('knfull-ready', { detail: { bridge } }));
