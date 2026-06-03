/*
 * Smoke runner for the deflection-LUT fast path (PHASE6-LENSING-PLAN.md sec 4.5).
 *
 * Verifies two properties that the LUT must hold to be a correct optimisation:
 *   1. Shading the LUT at its base resolution reproduces the direct per-ray
 *      renderLensingImage colours (the LUT is just a cached decomposition).
 *   2. Shading the LUT at a higher display resolution stays coherent — the
 *      shadow centre stays dark and the photon ring stays bright — without any
 *      extra ray integration.
 *   3. Re-shading at a rotated camera azimuth leaves the shadow/ring intact
 *      (Kerr-Newman is axisymmetric) while the lensed starfield moves.
 *   4. A disc reaching inside the ISCO exercises the plunging-region redshift
 *      (PHASE6-LENSING-PLAN.md sec 7 follow-up): every inside-ISCO crossing must
 *      still produce a finite positive g, and the inside-ISCO range must straddle
 *      1 — proof the geodesic plunging emitter replaced the kinematic fallback.
 *
 *   node .\full-physics\run-lensing-lut-sample.mjs
 *
 * Units: G = c = 4 pi epsilon_0 = 1.
 */

import { renderLensingImage, buildDeflectionLUT, shadeLUTImage } from "./lensing-worker.mjs";
import { horizons } from "./kn-full-physics.mjs";
import { findISCO } from "./orbit-diagnostics.mjs";
import { novikovThorneLikeFlux } from "./radiation-models.mjs";

const params = { M: 1.5, Q: 0.22, a: 0.6, B: 0.4 };
const camera = { r: 26, theta: Math.PI / 2 + 0.32, phi: 0.0, fovY: Math.PI / 2.5, localEnergy: 1 };
const disc = { accretionRate: 0.08, outerR: 18, spectralIndex: 0.72, frequency: 1.4, exposure: 150 };

const baseW = 40;
const baseH = 24;
const traceOpts = { disc, targetAffine: 90, recordEvery: 5, escapeRadius: 70 };

// Direct render (ground truth) and the LUT built from the same trace settings.
const direct = renderLensingImage(params, camera, { width: baseW, height: baseH, ...traceOpts });
const lut = buildDeflectionLUT(params, camera, { width: baseW, height: baseH, ...traceOpts });

// (1) LUT shaded at base resolution must match the direct render pixel-for-pixel
// (both decompose the same trace, so only float rounding should differ).
const lutBase = shadeLUTImage(lut, { width: baseW, height: baseH, disc, cameraPhi: camera.phi });
let maxDiff = 0;
let sumDiff = 0;
for (let i = 0; i < direct.buffer.length; i++) {
  const d = Math.abs(direct.buffer[i] - lutBase.buffer[i]);
  if (d > maxDiff) maxDiff = d;
  sumDiff += d;
}
const meanDiff = sumDiff / direct.buffer.length;

// (2) Higher-resolution upsample stays coherent.
const hiW = baseW * 3;
const hiH = baseH * 3;
const hi = shadeLUTImage(lut, { width: hiW, height: hiH, disc, cameraPhi: camera.phi });

function luminance(buf, w, x, y) {
  const idx = (y * w + x) * 4;
  return 0.2126 * buf[idx] / 255 + 0.7152 * buf[idx + 1] / 255 + 0.0722 * buf[idx + 2] / 255;
}
function maxLuminance(buf, w, h) {
  let m = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m = Math.max(m, luminance(buf, w, x, y));
  return m;
}
const hiCenter = luminance(hi.buffer, hiW, Math.floor(hiW / 2), Math.floor(hiH / 2));
const hiPeak = maxLuminance(hi.buffer, hiW, hiH);

// (3) Azimuth rotation: shadow center + ring peak invariant, starfield differs.
const rot = shadeLUTImage(lut, { width: baseW, height: baseH, disc, cameraPhi: camera.phi + 1.0 });
const rotCenter = luminance(rot.buffer, baseW, Math.floor(baseW / 2), Math.floor(baseH / 2));
const rotPeak = maxLuminance(rot.buffer, baseW, baseH);
// Total image delta vs the base azimuth. The shadow, ring, and axisymmetric disc
// are azimuth-invariant, so any difference comes from the lensed starfield cells
// shifting with the camera — confirming the cheap reshade actually rotates the sky.
let skyMoved = 0;
for (let i = 0; i < lutBase.buffer.length; i++) skyMoved += Math.abs(lutBase.buffer[i] - rot.buffer[i]);

// Exact per-ray disc redshift (sec 7): the LUT caches g per disc-hit pixel. For an
// inclined disc the approaching side blueshifts (g>1) and the receding side
// redshifts (g<1), so the range must straddle 1 — proof the factor is per-ray
// Doppler, not a flat estimate.
let gMin = Infinity, gMax = -Infinity, gSum = 0, gN = 0;
for (let i = 0; i < lut.base.discHit.length; i++) {
  if (!lut.base.discHit[i]) continue;
  const g = lut.base.discG[i];
  if (!Number.isFinite(g) || g <= 0) continue;
  if (g < gMin) gMin = g;
  if (g > gMax) gMax = g;
  gSum += g; gN++;
}
const discRedshift = gN
  ? { hits: gN, gMin: +gMin.toFixed(3), gMax: +gMax.toFixed(3), gMean: +(gSum / gN).toFixed(3) }
  : { hits: 0 };

// (4) Plunging-region redshift inside the ISCO. The default disc starts at the
// ISCO, so it never enters the plunging region; build a second LUT with a disc
// whose inner edge reaches well inside the ISCO (between r+ and the ISCO) so the
// geodesic plunging emitter is exercised. Every inside-ISCO crossing must give a
// finite positive g, and that inside-ISCO range must still straddle 1.
const isco = findISCO(params, { prograde: true, rMax: 30 * params.M }).rISCO;
const rPlus = horizons(params).rPlus;
const plungeDisc = { ...disc, innerR: rPlus + 0.4 * (isco - rPlus), outerR: isco * 4 };
const plungeLUT = buildDeflectionLUT(params, camera, { width: baseW, height: baseH, ...traceOpts, disc: plungeDisc });
let pgMin = Infinity, pgMax = -Infinity, pInside = 0, pBad = 0;
for (let i = 0; i < plungeLUT.base.discHit.length; i++) {
  if (!plungeLUT.base.discHit[i]) continue;
  if (!(plungeLUT.base.discR[i] < isco)) continue; // only the plunging region
  pInside++;
  const g = plungeLUT.base.discG[i];
  if (!Number.isFinite(g) || g <= 0) { pBad++; continue; }
  if (g < pgMin) pgMin = g;
  if (g > pgMax) pgMax = g;
}
const plungeRedshift = pInside
  ? { insideIscoHits: pInside, nonFiniteOrNegative: pBad, gMin: +pgMin.toFixed(3), gMax: +pgMax.toFixed(3),
      iscoRadius: +isco.toFixed(3), discInnerR: +plungeDisc.innerR.toFixed(3) }
  : { insideIscoHits: 0 };

// (5) Zero-torque boundary pinned at the ISCO (emissivity). For a disc whose
// geometric inner edge is inside the ISCO, the radiative flux must vanish in the
// plunging region (torque boundary at the ISCO) yet emit just outside it — so the
// bright inner edge stays at the ISCO no matter how far the material extends in.
const rPlunge = 0.5 * (plungeDisc.innerR + isco); // a radius inside the ISCO
const rOuter = isco * 1.3;                         // a radius outside the ISCO
const fluxOpts = { accretionRate: 0.08, innerR: plungeDisc.innerR };
const fluxPlungePinned = novikovThorneLikeFlux(params, rPlunge, { ...fluxOpts, torqueRadius: isco });
const fluxPlungeUnpinned = novikovThorneLikeFlux(params, rPlunge, fluxOpts);
const fluxOuterPinned = novikovThorneLikeFlux(params, rOuter, { ...fluxOpts, torqueRadius: isco });
const zeroTorque = {
  rPlunge: +rPlunge.toFixed(3),
  fluxInsideIscoPinned: fluxPlungePinned,        // expect 0 (plunging region dark)
  fluxInsideIscoDefault: +fluxPlungeUnpinned.toExponential(2), // > 0 (old innerR-cutoff behavior)
  fluxOutsideIscoPinned: +fluxOuterPinned.toExponential(2),    // > 0 (bright edge at ISCO)
};

const RAMP = " .:-=+*#%@";
function ascii(buf, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let line = "";
    for (let x = 0; x < w; x++) {
      const l = luminance(buf, w, x, y);
      line += RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(l * (RAMP.length - 1))))];
    }
    rows.push(line);
  }
  return rows.join("\n");
}

console.log(JSON.stringify({
  model: "Deflection-LUT fast-path smoke sample",
  units: "G = c = 4 pi epsilon_0 = 1",
  params,
  base: { width: baseW, height: baseH },
  matchDirect: { maxByteDiff: maxDiff, meanByteDiff: Number(meanDiff.toFixed(4)) },
  upsample: { width: hiW, height: hiH, centerLuminance: Number(hiCenter.toFixed(3)), peakLuminance: Number(hiPeak.toFixed(3)) },
  azimuthRotate: {
    centerLuminance: Number(rotCenter.toFixed(3)),
    peakLuminance: Number(rotPeak.toFixed(3)),
    skyTotalByteDelta: skyMoved,
  },
  discRedshift,
  plungeRedshift,
  zeroTorque,
  photonRing: lut.photonRing,
  counts: lut.counts,
}, null, 2));

console.log(`\nLUT upsample ${hiW}x${hiH} (shadow dark center, bright ring):\n`);
console.log(ascii(hi.buffer, hiW, hiH));

// Hard assertions so the runner exits non-zero on regression.
const problems = [];
if (maxDiff > 1) problems.push(`LUT base shade diverges from direct render (max byte diff ${maxDiff})`);
if (hiCenter > 0.05) problems.push(`upsampled shadow center not dark (luminance ${hiCenter.toFixed(3)})`);
if (hiPeak < 0.25) problems.push(`upsampled photon ring not bright (peak ${hiPeak.toFixed(3)})`);
if (Math.abs(rotCenter - hiCenter) > 0.05 && rotCenter > 0.05) problems.push("azimuth rotation disturbed the shadow center");
if (skyMoved === 0) problems.push("azimuth rotation did not move the lensed starfield");
if (gN && !(gMin < 1 && gMax > 1)) problems.push(`disc redshift range did not straddle g=1 (g in [${gMin.toFixed(3)}, ${gMax.toFixed(3)}]) — Doppler asymmetry missing`);
if (!pInside) problems.push("plunging-region disc produced no inside-ISCO crossings — test no longer exercises the plunging path");
if (pBad) problems.push(`plunging-region redshift produced ${pBad} non-finite/non-positive g values inside the ISCO`);
if (pInside && !(pgMin < 1 && pgMax > 1)) problems.push(`inside-ISCO redshift range did not straddle g=1 (g in [${pgMin.toFixed(3)}, ${pgMax.toFixed(3)}])`);
if (fluxPlungePinned !== 0) problems.push(`zero-torque boundary not at ISCO: flux inside the ISCO is ${fluxPlungePinned} (expected 0)`);
if (!(fluxPlungeUnpinned > 0)) problems.push("default (innerR-cutoff) flux inside ISCO was not positive — torqueRadius option is not actually changing behavior");
if (!(fluxOuterPinned > 0)) problems.push("flux just outside the ISCO was not positive — bright inner edge is missing");
if (problems.length) {
  console.error("\nFAIL:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("\nOK: LUT matches direct render, upsamples coherently, and rotates azimuth cheaply.");
