/*
 * Add-only physics benchmarks for the standalone Kerr-Newman core.
 *
 * These checks are intentionally executable and deterministic so future
 * physics upgrades can prove they preserve known limits and invariants.
 */

import {
  benchmarkSchwarzschild,
  findISCO,
  findPhotonCircularOrbit,
  solveCircularMassiveOrbit,
} from "./orbit-diagnostics.mjs";
import {
  hamiltonian,
  horizons,
  iscoRadiusKerrApprox,
  makeMassiveState,
  photonOrbitRadiusKerrApprox,
  vectorPotential,
} from "./kn-full-physics.mjs";
import {
  integrateAdaptive,
} from "./adaptive-integrator.mjs";
import {
  boyerLindquistLikeFromCartesian,
  cartesianFromBoyerLindquist,
  equatorialCoordinateVelocity,
  integrateKerrSchildAdaptive,
  makeKerrSchildTimelikeState,
} from "./kerr-schild-geodesics.mjs";
import {
  binaryInspiralProfile,
  chirpMassKg,
  symmetricMassRatio,
} from "./binary-inspiral.mjs";

export const DEFAULT_BENCHMARK_THRESHOLDS = Object.freeze({
  schwarzschildISCORelative: 1e-5,
  schwarzschildPhotonRelative: 1e-6,
  kerrISCORelative: 5e-5,
  kerrPhotonRelative: 5e-5,
  rnHorizonAbsolute: 1e-12,
  rnHamiltonianAbsolute: 1e-10,
  rnCanonicalShiftAbsolute: 1e-10,
  circularGradientAbsolute: 1e-6,
  circularHamiltonianAbsolute: 1e-9,
  adaptiveHamiltonianDriftAbsolute: 1e-7,
  adaptiveEnergyDriftAbsolute: 1e-12,
  adaptiveAngularMomentumDriftAbsolute: 1e-12,
  kerrSchildHamiltonianDriftAbsolute: 1e-6,
  inspiralChirpMassRelative: 1e-12,
  inspiralOrbitConsistencyRelative: 1e-9,
});

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), Number.EPSILON);
}

function makeToleranceCheck(name, actual, expected, tolerance, mode = "absolute", details = {}) {
  const error = mode === "relative"
    ? relativeError(actual, expected)
    : Math.abs(actual - expected);
  return {
    name,
    actual,
    expected,
    tolerance,
    mode,
    error,
    pass: Number.isFinite(actual) && Number.isFinite(expected) && error <= tolerance,
    ...details,
  };
}

function makeBooleanCheck(name, pass, details = {}) {
  return {
    name,
    pass: Boolean(pass),
    ...details,
  };
}

function summarizeCase(name, checks, measurements = {}) {
  return {
    name,
    pass: checks.every((check) => check.pass),
    checks,
    measurements,
  };
}

export function benchmarkSchwarzschildLimits(thresholds = DEFAULT_BENCHMARK_THRESHOLDS) {
  const result = benchmarkSchwarzschild(1);
  return summarizeCase("Schwarzschild analytic limits", [
    makeToleranceCheck(
      "ISCO radius equals 6M",
      result.numericISCO,
      result.expectedISCO,
      thresholds.schwarzschildISCORelative,
      "relative",
    ),
    makeToleranceCheck(
      "Photon circular orbit equals 3M",
      result.numericPhotonOrbit,
      result.expectedPhotonOrbit,
      thresholds.schwarzschildPhotonRelative,
      "relative",
    ),
  ], result);
}

export function benchmarkKerrSanity(thresholds = DEFAULT_BENCHMARK_THRESHOLDS) {
  const params = { M: 1, Q: 0, a: 0.5 };
  const progradeISCO = findISCO(params, { prograde: true, rMax: 30, samples: 220 });
  const retrogradeISCO = findISCO(params, { prograde: false, rMax: 30, samples: 220 });
  const progradePhoton = findPhotonCircularOrbit(params, { prograde: true, rMax: 20, samples: 260 });
  const retrogradePhoton = findPhotonCircularOrbit(params, { prograde: false, rMax: 20, samples: 260 });
  const expectedProgradeISCO = iscoRadiusKerrApprox(params, true);
  const expectedRetrogradeISCO = iscoRadiusKerrApprox(params, false);
  const expectedProgradePhoton = photonOrbitRadiusKerrApprox(params, true);
  const expectedRetrogradePhoton = photonOrbitRadiusKerrApprox(params, false);

  return summarizeCase("Kerr prograde/retrograde sanity", [
    makeBooleanCheck("Prograde ISCO converged", progradeISCO.found, progradeISCO),
    makeBooleanCheck("Retrograde ISCO converged", retrogradeISCO.found, retrogradeISCO),
    makeToleranceCheck(
      "Prograde ISCO matches Kerr analytic limit",
      progradeISCO.rISCO,
      expectedProgradeISCO,
      thresholds.kerrISCORelative,
      "relative",
    ),
    makeToleranceCheck(
      "Retrograde ISCO matches Kerr analytic limit",
      retrogradeISCO.rISCO,
      expectedRetrogradeISCO,
      thresholds.kerrISCORelative,
      "relative",
    ),
    makeBooleanCheck(
      "Spin ordering is prograde < Schwarzschild < retrograde",
      progradeISCO.rISCO < 6 && 6 < retrogradeISCO.rISCO,
      {
        progradeISCO: progradeISCO.rISCO,
        schwarzschildISCO: 6,
        retrogradeISCO: retrogradeISCO.rISCO,
      },
    ),
    makeToleranceCheck(
      "Prograde photon orbit matches Kerr analytic limit",
      progradePhoton.rPhoton,
      expectedProgradePhoton,
      thresholds.kerrPhotonRelative,
      "relative",
    ),
    makeToleranceCheck(
      "Retrograde photon orbit matches Kerr analytic limit",
      retrogradePhoton.rPhoton,
      expectedRetrogradePhoton,
      thresholds.kerrPhotonRelative,
      "relative",
    ),
  ], {
    params,
    progradeISCO,
    retrogradeISCO,
    progradePhoton,
    retrogradePhoton,
    expectedProgradeISCO,
    expectedRetrogradeISCO,
    expectedProgradePhoton,
    expectedRetrogradePhoton,
  });
}

export function benchmarkReissnerNordstromCoupling(thresholds = DEFAULT_BENCHMARK_THRESHOLDS) {
  const params = { M: 1, Q: 0.6, a: 0 };
  const h = horizons(params);
  const expectedRoot = Math.sqrt(params.M * params.M - params.Q * params.Q);
  const expectedRPlus = params.M + expectedRoot;
  const expectedRMinus = params.M - expectedRoot;
  const r = 8;
  const theta = Math.PI / 2;
  const velocity = [0, 0, 0.22];
  const neutral = makeMassiveState(params, { r, theta, velocity, chargeToMass: 0 });
  const charged = makeMassiveState(params, { r, theta, velocity, chargeToMass: 0.4 });
  const potential = vectorPotential(params, r, theta);
  const expectedPtShift = charged.chargeToMass * potential[0];
  const expectedPphiShift = charged.chargeToMass * potential[3];

  return summarizeCase("Reissner-Nordstrom horizon and charge coupling", [
    makeToleranceCheck("Outer horizon matches RN analytic radius", h.rPlus, expectedRPlus, thresholds.rnHorizonAbsolute),
    makeToleranceCheck("Inner horizon matches RN analytic radius", h.rMinus, expectedRMinus, thresholds.rnHorizonAbsolute),
    makeToleranceCheck("Neutral massive Hamiltonian is -1/2", hamiltonian(params, neutral), -0.5, thresholds.rnHamiltonianAbsolute),
    makeToleranceCheck("Charged massive Hamiltonian is -1/2", hamiltonian(params, charged), -0.5, thresholds.rnHamiltonianAbsolute),
    makeToleranceCheck(
      "Canonical Pt shifts by q A_t",
      charged.Pt - neutral.Pt,
      expectedPtShift,
      thresholds.rnCanonicalShiftAbsolute,
    ),
    makeToleranceCheck(
      "Canonical Pphi shifts by q A_phi",
      charged.Pphi - neutral.Pphi,
      expectedPphiShift,
      thresholds.rnCanonicalShiftAbsolute,
    ),
  ], {
    params,
    horizons: h,
    potential,
    neutral: { Pt: neutral.Pt, Pphi: neutral.Pphi },
    charged: { Pt: charged.Pt, Pphi: charged.Pphi },
  });
}

export function benchmarkKerrNewmanCircularAndAdaptive(thresholds = DEFAULT_BENCHMARK_THRESHOLDS) {
  const params = { M: 1.5, Q: 0.35, a: 1.02, B: 0.5 };
  const circular = solveCircularMassiveOrbit(params, {
    r: 8.2,
    prograde: true,
    chargeToMass: 0.12,
  });
  const probe = makeMassiveState(params, {
    name: "benchmark-adaptive-probe",
    kind: "probe",
    r: 7.2,
    theta: Math.PI / 2,
    velocity: [-0.035, 0, 0.42],
    chargeToMass: 0.12,
    radius: 0.006,
    binding: 60,
  });
  const initialEnergy = -probe.Pt;
  const initialAngularMomentum = probe.Pphi;
  const run = integrateAdaptive(params, probe, {
    targetAffine: 20,
    initialStep: 0.04,
    minStep: 1e-5,
    maxStep: 0.08,
    absoluteTolerance: 1e-10,
    relativeTolerance: 1e-9,
    recordEvery: 80,
    escapeRadius: 90,
  });
  const finalEnergy = -run.finalState.Pt;
  const finalAngularMomentum = run.finalState.Pphi;

  return summarizeCase("Kerr-Newman circular convergence and Hamiltonian drift", [
    makeBooleanCheck("Circular orbit solve is stable", circular.stable, {
      radialSecondDerivative: circular.radialSecondDerivative,
    }),
    makeToleranceCheck(
      "Circular radial Hamiltonian gradient converged",
      circular.radialGradient,
      0,
      thresholds.circularGradientAbsolute,
    ),
    makeToleranceCheck(
      "Circular massive Hamiltonian is -1/2",
      circular.hamiltonian,
      -0.5,
      thresholds.circularHamiltonianAbsolute,
    ),
    makeBooleanCheck("Adaptive integration accepted at least one step", run.acceptedSteps > 0, {
      acceptedSteps: run.acceptedSteps,
      rejectedSteps: run.rejectedSteps,
    }),
    makeToleranceCheck(
      "Adaptive Hamiltonian drift remains bounded",
      run.hamiltonianDrift,
      0,
      thresholds.adaptiveHamiltonianDriftAbsolute,
    ),
    makeToleranceCheck(
      "Energy is conserved",
      finalEnergy - initialEnergy,
      0,
      thresholds.adaptiveEnergyDriftAbsolute,
    ),
    makeToleranceCheck(
      "Angular momentum is conserved",
      finalAngularMomentum - initialAngularMomentum,
      0,
      thresholds.adaptiveAngularMomentumDriftAbsolute,
    ),
  ], {
    params,
    circular: {
      r: circular.r,
      localAzimuthalVelocity: circular.localAzimuthalVelocity,
      energy: circular.energy,
      angularMomentumZ: circular.angularMomentumZ,
      radialGradient: circular.radialGradient,
      radialSecondDerivative: circular.radialSecondDerivative,
      hamiltonian: circular.hamiltonian,
      stable: circular.stable,
    },
    adaptive: {
      affine: run.affine,
      acceptedSteps: run.acceptedSteps,
      rejectedSteps: run.rejectedSteps,
      hamiltonianDrift: run.hamiltonianDrift,
      energyDrift: finalEnergy - initialEnergy,
      angularMomentumDrift: finalAngularMomentum - initialAngularMomentum,
      events: run.events,
    },
  });
}

export function benchmarkKerrSchildHorizonCrossing(thresholds = DEFAULT_BENCHMARK_THRESHOLDS) {
  const params = { M: 1.5, Q: 0.2, a: 0.82, B: 0.35 };
  const startR = 7.2;
  const startPhi = 0.35;
  const position = cartesianFromBoyerLindquist(params, startR, Math.PI / 2, startPhi);
  const velocity = equatorialCoordinateVelocity(startPhi, -0.34, 0.18);
  const particle = makeKerrSchildTimelikeState(params, {
    name: "benchmark-ks-horizon-crossing-probe",
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
  const h = horizons(params);
  const finalBL = boyerLindquistLikeFromCartesian(
    params,
    run.finalState.x,
    run.finalState.y,
    run.finalState.z,
  );
  const failureEvents = run.events.filter((event) => event.type === "integration-failed");

  return summarizeCase("Kerr-Schild horizon crossing", [
    makeBooleanCheck("Trajectory crossed the outer horizon", run.crossedOuterHorizon, {
      rPlus: h.rPlus,
      finalR: finalBL.r,
      events: run.events,
    }),
    makeBooleanCheck("Final point is inside r+", finalBL.r < h.rPlus, {
      rPlus: h.rPlus,
      finalR: finalBL.r,
    }),
    makeBooleanCheck("No coordinate or integration failure event", failureEvents.length === 0, {
      failureEvents,
    }),
    makeToleranceCheck(
      "Kerr-Schild Hamiltonian drift remains bounded",
      run.hamiltonianDrift,
      0,
      thresholds.kerrSchildHamiltonianDriftAbsolute,
    ),
  ], {
    params,
    horizons: h,
    start: { r: startR, phi: startPhi, position, velocity },
    finalBL,
    affine: run.affine,
    acceptedSteps: run.acceptedSteps,
    rejectedSteps: run.rejectedSteps,
    crossedOuterHorizon: run.crossedOuterHorizon,
    crossedInnerHorizon: run.crossedInnerHorizon,
    hamiltonianDrift: run.hamiltonianDrift,
    events: run.events,
  });
}

export function benchmarkBinaryInspiral(thresholds = DEFAULT_BENCHMARK_THRESHOLDS) {
  const SOLAR_MASS_KG = 1.98847e30;
  // Equal-mass chirp mass has the closed form Mc = m / 2^(1/5) for component
  // mass m, equivalently total M / 2^(6/5).
  const mEqual = 30 * SOLAR_MASS_KG;
  const equalChirp = chirpMassKg(mEqual, mEqual);
  const expectedEqualChirp = mEqual / Math.pow(2, 0.2);

  // GW150914-like masses entering the LIGO band at 35 Hz: a handful of orbits.
  const profile = binaryInspiralProfile({
    m1: 36,
    m2: 29,
    separationRg: 10,
    bandLowHz: 35,
  });
  const aOrbits = profile.atSeparation.orbitsToMerge;
  const aCycles = profile.atSeparation.gwCyclesToMerge;

  // Orbit count must scale as 1 / eta: unequal masses do strictly more orbits
  // at the same separation in gravitational radii.
  const equalProfile = binaryInspiralProfile({ m1: 30, m2: 30, separationRg: 10 });
  const skewProfile = binaryInspiralProfile({ m1: 54, m2: 6, separationRg: 10 });
  const etaRatio = symmetricMassRatio(30, 30) / symmetricMassRatio(54, 6);
  const orbitRatio = skewProfile.atSeparation.orbitsToMerge /
    equalProfile.atSeparation.orbitsToMerge;

  return summarizeCase("Binary inspiral (Peters + leading PN phasing)", [
    makeToleranceCheck(
      "Equal-mass chirp mass equals M / 2^(1/5)",
      equalChirp,
      expectedEqualChirp,
      thresholds.inspiralChirpMassRelative,
      "relative",
    ),
    makeToleranceCheck(
      "Orbit count is half the GW cycle count",
      aOrbits,
      aCycles / 2,
      thresholds.inspiralOrbitConsistencyRelative,
      "relative",
    ),
    makeToleranceCheck(
      "Orbit count scales as 1 / eta with mass ratio",
      orbitRatio,
      etaRatio,
      thresholds.inspiralOrbitConsistencyRelative,
      "relative",
    ),
    makeBooleanCheck(
      "GW150914-like band orbit count is order ten (1-100)",
      profile.band.inBand && profile.band.orbits > 1 && profile.band.orbits < 100,
      { bandOrbits: profile.band.orbits, bandCycles: profile.band.gwCycles },
    ),
    makeBooleanCheck(
      "Supermassive binary is out of a ground-detector band (no negative duration)",
      (() => {
        const smbh = binaryInspiralProfile({ m1: 1e6, m2: 10, bandLowHz: 35 });
        return smbh.band.inBand === false && smbh.band.orbits === 0 &&
          smbh.band.durationSeconds === 0;
      })(),
    ),
    makeBooleanCheck(
      "Equal mass has the minimum orbit count factor (1/eta = 4)",
      Math.abs(equalProfile.masses.orbitCountFactor - 4) < 1e-9 &&
        skewProfile.masses.orbitCountFactor > 4,
      {
        equalFactor: equalProfile.masses.orbitCountFactor,
        skewFactor: skewProfile.masses.orbitCountFactor,
      },
    ),
  ], {
    equalChirp,
    expectedEqualChirp,
    gw150914: {
      atSeparation: profile.atSeparation,
      band: profile.band,
      chirpSolar: profile.masses.chirpSolar,
    },
    orbitRatio,
    etaRatio,
  });
}

export function runPhysicsBenchmarks(options = {}) {
  const thresholds = {
    ...DEFAULT_BENCHMARK_THRESHOLDS,
    ...(options.thresholds ?? {}),
  };
  const cases = [
    benchmarkSchwarzschildLimits(thresholds),
    benchmarkKerrSanity(thresholds),
    benchmarkReissnerNordstromCoupling(thresholds),
    benchmarkKerrNewmanCircularAndAdaptive(thresholds),
    benchmarkKerrSchildHorizonCrossing(thresholds),
    benchmarkBinaryInspiral(thresholds),
  ];
  const checks = cases.flatMap((testCase) => testCase.checks);
  const failedChecks = checks.filter((check) => !check.pass);

  return {
    ok: failedChecks.length === 0,
    totals: {
      cases: cases.length,
      checks: checks.length,
      passedChecks: checks.length - failedChecks.length,
      failedChecks: failedChecks.length,
    },
    thresholds,
    cases,
    failedChecks,
    generatedAt: new Date().toISOString(),
  };
}
