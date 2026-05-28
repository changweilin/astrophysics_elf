import {
  boyerLindquistLikeFromCartesian,
  cartesianFromBoyerLindquist,
  equatorialCoordinateVelocity,
  integrateKerrSchildAdaptive,
  kerrSchildMetric,
  makeKerrSchildTimelikeState,
  oblateRadius,
} from "./kerr-schild-geodesics.mjs";
import {
  geometrySummary,
  horizons,
} from "./kn-full-physics.mjs";

const params = {
  M: 1.5,
  Q: 0.20,
  a: 0.82,
  B: 0.35,
};

const startR = 7.2;
const startPhi = 0.35;
const position = cartesianFromBoyerLindquist(params, startR, Math.PI / 2, startPhi);
const velocity = equatorialCoordinateVelocity(startPhi, -0.34, 0.18);

const particle = makeKerrSchildTimelikeState(params, {
  name: "ks-horizon-crossing-probe",
  kind: "probe",
  position,
  velocity,
  chargeToMass: 0.04,
});

const run = integrateKerrSchildAdaptive(params, particle, {
  targetAffine: 10.1,
  initialStep: 0.035,
  minStep: 2e-5,
  maxStep: 0.06,
  absoluteTolerance: 1e-9,
  relativeTolerance: 1e-8,
  recordEvery: 60,
  singularityCutoff: 0.22,
});

const finalBL = boyerLindquistLikeFromCartesian(
  params,
  run.finalState.x,
  run.finalState.y,
  run.finalState.z,
);
const h = horizons(params);
const finalMetric = kerrSchildMetric(params, run.finalState.x, run.finalState.y, run.finalState.z);

console.log(JSON.stringify({
  model: "Kerr-Schild horizon-crossing sample",
  units: "G = c = 4 pi epsilon_0 = 1",
  geometry: geometrySummary(params),
  start: {
    blLike: { r: startR, theta: Math.PI / 2, phi: startPhi },
    cartesian: position,
    recoveredR: oblateRadius(params, position.x, position.y, position.z),
    coordinateVelocity: velocity,
  },
  run: {
    affine: run.affine,
    acceptedSteps: run.acceptedSteps,
    rejectedSteps: run.rejectedSteps,
    crossedOuterHorizon: run.crossedOuterHorizon,
    crossedInnerHorizon: run.crossedInnerHorizon,
    finalHamiltonian: run.finalHamiltonian,
    hamiltonianDrift: run.hamiltonianDrift,
    events: run.events,
    frames: run.frames,
  },
  final: {
    blLike: finalBL,
    insideOuterHorizon: !h.naked && finalBL.r < h.rPlus,
    insideInnerHorizon: !h.naked && finalBL.r < h.rMinus,
    metricH: finalMetric.H,
    determinantNote: "Kerr-Schild form remains regular at r+; no Boyer-Lindquist horizon guard is used.",
  },
}, null, 2));
