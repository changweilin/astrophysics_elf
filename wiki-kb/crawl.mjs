#!/usr/bin/env node
// Wiki knowledge-base crawler CLI. Every phase is idempotent and resumable
// (the crawl queue and content hashes live in SQLite), so runs can be capped
// with --limit and repeated until the corpus is complete.
//
//   node crawl.mjs discover  [--langs zh,en] [--depth N]     seed categories -> queue
//   node crawl.mjs fetch     [--langs ...] [--limit N]       queue -> pages + chunks
//   node crawl.mjs langlinks                                 project zh/en scope -> other langs
//   node crawl.mjs graph     [--limit N]                     Wikidata entities + edges
//   node crawl.mjs classify  [--limit N]                     tag root nodes with a subject/content category
//   node crawl.mjs embed     [--limit N]                     vectorize pending chunks
//   node crawl.mjs all       [--langs zh,en] [--limit N]     the whole pipeline
//   node crawl.mjs status                                    corpus statistics

import { parseArgs } from 'node:util';
import { openDb, stats, logSync } from './lib/db.mjs';
import { discoverCategories, projectLangLinks } from './lib/discover.mjs';
import { processQueue, embedPending } from './lib/ingest.mjs';
import { syncEntities } from './lib/graph.mjs';
import { classifyEntities } from './lib/classify.mjs';
import { config } from './config.mjs';

const { values: opts, positionals } = parseArgs({
  options: {
    langs: { type: 'string' },
    depth: { type: 'string' },
    limit: { type: 'string' },
  },
  allowPositionals: true,
});

const command = positionals[0] ?? 'all';
const langs = opts.langs ? opts.langs.split(',').map((s) => s.trim()) : null;
const depth = opts.depth ? Number(opts.depth) : undefined;
const limit = opts.limit ? Number(opts.limit) : Infinity;
const log = (...a) => console.log(...a);

const db = openDb();

async function runDiscover() {
  console.log(`[discover] categories -> queue (langs: ${(langs ?? config.priorityLangs).join(', ')})`);
  await discoverCategories(db, { langs: langs ?? config.priorityLangs, depthCap: depth, log });
}

async function runFetch() {
  console.log(`[fetch] queue -> pages (limit: ${limit === Infinity ? 'none' : limit})`);
  const { counts, fetches } = await processQueue(db, { langs: langs ?? config.langs, limit, log });
  console.log(`[fetch] ${JSON.stringify(counts)} (${fetches} full fetches)`);
}

async function runLangLinks() {
  console.log('[langlinks] projecting priority-language scope onto other wikis');
  await projectLangLinks(db, { targetLangs: langs ?? config.langs, log });
}

async function runGraph() {
  console.log('[graph] syncing Wikidata entities + edges');
  const r = await syncEntities(db, { limit: Number.isFinite(limit) ? limit : 2000, log });
  console.log(`[graph] entities=${r.entities} edges=${r.edges} stubs=${r.stubs}`);
}

async function runClassify() {
  console.log('[classify] tagging root nodes missing a category');
  const r = classifyEntities(db, { limit: Number.isFinite(limit) ? limit : Infinity, log });
  console.log(`[classify] classified=${r.classified}`);
}

async function runEmbed() {
  console.log(`[embed] vectorizing pending chunks with ${config.embed.model}`);
  const r = await embedPending(db, { limit, log });
  console.log(
    r.done
      ? `[embed] embedded=${r.embedded} remaining=${r.remaining}`
      : `[embed] STOPPED (${r.error}); embedded=${r.embedded}, run "node crawl.mjs embed" again later`
  );
}

function runStatus() {
  const s = stats(db);
  console.log(JSON.stringify(s, null, 2));
}

try {
  switch (command) {
    case 'discover': await runDiscover(); break;
    case 'fetch': await runFetch(); break;
    case 'langlinks': await runLangLinks(); break;
    case 'graph': await runGraph(); break;
    case 'classify': await runClassify(); break;
    case 'embed': await runEmbed(); break;
    case 'status': runStatus(); break;
    case 'all': {
      await runDiscover();
      await runFetch();
      await runLangLinks();
      await runFetch(); // drain the langlink-projected queue too
      await runGraph();
      await runClassify();
      await runEmbed();
      logSync(db, 'crawl-all', null, null, 'pipeline complete');
      runStatus();
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Commands: discover | fetch | langlinks | graph | classify | embed | all | status');
      process.exitCode = 2;
  }
} finally {
  db.close();
}
