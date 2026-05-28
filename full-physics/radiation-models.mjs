/*
 * Add-only radiation model preparation utilities.
 *
 * These are reduced, renderer-facing hooks rather than a full radiation
 * transport solver. They provide thin-disc brightness profiles and
 * synchrotron-inspired emissivity estimates that can be swapped out later.
 */

import {
  clamp,
  horizons,
  iscoRadiusKerrApprox,
  orbitalOmegaKerrNewman,
  sanitizeParams,
} from "./kn-full-physics.mjs";
import {
  dopplerBoost,
  estimateEquatorialDiscHit,
} from "./ray-tracing.mjs";

const EPS = 1e-12;

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function diskInnerRadius(params = {}, options = {}) {
  const p = sanitizeParams(params);
  if (Number.isFinite(options.innerR)) return options.innerR;
  const h = horizons(p);
  const isco = iscoRadiusKerrApprox(p, options.prograde ?? true);
  return Math.max(isco, h.naked ? 1e-3 : h.rPlus + 1e-3);
}

export function novikovThorneLikeFlux(params = {}, r, options = {}) {
  const p = sanitizeParams(params);
  const mdot = Math.max(0, options.accretionRate ?? 0.05);
  const innerR = diskInnerRadius(p, options);
  if (!Number.isFinite(r) || r <= innerR) return 0;
  const noTorqueFactor = Math.max(0, 1 - Math.sqrt(innerR / Math.max(r, EPS)));
  const relativisticDimming = 1 / (1 + 0.35 * Math.abs(p.a / p.M) * (innerR / r) ** 1.5);
  return (3 * p.M * mdot / (8 * Math.PI * r ** 3)) * noTorqueFactor * relativisticDimming;
}

export function diskTemperature(params = {}, r, options = {}) {
  const flux = Math.max(0, novikovThorneLikeFlux(params, r, options));
  const temperatureScale = options.temperatureScale ?? 1;
  return temperatureScale * flux ** 0.25;
}

export function diskSurfaceBrightness(params = {}, r, options = {}) {
  const temperature = diskTemperature(params, r, options);
  const spectralIndex = options.spectralIndex ?? 0.7;
  const frequency = Math.max(options.frequency ?? 1, EPS);
  const colorCorrection = options.colorCorrection ?? 1.7;
  const opticalDepth = Math.max(0, options.opticalDepth ?? 2.5 * (diskInnerRadius(params, options) / Math.max(r, EPS)) ** 0.75);
  const thermal = temperature ** 4 / (frequency ** spectralIndex + EPS);
  const attenuation = 1 - Math.exp(-opticalDepth);
  return {
    r,
    temperature,
    flux: novikovThorneLikeFlux(params, r, options),
    opticalDepth,
    spectralIndex,
    frequency,
    colorTemperature: temperature * colorCorrection,
    bolometric: thermal * attenuation,
    specificIntensity: thermal * attenuation / colorCorrection ** 4,
  };
}

export function sampleDiskBrightnessProfile(params = {}, options = {}) {
  const p = sanitizeParams(params);
  const count = Math.max(2, options.count ?? 96);
  const innerR = diskInnerRadius(p, options);
  const outerR = options.outerR ?? innerR * 12;
  const samples = [];
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1);
    const r = innerR * (outerR / innerR) ** f;
    samples.push(diskSurfaceBrightness(p, r, options));
  }
  const peak = samples.reduce((best, item) => (
    item.specificIntensity > best.specificIntensity ? item : best
  ), samples[0]);
  return {
    params: p,
    innerR,
    outerR,
    peak,
    samples,
  };
}

export function localDiskVelocity(params = {}, r, options = {}) {
  const p = sanitizeParams(params);
  const omega = orbitalOmegaKerrNewman(p, r, options.prograde ?? true);
  return {
    omega,
    prograde: options.prograde ?? true,
  };
}

export function synchrotronEmissivity(plasma = {}, options = {}) {
  const density = Math.max(0, finiteOr(plasma.density, 1e-5));
  const poloidalB = finiteOr(plasma.poloidalB, plasma.magneticField ?? 0);
  const toroidalB = finiteOr(plasma.toroidalB, 0);
  const magneticField = Math.hypot(poloidalB, toroidalB);
  const gamma = Math.max(1, finiteOr(plasma.gamma, 1));
  const temperature = Math.max(0, finiteOr(plasma.temperature, 0));
  const frequency = Math.max(options.frequency ?? 1, EPS);
  const spectralIndex = options.spectralIndex ?? 0.65;
  const opticalDepth = Math.max(0, finiteOr(plasma.opticalDepth, options.opticalDepth ?? 0));
  const electronTemperatureBoost = 1 + Math.sqrt(temperature);
  const emissivity = (options.normalization ?? 0.02) *
    density *
    magneticField ** (1 + spectralIndex) *
    gamma ** 2 *
    electronTemperatureBoost /
    frequency ** spectralIndex;
  const absorption = 1 - Math.exp(-opticalDepth);
  return {
    density,
    magneticField,
    gamma,
    temperature,
    frequency,
    spectralIndex,
    opticalDepth,
    emissivity,
    absorbedIntensity: emissivity * absorption,
    opticallyThinIntensity: emissivity * Math.exp(-0.15 * opticalDepth),
    criticalFrequency: gamma * gamma * Math.max(magneticField, EPS),
  };
}

export function jetZoneEmission(zone = {}, options = {}) {
  const synch = synchrotronEmissivity(zone, options);
  const beaming = dopplerBoost(options.dopplerFactor ?? 1, synch.spectralIndex);
  return {
    ...synch,
    dopplerFactor: options.dopplerFactor ?? 1,
    beaming,
    observedIntensity: synch.opticallyThinIntensity * beaming,
    kinkRisk: finiteOr(zone.kinkRisk, 0),
    magnetization: finiteOr(zone.magnetization, 0),
  };
}

export function renderDiscHit(params = {}, hit = {}, options = {}) {
  if (!hit.hit) return { hit: false, observedIntensity: 0 };
  const rest = diskSurfaceBrightness(params, hit.r, options);
  const g = options.redshiftFactor ?? 1;
  const spectralIndex = options.spectralIndex ?? rest.spectralIndex;
  const inclinationBoost = clamp(Math.abs(Math.cos(options.inclination ?? Math.PI / 3)), 0.15, 1);
  const observedIntensity = rest.specificIntensity * dopplerBoost(g, spectralIndex) * inclinationBoost;
  return {
    hit: true,
    r: hit.r,
    phi: hit.phi,
    affine: hit.affine,
    restFrame: rest,
    redshiftFactor: g,
    inclinationBoost,
    observedIntensity,
  };
}

export function renderRayRadiance(params = {}, trace, options = {}) {
  const disc = options.disc ?? {};
  const hit = estimateEquatorialDiscHit(trace, {
    innerR: disc.innerR ?? diskInnerRadius(params, disc),
    outerR: disc.outerR ?? diskInnerRadius(params, disc) * 12,
  });
  if (!hit.hit) {
    return {
      hit: false,
      status: trace.classification?.status ?? "unknown",
      observedIntensity: options.backgroundIntensity ?? 0,
    };
  }
  return renderDiscHit(params, hit, {
    ...options,
    ...disc,
  });
}

export function composeFalseColor(intensity, options = {}) {
  const exposure = options.exposure ?? 1;
  const gamma = options.gamma ?? 2.2;
  const value = clamp(1 - Math.exp(-Math.max(0, intensity) * exposure), 0, 1);
  const corrected = value ** (1 / gamma);
  const temperatureTint = clamp(options.temperatureTint ?? 0.55, 0, 1);
  return {
    r: clamp(corrected * (1.0 + 0.35 * temperatureTint), 0, 1),
    g: clamp(corrected * (0.65 + 0.25 * temperatureTint), 0, 1),
    b: clamp(corrected * (0.35 + 0.45 * (1 - temperatureTint)), 0, 1),
    a: value,
  };
}
