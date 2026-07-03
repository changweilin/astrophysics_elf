#!/usr/bin/env node
// Periodic update checker -- keeps the knowledge base in sync with Wikipedia.
//
//   node check-updates.mjs [--langs zh,en] [--discover] [--dry-run] [--limit N]
//
// 1. Revision sweep: batch-compares the stored rev_id of every active page
//    against the live wiki (50 pages/request). Changed pages are re-fetched
//    and re-chunked (unchanged paragraphs keep their embeddings); pages that
//    disappeared are soft-deleted.
// 2. --discover: shallow re-scan of the seed categories to pick up newly
//    created articles, plus langlink projection for anything new.
// 3. New/changed chunks are re-embedded; Wikidata entities sync for new QIDs.
// 4. Everything is written to sync_log; a summary goes to stdout.
//
// Designed to run unattended (Task Scheduler / cron); see schedule-task.ps1.

import { parseArgs } from 'node:util';
import { openDb, deletePage, logSync, stats } from './lib/db.mjs';
import * as wiki from './lib/wiki-api.mjs';
import { ingestTitle, processQueue, embedPending } from './lib/ingest.mjs';
import { discoverCategories, projectLangLinks } from './lib/discover.mjs';
import { syncEntities } from './lib/graph.mjs';
import { config } from './config.mjs';

const { values: opts } = parseArgs({
  options: {
    langs: { type: 'string' },
    discover: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
  },
});

const langs = opts.langs ? opts.langs.split(',').map((s) => s.trim()) : config.langs;
const dryRun = opts['dry-run'];
const limit = opts.limit ? Number(opts.limit) : Infinity;
const log = (...a) => console.log(...a);

const db = openDb();
const startedAt = new Date().toISOString();
const summary = {
  startedAt, langs, dryRun,
  checked: 0, changed: 0, updated: 0, deleted: 0, added: 0, errors: 0,
};

// --- 1. revision sweep ---------------------------------------------------------

async function revisionSweep() {
  for (const lang of langs) {
    const pages = db
      .prepare("SELECT id, title, rev_id FROM pages WHERE lang=? AND status='active' AND source='wikipedia'")
      .all(lang);
    if (!pages.length) continue;
    log(`[check] ${lang}: ${pages.length} pages`);
    const byTitle = new Map(pages.map((p) => [p.title, p]));

    for (let i = 0; i < pages.length; i += 50) {
      const batch = pages.slice(i, i + 50);
      let meta;
      try {
        meta = await wiki.fetchPagesMeta(lang, batch.map((p) => p.title));
      } catch (e) {
        summary.errors += batch.length;
        log(`  ! [${lang}] meta batch failed: ${e.message}`);
        continue;
      }
      summary.checked += batch.length;
      const liveByTitle = new Map(meta.pages.map((p) => [p.title, p]));

      for (const local of batch) {
        const finalTitle = wiki.resolveTitle(meta, local.title);
        const live = liveByTitle.get(finalTitle);
        if (!live || live.missing) {
          summary.deleted++;
          log(`  - deleted on wiki: [${lang}] ${local.title}`);
          if (!dryRun) {
            deletePage(db, local.id);
            logSync(db, 'deleted', lang, local.title, 'page gone on wiki');
          }
          continue;
        }
        if (live.revId && live.revId !== local.rev_id) {
          summary.changed++;
          if (dryRun) {
            log(`  ~ changed: [${lang}] ${local.title} (rev ${local.rev_id} -> ${live.revId})`);
            continue;
          }
          try {
            const r = await ingestTitle(db, lang, finalTitle, { force: false });
            if (r.status === 'updated' || r.status === 'added') {
              summary.updated++;
              log(`  ~ refreshed: [${lang}] ${r.title} (${r.chunks} chunks)`);
            }
          } catch (e) {
            summary.errors++;
            log(`  ! refresh failed: [${lang}] ${local.title}: ${e.message}`);
          }
        }
      }
      if ((i / 50) % 20 === 19) log(`  [${lang}] checked ${i + batch.length}/${pages.length}...`);
    }
  }
}

// --- 2. discovery of new articles ------------------------------------------------

async function discoverNew() {
  log('[check] discovering new articles (shallow category re-scan)');
  await discoverCategories(db, {
    langs: config.priorityLangs.filter((l) => langs.includes(l)),
    depthCap: config.crawl.updateDiscoverDepth,
    log,
  });
  if (dryRun) {
    const pending = db
      .prepare("SELECT COUNT(*) n FROM crawl_queue WHERE status='pending'")
      .get().n;
    log(`[check] dry-run: ${pending} titles pending in queue (not fetched)`);
    // leave the queue in place for a future real run
    return;
  }
  const { counts, addedPages } = await processQueue(db, { langs, limit, log });
  summary.added += counts.added ?? 0;
  summary.errors += counts.errors ?? 0;
  if (addedPages.length) {
    log(`[check] projecting langlinks for ${addedPages.length} new pages`);
    await projectLangLinks(db, { pages: addedPages, targetLangs: langs, log });
    const second = await processQueue(db, { langs, limit, log });
    summary.added += second.counts.added ?? 0;
  }
}

// --- run -------------------------------------------------------------------------

try {
  await revisionSweep();
  if (opts.discover) await discoverNew();
  if (!dryRun) {
    const g = await syncEntities(db, { log });
    if (g.entities) log(`[check] graph: +${g.entities} entities, +${g.edges} edges`);
    const e = await embedPending(db, { limit: Infinity, log });
    if (e.embedded) log(`[check] embedded ${e.embedded} new/changed chunks`);
    if (!e.done) log('[check] embedding incomplete (Ollama unavailable) -- BM25-only until next run');
  }
  summary.finishedAt = new Date().toISOString();
  if (!dryRun) logSync(db, 'update-check', null, null, JSON.stringify(summary));
  console.log(`[check] summary: ${JSON.stringify(summary)}`);
  const s = stats(db);
  console.log(`[check] corpus: ${s.pagesActive} pages, ${s.chunks} chunks (${s.embedded} embedded), ${s.edges} edges`);
} finally {
  db.close();
}
