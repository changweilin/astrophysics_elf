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
  sanitizeParams,
} from "./kn-full-physics.mjs";
import {
  dopplerBoost,
  estimateEquatorialDiscHit,
  photonRingSamples,
  traceCameraRays,
} from "./ray-tracing.mjs";
import {
  composeFalseColor,
  diskInnerRadius,
  localDiskVelocity,
  renderDiscHit,
} from "./radiation-models.mjs";

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

function tintFromTemperature(temperature) {
  // Map a rough color temperature into composeFalseColor's [0,1] tint, where
  // higher -> bluer-white, lower -> redder. Muted by design.
  return clamp(0.35 + 0.5 * Math.tanh(temperature * 2.2), 0, 1);
}

/* ---- per-ray shading --------------------------------------------------- */

function shadeRay(params, trace, camera, disc, geom, options) {
  const status = trace.classification?.status ?? "unknown";
  const rPhoton = geom.rPhoton;

  if (status === "captured" || status === "integration-failed") {
    // Inside the shadow: a deep, slightly cool dark. No ring glow here — a
    // plunging ray passes THROUGH r_photon on its way to the horizon, so adding
    // glow would light up the whole shadow. The bright ring is light that
    // orbited and escaped, so it is rendered on the escaping branch below.
    return { r: 0.020, g: 0.022, b: 0.030 };
  }

  // Escaped (or grazing) ray: start from the lensed starfield backdrop.
  const fs = trace.result?.finalState ?? {};
  let col = starfieldColor(fs.theta, fs.phi);

  // Accretion disc contribution, if a disc is configured.
  if (disc) {
    const hit = estimateEquatorialDiscHit(trace, {
      innerR: geom.innerR,
      outerR: geom.outerR,
    });
    if (hit.hit) {
      const g = discShiftApprox(params, hit, camera);
      const rendered = renderDiscHit(params, hit, {
        ...disc,
        redshiftFactor: g,
        inclination: camera.theta,
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
  }

  // Photon ring: a warm rim where rays graze the photon sphere.
  const glow = ringGlow(trace, rPhoton);
  if (glow > 0) {
    const k = 0.55 * glow; // muted amplitude
    col = {
      r: clamp(col.r + k, 0, 1),
      g: clamp(col.g + k * 0.86, 0, 1),
      b: clamp(col.b + k * 0.52, 0, 1),
    };
  }

  return col;
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

/* ---- main renderer ----------------------------------------------------- */

export function renderLensingImage(params = {}, camera = {}, options = {}) {
  const p = sanitizeParams(params);
  const width = Math.max(1, Math.floor(options.width ?? camera.width ?? 96));
  const height = Math.max(1, Math.floor(options.height ?? camera.height ?? 96));
  const disc = options.disc ?? null;

  const traceOptions = {
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

  const traced = traceCameraRays(p, camera, traceOptions);
  const ring = photonRingSamples(p, {
    cameraR: camera.r ?? 24,
    count: options.ringSamples ?? 8,
  });
  const rPhoton = Number.isFinite(ring.prograde?.rPhoton)
    ? ring.prograde.rPhoton
    : (ring.retrograde?.rPhoton ?? 3 * p.M);

  const innerR = disc ? (disc.innerR ?? diskInnerRadius(p, disc)) : 0;
  const outerR = disc ? (disc.outerR ?? innerR * 12) : 0;
  const geom = { rPhoton, innerR, outerR };

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

/* ---- Web Worker boundary (browser only; no auto-attach) ---------------- */

export function handleLensingWorkerMessage(rawMessage = {}) {
  const id = rawMessage.id;
  const type = rawMessage.type ?? rawMessage.action ?? "render-lensing";
  try {
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
