// Hybrid retrieval: FTS5/BM25 (CJK-bigram index) + embedding cosine, fused by
// weighted min-max-normalized scores, then multiplied by a time-decay factor
// derived from the article's last-revision age. Falls back to BM25-only when
// the embedding model is unreachable.

import { ftsQuery } from './db.mjs';
import { embedQuery, fromBlob, dot } from './embed.mjs';
import { config } from '../config.mjs';

function decayFactor(revTime, nowMs = Date.now()) {
  const { halfLifeDays, decayFloor } = config.retrieve;
  let ageDays = halfLifeDays; // unknown revision age = one half-life
  if (revTime) {
    const t = Date.parse(revTime);
    if (Number.isFinite(t)) ageDays = Math.max(0, (nowMs - t) / 86400000);
  }
  return decayFloor + (1 - decayFloor) * Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

function minMax(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return (v) => (hi > lo ? (v - lo) / (hi - lo) : 1);
}

// opts: { q, langs?: ['zh','en'], kinds?: ['scientist'], k? }
export async function search(db, opts = {}) {
  const q = String(opts.q || '').trim();
  if (!q) return [];
  const k = opts.k || config.retrieve.k;
  const cand = new Map(); // chunkId -> {bm25, cos}

  // 1) BM25 candidates
  const match = ftsQuery(q);
  if (match) {
    const rows = db
      .prepare(
        `SELECT rowid AS id, bm25(chunks_fts) AS rank FROM chunks_fts
         WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`
      )
      .all(match, config.retrieve.bm25Candidates);
    for (const r of rows) cand.set(r.id, { bm25: -r.rank, cos: null });
  }

  // 2) vector candidates (full scan on small corpora, rerank-only on large)
  let qv = null;
  try {
    qv = await embedQuery(q);
  } catch {
    qv = null;
  }
  if (qv) {
    const embedded = db
      .prepare('SELECT COUNT(*) n FROM chunks WHERE embedding IS NOT NULL')
      .get().n;
    if (embedded > 0 && embedded <= config.retrieve.scanMaxChunks) {
      const stmt = db.prepare(
        `SELECT c.id, c.embedding FROM chunks c
         JOIN pages p ON p.id = c.page_id
         WHERE c.embedding IS NOT NULL AND p.status='active'`
      );
      const iter = stmt.iterate ? stmt.iterate() : stmt.all();
      const top = [];
      for (const row of iter) {
        const cos = dot(qv, fromBlob(row.embedding));
        const hit = cand.get(row.id);
        if (hit) hit.cos = cos;
        top.push({ id: row.id, cos });
      }
      top.sort((a, b) => b.cos - a.cos);
      for (const t of top.slice(0, config.retrieve.bm25Candidates)) {
        const hit = cand.get(t.id);
        if (hit) hit.cos = t.cos;
        else cand.set(t.id, { bm25: null, cos: t.cos });
      }
    } else if (embedded > 0) {
      const get = db.prepare('SELECT embedding FROM chunks WHERE id=? AND embedding IS NOT NULL');
      for (const [id, hit] of cand) {
        const row = get.get(id);
        if (row) hit.cos = dot(qv, fromBlob(row.embedding));
      }
    }
  }

  const ids = [...cand.keys()];
  if (!ids.length) return [];

  // 3) fetch rows + apply lang/kind filters
  const filters = ["p.status='active'"];
  const args = [...ids];
  if (opts.langs?.length) {
    filters.push(`p.lang IN (${opts.langs.map(() => '?').join(',')})`);
    args.push(...opts.langs);
  }
  if (opts.kinds?.length) {
    filters.push(`p.kind IN (${opts.kinds.map(() => '?').join(',')})`);
    args.push(...opts.kinds);
  }
  const rows = db
    .prepare(
      `SELECT c.id AS chunkId, c.page_id AS pageId, c.section, c.text,
              p.title, p.lang, p.kind, p.url, p.rev_time AS revTime, p.qid
       FROM chunks c JOIN pages p ON p.id = c.page_id
       WHERE c.id IN (${ids.map(() => '?').join(',')}) AND ${filters.join(' AND ')}`
    )
    .all(...args);

  // 4) fuse scores
  const bVals = [];
  const vVals = [];
  for (const { bm25, cos } of cand.values()) {
    if (bm25 != null) bVals.push(bm25);
    if (cos != null) vVals.push(cos);
  }
  const nb = minMax(bVals);
  const nv = minMax(vVals);
  const { wBm25, wVec } = config.retrieve;
  const scored = rows.map((r) => {
    const { bm25, cos } = cand.get(r.chunkId);
    let score;
    if (bm25 != null && cos != null) {
      score = (wBm25 * nb(bm25) + wVec * nv(cos)) / (wBm25 + wVec);
    } else if (bm25 != null) {
      score = nb(bm25);
    } else {
      score = nv(cos);
    }
    const decay = decayFactor(r.revTime);
    return { ...r, bm25, cos, decay, score: score * decay };
  });
  scored.sort((a, b) => b.score - a.score);

  // 5) cap chunks per page, take k
  const perPage = new Map();
  const out = [];
  for (const r of scored) {
    const n = perPage.get(r.pageId) ?? 0;
    if (n >= config.retrieve.maxPerPage) continue;
    perPage.set(r.pageId, n + 1);
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}

// Compact reference block for prompt injection (used by /api/context and the
// scientists-backend seam). Each block cites language, title, section, and
// revision date so the model can weigh freshness.
export function buildContext(results, maxChars = config.retrieve.maxContextChars) {
  const parts = [];
  const sources = [];
  let used = 0;
  for (const r of results) {
    const rev = (r.revTime || '').slice(0, 10) || 'n/a';
    const head = `[Wikipedia:${r.lang} "${r.title}"${r.section ? ` #${r.section}` : ''} rev:${rev}]`;
    const block = `${head}\n${r.text}`;
    if (parts.length && used + block.length + 2 > maxChars) break;
    parts.push(block.length > maxChars - used ? block.slice(0, maxChars - used) : block);
    used += block.length + 2;
    sources.push({
      title: r.title,
      lang: r.lang,
      url: r.url,
      revTime: r.revTime,
      qid: r.qid,
      score: Number(r.score.toFixed(4)),
    });
    if (used >= maxChars) break;
  }
  return { context: parts.join('\n\n'), sources };
}
