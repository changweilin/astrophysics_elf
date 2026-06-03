/*
 * Adaptive Hamiltonian integrator for Kerr-Newman trajectories.
 *
 * The base physics core exposes a fixed-step RK4 method. This module adds a
 * Dormand-Prince RK45 stepper with local error control and invariant tracking.
 */

import {
  clamp,
  derivatives,
  hamiltonian,
  horizons,
  wrapAngle,
} from "./kn-full-physics.mjs";

const STATE_KEYS = ["t", "r", "theta", "phi", "Pt", "Pr", "Ptheta", "Pphi"];
const EPS = 1e-14;

function cloneState(state) {
  return { ...state };
}

function sanitizeDynamicState(state) {
  const next = { ...state };
  next.theta = clamp(next.theta, 1e-7, Math.PI - 1e-7);
  next.phi = wrapAngle(next.phi);
  return next;
}

function addCombination(state, terms) {
  const next = { ...state };
  for (const key of STATE_KEYS) {
    let value = state[key];
    for (const [scale, deriv] of terms) value += scale * deriv[key];
    next[key] = value;
  }
  return sanitizeDynamicState(next);
}

function interpolateState(left, right, fraction) {
  const f = clamp(fraction, 0, 1);
  const next = { ...left };
  for (const key of STATE_KEYS) next[key] = left[key] + (right[key] - left[key]) * f;
  return sanitizeDynamicState(next);
}

function maxScaledError(base, high, low, absoluteTolerance, relativeTolerance) {
  let worst = 0;
  for (const key of STATE_KEYS) {
    const scale = absoluteTolerance + relativeTolerance * Math.max(Math.abs(base[key]), Math.abs(high[key]));
    const err = Math.abs(high[key] - low[key]) / Math.max(scale, EPS);
    if (err > worst) worst = err;
  }
  return worst;
}

export function rk45Pair(params, state, h) {
  const k1 = derivatives(params, state);
  const k2 = derivatives(params, addCombination(state, [
    [h * (1 / 5), k1],
  ]));
  const k3 = derivatives(params, addCombination(state, [
    [h * (3 / 40), k1],
    [h * (9 / 40), k2],
  ]));
  const k4 = derivatives(params, addCombination(state, [
    [h * (44 / 45), k1],
    [h * (-56 / 15), k2],
    [h * (32 / 9), k3],
  ]));
  const k5 = derivatives(params, addCombination(state, [
    [h * (19372 / 6561), k1],
    [h * (-25360 / 2187), k2],
    [h * (64448 / 6561), k3],
    [h * (-212 / 729), k4],
  ]));
  const k6 = derivatives(params, addCombination(state, [
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
  const k7 = derivatives(params, high);
  const low = addCombination(state, [
    [h * (5179 / 57600), k1],
    [h * (7571 / 16695), k3],
    [h * (393 / 640), k4],
    [h * (-92097 / 339200), k5],
    [h * (187 / 2100), k6],
    [h * (1 / 40), k7],
  ]);

  return { high, low, stages: [k1, k2, k3, k4, k5, k6, k7] };
}

export function adaptiveStep(params, state, options = {}) {
  const absoluteTolerance = options.absoluteTolerance ?? 1e-9;
  const relativeTolerance = options.relativeTolerance ?? 1e-8;
  const minStep = options.minStep ?? 1e-6;
  const maxStep = options.maxStep ?? 0.1;
  const safety = options.safety ?? 0.9;
  const maxAttempts = options.maxAttempts ?? 24;
  const stopAtHorizon = options.stopAtHorizon ?? true;
  const horizonBuffer = options.horizonBuffer ?? 1e-3;
  const horizon = horizons(params);
  const horizonStop = !horizon.naked ? horizon.rPlus + horizonBuffer : 1e-3;
  let h = clamp(Math.abs(options.stepSize ?? 0.02), minStep, maxStep);
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const pair = rk45Pair(params, state, h);
      if (stopAtHorizon && state.r > horizonStop && pair.high.r <= horizonStop) {
        const fraction = (state.r - horizonStop) / Math.max(state.r - pair.high.r, EPS);
        const terminal = interpolateState(state, pair.high, fraction);
        terminal.r = horizonStop;
        const initialHamiltonian = state.initialHamiltonian ?? hamiltonian(params, state);
        const finalHamiltonian = state.lastHamiltonian ?? hamiltonian(params, state);
        return {
          accepted: true,
          terminalStatus: horizon.naked ? "singularity" : "captured",
          coordinateGuard: horizon.naked ? "singularity-cutoff" : "outer-horizon",
          state: {
            ...terminal,
            initialHamiltonian,
            lastHamiltonian: finalHamiltonian,
            hamiltonianDrift: finalHamiltonian - initialHamiltonian,
            hamiltonianReliable: false,
          },
          errorNorm: 0,
          usedStep: h * clamp(fraction, 0, 1),
          suggestedStep: minStep,
          attempts,
          rejectedSteps: attempts - 1,
        };
      }
      const errorNorm = maxScaledError(state, pair.high, pair.low, absoluteTolerance, relativeTolerance);
      const accepted = errorNorm <= 1;
      const factor = errorNorm <= EPS
        ? 4
        : clamp(safety * errorNorm ** (-1 / 5), 0.2, 4);
      const suggestedStep = clamp(h * factor, minStep, maxStep);

      if (accepted) {
        const initialHamiltonian = state.initialHamiltonian ?? hamiltonian(params, state);
        const finalHamiltonian = hamiltonian(params, pair.high);
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
    error: new Error("Adaptive step failed to converge."),
  };
}

function statusAfterStep(params, state, escapeRadius) {
  const h = horizons(params);
  if (!h.naked && state.r <= h.rPlus) return "captured";
  if (h.naked && state.r <= 1e-3) return "singularity";
  if (state.r >= escapeRadius) return "escaped";
  return "active";
}

export function integrateAdaptive(params, initialState, options = {}) {
  let state = sanitizeDynamicState(cloneState(initialState));
  state.initialHamiltonian = state.initialHamiltonian ?? hamiltonian(params, state);
  state.lastHamiltonian = state.initialHamiltonian;
  state.hamiltonianDrift = 0;

  const targetAffine = options.targetAffine ?? 20;
  const escapeRadius = options.escapeRadius ?? 100;
  const recordEvery = Math.max(1, options.recordEvery ?? 20);
  const maxSteps = options.maxSteps ?? 200000;
  let affine = 0;
  let stepSize = options.initialStep ?? options.stepSize ?? 0.02;
  let acceptedSteps = 0;
  let rejectedSteps = 0;
  const frames = [];
  const events = [];

  for (let i = 0; i < maxSteps && affine < targetAffine; i++) {
    const remaining = targetAffine - affine;
    const result = adaptiveStep(params, state, {
      ...options,
      stepSize: Math.min(stepSize, remaining),
    });
    rejectedSteps += result.rejectedSteps;
    if (!result.accepted) {
      events.push({
        affine,
        type: "integration-failed",
        message: result.error?.message ?? "Adaptive step failed.",
      });
      break;
    }

    state = result.state;
    affine += result.usedStep;
    stepSize = result.suggestedStep;
    acceptedSteps += 1;

    const status = result.terminalStatus ?? statusAfterStep(params, state, escapeRadius);
    if (acceptedSteps % recordEvery === 0 || status !== "active" || affine >= targetAffine) {
      frames.push({
        affine,
        status,
        r: state.r,
        theta: state.theta,
        phi: state.phi,
        t: state.t,
        energy: -state.Pt,
        angularMomentumZ: state.Pphi,
        // Non-conserved momenta, recorded so downstream consumers can reconstruct
        // the local 4-momentum at an interpolated crossing (e.g. the lensing disc
        // plunging-region redshift, which needs P_r where u^r != 0).
        Pr: state.Pr,
        Ptheta: state.Ptheta,
        hamiltonian: state.lastHamiltonian,
        hamiltonianDrift: state.hamiltonianDrift,
        errorNorm: result.errorNorm,
        usedStep: result.usedStep,
        coordinateGuard: result.coordinateGuard,
      });
    }

    if (status !== "active") {
      events.push({
        affine,
        type: status,
        message: `Trajectory became ${status}.`,
      });
      break;
    }
  }

  return {
    finalState: state,
    affine,
    acceptedSteps,
    rejectedSteps,
    frames,
    events,
    finalHamiltonian: state.lastHamiltonian,
    hamiltonianDrift: state.hamiltonianDrift,
  };
}

export function advanceParticleAdaptive(params, particle, targetAffine, options = {}) {
  const result = integrateAdaptive(params, particle, {
    ...options,
    targetAffine,
  });
  for (const key of STATE_KEYS) particle[key] = result.finalState[key];
  particle.initialHamiltonian = result.finalState.initialHamiltonian;
  particle.lastHamiltonian = result.finalState.lastHamiltonian;
  particle.hamiltonianDrift = result.finalState.hamiltonianDrift;
  return result;
}
