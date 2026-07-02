#!/usr/bin/env node
// Knowledge-base admin CLI: day-to-day CRUD and operations.
//
//   node kb-admin.mjs stats
//   node kb-admin.mjs list    [--lang zh] [--kind scientist] [--q text] [--limit 20]
//   node kb-admin.mjs get     --id 12 | --lang zh --title "..." [--chunks]
//   node kb-admin.mjs search  --q "..." [--langs zh,en] [--k 8]
//   node kb-admin.mjs context --q "..." [--langs zh,en] [--max-chars 2200]
//   node kb-admin.mjs add     --lang en --title "Kerr metric"        (create/refresh)
//   node kb-admin.mjs refresh --id 12 | --lang zh --title "..."      (force re-fetch)
//   node kb-admin.mjs delete  --id 12 [--hard]                       (soft by default)
//   node kb-admin.mjs reembed [--all]                                (pending, or wipe+redo)
//   node kb-admin.mjs entity  --qid Q937
//   node kb-admin.mjs graph   --qid Q937 [--depth 2]
//   node kb-admin.mjs export  --out corpus.jsonl [--lang zh]
//   node kb-admin.mjs log     [--limit 30]
//   node kb-admin.mjs vacuum

import { parseArgs } from 'node:util';
import { createWriteStream } from 'node:fs';
import {
  openDb, stats, getPageById, getPageByTitle, getPageCategories, deletePage, logSync,
} from './lib/db.mjs';
import { ingestTitle, embedPending } from './lib/ingest.mjs';
import { search, buildContext } from './lib/retrieve.mjs';
import { getEntity, subgraph } from './lib/graph.mjs';
import { config } from './config.mjs';

const { values: o, positionals } = parseArgs({
  options: {
    id: { type: 'string' },
    lang: { type: 'string' },
    langs: { type: 'string' },
    title: { type: 'string' },
    kind: { type: 'string' },
    q: { type: 'string' },
    k: { type: 'string' },
    qid: { type: 'string' },
    depth: { type: 'string' },
    limit: { type: 'string' },
    out: { type: 'string' },
    'max-chars': { type: 'string' },
    chunks: { type: 'boolean', default: false },
    hard: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const command = positionals[0] ?? 'stats';
const db = openDb();
const out = (x) => console.log(JSON.stringify(x, null, 2));

function requirePage() {
  const page = o.id
    ? getPageById(db, Number(o.id))
    : o.lang && o.title
      ? getPageByTitle(db, o.lang, o.title)
      : null;
  if (!page) {
    console.error('Page not found (use --id, or --lang + --title).');
    process.exit(1);
  }
  return page;
}

try {
  switch (command) {
    case 'stats': {
      out(stats(db));
      break;
    }
    case 'list': {
      const filters = ['1=1'];
      const args = [];
      if (o.lang) { filters.push('lang=?'); args.push(o.lang); }
      if (o.kind) { filters.push('kind=?'); args.push(o.kind); }
      if (o.q) { filters.push('title LIKE ?'); args.push(`%${o.q}%`); }
      args.push(Number(o.limit ?? 20));
      const rows = db.prepare(
        `SELECT id, lang, title, kind, status, rev_time, updated_at, qid
         FROM pages WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`
      ).all(...args);
      out(rows);
      break;
    }
    case 'get': {
      const page = requirePage();
      const categories = getPageCategories(db, page.id);
      const nChunks = db.prepare('SELECT COUNT(*) n FROM chunks WHERE page_id=?').get(page.id).n;
      const result = { ...page, content: undefined, categories, nChunks };
      if (o.chunks) {
        result.chunks = db
          .prepare('SELECT seq, section, text, embedding IS NOT NULL AS embedded FROM chunks WHERE page_id=? ORDER BY seq')
          .all(page.id);
      } else {
        result.contentChars = (page.content || '').length;
      }
      out(result);
      break;
    }
    case 'search': {
      if (!o.q) { console.error('--q required'); process.exit(1); }
      const results = await search(db, {
        q: o.q,
        langs: o.langs ? o.langs.split(',') : undefined,
        kinds: o.kind ? [o.kind] : undefined,
        k: o.k ? Number(o.k) : undefined,
      });
      out(results.map((r) => ({
        score: Number(r.score.toFixed(4)),
        bm25: r.bm25 != null ? Number(r.bm25.toFixed(3)) : null,
        cos: r.cos != null ? Number(r.cos.toFixed(3)) : null,
        decay: Number(r.decay.toFixed(3)),
        lang: r.lang, title: r.title, section: r.section,
        revTime: r.revTime, url: r.url,
        text: r.text.slice(0, 200) + (r.text.length > 200 ? '...' : ''),
      })));
      break;
    }
    case 'context': {
      if (!o.q) { console.error('--q required'); process.exit(1); }
      const results = await search(db, {
        q: o.q,
        langs: o.langs ? o.langs.split(',') : undefined,
      });
      const ctx = buildContext(results, o['max-chars'] ? Number(o['max-chars']) : undefined);
      console.log(ctx.context);
      console.error(`\n-- sources: ${JSON.stringify(ctx.sources)}`);
      break;
    }
    case 'add':
    case 'refresh': {
      const lang = o.lang ?? (o.id ? requirePage().lang : null);
      const title = o.title ?? (o.id ? requirePage().title : null);
      if (!lang || !title) { console.error('--lang and --title (or --id) required'); process.exit(1); }
      const r = await ingestTitle(db, lang, title, { force: command === 'refresh' });
      if (r.pageId && (r.status === 'added' || r.status === 'updated')) {
        await embedPending(db, { log: console.error });
      }
      out(r);
      break;
    }
    case 'delete': {
      const page = requirePage();
      deletePage(db, page.id, { hard: o.hard });
      logSync(db, o.hard ? 'hard-delete' : 'soft-delete', page.lang, page.title, 'kb-admin');
      out({ deleted: page.title, lang: page.lang, hard: o.hard });
      break;
    }
    case 'reembed': {
      if (o.all) {
        db.exec('UPDATE chunks SET embedding=NULL, embed_model=NULL, embed_dim=NULL');
        console.log('cleared all embeddings; re-embedding...');
      }
      const r = await embedPending(db, { log: console.log });
      out(r);
      break;
    }
    case 'entity': {
      if (!o.qid) { console.error('--qid required'); process.exit(1); }
      out(getEntity(db, o.qid));
      break;
    }
    case 'graph': {
      if (!o.qid) { console.error('--qid required'); process.exit(1); }
      out(subgraph(db, o.qid, Number(o.depth ?? 1)));
      break;
    }
    case 'export': {
      if (!o.out) { console.error('--out required'); process.exit(1); }
      const filters = ["status='active'"];
      const args = [];
      if (o.lang) { filters.push('lang=?'); args.push(o.lang); }
      const rows = db.prepare(
        `SELECT id, lang, title, qid, kind, url, summary, content, rev_id, rev_time, source, license
         FROM pages WHERE ${filters.join(' AND ')}`
      ).all(...args);
      const ws = createWriteStream(o.out, 'utf8');
      for (const row of rows) ws.write(JSON.stringify(row) + '\n');
      ws.end();
      await new Promise((resolve) => ws.on('finish', resolve));
      console.log(`exported ${rows.length} pages -> ${o.out}`);
      break;
    }
    case 'log': {
      out(db.prepare('SELECT ts, kind, lang, title, detail FROM sync_log ORDER BY id DESC LIMIT ?')
        .all(Number(o.limit ?? 30)));
      break;
    }
    case 'vacuum': {
      db.exec('VACUUM');
      console.log('vacuumed', config.dbPath);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exitCode = 2;
  }
} finally {
  db.close();
}
