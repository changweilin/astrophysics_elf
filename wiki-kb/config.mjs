// Central configuration for the Wiki Knowledge Base (crawler + knowledge graph
// + RAG). Everything is environment-driven (WKB_*) so the same code runs
// unattended from Task Scheduler, from the CLI, and behind the HTTP server.
//
// Zero npm dependencies: storage is node:sqlite (Node >= 22.5), embeddings come
// from the local Ollama server that the scientists-backend already uses.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function envStr(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function envNum(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function envList(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  // Single SQLite file: pages, chunks (+FTS5 +embeddings), entities/edges
  // (knowledge graph), crawl queue, sync log.
  dbPath: envStr('WKB_DB', path.join(HERE, 'data', 'kb.sqlite')),

  // Descriptive UA is required by Wikimedia API etiquette.
  userAgent: envStr(
    'WKB_UA',
    'KN-WikiKB/1.0 (Kerr-Newman Lab local educational app; contact: x111281@gmail.com)'
  ),

  // Corpus languages. Priority languages are crawled by full category
  // traversal; the rest are reached by projecting langlinks from the priority
  // corpus, so the scope stays consistent across wikis.
  langs: envList('WKB_LANGS', ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'it', 'es']),
  priorityLangs: envList('WKB_PRIORITY_LANGS', ['zh', 'en']),
  // zh.wikipedia is stored in mixed variants; we always request zh-tw.
  zhVariant: envStr('WKB_ZH_VARIANT', 'zh-tw'),
  // Full article plaintext for these; other languages store the intro only
  // (keeps the crawl light while zh/en carry the deep RAG corpus).
  fullTextLangs: envList('WKB_FULLTEXT_LANGS', ['zh', 'en']),

  crawl: {
    // Serial requests with this gap (ms) = max ~4 req/s, polite for the API.
    requestGapMs: envNum('WKB_REQUEST_GAP_MS', 250),
    timeoutMs: envNum('WKB_TIMEOUT_MS', 30000),
    retries: envNum('WKB_RETRIES', 3),
    // Category recursion cap (each seed also carries its own depth).
    maxDepth: envNum('WKB_MAX_DEPTH', 3),
    // Safety valve per language so a runaway category tree cannot explode.
    maxPagesPerLang: envNum('WKB_MAX_PAGES_PER_LANG', 20000),
    // Shallower re-discovery used by the periodic update checker.
    updateDiscoverDepth: envNum('WKB_UPDATE_DEPTH', 1),
  },

  chunk: {
    targetChars: envNum('WKB_CHUNK_CHARS', 1200),
    overlapChars: envNum('WKB_CHUNK_OVERLAP', 150),
    minChars: envNum('WKB_CHUNK_MIN', 80),
  },

  embed: {
    baseUrl: envStr('WKB_OLLAMA_URL', 'http://127.0.0.1:11434'),
    // bge-m3 covers all eight corpus languages; `ollama pull bge-m3`.
    model: envStr('WKB_EMBED_MODEL', 'bge-m3'),
    batch: envNum('WKB_EMBED_BATCH', 16),
    timeoutMs: envNum('WKB_EMBED_TIMEOUT_MS', 120000),
  },

  retrieve: {
    k: envNum('WKB_TOP_K', 8),
    // BM25 preselection size (also the cap kept from a full vector scan).
    bm25Candidates: envNum('WKB_BM25_CANDIDATES', 400),
    // Full vector scan up to this many embedded chunks; above it, vectors only
    // rerank the BM25 candidates (bounded latency on large corpora).
    scanMaxChunks: envNum('WKB_SCAN_MAX_CHUNKS', 60000),
    wBm25: envNum('WKB_W_BM25', 0.45),
    wVec: envNum('WKB_W_VEC', 0.55),
    // Time decay on the article's last-revision age: stale pages sink but a
    // floor keeps old-yet-canonical physics from vanishing.
    halfLifeDays: envNum('WKB_DECAY_HALFLIFE_DAYS', 1095),
    decayFloor: envNum('WKB_DECAY_FLOOR', 0.6),
    maxPerPage: envNum('WKB_MAX_PER_PAGE', 2),
    maxContextChars: envNum('WKB_CONTEXT_MAX_CHARS', 2200),
  },

  server: {
    host: envStr('WKB_HOST', '127.0.0.1'),
    port: envNum('WKB_PORT', 5189),
    corsOrigins: envList('WKB_CORS_ORIGINS', ['*']),
  },
};

export default config;
