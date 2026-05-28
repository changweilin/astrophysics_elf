/*
 * Add-only ray-tracing preparation utilities.
 *
 * These helpers generate null geodesic camera rays in Boyer-Lindquist
 * coordinates, integrate them with the existing adaptive Hamiltonian stepper,
 * and provide simple redshift/Doppler and photon-ring diagnostics for future
 * rendering work.
 */

import {
  clamp,
  fourVelocityFromLocal,
  horizons,
  makePhotonState,
  sanitizeParams,
  zamoFrame,
} from "./kn-full-physics.mjs";
import {
  integrateAdaptive,
} from "./adaptive-integrator.mjs";
import {
  findPhotonCircularOrbit,
} from "./orbit-diagnostics.mjs";

const EPS = 1e-12;

function normalize3(vector) {
  const n = Math.hypot(vector[0], vector[1], vector[2]);
  if (n <= EPS) throw new Error("Cannot normalize a zero vector.");
  return vector.map((value) => value / n);
}

function dotCovCon(covector, vector) {
  return covector.reduce((sum, value, i) => sum + value * vector[i], 0);
}

function photonCovector(photonState) {
  if (Array.isArray(photonState.covariantMomentum)) return photonState.covariantMomentum;
  if (Array.isArray(photonState.kCov)) return photonState.kCov;
  if (Number.isFinite(photonState.Pt)) {
    return [photonState.Pt, photonState.Pr, photonState.Ptheta, photonState.Pphi];
  }
  throw new Error("Photon state must provide Pt/Pr/Ptheta/Pphi or a covariant momentum array.");
}

export function localObserverFourVelocity(params, position = {}, localVelocity = null) {
  const r = position.r;
  const theta = position.theta ?? Math.PI / 2;
  if (localVelocity) return fourVelocityFromLocal(params, r, theta, localVelocity);
  return zamoFrame(params, r, theta).eT;
}

export function observedFrequency(params, photonState, observer = {}) {
  const kCov = photonCovector(photonState);
  const u = observer.fourVelocity ?? localObserverFourVelocity(
    params,
    observer.position ?? photonState,
    observer.localVelocity ?? null,
  );
  return -dotCovCon(kCov, u);
}

export function redshiftFactor(params, photonState, emitter = {}, observer = {}) {
  const emitted = observedFrequency(params, photonState, emitter);
  const observed = observedFrequency(params, photonState, observer);
  return {
    g: observed / Math.max(emitted, EPS),
    emittedFrequency: emitted,
    observedFrequency: observed,
    redshiftZ: emitted / Math.max(observed, EPS) - 1,
  };
}

export function dopplerBoost(gFactor, spectralIndex = 0) {
  return gFactor ** (3 + spectralIndex);
}

export function cameraSampleToLocalDirection(sample = {}, camera = {}, options = {}) {
  const width = Math.max(1, options.width ?? camera.width ?? 1);
  const height = Math.max(1, options.height ?? camera.height ?? 1);
  const fovY = options.fovY ?? camera.fovY ?? Math.PI / 5;
  const aspect = options.aspect ?? width / height;
  const x = Number.isFinite(sample.x)
    ? sample.x
    : ((sample.pixelX ?? 0) + 0.5) / width * 2 - 1;
  const y = Number.isFinite(sample.y)
    ? sample.y
    : 1 - ((sample.pixelY ?? 0) + 0.5) / height * 2;
  const halfY = Math.tan(fovY / 2);
  const screenX = x * halfY * aspect;
  const screenY = y * halfY;
  const roll = options.roll ?? camera.roll ?? 0;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const rolledPhi = screenX * cr - screenY * sr;
  const rolledTheta = screenX * sr + screenY * cr;
  const radialSign = options.radialSign ?? camera.radialSign ?? -1;
  return normalize3([radialSign, rolledTheta, rolledPhi]);
}

export function makeCameraRay(params = {}, camera = {}, sample = {}, options = {}) {
  const p = sanitizeParams(params);
  const r = camera.r ?? 24;
  const theta = clamp(camera.theta ?? Math.PI / 2, 1e-7, Math.PI - 1e-7);
  const phi = camera.phi ?? 0;
  const direction = sample.direction ?? cameraSampleToLocalDirection(sample, camera, options);
  const state = makePhotonState(p, {
    name: sample.name ?? `ray-${sample.pixelX ?? "x"}-${sample.pixelY ?? "y"}`,
    r,
    theta,
    phi,
    direction,
    localEnergy: sample.localEnergy ?? options.localEnergy ?? camera.localEnergy ?? 1,
  });
  return {
    pixelX: sample.pixelX,
    pixelY: sample.pixelY,
    sampleX: sample.x,
    sampleY: sample.y,
    localDirection: direction,
    state,
  };
}

export function makeCameraRayGrid(params = {}, camera = {}, options = {}) {
  const width = Math.max(1, options.width ?? camera.width ?? 8);
  const height = Math.max(1, options.height ?? camera.height ?? 8);
  const rays = [];
  for (let pixelY = 0; pixelY < height; pixelY++) {
    for (let pixelX = 0; pixelX < width; pixelX++) {
      rays.push(makeCameraRay(params, camera, { pixelX, pixelY }, { ...options, width, height }));
    }
  }
  return {
    width,
    height,
    camera: {
      r: camera.r ?? 24,
      theta: camera.theta ?? Math.PI / 2,
      phi: camera.phi ?? 0,
      fovY: options.fovY ?? camera.fovY ?? Math.PI / 5,
    },
    rays,
  };
}

export function classifyRayResult(params, result, options = {}) {
  const p = sanitizeParams(params);
  const h = horizons(p);
  const escapeRadius = options.escapeRadius ?? 120;
  const finalR = result.finalState?.r;
  const eventTypes = new Set((result.events ?? []).map((event) => event.type));
  let status = "active";
  if (eventTypes.has("captured") || eventTypes.has("capture")) status = "captured";
  if (!h.naked && Number.isFinite(finalR) && finalR <= h.rPlus + (options.horizonBuffer ?? 1e-3)) status = "captured";
  if (Number.isFinite(finalR) && finalR >= escapeRadius) status = "escaped";
  if (eventTypes.has("integration-failed")) status = "integration-failed";
  return {
    status,
    finalR,
    crossedHorizon: status === "captured",
    escaped: status === "escaped",
    eventTypes: [...eventTypes],
  };
}

export function tracePhotonRay(params = {}, ray, options = {}) {
  const state = ray.state ?? ray;
  const result = integrateAdaptive(params, state, {
    targetAffine: options.targetAffine ?? 60,
    initialStep: options.initialStep ?? 0.04,
    minStep: options.minStep ?? 1e-5,
    maxStep: options.maxStep ?? 0.08,
    absoluteTolerance: options.absoluteTolerance ?? 1e-9,
    relativeTolerance: options.relativeTolerance ?? 1e-8,
    recordEvery: options.recordEvery ?? 40,
    escapeRadius: options.escapeRadius ?? 120,
    stopAtHorizon: options.stopAtHorizon ?? true,
    horizonBuffer: options.horizonBuffer ?? 1e-3,
  });
  return {
    pixelX: ray.pixelX,
    pixelY: ray.pixelY,
    localDirection: ray.localDirection,
    result,
    classification: classifyRayResult(params, result, options),
  };
}

export function traceCameraRays(params = {}, camera = {}, options = {}) {
  const grid = makeCameraRayGrid(params, camera, options);
  const rays = options.maxRays
    ? grid.rays.slice(0, Math.max(0, options.maxRays))
    : grid.rays;
  const traced = rays.map((ray) => tracePhotonRay(params, ray, options));
  const counts = traced.reduce((acc, item) => {
    const status = item.classification.status;
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    width: grid.width,
    height: grid.height,
    camera: grid.camera,
    traced,
    counts,
  };
}

export function estimateEquatorialDiscHit(trace, disc = {}) {
  const frames = trace.result?.frames ?? trace.frames ?? [];
  const innerR = disc.innerR ?? 4;
  const outerR = disc.outerR ?? 30;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const next = frames[i];
    const prevOffset = prev.theta - Math.PI / 2;
    const nextOffset = next.theta - Math.PI / 2;
    if (prevOffset === 0 || prevOffset * nextOffset <= 0) {
      const fraction = Math.abs(prevOffset) /
        Math.max(Math.abs(prevOffset) + Math.abs(nextOffset), EPS);
      const r = prev.r + (next.r - prev.r) * fraction;
      if (r >= innerR && r <= outerR) {
        return {
          hit: true,
          r,
          phi: prev.phi + (next.phi - prev.phi) * fraction,
          affine: prev.affine + (next.affine - prev.affine) * fraction,
          frameIndex: i,
        };
      }
    }
  }
  return { hit: false };
}

export function photonRingSamples(params = {}, options = {}) {
  const p = sanitizeParams(params);
  const count = Math.max(1, options.count ?? 64);
  const cameraR = options.cameraR ?? 80;
  const prograde = findPhotonCircularOrbit(p, {
    prograde: true,
    samples: options.samples ?? 260,
    rMax: options.rMax ?? 30 * p.M,
  });
  const retrograde = findPhotonCircularOrbit(p, {
    prograde: false,
    samples: options.samples ?? 260,
    rMax: options.rMax ?? 30 * p.M,
  });
  const impactRadius = 0.5 * (
    Math.abs(prograde.impactParameter) + Math.abs(retrograde.impactParameter)
  );
  const angularRadius = Math.atan2(impactRadius, cameraR);
  const samples = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    samples.push({
      index: i,
      angle,
      screenX: angularRadius * Math.cos(angle),
      screenY: angularRadius * Math.sin(angle),
      impactParameter: impactRadius,
    });
  }
  return {
    params: p,
    cameraR,
    angularRadius,
    angularDiameter: 2 * angularRadius,
    prograde,
    retrograde,
    samples,
  };
}
