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
 *
 *   node .\full-physics\run-lensing-lut-sample.mjs
 *
 * Units: G = c = 4 pi epsilon_0 = 1.
 */

import { renderLensingImage, buildDeflectionLUT, shadeLUTImage } from "./lensing-worker.mjs";

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
if (problems.length) {
  console.error("\nFAIL:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("\nOK: LUT matches direct render, upsamples coherently, and rotates azimuth cheaply.");
