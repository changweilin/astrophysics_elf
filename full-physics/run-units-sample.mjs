import {
  PhysicsEngine,
} from "./physics-engine.mjs";
import {
  codeLengthToKilometers,
  codeMagneticFieldToGauss,
  codeMagneticFieldToTesla,
  codeTimeToSeconds,
  createUnitScale,
  kilometersToCodeLength,
  physicalizeGeometrySummary,
  physicalizeJetSnapshot,
  physicalizeObjectSpec,
  physicalizeObjectState,
  physicalizeTrajectoryResult,
  secondsToCodeTime,
  summarizeScale,
  teslaToCodeMagneticField,
} from "./units.mjs";

const params = {
  M: 1.5,
  Q: 0.25,
  a: 1.05,
  B: 0.45,
};

const physicalBlackHoleMassSolarMasses = 4.1e6;
const scale = createUnitScale({
  params,
  physicalMassSolarMasses: physicalBlackHoleMassSolarMasses,
});

const engine = new PhysicsEngine(params, {
  simulatorOptions: {
    stepSize: 0.015,
    escapeRadius: 90,
  },
  jetOptions: {
    zoneCount: 12,
    zMax: 60,
    dt: 0.04,
    seed: 515151,
  },
});

const geometry = engine.geometry({ position: { r: 8.5, theta: Math.PI / 2 } });
const probe = engine.spawnObject("neutralProbe", {
  name: "unit-scale-probe",
  r: 13,
  phi: 0.65,
});
const gasGiantSpec = physicalizeObjectSpec(scale, "gasGiant");
const orbit = engine.orbitDiagnostics({
  r: 8.5,
  samples: 140,
  rMax: 45,
});
const trajectory = engine.integrateTrajectory({
  name: "unit-scale-trajectory",
  kind: "probe",
  r: 9.5,
  theta: Math.PI / 2,
  phi: 0.25,
  velocity: [-0.025, 0, 0.31],
  chargeToMass: 0.04,
}, {
  targetAffine: 6,
  initialStep: 0.04,
  maxStep: 0.08,
  absoluteTolerance: 1e-10,
  relativeTolerance: 1e-9,
  recordEvery: 40,
});
const jet = engine.updateJet({
  accretionRate: 0.06,
  magneticField: params.B,
  massLoading: 0.008,
}, {
  dt: 0.04,
});

const geometrySI = physicalizeGeometrySummary(scale, geometry);
const trajectorySI = physicalizeTrajectoryResult(scale, trajectory);
const jetSI = physicalizeJetSnapshot(scale, jet);

console.log(JSON.stringify({
  model: "Geometric-to-SI unit conversion sample",
  units: "Simulation uses G = c = 4 pi epsilon_0 = 1; SI values are derived from the chosen physical black-hole mass.",
  scale: summarizeScale(scale),
  helperExamples: {
    tenThousandKilometersInCodeLength: kilometersToCodeLength(scale, 10000),
    oneCodeLengthKilometers: codeLengthToKilometers(scale, 1),
    oneCodeTimeSeconds: codeTimeToSeconds(scale, 1),
    oneSecondInCodeTime: secondsToCodeTime(scale, 1),
    codeMagneticFieldB: params.B,
    codeMagneticFieldTesla: codeMagneticFieldToTesla(scale, params.B),
    codeMagneticFieldGauss: codeMagneticFieldToGauss(scale, params.B),
    tenTeslaInCodeMagneticField: teslaToCodeMagneticField(scale, 10),
  },
  geometry: {
    code: geometry,
    si: {
      physicalParams: geometrySI.physicalParams,
      horizons: geometrySI.horizonsSI,
      keyLengths: geometrySI.lengthsSI,
      rates: geometrySI.ratesSI,
    },
  },
  objectLibrary: {
    gasGiantPhysical: gasGiantSpec.physical,
    spawnedProbe: {
      code: probe.state,
      si: physicalizeObjectState(scale, probe.state, "neutralProbe"),
      diagnostics: probe.diagnostics,
    },
  },
  orbitDiagnostics: {
    iscoProgradeCode: orbit.isco.prograde.rISCO,
    iscoProgradeKilometers: codeLengthToKilometers(scale, orbit.isco.prograde.rISCO),
    photonOrbitProgradeCode: orbit.photonOrbit.prograde.rPhoton,
    photonOrbitProgradeKilometers: codeLengthToKilometers(scale, orbit.photonOrbit.prograde.rPhoton),
    circularOrbit: {
      rCode: orbit.circularOrbit.r,
      rKilometers: codeLengthToKilometers(scale, orbit.circularOrbit.r),
      stable: orbit.circularOrbit.stable,
      radialGradient: orbit.circularOrbit.radialGradient,
    },
  },
  trajectory: {
    coordinates: trajectory.coordinates,
    affineCode: trajectory.result.affine,
    affineSeconds: trajectorySI.result.affineSeconds,
    finalRadiusCode: trajectory.finalState.r,
    finalRadiusKilometers: trajectorySI.finalStateSI.coordinates.rKilometers,
    hamiltonianDrift: trajectory.result.hamiltonianDrift,
    frameCount: trajectory.result.frames.length,
  },
  jet: {
    codeGlobal: jet.global,
    siGlobal: jetSI.globalSI,
    inputSI: jetSI.inputSI,
    baseZoneSI: jetSI.zonesSI[0],
    headZoneSI: jetSI.zonesSI[jetSI.zonesSI.length - 1],
  },
}, null, 2));
