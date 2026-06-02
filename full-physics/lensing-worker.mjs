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
  makeCameraRay,
  photonRingSamples,
  traceCameraRays,
  tracePhotonRay,
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
  return shadeSample(params, {
    captured,
    skyTheta: fs.theta,
    skyPhi: fs.phi,
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
  return { ring, rPhoton, geom: { rPhoton, innerR, outerR } };
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
    skyTheta[cell] = Number.isFinite(fs.theta) ? fs.theta : Math.PI / 2;
    skyPhi[cell] = (Number.isFinite(fs.phi) ? fs.phi : 0) - camPhi0;
    if (disc) {
      const hit = estimateEquatorialDiscHit(trace, { innerR: geom.innerR, outerR: geom.outerR });
      if (hit.hit) {
        discHit[cell] = 1;
        discR[cell] = hit.r;
        discPhi[cell] = hit.phi - camPhi0;
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
    base: { capture, skyTheta, skyPhi, ringGlow: ringGlowArr, discHit, discR, discPhi },
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
      // Blend the crossing point in Cartesian to dodge azimuth wraparound.
      let dx = 0, dy = 0, dw = 0;
      const accDisc = (i, w) => {
        if (!b.discHit[i]) return;
        const r = b.discR[i];
        const ph = b.discPhi[i] + camPhi;
        dx += w * r * Math.cos(ph);
        dy += w * r * Math.sin(ph);
        dw += w;
      };
      accDisc(i00, w00); accDisc(i10, w10); accDisc(i01, w01); accDisc(i11, w11);
      if (dw > 0) {
        dx /= dw; dy /= dw;
        discHit = { hit: true, r: Math.hypot(dx, dy), phi: Math.atan2(dy, dx) };
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
