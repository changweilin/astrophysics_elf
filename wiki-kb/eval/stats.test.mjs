// Unit tests for eval/stats.mjs (EVAL3) and the CI-derived gate tolerance
// (EVAL1b, eval/baseline.mjs gateTolerances).
//
// Everything here is pure arithmetic -- no DB, no Ollama, no golden set -- so
// this runs anywhere and is the regression net for the statistics the gate now
// depends on.
//
// Run:  node eval/stats.test.mjs

import {
  makeRng, mean, percentile, bootstrapCI, pairedDelta, pairedPermutationTest, abVerdict,
} from './stats.mjs';
import { gateTolerances, compareToBaseline } from './baseline.mjs';

let passed = 0;
let failed = 0;
function check(label, ok, extra) {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  FAIL  ${label}${extra !== undefined ? `  (${JSON.stringify(extra)})` : ''}`);
}
function near(label, got, want, tol) {
  check(`${label} (got ${got}, want ~${want})`, Math.abs(got - want) <= tol, { got, want, tol });
}

// ---- rng --------------------------------------------------------------------
console.log('rng: deterministic and uniform');
{
  const a = makeRng(42);
  const b = makeRng(42);
  check('same seed -> same stream', Array.from({ length: 8 }, () => a() === b()).every(Boolean));
  const c = makeRng(43);
  check('different seed -> different stream', makeRng(42)() !== c());
  const rng = makeRng(7);
  let sum = 0;
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < 20000; i++) {
    const v = rng();
    sum += v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  near('mean ~0.5', sum / 20000, 0.5, 0.01);
  check('stays in [0,1)', lo >= 0 && hi < 1, { lo, hi });
}

// ---- percentile --------------------------------------------------------------
console.log('percentile: interpolated, clamped');
{
  const xs = [0, 1, 2, 3, 4];
  check('p0', percentile(xs, 0) === 0);
  check('p100', percentile(xs, 1) === 4);
  check('p50', percentile(xs, 0.5) === 2);
  near('p25 interpolates', percentile(xs, 0.25), 1, 1e-9);
  check('clamps below 0', percentile(xs, -1) === 0);
  check('empty is 0', percentile([], 0.5) === 0);
  check('single value', percentile([9], 0.3) === 9);
}

// ---- one-arm CI --------------------------------------------------------------
console.log('bootstrapCI: covers the mean, narrows with n');
{
  const constant = bootstrapCI(new Array(50).fill(0.5));
  check('a constant arm has zero width', constant.width === 0, constant);
  check('constant arm mean', constant.mean === 0.5);

  // Bernoulli(0.5): the analytic SE at n=64 is 0.5/8 = 0.0625, so a 95% CI is
  // ~4*SE = 0.245 wide. Bootstrap should land in that neighbourhood.
  const coin = Array.from({ length: 64 }, (_, i) => (i % 2 ? 1 : 0));
  const ci = bootstrapCI(coin);
  check('CI brackets the mean', ci.lo <= ci.mean && ci.mean <= ci.hi, ci);
  near('width ~= 4*SE', ci.width, 0.245, 0.06);

  // 4x the cases must halve the interval (1/sqrt(n)); this is exactly the
  // relationship abVerdict.casesNeeded inverts.
  const big = bootstrapCI(Array.from({ length: 256 }, (_, i) => (i % 2 ? 1 : 0)));
  near('4x cases halves the width', big.width, ci.width / 2, 0.04);

  const again = bootstrapCI(coin);
  check('deterministic across calls', again.lo === ci.lo && again.hi === ci.hi, { ci, again });
  check('n<2 degenerates safely', bootstrapCI([0.7]).width === 0 && bootstrapCI([]).mean === 0);
}

// ---- paired delta ------------------------------------------------------------
console.log('pairedDelta: pairing removes between-case variance');
{
  // Per-case difficulty spans the whole range, but the variant is uniformly
  // +0.05 on every case. Unpaired that effect drowns; paired it is exact.
  const base = Array.from({ length: 40 }, (_, i) => i / 40);
  const variant = base.map((x) => x + 0.05);
  const d = pairedDelta(variant, base);
  near('delta is the constant shift', d.delta, 0.05, 1e-9);
  check('CI is degenerate for a constant shift', d.width < 1e-9, d);
  check('CI excludes zero', d.lo > 0, d);

  const noise = pairedDelta(base, base);
  check('identical arms -> zero delta', noise.delta === 0);
  check('identical arms -> zero width', noise.width === 0);

  let threw = false;
  try { pairedDelta([1, 2, 3], [1, 2]); } catch { threw = true; }
  check('unequal arms throw', threw);
}

// ---- permutation test ---------------------------------------------------------
console.log('pairedPermutationTest: sign-flip p-values');
{
  const zero = pairedPermutationTest([1, 0, 1], [1, 0, 1]);
  check('no differences -> p=1', zero.p === 1, zero);
  check('no differences -> exact', zero.exact === true);

  // 12 cases all moving the same way: the only sign assignment at least as
  // extreme as the observed one (in absolute value) is the all-same one and its
  // mirror, so the exact two-sided p is 2/2^12.
  const a = new Array(12).fill(1);
  const b = new Array(12).fill(0);
  const strong = pairedPermutationTest(a, b);
  check('small n uses exact enumeration', strong.exact === true, strong);
  near('exact two-sided p = 2/4096', strong.p, 2 / 4096, 1e-6);

  // Above exactMax it switches to Monte Carlo but must stay tiny and never 0.
  const bigA = new Array(40).fill(1);
  const bigB = new Array(40).fill(0);
  const mc = pairedPermutationTest(bigA, bigB);
  check('large n uses Monte Carlo', mc.exact === false, mc);
  check('p is never 0', mc.p > 0 && mc.p < 0.01, mc);

  const half = pairedPermutationTest([1, 0, 1, 0, 1, 0], [0, 1, 0, 1, 0, 1]);
  check('symmetric differences -> p near 1', half.p > 0.5, half);
}

// ---- verdicts -----------------------------------------------------------------
console.log('abVerdict: improved / regressed / no-effect / need-more-cases');
{
  const base = Array.from({ length: 40 }, (_, i) => i / 40);

  const up = abVerdict(base.map((x) => x + 0.05), base);
  check('uniform gain -> improved', up.verdict === 'improved', up);

  const down = abVerdict(base.map((x) => x - 0.05), base);
  check('uniform loss -> regressed', down.verdict === 'regressed', down);

  // Identical arms: the interval is a point at 0, comfortably inside the
  // negligible band -- a meaningful effect is RULED OUT, not merely unproven.
  const same = abVerdict(base, base);
  check('identical arms -> no-effect', same.verdict === 'no-effect', same);

  // A real but tiny effect on few cases: CI straddles zero AND reaches past the
  // negligible bound. This is the label the plan wanted for borderline sweeps --
  // the rrfK=10-vs-weighted 0.780/0.786 situation.
  const noisyBase = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  const noisyVar = [1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0];
  const undecided = abVerdict(noisyVar, noisyBase);
  check('noisy small-n -> need-more-cases', undecided.verdict === 'need-more-cases', undecided);
  check('casesNeeded exceeds n when undecided', undecided.casesNeeded > undecided.n, undecided);

  // The equivalence bound is a knob: widen it and the same comparison becomes
  // a positive "no meaningful effect" statement.
  const wide = abVerdict(noisyVar, noisyBase, { negligible: 1 });
  check('a wide negligible band resolves to no-effect', wide.verdict === 'no-effect', wide);
}

// ---- EVAL1b tolerance ---------------------------------------------------------
console.log('gateTolerances: half the baseline CI width, floored');
{
  const baseline = {
    metrics: {
      hitRate: 0.942,
      mrr: 0.688,
      slices: { 'tag:paraphrase': { n: 16, hitRate: 0.813, mrr: 0.431 } },
      ci: {
        hitRate: { lo: 0.884, hi: 0.986, width: 0.102 },
        mrr: { lo: 0.6, hi: 0.77, width: 0.17 },
        slices: {
          'tag:paraphrase': {
            hitRate: { lo: 0.625, hi: 0.938, width: 0.313 },
            mrr: { lo: 0.27, hi: 0.6, width: 0.33 },
          },
        },
      },
    },
  };
  const tol = gateTolerances(baseline);
  near('overall.mrr tolerance = width/2', tol['overall.mrr'], 0.085, 1e-9);
  near('slice tolerance is wider on 16 cases', tol['tag:paraphrase.mrr'], 0.165, 1e-9);
  check('the small slice is more forgiving than overall', tol['tag:paraphrase.mrr'] > tol['overall.mrr']);
  near('a tight CI is floored at gateMinTol', gateTolerances({
    metrics: { ci: { mrr: { lo: 0.5, hi: 0.5, width: 0 } } },
  })['overall.mrr'], 0.005, 1e-9);
  check('no ci block -> no tolerances', Object.keys(gateTolerances({ metrics: {} })).length === 0);

  // The whole point: a drop that is inside the golden set's own sampling noise
  // must not fail the gate, while the same drop on a tight metric must.
  const noisyDrop = compareToBaseline(
    { hitRate: 0.942, mrr: 0.688, slices: { 'tag:paraphrase': { n: 16, hitRate: 0.813, mrr: 0.35 } } },
    baseline,
    { tolBy: tol }
  );
  check('-0.08 on the paraphrase slice is inside its CI -> flat',
    noisyDrop.regressions.length === 0, noisyDrop.rows);
  const realDrop = compareToBaseline({ hitRate: 0.942, mrr: 0.5 }, baseline, { tolBy: tol });
  check('-0.19 overall MRR clears tolerance -> regression',
    realDrop.regressions.some((r) => r.scope === 'overall' && r.metric === 'mrr'), realDrop.rows);
  check('rows carry the tolerance they were judged against',
    realDrop.rows.every((r) => typeof r.tol === 'number'));
  // Backwards compatibility: a pre-EVAL3 baseline (no `ci`) still gates on 0.005.
  const flat = compareToBaseline({ hitRate: 0.9, mrr: 0.688 }, baseline, { tolBy: {} });
  check('flat fallback tolerance still works',
    flat.regressions.some((r) => r.scope === 'overall' && r.metric === 'hitRate'), flat.rows);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
