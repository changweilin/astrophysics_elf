import {
  makeDeterministicParticleCloud,
  runPerformanceBenchmark,
} from "./performance-layer.mjs";
import {
  createPhysicsWorkerRuntime,
} from "./physics-worker-runtime.mjs";

function formatMs(value) {
  return `${value.toFixed(3)} ms`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e5)) return value.toExponential(6);
  return value.toPrecision(8);
}

async function workerSmokeTest() {
  const worker = createPhysicsWorkerRuntime();
  const geometryResponse = await worker.handleMessage({
    id: "worker-smoke-geometry",
    type: "geometry",
    sessionId: "perf-smoke",
    payload: {
      params: { M: 1.5, Q: 0.25, a: 1.0, B: 0.4 },
      overrides: { position: { r: 8, theta: Math.PI / 2 } },
    },
  });
  const states = makeDeterministicParticleCloud({ M: 1.5, Q: 0.25, a: 1.0, B: 0.4 }, 4, {
    uniqueStates: 2,
    shellCount: 2,
  });
  const batchResponse = await worker.handleMessage({
    id: "worker-smoke-batch",
    type: "batch-run",
    sessionId: "perf-smoke",
    payload: {
      params: { M: 1.5, Q: 0.25, a: 1.0, B: 0.4 },
      states,
      batchOptions: {
        steps: 2,
        stepSize: 0.01,
        stopAtHorizon: false,
      },
    },
  });
  return {
    ok: geometryResponse.ok &&
      geometryResponse.payload?.region?.insideHorizon === false &&
      batchResponse.ok &&
      batchResponse.payload?.states?.length === 4,
    geometryResponse,
    batchResponse,
  };
}

const asJson = process.argv.includes("--json");
const result = runPerformanceBenchmark({
  particleCount: 256,
  steps: 32,
  stepSize: 0.01,
  cloudOptions: {
    shellCount: 32,
    uniqueStates: 32,
  },
  cacheOptions: {
    metricCacheSize: 32768,
    potentialCacheSize: 32768,
    cacheMetric: false,
    cachePotential: false,
    cacheHamiltonian: false,
    cacheDerivatives: false,
  },
});
const workerSmoke = await workerSmokeTest();
const accuracyTolerance = 1e-9;
const ok = result.maxStateDelta <= accuracyTolerance && workerSmoke.ok;
const report = {
  ok,
  accuracyTolerance,
  workerSmokeOk: workerSmoke.ok,
  ...result,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Physics performance benchmark");
  console.log(`Particles: ${result.particleCount}; steps: ${result.steps}; step size: ${result.stepSize}`);
  console.log(`Baseline RK4: ${formatMs(result.baselineMs)}`);
  console.log(`Optimized batch RK4: ${formatMs(result.optimizedMs)}`);
  console.log(`Speedup: ${formatNumber(result.speedup)}x`);
  console.log(`Max state delta: ${formatNumber(result.maxStateDelta)} (tolerance ${formatNumber(accuracyTolerance)})`);
  console.log(`Worker boundary smoke test: ${workerSmoke.ok ? "PASS" : "FAIL"}`);
  console.log("");
  console.log("Cache stats:");
  for (const [name, stats] of Object.entries(result.cacheStats)) {
    console.log(`  ${name}: ${stats.entries} entries, hit rate ${(stats.hitRate * 100).toFixed(2)}%, hits ${stats.hits}, misses ${stats.misses}`);
  }
}

if (!ok) process.exitCode = 1;
