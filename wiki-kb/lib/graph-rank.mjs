// Graph-augmented retrieval channel (HippoRAG-style): seed the query into the
// existing Wikidata knowledge graph (entities/edges) and run Personalized
// PageRank, so pages that are graph-connected to what the query mentions get
// boosted — including multi-hop neighbors the lexical/vector channels miss.
//
// Why this and not GraphRAG/LightRAG: both of those require an LLM extraction
// pass over the whole corpus at index time (infeasible on the local 8B setup);
// HippoRAG's offline graph is exactly what syncEntities() already built from
// Wikidata for free. See docs/rag-architecture-decision.md.
//
// Zero LLM calls at query time: entity linking is label matching (query
// n-grams against entity labels) plus the qids of the top hybrid hits, and
// PPR is a bounded power iteration over an in-memory adjacency cache.

import { config } from '../config.mjs';

// ---- adjacency + label index cache -----------------------------------------
// Rebuilt when the edge count changes or after a TTL; costs one full edges
// scan (~a few hundred ms on the 110k-entity graph), amortized across queries.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = null;

function buildIndex(db, edgeCount) {
  const idOf = new Map(); // qid -> dense int
  const qids = [];
  const intern = (qid) => {
    let i = idOf.get(qid);
    if (i === undefined) {
      i = qids.length;
      idOf.set(qid, i);
      qids.push(qid);
    }
    return i;
  };
  const pairs = db.prepare('SELECT src, dst FROM edges').all();
  const adj = [];
  for (const { src, dst } of pairs) {
    const a = intern(src);
    const b = intern(dst);
    if (a === b) continue;
    (adj[a] ??= []).push(b);
    (adj[b] ??= []).push(a); // undirected walk: influence flows both ways
  }

  // Label -> qid for query entity linking. Non-stub entities only (stubs have
  // no corpus pages and would double the map for little linking value; they
  // still participate in the walk as connector nodes via `adj`).
  const labels = new Map();
  const rows = db
    .prepare("SELECT qid, label_en, label_zh FROM entities WHERE kind != 'stub'")
    .all();
  for (const r of rows) {
    if (!idOf.has(r.qid)) continue; // isolated entity: PPR can't reach it anyway
    for (const label of [r.label_en, r.label_zh]) {
      if (!label) continue;
      const key = label.toLowerCase();
      // Latin labels shorter than 3 chars and CJK shorter than 2 are too
      // ambiguous to link ("He", "H", "力").
      const min = /[぀-ヿ㐀-䶿一-鿿가-힯]/.test(key) ? 2 : 3;
      if (key.length < min) continue;
      if (!labels.has(key)) labels.set(key, r.qid);
    }
  }
  return { builtAt: Date.now(), edgeCount, idOf, qids, adj, labels };
}

function getIndex(db) {
  const edgeCount = db.prepare('SELECT COUNT(*) n FROM edges').get().n;
  if (!edgeCount) return null;
  if (!cache || cache.edgeCount !== edgeCount || Date.now() - cache.builtAt > CACHE_TTL_MS) {
    cache = buildIndex(db, edgeCount);
  }
  return cache;
}

// ---- entity linking ---------------------------------------------------------
// Candidate mentions = latin word n-grams (1..4 words) plus all CJK substrings
// of length 2..8, looked up in the label map. Bounded by query length, so this
// is O(query), not O(labels).
function linkQueryEntities(index, q) {
  const found = new Set();
  const lower = q.toLowerCase();
  const words = lower.match(/[a-z0-9][a-z0-9+.\-]*/g) ?? [];
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const qid = index.labels.get(words.slice(i, i + n).join(' '));
      if (qid) found.add(qid);
    }
  }
  const runs = lower.match(/[぀-ヿ㐀-䶿一-鿿가-힯]+/g) ?? [];
  for (const run of runs) {
    for (let len = 2; len <= Math.min(8, run.length); len++) {
      for (let i = 0; i + len <= run.length; i++) {
        const qid = index.labels.get(run.slice(i, i + len));
        if (qid) found.add(qid);
      }
    }
  }
  return found;
}

// ---- personalized pagerank --------------------------------------------------
// p_{t+1} = alpha * s + (1 - alpha) * W p_t, dangling mass returned to the
// seed distribution. alpha ~0.5 (HippoRAG's damping) keeps mass near the
// seeds so 1-2 hop neighbors rank far above the generic hubs.
function personalizedPageRank(index, seedIdxs, { alpha, iters }) {
  const N = index.qids.length;
  const seedShare = 1 / seedIdxs.length;
  let p = new Float64Array(N);
  for (const i of seedIdxs) p[i] += seedShare;

  for (let it = 0; it < iters; it++) {
    const next = new Float64Array(N);
    let dangling = 0;
    for (let u = 0; u < N; u++) {
      const pu = p[u];
      if (pu === 0) continue;
      const nbrs = index.adj[u];
      if (!nbrs || !nbrs.length) {
        dangling += pu;
        continue;
      }
      const share = ((1 - alpha) * pu) / nbrs.length;
      for (const v of nbrs) next[v] += share;
    }
    const teleport = alpha + (1 - alpha) * dangling;
    for (const i of seedIdxs) next[i] += teleport * seedShare;
    p = next;
  }
  return p;
}

// ---- public channel ----------------------------------------------------------
// Returns null when the graph contributes nothing (no seeds / empty graph),
// otherwise { score(qid) -> [0,1], expand: [chunk-shaped rows] }.
//
//   q               query text (for entity linking)
//   seedQids        qids of the top hybrid hits (grounding, HippoRAG "query
//                   nodes" analogue)
//   excludePageIds  pages already in the candidate set
//   langs           same lang filter the caller applied
//   qv / fromBlob / dot   optional query vector + helpers, to pick the best
//                   chunk of an expansion page instead of its first chunk
export function graphChannel(db, { q, seedQids = [], excludePageIds = new Set(), langs, qv, fromBlob, dot } = {}) {
  const { pprAlpha, pprIters, graphExpandPages } = config.retrieve;
  const index = getIndex(db);
  if (!index) return null;

  const seeds = new Set(seedQids.filter((s) => s && index.idOf.has(s)));
  for (const qid of linkQueryEntities(index, q)) seeds.add(qid);
  if (!seeds.size) return null;

  const seedIdxs = [...seeds].map((s) => index.idOf.get(s));
  const p = personalizedPageRank(index, seedIdxs, { alpha: pprAlpha, iters: pprIters });

  let max = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > max) max = p[i];
  if (max <= 0) return null;
  const score = (qid) => {
    const i = index.idOf.get(qid);
    return i === undefined ? 0 : p[i] / max;
  };

  // Multi-hop expansion: highest-PPR entities whose pages are NOT already
  // candidates get one representative chunk pulled in.
  const expand = [];
  if (graphExpandPages > 0) {
    const ranked = [];
    for (let i = 0; i < p.length; i++) if (p[i] > 0) ranked.push(i);
    ranked.sort((a, b) => p[b] - p[a]);
    const langFilter = langs?.length
      ? ` AND p.lang IN (${langs.map(() => '?').join(',')})`
      : '';
    const pageStmt = db.prepare(
      `SELECT p.id, p.title, p.lang, p.kind, p.url, p.rev_time AS revTime, p.qid
       FROM pages p WHERE p.qid = ? AND p.status='active'${langFilter} LIMIT 3`
    );
    const chunkStmt = db.prepare(
      'SELECT id, section, text, embedding FROM chunks WHERE page_id = ? ORDER BY seq LIMIT 8'
    );
    for (const i of ranked.slice(0, 60)) {
      if (expand.length >= graphExpandPages) break;
      const qid = index.qids[i];
      const pages = pageStmt.all(...(langs?.length ? [qid, ...langs] : [qid]));
      for (const page of pages) {
        if (expand.length >= graphExpandPages) break;
        if (excludePageIds.has(page.id)) continue;
        const chunks = chunkStmt.all(page.id);
        if (!chunks.length) continue;
        let best = chunks[0];
        if (qv && fromBlob && dot) {
          let bestCos = -Infinity;
          for (const c of chunks) {
            if (!c.embedding) continue;
            const cos = dot(qv, fromBlob(c.embedding));
            if (cos > bestCos) { bestCos = cos; best = c; }
          }
        }
        expand.push({
          chunkId: best.id,
          pageId: page.id,
          section: best.section,
          text: best.text,
          title: page.title,
          lang: page.lang,
          kind: page.kind,
          url: page.url,
          revTime: page.revTime,
          qid: page.qid,
          g: p[i] / max,
        });
      }
    }
  }

  return { score, expand, seedCount: seeds.size };
}

// Test/diagnostic seam: drop the cache so the next call rebuilds.
export function resetGraphRankCache() {
  cache = null;
}
