/*
 * Add-only performance utilities for the standalone Kerr-Newman physics core.
 *
 * This module does not patch the existing simulator. It provides a cached
 * Boyer-Lindquist RK4 path and batch helpers that callers can opt into.
 */

import {
  clamp,
  horizons,
  makeMassiveState,
  metric,
  rk4Step,
  sanitizeParams,
  vectorPotential,
  wrapAngle,
} from "./kn-full-physics.mjs";

const STATE_KEYS = ["t", "r", "theta", "phi", "Pt", "Pr", "Ptheta", "Pphi"];
const POLE_EPS = 1e-7;
const EPS = 1e-12;

function nowMs() {
  if (globalThis.performance?.now) return globalThis.performance.now();
  return Date.now();
}

function stateKey(state) {
  return STATE_KEYS.map((key) => Number(state[key]).toPrecision(17)).join(",");
}

function paramsKey(params) {
  const p = sanitizeParams(params);
  return `${p.M},${p.Q},${p.a},${p.B}`;
}

function numberKey(value, quantum) {
  if (quantum > 0) return String(Math.round(value / quantum));
  return Number(value).toPrecision(17);
}

function coordinateKey(params, r, theta, quantum) {
  return `${paramsKey(params)}|${numberKey(r, quantum)}|${numberKey(theta, quantum)}`;
}

function addCombination(state, terms) {
  const next = { ...state };
  for (const key of STATE_KEYS) {
    let value = state[key];
    for (const [scale, deriv] of terms) value += scale * deriv[key];
    next[key] = value;
  }
  next.theta = clamp(next.theta, POLE_EPS, Math.PI - POLE_EPS);
  next.phi = wrapAngle(next.phi);
  return next;
}

function radialFloor(params) {
  const h = horizons(params);
  return h.naked ? 1e-4 : Math.max(1e-4, h.rPlus + 1e-5);
}

function cloneParticle(particle) {
  return {
    ...particle,
    events: Array.isArray(particle.events) ? [...particle.events] : [],
    trail: Array.isArray(particle.trail) ? particle.trail.map((point) => [...point]) : undefined,
  };
}

function copyDynamicFields(target, source) {
  for (const key of STATE_KEYS) target[key] = source[key];
}

export class LruCache {
  constructor(maxEntries = 4096) {
    this.maxEntries = Math.max(1, maxEntries);
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get(key, factory) {
    if (this.map.has(key)) {
      const value = this.map.get(key);
      this.map.delete(key);
      this.map.set(key, value);
      this.hits += 1;
      return value;
    }
    const value = factory();
    this.map.set(key, value);
    this.misses += 1;
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
      this.evictions += 1;
    }
    return value;
  }

  clear() {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  stats() {
    const requests = this.hits + this.misses;
    return {
      entries: this.map.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: requests > 0 ? this.hits / requests : 0,
    };
  }
}

export class KerrNewmanPerformanceContext {
  constructor(params = {}, options = {}) {
    this.params = sanitizeParams(params);
    this.options = {
      coordinateQuantum: options.coordinateQuantum ?? 0,
      metricCacheSize: options.metricCacheSize ?? 8192,
      potentialCacheSize: options.potentialCacheSize ?? 8192,
      hamiltonianCacheSize: options.hamiltonianCacheSize ?? 8192,
      derivativeCacheSize: options.derivativeCacheSize ?? 8192,
      cacheMetric: options.cacheMetric ?? true,
      cachePotential: options.cachePotential ?? true,
      cacheHamiltonian: options.cacheHamiltonian ?? false,
      cacheDerivatives: options.cacheDerivatives ?? false,
    };
    this.metricCache = new LruCache(this.options.metricCacheSize);
    this.potentialCache = new LruCache(this.options.potentialCacheSize);
    this.hamiltonianCache = new LruCache(this.options.hamiltonianCacheSize);
    this.derivativeCache = new LruCache(this.options.derivativeCacheSize);
  }

  resetCaches() {
    this.metricCache.clear();
    this.potentialCache.clear();
    this.hamiltonianCache.clear();
    this.derivativeCache.clear();
  }

  cacheStats() {
    return {
      metric: this.metricCache.stats(),
      potential: this.potentialCache.stats(),
      hamiltonian: this.hamiltonianCache.stats(),
      derivative: this.derivativeCache.stats(),
    };
  }

  metric(r, theta) {
    if (!this.options.cacheMetric) return metric(this.params, r, theta);
    const key = coordinateKey(this.params, r, theta, this.options.coordinateQuantum);
    return this.metricCache.get(key, () => metric(this.params, r, theta));
  }

  vectorPotential(r, theta) {
    if (!this.options.cachePotential) return vectorPotential(this.params, r, theta);
    const key = coordinateKey(this.params, r, theta, this.options.coordinateQuantum);
    return this.potentialCache.get(key, () => vectorPotential(this.params, r, theta));
  }

  kineticMomentum(state) {
    const potential = this.vectorPotential(state.r, state.theta);
    const q = state.chargeToMass || 0;
    return [
      state.Pt - q * potential[0],
      state.Pr - q * potential[1],
      state.Ptheta - q * potential[2],
      state.Pphi - q * potential[3],
    ];
  }

  hamiltonian(state) {
    if (!this.options.cacheHamiltonian) return this.computeHamiltonian(state);
    const key = `${stateKey(state)}|q=${state.chargeToMass || 0}`;
    return this.hamiltonianCache.get(key, () => this.computeHamiltonian(state));
  }

  computeHamiltonian(state) {
    const { inv } = this.metric(state.r, state.theta);
    const pi = this.kineticMomentum(state);
    let value = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) value += 0.5 * inv[i][j] * pi[i] * pi[j];
    }
    return value;
  }

  contravariantVelocity(state) {
    const { inv } = this.metric(state.r, state.theta);
    const pi = this.kineticMomentum(state);
    return inv.map((row) => row.reduce((sum, gij, j) => sum + gij * pi[j], 0));
  }

  partialHamiltonian(state, key) {
    const base = state[key];
    const scale = Math.max(1, Math.abs(base));
    const h = 1e-5 * scale;

    if (key === "r") {
      const floor = radialFloor(this.params);
      const hi = base + h;
      const lo = Math.max(floor, base - h);
      if (hi === lo) return 0;
      return (this.hamiltonian({ ...state, r: hi }) - this.hamiltonian({ ...state, r: lo })) / (hi - lo);
    }

    if (key === "theta") {
      const hi = clamp(base + h, POLE_EPS, Math.PI - POLE_EPS);
      const lo = clamp(base - h, POLE_EPS, Math.PI - POLE_EPS);
      if (hi === lo) return 0;
      return (this.hamiltonian({ ...state, theta: hi }) - this.hamiltonian({ ...state, theta: lo })) / (hi - lo);
    }

    return 0;
  }

  derivatives(state) {
    if (!this.options.cacheDerivatives) return this.computeDerivatives(state);
    const key = `${stateKey(state)}|q=${state.chargeToMass || 0}`;
    return this.derivativeCache.get(key, () => this.computeDerivatives(state));
  }

  computeDerivatives(state) {
    const u = this.contravariantVelocity(state);
    return {
      t: u[0],
      r: u[1],
      theta: u[2],
      phi: u[3],
      Pt: 0,
      Pr: -this.partialHamiltonian(state, "r"),
      Ptheta: -this.partialHamiltonian(state, "theta"),
      Pphi: 0,
    };
  }

  rk4Step(state, stepSize) {
    const k1 = this.derivatives(state);
    const k2 = this.derivatives(addCombination(state, [[stepSize * 0.5, k1]]));
    const k3 = this.derivatives(addCombination(state, [[stepSize * 0.5, k2]]));
    const k4 = this.derivatives(addCombination(state, [[stepSize, k3]]));
    return addCombination(state, [
      [stepSize / 6, k1],
      [stepSize / 3, k2],
      [stepSize / 3, k3],
      [stepSize / 6, k4],
    ]);
  }

  batchStep(states, stepSize, options = {}) {
    const mutate = options.mutate ?? false;
    const maxTrail = options.maxTrail ?? 1024;
    const escapeRadius = options.escapeRadius ?? Infinity;
    const horizonBuffer = options.horizonBuffer ?? 1e-4;
    const stopAtHorizon = options.stopAtHorizon ?? true;
    const stepMemo = options.deduplicateStates ?? true ? new Map() : null;
    const h = horizons(this.params);
    const out = mutate ? states : states.map(cloneParticle);
    let active = 0;
    let skipped = 0;
    let captured = 0;
    let escaped = 0;
    let failed = 0;

    for (const particle of out) {
      if (particle.status && particle.status !== "active") {
        skipped += 1;
        continue;
      }
      if (stopAtHorizon && !h.naked && particle.r <= h.rPlus + horizonBuffer) {
        particle.status = "captured";
        captured += 1;
        continue;
      }
      try {
        const memoKey = stepMemo ? `${stateKey(particle)}|q=${particle.chargeToMass || 0}` : null;
        let outcome = memoKey ? stepMemo.get(memoKey) : null;
        if (!outcome) {
          const next = this.rk4Step(particle, stepSize);
          const probe = { ...particle };
          copyDynamicFields(probe, next);
          const initialHamiltonian = particle.initialHamiltonian ?? this.hamiltonian(particle);
          const lastHamiltonian = this.hamiltonian(probe);
          let status = "active";
          if (!h.naked && probe.r <= h.rPlus + horizonBuffer) status = "captured";
          if (probe.r >= escapeRadius) status = "escaped";
          outcome = {
            next,
            initialHamiltonian,
            lastHamiltonian,
            hamiltonianDrift: lastHamiltonian - initialHamiltonian,
            status,
          };
          if (memoKey) stepMemo.set(memoKey, outcome);
        }
        copyDynamicFields(particle, outcome.next);
        particle.status = particle.status ?? "active";
        particle.initialHamiltonian = particle.initialHamiltonian ?? outcome.initialHamiltonian;
        particle.lastHamiltonian = outcome.lastHamiltonian;
        particle.hamiltonianDrift = outcome.hamiltonianDrift;
        if (Array.isArray(particle.trail)) {
          particle.trail.push([particle.t, particle.r, particle.theta, particle.phi]);
          if (particle.trail.length > maxTrail) {
            particle.trail.splice(0, particle.trail.length - maxTrail);
          }
        }
        if (outcome.status === "captured") {
          particle.status = outcome.status;
          captured += 1;
        } else if (outcome.status === "escaped") {
          particle.status = outcome.status;
          escaped += 1;
        } else {
          particle.status = outcome.status;
          active += 1;
        }
      } catch (error) {
        particle.status = "integration-failed";
        particle.error = error.message;
        failed += 1;
      }
    }

    return {
      states: out,
      summary: {
        total: out.length,
        active,
        skipped,
        captured,
        escaped,
        failed,
        stepSize,
      },
      cacheStats: this.cacheStats(),
    };
  }

  batchRun(states, options = {}) {
    const steps = options.steps ?? 1;
    const stepSize = options.stepSize ?? 0.02;
    const recordEvery = Math.max(1, options.recordEvery ?? Math.ceil(steps / 10));
    let current = options.mutate ? states : states.map(cloneParticle);
    const frames = [];
    for (let i = 0; i < steps; i++) {
      const result = this.batchStep(current, stepSize, { ...options, mutate: true });
      current = result.states;
      if (i % recordEvery === 0 || i === steps - 1) {
        frames.push({
          step: i + 1,
          summary: result.summary,
          cacheStats: result.cacheStats,
        });
      }
    }
    return {
      states: current,
      frames,
      cacheStats: this.cacheStats(),
    };
  }
}

export function createPerformanceContext(params = {}, options = {}) {
  return new KerrNewmanPerformanceContext(params, options);
}

export function batchRk4Step(params, states, stepSize, options = {}) {
  const context = options.context ?? new KerrNewmanPerformanceContext(params, options.cacheOptions ?? options);
  return context.batchStep(states, stepSize, options);
}

export function batchRk4Run(params, states, options = {}) {
  const context = options.context ?? new KerrNewmanPerformanceContext(params, options.cacheOptions ?? options);
  return context.batchRun(states, options);
}

export function makeDeterministicParticleCloud(params, count = 256, options = {}) {
  const p = sanitizeParams(params);
  const innerR = options.innerR ?? 7.2;
  const outerR = options.outerR ?? 24;
  const shellCount = Math.max(1, Math.min(count, options.shellCount ?? count));
  const uniqueStates = Math.max(1, Math.min(count, options.uniqueStates ?? count));
  const out = [];
  for (let i = 0; i < count; i++) {
    const templateIndex = i % uniqueStates;
    const shellIndex = templateIndex % shellCount;
    const f = shellCount <= 1 ? 0 : shellIndex / (shellCount - 1);
    const ring = templateIndex % 8;
    const r = innerR + (outerR - innerR) * f;
    const phi = ((templateIndex * 2.399963229728653) % (Math.PI * 2)) - Math.PI;
    const radialVelocity = -(options.inflowVelocity ?? 0.004) * (1 + 0.08 * ring);
    const azimuthalVelocity = (options.azimuthalVelocity ?? 0.31) + 0.015 * Math.sin(templateIndex * 0.37);
    out.push(makeMassiveState(p, {
      id: i + 1,
      name: `${options.namePrefix ?? "perf-particle"}-${String(i + 1).padStart(4, "0")}`,
      kind: options.kind ?? "benchmark",
      r,
      theta: Math.PI / 2,
      phi,
      velocity: [radialVelocity, 0, azimuthalVelocity],
      chargeToMass: options.chargeToMass ?? ((templateIndex % 5) - 2) * 0.01,
      radius: options.radius ?? 0.001,
      binding: options.binding ?? Infinity,
    }));
  }
  return out;
}

function maxStateDelta(left, right) {
  let max = 0;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    for (const key of STATE_KEYS) {
      const delta = Math.abs((left[i][key] ?? 0) - (right[i][key] ?? 0));
      if (delta > max) max = delta;
    }
  }
  return max;
}

export function runPerformanceBenchmark(options = {}) {
  const params = sanitizeParams(options.params ?? { M: 1.5, Q: 0.25, a: 1.0, B: 0.4 });
  const particleCount = options.particleCount ?? 256;
  const steps = options.steps ?? 32;
  const stepSize = options.stepSize ?? 0.01;
  const cloud = makeDeterministicParticleCloud(params, particleCount, options.cloudOptions ?? {});
  const baseline = cloud.map(cloneParticle);
  const optimized = cloud.map(cloneParticle);

  const baselineStart = nowMs();
  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < baseline.length; i++) {
      if (baseline[i].status && baseline[i].status !== "active") continue;
      baseline[i] = {
        ...baseline[i],
        ...rk4Step(params, baseline[i], stepSize),
      };
    }
  }
  const baselineMs = nowMs() - baselineStart;

  const context = new KerrNewmanPerformanceContext(params, options.cacheOptions ?? {});
  const optimizedStart = nowMs();
  context.batchRun(optimized, {
    steps,
    stepSize,
    mutate: true,
    stopAtHorizon: false,
    escapeRadius: Infinity,
    maxTrail: 0,
  });
  const optimizedMs = nowMs() - optimizedStart;

  return {
    params,
    particleCount,
    steps,
    stepSize,
    baselineMs,
    optimizedMs,
    speedup: optimizedMs > 0 ? baselineMs / optimizedMs : Infinity,
    maxStateDelta: maxStateDelta(baseline, optimized),
    cacheStats: context.cacheStats(),
  };
}
