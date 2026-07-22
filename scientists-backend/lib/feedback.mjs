// Per-reply user feedback (like/dislike) for the scientists chat, stored in
// the shared wiki-kb SQLite file so rows can be joined with the existing
// `traces` table and surfaced in kb-admin later. Minimal-viable schema for
// the planned evaluation loop:
//   rating / reasons / comment -> data triage + auto-labelling
//   correction + ned           -> normalized edit distance between the model's
//                                 answer and the user's corrected answer
//   status / auto_label        -> pipeline bookkeeping (new -> triaged -> exported)
// Rows upsert by client_id (the frontend's per-bubble key), so a changed mind
// overwrites rather than duplicates; rating 0 retracts (deletes) the row. Any
// re-rating resets status/auto_label so the triage pipeline re-examines it.

import { now } from '../../wiki-kb/lib/db.mjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  client_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'chat',
  session_id TEXT,
  scientist_id TEXT,
  lang TEXT,
  model TEXT,
  reply_mode TEXT,
  rag_used INTEGER,
  sources TEXT,
  question TEXT,
  answer TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL,
  reasons TEXT,
  comment TEXT,
  correction TEXT,
  ned REAL,
  auto_label TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  request_id TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback(ts);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, rating);
`;

export function initFeedback(db) {
  db.exec(SCHEMA);
  // Column migration for tables created before request_id existed (same
  // add-column-if-missing pattern as wiki-kb/lib/db.mjs migrate()).
  const cols = db.prepare('PRAGMA table_info(feedback)').all().map((c) => c.name);
  if (!cols.includes('request_id')) db.exec('ALTER TABLE feedback ADD COLUMN request_id TEXT');
}

// Long enough for a full reply plus a full correction, small enough to bound
// abuse well under readJson's 1 MB body cap.
const TEXT_MAX = 16_000;

const round3 = (x) => Math.round(x * 1000) / 1000;

// Only genuine text is accepted -- objects/arrays would String-coerce to
// '[object Object]' and pollute the eval data.
function clip(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

// Oversized or unserializable payloads are dropped rather than truncated --
// a truncated JSON string would no longer parse on the way back out.
function safeJson(v, max) {
  if (v == null) return null;
  try {
    const s = JSON.stringify(v);
    if (!s || s === 'null' || s === '[]' || s === '{}') return null;
    return s.length > max ? null : s;
  } catch {
    return null;
  }
}

// Levenshtein distance over code points, normalized to [0, 1] by the longer
// length (0 = identical, 1 = nothing in common). Inputs are capped so the
// O(n*m) table stays bounded (~16M cells worst case) on a synchronous server.
// Beyond the cap, each input is sampled as head + tail halves rather than
// truncated -- plain truncation would report 0 for texts that share a prefix
// but diverge later, exactly where a long correction differs from the answer.
function sampleForNed(text, cap) {
  const chars = Array.from(String(text));
  if (chars.length <= cap) return chars;
  const half = Math.floor(cap / 2);
  return chars.slice(0, half).concat(chars.slice(chars.length - half));
}

export function normalizedEditDistance(a = '', b = '', cap = 4000) {
  const s = sampleForNed(a, cap);
  const t = sampleForNed(b, cap);
  if (!s.length && !t.length) return 0;
  if (!s.length || !t.length) return 1;
  let prev = new Array(t.length + 1);
  let cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[t.length] / Math.max(s.length, t.length);
}

export function upsertFeedback(db, body = {}) {
  const clientId = clip(body.clientId, 128);
  if (!clientId) throw new Error('clientId required');
  // Strict type check: Number(null/''/[]) would silently coerce to 0, turning
  // a malformed body into an accidental retraction (DELETE).
  const rating = body.rating;
  if (typeof rating !== 'number' || (rating !== -1 && rating !== 0 && rating !== 1)) {
    throw new Error('rating must be -1, 0, or 1');
  }

  if (rating === 0) {
    const r = db.prepare('DELETE FROM feedback WHERE client_id = ?').run(clientId);
    return { removed: Number(r.changes) > 0 };
  }

  const answer = clip(body.answer, TEXT_MAX);
  if (!answer) throw new Error('answer required');
  const correction = clip(body.correction, TEXT_MAX);
  const reasons = Array.isArray(body.reasons)
    ? body.reasons.slice(0, 10).map((r) => clip(r, 40)).filter(Boolean)
    : [];
  const ned = correction ? round3(normalizedEditDistance(answer, correction)) : null;

  db.prepare(`
    INSERT INTO feedback (
      ts, client_id, source, session_id, scientist_id, lang, model, reply_mode,
      rag_used, sources, question, answer, rating, reasons, comment, correction,
      ned, status, request_id, meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      ts = excluded.ts, source = excluded.source, session_id = excluded.session_id,
      scientist_id = excluded.scientist_id, lang = excluded.lang, model = excluded.model,
      reply_mode = excluded.reply_mode, rag_used = excluded.rag_used, sources = excluded.sources,
      question = excluded.question, answer = excluded.answer, rating = excluded.rating,
      reasons = excluded.reasons, comment = excluded.comment, correction = excluded.correction,
      ned = excluded.ned, status = 'new', auto_label = NULL,
      request_id = excluded.request_id, meta = excluded.meta
  `).run(
    now(), clientId,
    clip(body.source, 32) || 'chat',
    clip(body.sessionId, 128) || null,
    clip(body.scientistId, 64) || null,
    clip(body.lang, 8) || null,
    clip(body.model, 128) || null,
    clip(body.replyMode, 16) || null,
    typeof body.ragUsed === 'boolean' ? (body.ragUsed ? 1 : 0) : null,
    safeJson(body.sources, 4000),
    clip(body.question, TEXT_MAX) || null,
    answer, rating,
    reasons.length ? JSON.stringify(reasons) : null,
    clip(body.comment, 2000) || null,
    correction || null,
    ned,
    clip(body.requestId, 64) || null,
    safeJson(body.meta, 2000),
  );
  const row = db.prepare('SELECT id, ned FROM feedback WHERE client_id = ?').get(clientId);
  return { id: Number(row.id), ned: row.ned };
}

export function listFeedback(db, { limit = 50, offset = 0, rating, status, source } = {}) {
  const where = [];
  const args = [];
  if (rating != null && rating !== '') { where.push('rating = ?'); args.push(Number(rating)); }
  if (status) { where.push('status = ?'); args.push(String(status)); }
  if (source) { where.push('source = ?'); args.push(String(source)); }
  const cond = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const lim = Math.max(1, Math.min(500, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const total = Number(db.prepare('SELECT COUNT(*) AS n FROM feedback' + cond).get(...args).n);
  // client_id is deliberately NOT exposed: it is the unauthenticated
  // upsert/delete key, and this endpoint is reachable from any origin (CORS *).
  const rows = db.prepare(
    `SELECT id, ts, source, session_id AS sessionId,
       scientist_id AS scientistId, lang, model, reply_mode AS replyMode,
       rag_used AS ragUsed, sources, question, answer, rating, reasons, comment,
       correction, ned, auto_label AS autoLabel, status, request_id AS requestId, meta
     FROM feedback` + cond + ' ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?',
  ).all(...args, lim, off);
  return { total, rows };
}

export function feedbackStats(db) {
  const g = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS up,
      SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) AS down,
      SUM(CASE WHEN correction IS NOT NULL THEN 1 ELSE 0 END) AS corrections,
      AVG(ned) AS avgNed
    FROM feedback
  `).get();
  const byStatus = {};
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status').all()) {
    byStatus[r.status] = Number(r.n);
  }
  const byScientist = db.prepare(`
    SELECT scientist_id AS scientistId, COUNT(*) AS total,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS up
    FROM feedback GROUP BY scientist_id ORDER BY total DESC LIMIT 20
  `).all().map((r) => ({ scientistId: r.scientistId, total: Number(r.total), up: Number(r.up) || 0 }));
  return {
    total: Number(g.total) || 0,
    up: Number(g.up) || 0,
    down: Number(g.down) || 0,
    corrections: Number(g.corrections) || 0,
    avgNed: g.avgNed == null ? null : round3(g.avgNed),
    byStatus,
    byScientist,
  };
}
