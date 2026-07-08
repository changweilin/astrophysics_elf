// LLM observability: every retrieval / translate / generate / chat / judge
// call is recorded as one row in the `traces` table (Langfuse-style
// trace+score data model collapsed to a single flat table — no external
// server, viewable in kb-admin.html's 監測 tab). A full Langfuse deployment
// needs Docker+Postgres; this keeps the same queryable shape (kind, model,
// latency, tokens, error) inside the existing zero-dependency sqlite file, and
// could later be exported to a real Langfuse instance if one is stood up.
//
// Writes are best-effort: a tracing failure must never break the traced call.

import { config } from '../config.mjs';
import { now } from './db.mjs';

const clip = (v) => {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > config.trace.maxField ? s.slice(0, config.trace.maxField) + '…' : s;
};

export function recordTrace(db, {
  kind, name = null, model = null, input = null, output = null,
  ms = null, tokensIn = null, tokensOut = null, ok = true, error = null, meta = null,
} = {}) {
  try {
    const r = db.prepare(
      `INSERT INTO traces(ts,kind,name,model,input,output,ms,tokens_in,tokens_out,ok,error,meta)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      now(), kind, name, model, clip(input), clip(output),
      ms == null ? null : Math.round(ms), tokensIn, tokensOut,
      ok ? 1 : 0, error ? String(error).slice(0, 500) : null,
      meta ? clip(meta) : null
    );
    // Ring-buffer pruning, amortized: every ~200 inserts drop everything past
    // the configured retention window.
    const id = Number(r.lastInsertRowid);
    if (id % 200 === 0) {
      db.prepare('DELETE FROM traces WHERE id <= ?').run(id - config.trace.keep);
    }
  } catch {
    // never let telemetry break the caller
  }
}

// Wrap an async call: measures latency, records success/failure, rethrows.
// `finish(result)` maps the resolved value to trace fields (output/tokens/meta).
export async function traced(db, base, fn, finish) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const extra = finish ? finish(result) : {};
    recordTrace(db, { ...base, ms: Date.now() - t0, ok: true, ...extra });
    return result;
  } catch (e) {
    recordTrace(db, { ...base, ms: Date.now() - t0, ok: false, error: e && e.message || e });
    throw e;
  }
}

export function listTraces(db, { kind, limit = 100, offset = 0 } = {}) {
  const where = kind ? 'WHERE kind = ?' : '';
  const args = kind ? [kind] : [];
  const total = db.prepare(`SELECT COUNT(*) n FROM traces ${where}`).get(...args).n;
  const rows = db.prepare(
    `SELECT id, ts, kind, name, model, input, output, ms, tokens_in AS tokensIn,
            tokens_out AS tokensOut, ok, error, meta
     FROM traces ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...args, Math.max(1, Math.min(500, limit)), Math.max(0, offset));
  return { total, rows };
}

// Aggregates for the monitoring dashboard: per-kind call count, error rate,
// latency percentiles-ish (avg + max), token totals, within a time window.
export function traceSummary(db, { sinceHours = 24 } = {}) {
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const byKind = db.prepare(
    `SELECT kind,
            COUNT(*) AS calls,
            SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS errors,
            ROUND(AVG(ms)) AS avgMs,
            MAX(ms) AS maxMs,
            SUM(COALESCE(tokens_in,0)) AS tokensIn,
            SUM(COALESCE(tokens_out,0)) AS tokensOut
     FROM traces WHERE ts >= ? GROUP BY kind ORDER BY calls DESC`
  ).all(since);
  const byModel = db.prepare(
    `SELECT model,
            COUNT(*) AS calls,
            SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS errors,
            ROUND(AVG(ms)) AS avgMs,
            SUM(COALESCE(tokens_out,0)) AS tokensOut
     FROM traces WHERE ts >= ? AND model IS NOT NULL GROUP BY model ORDER BY calls DESC`
  ).all(since);
  const recentErrors = db.prepare(
    `SELECT ts, kind, model, error FROM traces
     WHERE ts >= ? AND ok = 0 ORDER BY id DESC LIMIT 10`
  ).all(since);
  return { sinceHours, since, byKind, byModel, recentErrors };
}
