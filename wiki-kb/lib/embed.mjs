// Embeddings via the local Ollama server (same box as the scientists backend).
// Vectors are L2-normalized before storage so cosine similarity is a dot
// product. Everything fails soft: if the embed model is unavailable the KB
// still works in BM25-only mode.

import { config } from '../config.mjs';

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

export async function embedTexts(texts) {
  const res = await fetch(`${config.embed.baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.embed.model, input: texts }),
    signal: AbortSignal.timeout(config.embed.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`embed HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data?.embeddings)) throw new Error('embed: malformed response');
  return data.embeddings.map((v) => normalize(Float32Array.from(v)));
}

export async function embedQuery(text) {
  const [v] = await embedTexts([text]);
  return v ?? null;
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
