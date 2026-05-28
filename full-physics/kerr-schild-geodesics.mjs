/*
 * Horizon-penetrating Kerr-Schild geodesics for Kerr-Newman spacetime.
 *
 * Coordinates: Cartesian Kerr-Schild (t, x, y, z), units G = c = 1.
 * Metric: g_ab = eta_ab + 2 H l_a l_b
 * H = (M r^3 - Q^2 r^2 / 2) / (r^4 + a^2 z^2)
 *
 * This module is designed for trajectories that cross the outer horizon. It
 * complements the Boyer-Lindquist Hamiltonian core, whose coordinates become
 * singular at r+.
 */

import {
  clamp,
  horizons,
  sanitizeParams,
  wrapAngle,
} from "./kn-full-physics.mjs";

const KS_KEYS = ["t", "x", "y", "z", "Pt", "Px", "Py", "Pz"];
const EPS = 1e-14;
const ETA_COV = Object.freeze([
  [-1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
]);
const ETA_INV = ETA_COV;

function zeros44() {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
}

function matVec(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, i) => sum + value * vector[i], 0));
}

function dotMetric(metricMatrix, left, right) {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) value += metricMatrix[i][j] * left[i] * right[j];
  }
  return value;
}

export function oblateRadius(params, x, y, z) {
  const { a } = sanitizeParams(params);
  if (Math.abs(a) < EPS) return Math.hypot(x, y, z);
  const rho2 = x * x + y * y + z * z;
  const term = rho2 - a * a;
  const r2 = 0.5 * (term + Math.sqrt(term * term + 4 * a * a * z * z));
  return Math.sqrt(Math.max(0, r2));
}

export function cartesianFromBoyerLindquist(params, r, theta = Math.PI / 2, phi = 0) {
  const { a } = sanitizeParams(params);
  const s = Math.sin(theta);
  return {
    x: (r * Math.cos(phi) - a * Math.sin(phi)) * s,
    y: (r * Math.sin(phi) + a * Math.cos(phi)) * s,
    z: r * Math.cos(theta),
  };
}

export function boyerLindquistLikeFromCartesian(params, x, y, z) {
  const { a } = sanitizeParams(params);
  const r = oblateRadius(params, x, y, z);
  const theta = r > EPS ? Math.acos(clamp(z / r, -1, 1)) : Math.PI / 2;
  const s = Math.max(Math.sin(theta), EPS);
  const denom = Math.max((r * r + a * a) * s, EPS);
  const cosPhi = (r * x + a * y) / denom;
  const sinPhi = (r * y - a * x) / denom;
  return {
    r,
    theta,
    phi: wrapAngle(Math.atan2(sinPhi, cosPhi)),
  };
}

export function kerrSchildScalar(params, x, y, z) {
  const p = sanitizeParams(params);
  const r = oblateRadius(p, x, y, z);
  const denom = r ** 4 + p.a * p.a * z * z;
  if (denom <= EPS) {
    return { H: Infinity, r, denom };
  }
  return {
    H: (p.M * r ** 3 - 0.5 * p.Q * p.Q * r * r) / denom,
    r,
    denom,
  };
}

export function kerrSchildNullOneForm(params, x, y, z) {
  const { a } = sanitizeParams(params);
  const r = Math.max(oblateRadius(params, x, y, z), EPS);
  const denom = r * r + a * a;
  return [
    1,
    (r * x + a * y) / denom,
    (r * y - a * x) / denom,
    z / r,
  ];
}

export function kerrSchildMetric(params, x, y, z) {
  const scalar = kerrSchildScalar(params, x, y, z);
  const lCov = kerrSchildNullOneForm(params, x, y, z);
  const lCon = [-lCov[0], lCov[1], lCov[2], lCov[3]];
  const cov = zeros44();
  const inv = zeros44();
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      cov[i][j] = ETA_COV[i][j] + 2 * scalar.H * lCov[i] * lCov[j];
      inv[i][j] = ETA_INV[i][j] - 2 * scalar.H * lCon[i] * lCon[j];
    }
  }
  return {
    cov,
    inv,
    H: scalar.H,
    r: scalar.r,
    lCov,
    lCon,
  };
}

export function kerrSchildVectorPotential(params, x, y, z) {
  const { Q } = sanitizeParams(params);
  const scalar = kerrSchildScalar(params, x, y, z);
  const lCov = kerrSchildNullOneForm(params, x, y, z);
  if (!Number.isFinite(scalar.H) || scalar.r <= EPS) return [0, 0, 0, 0];
  const factor = -Q * scalar.r ** 3 / scalar.denom;
  return lCov.map((value) => factor * value);
}

export function kerrSchildHamiltonian(params, state) {
  const metric = kerrSchildMetric(params, state.x, state.y, state.z);
  const A = kerrSchildVectorPotential(params, state.x, state.y, state.z);
  const q = state.chargeToMass ?? 0;
  const P = [state.Pt, state.Px, state.Py, state.Pz];
  const pi = P.map((value, i) => value - q * A[i]);
  let value = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) value += 0.5 * metric.inv[i][j] * pi[i] * pi[j];
  }
  return value;
}

export function kerrSchildVelocity(params, state) {
  const metric = kerrSchildMetric(params, state.x, state.y, state.z);
  const A = kerrSchildVectorPotential(params, state.x, state.y, state.z);
  const q = state.chargeToMass ?? 0;
  const P = [state.Pt, state.Px, state.Py, state.Pz];
  const pi = P.map((value, i) => value - q * A[i]);
  return matVec(metric.inv, pi);
}

function partialHamiltonian(params, state, key) {
  const base = state[key];
  const h = Math.max(1e-5, Math.abs(base) * 1e-5);
  const plus = { ...state, [key]: base + h };
  const minus = { ...state, [key]: base - h };
  return (kerrSchildHamiltonian(params, plus) - kerrSchildHamiltonian(params, minus)) / (2 * h);
}

export function kerrSchildDerivatives(params, state) {
  const u = kerrSchildVelocity(params, state);
  return {
    t: u[0],
    x: u[1],
    y: u[2],
    z: u[3],
    Pt: 0,
    Px: -partialHamiltonian(params, state, "x"),
    Py: -partialHamiltonian(params, state, "y"),
    Pz: -partialHamiltonian(params, state, "z"),
  };
}

function sanitizeState(state) {
  return { ...state };
}

function addCombination(state, terms) {
  const next = { ...state };
  for (const key of KS_KEYS) {
    let value = state[key];
    for (const [scale, deriv] of terms) value += scale * deriv[key];
    next[key] = value;
  }
  return sanitizeState(next);
}

function maxScaledError(base, high, low, absoluteTolerance, relativeTolerance) {
  let worst = 0;
  for (const key of KS_KEYS) {
    const scale = absoluteTolerance + relativeTolerance * Math.max(Math.abs(base[key]), Math.abs(high[key]));
    const err = Math.abs(high[key] - low[key]) / Math.max(scale, EPS);
    if (err > worst) worst = err;
  }
  return worst;
}

export function kerrSchildRk45Pair(params, state, h) {
  const k1 = kerrSchildDerivatives(params, state);
  const k2 = kerrSchildDerivatives(params, addCombination(state, [
    [h * (1 / 5), k1],
  ]));
  const k3 = kerrSchildDerivatives(params, addCombination(state, [
    [h * (3 / 40), k1],
    [h * (9 / 40), k2],
  ]));
  const k4 = kerrSchildDerivatives(params, addCombination(state, [
    [h * (44 / 45), k1],
    [h * (-56 / 15), k2],
    [h * (32 / 9), k3],
  ]));
  const k5 = kerrSchildDerivatives(params, addCombination(state, [
    [h * (19372 / 6561), k1],
    [h * (-25360 / 2187), k2],
    [h * (64448 / 6561), k3],
    [h * (-212 / 729), k4],
  ]));
  const k6 = kerrSchildDerivatives(params, addCombination(state, [
    [h * (9017 / 3168), k1],
    [h * (-355 / 33), k2],
    [h * (46732 / 5247), k3],
    [h * (49 / 176), k4],
    [h * (-5103 / 18656), k5],
  ]));
  const high = addCombination(state, [
    [h * (35 / 384), k1],
    [h * (500 / 1113), k3],
    [h * (125 / 192), k4],
    [h * (-2187 / 6784), k5],
    [h * (11 / 84), k6],
  ]);
  const k7 = kerrSchildDerivatives(params, high);
  const low = addCombination(state, [
    [h * (5179 / 57600), k1],
    [h * (7571 / 16695), k3],
    [h * (393 / 640), k4],
    [h * (-92097 / 339200), k5],
    [h * (187 / 2100), k6],
    [h * (1 / 40), k7],
  ]);
  return { high, low };
}

export function kerrSchildAdaptiveStep(params, state, options = {}) {
  const absoluteTolerance = options.absoluteTolerance ?? 1e-9;
  const relativeTolerance = options.relativeTolerance ?? 1e-8;
  const minStep = options.minStep ?? 1e-6;
  const maxStep = options.maxStep ?? 0.1;
  const safety = options.safety ?? 0.9;
  const maxAttempts = options.maxAttempts ?? 24;
  let h = clamp(Math.abs(options.stepSize ?? 0.02), minStep, maxStep);
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const pair = kerrSchildRk45Pair(params, state, h);
      const errorNorm = maxScaledError(state, pair.high, pair.low, absoluteTolerance, relativeTolerance);
      const factor = errorNorm <= EPS ? 4 : clamp(safety * errorNorm ** (-1 / 5), 0.2, 4);
      const suggestedStep = clamp(h * factor, minStep, maxStep);
      if (errorNorm <= 1) {
        const initialHamiltonian = state.initialHamiltonian ?? kerrSchildHamiltonian(params, state);
        const finalHamiltonian = kerrSchildHamiltonian(params, pair.high);
        return {
          accepted: true,
          state: {
            ...pair.high,
            initialHamiltonian,
            lastHamiltonian: finalHamiltonian,
            hamiltonianDrift: finalHamiltonian - initialHamiltonian,
          },
          errorNorm,
          usedStep: h,
          suggestedStep,
          attempts,
          rejectedSteps: attempts - 1,
        };
      }
      h = suggestedStep;
    } catch (error) {
      if (h <= minStep * (1 + 1e-9)) {
        return {
          accepted: false,
          state,
          errorNorm: Infinity,
          usedStep: h,
          suggestedStep: h,
          attempts,
          rejectedSteps: attempts,
          error,
        };
      }
      h = Math.max(minStep, h * 0.25);
    }
  }

  return {
    accepted: false,
    state,
    errorNorm: Infinity,
    usedStep: h,
    suggestedStep: h,
    attempts,
    rejectedSteps: attempts,
    error: new Error("Kerr-Schild adaptive step failed to converge."),
  };
}

export function makeKerrSchildTimelikeState(params, options = {}) {
  const position = options.position ?? cartesianFromBoyerLindquist(
    params,
    options.r ?? 8,
    options.theta ?? Math.PI / 2,
    options.phi ?? 0,
  );
  const velocity = options.velocity ?? [-0.12, 0.18, 0];
  const q = options.chargeToMass ?? 0;
  const g = kerrSchildMetric(params, position.x, position.y, position.z).cov;
  const v4 = [1, velocity[0], velocity[1], velocity[2]];
  const normPerUt2 = dotMetric(g, v4, v4);
  if (normPerUt2 >= 0) {
    throw new Error("Coordinate velocity is not timelike at this Kerr-Schild position.");
  }
  const ut = 1 / Math.sqrt(-normPerUt2);
  const uCon = v4.map((value) => value * ut);
  const uCov = matVec(g, uCon);
  const A = kerrSchildVectorPotential(params, position.x, position.y, position.z);
  const P = uCov.map((value, i) => value + q * A[i]);
  const state = {
    name: options.name ?? "ks-particle",
    kind: options.kind ?? "massive",
    t: options.t ?? 0,
    x: position.x,
    y: position.y,
    z: position.z,
    Pt: P[0],
    Px: P[1],
    Py: P[2],
    Pz: P[3],
    chargeToMass: q,
    status: "active",
  };
  state.initialHamiltonian = kerrSchildHamiltonian(params, state);
  state.lastHamiltonian = state.initialHamiltonian;
  state.hamiltonianDrift = 0;
  return state;
}

export function equatorialCoordinateVelocity(phi, radialVelocity, azimuthalVelocity) {
  return [
    radialVelocity * Math.cos(phi) - azimuthalVelocity * Math.sin(phi),
    radialVelocity * Math.sin(phi) + azimuthalVelocity * Math.cos(phi),
    0,
  ];
}

export function integrateKerrSchildAdaptive(params, initialState, options = {}) {
  let state = { ...initialState };
  state.initialHamiltonian = state.initialHamiltonian ?? kerrSchildHamiltonian(params, state);
  state.lastHamiltonian = state.initialHamiltonian;
  state.hamiltonianDrift = 0;

  const h = horizons(params);
  const targetAffine = options.targetAffine ?? 30;
  const singularityCutoff = options.singularityCutoff ?? 0.18;
  const escapeRadius = options.escapeRadius ?? 120;
  const recordEvery = Math.max(1, options.recordEvery ?? 25);
  const maxSteps = options.maxSteps ?? 200000;
  let affine = 0;
  let stepSize = options.initialStep ?? options.stepSize ?? 0.02;
  let acceptedSteps = 0;
  let rejectedSteps = 0;
  const frames = [];
  const events = [];
  let crossedOuterHorizon = false;
  let crossedInnerHorizon = false;

  for (let i = 0; i < maxSteps && affine < targetAffine; i++) {
    const before = boyerLindquistLikeFromCartesian(params, state.x, state.y, state.z);
    const result = kerrSchildAdaptiveStep(params, state, {
      ...options,
      stepSize: Math.min(stepSize, targetAffine - affine),
    });
    rejectedSteps += result.rejectedSteps;
    if (!result.accepted) {
      events.push({
        affine,
        type: "integration-failed",
        message: result.error?.message ?? "Kerr-Schild adaptive step failed.",
      });
      break;
    }

    state = result.state;
    affine += result.usedStep;
    stepSize = result.suggestedStep;
    acceptedSteps += 1;
    const after = boyerLindquistLikeFromCartesian(params, state.x, state.y, state.z);
    let status = "active";

    if (!h.naked && !crossedOuterHorizon && before.r > h.rPlus && after.r <= h.rPlus) {
      crossedOuterHorizon = true;
      events.push({
        affine,
        type: "outer-horizon-crossing",
        message: "Trajectory crossed r+ in horizon-penetrating Kerr-Schild coordinates.",
        r: after.r,
      });
    }
    if (!h.naked && !crossedInnerHorizon && before.r > h.rMinus && after.r <= h.rMinus) {
      crossedInnerHorizon = true;
      events.push({
        affine,
        type: "inner-horizon-crossing",
        message: "Trajectory crossed r-; classical Kerr-Newman interior becomes unstable in realistic settings.",
        r: after.r,
      });
    }
    if (after.r <= singularityCutoff) status = "singularity-cutoff";
    if (after.r >= escapeRadius) status = "escaped";

    if (acceptedSteps % recordEvery === 0 || status !== "active" || affine >= targetAffine) {
      frames.push({
        affine,
        status,
        ks: { t: state.t, x: state.x, y: state.y, z: state.z },
        blLike: after,
        energy: -state.Pt,
        hamiltonian: state.lastHamiltonian,
        hamiltonianDrift: state.hamiltonianDrift,
        errorNorm: result.errorNorm,
        usedStep: result.usedStep,
        insideOuterHorizon: !h.naked && after.r < h.rPlus,
        insideInnerHorizon: !h.naked && after.r < h.rMinus,
      });
    }
    if (status !== "active") {
      events.push({
        affine,
        type: status,
        message: `Trajectory reached ${status}.`,
        r: after.r,
      });
      break;
    }
  }

  return {
    finalState: state,
    affine,
    acceptedSteps,
    rejectedSteps,
    crossedOuterHorizon,
    crossedInnerHorizon,
    finalHamiltonian: state.lastHamiltonian,
    hamiltonianDrift: state.hamiltonianDrift,
    frames,
    events,
  };
}

