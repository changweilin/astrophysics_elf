/* One entry point for every suite in the repo, so `npm test` and CI run the
 * same list and nothing can be orphaned by forgetting to extend a shell chain.
 *
 *   node test/run-all.mjs           fast tier (the gate; ~5 s)
 *   node test/run-all.mjs --all     fast + slow acceptance tier (~1 min)
 *   node test/run-all.mjs --slow    slow tier only
 *   node test/run-all.mjs --list    print the plan without running it
 *
 * Tiers exist only for wall-clock: `fast` is what every push must pass,
 * `slow` integrates a few hundred swarm bodies for thousands of steps and is
 * gated per-branch in CI rather than on every commit.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUITES = [
  // Root demo suites.
  { tier: 'fast', name: 'physics (KNphysics unit)', file: 'test/physics.test.mjs' },
  { tier: 'fast', name: 'interaction (pointer helpers)', file: 'test/interaction.test.mjs' },
  { tier: 'fast', name: 'pace-fit (demo pacing + auto-fit)', file: 'test/pace-fit.test.mjs' },
  { tier: 'fast', name: 'render-smoke (Canvas2D branches)', file: 'test/render-smoke.test.mjs' },
  { tier: 'fast', name: 'transient (binary-event render)', file: 'test/transient.test.mjs' },
  { tier: 'slow', name: 'structure N-body acceptance', file: 'test/structure-nbody.test.mjs' },

  // High-fidelity core: the threshold gate plus the facade smoke runners.
  // The samples assert nothing beyond "the facade still runs and prints
  // finite numbers", but that is exactly what silently rots when the engine
  // moves — nothing used to execute them.
  { tier: 'fast', name: 'full-physics benchmarks (CONSERVATION-LEDGER)', file: 'full-physics/run-benchmarks.mjs' },
  { tier: 'fast', name: 'sample: engine facade', file: 'full-physics/run-sample.mjs' },
  { tier: 'fast', name: 'sample: advanced models', file: 'full-physics/run-advanced-models-sample.mjs' },
  { tier: 'fast', name: 'sample: binary inspiral', file: 'full-physics/run-binary-inspiral-sample.mjs' },
  { tier: 'fast', name: 'sample: horizon crossing', file: 'full-physics/run-horizon-crossing-sample.mjs' },
  { tier: 'fast', name: 'sample: object catalog + MHD jet', file: 'full-physics/run-object-mhd-sample.mjs' },
  { tier: 'fast', name: 'sample: rendering prep', file: 'full-physics/run-rendering-prep-sample.mjs' },
  { tier: 'fast', name: 'sample: units', file: 'full-physics/run-units-sample.mjs' },
  { tier: 'fast', name: 'sample: lensed sky direction', file: 'full-physics/run-lensing-sky-sample.mjs' },
  { tier: 'fast', name: 'performance layer benchmark', file: 'full-physics/run-performance-benchmark.mjs' },
  // Ray tracing at real resolutions: ~7 s and ~20 s.
  { tier: 'slow', name: 'sample: lensing (ray trace)', file: 'full-physics/run-lensing-sample.mjs' },
  { tier: 'slow', name: 'sample: deflection LUT', file: 'full-physics/run-lensing-lut-sample.mjs' },
];

const argv = process.argv.slice(2);
const tiers = argv.includes('--all') ? ['fast', 'slow']
  : argv.includes('--slow') ? ['slow']
  : ['fast'];
const plan = SUITES.filter((s) => tiers.includes(s.tier));

if (argv.includes('--list')) {
  for (const s of plan) console.log(`${s.tier}\t${s.file}\t${s.name}`);
  process.exit(0);
}

const t0 = Date.now();
const failures = [];
for (const suite of plan) {
  console.log(`\n=== [${suite.tier}] ${suite.name} — ${suite.file} ===`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [join(ROOT, suite.file)], { cwd: ROOT, stdio: 'inherit' });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    failures.push(suite.file);
    console.log(`--- FAIL ${suite.file} (exit ${r.status ?? r.signal}) in ${secs}s`);
  } else {
    console.log(`--- ok ${suite.file} in ${secs}s`);
  }
}

const total = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${'='.repeat(60)}`);
if (failures.length) {
  console.log(`FAIL — ${failures.length}/${plan.length} suites failed in ${total}s:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`PASS — ${plan.length}/${plan.length} suites passed in ${total}s (tiers: ${tiers.join(', ')})`);
