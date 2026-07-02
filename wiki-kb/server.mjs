#!/usr/bin/env node
// Wiki knowledge-base HTTP API (loopback by default; Tailscale terminates TLS
// like the other services in this repo).
//
//   GET    /api/health                                liveness + corpus counts
//   GET    /api/stats                                 full statistics
//   GET    /api/search?q=&langs=zh,en&k=8&kind=       hybrid retrieval results
//   GET    /api/context?q=&lang=zh&maxChars=1500      prompt-ready reference block
//   GET    /api/page?id= | ?lang=&title= [&chunks=1]  read one page
//   POST   /api/page {lang, title, force?}            ingest/refresh from Wikipedia
//   DELETE /api/page?id= [&hard=1]                    soft (default) or hard delete
//   GET    /api/entity?qid=Q937                       entity + edges + corpus pages
//   GET    /api/graph?qid=Q937&depth=1                subgraph for visualization
//
// The scientists-backend consumes /api/context via SCI_WIKI_KB_URL (see
// scientists-backend/knowledge/wiki.mjs); it fails open to live Wikipedia if
// this server is down.

import http from 'node:http';
import {
  openDb, stats, getPageById, getPageByTitle, getPageCategories, deletePage, logSync,
} from './lib/db.mjs';
import { search, buildContext } from './lib/retrieve.mjs';
import { getEntity, subgraph } from './lib/graph.mjs';
import { ingestTitle, embedPending } from './lib/ingest.mjs';
import { embedAvailable } from './lib/embed.mjs';
import { config } from './config.mjs';

const db = openDb();
const startedAt = Date.now();

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = config.server.corsOrigins.includes('*')
    ? origin
    : config.server.corsOrigins.find((o) => o === origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (Buffer.concat(chunks).length > 1_000_000) throw new Error('body too large');
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function langsParam(url) {
  const langs = url.searchParams.get('langs');
  if (langs) return langs.split(',').map((s) => s.trim()).filter(Boolean);
  const lang = url.searchParams.get('lang');
  // single-lang callers (the scientists backend) get their language plus the
  // English corpus as backfill, mirroring its zh->en fallback behavior
  if (lang) return lang === 'en' ? ['en'] : [lang, 'en'];
  return undefined;
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const s = stats(db);
      json(res, 200, {
        ok: true,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        pages: s.pagesActive,
        chunks: s.chunks,
        embedded: s.embedded,
        edges: s.edges,
        embedModel: config.embed.model,
        embedReady: await embedAvailable(),
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      json(res, 200, { ok: true, stats: stats(db) });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      if (!q.trim()) return json(res, 400, { ok: false, error: 'q required' });
      const kind = url.searchParams.get('kind');
      const results = await search(db, {
        q,
        langs: langsParam(url),
        kinds: kind ? [kind] : undefined,
        k: Number(url.searchParams.get('k')) || undefined,
      });
      json(res, 200, {
        ok: true,
        query: q,
        results: results.map((r) => ({
          ...r,
          score: Number(r.score.toFixed(4)),
          embedding: undefined,
        })),
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/context') {
      const q = url.searchParams.get('q') ?? '';
      if (!q.trim()) return json(res, 400, { ok: false, error: 'q required' });
      const results = await search(db, { q, langs: langsParam(url) });
      const maxChars = Number(url.searchParams.get('maxChars')) || undefined;
      const ctx = buildContext(results, maxChars);
      json(res, 200, { ok: true, query: q, ...ctx });
      return;
    }
    if (url.pathname === '/api/page') {
      if (req.method === 'GET') {
        const id = url.searchParams.get('id');
        const page = id
          ? getPageById(db, Number(id))
          : getPageByTitle(db, url.searchParams.get('lang'), url.searchParams.get('title'));
        if (!page) return json(res, 404, { ok: false, error: 'not found' });
        const body = {
          ok: true,
          page: { ...page, content: undefined, contentChars: (page.content || '').length },
          categories: getPageCategories(db, page.id),
        };
        if (url.searchParams.get('chunks')) {
          body.chunks = db
            .prepare('SELECT seq, section, text FROM chunks WHERE page_id=? ORDER BY seq')
            .all(page.id);
        }
        json(res, 200, body);
        return;
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!body.lang || !body.title) {
          return json(res, 400, { ok: false, error: 'lang and title required' });
        }
        const r = await ingestTitle(db, body.lang, body.title, { force: !!body.force });
        if (r.pageId && (r.status === 'added' || r.status === 'updated')) {
          embedPending(db, {}).catch(() => {});
        }
        json(res, 200, { ok: true, ...r });
        return;
      }
      if (req.method === 'DELETE') {
        const id = Number(url.searchParams.get('id'));
        const page = getPageById(db, id);
        if (!page) return json(res, 404, { ok: false, error: 'not found' });
        const hard = url.searchParams.get('hard') === '1';
        deletePage(db, id, { hard });
        logSync(db, hard ? 'hard-delete' : 'soft-delete', page.lang, page.title, 'http-api');
        json(res, 200, { ok: true, deleted: page.title, hard });
        return;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/entity') {
      const qid = url.searchParams.get('qid');
      if (!qid) return json(res, 400, { ok: false, error: 'qid required' });
      const e = getEntity(db, qid);
      if (!e) return json(res, 404, { ok: false, error: 'not found' });
      json(res, 200, { ok: true, ...e });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/graph') {
      const qid = url.searchParams.get('qid');
      if (!qid) return json(res, 400, { ok: false, error: 'qid required' });
      json(res, 200, { ok: true, ...subgraph(db, qid, Number(url.searchParams.get('depth')) || 1) });
      return;
    }
    json(res, 404, { ok: false, error: 'unknown endpoint' });
  } catch (e) {
    json(res, 500, { ok: false, error: String(e?.message ?? e) });
  }
});

server.listen(config.server.port, config.server.host, () => {
  const s = stats(db);
  console.log(`[wiki-kb] http://${config.server.host}:${config.server.port}`);
  console.log(`[wiki-kb] db: ${config.dbPath}`);
  console.log(`[wiki-kb] corpus: ${s.pagesActive} pages, ${s.chunks} chunks (${s.embedded} embedded), ${s.edges} edges`);
});
