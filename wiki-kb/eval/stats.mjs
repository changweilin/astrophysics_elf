// Resampling statistics for the RAG eval (EVAL3).
//
// The golden set is 69 cases. At that size a raw metric delta ("MRR 0.688 ->
// 0.694") carries no information on its own -- the rrfK=10-vs-weighted choice
// that seeded config.retrieve.rrfK was made on 0.780 vs 0.786, which is inside
// sampling noise. Everything here exists so a knob change can be labelled
// improved / regressed / no-effect / need-more-cases instead of eyeballed.
//
//   bootstrapCI(values)          nonparametric percentile CI for one arm
//   pairedDelta(a, b)            PAIRED bootstrap CI of the A-B difference
//   pairedPermutationTest(a, b)  sign-flip test -> p-value for the same delta
//   abVerdict(a, b)              the two combined + the labelling rule
//
// Two properties this module deliberately guarantees:
//
//   * Deterministic. The RNG is a seeded mulberry32, never Math.random, so the
//     same arrays give byte-identical CIs on every machine. A gate (EVAL1b)
//     whose tolerance moved run-to-run would be worse than no gate.
//   * Paired. A/B arms are compared case-by-case with ONE resampled index set
//     shared by both arms. Per-case difficulty is the dominant variance term
//     here (a paraphrase case is hard for every config), and pairing removes
//     it -- an unpaired comparison of two 69-case runs needs a far larger
//     effect to clear the same CI.
//
// Zero dependencies, pure functions, no DB and no LLM: run
// `node eval/stats.test.mjs` to verify.

import { config } from '../config.mjs';

const DEFAULTS = {
  resamples: config.eval.bootstrapResamples,
  alpha: config.eval.ciAlpha,
  seed: config.eval.bootstrapSeed,
};

// mulberry32: 32-bit state, uniform enough for resampling and reproducible
// across Node versions (Math.random's algorithm is not specified).
export function makeRng(seed = DEFAULTS.seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const round4 = (x) => Number(x.toFixed(4));
// p-values need more digits than metrics: an exact test over 2^18 sign
// assignments can legitimately land at 8e-6, and 4 decimals would print that
// as a flat 0.
const round6 = (x) => Number(x.toFixed(6));

// Linear-interpolated percentile of an ASCENDING array.
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function sd(xs, m = mean(xs)) {
  if (xs.length < 2) return 0;
  let v = 0;
  for (const x of xs) v += (x - m) * (x - m);
  return Math.sqrt(v / (xs.length - 1));
}

// ---- one-arm CI ---------------------------------------------------------------

// Percentile bootstrap over the case-level metric array (hit is 0/1, mrr is
// 1/rank; both are bounded so the percentile interval behaves well without a
// BCa correction). `width` is what EVAL1b turns into a regression tolerance.
export function bootstrapCI(values, opts = {}) {
  const { resamples, alpha, seed } = { ...DEFAULTS, ...opts };
  const xs = (values || []).filter((v) => Number.isFinite(v));
  const n = xs.length;
  const m = mean(xs);
  if (n < 2) return { n, mean: round4(m), lo: round4(m), hi: round4(m), width: 0, se: 0, resamples: 0 };

  const rng = makeRng(seed);
  const boot = new Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[(rng() * n) | 0];
    boot[b] = s / n;
  }
  boot.sort((p, q) => p - q);
  const lo = percentile(boot, alpha / 2);
  const hi = percentile(boot, 1 - alpha / 2);
  return {
    n,
    mean: round4(m),
    lo: round4(lo),
    hi: round4(hi),
    width: round4(hi - lo),
    se: round4(sd(boot)),
    resamples,
  };
}

// ---- paired A/B ---------------------------------------------------------------

function requirePaired(a, b) {
  const xs = a || [];
  const ys = b || [];
  if (xs.length !== ys.length) {
    throw new Error(`paired comparison needs equal-length arms (got ${xs.length} vs ${ys.length})`);
  }
  return [xs, ys];
}

// Paired percentile bootstrap of mean(a) - mean(b). One resampled index set is
// applied to BOTH arms per replicate, so between-case difficulty cancels.
export function pairedDelta(a, b, opts = {}) {
  const { resamples, alpha, seed } = { ...DEFAULTS, ...opts };
  const [xs, ys] = requirePaired(a, b);
  const n = xs.length;
  const meanA = mean(xs);
  const meanB = mean(ys);
  const delta = meanA - meanB;
  if (n < 2) {
    return { n, meanA: round4(meanA), meanB: round4(meanB), delta: round4(delta), lo: round4(delta), hi: round4(delta), width: 0, resamples: 0 };
  }

  const rng = makeRng(seed);
  const boot = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = (rng() * n) | 0;
      s += xs[j] - ys[j];
    }
    boot[r] = s / n;
  }
  boot.sort((p, q) => p - q);
  const lo = percentile(boot, alpha / 2);
  const hi = percentile(boot, 1 - alpha / 2);
  return {
    n,
    meanA: round4(meanA),
    meanB: round4(meanB),
    delta: round4(delta),
    lo: round4(lo),
    hi: round4(hi),
    width: round4(hi - lo),
    resamples,
  };
}

// Sign-flip (exchangeability) permutation test on the per-case differences.
// Exact enumeration up to `exactMax` cases, Monte Carlo above it. The Monte
// Carlo branch uses the (1 + hits) / (1 + draws) convention, so a sampled
// p-value is never reported as an impossible 0; the exact branch reports the
// true fraction (which really can be 2/2^n).
export function pairedPermutationTest(a, b, opts = {}) {
  const { resamples, seed } = { ...DEFAULTS, ...opts };
  const exactMax = opts.exactMax ?? 18;
  const [xs, ys] = requirePaired(a, b);
  const diffs = xs.map((x, i) => x - ys[i]).filter((d) => Number.isFinite(d));
  const n = diffs.length;
  if (!n) return { n: 0, delta: 0, p: 1, draws: 0, exact: false };

  const observed = mean(diffs);
  const absObs = Math.abs(observed);
  // Cases with d=0 carry no sign information; dropping them is the standard
  // (and here strictly more conservative) handling.
  const nz = diffs.filter((d) => d !== 0);
  if (!nz.length) return { n, delta: round4(observed), p: 1, draws: 0, exact: true };

  const total = nz.reduce((s, d) => s + Math.abs(d), 0);
  if (nz.length <= exactMax) {
    let hits = 0;
    const combos = 2 ** nz.length;
    for (let mask = 0; mask < combos; mask++) {
      let s = 0;
      for (let i = 0; i < nz.length; i++) s += mask & (1 << i) ? nz[i] : -nz[i];
      if (Math.abs(s / n) >= absObs - 1e-12) hits++;
    }
    return { n, delta: round4(observed), p: round6(hits / combos), draws: combos, exact: true };
  }

  const rng = makeRng(seed);
  let hits = 0;
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < nz.length; i++) s += rng() < 0.5 ? nz[i] : -nz[i];
    if (Math.abs(s / n) >= absObs - 1e-12) hits++;
  }
  return {
    n,
    delta: round4(observed),
    p: round6((1 + hits) / (1 + resamples)),
    draws: resamples,
    exact: false,
    maxPossible: round4(total / n),
  };
}

// ---- verdict ------------------------------------------------------------------

// `negligible` is the practical-equivalence bound: a change smaller than this
// is not worth acting on even if it were real (default ~one rank-step at k=8).
// The labelling is an equivalence test, not just a null test:
//
//   improved / regressed   CI excludes 0            -> the effect is real
//   no-effect              CI lies inside +-negligible -> a meaningful effect is RULED OUT
//   need-more-cases        CI includes 0 but reaches past +-negligible
//                          -> undecided; `casesNeeded` says how big the golden
//                             set must get before this comparison can settle.
//
// The third label is the point of EVAL3: today a borderline sweep silently
// reads as "no change", when it is actually "not measurable at n=69".
export function abVerdict(a, b, opts = {}) {
  const negligible = opts.negligible ?? config.eval.gateNegligible;
  const ci = pairedDelta(a, b, opts);
  const test = pairedPermutationTest(a, b, opts);

  let verdict;
  if (ci.lo > 0) verdict = 'improved';
  else if (ci.hi < 0) verdict = 'regressed';
  else if (ci.lo >= -negligible && ci.hi <= negligible) verdict = 'no-effect';
  else verdict = 'need-more-cases';

  // Half-width shrinks as 1/sqrt(n), so to make the interval exclude zero for
  // an effect of the observed size we need n * (halfWidth/|delta|)^2 cases.
  const half = ci.width / 2;
  const target = Math.max(Math.abs(ci.delta), negligible);
  const casesNeeded = ci.n && half > target
    ? Math.ceil(ci.n * (half / target) ** 2)
    : ci.n;

  return { ...ci, p: test.p, exact: test.exact, negligible, verdict, casesNeeded };
}

// Compact one-liner for CLI output.
export function formatVerdict(label, v) {
  const sign = (x) => (x > 0 ? `+${x}` : `${x}`);
  const mark = { improved: '^', regressed: 'v', 'no-effect': '=', 'need-more-cases': '?' }[v.verdict];
  const tail = v.verdict === 'need-more-cases' ? `  (need ~${v.casesNeeded} cases)` : '';
  return `    ${mark} ${label.padEnd(22)} ${v.meanB} -> ${v.meanA}  ${sign(v.delta)} `
    + `[${v.lo}, ${v.hi}] p=${v.p}  ${v.verdict}${tail}`;
}
