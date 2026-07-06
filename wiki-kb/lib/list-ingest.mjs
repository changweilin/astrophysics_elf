// Ingest a curated "List of X" / index Wikipedia article as its own knowledge-
// graph node (kind 'list'), with edges to whichever of its linked items
// already resolve to a Wikidata entity -- so e.g. "List of black holes"
// becomes a parent node and each linked black hole article becomes a child,
// reachable and sortable the same way any other relation is (lib/graph.mjs's
// generic subgraph/detail rendering needs no changes for this).
//
// Deliberately bypasses seeds.mjs's shouldSkipTitle() gate that normally
// excludes "List of..." titles from the ordinary category-crawl path -- these
// titles are explicitly curated (lib/seeds.mjs getListSeeds), not
// accidentally discovered, so the general exclusion doesn't apply to them.
//
// Approximation: "items" are the article's outgoing mainspace wikilinks
// (prop=links), not a parsed wikitext table -- this also picks up prose/
// "See also" links, not just literal list rows. Good enough for a browsable
// KG relation without the fragility of parsing every list-table format
// Wikipedia editors use; itemCap keeps this bounded regardless.

import * as wiki from './wiki-api.mjs';
import {
  upsertPage, setPageCategories, replaceChunks, upsertManualEntity, addEdge, logSync,
} from './db.mjs';
import { chunkText } from './chunk.mjs';
import { toTaiwan } from './zh-convert.mjs';
import { config } from '../config.mjs';

function leadOf(text) {
  const m = /^={2,}/m.exec(text);
  return (m ? text.slice(0, m.index) : text).trim().slice(0, 2000);
}

export async function ingestListPage(db, lang, title, itemCap = 150, { log = () => {} } = {}) {
  const fullText = config.fullTextLangs.includes(lang);
  const b = await wiki.fetchPageBundle(lang, title, { fullText });
  if (!b || b.missing) return { status: 'missing', title };

  if (lang === 'zh') {
    try {
      const displayTitle = await wiki.fetchDisplayTitle(lang, b.title);
      if (displayTitle) b.title = displayTitle;
    } catch { /* keep as-fetched title */ }
  }

  const text = lang === 'zh' ? toTaiwan((b.extract || '').trim()) : (b.extract || '').trim();
  const pageId = upsertPage(db, {
    lang,
    pageid: b.pageid,
    title: b.title,
    qid: b.qid,
    kind: 'list',
    url: b.url,
    summary: leadOf(text),
    content: text,
    revId: b.revId,
    revTime: b.revTime,
  });
  setPageCategories(db, pageId, b.categories);
  let pieces = chunkText(text);
  if (!pieces.length && text) pieces = [{ section: null, text: text.slice(0, config.chunk.targetChars) }];
  const chunks = replaceChunks(db, pageId, pieces);

  const listLabel = lang === 'zh' ? toTaiwan(b.title) : b.title;
  const entity = upsertManualEntity(db, {
    qid: b.qid || undefined,
    kind: 'list',
    label_en: lang === 'en' ? b.title : undefined,
    label_zh: lang === 'zh' ? listLabel : undefined,
    description: leadOf(text).slice(0, 300) || undefined,
  });

  const itemTitles = await wiki.fetchPageLinks(lang, b.title, { max: itemCap });
  let itemsLinked = 0;
  for (let i = 0; i < itemTitles.length; i += 50) {
    const batch = itemTitles.slice(i, i + 50);
    let meta;
    try {
      meta = await wiki.fetchPagesMeta(lang, batch);
    } catch (e) {
      log(`  ! [${lang}] "${b.title}" links batch failed: ${e.message}`);
      continue;
    }
    for (const p of meta.pages) {
      if (p.missing || !p.qid || p.qid === entity.qid) continue;
      addEdge(db, entity.qid, 'list-item', lang === 'zh' ? '列表項目' : 'list item', p.qid, 'list-crawl');
      itemsLinked++;
    }
  }

  logSync(db, 'list-ingest', lang, b.title, `items=${itemsLinked}/${itemTitles.length} qid=${entity.qid}`);
  return { status: 'added', pageId, title: b.title, qid: entity.qid, chunks: chunks.total, itemsLinked, itemsSeen: itemTitles.length };
}
