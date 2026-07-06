// One-off maintenance pass: fix Simplified-drifted zh text already stored in
// the DB -- the two places fix-zh-titles.mjs and the live-ingest hooks in
// lib/ingest.mjs, lib/graph.mjs and lib/translate.mjs don't reach:
//   1. entities.label_zh / entities.description  (Wikidata labels; no
//      variant=zh-tw param exists for wbgetentities, so these have always
//      been whatever a Wikidata contributor typed). Fixed locally with
//      OpenCC s2twp -- there is no "original wiki article" to compare a
//      Wikidata label against.
//   2. pages.content / pages.summary for lang='zh' pages ingested before the
//      variant=zh-tw fetch param existed. For source='wikipedia' pages this
//      re-fetches the article from Wikipedia itself (force re-ingest, same
//      as a normal crawl refresh) rather than trusting a local converter --
//      MediaWiki's LanguageConverter has editor-curated per-article
//      conversion tables that handle transliterated proper nouns (place
//      names, foreign names) more reliably than OpenCC's generic phrase
//      dictionary, which was observed to over-correct some of these (e.g.
//      "阿斯圖里亞斯" -> "阿斯圖裡亞斯", swapping in "裡" where the
//      transliteration convention uses "里"). ingestTitle's own zh path
//      (lib/ingest.mjs) still runs the OpenCC pass afterward as a backstop
//      for whatever residual Simplified text MediaWiki's converter misses
//      (templates etc.), so this gets both the more-authoritative source
//      AND the safety net. Non-wikipedia-sourced pages (manual notes, LLM
//      translations) have no article to re-fetch, so they fall back to the
//      local OpenCC pass.
// Re-ingesting re-chunks the page (lib/ingest.mjs's normal pipeline), so
// stale chunks/embeddings don't linger in the old variant; embeddings for
// changed chunks are invalidated automatically (replaceChunks matches by
// text hash) and picked up by the normal embedPending pass.
//
// This hits the live Wikipedia API once per affected page (politely paced,
// same as any crawl -- see config.crawl.requestGapMs) and can take a while
// for a few thousand pages; run it in the background.
//
//   node fix-zh-content.mjs           -- dry run, prints planned changes
//   node fix-zh-content.mjs --apply   -- actually writes them

import { openDb, logSync, replaceChunks, now } from './lib/db.mjs';
import { chunkText } from './lib/chunk.mjs';
import { toTaiwan } from './lib/zh-convert.mjs';
import { ingestTitle } from './lib/ingest.mjs';

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const pageLimit = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const db = openDb();

console.log(`Scanning for Simplified-drifted zh text${apply ? ' (applying fixes)' : ' (dry run)'}...`);

// --- entities ----------------------------------------------------------
const entities = db
  .prepare("SELECT qid, label_zh, description FROM entities WHERE label_zh IS NOT NULL OR description IS NOT NULL")
  .all();
let entChanged = 0;
const updEnt = db.prepare('UPDATE entities SET label_zh=?, description=?, updated_at=? WHERE qid=?');
for (const e of entities) {
  const label_zh = toTaiwan(e.label_zh);
  const description = toTaiwan(e.description);
  if (label_zh === e.label_zh && description === e.description) continue;
  entChanged++;
  if (apply) updEnt.run(label_zh, description, now(), e.qid);
  else if (entChanged <= 30) {
    if (label_zh !== e.label_zh) console.log(`  [entity ${e.qid}] label_zh "${e.label_zh}" -> "${label_zh}"`);
    if (description !== e.description) console.log(`  [entity ${e.qid}] description "${e.description}" -> "${description}"`);
  }
}
console.log(`entities: ${entChanged}/${entities.length} need fixing`);
if (apply && entChanged) logSync(db, 'zh-content-fix', null, null, `entities=${entChanged}`);

// --- page content/summary ------------------------------------------------
// Cheap local prefilter (no network) to find candidates; the actual fix for
// source='wikipedia' pages re-fetches from the live wiki rather than trusting
// this local conversion (see header comment).
const pages = db
  .prepare("SELECT id, lang, title, content, summary, source FROM pages WHERE lang='zh' AND status='active'")
  .all();
const allCandidates = pages.filter((p) => toTaiwan(p.content) !== p.content || toTaiwan(p.summary) !== p.summary);
const candidates = Number.isFinite(pageLimit) ? allCandidates.slice(0, pageLimit) : allCandidates;
console.log(`pages: ${allCandidates.length}/${pages.length} candidates need fixing${Number.isFinite(pageLimit) ? ` (processing first ${candidates.length})` : ''}`);

let pageChanged = 0;
let refetched = 0;
let localFixed = 0;
let errors = 0;
const updPage = db.prepare('UPDATE pages SET content=?, summary=?, updated_at=? WHERE id=?');

if (!apply) {
  for (const p of candidates.slice(0, 30)) console.log(`  [page ${p.id}] "${p.title}" (source=${p.source}) needs conversion`);
} else {
  for (const p of candidates) {
    pageChanged++;
    try {
      if (p.source === 'wikipedia') {
        const r = await ingestTitle(db, 'zh', p.title, { force: true });
        if (r.status === 'skipped' || r.status === 'missing') {
          console.log(`  [page ${p.id}] "${p.title}" re-fetch ${r.status}, falling back to local conversion`);
          updPage.run(toTaiwan(p.content), toTaiwan(p.summary), now(), p.id);
          localFixed++;
        } else {
          refetched++;
        }
      } else {
        const content = toTaiwan(p.content);
        const summary = toTaiwan(p.summary);
        updPage.run(content, summary, now(), p.id);
        let pieces = chunkText(content);
        if (!pieces.length && content) pieces = [{ section: null, text: content.slice(0, 1200) }];
        replaceChunks(db, p.id, pieces);
        localFixed++;
      }
    } catch (e) {
      errors++;
      console.log(`  ! [page ${p.id}] "${p.title}" failed: ${e.message}`);
    }
    if (pageChanged % 100 === 0) {
      console.log(`-- progress: ${pageChanged}/${candidates.length} (refetched=${refetched} localFixed=${localFixed} errors=${errors}) --`);
    }
  }
}
console.log(`pages: done. refetched=${refetched} localFixed=${localFixed} errors=${errors}`);
if (apply && pageChanged) logSync(db, 'zh-content-fix', 'zh', null, `refetched=${refetched} localFixed=${localFixed} errors=${errors}`);

if (!apply && (entChanged || candidates.length)) {
  console.log('Re-run with --apply to write these changes. Page fixes re-fetch from Wikipedia (politely paced -- can take a while for thousands of pages) and re-chunk; run wiki-kb embed afterwards to re-embed invalidated chunks.');
}
