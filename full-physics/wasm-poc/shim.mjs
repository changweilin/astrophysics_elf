/*
 * wasm-trace shim: the JS side of the WASM/JS seam proposed for
 * full-physics/wasm-trace.mjs. Loads kn_wasm_trace.wasm (zero glue deps),
 * exposes buildDeflectionLUTWasm() — a drop-in equivalent of
 * lensing-worker.mjs buildDeflectionLUT() whose trace phase runs in WASM
 * while ALL shading-adjacent physics (photon-ring geometry, findISCO,
 * disc redshift resolution) stays in JS, exactly as the kernel selection
 * prescribes.
 *
 * The few module-private helpers of lensing-worker.mjs that the LUT build
 * needs (discFourVelocity, iscoConservedEL, plungingFourVelocity,
 * discShiftApprox, resolveDiscG, ringGlow-from-perihelion) are mirrored
 * here 1:1 from the repo source, built on top of REPO-EXPORTED primitives
 * (metric, zamoFrame, redshiftFactor, findISCO, ...). The repo itself is
 * untouched.
 */

import { readFile } from "node:fs/promises";

// wasm-poc/ lives inside full-physics/, so the parent dir is the engine.
const FP = new URL("../", import.meta.url).href;

export async function loadRepoModules() {
  const [knp, rt, ai, lw, od, rm] = await Promise.all([
    import(FP + "kn-full-physics.mjs"),
    import(FP + "ray-tracing.mjs"),
    import(FP + "adaptive-integrator.mjs"),
    import(FP + "lensing-worker.mjs"),
    import(FP + "orbit-diagnostics.mjs"),
    import(FP + "radiation-models.mjs"),
  ]);
  return { knp, rt, ai, lw, od, rm };
}

export async function loadWasm(wasmPath) {
  const bytes = await readFile(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const w = instance.exports;
  const scratch = { n: 0, in: 0 };
  const ensureInputs = () => {
    if (scratch.in) return;
    scratch.params = w.wasm_alloc(3 * 8);
    scratch.camera = w.wasm_alloc(7 * 8);
    scratch.opts = w.wasm_alloc(16 * 8);
    scratch.diag = w.wasm_alloc(20 * 8);
    scratch.in = 1;
  };
  const ensureOutputs = (n) => {
    ensureInputs();
    if (scratch.n >= n) return;
    scratch.n = n;
    scratch.status = w.wasm_alloc(n);
    scratch.peri = w.wasm_alloc(n * 4);
    scratch.skyTheta = w.wasm_alloc(n * 4);
    scratch.skyPhi = w.wasm_alloc(n * 4);
    scratch.discHit = w.wasm_alloc(n);
    scratch.discR = w.wasm_alloc(n * 4);
    scratch.discPhi = w.wasm_alloc(n * 4);
    scratch.discPr = w.wasm_alloc(n * 4);
    scratch.pt = w.wasm_alloc(n * 8);
    scratch.pphi = w.wasm_alloc(n * 8);
  };
  return { w, scratch, ensureInputs, ensureOutputs };
}

/* ---- effective trace options: lensingTraceOptions() composed with
 * tracePhotonRay()'s own defaulting, mirrored from the repo source. Note the
 * UI's absoluteTolerance/relativeTolerance are top-level option keys that
 * lensingTraceOptions does NOT forward (only options.trace is spread), so the
 * production trace runs at tracePhotonRay's 1e-9/1e-8 — mirrored here.       */
export function effectiveTraceOptions(camera, options) {
  const t = {
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
  return {
    targetAffine: t.targetAffine ?? 60,
    initialStep: t.initialStep ?? 0.04,
    minStep: t.minStep ?? 1e-5,
    maxStep: t.maxStep ?? 0.08,
    absoluteTolerance: t.absoluteTolerance ?? 1e-9,
    relativeTolerance: t.relativeTolerance ?? 1e-8,
    recordEvery: t.recordEvery ?? 40,
    escapeRadius: t.escapeRadius ?? 120,
    stopAtHorizon: t.stopAtHorizon ?? true,
    horizonBuffer: t.horizonBuffer ?? 1e-3,
    fovY: t.fovY,
    maxSteps: 200000,
    safety: 0.9,
    maxAttempts: 24,
  };
}

/* ---- mirrors of lensing-worker.mjs module-private helpers ---------------- */

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function discFourVelocity(mods, params, r, prograde = true) {
  const { knp } = mods;
  const omega = knp.orbitalOmegaKerrNewman(params, r, prograde);
  if (!Number.isFinite(omega)) return null;
  let cov;
  try { cov = knp.metric(params, r, Math.PI / 2).cov; } catch (e) { return null; }
  const denom = -(cov[0][0] + 2 * omega * cov[0][3] + omega * omega * cov[3][3]);
  if (!(denom > 0)) return null;
  const ut = 1 / Math.sqrt(denom);
  return [ut, 0, 0, ut * omega];
}

function cameraObserverFourVelocity(mods, params, camera) {
  const { knp } = mods;
  try {
    const theta = clampNum(camera.theta ?? Math.PI / 2, 1e-7, Math.PI - 1e-7);
    return knp.zamoFrame(params, camera.r ?? 24, theta).eT;
  } catch (e) { return null; }
}

function iscoConservedELApprox(mods, params, prograde = true) {
  const { knp } = mods;
  const rIsco = knp.iscoRadiusKerrApprox(params, prograde);
  const u = discFourVelocity(mods, params, rIsco, prograde);
  if (!u) return null;
  let cov;
  try { cov = knp.metric(params, rIsco, Math.PI / 2).cov; } catch (e) { return null; }
  const uTcov = cov[0][0] * u[0] + cov[0][3] * u[3];
  const uPcov = cov[3][0] * u[0] + cov[3][3] * u[3];
  if (!Number.isFinite(uTcov) || !Number.isFinite(uPcov)) return null;
  return { rIsco, E: -uTcov, L: uPcov };
}

export function iscoConservedEL(mods, params, prograde = true) {
  const { od } = mods;
  try {
    const isco = od.findISCO(params, { prograde, rMax: 30 * (params.M ?? 1) });
    if (isco?.found && Number.isFinite(isco.rISCO)) {
      const orbit = od.solveCircularMassiveOrbit(params, { r: isco.rISCO, prograde });
      if (Number.isFinite(orbit?.energy) && Number.isFinite(orbit?.angularMomentumZ)) {
        return { rIsco: isco.rISCO, E: orbit.energy, L: orbit.angularMomentumZ };
      }
    }
  } catch (e) { /* fall back */ }
  return iscoConservedELApprox(mods, params, prograde);
}

function plungingFourVelocity(mods, params, r, E, L) {
  const { knp } = mods;
  let inv;
  try { inv = knp.metric(params, r, Math.PI / 2).inv; } catch (e) { return null; }
  const gtt = inv[0][0];
  const gtp = inv[0][3];
  const gpp = inv[3][3];
  const grr = inv[1][1];
  const uT = -gtt * E + gtp * L;
  const uP = -gtp * E + gpp * L;
  const tphiNorm = gtt * E * E - 2 * gtp * E * L + gpp * L * L;
  const radial = (-1 - tphiNorm) / grr;
  if (!(radial >= 0)) return null;
  const uCovR = -Math.sqrt(radial);
  const uR = grr * uCovR;
  return [uT, uR, 0, uP];
}

function discShiftApprox(mods, params, hit, camera) {
  const { rm } = mods;
  const { omega } = rm.localDiskVelocity(params, hit.r, { prograde: true });
  const v = clampNum(Math.abs(omega) * hit.r, 0, 0.999);
  const incl = camera.theta ?? Math.PI / 2;
  const camPhi = camera.phi ?? 0;
  const los = -Math.sin(hit.phi - camPhi) * Math.sin(incl);
  const vlos = v * los;
  const gamma = 1 / Math.sqrt(Math.max(1e-6, 1 - v * v));
  const gDoppler = 1 / (gamma * (1 - vlos));
  const gGrav = Math.sqrt(clampNum(1 - (2 * params.M) / Math.max(hit.r, 2.001 * params.M), 0.05, 1));
  return clampNum(gDoppler * gGrav, 0.1, 4);
}

function discRedshiftExact(mods, params, hit, camera, mom) {
  const { rt } = mods;
  if (!Number.isFinite(mom.Pt) || !Number.isFinite(mom.Pphi)) return null;
  const uEmit = discFourVelocity(mods, params, hit.r, true);
  if (!uEmit) return null;
  const uObs = cameraObserverFourVelocity(mods, params, camera);
  if (!uObs) return null;
  const photonState = { r: hit.r, theta: Math.PI / 2, phi: hit.phi, Pt: mom.Pt, Pr: 0, Ptheta: 0, Pphi: mom.Pphi };
  const rf = rt.redshiftFactor(params, photonState, { fourVelocity: uEmit }, { fourVelocity: uObs });
  return Number.isFinite(rf.g) ? clampNum(rf.g, 0.05, 8) : null;
}

function discRedshiftPlunge(mods, params, hit, camera, mom, iscoEL) {
  const { rt } = mods;
  if (!iscoEL || !(hit.r < iscoEL.rIsco)) return null;
  if (!Number.isFinite(mom.Pt) || !Number.isFinite(mom.Pphi)) return null;
  if (!Number.isFinite(mom.Pr)) return null;
  const uEmit = plungingFourVelocity(mods, params, hit.r, iscoEL.E, iscoEL.L);
  if (!uEmit) return null;
  const uObs = cameraObserverFourVelocity(mods, params, camera);
  if (!uObs) return null;
  const photonState = { r: hit.r, theta: Math.PI / 2, phi: hit.phi, Pt: mom.Pt, Pr: mom.Pr, Ptheta: 0, Pphi: mom.Pphi };
  const rf = rt.redshiftFactor(params, photonState, { fourVelocity: uEmit }, { fourVelocity: uObs });
  return Number.isFinite(rf.g) ? clampNum(rf.g, 0.05, 8) : null;
}

export function resolveDiscG(mods, params, hit, camera, mom, geom) {
  const iscoEL = geom?.iscoEL;
  if (iscoEL && hit.r < iscoEL.rIsco) {
    const plunge = discRedshiftPlunge(mods, params, hit, camera, mom, iscoEL);
    if (plunge != null) return plunge;
  } else {
    const exact = discRedshiftExact(mods, params, hit, camera, mom);
    if (exact != null) return exact;
  }
  return discShiftApprox(mods, params, hit, camera);
}

export function glowFromPeri(peri, rPhoton) {
  if (!Number.isFinite(peri) || !Number.isFinite(rPhoton) || rPhoton <= 0) return 0;
  const width = 0.32 * rPhoton;
  const d = (peri - rPhoton) / width;
  return Math.exp(-0.5 * d * d);
}

/* ---- LUT geometry (identical to lensingGeometry in lensing-worker.mjs) --- */
export function lutGeometry(mods, p, camera, disc, options) {
  const { rt, rm } = mods;
  const ring = rt.photonRingSamples(p, {
    cameraR: camera.r ?? 24,
    count: options.ringSamples ?? 8,
  });
  const rPhoton = Number.isFinite(ring.prograde?.rPhoton)
    ? ring.prograde.rPhoton
    : (ring.retrograde?.rPhoton ?? 3 * p.M);
  const innerR = disc ? (disc.innerR ?? rm.diskInnerRadius(p, disc)) : 0;
  const outerR = disc ? (disc.outerR ?? innerR * 12) : 0;
  const iscoEL = disc ? iscoConservedEL(mods, p, true) : null;
  return { ring, rPhoton, geom: { rPhoton, innerR, outerR, iscoEL } };
}

/* ---- raw batch call (the one worker message worth of work) --------------- */
export function traceBatchWasm(wt, p, camera, eff, width, height, geom, hasDisc) {
  const { w, scratch, ensureOutputs } = wt;
  const n = width * height;
  ensureOutputs(n);
  const mem = () => w.memory.buffer;
  new Float64Array(mem(), scratch.params, 3).set([p.M, p.Q, p.a]);
  new Float64Array(mem(), scratch.camera, 7).set([
    camera.r ?? 24,
    camera.theta ?? Math.PI / 2,
    camera.phi ?? 0,
    eff.fovY,
    camera.roll ?? 0,
    camera.radialSign ?? -1,
    camera.localEnergy ?? 1,
  ]);
  new Float64Array(mem(), scratch.opts, 16).set([
    eff.targetAffine, eff.initialStep, eff.minStep, eff.maxStep,
    eff.absoluteTolerance, eff.relativeTolerance, eff.recordEvery,
    eff.escapeRadius, eff.horizonBuffer, eff.maxSteps, eff.safety,
    eff.maxAttempts, eff.stopAtHorizon ? 1 : 0, hasDisc ? 1 : 0,
    geom?.innerR ?? 0, geom?.outerR ?? 0,
  ]);
  w.trace_ray_batch(
    scratch.params, scratch.camera, scratch.opts, width, height,
    scratch.status, scratch.peri, scratch.skyTheta, scratch.skyPhi,
    scratch.discHit, scratch.discR, scratch.discPhi, scratch.discPr,
    scratch.pt, scratch.pphi,
  );
  const buf = mem();
  return {
    status: new Uint8Array(buf, scratch.status, n),
    peri: new Float32Array(buf, scratch.peri, n),
    skyTheta: new Float32Array(buf, scratch.skyTheta, n),
    skyPhi: new Float32Array(buf, scratch.skyPhi, n),
    discHit: new Uint8Array(buf, scratch.discHit, n),
    discR: new Float32Array(buf, scratch.discR, n),
    discPhi: new Float32Array(buf, scratch.discPhi, n),
    discPr: new Float32Array(buf, scratch.discPr, n),
    pt: new Float64Array(buf, scratch.pt, n),
    pphi: new Float64Array(buf, scratch.pphi, n),
  };
}

/* ---- buildDeflectionLUT drop-in (WASM trace + JS geometry/shading) ------- */
export function buildDeflectionLUTWasm(wt, mods, params, camera, options = {}) {
  const { knp } = mods;
  const p = knp.sanitizeParams(params);
  const width = Math.max(1, Math.floor(options.width ?? camera.width ?? 72));
  const height = Math.max(1, Math.floor(options.height ?? camera.height ?? 40));
  const disc = options.disc ?? null;
  const eff = effectiveTraceOptions(camera, options);
  const { ring, rPhoton, geom } = lutGeometry(mods, p, camera, disc, options);
  const camPhi0 = camera.phi ?? 0;

  const out = traceBatchWasm(wt, p, camera, eff, width, height, geom, !!disc);

  const n = width * height;
  const capture = new Uint8Array(n);
  const skyTheta = new Float32Array(n);
  const skyPhi = new Float32Array(n);
  const ringGlowArr = new Float32Array(n);
  const discHit = new Uint8Array(n);
  const discR = new Float32Array(n);
  const discPhi = new Float32Array(n);
  const discG = new Float32Array(n);
  skyTheta.fill(Math.PI / 2);

  for (let cell = 0; cell < n; cell++) {
    const st = out.status[cell];
    const captured = st === 1 || st === 3;
    capture[cell] = captured ? 1 : 0;
    ringGlowArr[cell] = glowFromPeri(out.peri[cell], rPhoton);
    if (captured) continue;
    skyTheta[cell] = out.skyTheta[cell];
    skyPhi[cell] = out.skyPhi[cell] - camPhi0;
    if (disc && out.discHit[cell]) {
      discHit[cell] = 1;
      discR[cell] = out.discR[cell];
      discPhi[cell] = out.discPhi[cell] - camPhi0;
      const hit = { hit: true, r: out.discR[cell], phi: out.discPhi[cell] };
      const mom = { Pt: out.pt[cell], Pphi: out.pphi[cell], Pr: out.discPr[cell] };
      discG[cell] = resolveDiscG(mods, p, hit, camera, mom, geom);
    }
  }

  return {
    width,
    height,
    params: p,
    camera: {
      r: camera.r ?? 24,
      theta: camera.theta ?? Math.PI / 2,
      phi: camera.phi ?? 0,
      fovY: eff.fovY,
    },
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

/* ---- single-ray diagnostic ------------------------------------------------ */
export function traceSingleDiagWasm(wt, p, camera, eff, width, height, px, py, geom, hasDisc) {
  const { w, scratch, ensureInputs } = wt;
  ensureInputs();
  const mem = () => w.memory.buffer;
  new Float64Array(mem(), scratch.params, 3).set([p.M, p.Q, p.a]);
  new Float64Array(mem(), scratch.camera, 7).set([
    camera.r ?? 24, camera.theta ?? Math.PI / 2, camera.phi ?? 0,
    eff.fovY, camera.roll ?? 0, camera.radialSign ?? -1, camera.localEnergy ?? 1,
  ]);
  new Float64Array(mem(), scratch.opts, 16).set([
    eff.targetAffine, eff.initialStep, eff.minStep, eff.maxStep,
    eff.absoluteTolerance, eff.relativeTolerance, eff.recordEvery,
    eff.escapeRadius, eff.horizonBuffer, eff.maxSteps, eff.safety,
    eff.maxAttempts, eff.stopAtHorizon ? 1 : 0, hasDisc ? 1 : 0,
    geom?.innerR ?? 0, geom?.outerR ?? 0,
  ]);
  w.trace_single_diag(scratch.params, scratch.camera, scratch.opts, width, height, px, py, scratch.diag);
  const d = new Float64Array(mem(), scratch.diag, 20);
  return {
    status: d[0], affine: d[1], acceptedSteps: d[2], rejectedSteps: d[3],
    initialHamiltonian: d[4], lastHamiltonian: d[5], hamiltonianDrift: d[6],
    initPt: d[7], initPphi: d[8],
    finalState: { t: d[9], r: d[10], theta: d[11], phi: d[12], Pt: d[13], Pr: d[14], Ptheta: d[15], Pphi: d[16] },
    peri: d[17], discHit: d[18], discR: d[19],
  };
}
