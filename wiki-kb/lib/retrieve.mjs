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

// Tokenization comes from tokenize.mjs, not db.mjs: this module needs no
// `node:sqlite` of its own (the caller hands it an open db), which is what
// lets its ranking/delivery logic be unit-tested without a corpus.
import { ftsQuery, cjkTokenize } from './tokenize.mjs';
import { embedQuery, fromBlob, dot } from './embed.mjs';
import { graphChannel } from './graph-rank.mjs';
import { routeQuery } from './query-route.mjs';
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

// opts: { q, langs?: ['zh','en'], kinds?: ['scientist'], k?, fusion?, rrfK?,
//         qroute?: 'off'|'observe'|'on', onRoute?: (route) => void }
// fusion/rrfK/qroute override config.retrieve for single-process A/B comparisons
// (mirrors the opts.noGraph pattern the graph channel got). onRoute receives the
// QROUTE decision so callers can slice/trace by route without re-classifying.
export async function search(db, opts = {}) {
  const q = String(opts.q || '').trim();
  if (!q) return [];
  const k = opts.k || config.retrieve.k;
  const cand = new Map(); // chunkId -> {bm25, cos}

  // QROUTE: pure string classification, no DB/LLM. In 'off' mode this is skipped
  // entirely; in 'observe' (default) the decision is reported but every knob it
  // returns is the pre-QROUTE default, so the branch below is behaviour-neutral.
  const qrouteMode = opts.qroute || config.retrieve.qroute || 'observe';
  let route = null;
  if (qrouteMode !== 'off') {
    try {
      route = routeQuery(q, { mode: qrouteMode });
      opts.onRoute?.(route);
    } catch {
      route = null; // routing is best-effort; retrieval stands on its own
    }
  }

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
  const { graphSeedPages, graphExpandScore } = config.retrieve;
  // QROUTE knobs (all identity values unless the router is in 'on' mode).
  const wGraph = config.retrieve.wGraph * (route?.wGraphScale ?? 1);
  const usePpr = route ? route.usePpr : true;
  const expandPages = route && !route.expand ? 0 : undefined;
  if (wGraph > 0 && scored.length && !opts.noGraph && usePpr) {
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
        expandPages,
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
//
// Delivery (RET2/RET4): search() ranks k chunks and runs the expensive PPR
// multi-hop expansion, but a tight char budget used to deliver ~1 chunk and
// truncate the graph-expanded pages away entirely (they sort below organic
// hits) -- the retrieval depth was paid for and then discarded. So here we
//   1) collapse same-qid chunks across languages (a concept's zh and en pages
//      are distinct pageIds sharing one qid) so the budget isn't spent twice on
//      the same fact, and
//   2) RESERVE a slot for graph-expanded pages so a couple of multi-hop hits
//      always reach the model, and
//   3) optionally diversify what is left with MMR (`mmrOrder`, off by default)
//      so two different-qid chunks carrying the same sentence do not both
//      occupy the budget.
// The returned `coverage` reports delivered-vs-retrieved so the throttle is
// visible in traces instead of silent.
const CTX_SEP = 2; // length of the '\n\n' joiner between blocks

function ctxBlock(r) {
  const rev = (r.revTime || '').slice(0, 10) || 'n/a';
  const head = `[Wikipedia:${r.lang} "${r.title}"${r.section ? ` #${r.section}` : ''} rev:${rev}]`;
  return `${head}\n${r.text}`;
}
function ctxSource(r) {
  return {
    title: r.title,
    lang: r.lang,
    url: r.url,
    revTime: r.revTime,
    qid: r.qid,
    score: Number((r.score ?? 0).toFixed(4)),
    graphExpanded: r.graphExpanded || undefined,
  };
}
// Keep the first (highest-scored) chunk per qid; chunks without a qid (manual
// notes) are each kept. Input is already score-sorted, so order is preserved.
function dedupeByQid(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (r.qid != null) {
      if (seen.has(r.qid)) continue;
      seen.add(r.qid);
    }
    out.push(r);
  }
  return out;
}

// RET4 -- MMR diversity over near-duplicate DIFFERENT-qid chunks.
//
// dedupeByQid above collapses one concept's zh/en pages, because they share a
// qid. What it cannot see is two distinct qids whose delivered chunks say
// nearly the same thing ("Kerr metric" and "Rotating black hole" both opening
// with the same definition), which spends a tight char budget twice on one
// fact and starves the rest of the retrieved set.
//
// Similarity is lexical -- the FTS index's own CJK-bigram tokenization, so CJK
// compares by character bigram and latin by word. Chunk embeddings are not
// carried through search()'s candidate rows, and loading hundreds of blobs to
// diversify <=8 delivered chunks would cost more than the pass saves. Lexical
// also happens to be the right tool for what is LEFT here: cross-lingual
// near-duplicates are already gone by qid, so the remaining ones are
// same-language and share surface form.
function tokenSet(text) {
  return new Set(cjkTokenize(String(text || '')));
}

// Cosine over token sets: |A n B| / sqrt(|A||B|), in [0,1].
function setCosine(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const t of small) if (large.has(t)) inter++;
  return inter / Math.sqrt(a.size * b.size);
}

// Greedy MMR: pick the top-relevance row, then repeatedly pick the row
// maximizing `lambda*rel - (1-lambda)*maxSim(already picked)`. Relevance is the
// fused score normalized by the set's own max, so it is on the same [0,1] scale
// as the similarity term in every channel mode. lambda >= 1 returns the input
// untouched (the identity default), and ties keep the higher-scored row first,
// so the pass is stable.
export function mmrOrder(rows, lambda = config.retrieve.mmrLambda) {
  if (!(lambda < 1) || rows.length < 3) return rows;
  let maxScore = 0;
  for (const r of rows) if ((r.score ?? 0) > maxScore) maxScore = r.score ?? 0;
  const norm = maxScore > 0 ? maxScore : 1;
  const rel = rows.map((r) => (r.score ?? 0) / norm);
  const toks = rows.map((r) => tokenSet(r.text));
  const maxSim = new Array(rows.length).fill(0);
  const pending = rows.map((_, i) => i);
  const out = [];
  while (pending.length) {
    let bestAt = 0;
    let bestVal = -Infinity;
    for (let j = 0; j < pending.length; j++) {
      const i = pending[j];
      const val = out.length ? lambda * rel[i] - (1 - lambda) * maxSim[i] : rel[i];
      if (val > bestVal) {
        bestVal = val;
        bestAt = j;
      }
    }
    const pick = pending.splice(bestAt, 1)[0];
    out.push(rows[pick]);
    for (const i of pending) {
      const s = setCosine(toks[i], toks[pick]);
      if (s > maxSim[i]) maxSim[i] = s;
    }
  }
  return out;
}

export function buildContext(results, maxChars = config.retrieve.maxContextChars, opts = {}) {
  const graphReserve = opts.graphReserve ?? config.retrieve.graphReserve;
  const mmrLambda = opts.mmrLambda ?? config.retrieve.mmrLambda;
  const ranked = dedupeByQid(results.filter((r) => !r.graphExpanded));
  // Diversify the organic rows only. The graph-expanded ones are already
  // capped at `graphReserve` (1 by default) and come from a different channel,
  // so there is nothing for MMR to spread out there.
  const organic = mmrOrder(ranked, mmrLambda);
  const mmrMoved = organic.reduce((n, r, i) => n + (r === ranked[i] ? 0 : 1), 0);
  const expanded = dedupeByQid(results.filter((r) => r.graphExpanded)).slice(0, graphReserve);

  const parts = [];
  const sources = [];
  let used = 0;
  // Fill `rows` into the running budget. Skips (does not break on) an oversized
  // block so a later shorter block can still fit; truncates only a lone first
  // block that alone exceeds the budget.
  const fill = (rows, budget) => {
    for (const r of rows) {
      const block = ctxBlock(r);
      const sep = parts.length ? CTX_SEP : 0;
      if (!parts.length && block.length > budget) {
        const text = block.slice(0, budget);
        parts.push(text);
        used += text.length;
        sources.push(ctxSource(r));
        continue;
      }
      if (used + sep + block.length > budget) continue;
      parts.push(block);
      used += sep + block.length;
      sources.push(ctxSource(r));
    }
  };

  // Reserve up to half the budget for the graph-expanded pages, fill organic
  // into the rest, then let the expansion take whatever the organic fill left.
  let reserve = 0;
  for (const r of expanded) reserve += ctxBlock(r).length + CTX_SEP;
  reserve = Math.min(reserve, Math.floor(maxChars / 2));
  fill(organic, Math.max(0, maxChars - reserve));
  fill(expanded, maxChars);

  const retrievedQids = new Set(results.filter((r) => r.qid != null).map((r) => r.qid));
  const deliveredQids = new Set(sources.filter((s) => s.qid != null).map((s) => s.qid));
  const coverage = {
    retrievedChunks: results.length,
    deliveredChunks: sources.length,
    retrievedQids: retrievedQids.size,
    deliveredQids: deliveredQids.size,
    graphRetrieved: results.filter((r) => r.graphExpanded).length,
    graphDelivered: sources.filter((s) => s.graphExpanded).length,
    charsUsed: used,
    maxChars,
    // So a trace says whether the diversity pass was on and whether it
    // actually changed the delivered order, instead of leaving it invisible.
    mmrLambda,
    mmrMoved,
  };
  return { context: parts.join('\n\n'), sources, coverage };
}
