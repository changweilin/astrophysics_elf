/*
 * Rust->WASM PoC benchmark + parity harness for the geodesic ray-trace batch
 * kernel (buildDeflectionLUT trace phase).
 *
 * JS baseline = the REAL repo implementation (imported via file URL, repo
 * untouched). WASM path = kn_wasm_trace.wasm + shim.mjs (geometry/shading in
 * JS, trace in WASM — the exact seam proposed for full-physics/wasm-trace.mjs).
 *
 * Exit code != 0 if any correctness gate fails (CI-style parity harness).
 */

import { performance } from "node:perf_hooks";
import {
  loadRepoModules, loadWasm, effectiveTraceOptions, lutGeometry,
  buildDeflectionLUTWasm, traceBatchWasm, traceSingleDiagWasm,
  glowFromPeri,
} from "./shim.mjs";

const WASM_PATH = new URL("./kn_wasm_trace.wasm", import.meta.url);

const log = (...a) => console.error(...a);

function timeIt(label, fn, { reps = 5, warmup = 1 } = {}) {
  for (let i = 0; i < warmup; i++) fn();
  const ts = [];
  for (let i = 0; i < reps; i++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  const median = ts[(ts.length - 1) >> 1];
  log(`  ${label}: median ${median.toFixed(2)} ms  (min ${ts[0].toFixed(2)}, max ${ts[ts.length - 1].toFixed(2)}, n=${reps})`);
  return { median, min: ts[0], max: ts[ts.length - 1] };
}

function angleBetween(th1, ph1, th2, ph2) {
  const s1 = Math.sin(th1), s2 = Math.sin(th2);
  const dot = s1 * Math.cos(ph1) * s2 * Math.cos(ph2) +
    s1 * Math.sin(ph1) * s2 * Math.sin(ph2) +
    Math.cos(th1) * Math.cos(th2);
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function quantiles(arr, qs) {
  if (!arr.length) return qs.map(() => 0);
  const s = [...arr].sort((a, b) => a - b);
  return qs.map((q) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]);
}

const mods = await loadRepoModules();
const { knp, rt, ai, lw } = mods;
const wt = await loadWasm(WASM_PATH);

/* ---- workload: the production observer-view LUT rebuild ------------------ */
const params = { M: 1, Q: 0.15, a: 0.65 };
const p = knp.sanitizeParams(params);
const camera = { r: 26, theta: 75 * Math.PI / 180, phi: 20 * Math.PI / 180, fovY: Math.PI / 2.5 };
const disc = { accretionRate: 0.08, outerR: 18, exposure: 150 };
// observer-view.jsx TRACE constants (absolute/relativeTolerance included even
// though lensingTraceOptions drops them — mirrored faithfully on both sides).
const TRACE = {
  targetAffine: 30, escapeRadius: 48, maxStep: 0.45,
  absoluteTolerance: 1e-5, relativeTolerance: 1e-5, recordEvery: 12,
};
const W = 79, H = 42;            // desktop base LUT grid from the profiling pass
const CW = 40, CH = 21;          // progressive coarse pass (baseW/2, baseH/2)
const optionsFull = { width: W, height: H, disc, ...TRACE };
const optionsCoarse = { width: CW, height: CH, disc, ...TRACE };

const eff = effectiveTraceOptions(camera, optionsFull);
const { geom } = lutGeometry(mods, p, camera, disc, optionsFull);
// lensingTraceOptions-shaped options for the raw JS traceCameraRays baseline.
const tOpts = {
  width: W, height: H,
  targetAffine: eff.targetAffine, initialStep: eff.initialStep,
  minStep: eff.minStep, maxStep: eff.maxStep, recordEvery: eff.recordEvery,
  escapeRadius: eff.escapeRadius, stopAtHorizon: eff.stopAtHorizon, fovY: eff.fovY,
};

log(`params M=${p.M} Q=${p.Q} a=${p.a}; camera r=${camera.r} theta=${(camera.theta * 180 / Math.PI).toFixed(0)}deg fovY=${camera.fovY.toFixed(4)}`);
log(`effective trace opts: affine=${eff.targetAffine} atol=${eff.absoluteTolerance} rtol=${eff.relativeTolerance} maxStep=${eff.maxStep} recordEvery=${eff.recordEvery} escapeR=${eff.escapeRadius}`);
log(`disc innerR=${geom.innerR.toFixed(4)} outerR=${geom.outerR} rISCO=${geom.iscoEL?.rIsco?.toFixed(4)}`);

/* ==== 1. correctness: LUT base arrays, ray-for-ray ======================== */
log("\n[correctness] building JS LUT (reference) ...");
const jsLut = lw.buildDeflectionLUT(p, camera, optionsFull);
log("[correctness] building WASM LUT ...");
const wasmLut = buildDeflectionLUTWasm(wt, mods, p, camera, optionsFull);

const n = W * H;
const jb = jsLut.base, wb = wasmLut.base;
let capMismatch = 0, discMismatch = 0;
let skyDiffs = [], discRRel = [], discGAbs = [], glowAbs = [], periPairs = 0;
for (let c = 0; c < n; c++) {
  if (jb.capture[c] !== wb.capture[c]) { capMismatch++; continue; }
  glowAbs.push(Math.abs(jb.ringGlow[c] - wb.ringGlow[c]));
  if (!jb.capture[c]) {
    skyDiffs.push(angleBetween(jb.skyTheta[c], jb.skyPhi[c], wb.skyTheta[c], wb.skyPhi[c]));
    if (jb.discHit[c] !== wb.discHit[c]) { discMismatch++; }
    else if (jb.discHit[c]) {
      discRRel.push(Math.abs(jb.discR[c] - wb.discR[c]) / Math.max(Math.abs(jb.discR[c]), 1e-12));
      discGAbs.push(Math.abs(jb.discG[c] - wb.discG[c]));
    }
  }
}
const [skyP50, skyP999, skyMax] = quantiles(skyDiffs, [0.5, 0.999, 1]);
const [drP50, drP999, drMax] = quantiles(discRRel, [0.5, 0.999, 1]);
const [dgP50, dgMax] = quantiles(discGAbs, [0.5, 1]);
const [glP50, glMax] = quantiles(glowAbs, [0.5, 1]);
const skyWithin = skyDiffs.filter((d) => d <= 1e-3).length;
const drWithin = discRRel.filter((d) => d <= 1e-4).length;
const capAgreePct = 100 * (n - capMismatch) / n;
const discAgreePct = 100 * (n - capMismatch - discMismatch) / (n - capMismatch);

// Pt/Pphi parity vs a raw JS trace (finalState conserved momenta).
log("[correctness] raw JS traceCameraRays for Pt/Pphi parity ...");
const jsTrace = rt.traceCameraRays(p, camera, tOpts);
const wOut = traceBatchWasm(wt, p, camera, eff, W, H, geom, true);
let ptRelMax = 0, pphiRelMax = 0, statusAgree = 0, statusTotal = 0;
const stMap = { captured: 1, escaped: 2, "integration-failed": 3, active: 0 };
for (const trc of jsTrace.traced) {
  const c = trc.pixelY * W + trc.pixelX;
  statusTotal++;
  const jsSt = stMap[trc.classification.status] ?? 0;
  if (jsSt === wOut.status[c]) {
    statusAgree++;
    const fs = trc.result.finalState;
    ptRelMax = Math.max(ptRelMax, Math.abs(fs.Pt - wOut.pt[c]) / Math.max(Math.abs(fs.Pt), 1e-12));
    pphiRelMax = Math.max(pphiRelMax, Math.abs(fs.Pphi - wOut.pphi[c]) / Math.max(Math.abs(fs.Pphi), 1e-12));
  }
}

log(`capture agreement: ${capAgreePct.toFixed(3)}% (${capMismatch}/${n} mismatched)`);
log(`raw status agreement: ${(100 * statusAgree / statusTotal).toFixed(3)}%`);
log(`discHit agreement (non-captured): ${discAgreePct.toFixed(3)}% (${discMismatch} mismatched)`);
log(`sky angle diff rad: p50=${skyP50.toExponential(2)} p99.9=${skyP999.toExponential(2)} max=${skyMax.toExponential(2)}; within 1e-3: ${(100 * skyWithin / Math.max(1, skyDiffs.length)).toFixed(3)}%`);
log(`disc r rel diff: p50=${drP50.toExponential(2)} p99.9=${drP999.toExponential(2)} max=${drMax.toExponential(2)}; within 1e-4: ${(100 * drWithin / Math.max(1, discRRel.length)).toFixed(3)}%`);
log(`disc g abs diff: p50=${dgP50.toExponential(2)} max=${dgMax.toExponential(2)}`);
log(`ringGlow abs diff: p50=${glP50.toExponential(2)} max=${glMax.toExponential(2)}`);
log(`final Pt rel diff max (status-agreeing): ${ptRelMax.toExponential(2)}; Pphi: ${pphiRelMax.toExponential(2)}`);

/* ==== 2. conservation diag (ledger tolerances 1e-9/1e-8) ================== */
log("\n[conservation] single-ray adaptive integration, tolerances 1e-9/1e-8");
// pick the first middle-row pixel that escapes on both sides
let diagPx = -1;
const midRow = Math.floor(H / 2);
for (let px = 0; px < W; px++) {
  const c = midRow * W + px;
  const jsT = jsTrace.traced[c];
  if (jsT.classification.status === "escaped" && wOut.status[c] === 2) { diagPx = px; break; }
}
if (diagPx < 0) diagPx = 0;
const effDiag = { ...eff };
const wDiag = traceSingleDiagWasm(wt, p, camera, effDiag, W, H, diagPx, midRow, geom, true);
const jsRayDiag = rt.makeCameraRay(p, camera, { pixelX: diagPx, pixelY: midRow }, { width: W, height: H, fovY: eff.fovY });
const jsDiag = ai.integrateAdaptive(p, jsRayDiag.state, {
  targetAffine: eff.targetAffine, initialStep: eff.initialStep, minStep: eff.minStep,
  maxStep: eff.maxStep, absoluteTolerance: eff.absoluteTolerance,
  relativeTolerance: eff.relativeTolerance, recordEvery: eff.recordEvery,
  escapeRadius: eff.escapeRadius, stopAtHorizon: true, horizonBuffer: eff.horizonBuffer,
});
const wasmPtDrift = wDiag.finalState.Pt - wDiag.initPt;
const wasmPphiDrift = wDiag.finalState.Pphi - wDiag.initPphi;
log(`diag pixel (${diagPx},${midRow}): JS drift=${jsDiag.hamiltonianDrift.toExponential(3)} steps=${jsDiag.acceptedSteps}+${jsDiag.rejectedSteps}rej | WASM drift=${wDiag.hamiltonianDrift.toExponential(3)} steps=${wDiag.acceptedSteps}+${wDiag.rejectedSteps}rej`);
log(`WASM Pt drift=${wasmPtDrift} Pphi drift=${wasmPphiDrift} (must be exactly 0)`);
log(`final r: JS=${jsDiag.finalState.r.toFixed(6)} WASM=${wDiag.finalState.r.toFixed(6)}`);

/* ==== 3. benchmarks ======================================================= */
log("\n[bench] full LUT build 79x42 (disc on)");
const jsFull = timeIt("JS  buildDeflectionLUT 79x42", () => lw.buildDeflectionLUT(p, camera, optionsFull));
const wsFull = timeIt("WASM lut-build 79x42        ", () => buildDeflectionLUTWasm(wt, mods, p, camera, optionsFull));

log("\n[bench] trace phase only 79x42 (kernel isolation)");
const jsTraceOnly = timeIt("JS  traceCameraRays 79x42   ", () => rt.traceCameraRays(p, camera, tOpts));
const wsTraceOnly = timeIt("WASM trace_ray_batch 79x42  ", () => traceBatchWasm(wt, p, camera, eff, W, H, geom, true));

log("\n[bench] coarse progressive pass 40x21 (disc on)");
const jsCoarse = timeIt("JS  buildDeflectionLUT 40x21", () => lw.buildDeflectionLUT(p, camera, optionsCoarse));
const wsCoarse = timeIt("WASM lut-build 40x21        ", () => buildDeflectionLUTWasm(wt, mods, p, camera, optionsCoarse));
// Decompose: the per-build JS geometry (photonRingSamples + findISCO), kept in
// JS by the seam design, is a FIXED cost identical on both sides; the trace
// phase is what the kernel replaces.
const geomFixed = timeIt("JS  lutGeometry (both sides)", () => lutGeometry(mods, p, camera, disc, optionsCoarse));
const tOptsCoarse = { ...tOpts, width: CW, height: CH };
const jsCoarseTrace = timeIt("JS  traceCameraRays 40x21   ", () => rt.traceCameraRays(p, camera, tOptsCoarse));
const wsCoarseTrace = timeIt("WASM trace_ray_batch 40x21  ", () => traceBatchWasm(wt, p, camera, eff, CW, CH, geom, true));

log("\n[bench] single-ray trace (init+integrate+classify), UI options");
const raySample = { pixelX: diagPx, pixelY: midRow };
const single = { batch: 50 };
const jsSingle = timeIt("JS  tracePhotonRay x50      ", () => {
  for (let i = 0; i < single.batch; i++) {
    rt.tracePhotonRay(p, rt.makeCameraRay(p, camera, raySample, { width: W, height: H, fovY: eff.fovY }), tOpts);
  }
}, { reps: 7, warmup: 1 });
const wsSingle = timeIt("WASM trace_single_diag x50  ", () => {
  for (let i = 0; i < single.batch; i++) {
    traceSingleDiagWasm(wt, p, camera, eff, W, H, diagPx, midRow, geom, true);
  }
}, { reps: 7, warmup: 1 });

/* ==== 4. boundary cost ==================================================== */
log("\n[boundary] JS<->WASM call + copy overhead");
const NOOP_N = 1_000_000;
{
  const t0 = performance.now();
  for (let i = 0; i < NOOP_N; i++) wt.w.noop();
  const per = (performance.now() - t0) / NOOP_N * 1e6;
  var noopNs = per;
  log(`  no-op call: ${per.toFixed(1)} ns/call`);
}
const payloadBytes = n * (1 + 4 + 4 + 4 + 1 + 4 + 4 + 4 + 8 + 8);
{
  // representative bulk copy: write a 96 KiB Float64Array into wasm memory,
  // read the full 79x42 outcome payload back out as fresh JS copies.
  const f64n = 12288; // 96 KiB
  const src = new Float64Array(f64n).map((_, i) => i * 0.5);
  const dstPtr = wt.w.wasm_alloc(f64n * 8);
  const reps = 2000;
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) {
    new Float64Array(wt.w.memory.buffer, dstPtr, f64n).set(src);
  }
  const inMs = (performance.now() - t0) / reps;
  const s = wt.scratch;
  const t1 = performance.now();
  for (let i = 0; i < reps; i++) {
    const buf = wt.w.memory.buffer;
    new Uint8Array(buf, s.status, n).slice();
    new Float32Array(buf, s.peri, n).slice();
    new Float32Array(buf, s.skyTheta, n).slice();
    new Float32Array(buf, s.skyPhi, n).slice();
    new Uint8Array(buf, s.discHit, n).slice();
    new Float32Array(buf, s.discR, n).slice();
    new Float32Array(buf, s.discPhi, n).slice();
    new Float32Array(buf, s.discPr, n).slice();
    new Float64Array(buf, s.pt, n).slice();
    new Float64Array(buf, s.pphi, n).slice();
  }
  const outMs = (performance.now() - t1) / reps;
  var copyIn96k = inMs, copyOutPayload = outMs;
  log(`  bulk write 96 KiB into wasm: ${inMs.toFixed(4)} ms; read full 79x42 payload (${(payloadBytes / 1024).toFixed(1)} KiB) out: ${outMs.toFixed(4)} ms`);
}

/* ==== 5. gates + summary ================================================== */
const gates = [];
const gate = (name, ok, detail) => { gates.push({ name, ok, detail }); log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); };

log("\n[gates]");
gate("classification agreement >= 99.9%", capAgreePct >= 99.9 && (100 * statusAgree / statusTotal) >= 99.9,
  `capture ${capAgreePct.toFixed(3)}%, raw ${(100 * statusAgree / statusTotal).toFixed(3)}%`);
gate("sky direction <= 1e-3 rad (>=99.9% of agreeing escaped rays)",
  (skyWithin / Math.max(1, skyDiffs.length)) >= 0.999, `within: ${(100 * skyWithin / Math.max(1, skyDiffs.length)).toFixed(3)}%, max ${skyMax.toExponential(2)}`);
gate("disc-crossing r <= 1e-4 rel (>=99.9% of agreeing hits)",
  (drWithin / Math.max(1, discRRel.length)) >= 0.999, `within: ${(100 * drWithin / Math.max(1, discRRel.length)).toFixed(3)}%, max ${drMax.toExponential(2)}`);
gate("WASM Hamiltonian drift <= 1e-7", Math.abs(wDiag.hamiltonianDrift) <= 1e-7, `${wDiag.hamiltonianDrift.toExponential(3)}`);
gate("WASM Pt/Pphi drift exactly 0", wasmPtDrift === 0 && wasmPphiDrift === 0, `Pt ${wasmPtDrift}, Pphi ${wasmPphiDrift}`);
gate("speedup >= 8x on 79x42 LUT build", jsFull.median / wsFull.median >= 8, `${(jsFull.median / wsFull.median).toFixed(1)}x`);
gate("speedup >= 8x on 40x21 coarse trace phase, and coarse build <= 87 ms absolute",
  jsCoarseTrace.median / wsCoarseTrace.median >= 8 && wsCoarse.median <= 87,
  `trace ${(jsCoarseTrace.median / wsCoarseTrace.median).toFixed(1)}x, full build ${(jsCoarse.median / wsCoarse.median).toFixed(1)}x (${wsCoarse.median.toFixed(0)} ms; fixed JS geometry ${geomFixed.median.toFixed(0)} ms on both sides)`);
gate("payload <= 200 KB", payloadBytes <= 200 * 1024, `${(payloadBytes / 1024).toFixed(1)} KiB`);

const summary = {
  bench: [
    { case: "lut-build-79x42-disc", jsMs: +jsFull.median.toFixed(2), wasmMs: +wsFull.median.toFixed(2), speedup: +(jsFull.median / wsFull.median).toFixed(1) },
    { case: "trace-only-79x42", jsMs: +jsTraceOnly.median.toFixed(2), wasmMs: +wsTraceOnly.median.toFixed(2), speedup: +(jsTraceOnly.median / wsTraceOnly.median).toFixed(1) },
    { case: "lut-build-40x21-coarse", jsMs: +jsCoarse.median.toFixed(2), wasmMs: +wsCoarse.median.toFixed(2), speedup: +(jsCoarse.median / wsCoarse.median).toFixed(1) },
    { case: "trace-only-40x21", jsMs: +jsCoarseTrace.median.toFixed(2), wasmMs: +wsCoarseTrace.median.toFixed(2), speedup: +(jsCoarseTrace.median / wsCoarseTrace.median).toFixed(1) },
    { case: "fixed-js-geometry-per-build", jsMs: +geomFixed.median.toFixed(2), wasmMs: +geomFixed.median.toFixed(2), speedup: 1 },
    { case: "single-ray-x50", jsMs: +jsSingle.median.toFixed(2), wasmMs: +wsSingle.median.toFixed(2), speedup: +(jsSingle.median / wsSingle.median).toFixed(1) },
  ],
  correctness: {
    captureAgreementPct: +capAgreePct.toFixed(3),
    rawStatusAgreementPct: +(100 * statusAgree / statusTotal).toFixed(3),
    discHitAgreementPct: +discAgreePct.toFixed(3),
    skyAngleRad: { p50: skyP50, p999: skyP999, max: skyMax, within1e3Pct: +(100 * skyWithin / Math.max(1, skyDiffs.length)).toFixed(3) },
    discRRel: { p50: drP50, p999: drP999, max: drMax, within1e4Pct: +(100 * drWithin / Math.max(1, discRRel.length)).toFixed(3) },
    discGAbs: { p50: dgP50, max: dgMax },
    ringGlowAbs: { p50: glP50, max: glMax },
    ptRelMax, pphiRelMax,
    conservation: {
      jsDrift: jsDiag.hamiltonianDrift, wasmDrift: wDiag.hamiltonianDrift,
      wasmPtDrift, wasmPphiDrift,
      jsSteps: `${jsDiag.acceptedSteps}+${jsDiag.rejectedSteps}rej`,
      wasmSteps: `${wDiag.acceptedSteps}+${wDiag.rejectedSteps}rej`,
    },
  },
  boundary: {
    noopNs: +noopNs.toFixed(1),
    write96KiBMs: +copyIn96k.toFixed(4),
    readPayloadMs: +copyOutPayload.toFixed(4),
    payloadKiB: +(payloadBytes / 1024).toFixed(1),
  },
  gates,
};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = gates.every((g) => g.ok) ? 0 : 1;
