/*
 * Reduced dynamic MHD jet engine for Kerr-Newman lab simulations.
 *
 * This is not a full GRMHD solver. It is a time-dependent, axisymmetric,
 * physically grounded jet model that can be driven by the Kerr-Newman
 * full-physics simulator. It evolves a polar jet column with magnetic
 * acceleration, mass loading, collimation, synchrotron-like emissivity,
 * and stochastic magnetic reconnection flares.
 */

import {
  blandfordZnajekJet,
  clamp,
  horizons,
  horizonAngularVelocity,
  sanitizeParams,
} from "./kn-full-physics.mjs";

const EPS = 1e-12;

export function makeSeededRng(seed = 123456789) {
  let state = seed >>> 0;
  return function rng() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function defaultZones(params, count, zMax) {
  const h = horizons(params);
  const base = h.naked ? Math.max(params.M, 1) : h.rPlus;
  const zones = [];
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1);
    const z = base * (1 + 0.2 * i) + f * zMax;
    zones.push({
      index: i,
      z,
      radius: base * 0.45 + z * 0.08,
      gamma: 1,
      beta: 0,
      density: 1e-5,
      pressure: 1e-5,
      poloidalB: 0,
      toroidalB: 0,
      magnetization: 0,
      temperature: 0,
      emissivity: 0,
      opticalDepth: 0,
      openingAngleDeg: 12,
      kinkRisk: 0,
    });
  }
  return zones;
}

function betaFromGamma(gamma) {
  if (gamma <= 1) return 0;
  return Math.sqrt(1 - 1 / (gamma * gamma));
}

function smooth(current, target, rate, dt) {
  const k = 1 - Math.exp(-Math.max(0, rate) * dt);
  return current + (target - current) * k;
}

function magneticEnergyDensity(bp, bt) {
  return 0.5 * (bp * bp + bt * bt);
}

export function jetInputFromSimulator(simulator, options = {}) {
  const accretionRate = typeof simulator.accretionRateEstimate === "function"
    ? simulator.accretionRateEstimate(options.windowLambda ?? 10)
    : 0;
  return {
    accretionRate,
    magneticField: options.magneticField ?? simulator.params?.B ?? 0,
    massLoading: options.massLoading,
  };
}

export class MHDJetEngine {
  constructor(params = {}, options = {}) {
    this.params = sanitizeParams(params);
    this.options = {
      zoneCount: options.zoneCount ?? 48,
      zMax: options.zMax ?? 120,
      dt: options.dt ?? 0.03,
      massLoadingFloor: options.massLoadingFloor ?? 1e-4,
      reconnectionRate: options.reconnectionRate ?? 0.05,
      accelerationRate: options.accelerationRate ?? 0.45,
      collimationRate: options.collimationRate ?? 0.32,
      coolingRate: options.coolingRate ?? 0.08,
      seed: options.seed ?? 20260525,
    };
    this.rng = makeSeededRng(this.options.seed);
    this.time = 0;
    this.events = [];
    this.zones = defaultZones(this.params, this.options.zoneCount, this.options.zMax);
    this.lastInput = {
      accretionRate: 0,
      magneticField: this.params.B ?? 0,
      massLoading: this.options.massLoadingFloor,
    };
    this.global = {
      bzPower: 0,
      accretionLuminosity: 0,
      totalPower: 0,
      magneticFlux: 0,
      omegaH: horizonAngularVelocity(this.params),
      lorentzFactor: 1,
      openingAngleDeg: 30,
      radiativeLuminosity: 0,
      reconnectionLuminosity: 0,
      kinkRisk: 0,
      magnetizationBase: 0,
      massFlux: 0,
    };
  }

  setParams(params) {
    this.params = sanitizeParams({ ...this.params, ...params });
    this.zones = defaultZones(this.params, this.options.zoneCount, this.options.zMax);
  }

  pushEvent(type, zone, energy, message) {
    const event = {
      time: this.time,
      type,
      zoneIndex: zone.index,
      z: zone.z,
      gamma: zone.gamma,
      magnetization: zone.magnetization,
      energy,
      message,
    };
    this.events.push(event);
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    return event;
  }

  resolveInput(input = {}) {
    const accretionRate = Math.max(0, input.accretionRate ?? this.lastInput.accretionRate ?? 0);
    const magneticField = Math.max(0, input.magneticField ?? this.lastInput.magneticField ?? this.params.B ?? 0);
    const massLoading = Math.max(
      this.options.massLoadingFloor,
      input.massLoading ?? this.lastInput.massLoading ?? (0.015 * accretionRate + this.options.massLoadingFloor),
    );
    this.lastInput = { accretionRate, magneticField, massLoading };
    return this.lastInput;
  }

  step(input = {}, dt = this.options.dt) {
    const resolved = this.resolveInput(input);
    const jet = blandfordZnajekJet(this.params, {
      magneticField: resolved.magneticField,
      accretionRate: resolved.accretionRate,
      magneticFlux: input.magneticFlux,
    });

    const h = horizons(this.params);
    const baseR = h.naked ? Math.max(this.params.M, 1) : h.rPlus;
    const omegaH = Number.isFinite(jet.omegaH) ? jet.omegaH : 0;
    const injectedPower = jet.valid ? jet.totalPower : 0;
    const massFlux = resolved.massLoading + 0.02 * resolved.accretionRate;
    const sigmaBase = injectedPower / Math.max(massFlux, EPS);
    const targetGammaBase = 1 + Math.min(80, sigmaBase * 0.65);
    const baseOpening = jet.valid ? jet.openingAngleDeg : 35;

    let radiativeLuminosity = 0;
    let reconnectionLuminosity = 0;
    let kinkRiskMax = 0;

    for (const zone of this.zones) {
      const x = Math.max(zone.z / Math.max(baseR, EPS), 1);
      const collimation = 1 + this.options.collimationRate * Math.log1p(x) * Math.abs(omegaH) * 10;
      const targetOpening = clamp(baseOpening / Math.sqrt(collimation), 1.2, 40);
      zone.openingAngleDeg = smooth(zone.openingAngleDeg, targetOpening, 0.9, dt);
      zone.radius = Math.max(baseR * 0.15, zone.z * Math.tan((zone.openingAngleDeg * Math.PI) / 180));

      const bpTarget = resolved.magneticField * (baseR / Math.max(zone.z, baseR)) ** 2;
      const btTarget = resolved.magneticField * Math.abs(omegaH) * baseR * (baseR / Math.max(zone.z, baseR));
      zone.poloidalB = smooth(zone.poloidalB, bpTarget, 2.0, dt);
      zone.toroidalB = smooth(zone.toroidalB, btTarget, 1.4, dt);

      const area = Math.PI * zone.radius * zone.radius;
      const targetDensity = massFlux / Math.max(area * Math.max(zone.gamma, 1) * Math.max(zone.beta, 0.03), EPS);
      zone.density = smooth(zone.density, targetDensity, 1.2, dt);

      const uB = magneticEnergyDensity(zone.poloidalB, zone.toroidalB);
      zone.magnetization = uB / Math.max(zone.density + zone.pressure, EPS);
      const accelDistance = 8 + 35 / Math.max(0.1, Math.sqrt(1 + sigmaBase));
      const targetGamma = 1 + (targetGammaBase - 1) * (1 - Math.exp(-(zone.z - baseR) / accelDistance));
      const thermalPush = 1 + 0.15 * Math.sqrt(Math.max(zone.temperature, 0));
      zone.gamma = smooth(zone.gamma, Math.max(1, targetGamma * thermalPush), this.options.accelerationRate, dt);
      zone.gamma = clamp(zone.gamma, 1, 120);
      zone.beta = betaFromGamma(zone.gamma);

      const dissipation = this.options.coolingRate * zone.magnetization / (1 + zone.magnetization);
      const compressionHeat = 0.02 * Math.abs(zone.toroidalB) * Math.abs(omegaH);
      zone.temperature = smooth(zone.temperature, compressionHeat / Math.max(zone.density, 1e-6), 0.2, dt);
      zone.temperature *= Math.exp(-dissipation * dt);
      zone.pressure = smooth(zone.pressure, zone.density * zone.temperature * 0.08, 0.8, dt);

      const synch = zone.density * (zone.poloidalB * zone.poloidalB + zone.toroidalB * zone.toroidalB) *
        zone.gamma * zone.gamma * 0.02;
      zone.opticalDepth = smooth(zone.opticalDepth, clamp(zone.density * zone.radius * 0.05, 0, 50), 0.6, dt);
      zone.emissivity = synch * Math.exp(-zone.opticalDepth * 0.15);
      radiativeLuminosity += zone.emissivity;

      const twist = Math.abs(zone.toroidalB) / Math.max(Math.abs(zone.poloidalB), EPS);
      zone.kinkRisk = clamp((twist - 1.5) / 5 + zone.magnetization / 120, 0, 1);
      kinkRiskMax = Math.max(kinkRiskMax, zone.kinkRisk);

      const reconnectionChance = dt * this.options.reconnectionRate *
        clamp(zone.magnetization / 20, 0, 2) *
        clamp(twist / 2, 0.1, 2);
      if (this.rng() < reconnectionChance) {
        const released = uB * area * zone.radius * clamp(0.03 + 0.12 * this.rng(), 0.01, 0.2);
        zone.toroidalB *= 0.72;
        zone.temperature += released / Math.max(zone.density * area * zone.radius, EPS);
        zone.gamma = clamp(zone.gamma + 0.05 * Math.sqrt(Math.max(released, 0)), 1, 120);
        reconnectionLuminosity += released / Math.max(dt, EPS);
        this.pushEvent(
          "reconnection",
          zone,
          released,
          "Magnetic reconnection converted toroidal field energy into heat and flare emission.",
        );
      }
    }

    this.global = {
      bzPower: jet.valid ? jet.bzPower : 0,
      accretionLuminosity: jet.valid ? jet.accretionLuminosity : 0,
      totalPower: injectedPower,
      magneticFlux: jet.valid ? jet.magneticFlux : 0,
      omegaH,
      lorentzFactor: this.zones.reduce((sum, zone) => sum + zone.gamma, 0) / this.zones.length,
      openingAngleDeg: this.zones[0]?.openingAngleDeg ?? baseOpening,
      radiativeLuminosity,
      reconnectionLuminosity,
      kinkRisk: kinkRiskMax,
      magnetizationBase: this.zones[0]?.magnetization ?? 0,
      massFlux,
    };
    this.time += dt;
    return this.snapshot();
  }

  stepFromSimulator(simulator, options = {}, dt = this.options.dt) {
    return this.step(jetInputFromSimulator(simulator, options), dt);
  }

  run(steps = 1000, input = {}, options = {}) {
    const frames = [];
    const recordEvery = Math.max(1, options.recordEvery ?? Math.ceil(steps / 100));
    for (let i = 0; i < steps; i++) {
      const resolvedInput = typeof input === "function" ? input(i, this) : input;
      const frame = this.step(resolvedInput, options.dt ?? this.options.dt);
      if (i % recordEvery === 0 || i === steps - 1) frames.push(frame);
    }
    return frames;
  }

  snapshot() {
    return {
      time: this.time,
      params: this.params,
      input: this.lastInput,
      global: this.global,
      zones: this.zones.map((zone) => ({
        index: zone.index,
        z: zone.z,
        radius: zone.radius,
        gamma: zone.gamma,
        beta: zone.beta,
        density: zone.density,
        pressure: zone.pressure,
        poloidalB: zone.poloidalB,
        toroidalB: zone.toroidalB,
        magnetization: zone.magnetization,
        temperature: zone.temperature,
        emissivity: zone.emissivity,
        opticalDepth: zone.opticalDepth,
        openingAngleDeg: zone.openingAngleDeg,
        kinkRisk: zone.kinkRisk,
      })),
      recentEvents: this.events.slice(-20),
    };
  }
}

