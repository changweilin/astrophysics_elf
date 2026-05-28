import {
  photonRingSamples,
  redshiftFactor,
  traceCameraRays,
} from "./ray-tracing.mjs";
import {
  composeFalseColor,
  jetZoneEmission,
  renderRayRadiance,
  sampleDiskBrightnessProfile,
  synchrotronEmissivity,
} from "./radiation-models.mjs";

const params = {
  M: 1.5,
  Q: 0.22,
  a: 1.02,
  B: 0.48,
};

const camera = {
  r: 24,
  theta: Math.PI / 2 + 0.28,
  phi: 0.15,
  fovY: Math.PI / 6,
  localEnergy: 1,
};

const traced = traceCameraRays(params, camera, {
  width: 3,
  height: 3,
  targetAffine: 28,
  initialStep: 0.05,
  maxStep: 0.08,
  recordEvery: 4,
  escapeRadius: 70,
});

const disc = {
  accretionRate: 0.08,
  outerR: 32,
  spectralIndex: 0.72,
  frequency: 1.4,
};
const radiance = traced.traced.map((trace) => {
  const rendered = renderRayRadiance(params, trace, {
    disc,
    inclination: camera.theta,
    backgroundIntensity: 0.00002,
  });
  return {
    pixelX: trace.pixelX,
    pixelY: trace.pixelY,
    status: trace.classification.status,
    hit: rendered.hit,
    hitR: rendered.r,
    observedIntensity: rendered.observedIntensity,
    color: composeFalseColor(rendered.observedIntensity, {
      exposure: 160,
      temperatureTint: rendered.restFrame?.temperature ?? 0.45,
    }),
  };
});

const centerTrace = traced.traced.find((trace) => trace.pixelX === 1 && trace.pixelY === 1);
const redshift = redshiftFactor(
  params,
  centerTrace.result.finalState,
  {
    position: {
      r: Math.max(centerTrace.result.finalState.r, 3.2),
      theta: centerTrace.result.finalState.theta,
    },
    localVelocity: [0, 0, 0.25],
  },
  {
    position: {
      r: camera.r,
      theta: camera.theta,
    },
  },
);

const diskProfile = sampleDiskBrightnessProfile(params, {
  ...disc,
  count: 16,
});
const ring = photonRingSamples(params, {
  cameraR: camera.r,
  count: 16,
});
const plasmaEmission = synchrotronEmissivity({
  density: 0.001,
  poloidalB: 0.18,
  toroidalB: 0.32,
  gamma: 4.5,
  temperature: 0.9,
  opticalDepth: 0.35,
}, {
  frequency: 2.2,
  spectralIndex: 0.65,
});
const jetEmission = jetZoneEmission({
  density: 0.0007,
  poloidalB: 0.12,
  toroidalB: 0.44,
  gamma: 6.8,
  temperature: 1.3,
  opticalDepth: 0.22,
  magnetization: 18,
  kinkRisk: 0.42,
}, {
  frequency: 2.2,
  dopplerFactor: 1.8,
});

console.log(JSON.stringify({
  model: "Rendering/ray-tracing preparation sample",
  units: "G = c = 4 pi epsilon_0 = 1",
  camera,
  rayCounts: traced.counts,
  radiance,
  centerRayRedshift: redshift,
  diskProfile: {
    innerR: diskProfile.innerR,
    outerR: diskProfile.outerR,
    peak: diskProfile.peak,
    sampleCount: diskProfile.samples.length,
  },
  photonRing: {
    angularRadius: ring.angularRadius,
    angularDiameter: ring.angularDiameter,
    progradePhotonR: ring.prograde.rPhoton,
    retrogradePhotonR: ring.retrograde.rPhoton,
    sampleCount: ring.samples.length,
  },
  synchrotron: plasmaEmission,
  jetEmission,
}, null, 2));
