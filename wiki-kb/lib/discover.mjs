// Discovery: (a) breadth-first category traversal on the priority-language
// wikis, (b) langlink projection so every other language inherits the same
// scope. Both only *enqueue* titles -- fetching happens in ingest.processQueue.

import * as wiki from './wiki-api.mjs';
import { enqueue, logSync } from './db.mjs';
import { getSeeds, shouldSkipCategory, shouldSkipTitle } from './seeds.mjs';
import { config } from '../config.mjs';

export async function discoverCategories(db, {
  langs = config.priorityLangs,
  depthCap = config.crawl.maxDepth,
  log = () => {},
} = {}) {
  const result = {};
  for (const lang of langs) {
    const seeds = getSeeds(lang);
    if (!seeds.length) {
      log(`  [${lang}] no seeds (non-priority language; use langlink projection)`);
      continue;
    }
    const existing = new Set(
      db.prepare("SELECT title FROM pages WHERE lang=? AND status='active'")
        .all(lang)
        .map((r) => r.title)
    );
    const cap = config.crawl.maxPagesPerLang;
    const visited = new Set();
    let queued = 0;
    const queue = seeds.map(([cat, d]) => [cat, Math.min(d, depthCap)]);

    while (queue.length) {
      const [cat, depth] = queue.shift();
      if (visited.has(cat) || shouldSkipCategory(cat)) continue;
      visited.add(cat);
      let members;
      try {
        members = await wiki.categoryMembers(lang, cat);
      } catch (e) {
        log(`  ! [${lang}] ${cat}: ${e.message}`);
        continue;
      }
      for (const p of members.pages) {
        if (existing.size + queued >= cap) break;
        if (shouldSkipTitle(p.title) || existing.has(p.title)) continue;
        if (enqueue(db, lang, p.title, 0, `category:${cat}`)) queued++;
      }
      if (depth > 0) {
        for (const sc of members.subcats) {
          if (!visited.has(sc)) queue.push([sc, depth - 1]);
        }
      }
      if (visited.size % 50 === 0) {
        log(`  [${lang}] scanned ${visited.size} categories, queued ${queued} titles...`);
      }
    }
    log(`  [${lang}] discovery done: ${visited.size} categories, ${queued} new titles queued`);
    logSync(db, 'discover', lang, null, `categories=${visited.size} queued=${queued}`);
    result[lang] = queued;
  }
  return result;
}

// Project langlinks for the given source pages (default: every active page in
// the priority languages) onto the enabled target languages. Titles whose page
// already exists are skipped; the rest are enqueued.
export async function projectLangLinks(db, {
  pages = null, // [{lang, title}] or null = all priority-language pages
  targetLangs = config.langs,
  log = () => {},
} = {}) {
  const source =
    pages ??
    db
      .prepare(
        `SELECT lang, title FROM pages
         WHERE status='active' AND lang IN (${config.priorityLangs.map(() => '?').join(',')})`
      )
      .all(...config.priorityLangs);

  const byLang = new Map();
  for (const p of source) {
    if (!byLang.has(p.lang)) byLang.set(p.lang, []);
    byLang.get(p.lang).push(p.title);
  }

  const exists = db.prepare('SELECT 1 FROM pages WHERE lang=? AND title=?');
  let queued = 0;
  for (const [lang, titles] of byLang) {
    const targets = targetLangs.filter((l) => l !== lang);
    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      let map;
      try {
        map = await wiki.fetchLangLinks(lang, batch, targets);
      } catch (e) {
        log(`  ! [${lang}] langlinks batch failed: ${e.message}`);
        continue;
      }
      for (const [srcTitle, links] of map) {
        for (const ll of links) {
          if (shouldSkipTitle(ll.title) || exists.get(ll.lang, ll.title)) continue;
          if (enqueue(db, ll.lang, ll.title, 0, `langlink:${lang}:${srcTitle}`)) queued++;
        }
      }
      if ((i / 50) % 10 === 9) log(`  [${lang}] langlinks ${i + batch.length}/${titles.length}...`);
    }
  }
  if (queued) logSync(db, 'langlinks', null, null, `queued=${queued}`);
  log(`  langlink projection queued ${queued} titles`);
  return queued;
}
