/*
 * Smoke runner for the add-only lensing renderer (Phase 6, P6.1).
 *
 * Renders a small image off the benchmarked ray-tracing / radiation modules
 * and prints: ray-capture counts, the photon-ring radius, a few sampled
 * pixels, and an ASCII luminance preview so the shadow + ring + disc are
 * visible without a browser.
 *
 *   node .\full-physics\run-lensing-sample.mjs
 *
 * Units: G = c = 4 pi epsilon_0 = 1.
 */

import { renderLensingImage } from "./lensing-worker.mjs";

const params = {
  M: 1.5,
  Q: 0.22,
  a: 0.6, // moderate spin keeps the smoke shadow legible; high spin makes it D-shaped
  B: 0.4,
};

const camera = {
  r: 26,
  theta: Math.PI / 2 + 0.32, // slight inclination off the equator
  phi: 0.0,
  // Wide enough that the shadow (photon-ring radius ~16 deg here) sits inside
  // the frame with sky/disc around it, instead of overflowing the viewport.
  fovY: Math.PI / 2.5,
  localEnergy: 1,
};

const disc = {
  accretionRate: 0.08,
  outerR: 18,
  spectralIndex: 0.72,
  frequency: 1.4,
  exposure: 150,
};

// Small grid keeps the adaptive ray integration fast for a CLI smoke test.
const width = 40;
const height = 24;

const image = renderLensingImage(params, camera, {
  width,
  height,
  disc,
  targetAffine: 90,
  recordEvery: 5,
  escapeRadius: 70,
  debugStatus: true,
});

function luminance(idx) {
  const r = image.buffer[idx] / 255;
  const g = image.buffer[idx + 1] / 255;
  const b = image.buffer[idx + 2] / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const RAMP = " .:-=+*#%@";
const rows = [];
for (let y = 0; y < height; y++) {
  let line = "";
  for (let x = 0; x < width; x++) {
    const l = luminance((y * width + x) * 4);
    const k = Math.min(RAMP.length - 1, Math.max(0, Math.round(l * (RAMP.length - 1))));
    line += RAMP[k];
  }
  rows.push(line);
}

const centerIdx = ((Math.floor(height / 2)) * width + Math.floor(width / 2)) * 4;
const samplePixel = (x, y) => {
  const idx = (y * width + x) * 4;
  return { x, y, r: image.buffer[idx], g: image.buffer[idx + 1], b: image.buffer[idx + 2] };
};

console.log(JSON.stringify({
  model: "Gravitational-lensing renderer smoke sample",
  units: "G = c = 4 pi epsilon_0 = 1",
  params,
  camera,
  image: { width: image.width, height: image.height },
  rayCounts: image.counts,
  photonRing: image.photonRing,
  centerPixel: {
    r: image.buffer[centerIdx],
    g: image.buffer[centerIdx + 1],
    b: image.buffer[centerIdx + 2],
  },
  samples: [
    samplePixel(0, 0),
    samplePixel(Math.floor(width / 2), Math.floor(height / 2)),
    samplePixel(width - 1, height - 1),
  ],
}, null, 2));

console.log("\nASCII luminance preview (shadow = dark, ring/disc = bright):\n");
console.log(rows.join("\n"));

// Class map is the real diagnostic: shadow vs disc vs photon ring vs sky are
// indistinguishable by luminance alone (shadow and empty sky are both dark).
const CLASS_GLYPH = [" ", "#", "o", "+"]; // 0 sky, 1 shadow, 2 disc, 3 ring
const classRows = [];
for (let y = 0; y < height; y++) {
  let line = "";
  for (let x = 0; x < width; x++) {
    line += CLASS_GLYPH[image.statusMap[y * width + x]] ?? "?";
  }
  classRows.push(line);
}
console.log("\nClass map ( # shadow · o disc · + photon ring · space sky ):\n");
console.log(classRows.join("\n"));
