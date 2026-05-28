/*
 * Unit conversion helpers for the standalone Kerr-Newman physics core.
 *
 * The simulation modules use geometric units with G = c = 4 pi epsilon_0 = 1.
 * This file maps those code units to SI once a physical black-hole mass is
 * chosen for the dimensionless mass parameter M used in the simulation.
 */

import {
  getObjectSpec,
} from "./object-library.mjs";

export const SI_CONSTANTS = Object.freeze({
  speedOfLight: 299792458,
  gravitationalConstant: 6.67430e-11,
  vacuumPermittivity: 8.8541878128e-12,
  vacuumPermeability: 1.25663706212e-6,
  solarMassKg: 1.98847e30,
  kilometerMeters: 1000,
  gaussTesla: 1e-4,
  daySeconds: 86400,
  yearSeconds: 31557600,
});

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return value;
}

function maybe(value, convert) {
  return Number.isFinite(value) ? convert(value) : value;
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = clonePlain(item);
  return out;
}

export function solarMassesToKg(solarMasses) {
  return solarMasses * SI_CONSTANTS.solarMassKg;
}

export function kgToSolarMasses(kg) {
  return kg / SI_CONSTANTS.solarMassKg;
}

export function kilometersToMeters(kilometers) {
  return kilometers * SI_CONSTANTS.kilometerMeters;
}

export function metersToKilometers(meters) {
  return meters / SI_CONSTANTS.kilometerMeters;
}

export function gaussToTesla(gauss) {
  return gauss * SI_CONSTANTS.gaussTesla;
}

export function teslaToGauss(tesla) {
  return tesla / SI_CONSTANTS.gaussTesla;
}

export function createUnitScale(options = {}) {
  const codeMass = assertPositive(
    finiteOr(options.codeMass, options.params?.M ?? 1),
    "codeMass",
  );
  const physicalMassKg = assertPositive(
    Number.isFinite(options.physicalMassKg)
      ? options.physicalMassKg
      : solarMassesToKg(finiteOr(options.physicalMassSolarMasses, 1)),
    "physicalMassKg",
  );
  const massUnitKg = physicalMassKg / codeMass;
  const lengthUnitMeters = (SI_CONSTANTS.gravitationalConstant * massUnitKg) /
    (SI_CONSTANTS.speedOfLight ** 2);
  const timeUnitSeconds = lengthUnitMeters / SI_CONSTANTS.speedOfLight;
  const energyUnitJoules = massUnitKg * SI_CONSTANTS.speedOfLight ** 2;
  const powerUnitWatts = energyUnitJoules / timeUnitSeconds;
  const chargeUnitCoulombs = lengthUnitMeters * SI_CONSTANTS.speedOfLight ** 2 /
    Math.sqrt(SI_CONSTANTS.gravitationalConstant / (4 * Math.PI * SI_CONSTANTS.vacuumPermittivity));
  const magneticFieldUnitTesla = 1 /
    (lengthUnitMeters * Math.sqrt(SI_CONSTANTS.gravitationalConstant /
      (SI_CONSTANTS.vacuumPermeability * SI_CONSTANTS.speedOfLight ** 4)));

  return Object.freeze({
    system: "SI",
    source: "geometric-units",
    codeMass,
    physicalMassKg,
    physicalMassSolarMasses: kgToSolarMasses(physicalMassKg),
    massUnitKg,
    massUnitSolarMasses: kgToSolarMasses(massUnitKg),
    lengthUnitMeters,
    lengthUnitKilometers: metersToKilometers(lengthUnitMeters),
    timeUnitSeconds,
    energyUnitJoules,
    powerUnitWatts,
    chargeUnitCoulombs,
    magneticFieldUnitTesla,
    magneticFieldUnitGauss: teslaToGauss(magneticFieldUnitTesla),
  });
}

export function codeLengthToMeters(scale, value) {
  return value * scale.lengthUnitMeters;
}

export function metersToCodeLength(scale, meters) {
  return meters / scale.lengthUnitMeters;
}

export function codeLengthToKilometers(scale, value) {
  return metersToKilometers(codeLengthToMeters(scale, value));
}

export function kilometersToCodeLength(scale, kilometers) {
  return metersToCodeLength(scale, kilometersToMeters(kilometers));
}

export function codeTimeToSeconds(scale, value) {
  return value * scale.timeUnitSeconds;
}

export function secondsToCodeTime(scale, seconds) {
  return seconds / scale.timeUnitSeconds;
}

export function codeMassToKg(scale, value) {
  return value * scale.massUnitKg;
}

export function kgToCodeMass(scale, kg) {
  return kg / scale.massUnitKg;
}

export function codeMassToSolarMasses(scale, value) {
  return kgToSolarMasses(codeMassToKg(scale, value));
}

export function solarMassesToCodeMass(scale, solarMasses) {
  return kgToCodeMass(scale, solarMassesToKg(solarMasses));
}

export function codeChargeToCoulombs(scale, value) {
  return value * scale.chargeUnitCoulombs;
}

export function coulombsToCodeCharge(scale, coulombs) {
  return coulombs / scale.chargeUnitCoulombs;
}

export function codeMagneticFieldToTesla(scale, value) {
  return value * scale.magneticFieldUnitTesla;
}

export function teslaToCodeMagneticField(scale, tesla) {
  return tesla / scale.magneticFieldUnitTesla;
}

export function codeMagneticFieldToGauss(scale, value) {
  return teslaToGauss(codeMagneticFieldToTesla(scale, value));
}

export function gaussToCodeMagneticField(scale, gauss) {
  return teslaToCodeMagneticField(scale, gaussToTesla(gauss));
}

export function codeEnergyToJoules(scale, value) {
  return value * scale.energyUnitJoules;
}

export function joulesToCodeEnergy(scale, joules) {
  return joules / scale.energyUnitJoules;
}

export function codePowerToWatts(scale, value) {
  return value * scale.powerUnitWatts;
}

export function wattsToCodePower(scale, watts) {
  return watts / scale.powerUnitWatts;
}

export function codeMassRateToKgPerSecond(scale, value) {
  return codeMassToKg(scale, value) / scale.timeUnitSeconds;
}

export function kgPerSecondToCodeMassRate(scale, kgPerSecond) {
  return kgToCodeMass(scale, kgPerSecond * scale.timeUnitSeconds);
}

export function physicalizeGeometrySummary(scale, geometry) {
  const out = clonePlain(geometry);
  if (out.params) {
    out.physicalParams = {
      M_kg: codeMassToKg(scale, out.params.M),
      M_solarMasses: codeMassToSolarMasses(scale, out.params.M),
      Q_coulombs: codeChargeToCoulombs(scale, out.params.Q),
      a_meters: codeLengthToMeters(scale, out.params.a),
      a_kilometers: codeLengthToKilometers(scale, out.params.a),
      B_tesla: codeMagneticFieldToTesla(scale, out.params.B),
      B_gauss: codeMagneticFieldToGauss(scale, out.params.B),
    };
  }
  if (out.horizons) {
    out.horizonsSI = {
      rPlusMeters: maybe(out.horizons.rPlus, (value) => codeLengthToMeters(scale, value)),
      rPlusKilometers: maybe(out.horizons.rPlus, (value) => codeLengthToKilometers(scale, value)),
      rMinusMeters: maybe(out.horizons.rMinus, (value) => codeLengthToMeters(scale, value)),
      rMinusKilometers: maybe(out.horizons.rMinus, (value) => codeLengthToKilometers(scale, value)),
    };
  }
  out.lengthsSI = {
    staticLimitEquatorKilometers: maybe(out.staticLimitEquator, (value) => codeLengthToKilometers(scale, value)),
    staticLimitPoleKilometers: maybe(out.staticLimitPole, (value) => codeLengthToKilometers(scale, value)),
    iscoProgradeKilometers: maybe(out.iscoProgradeApprox, (value) => codeLengthToKilometers(scale, value)),
    iscoRetrogradeKilometers: maybe(out.iscoRetrogradeApprox, (value) => codeLengthToKilometers(scale, value)),
    photonOrbitProgradeKilometers: maybe(out.photonOrbitProgradeApprox, (value) => codeLengthToKilometers(scale, value)),
    photonOrbitRetrogradeKilometers: maybe(out.photonOrbitRetrogradeApprox, (value) => codeLengthToKilometers(scale, value)),
  };
  out.ratesSI = {
    horizonAngularVelocityPerSecond: maybe(out.horizonAngularVelocity, (value) => value / scale.timeUnitSeconds),
    surfaceGravityMetersPerSecond2: maybe(out.surfaceGravity, (value) => value * SI_CONSTANTS.speedOfLight ** 2 / scale.lengthUnitMeters),
  };
  out.areaSI = {
    horizonAreaSquareMeters: maybe(out.horizonArea, (value) => value * scale.lengthUnitMeters ** 2),
    horizonAreaSquareKilometers: maybe(out.horizonArea, (value) => value * scale.lengthUnitKilometers ** 2),
  };
  return out;
}

export function physicalizeObjectSpec(scale, specOrTypeId) {
  const spec = typeof specOrTypeId === "string" ? getObjectSpec(specOrTypeId) : clonePlain(specOrTypeId);
  return {
    ...spec,
    physical: {
      radiusMeters: maybe(spec.radius, (value) => codeLengthToMeters(scale, value)),
      radiusKilometers: maybe(spec.radius, (value) => codeLengthToKilometers(scale, value)),
      restMassKg: maybe(spec.restMass, (value) => codeMassToKg(scale, value)),
      restMassSolarMasses: maybe(spec.restMass, (value) => codeMassToSolarMasses(scale, value)),
      chargeCoulombs: maybe(spec.chargeToMass * spec.restMass, (value) => codeChargeToCoulombs(scale, value)),
      crossSectionSquareMeters: maybe(spec.crossSection, (value) => value * scale.lengthUnitMeters ** 2),
      crossSectionSquareKilometers: maybe(spec.crossSection, (value) => value * scale.lengthUnitKilometers ** 2),
    },
  };
}

export function physicalizeObjectState(scale, state, specOrTypeId) {
  const spec = specOrTypeId
    ? (typeof specOrTypeId === "string" ? getObjectSpec(specOrTypeId) : specOrTypeId)
    : null;
  const massCode = finiteOr(state.mass, spec?.restMass);
  const radiusCode = finiteOr(state.radius, spec?.radius);
  const chargeToMass = finiteOr(state.chargeToMass, spec?.chargeToMass);
  const chargeCode = Number.isFinite(chargeToMass) && Number.isFinite(massCode)
    ? chargeToMass * massCode
    : NaN;
  const specificAngularMomentumCode = state.Pphi ?? state.angularMomentumZ;
  const specificEnergy = state.energy ?? (Number.isFinite(state.Pt) ? -state.Pt : NaN);

  return {
    id: state.id,
    name: state.name,
    kind: state.kind,
    status: state.status,
    libraryType: state.libraryType ?? spec?.id,
    coordinates: {
      tSeconds: maybe(state.t, (value) => codeTimeToSeconds(scale, value)),
      rMeters: maybe(state.r, (value) => codeLengthToMeters(scale, value)),
      rKilometers: maybe(state.r, (value) => codeLengthToKilometers(scale, value)),
      thetaRadians: state.theta,
      phiRadians: state.phi,
    },
    body: {
      massKg: maybe(massCode, (value) => codeMassToKg(scale, value)),
      massSolarMasses: maybe(massCode, (value) => codeMassToSolarMasses(scale, value)),
      radiusMeters: maybe(radiusCode, (value) => codeLengthToMeters(scale, value)),
      radiusKilometers: maybe(radiusCode, (value) => codeLengthToKilometers(scale, value)),
      chargeCoulombs: maybe(chargeCode, (value) => codeChargeToCoulombs(scale, value)),
    },
    dynamics: {
      specificEnergy,
      energyJoules: Number.isFinite(specificEnergy) && Number.isFinite(massCode)
        ? specificEnergy * codeEnergyToJoules(scale, massCode)
        : NaN,
      specificAngularMomentumMeters: maybe(specificAngularMomentumCode, (value) => codeLengthToMeters(scale, value)),
      specificAngularMomentumM2PerSecond: maybe(
        specificAngularMomentumCode,
        (value) => codeLengthToMeters(scale, value) * SI_CONSTANTS.speedOfLight,
      ),
      hamiltonian: state.hamiltonian ?? state.lastHamiltonian ?? state.initialHamiltonian,
      hamiltonianDrift: state.hamiltonianDrift,
    },
  };
}

export function physicalizeTrajectoryResult(scale, trajectory) {
  const out = clonePlain(trajectory);
  const convertFrame = (frame) => ({
    ...frame,
    affineSeconds: maybe(frame.affine, (value) => codeTimeToSeconds(scale, value)),
    rKilometers: maybe(frame.r, (value) => codeLengthToKilometers(scale, value)),
    tSeconds: maybe(frame.t, (value) => codeTimeToSeconds(scale, value)),
    blLike: frame.blLike ? {
      ...frame.blLike,
      rKilometers: maybe(frame.blLike.r, (value) => codeLengthToKilometers(scale, value)),
    } : undefined,
    ks: frame.ks ? {
      ...frame.ks,
      tSeconds: maybe(frame.ks.t, (value) => codeTimeToSeconds(scale, value)),
      xKilometers: maybe(frame.ks.x, (value) => codeLengthToKilometers(scale, value)),
      yKilometers: maybe(frame.ks.y, (value) => codeLengthToKilometers(scale, value)),
      zKilometers: maybe(frame.ks.z, (value) => codeLengthToKilometers(scale, value)),
    } : undefined,
  });

  if (out.initialState?.r) out.initialStateSI = physicalizeObjectState(scale, out.initialState);
  if (out.finalState?.r) out.finalStateSI = physicalizeObjectState(scale, out.finalState);
  if (out.initialState?.blLike) {
    out.initialStateSI = {
      ...out.initialState,
      blLike: {
        ...out.initialState.blLike,
        rKilometers: codeLengthToKilometers(scale, out.initialState.blLike.r),
      },
    };
  }
  if (out.finalState?.blLike) {
    out.finalStateSI = {
      ...out.finalState,
      blLike: {
        ...out.finalState.blLike,
        rKilometers: codeLengthToKilometers(scale, out.finalState.blLike.r),
      },
    };
  }
  if (out.result) {
    out.result.affineSeconds = maybe(out.result.affine, (value) => codeTimeToSeconds(scale, value));
    out.result.framesSI = Array.isArray(out.result.frames)
      ? out.result.frames.map(convertFrame)
      : [];
  }
  return out;
}

export function physicalizeJetSnapshot(scale, snapshot) {
  const out = clonePlain(snapshot);
  out.timeSeconds = maybe(snapshot.time, (value) => codeTimeToSeconds(scale, value));
  if (snapshot.input) {
    out.inputSI = {
      accretionRateKgPerSecond: maybe(
        snapshot.input.accretionRate,
        (value) => codeMassRateToKgPerSecond(scale, value),
      ),
      magneticFieldTesla: maybe(
        snapshot.input.magneticField,
        (value) => codeMagneticFieldToTesla(scale, value),
      ),
      magneticFieldGauss: maybe(
        snapshot.input.magneticField,
        (value) => codeMagneticFieldToGauss(scale, value),
      ),
      massLoadingKgPerSecond: maybe(
        snapshot.input.massLoading,
        (value) => codeMassRateToKgPerSecond(scale, value),
      ),
    };
  }
  if (snapshot.global) {
    out.globalSI = {
      bzPowerWatts: maybe(snapshot.global.bzPower, (value) => codePowerToWatts(scale, value)),
      accretionLuminosityWatts: maybe(snapshot.global.accretionLuminosity, (value) => codePowerToWatts(scale, value)),
      totalPowerWatts: maybe(snapshot.global.totalPower, (value) => codePowerToWatts(scale, value)),
      radiativeLuminosityWatts: maybe(snapshot.global.radiativeLuminosity, (value) => codePowerToWatts(scale, value)),
      reconnectionLuminosityWatts: maybe(snapshot.global.reconnectionLuminosity, (value) => codePowerToWatts(scale, value)),
      massFluxKgPerSecond: maybe(snapshot.global.massFlux, (value) => codeMassRateToKgPerSecond(scale, value)),
      magneticFluxWeberApprox: maybe(
        snapshot.global.magneticFlux,
        (value) => codeMagneticFieldToTesla(scale, value) * scale.lengthUnitMeters ** 2,
      ),
    };
  }
  out.zonesSI = Array.isArray(snapshot.zones)
    ? snapshot.zones.map((zone) => ({
      index: zone.index,
      zKilometers: maybe(zone.z, (value) => codeLengthToKilometers(scale, value)),
      radiusKilometers: maybe(zone.radius, (value) => codeLengthToKilometers(scale, value)),
      poloidalBTesla: maybe(zone.poloidalB, (value) => codeMagneticFieldToTesla(scale, value)),
      toroidalBTesla: maybe(zone.toroidalB, (value) => codeMagneticFieldToTesla(scale, value)),
      emissivityWattsApprox: maybe(zone.emissivity, (value) => codePowerToWatts(scale, value)),
      gamma: zone.gamma,
      beta: zone.beta,
      magnetization: zone.magnetization,
      kinkRisk: zone.kinkRisk,
    }))
    : [];
  return out;
}

export function summarizeScale(scale) {
  return {
    physicalMassSolarMasses: scale.physicalMassSolarMasses,
    codeMass: scale.codeMass,
    oneCodeLength: {
      meters: scale.lengthUnitMeters,
      kilometers: scale.lengthUnitKilometers,
    },
    oneCodeTime: {
      seconds: scale.timeUnitSeconds,
    },
    oneCodeMass: {
      kg: scale.massUnitKg,
      solarMasses: scale.massUnitSolarMasses,
    },
    oneCodeCharge: {
      coulombs: scale.chargeUnitCoulombs,
    },
    oneCodeMagneticField: {
      tesla: scale.magneticFieldUnitTesla,
      gauss: scale.magneticFieldUnitGauss,
    },
    oneCodePower: {
      watts: scale.powerUnitWatts,
    },
  };
}
