// Hybrid retrieval: FTS5/BM25 (CJK-bigram index) + embedding cosine, fused by
// weighted Reciprocal Rank Fusion by default (WKB_FUSION=weighted restores the
// legacy min-max-normalized score blend), then multiplied by a time-decay
// factor derived from the article's last-revision age. Falls back to BM25-only
// when the embedding model is unreachable.
//
// A third, graph channel (HippoRAG-style PPR over the Wikidata KG, see
// graph-rank.mjs) multiplicatively boosts candidates whose pages are
// graph-connected to the query's entities and can pull in a couple of
// multi-hop pages the lexical/vector channels missed. It is additive and
// fail-open: wGraph=0 or any error reproduces the plain hybrid ranking.

import { ftsQuery } from './db.mjs';
import { embedQuery, fromBlob, dot } from './embed.mjs';
import { graphChannel } from './graph-rank.mjs';
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

// Embedded-chunk count only changes on ingest, but `COUNT(*) ... WHERE
// embedding IS NOT NULL` is a full table scan (~200ms on 293k rows) with no
// supporting index -- cache it briefly so every query doesn't pay that scan
// just to pick the full-scan-vs-rerank-only branch below.
const EMBEDDED_COUNT_TTL_MS = 60 * 1000;
let embeddedCountCache = null;
function embeddedCount(db) {
  const now = Date.now();
  if (!embeddedCountCache || now - embeddedCountCache.at > EMBEDDED_COUNT_TTL_MS) {
    const n = db.prepare('SELECT COUNT(*) n FROM chunks WHERE embedding IS NOT NULL').get().n;
    embeddedCountCache = { n, at: now };
  }
  return embeddedCountCache.n;
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

// opts: { q, langs?: ['zh','en'], kinds?: ['scientist'], k?, fusion?, rrfK? }
// fusion/rrfK override config.retrieve for single-process A/B comparisons
// (mirrors the opts.noGraph pattern the graph channel got).
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
    qv = await embedQuery(q, opts.signal);
  } catch {
    qv = null;
  }
  if (qv && !(opts.signal && opts.signal.aborted)) {
    const embedded = embeddedCount(db);
    if (embedded > 0 && embedded <= config.retrieve.scanMaxChunks) {
      const stmt = db.prepare(
        `SELECT c.id, c.embedding FROM chunks c
         JOIN pages p ON p.id = c.page_id
         WHERE c.embedding IS NOT NULL AND p.status='active'`
      );
      const iter = stmt.iterate ? stmt.iterate() : stmt.all();
      const top = [];
      // This is a synchronous CPU loop (no `await`) that can run for a while
      // on a large corpus, so it never yields to the event loop on its own --
      // check the abort signal periodically so a cancelled request actually
      // stops scanning instead of blocking everything else until done.
      let n = 0;
      for (const row of iter) {
        if (opts.signal && (++n & 1023) === 0 && opts.signal.aborted) break;
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

  // 3) fetch rows for the (small, already-selected) candidate ids, then apply
  // lang/kind filters in JS. Adding `p.lang IN (...)` to the SQL itself flips
  // SQLite's join order -- it drives from idx_pages_lang_status (a scan of
  // every active zh/en page, tens of thousands of rows) instead of the cheap
  // per-id primary-key lookup, costing ~1.5-2s per query. The candidate set
  // is already <=800 rows here, so filtering after fetch is free.
  const rows = db
    .prepare(
      `SELECT c.id AS chunkId, c.page_id AS pageId, c.section, c.text,
              p.title, p.lang, p.kind, p.url, p.rev_time AS revTime, p.qid
       FROM chunks c JOIN pages p ON p.id = c.page_id
       WHERE c.id IN (${ids.map(() => '?').join(',')}) AND p.status='active'`
    )
    .all(...ids)
    .filter(
      (r) =>
        (!opts.langs?.length || opts.langs.includes(r.lang)) &&
        (!opts.kinds?.length || opts.kinds.includes(r.kind))
    );

  // 4) fuse scores. RRF works on per-channel ranks, so it is immune to the
  // incomparable scales of BM25 vs cosine that the min-max path has to patch
  // over. Ranks are computed over the rows that SURVIVED the lang/kind
  // filter: rank fusion is not affine like min-max, so filtered-out docs
  // (e.g. other-language near-duplicates crowding the vector top exactly
  // when a lang filter is active) must not occupy ranks. Ties share a rank
  // (competition ranking) so equal-relevance docs score identically no
  // matter what order SQLite returned them in. The fused score is
  // normalized by the observed max so the top organic hit is 1.0 pre-decay
  // in every channel mode (vector down, BM25 empty, single candidate) --
  // the same invariant min-max provides, which is what keeps the decay
  // multiplier, graph boost, and graph expansion calibrated downstream.
  const fusion = opts.fusion || config.retrieve.fusion;
  const rrfK = opts.rrfK || config.retrieve.rrfK;
  const { wBm25, wVec } = config.retrieve;
  let fuse;
  if (fusion === 'rrf') {
    const rankOf = (key) => {
      const order = rows
        .map((r) => ({ id: r.chunkId, v: cand.get(r.chunkId)[key] }))
        .filter((x) => x.v != null)
        .sort((a, b) => b.v - a.v);
      const ranks = new Map();
      let rank = 0;
      for (let i = 0; i < order.length; i++) {
        if (i === 0 || order[i].v < order[i - 1].v) rank = i + 1;
        ranks.set(order[i].id, rank);
      }
      return ranks;
    };
    const bRank = rankOf('bm25');
    const vRank = rankOf('cos');
    const raw = new Map();
    let maxRaw = 0;
    for (const r of rows) {
      const rb = bRank.get(r.chunkId);
      const rv = vRank.get(r.chunkId);
      const s = (rb ? wBm25 / (rrfK + rb) : 0) + (rv ? wVec / (rrfK + rv) : 0);
      raw.set(r.chunkId, s);
      if (s > maxRaw) maxRaw = s;
    }
    fuse = (id) => (maxRaw > 0 ? raw.get(id) / maxRaw : 0);
  } else {
    const bVals = [];
    const vVals = [];
    for (const { bm25, cos } of cand.values()) {
      if (bm25 != null) bVals.push(bm25);
      if (cos != null) vVals.push(cos);
    }
    const nb = minMax(bVals);
    const nv = minMax(vVals);
    fuse = (id) => {
      const { bm25, cos } = cand.get(id);
      if (bm25 != null && cos != null) {
        return (wBm25 * nb(bm25) + wVec * nv(cos)) / (wBm25 + wVec);
      }
      return bm25 != null ? nb(bm25) : nv(cos);
    };
  }
  const scored = rows.map((r) => {
    const { bm25, cos } = cand.get(r.chunkId);
    const decay = decayFactor(r.revTime);
    return { ...r, bm25, cos, decay, score: fuse(r.chunkId) * decay };
  });
  scored.sort((a, b) => b.score - a.score);

  // 4b) graph channel: PPR seeded by the top hybrid hits' qids + entities the
  // query mentions by name. Boost is multiplicative (base * (1 + wGraph*g))
  // so rows without a qid (manual notes) keep their ordering untouched, and
  // a couple of high-PPR pages outside the candidate set are pulled in.
  const { wGraph, graphSeedPages, graphExpandScore } = config.retrieve;
  if (wGraph > 0 && scored.length && !opts.noGraph) {
    try {
      const seedQids = [];
      const seenPages = new Set();
      for (const r of scored) {
        if (seenPages.has(r.pageId)) continue;
        seenPages.add(r.pageId);
        if (r.qid) seedQids.push(r.qid);
        if (seedQids.length >= graphSeedPages) break;
      }
      const graph = graphChannel(db, {
        q,
        seedQids,
        excludePageIds: new Set(scored.map((r) => r.pageId)),
        langs: opts.langs,
        qv,
        fromBlob,
        dot,
      });
      if (graph) {
        for (const r of scored) {
          if (!r.qid) continue;
          r.g = graph.score(r.qid);
          r.score *= 1 + wGraph * r.g;
        }
        scored.sort((a, b) => b.score - a.score);
        // Anchor expansion scores to the organic distribution. Under RRF the
        // fused top-k compresses toward 1.0 (a fixed 0.5 could never surface
        // an expanded page) while degraded single-channel modes cap organic
        // scores below 0.5 (a fixed 0.5 would outrank every organic hit), so
        // scale by the k-th organic score. Weighted mode keeps anchor=1,
        // reproducing the legacy behavior exactly.
        const anchor = fusion === 'rrf'
          ? scored[Math.min(k, scored.length) - 1].score
          : 1;
        for (const e of graph.expand) {
          const decay = decayFactor(e.revTime);
          scored.push({
            ...e,
            bm25: null,
            cos: null,
            decay,
            graphExpanded: true,
            score: e.g * graphExpandScore * anchor * decay,
          });
        }
        scored.sort((a, b) => b.score - a.score);
      }
    } catch {
      // graph channel is best-effort; hybrid ranking stands on its own
    }
  }

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
