// Unit tests for the EMBCACHE tiers in lib/embed.mjs: the in-process LRU and
// the disk tier under it.
//
// No Ollama: `fetch` is stubbed, so every check is about cache behaviour and
// the fetch counter is the assertion -- a cache hit is literally "the GPU was
// not asked". A FRESH MODULE INSTANCE (`import('./embed.mjs?v=N')`) stands in
// for the next process's cold start, which is the case the disk tier exists
// for (a repeat CLI eval run re-embedding the same fixed golden queries).
//
// Run:  node lib/embed.test.mjs

import { mkdtempSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CACHE_DIR = mkdtempSync(path.join(tmpdir(), 'wkb-qvec-'));
process.env.WKB_EMBED_QUERY_CACHE_DIR = CACHE_DIR;
process.env.WKB_EMBED_MODEL = 'test-embed';

let passed = 0;
let failed = 0;
function check(label, ok, extra) {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  FAIL  ${label}${extra !== undefined ? `  (${JSON.stringify(extra)})` : ''}`);
}

// Deterministic fake embedder: a 4-dim vector derived from the text length, so
// a served vector can be checked against the text it belongs to.
let fetchCalls = 0;
globalThis.fetch = async (url, init) => {
  fetchCalls++;
  const { input } = JSON.parse(init.body);
  return {
    ok: true,
    json: async () => ({ embeddings: input.map((t) => [t.length, 1, 0, 0]) }),
  };
};

const files = () => readdirSync(CACHE_DIR).filter((f) => f.endsWith('.f32'));

try {
  // ---- first process ---------------------------------------------------------
  console.log('embedQuery: miss writes both tiers');
  const p1 = await import('./embed.mjs?v=1');
  const v1 = await p1.embedQuery('what is the Kerr metric');
  check('one embed call for a cold query', fetchCalls === 1, fetchCalls);
  check('vector is L2-normalized', Math.abs(Math.hypot(...v1) - 1) < 1e-6, [...v1]);
  check('one cache file was written', files().length === 1, files());
  check('the file name carries the model', files()[0].startsWith('test-embed-'), files());

  console.log('embedQuery: LRU hit does not re-embed');
  const v2 = await p1.embedQuery('what is the Kerr metric');
  check('still one embed call', fetchCalls === 1, fetchCalls);
  check('the LRU hands back the same vector', v2 === v1);
  check('stats count the memory hit', p1.embedCacheStats().memHits === 1, p1.embedCacheStats());

  console.log('embedQuery: disk hit after the LRU is dropped');
  p1.clearEmbedCache();
  const v3 = await p1.embedQuery('what is the Kerr metric');
  check('still one embed call', fetchCalls === 1, fetchCalls);
  check('the disk vector matches the embedded one', [...v3].join(',') === [...v1].join(','), [...v3]);
  check('clearEmbedCache leaves the disk tier alone', files().length === 1, files());
  check('stats count the disk hit', p1.embedCacheStats().diskHits === 1, p1.embedCacheStats());

  console.log('embedQuery: a different query still misses');
  await p1.embedQuery('how does an accretion disc heat up');
  check('a second query costs a second embed', fetchCalls === 2, fetchCalls);
  check('each query gets its own file', files().length === 2, files());

  // ---- next process ----------------------------------------------------------
  console.log('embedQuery: a cold process reads the disk tier');
  const p2 = await import('./embed.mjs?v=2');
  check('the fresh instance starts with an empty LRU', p2.embedCacheStats().memEntries === 0, p2.embedCacheStats());
  const v4 = await p2.embedQuery('what is the Kerr metric');
  check('no embed call on a cold start', fetchCalls === 2, fetchCalls);
  check('the vector survived the process boundary', [...v4].join(',') === [...v1].join(','), [...v4]);

  console.log('embedQuery: a corrupt cache file is ignored, not served');
  const doomed = 'a query whose cache file gets truncated';
  const seen = new Set(files());
  const p3 = await import('./embed.mjs?v=3');
  await p3.embedQuery(doomed);
  const victim = path.join(CACHE_DIR, files().find((f) => !seen.has(f)));
  writeFileSync(victim, Buffer.from([1, 2, 3])); // not a whole number of floats
  const p3b = await import('./embed.mjs?v=3b');
  const before = fetchCalls;
  const v5 = await p3b.embedQuery(doomed);
  check('the truncated file forced a re-embed', fetchCalls === before + 1, { before, fetchCalls });
  check('the re-embedded vector is sane', Math.abs(Math.hypot(...v5) - 1) < 1e-6, [...v5]);
  check('the corrupt file was replaced', existsSync(victim), victim);

  // ---- disk tier disabled ----------------------------------------------------
  console.log('embedQuery: an empty cache dir disables the disk tier');
  // config.mjs reads the environment once at import, and embed.mjs reads the
  // directory once at ITS import, so the switch has to be flipped on the live
  // config object before the next module instance is created.
  const { config } = await import('../config.mjs');
  config.embed.queryCacheDir = '';
  const filesBefore = files().length;
  const p4 = await import('./embed.mjs?v=4');
  const before4 = fetchCalls;
  await p4.embedQuery('a query nobody cached');
  await p4.embedQuery('a query nobody cached'); // the LRU still works
  check('the LRU still absorbs the repeat', fetchCalls === before4 + 1, { before4, fetchCalls });
  check('no file is written when the tier is off', files().length === filesBefore, files());
  check('stats say the tier is off', p4.embedCacheStats().diskDir === null, p4.embedCacheStats());
} finally {
  rmSync(CACHE_DIR, { recursive: true, force: true });
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} — ${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
