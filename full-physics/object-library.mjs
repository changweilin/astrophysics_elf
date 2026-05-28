/*
 * Object library for the standalone Kerr-Newman physics core.
 *
 * The browser demo has a small visual object picker. This module turns that
 * idea into a reusable physical catalog with initialization helpers for the
 * full-physics simulator. It remains additive-only and does not touch the app.
 */

import {
  clamp,
  horizons,
  iscoRadiusKerrApprox,
  makeEquatorialCircularState,
  makeMassiveState,
  makePhotonState,
  tidalStressEstimate,
} from "./kn-full-physics.mjs";

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = clonePlain(item);
  return out;
}

export const OBJECT_LIBRARY = deepFreeze({
  rockyPlanet: {
    id: "rockyPlanet",
    label: "Rocky planet",
    kind: "planet",
    family: "natural",
    description: "Dense terrestrial body with moderate tidal survivability.",
    radius: 0.30,
    binding: 2.5,
    chargeToMass: 0,
    restMass: 1,
    crossSection: 0.28,
    defaultOrbit: { mode: "circular", r: 12, prograde: true },
    material: {
      density: 5.5,
      conductivity: 0.08,
      magnetization: 0.01,
      radiativeEfficiency: 0.02,
    },
  },
  gasGiant: {
    id: "gasGiant",
    label: "Gas giant",
    kind: "gas",
    family: "natural",
    description: "Low-binding extended envelope; easy to tidally strip.",
    radius: 0.58,
    binding: 0.85,
    chargeToMass: 0,
    restMass: 0.7,
    crossSection: 0.75,
    defaultOrbit: { mode: "circular", r: 16, prograde: true },
    material: {
      density: 1.3,
      conductivity: 0.16,
      magnetization: 0.04,
      radiativeEfficiency: 0.08,
    },
  },
  mainSequenceStar: {
    id: "mainSequenceStar",
    label: "Main-sequence star",
    kind: "star",
    family: "stellar",
    description: "Self-gravitating plasma body with strong luminosity response.",
    radius: 0.72,
    binding: 5.5,
    chargeToMass: 0,
    restMass: 8,
    crossSection: 1.6,
    defaultOrbit: { mode: "eccentric", r: 22, velocity: [-0.035, 0, 0.19] },
    material: {
      density: 1.4,
      conductivity: 0.9,
      magnetization: 0.18,
      radiativeEfficiency: 0.16,
    },
  },
  whiteDwarf: {
    id: "whiteDwarf",
    label: "White dwarf",
    kind: "compact-star",
    family: "stellar",
    description: "Compact degenerate object; high binding and small radius.",
    radius: 0.08,
    binding: 35,
    chargeToMass: 0,
    restMass: 5,
    crossSection: 0.08,
    defaultOrbit: { mode: "circular", r: 9, prograde: true },
    material: {
      density: 1000000,
      conductivity: 0.7,
      magnetization: 0.12,
      radiativeEfficiency: 0.05,
    },
  },
  neutronStar: {
    id: "neutronStar",
    label: "Neutron star",
    kind: "compact-star",
    family: "stellar",
    description: "Very compact test object with strong magnetic coupling.",
    radius: 0.035,
    binding: 120,
    chargeToMass: 0.015,
    restMass: 12,
    crossSection: 0.035,
    defaultOrbit: { mode: "circular", r: 7.5, prograde: true },
    material: {
      density: 100000000000000,
      conductivity: 0.95,
      magnetization: 0.75,
      radiativeEfficiency: 0.10,
    },
  },
  crewedShip: {
    id: "crewedShip",
    label: "Crewed ship",
    kind: "ship",
    family: "engineered",
    description: "Small controllable craft with high structural binding.",
    radius: 0.018,
    binding: 8,
    chargeToMass: 0,
    restMass: 0.02,
    crossSection: 0.01,
    defaultOrbit: { mode: "circular", r: 9, prograde: true },
    material: {
      density: 0.2,
      conductivity: 0.55,
      magnetization: 0.02,
      radiativeEfficiency: 0.01,
    },
    systems: {
      maxDeltaV: 0.35,
      thermalLimit: 0.65,
      safeTidalStress: 0.35,
    },
  },
  neutralProbe: {
    id: "neutralProbe",
    label: "Neutral probe",
    kind: "probe",
    family: "engineered",
    description: "Small inertial probe for geodesic and tidal measurements.",
    radius: 0.006,
    binding: 60,
    chargeToMass: 0,
    restMass: 0.001,
    crossSection: 0.001,
    defaultOrbit: { mode: "eccentric", r: 13, velocity: [-0.025, 0, 0.30] },
    material: {
      density: 0.4,
      conductivity: 0.35,
      magnetization: 0.01,
      radiativeEfficiency: 0.005,
    },
  },
  chargedProbePositive: {
    id: "chargedProbePositive",
    label: "Charged probe +",
    kind: "probe",
    family: "engineered",
    description: "Positive charge-to-mass probe for electromagnetic coupling.",
    radius: 0.006,
    binding: 60,
    chargeToMass: 0.20,
    restMass: 0.001,
    crossSection: 0.001,
    defaultOrbit: { mode: "eccentric", r: 13, velocity: [-0.025, 0, 0.31] },
    material: {
      density: 0.4,
      conductivity: 0.42,
      magnetization: 0.04,
      radiativeEfficiency: 0.006,
    },
  },
  chargedProbeNegative: {
    id: "chargedProbeNegative",
    label: "Charged probe -",
    kind: "probe",
    family: "engineered",
    description: "Negative charge-to-mass probe for opposite Lorentz response.",
    radius: 0.006,
    binding: 60,
    chargeToMass: -0.20,
    restMass: 0.001,
    crossSection: 0.001,
    defaultOrbit: { mode: "eccentric", r: 13, velocity: [-0.025, 0, 0.31] },
    material: {
      density: 0.4,
      conductivity: 0.42,
      magnetization: 0.04,
      radiativeEfficiency: 0.006,
    },
  },
  photonBeam: {
    id: "photonBeam",
    label: "Photon beam",
    kind: "photon",
    family: "radiation",
    description: "Null ray packet for lensing and photon-ring experiments.",
    radius: 0,
    binding: Infinity,
    chargeToMass: 0,
    restMass: 0,
    crossSection: 0,
    defaultOrbit: { mode: "photon", r: 18, direction: [-0.16, 0, 0.987] },
    material: {
      density: 0,
      conductivity: 0,
      magnetization: 0,
      radiativeEfficiency: 1,
    },
  },
  dustParcel: {
    id: "dustParcel",
    label: "Dust parcel",
    kind: "disc",
    family: "plasma",
    description: "Cold accretion material parcel for disc feeding.",
    radius: 0.002,
    binding: Infinity,
    chargeToMass: 0.005,
    restMass: 0.0001,
    crossSection: 0.003,
    defaultOrbit: { mode: "circular", r: 18, prograde: true, radialVelocity: -0.002 },
    material: {
      density: 0.05,
      conductivity: 0.6,
      magnetization: 0.18,
      radiativeEfficiency: 0.12,
    },
  },
  magnetizedPlasmaBlob: {
    id: "magnetizedPlasmaBlob",
    label: "Magnetized plasma blob",
    kind: "plasma",
    family: "plasma",
    description: "Hot conducting plasma knot for reconnection experiments.",
    radius: 0.035,
    binding: 0.4,
    chargeToMass: 0.08,
    restMass: 0.002,
    crossSection: 0.04,
    defaultOrbit: { mode: "eccentric", r: 10.5, velocity: [-0.035, 0, 0.36] },
    material: {
      density: 0.02,
      conductivity: 0.98,
      magnetization: 0.8,
      radiativeEfficiency: 0.28,
    },
  },
});

export const OBJECT_GROUPS = deepFreeze({
  natural: ["rockyPlanet", "gasGiant"],
  stellar: ["mainSequenceStar", "whiteDwarf", "neutronStar"],
  engineered: ["crewedShip", "neutralProbe", "chargedProbePositive", "chargedProbeNegative"],
  radiation: ["photonBeam"],
  plasma: ["dustParcel", "magnetizedPlasmaBlob"],
});

export const OBJECT_SCENARIOS = deepFreeze({
  baselineLab: {
    id: "baselineLab",
    label: "Baseline lab",
    objects: [
      ["rockyPlanet", { name: "PL-baseline", r: 12, phi: 0.0 }],
      ["gasGiant", { name: "GG-baseline", r: 16, phi: 2.2, prograde: false }],
      ["crewedShip", { name: "SS-observer", r: 9, phi: -1.0 }],
      ["neutralProbe", { name: "PR-geodesic", r: 13, phi: 0.65 }],
    ],
  },
  tidalSurvey: {
    id: "tidalSurvey",
    label: "Tidal survey",
    objects: [
      ["gasGiant", { name: "GG-strip-test", mode: "eccentric", r: 8.5, velocity: [-0.08, 0, 0.32] }],
      ["mainSequenceStar", { name: "ST-disruption-test", mode: "eccentric", r: 14, velocity: [-0.055, 0, 0.24] }],
      ["whiteDwarf", { name: "WD-control", r: 7.8 }],
    ],
  },
  chargeCoupling: {
    id: "chargeCoupling",
    label: "Charge coupling",
    objects: [
      ["chargedProbePositive", { name: "PR-positive", r: 12, phi: 0.2 }],
      ["chargedProbeNegative", { name: "PR-negative", r: 12, phi: -0.2 }],
      ["neutralProbe", { name: "PR-neutral", r: 12, phi: 0.0 }],
    ],
  },
  photonRing: {
    id: "photonRing",
    label: "Photon ring",
    objects: [
      ["photonBeam", { name: "PH-graze-a", r: 18, phi: -0.5, direction: [-0.18, 0, 0.984] }],
      ["photonBeam", { name: "PH-graze-b", r: 18, phi: 0.0, direction: [-0.08, 0, 0.997] }],
      ["photonBeam", { name: "PH-capture-test", r: 18, phi: 0.5, direction: [-0.34, 0, 0.94] }],
    ],
  },
});

export function listObjectTypes(filter = {}) {
  const entries = Object.values(OBJECT_LIBRARY);
  return entries
    .filter((spec) => !filter.family || spec.family === filter.family)
    .filter((spec) => !filter.kind || spec.kind === filter.kind)
    .map((spec) => ({
      id: spec.id,
      label: spec.label,
      kind: spec.kind,
      family: spec.family,
      description: spec.description,
    }));
}

export function getObjectSpec(typeId) {
  const spec = OBJECT_LIBRARY[typeId];
  if (!spec) throw new Error(`Unknown object type: ${typeId}`);
  return clonePlain(spec);
}

export function rocheRadiusEstimate(params, objectOrType) {
  const spec = typeof objectOrType === "string" ? OBJECT_LIBRARY[objectOrType] : objectOrType;
  if (!spec || !Number.isFinite(spec.binding) || spec.binding <= 0) return Infinity;
  const M = params.M ?? 1;
  return Math.cbrt((2 * M * Math.max(spec.radius, 0)) / Math.max(spec.binding, 1e-9));
}

export function objectDiagnostics(params, state, objectOrType) {
  const spec = typeof objectOrType === "string" ? OBJECT_LIBRARY[objectOrType] : objectOrType;
  const tidal = tidalStressEstimate(params, {
    ...state,
    radius: state.radius ?? spec?.radius ?? 0,
    binding: state.binding ?? spec?.binding ?? 1,
  });
  const h = horizons(params);
  const roche = spec ? rocheRadiusEstimate(params, spec) : Infinity;
  return {
    tidal,
    rocheRadius: roche,
    horizonMargin: h.naked ? Infinity : state.r - h.rPlus,
    survival: tidal.normalized < 0.5 ? "comfortable" :
      tidal.normalized < 1 ? "stressed" : "disrupted",
  };
}

function mergedPlacement(spec, placement = {}) {
  return {
    ...spec.defaultOrbit,
    ...placement,
  };
}

export function createObjectState(params, typeId, placement = {}) {
  const spec = getObjectSpec(typeId);
  const p = mergedPlacement(spec, placement);
  const name = p.name ?? spec.label;
  const base = {
    name,
    kind: spec.kind,
    radius: p.radius ?? spec.radius,
    binding: p.binding ?? spec.binding,
    chargeToMass: p.chargeToMass ?? spec.chargeToMass,
    mass: p.mass ?? spec.restMass,
    phi: p.phi ?? 0,
    t: p.t ?? 0,
  };

  if (spec.kind === "photon" || p.mode === "photon") {
    return {
      ...makePhotonState(params, {
        ...base,
        r: p.r ?? 18,
        theta: p.theta ?? Math.PI / 2,
        direction: p.direction ?? [-0.16, 0, 0.987],
        localEnergy: p.localEnergy ?? 1,
      }),
      libraryType: typeId,
      material: spec.material,
    };
  }

  if (p.mode === "circular") {
    return {
      ...makeEquatorialCircularState(params, {
        ...base,
        r: p.r ?? 10,
        prograde: p.prograde ?? true,
        radialVelocity: p.radialVelocity ?? 0,
      }),
      libraryType: typeId,
      material: spec.material,
      systems: spec.systems,
    };
  }

  const safeR = p.r ?? Math.max(8, iscoRadiusKerrApprox(params, true) * 1.4);
  return {
    ...makeMassiveState(params, {
      ...base,
      r: safeR,
      theta: clamp(p.theta ?? Math.PI / 2, 1e-7, Math.PI - 1e-7),
      velocity: p.velocity ?? [-0.02, 0, 0.25],
    }),
    libraryType: typeId,
    material: spec.material,
    systems: spec.systems,
  };
}

export function addLibraryObject(simulator, typeId, placement = {}) {
  if (!simulator || typeof simulator.addParticle !== "function") {
    throw new Error("addLibraryObject requires a KerrNewmanSimulator-like instance.");
  }
  const state = createObjectState(simulator.params, typeId, placement);
  return simulator.addParticle(state);
}

export function seedObjectScenario(simulator, scenarioId, overrides = {}) {
  const scenario = OBJECT_SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Unknown object scenario: ${scenarioId}`);
  const ids = [];
  for (const [typeId, placement] of scenario.objects) {
    const override = overrides[typeId] ?? {};
    ids.push(addLibraryObject(simulator, typeId, { ...placement, ...override }));
  }
  return ids;
}

export function addObjectRing(simulator, typeId, count = 16, options = {}) {
  const ids = [];
  const spec = getObjectSpec(typeId);
  const innerR = options.innerR ?? Math.max(iscoRadiusKerrApprox(simulator.params, true) * 1.1, 5);
  const outerR = options.outerR ?? innerR * 2.4;
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1);
    const r = innerR + (outerR - innerR) * f;
    const phi = (i / count) * Math.PI * 2;
    ids.push(addLibraryObject(simulator, typeId, {
      mode: options.mode ?? spec.defaultOrbit.mode ?? "circular",
      name: `${options.namePrefix ?? typeId}-${String(i + 1).padStart(3, "0")}`,
      r,
      phi,
      prograde: options.prograde ?? true,
      radialVelocity: options.radialVelocity ?? -0.001,
    }));
  }
  return ids;
}

