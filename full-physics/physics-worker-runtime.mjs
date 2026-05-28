/*
 * Worker-compatible message boundary for the additive physics modules.
 *
 * This file is deliberately DOM-light: it exports a pure dispatcher for tests
 * and an optional attach helper for browser Web Workers.
 */

import {
  PhysicsEngine,
} from "./physics-engine.mjs";
import {
  batchRk4Run,
  createPerformanceContext,
  runPerformanceBenchmark,
} from "./performance-layer.mjs";
import {
  createUnitScale,
  physicalizeGeometrySummary,
  physicalizeJetSnapshot,
  physicalizeObjectState,
  physicalizeTrajectoryResult,
  summarizeScale,
} from "./units.mjs";

function normalizeMessage(message = {}) {
  return {
    id: message.id,
    type: message.type ?? message.action,
    sessionId: message.sessionId ?? "default",
    payload: message.payload ?? {},
  };
}

function ok(message, payload) {
  return {
    id: message.id,
    type: message.type,
    ok: true,
    payload,
  };
}

function fail(message, error) {
  return {
    id: message.id,
    type: message.type,
    ok: false,
    error: {
      name: error.name ?? "Error",
      message: error.message ?? String(error),
      stack: error.stack,
    },
  };
}

function getEngine(runtime, sessionId, params = {}, options = {}) {
  if (!runtime.engines.has(sessionId) || options.recreate) {
    runtime.engines.set(sessionId, new PhysicsEngine(params, options.engineOptions ?? options));
  }
  return runtime.engines.get(sessionId);
}

function getPerformanceContext(runtime, sessionId, params = {}, options = {}) {
  const contextId = options.contextId ?? sessionId;
  if (!runtime.performanceContexts.has(contextId) || options.recreate) {
    runtime.performanceContexts.set(contextId, createPerformanceContext(params, options.cacheOptions ?? options));
  }
  return runtime.performanceContexts.get(contextId);
}

export function createPhysicsWorkerRuntime() {
  const runtime = {
    engines: new Map(),
    performanceContexts: new Map(),
  };
  return {
    runtime,
    handleMessage(message) {
      return handlePhysicsWorkerMessage(message, runtime);
    },
    reset() {
      runtime.engines.clear();
      runtime.performanceContexts.clear();
    },
  };
}

export async function handlePhysicsWorkerMessage(rawMessage, runtime = {
  engines: new Map(),
  performanceContexts: new Map(),
}) {
  const message = normalizeMessage(rawMessage);
  try {
    const p = message.payload;

    switch (message.type) {
      case "create-engine": {
        const engine = getEngine(runtime, message.sessionId, p.params, {
          ...(p.options ?? {}),
          recreate: true,
        });
        return ok(message, engine.snapshot());
      }

      case "geometry": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        const geometry = engine.geometry(p.overrides ?? {});
        return ok(message, geometry);
      }

      case "spawn-object": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.spawnObject(p.typeId, p.placement ?? {}, p.spawnOptions ?? {}));
      }

      case "spawn-particle": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.spawnParticle(p.input ?? {}, p.spawnOptions ?? {}));
      }

      case "seed-scenario": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.seedScenario(p.scenarioId, p.overrides ?? {}));
      }

      case "step-simulation": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.stepSimulation(p.stepOptions ?? {}));
      }

      case "orbit-diagnostics": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.orbitDiagnostics(p.diagnosticOptions ?? {}));
      }

      case "integrate-trajectory": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.integrateTrajectory(p.input ?? {}, p.integrationOptions ?? {}));
      }

      case "tidal-diagnostics": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.tidalDiagnostics(p.position, p.body ?? {}));
      }

      case "update-jet": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.updateJet(p.input ?? {}, p.jetOptions ?? {}));
      }

      case "snapshot": {
        const engine = getEngine(runtime, message.sessionId, p.params, p.options);
        return ok(message, engine.snapshot());
      }

      case "batch-run": {
        const context = getPerformanceContext(runtime, message.sessionId, p.params, p.options ?? {});
        return ok(message, batchRk4Run(p.params, p.states ?? [], {
          ...(p.batchOptions ?? {}),
          context,
        }));
      }

      case "cache-stats": {
        const context = getPerformanceContext(runtime, message.sessionId, p.params, p.options ?? {});
        return ok(message, context.cacheStats());
      }

      case "clear-caches": {
        const context = getPerformanceContext(runtime, message.sessionId, p.params, p.options ?? {});
        context.resetCaches();
        return ok(message, context.cacheStats());
      }

      case "performance-benchmark":
        return ok(message, runPerformanceBenchmark(p.options ?? p));

      case "unit-scale": {
        const scale = createUnitScale(p.options ?? p);
        return ok(message, summarizeScale(scale));
      }

      case "physicalize-geometry": {
        const scale = createUnitScale(p.scaleOptions ?? {});
        return ok(message, physicalizeGeometrySummary(scale, p.geometry));
      }

      case "physicalize-object": {
        const scale = createUnitScale(p.scaleOptions ?? {});
        return ok(message, physicalizeObjectState(scale, p.state, p.specOrTypeId));
      }

      case "physicalize-trajectory": {
        const scale = createUnitScale(p.scaleOptions ?? {});
        return ok(message, physicalizeTrajectoryResult(scale, p.trajectory));
      }

      case "physicalize-jet": {
        const scale = createUnitScale(p.scaleOptions ?? {});
        return ok(message, physicalizeJetSnapshot(scale, p.snapshot));
      }

      default:
        throw new Error(`Unknown physics worker message type: ${message.type}`);
    }
  } catch (error) {
    return fail(message, error);
  }
}

export function attachPhysicsWorkerGlobal(scope = globalThis) {
  const runtime = createPhysicsWorkerRuntime();
  if (!scope.addEventListener || !scope.postMessage) {
    throw new Error("attachPhysicsWorkerGlobal requires a Worker-like global scope.");
  }
  scope.addEventListener("message", async (event) => {
    scope.postMessage(await runtime.handleMessage(event.data));
  });
  return runtime;
}
