// Shared ingest pipeline: fetch a page bundle -> classify -> upsert page +
// categories -> re-chunk (embeddings preserved via content hash) -> log.
// Used by the crawler, the update checker, the admin CLI, and the HTTP API.

import * as wiki from './wiki-api.mjs';
import {
  upsertPage, setPageCategories, replaceChunks, getPageByTitle,
  pendingQueue, markQueue, logSync,
} from './db.mjs';
import { chunkText } from './chunk.mjs';
import { classifyKind, shouldSkipTitle } from './seeds.mjs';
import { embedTexts, toBlob } from './embed.mjs';
import { config } from '../config.mjs';

function leadOf(text) {
  const m = /^={2,}/m.exec(text);
  return (m ? text.slice(0, m.index) : text).trim().slice(0, 2000);
}

// Ingest one title. Returns {status: added|updated|unchanged|skipped|missing, ...}.
export async function ingestTitle(db, lang, title, { force = false } = {}) {
  const fullText = config.fullTextLangs.includes(lang);
  const b = await wiki.fetchPageBundle(lang, title, { fullText });
  if (!b || b.missing) return { status: 'missing', title };
  if (b.disambiguation || shouldSkipTitle(b.title)) return { status: 'skipped', title: b.title };

  const existing = getPageByTitle(db, lang, b.title);
  if (existing && !force && existing.rev_id === b.revId && existing.content) {
    return { status: 'unchanged', pageId: existing.id, title: b.title };
  }

  const text = (b.extract || '').trim();
  const kind = classifyKind(b.categories);
  const pageId = upsertPage(db, {
    lang,
    pageid: b.pageid,
    title: b.title,
    qid: b.qid,
    kind,
    url: b.url,
    summary: leadOf(text),
    content: text,
    revId: b.revId,
    revTime: b.revTime,
  });
  setPageCategories(db, pageId, b.categories);

  let pieces = chunkText(text);
  if (!pieces.length && text) {
    pieces = [{ section: null, text: text.slice(0, config.chunk.targetChars) }];
  }
  const chunks = replaceChunks(db, pageId, pieces);
  const status = existing ? 'updated' : 'added';
  logSync(db, status, lang, b.title, `chunks=${chunks.total} keptEmb=${chunks.keptEmbeddings}`);
  return { status, pageId, title: b.title, chunks: chunks.total };
}

// Ingest a manually contributed page: user notes from the scientists page,
// LLM-translated articles, and admin edits. Same chunk + FTS + (lazy) embed
// pipeline as Wikipedia pages, but source != 'wikipedia' keeps it out of the
// revision sweep so it can never be "deleted upstream".
export function ingestManual(db, {
  lang, title, summary, content, kind = 'note', qid = null, source = 'user',
} = {}) {
  const text = String(content ?? '').trim();
  const cleanTitle = String(title ?? '').trim();
  if (!lang || !cleanTitle || !text) throw new Error('lang, title and content required');

  const existing = getPageByTitle(db, lang, cleanTitle);
  const pageId = upsertPage(db, {
    lang,
    title: cleanTitle,
    qid: qid || null,
    kind,
    summary: (summary && String(summary).trim()) || leadOf(text),
    content: text,
    source,
  });

  let pieces = chunkText(text);
  if (!pieces.length && text) {
    pieces = [{ section: null, text: text.slice(0, config.chunk.targetChars) }];
  }
  const chunks = replaceChunks(db, pageId, pieces);
  const status = existing ? 'updated' : 'added';
  logSync(db, `manual-${status}`, lang, cleanTitle, `source=${source} chunks=${chunks.total}`);
  return { status, pageId, title: cleanTitle, chunks: chunks.total };
}

// Drain the crawl queue: batch metadata lookups skip unchanged pages cheaply
// (1 request per 50 titles); only new/changed pages pay the full bundle fetch.
// `limit` caps the number of full fetches, so runs are resumable.
export async function processQueue(db, {
  langs = config.langs,
  limit = Infinity,
  log = () => {},
} = {}) {
  const counts = { added: 0, updated: 0, unchanged: 0, skipped: 0, missing: 0, errors: 0 };
  const addedPages = [];
  let fetches = 0;

  for (const lang of langs) {
    while (fetches < limit) {
      const batch = pendingQueue(db, lang, 50);
      if (!batch.length) break;
      const titles = batch.map((r) => r.title);
      let meta;
      try {
        meta = await wiki.fetchPagesMeta(lang, titles);
      } catch (e) {
        for (const t of titles) markQueue(db, lang, t, 'error', String(e).slice(0, 300));
        counts.errors += titles.length;
        log(`  ! [${lang}] meta batch failed: ${e.message}`);
        continue;
      }
      const byTitle = new Map(meta.pages.map((p) => [p.title, p]));
      for (const orig of titles) {
        if (fetches >= limit) break;
        const finalTitle = wiki.resolveTitle(meta, orig);
        const m = byTitle.get(finalTitle);
        try {
          if (!m || m.missing) {
            counts.missing++;
            markQueue(db, lang, orig, 'done', 'missing');
            continue;
          }
          if (m.disambiguation || shouldSkipTitle(m.title)) {
            counts.skipped++;
            markQueue(db, lang, orig, 'done', 'skipped');
            continue;
          }
          const existing = getPageByTitle(db, lang, m.title);
          if (existing && existing.rev_id === m.revId && existing.content) {
            counts.unchanged++;
            markQueue(db, lang, orig, 'done', 'unchanged');
            continue;
          }
          const r = await ingestTitle(db, lang, m.title);
          counts[r.status] = (counts[r.status] ?? 0) + 1;
          if (r.status === 'added') addedPages.push({ lang, title: r.title, pageId: r.pageId });
          markQueue(db, lang, orig, 'done', r.status);
          if (r.status === 'added' || r.status === 'updated') {
            fetches++;
            if (fetches % 20 === 0) log(`  [${lang}] fetched ${fetches} pages...`);
          }
        } catch (e) {
          counts.errors++;
          markQueue(db, lang, orig, 'error', String(e).slice(0, 300));
        }
      }
    }
  }
  return { counts, addedPages, fetches };
}

// Embed chunks that do not have a vector yet. Fails soft (returns done:false)
// when the Ollama embed model is unavailable so crawls still complete.
export async function embedPending(db, { limit = Infinity, log = () => {} } = {}) {
  const total = db
    .prepare(
      `SELECT COUNT(*) n FROM chunks c JOIN pages p ON p.id=c.page_id
       WHERE c.embedding IS NULL AND p.status='active'`
    )
    .get().n;
  if (!total) return { done: true, embedded: 0, remaining: 0 };

  const upd = db.prepare(
    'UPDATE chunks SET embedding=?, embed_model=?, embed_dim=? WHERE id=?'
  );
  let embedded = 0;
  const target = Math.min(total, limit);
  while (embedded < target) {
    const rows = db
      .prepare(
        `SELECT c.id, c.section, c.text FROM chunks c JOIN pages p ON p.id=c.page_id
         WHERE c.embedding IS NULL AND p.status='active' LIMIT ?`
      )
      .all(Math.min(config.embed.batch, target - embedded));
    if (!rows.length) break;
    let vecs;
    try {
      vecs = await embedTexts(rows.map((r) => (r.section ? `${r.section}\n${r.text}` : r.text)));
    } catch (e) {
      log(`  ! embedding unavailable (${e.message}); BM25-only until re-run`);
      return { done: false, embedded, remaining: total - embedded, error: String(e) };
    }
    rows.forEach((r, i) => {
      const v = vecs[i];
      if (v) upd.run(toBlob(v), config.embed.model, v.length, r.id);
    });
    embedded += rows.length;
    if (embedded % 320 === 0 || embedded >= target) {
      log(`  embedded ${embedded}/${target} chunks...`);
    }
  }
  return { done: true, embedded, remaining: total - embedded };
}
