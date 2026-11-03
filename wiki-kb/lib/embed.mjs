// Embeddings via the local Ollama server (same box as the scientists backend).
// Vectors are L2-normalized before storage so cosine similarity is a dot
// product. Everything fails soft: if the embed model is unavailable the KB
// still works in BM25-only mode.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.mjs';
import { withBusy } from './ollama-gate.mjs';

export async function embedAvailable() {
  try {
    const res = await fetch(`${config.embed.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const want = config.embed.model.toLowerCase();
    return (data?.models ?? []).some((m) =>
      String(m.name || m.model || '').toLowerCase().startsWith(want)
    );
  } catch {
    return false;
  }
}

export async function embedTexts(texts, signal) {
  return withBusy(async () => {
    const timeout = AbortSignal.timeout(config.embed.timeoutMs);
    const composite = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
    const res = await fetch(`${config.embed.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.embed.model, input: texts, keep_alive: config.embed.keepAlive }),
      signal: composite,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`embed HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!Array.isArray(data?.embeddings)) throw new Error('embed: malformed response');
    return data.embeddings.map((v) => normalize(Float32Array.from(v)));
  });
}

// Query-embedding LRU. Every chat turn and every eval case re-embeds a small
// set of identical strings against the scarce 3060 GPU; a query vector is a
// pure function of (model, text), so caching it removes the redundant embed
// round-trips entirely. Keyed by model+text (a model swap must not serve a
// stale vector). Callers use the result read-only (cosine dot in retrieve.mjs),
// so handing back the cached reference is safe.
const QUERY_CACHE_MAX = Math.max(0, config.embed.queryCacheMax ?? 512);
const queryCache = new Map(); // "model\ntext" -> Float32Array

// EMBCACHE disk tier under that LRU. The LRU dies with the process, but a CLI
// eval run IS a fresh process re-embedding the same fixed golden queries, so
// the vector is also written to a small file keyed by model + sha256(text) --
// the same purity argument as the LRU, one level down. Fail-soft throughout:
// an unwritable directory, an unreadable file or a truncated one falls back to
// the live embed call and never raises.
const CACHE_DIR = String(config.embed.queryCacheDir || '');
let cacheDirReady = false;

function diskPath(text) {
  const slug = config.embed.model.replace(/[^A-Za-z0-9._-]+/g, '_');
  const sha = createHash('sha256').update(`${config.embed.model}\n${text}`).digest('hex');
  return path.join(CACHE_DIR, `${slug}-${sha}.f32`);
}

function diskRead(text) {
  if (!CACHE_DIR) return null;
  try {
    const buf = readFileSync(diskPath(text));
    // A file truncated by a kill mid-write, or left by a model whose dimension
    // changed under the same tag, is garbage rather than a vector.
    if (!buf.byteLength || buf.byteLength % 4 !== 0) return null;
    return fromBlob(buf);
  } catch {
    return null;
  }
}

// Returns whether the vector actually reached the disk tier (the caller only
// counts real writes, so the stats cannot claim a cache that does not exist).
function diskWrite(text, vec) {
  if (!CACHE_DIR) return false;
  try {
    if (!cacheDirReady) {
      mkdirSync(CACHE_DIR, { recursive: true });
      cacheDirReady = true;
    }
    const file = diskPath(text);
    // Write-then-rename: a concurrent reader never sees a half-written vector,
    // and two processes embedding the same query race to identical bytes.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, toBlob(vec));
    renameSync(tmp, file);
    return true;
  } catch {
    // The cache is an optimization; a failed write only costs the next embed.
    return false;
  }
}

const cacheStats = { memHits: 0, diskHits: 0, diskWrites: 0, misses: 0 };

export function embedCacheStats() {
  return { ...cacheStats, memEntries: queryCache.size, diskDir: CACHE_DIR || null };
}

// Clears the in-process LRU only. The disk tier is deliberately left alone:
// it is valid across processes, so dropping it here would punish every other
// run for one caller wanting a cold in-memory cache.
export function clearEmbedCache() {
  queryCache.clear();
}

function remember(key, vec) {
  if (QUERY_CACHE_MAX <= 0) return;
  queryCache.set(key, vec);
  if (queryCache.size > QUERY_CACHE_MAX) {
    queryCache.delete(queryCache.keys().next().value); // evict oldest
  }
}

export async function embedQuery(text, signal) {
  const key = `${config.embed.model}\n${text}`;
  if (QUERY_CACHE_MAX > 0) {
    const hit = queryCache.get(key);
    if (hit !== undefined) {
      // Refresh recency (delete+set moves it to the tail of the Map's order).
      queryCache.delete(key);
      queryCache.set(key, hit);
      cacheStats.memHits++;
      return hit;
    }
  }
  const onDisk = diskRead(text);
  if (onDisk) {
    cacheStats.diskHits++;
    remember(key, onDisk);
    return onDisk;
  }
  const [v] = await embedTexts([text], signal);
  const vec = v ?? null;
  // Only cache real vectors -- a soft-failed embed (null) must be retried next
  // time, not remembered as "this query has no embedding".
  if (vec) {
    cacheStats.misses++;
    remember(key, vec);
    if (diskWrite(text, vec)) cacheStats.diskWrites++;
  }
  return vec;
}

function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = 1 / (Math.sqrt(s) || 1);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

export function toBlob(vec) {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

// SQLite hands back Uint8Array whose byteOffset may not be 4-aligned; copy
// into a fresh buffer before viewing as Float32Array.
export function fromBlob(buf) {
  const copy = new Uint8Array(buf);
  return new Float32Array(copy.buffer, 0, copy.byteLength >> 2);
}

export function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
