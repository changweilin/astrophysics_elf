// Committed retrieval baseline + non-blocking delta report (EVAL1a).
//
// `baseline.json` freezes the deterministic retrieval metrics (overall + per
// slice hitRate/MRR) so every later run prints how it moved the needle. This is
// deliberately NON-blocking: it never changes the exit code. The blocking gate
// (EVAL1b) is a thin wrapper that fails when `compareToBaseline().regressions`
// is non-empty -- once the golden set and EVAL3's CIs justify a tolerance.
//
// Caveat baked into the file: retrieval metrics are only reproducible while the
// bge-m3 embedding model is reachable. With Ollama down the vector channel drops
// to BM25-only and deltas are meaningless -- the gate (EVAL1b) must precondition
// on an Ollama ping; this report just prints the caveat.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.join(HERE, 'baseline.json');

const round4 = (x) => Number(x.toFixed(4));

// Keep only the deterministic, retrieval-side metrics (drop LLM-judged ones and
// the machine-dependent avgRetrieveMs, which is noise across hosts).
function pickMetrics(m) {
  const out = { hitRate: m.hitRate, mrr: m.mrr };
  if (m.slices) out.slices = m.slices;
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

// Pure diff (prints nothing). tol = rank-step tolerance below which a change is
// treated as noise. Returns rows for every (scope, metric) pair plus the subset
// that regressed / improved and any run-config mismatch vs the baseline.
export function compareToBaseline(metrics, baseline, { tol = 0.005 } = {}) {
  const rows = [];
  const add = (scope, name, curr, base) => {
    if (typeof curr !== 'number' || typeof base !== 'number') return;
    const delta = round4(curr - base);
    const status = delta > tol ? 'up' : delta < -tol ? 'down' : 'flat';
    rows.push({ scope, metric: name, base, curr, delta, status });
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
export function formatComparison(cmp, baseline) {
  const arrow = { up: '^', down: 'v', flat: '=' };
  const sign = (d) => (d > 0 ? `+${d}` : `${d}`);
  const lines = [`  vs baseline (${baseline.generatedAt || 'unknown'}):`];
  if (cmp.configMismatch.length) {
    lines.push(`    ! run config differs from baseline -- delta not apples-to-apples: ${cmp.configMismatch.join(', ')}`);
  }
  for (const r of cmp.rows) {
    lines.push(`    ${arrow[r.status]} ${(`${r.scope}.${r.metric}`).padEnd(24)} ${r.base} -> ${r.curr}  (${sign(r.delta)})`);
  }
  lines.push(
    cmp.regressions.length
      ? `    => ${cmp.regressions.length} regression(s) beyond tolerance (non-blocking).`
      : '    => no regressions beyond tolerance.'
  );
  return lines;
}
