// Embeddings via the local Ollama server (same box as the scientists backend).
// Vectors are L2-normalized before storage so cosine similarity is a dot
// product. Everything fails soft: if the embed model is unavailable the KB
// still works in BM25-only mode.

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

export function clearEmbedCache() {
  queryCache.clear();
}

export async function embedQuery(text, signal) {
  const key = `${config.embed.model}\n${text}`;
  if (QUERY_CACHE_MAX > 0) {
    const hit = queryCache.get(key);
    if (hit !== undefined) {
      // Refresh recency (delete+set moves it to the tail of the Map's order).
      queryCache.delete(key);
      queryCache.set(key, hit);
      return hit;
    }
  }
  const [v] = await embedTexts([text], signal);
  const vec = v ?? null;
  // Only cache real vectors -- a soft-failed embed (null) must be retried next
  // time, not remembered as "this query has no embedding".
  if (vec && QUERY_CACHE_MAX > 0) {
    queryCache.set(key, vec);
    if (queryCache.size > QUERY_CACHE_MAX) {
      queryCache.delete(queryCache.keys().next().value); // evict oldest
    }
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
