/*
 * Unified additive facade for the standalone Kerr-Newman physics modules.
 *
 * The facade keeps the original demo untouched while giving future UI or worker
 * code one stable import surface for geometry, objects, trajectories, tides,
 * orbit diagnostics, and reduced MHD jet updates.
 */

import {
  KerrNewmanSimulator,
  geometrySummary as summarizeGeometry,
  horizons,
  makeEquatorialCircularState,
  makeMassiveState,
  makePhotonState,
  sanitizeParams,
} from "./kn-full-physics.mjs";
import {
  OBJECT_GROUPS,
  OBJECT_SCENARIOS,
  addLibraryObject,
  addObjectRing as addObjectRingToSimulator,
  createObjectState,
  getObjectSpec,
  listObjectTypes,
  objectDiagnostics,
  seedObjectScenario,
} from "./object-library.mjs";
import {
  classifyOrbitRegion,
  findISCO,
  findPhotonCircularOrbit,
  solveCircularMassiveOrbit,
} from "./orbit-diagnostics.mjs";
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
  tidalTensorDiagnostics,
} from "./tidal-tensor.mjs";
import {
  MHDJetEngine,
  jetInputFromSimulator,
} from "./mhd-jet-engine.mjs";
import {
  binaryInspiralProfile,
} from "./binary-inspiral.mjs";

const DEFAULT_PARAMS = Object.freeze({ M: 1.5, Q: 0.25, a: 1.0, B: 0.4 });
const BL_MOMENTUM_KEYS = ["Pt", "Pr", "Ptheta", "Pphi"];
const KS_MOMENTUM_KEYS = ["Pt", "Px", "Py", "Pz"];

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function hasKeys(value, keys) {
  return Boolean(value) && keys.every((key) => isFiniteNumber(value[key]));
}

function compactBLState(state) {
  return {
    id: state.id,
    name: state.name,
    kind: state.kind,
    status: state.status,
    libraryType: state.libraryType,
    t: state.t,
    r: state.r,
    theta: state.theta,
    phi: state.phi,
    energy: isFiniteNumber(state.Pt) ? -state.Pt : undefined,
    angularMomentumZ: state.Pphi,
    hamiltonian: state.lastHamiltonian ?? state.initialHamiltonian,
    hamiltonianDrift: state.hamiltonianDrift,
  };
}

function compactKSState(params, state) {
  const blLike = boyerLindquistLikeFromCartesian(params, state.x, state.y, state.z);
  return {
    name: state.name,
    kind: state.kind,
    status: state.status,
    ks: {
      t: state.t,
      x: state.x,
      y: state.y,
      z: state.z,
    },
    blLike,
    energy: isFiniteNumber(state.Pt) ? -state.Pt : undefined,
    hamiltonian: state.lastHamiltonian ?? state.initialHamiltonian,
    hamiltonianDrift: state.hamiltonianDrift,
  };
}

function createBLState(params, input = {}) {
  if (hasKeys(input, BL_MOMENTUM_KEYS)) return { ...input };
  const typeId = input.typeId ?? input.libraryType;
  if (typeId) return createObjectState(params, typeId, input.placement ?? input);
  if (input.kind === "photon" || input.mode === "photon") {
    return makePhotonState(params, {
      ...input,
      r: input.r ?? 12,
      theta: input.theta ?? Math.PI / 2,
      phi: input.phi ?? 0,
      direction: input.direction ?? [-0.16, 0, 0.987],
      localEnergy: input.localEnergy ?? 1,
    });
  }
  if (input.mode === "circular" || input.circular) {
    return makeEquatorialCircularState(params, {
      ...input,
      r: input.r ?? 10,
      prograde: input.prograde ?? true,
    });
  }
  return makeMassiveState(params, {
    ...input,
    r: input.r ?? 10,
    theta: input.theta ?? Math.PI / 2,
    phi: input.phi ?? 0,
    velocity: input.velocity ?? [-0.02, 0, 0.25],
  });
}

function createKSState(params, input = {}) {
  if (hasKeys(input, KS_MOMENTUM_KEYS) && isFiniteNumber(input.x) && isFiniteNumber(input.y) && isFiniteNumber(input.z)) {
    return { ...input };
  }
  if (input.kind === "photon" || input.mode === "photon") {
    throw new Error("Kerr-Schild facade construction currently supports timelike states. Pass a full KS null state to integrate a photon.");
  }
  const phi = input.phi ?? 0;
  const position = input.position ?? cartesianFromBoyerLindquist(
    params,
    input.r ?? 8,
    input.theta ?? Math.PI / 2,
    phi,
  );
  const velocity = input.coordinateVelocity ?? input.velocity ?? equatorialCoordinateVelocity(
    phi,
    input.radialVelocity ?? -0.18,
    input.azimuthalVelocity ?? 0.08,
  );
  return makeKerrSchildTimelikeState(params, {
    ...input,
    position,
    velocity,
    chargeToMass: input.chargeToMass ?? 0,
  });
}

function shouldUseKerrSchild(params, input = {}, options = {}) {
  if (options.coordinates === "kerr-schild" || options.horizonPenetrating || options.crossHorizon) return true;
  if (options.coordinates === "boyer-lindquist") return false;
  if (hasKeys(input, KS_MOMENTUM_KEYS) && isFiniteNumber(input.x)) return true;
  if (!isFiniteNumber(input.r)) return false;
  const h = horizons(params);
  if (h.naked) return false;
  const margin = options.strongFieldMargin ?? 0.75;
  return input.r <= h.rPlus + margin;
}

export function createPhysicsEngine(params = {}, options = {}) {
  return new PhysicsEngine(params, options);
}

export class PhysicsEngine {
  constructor(params = {}, options = {}) {
    this.params = sanitizeParams({ ...DEFAULT_PARAMS, ...params });
    this.options = {
      autoCreateJet: options.autoCreateJet ?? true,
    };
    this.simulator = options.simulator ?? new KerrNewmanSimulator(
      this.params,
      options.simulatorOptions ?? {},
    );
    this.jet = options.jet ?? (this.options.autoCreateJet
      ? new MHDJetEngine(this.params, options.jetOptions ?? {})
      : null);
  }

  geometry(overrides = {}) {
    const params = sanitizeParams({ ...this.params, ...overrides.params });
    const summary = summarizeGeometry(params);
    if (!overrides.position) return summary;
    return {
      ...summary,
      region: classifyOrbitRegion(
        params,
        overrides.position.r,
        overrides.position.theta ?? Math.PI / 2,
      ),
    };
  }

  objectCatalog(filter = {}) {
    return {
      objects: listObjectTypes(filter),
      groups: OBJECT_GROUPS,
      scenarios: Object.values(OBJECT_SCENARIOS).map((scenario) => ({
        id: scenario.id,
        label: scenario.label,
        objectCount: scenario.objects.length,
      })),
    };
  }

  objectSpec(typeId) {
    return getObjectSpec(typeId);
  }

  createObject(typeId, placement = {}) {
    const state = createObjectState(this.params, typeId, placement);
    return {
      typeId,
      state: compactBLState(state),
      diagnostics: objectDiagnostics(this.params, state, typeId),
      rawState: state,
    };
  }

  spawnObject(typeId, placement = {}, options = {}) {
    const addToSimulator = options.addToSimulator ?? true;
    if (!addToSimulator) return this.createObject(typeId, placement);
    const id = addLibraryObject(this.simulator, typeId, placement);
    const particle = this.simulator.particles.find((item) => item.id === id);
    return {
      id,
      typeId,
      state: compactBLState(particle),
      diagnostics: objectDiagnostics(this.params, particle, typeId),
    };
  }

  spawnParticle(input = {}, options = {}) {
    const state = createBLState(this.params, input);
    const addToSimulator = options.addToSimulator ?? true;
    if (!addToSimulator) {
      return {
        state: compactBLState(state),
        rawState: state,
      };
    }
    const id = this.simulator.addParticle(state);
    const particle = this.simulator.particles.find((item) => item.id === id);
    return {
      id,
      state: compactBLState(particle),
    };
  }

  seedScenario(scenarioId, overrides = {}) {
    return {
      scenarioId,
      ids: seedObjectScenario(this.simulator, scenarioId, overrides),
    };
  }

  addObjectRing(typeId, count = 16, options = {}) {
    return {
      typeId,
      ids: addObjectRingToSimulator(this.simulator, typeId, count, options),
    };
  }

  orbitDiagnostics(options = {}) {
    const params = sanitizeParams({ ...this.params, ...options.params });
    const samples = options.samples ?? 220;
    const iscoOptions = {
      samples,
      rMin: options.rMin,
      rMax: options.rMax,
      chargeToMass: options.chargeToMass ?? 0,
    };
    const photonOptions = {
      samples: options.photonSamples ?? samples,
      rMin: options.rMin,
      rMax: options.photonRMax ?? options.rMax,
    };
    const diagnostics = {
      params,
      isco: {
        prograde: findISCO(params, { ...iscoOptions, prograde: true }),
        retrograde: findISCO(params, { ...iscoOptions, prograde: false }),
      },
      photonOrbit: {
        prograde: findPhotonCircularOrbit(params, { ...photonOptions, prograde: true }),
        retrograde: findPhotonCircularOrbit(params, { ...photonOptions, prograde: false }),
      },
    };
    if (isFiniteNumber(options.r)) {
      diagnostics.circularOrbit = solveCircularMassiveOrbit(params, {
        r: options.r,
        theta: options.theta ?? Math.PI / 2,
        prograde: options.prograde ?? true,
        chargeToMass: options.chargeToMass ?? 0,
      });
      diagnostics.region = classifyOrbitRegion(params, options.r, options.theta ?? Math.PI / 2);
    }
    return diagnostics;
  }

  integrateTrajectory(input = {}, options = {}) {
    const params = sanitizeParams({ ...this.params, ...options.params });
    if (shouldUseKerrSchild(params, input, options)) {
      const state = createKSState(params, input);
      const result = integrateKerrSchildAdaptive(params, state, options.integration ?? options);
      return {
        coordinates: "kerr-schild",
        horizonPenetrating: true,
        initialState: compactKSState(params, state),
        finalState: compactKSState(params, result.finalState),
        result,
      };
    }

    const state = createBLState(params, input);
    const result = integrateAdaptive(params, state, options.integration ?? options);
    return {
      coordinates: "boyer-lindquist",
      horizonPenetrating: false,
      initialState: compactBLState(state),
      finalState: compactBLState(result.finalState),
      result,
    };
  }

  tidalDiagnostics(position, body = {}) {
    return tidalTensorDiagnostics(this.params, position, body);
  }

  binaryInspiral(input = {}) {
    return binaryInspiralProfile(input);
  }

  stepSimulation(options = {}) {
    const steps = options.steps ?? 1;
    const stepSize = options.stepSize ?? this.simulator.options.stepSize;
    let snapshot = null;
    for (let i = 0; i < steps; i++) snapshot = this.simulator.step(stepSize);
    let jet = null;
    if (options.updateJet && this.jet) {
      const jetInput = {
        ...jetInputFromSimulator(this.simulator, options.jetOptions ?? {}),
        ...(options.jetInput ?? {}),
      };
      jet = this.jet.step(jetInput, options.jetDt ?? this.jet.options.dt);
    }
    return {
      simulator: snapshot ?? this.simulator.snapshot(),
      jet,
    };
  }

  updateJet(input = {}, options = {}) {
    if (!this.jet) {
      this.jet = new MHDJetEngine(this.params, options.jetOptions ?? {});
    }
    const resolvedInput = options.fromSimulator
      ? { ...jetInputFromSimulator(this.simulator, options), ...input }
      : input;
    return this.jet.step(resolvedInput, options.dt ?? this.jet.options.dt);
  }

  snapshot() {
    return {
      params: this.params,
      simulator: this.simulator.snapshot(),
      jet: this.jet ? this.jet.snapshot() : null,
    };
  }
}

export {
  KerrNewmanSimulator,
  MHDJetEngine,
  binaryInspiralProfile,
  classifyOrbitRegion,
  findISCO,
  findPhotonCircularOrbit,
  jetInputFromSimulator,
  solveCircularMassiveOrbit,
  tidalTensorDiagnostics,
};
