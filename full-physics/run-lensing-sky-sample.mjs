/*
 * Validation runner for the lensed-background sky direction (PHASE6-LENSING-PLAN.md
 * P6.1 starfield-warp note).
 *
 * The lensing renderer samples the background starfield along each ray's
 * asymptotic sky direction. Because integrating every ray out to infinity is
 * impractical (~10-70 s per panel build, with ~0 rays actually reaching escape),
 * the renderer instead reads the ray's HEADING (contravariant velocity) at the
 * truncation point. This runner proves that approximation is accurate: it
 * integrates a fan of rays out to a large radius (ground-truth asymptotic
 * direction), then compares, at a panel-like truncation radius, the error of
 *   - the endpoint POSITION angle (what the first pass used), and
 *   - the endpoint HEADING (asymptoticSkyDirection, what the renderer uses now).
 * The heading must be far closer to truth, and within a tight tolerance.
 *
 *   node .\full-physics\run-lensing-sky-sample.mjs
 *
 * Units: G = c = 4 pi epsilon_0 = 1.
 */

import { sanitizeParams, clamp } from "./kn-full-physics.mjs";
import { makeCameraRay, tracePhotonRay } from "./ray-tracing.mjs";
import { asymptoticSkyDirection } from "./lensing-worker.mjs";

const params = sanitizeParams({ M: 1.5, Q: 0.22, a: 0.6, B: 0.4 });
const camera = { r: 26, theta: Math.PI / 2 + 0.32, phi: 0, fovY: Math.PI / 2.5 };

// Great-circle distance between two (theta, phi) celestial points.
function skyDist(t1, p1, t2, p2) {
  const c = Math.sin(t1) * Math.sin(t2) * Math.cos(p1 - p2) + Math.cos(t1) * Math.cos(t2);
  return Math.acos(clamp(c, -1, 1));
}

const TRUTH = { targetAffine: 6000, escapeRadius: 4000, maxStep: 3, initialStep: 0.05, recordEvery: 1e9, absoluteTolerance: 1e-7, relativeTolerance: 1e-7 };
// Panel-like fast truncation (matches the Observer View / mobile TRACE preset).
const TRUNC = { targetAffine: 200, escapeRadius: 40, maxStep: 0.5, initialStep: 0.05, recordEvery: 1e9, absoluteTolerance: 1e-6, relativeTolerance: 1e-6 };

const rows = [];
let maxHead = 0, sumHead = 0, maxPos = 0, n = 0, escaped = 0;
for (let i = 0; i < 17; i++) {
  const x = (i / 16) * 2 - 1;
  for (const y of [-0.35, 0.0, 0.35]) {
    const ray = makeCameraRay(params, camera, { x, y, pixelX: 0, pixelY: 0 }, { fovY: camera.fovY, aspect: 1 });
    const truth = tracePhotonRay(params, ray, TRUTH);
    if (truth.classification.status !== "escaped") continue;
    escaped++;
    const tf = truth.result.finalState;
    const mod = tracePhotonRay(params, ray, TRUNC);
    const mf = mod.result.finalState;
    const head = asymptoticSkyDirection(params, mf);
    const ePos = skyDist(mf.theta, mf.phi, tf.theta, tf.phi);
    const eHead = skyDist(head.theta, head.phi, tf.theta, tf.phi);
    maxPos = Math.max(maxPos, ePos);
    maxHead = Math.max(maxHead, eHead);
    sumHead += eHead;
    n++;
    if (rows.length < 12) rows.push(`x=${x.toFixed(2)} y=${y.toFixed(2)} rTrunc=${mf.r.toFixed(0)} | posErr=${ePos.toFixed(3)} headErr=${eHead.toFixed(3)} rad`);
  }
}

const meanHead = n ? sumHead / n : 0;
console.log(JSON.stringify({
  model: "Asymptotic sky-direction validation (lensed background warp)",
  units: "G = c = 4 pi epsilon_0 = 1",
  params,
  raysEscapedToInfinity: escaped,
  comparedRays: n,
  headingErrorRad: { max: +maxHead.toFixed(4), mean: +meanHead.toFixed(4) },
  positionErrorRad: { max: +maxPos.toFixed(4) },
  headingErrorDeg: { max: +(maxHead * 180 / Math.PI).toFixed(3), mean: +(meanHead * 180 / Math.PI).toFixed(3) },
}, null, 2));
console.log("\nPer-ray (truncation radius ~ panel preset):\n" + rows.join("\n"));

const problems = [];
if (n < 6) problems.push(`too few escaping rays to validate (${n})`);
// Heading must be near-exact and dramatically better than the position angle.
if (maxHead > 0.05) problems.push(`heading sky direction error too large (max ${maxHead.toFixed(4)} rad > 0.05)`);
if (!(maxHead < maxPos * 0.5)) problems.push(`heading not clearly better than position (head ${maxHead.toFixed(3)} vs pos ${maxPos.toFixed(3)})`);
if (problems.length) {
  console.error("\nFAIL:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`\nOK: heading reproduces the asymptotic sky direction to ${(maxHead * 180 / Math.PI).toFixed(2)} deg (max), vs ${(maxPos * 180 / Math.PI).toFixed(1)} deg for the raw position angle.`);
