import {
  findISCO,
  findPhotonCircularOrbit,
  solveCircularMassiveOrbit,
  benchmarkSchwarzschild,
} from "./orbit-diagnostics.mjs";
import {
  makeMassiveState,
} from "./kn-full-physics.mjs";
import {
  integrateAdaptive,
} from "./adaptive-integrator.mjs";
import {
  tidalTensorDiagnostics,
} from "./tidal-tensor.mjs";

const params = {
  M: 1.5,
  Q: 0.35,
  a: 1.02,
  B: 0.5,
};

const progradeISCO = findISCO(params, {
  prograde: true,
  samples: 180,
  rMax: 45,
});
const retrogradeISCO = findISCO(params, {
  prograde: false,
  samples: 180,
  rMax: 45,
});
const chargedISCO = findISCO(params, {
  prograde: true,
  chargeToMass: 0.15,
  samples: 180,
  rMax: 45,
});

const photonPrograde = findPhotonCircularOrbit(params, {
  prograde: true,
  samples: 220,
  rMax: 35,
});
const photonRetrograde = findPhotonCircularOrbit(params, {
  prograde: false,
  samples: 220,
  rMax: 35,
});

const circularProbe = solveCircularMassiveOrbit(params, {
  r: 8.2,
  prograde: true,
  chargeToMass: 0.12,
});

const strongFieldProbe = makeMassiveState(params, {
  name: "adaptive-strong-field-probe",
  kind: "probe",
  r: 7.2,
  theta: Math.PI / 2,
  velocity: [-0.035, 0, 0.42],
  chargeToMass: 0.12,
  radius: 0.006,
  binding: 60,
});

const adaptiveRun = integrateAdaptive(params, strongFieldProbe, {
  targetAffine: 29,
  initialStep: 0.04,
  minStep: 1e-5,
  maxStep: 0.08,
  absoluteTolerance: 1e-10,
  relativeTolerance: 1e-9,
  recordEvery: 80,
  escapeRadius: 90,
});

const tidalGas = tidalTensorDiagnostics(params, {
  r: 6.4,
  theta: Math.PI / 2,
  phi: 0,
}, {
  radius: 0.58,
  binding: 0.85,
});

const tidalShip = tidalTensorDiagnostics(params, {
  r: 4.8,
  theta: Math.PI / 2,
  phi: 0,
}, {
  radius: 0.018,
  binding: 8,
  localVelocity: [0, 0, 0.35],
});

console.log(JSON.stringify({
  model: "Advanced Kerr-Newman physics models",
  units: "G = c = 4 pi epsilon_0 = 1",
  schwarzschildBenchmark: benchmarkSchwarzschild(1),
  orbitDiagnostics: {
    progradeISCO,
    retrogradeISCO,
    chargedISCO,
    photonPrograde,
    photonRetrograde,
    circularProbe: {
      r: circularProbe.r,
      chargeToMass: circularProbe.chargeToMass,
      localAzimuthalVelocity: circularProbe.localAzimuthalVelocity,
      energy: circularProbe.energy,
      angularMomentumZ: circularProbe.angularMomentumZ,
      radialGradient: circularProbe.radialGradient,
      radialSecondDerivative: circularProbe.radialSecondDerivative,
      stable: circularProbe.stable,
    },
  },
  adaptiveTrajectory: {
    affine: adaptiveRun.affine,
    acceptedSteps: adaptiveRun.acceptedSteps,
    rejectedSteps: adaptiveRun.rejectedSteps,
    finalHamiltonian: adaptiveRun.finalHamiltonian,
    hamiltonianDrift: adaptiveRun.hamiltonianDrift,
    events: adaptiveRun.events,
    frames: adaptiveRun.frames,
  },
  tidalTensor: {
    gasGiantAtR6_4: {
      eigenvalues: tidalGas.eigenvalues,
      trace: tidalGas.trace,
      spectralRadius: tidalGas.spectralRadius,
      differentialAcceleration: tidalGas.differentialAcceleration,
      normalizedStress: tidalGas.normalizedStress,
      survival: tidalGas.survival,
    },
    shipAtR4_8Moving: {
      eigenvalues: tidalShip.eigenvalues,
      trace: tidalShip.trace,
      spectralRadius: tidalShip.spectralRadius,
      differentialAcceleration: tidalShip.differentialAcceleration,
      normalizedStress: tidalShip.normalizedStress,
      survival: tidalShip.survival,
    },
  },
}, null, 2));
