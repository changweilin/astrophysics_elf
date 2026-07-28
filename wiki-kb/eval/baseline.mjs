// Committed retrieval baseline + delta report (EVAL1a) and the blocking gate
// (EVAL1b).
//
// `baseline.json` freezes the deterministic retrieval metrics (overall + per
// slice hitRate/MRR) so every later run prints how it moved the needle, plus
// the bootstrap CI of each of those numbers (EVAL3).
//
// EVAL1a is the NON-blocking report: it never touches the exit code.
// EVAL1b is `run-eval.mjs --gate`, which fails the process when a regression
// clears tolerance -- and the tolerance is no longer the hand-picked 0.005.
// `gateTolerances()` derives it per scope from HALF THE BASELINE CI WIDTH, so
// the gate's threshold is the golden set's own sampling noise: a slice measured
// on 11 cases gets a wide tolerance because its mean genuinely wobbles that
// much, while a 69-case overall metric gets a tight one. `gateMinTol` floors it.
//
// Caveat baked into the file: retrieval metrics are only reproducible while the
// bge-m3 embedding model is reachable. With Ollama down the vector channel drops
// to BM25-only and deltas are meaningless -- so the gate PRECONDITIONS on an
// embed-model ping (see run-eval.mjs) and refuses to judge rather than failing
// spuriously; this report just prints the caveat.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.join(HERE, 'baseline.json');

const round4 = (x) => Number(x.toFixed(4));

// Keep only the deterministic, retrieval-side metrics (drop LLM-judged ones and
// the machine-dependent avgRetrieveMs, which is noise across hosts). The `ci`
// block is kept because the gate's tolerance is derived from it.
function pickMetrics(m) {
  const out = { hitRate: m.hitRate, mrr: m.mrr };
  if (m.slices) out.slices = m.slices;
  if (m.ci) out.ci = m.ci;
  return out;
}

// Per-scope regression tolerance from the baseline's stored CIs (EVAL3 -> EVAL1b).
// Returns { 'overall.mrr': 0.07, 'tag:paraphrase.hitRate': 0.19, ... }.
// Scopes without a stored CI simply fall back to the caller's flat `tol`.
export function gateTolerances(baseline, { minTol = config.eval.gateMinTol } = {}) {
  const out = {};
  const ci = baseline?.metrics?.ci;
  if (!ci) return out;
  const add = (scope, name, entry) => {
    if (!entry || typeof entry.width !== 'number') return;
    out[`${scope}.${name}`] = round4(Math.max(minTol, entry.width / 2));
  };
  add('overall', 'hitRate', ci.hitRate);
  add('overall', 'mrr', ci.mrr);
  for (const [key, s] of Object.entries(ci.slices || {})) {
    add(key, 'hitRate', s.hitRate);
    add(key, 'mrr', s.mrr);
  }
  return out;
}

export function saveBaseline(result) {
  const { mode, k, graph, cases, metrics } = result;
  const payload = {
    generatedAt: new Date().toISOString(),
    note: 'Retrieval baseline for the non-blocking eval delta (EVAL1a). Reproducible only while the bge-m3 embedding model is reachable; deltas are meaningless if Ollama is down.',
    config: { mode, k, fusion: metrics.fusion, rrfK: metrics.rrfK ?? null, graph: !!graph, cases },
    metrics: pickMetrics(metrics),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return BASELINE_PATH;
}

export function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try { return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); } catch { return null; }
}

// Pure diff (prints nothing). `tol` is the flat fallback tolerance below which a
// change is treated as noise; `tolBy` (from gateTolerances) overrides it per
// `scope.metric`. Returns rows for every (scope, metric) pair plus the subset
// that regressed / improved and any run-config mismatch vs the baseline.
export function compareToBaseline(metrics, baseline, { tol = 0.005, tolBy = {} } = {}) {
  const rows = [];
  const add = (scope, name, curr, base) => {
    if (typeof curr !== 'number' || typeof base !== 'number') return;
    const delta = round4(curr - base);
    const t = tolBy[`${scope}.${name}`] ?? tol;
    const status = delta > t ? 'up' : delta < -t ? 'down' : 'flat';
    rows.push({ scope, metric: name, base, curr, delta, status, tol: t });
  };

  const bm = baseline.metrics || {};
  add('overall', 'hitRate', metrics.hitRate, bm.hitRate);
  add('overall', 'mrr', metrics.mrr, bm.mrr);
  const cs = metrics.slices || {};
  const bs = bm.slices || {};
  for (const key of Object.keys(bs)) {
    add(key, 'hitRate', cs[key]?.hitRate, bs[key].hitRate);
    add(key, 'mrr', cs[key]?.mrr, bs[key].mrr);
  }

  const cfg = baseline.config || {};
  const nowCfg = {
    mode: metrics.mode, k: metrics.k, fusion: metrics.fusion,
    rrfK: metrics.rrfK ?? null, graph: metrics.graph, cases: metrics.cases,
  };
  const configMismatch = [];
  for (const key of ['fusion', 'rrfK', 'graph', 'cases', 'k']) {
    if (nowCfg[key] !== undefined && cfg[key] !== undefined && nowCfg[key] !== cfg[key]) {
      configMismatch.push(`${key}: baseline=${cfg[key]} now=${nowCfg[key]}`);
    }
  }

  return {
    rows,
    regressions: rows.filter((r) => r.status === 'down'),
    improvements: rows.filter((r) => r.status === 'up'),
    configMismatch,
  };
}

// Human-readable one-liners for the CLI. Returns an array of lines.
// `blocking` only changes the wording -- the exit code is the caller's call.
export function formatComparison(cmp, baseline, { blocking = false } = {}) {
  const arrow = { up: '^', down: 'v', flat: '=' };
  const sign = (d) => (d > 0 ? `+${d}` : `${d}`);
  const lines = [`  vs baseline (${baseline.generatedAt || 'unknown'}):`];
  if (cmp.configMismatch.length) {
    lines.push(`    ! run config differs from baseline -- delta not apples-to-apples: ${cmp.configMismatch.join(', ')}`);
  }
  for (const r of cmp.rows) {
    lines.push(
      `    ${arrow[r.status]} ${(`${r.scope}.${r.metric}`).padEnd(24)} ${r.base} -> ${r.curr}  (${sign(r.delta)}`
      + `${r.tol != null ? `, tol ${r.tol}` : ''})`
    );
  }
  lines.push(
    cmp.regressions.length
      ? `    => ${cmp.regressions.length} regression(s) beyond tolerance${blocking ? '.' : ' (non-blocking).'}`
      : '    => no regressions beyond tolerance.'
  );
  return lines;
}
