// Shared route dispatch for the wiki-kb HTTP API. Used standalone by
// wiki-kb/server.mjs (npm run kb:serve -- admin/crawl work via kb-admin.html
// without needing the LLM backend up) AND merged in-process by
// scientists-backend/server.mjs (the live app's single backend, :5188).
// Keeping the dispatch in one place means the two hosts can never drift on
// what a given endpoint does.
//
//   GET    /api/stats                                 full statistics
//   GET    /api/search?q=&langs=zh,en&k=8&kind=       hybrid retrieval results
//   GET    /api/context?q=&lang=zh&maxChars=1500      prompt-ready reference block
//   GET    /api/page?id= | ?lang=&title= [&chunks=1]  read one page
//   POST   /api/page {lang, title, force?}            ingest/refresh from Wikipedia
//   DELETE /api/page?id= [&hard=1]                     soft (default) or hard delete
//   GET    /api/entity?qid=Q937                       entity + edges + corpus pages
//   GET    /api/graph?qid=Q937&depth=1                 subgraph for visualization
//   GET    /api/pages?lang=&kind=&status=&q=&limit=&offset=&sort=&dir=   browse pages (admin)
//   GET    /api/entities?q=&kind=&category=&limit=&sort=&dir=  browse/search graph entities
//   GET    /api/categories                              classification tree + counts (lib/classify.mjs)
//   GET    /api/log?limit=                             recent sync/CRUD activity
//   POST   /api/embed {limit?}                         embed pending chunks now
//   POST   /api/contribute {lang,title,content,...}    add a manual page (note/translation)
//   POST   /api/entity {qid?,kind,label_en,...}        create/update a graph entity
//   POST   /api/edge {src,rel,rel_label?,dst}          add a graph edge
//   DELETE /api/edge?src=&rel=&dst=                     remove a graph edge
//   POST   /api/translate {pageId, target}              LLM-translate a page (preview only)
//   POST   /api/entity/generate {qid, target}            LLM-generate an unsourced stub article (preview only)
//
// GET /api/health is intentionally NOT handled here -- each host reports
// health in its own response shape; use kbHealthPayload() for the shared bits.
//
// LLM-backed writes (translate/generate/embed) share one busy gate with
// scientists-backend's chat calls when the two are merged in-process (see
// ollama-gate.mjs) -- Ollama serializes requests regardless, so letting one
// queue silently behind the other just stalls it with no feedback. These
// routes check the gate up front and refuse fast (409) instead, so the UI
// can show "busy, try again" rather than hang. Pure-SQLite writes (entity/
// edge CRUD, page delete) never touch Ollama and are never gated.

import {
  getPageById, getPageByTitle, getPageCategories, deletePage, logSync,
  listPages, listEntities, upsertManualEntity, addEdge, removeEdge, recentLog, stats,
} from './db.mjs';
import { search, buildContext } from './retrieve.mjs';
import { getEntity, subgraph } from './graph.mjs';
import { ingestTitle, ingestManual, embedPending } from './ingest.mjs';
import { embedAvailable } from './embed.mjs';
import { translatePage, generateEntityArticle } from './translate.mjs';
import { isBusy as llmBusy } from './ollama-gate.mjs';
import { CATEGORY_TREE, categoryCounts } from './classify.mjs';
import { config } from '../config.mjs';

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

// Health fields shared by both hosts' /api/health responses (each host wraps
// this in its own envelope -- see wiki-kb/server.mjs and
// scientists-backend/server.mjs).
export async function kbHealthPayload(db) {
  const s = stats(db);
  return {
    pages: s.pagesActive,
    chunks: s.chunks,
    embedded: s.embedded,
    edges: s.edges,
    embedModel: config.embed.model,
    embedReady: await embedAvailable(),
    // True while any LLM-backed call (this host's own translate/generate/
    // embed, OR -- when merged in-process -- the scientists-backend chat) is
    // in flight. The write routes below (translate/embed/entity-generate)
    // refuse immediately while this is true instead of queuing silently.
    writeBusy: llmBusy(),
  };
}

// Builds the request handler for every wiki-kb route except /api/health.
// Returns true if the request was handled (response already sent), false if
// the path/method didn't match anything here (caller should 404).
export function createKbRouter(db) {
  return async function handleKbRoute(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      json(res, 200, { ok: true, stats: stats(db) });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      if (!q.trim()) { json(res, 400, { ok: false, error: 'q required' }); return true; }
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
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/context') {
      const q = url.searchParams.get('q') ?? '';
      if (!q.trim()) { json(res, 400, { ok: false, error: 'q required' }); return true; }
      const results = await search(db, { q, langs: langsParam(url) });
      const maxChars = Number(url.searchParams.get('maxChars')) || undefined;
      const ctx = buildContext(results, maxChars);
      json(res, 200, { ok: true, query: q, ...ctx });
      return true;
    }
    if (url.pathname === '/api/page') {
      if (req.method === 'GET') {
        const id = url.searchParams.get('id');
        const page = id
          ? getPageById(db, Number(id))
          : getPageByTitle(db, url.searchParams.get('lang'), url.searchParams.get('title'));
        if (!page) { json(res, 404, { ok: false, error: 'not found' }); return true; }
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
        return true;
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!body.lang || !body.title) {
          json(res, 400, { ok: false, error: 'lang and title required' });
          return true;
        }
        const r = await ingestTitle(db, body.lang, body.title, { force: !!body.force });
        if (r.pageId && (r.status === 'added' || r.status === 'updated')) {
          embedPending(db, {}).catch(() => {});
        }
        json(res, 200, { ok: true, ...r });
        return true;
      }
      if (req.method === 'DELETE') {
        const id = Number(url.searchParams.get('id'));
        const page = getPageById(db, id);
        if (!page) { json(res, 404, { ok: false, error: 'not found' }); return true; }
        const hard = url.searchParams.get('hard') === '1';
        deletePage(db, id, { hard });
        logSync(db, hard ? 'hard-delete' : 'soft-delete', page.lang, page.title, 'http-api');
        json(res, 200, { ok: true, deleted: page.title, hard });
        return true;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/entity') {
      const qid = url.searchParams.get('qid');
      if (!qid) { json(res, 400, { ok: false, error: 'qid required' }); return true; }
      const e = getEntity(db, qid);
      if (!e) { json(res, 404, { ok: false, error: 'not found' }); return true; }
      json(res, 200, { ok: true, ...e });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/graph') {
      const qid = url.searchParams.get('qid');
      if (!qid) { json(res, 400, { ok: false, error: 'qid required' }); return true; }
      json(res, 200, { ok: true, ...subgraph(db, qid, Number(url.searchParams.get('depth')) || 1) });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/pages') {
      json(res, 200, {
        ok: true,
        ...listPages(db, {
          lang: url.searchParams.get('lang') || undefined,
          kind: url.searchParams.get('kind') || undefined,
          status: url.searchParams.get('status') || 'active',
          q: url.searchParams.get('q') || undefined,
          limit: Number(url.searchParams.get('limit')) || 50,
          offset: Number(url.searchParams.get('offset')) || 0,
          sort: url.searchParams.get('sort') || undefined,
          dir: url.searchParams.get('dir') || undefined,
        }),
      });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/entities') {
      json(res, 200, {
        ok: true,
        entities: listEntities(db, {
          q: url.searchParams.get('q') || undefined,
          kind: url.searchParams.get('kind') || undefined,
          category: url.searchParams.get('category') || undefined,
          limit: Number(url.searchParams.get('limit')) || 50,
          sort: url.searchParams.get('sort') || undefined,
          dir: url.searchParams.get('dir') || undefined,
        }),
      });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/categories') {
      const counts = categoryCounts(db);
      // Attach counts to a fresh copy of the static tree (leaf `n`, group `n`
      // summed from its children) so the frontend can render node counts
      // without recomputing the tree shape itself.
      const withCounts = CATEGORY_TREE.map((node) => {
        if (!node.children) return { ...node, n: counts.get(node.key) || 0 };
        const children = node.children.map((c) => ({ ...c, n: counts.get(c.key) || 0 }));
        return { ...node, children, n: children.reduce((s, c) => s + c.n, 0) };
      });
      json(res, 200, { ok: true, tree: withCounts });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/log') {
      json(res, 200, { ok: true, log: recentLog(db, Number(url.searchParams.get('limit')) || 100) });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/embed') {
      if (llmBusy()) { json(res, 409, { ok: false, error: 'busy', busy: true }); return true; }
      const body = await readBody(req);
      const r = await embedPending(db, { limit: Number(body.limit) || Infinity });
      json(res, 200, { ok: true, ...r });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/contribute') {
      const body = await readBody(req);
      if (!body.lang || !body.title || !body.content) {
        json(res, 400, { ok: false, error: 'lang, title and content required' });
        return true;
      }
      if (!config.langs.includes(body.lang)) {
        json(res, 400, { ok: false, error: `unsupported lang: ${body.lang}` });
        return true;
      }
      let qid = typeof body.qid === 'string' && body.qid.trim() ? body.qid.trim() : null;
      // createEntity: give the contribution its own graph node so it shows up
      // in the knowledge-graph view, not only in RAG retrieval.
      if (!qid && body.createEntity) {
        const ent = upsertManualEntity(db, {
          kind: body.kind === 'note' || !body.kind ? 'note' : body.kind,
          label_en: body.lang === 'zh' ? null : String(body.title).slice(0, 200),
          label_zh: body.lang === 'zh' ? String(body.title).slice(0, 200) : null,
          description: body.summary ? String(body.summary).slice(0, 300) : null,
        });
        qid = ent.qid;
      }
      const r = ingestManual(db, {
        lang: body.lang,
        title: body.title,
        summary: body.summary,
        content: body.content,
        kind: typeof body.kind === 'string' && body.kind ? body.kind : 'note',
        qid,
        source: typeof body.source === 'string' && body.source ? body.source : 'user',
        sourceLang: typeof body.sourceLang === 'string' && body.sourceLang ? body.sourceLang : null,
      });
      embedPending(db, {}).catch(() => {});
      json(res, 200, { ok: true, qid, ...r });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/entity') {
      const body = await readBody(req);
      if (!body.label_en && !body.label_zh && !body.qid) {
        json(res, 400, { ok: false, error: 'a label (label_en/label_zh) or qid is required' });
        return true;
      }
      const entity = upsertManualEntity(db, body);
      logSync(db, 'entity-upsert', null, entity.label_en || entity.label_zh || entity.qid, 'http-api');
      json(res, 200, { ok: true, entity });
      return true;
    }
    if (url.pathname === '/api/edge') {
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!body.src || !body.rel || !body.dst) {
          json(res, 400, { ok: false, error: 'src, rel and dst required' });
          return true;
        }
        addEdge(db, body.src, body.rel, body.rel_label, body.dst, 'manual');
        logSync(db, 'edge-add', null, `${body.src} -${body.rel}-> ${body.dst}`, 'http-api');
        json(res, 200, { ok: true });
        return true;
      }
      if (req.method === 'DELETE') {
        const src = url.searchParams.get('src');
        const rel = url.searchParams.get('rel');
        const dst = url.searchParams.get('dst');
        if (!src || !rel || !dst) {
          json(res, 400, { ok: false, error: 'src, rel and dst required' });
          return true;
        }
        const removed = removeEdge(db, src, rel, dst);
        if (removed) logSync(db, 'edge-delete', null, `${src} -${rel}-> ${dst}`, 'http-api');
        json(res, removed ? 200 : 404, removed ? { ok: true } : { ok: false, error: 'not found' });
        return true;
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/translate') {
      if (llmBusy()) { json(res, 409, { ok: false, error: 'busy', busy: true }); return true; }
      const body = await readBody(req);
      const page = body.pageId
        ? getPageById(db, Number(body.pageId))
        : getPageByTitle(db, body.lang, body.title);
      if (!page) { json(res, 404, { ok: false, error: 'source page not found' }); return true; }
      if (!body.target) { json(res, 400, { ok: false, error: 'target language required' }); return true; }
      // Cancel the upstream Ollama generation the moment the reader hits
      // "cancel" (which just aborts their fetch, closing this connection) --
      // otherwise the GPU keeps grinding on a translation nobody is waiting for.
      const ac = new AbortController();
      req.on('close', () => ac.abort());
      try {
        const r = await translatePage(page, String(body.target), { signal: ac.signal });
        logSync(db, 'translate', r.target, page.title, `model=${r.model} from=${page.lang}`);
        if (!res.writableEnded) json(res, 200, { ok: true, ...r });
      } catch (e) {
        if (!res.writableEnded) json(res, ac.signal.aborted ? 499 : 500, { ok: false, error: String(e && e.message || e) });
      }
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/entity/generate') {
      if (llmBusy()) { json(res, 409, { ok: false, error: 'busy', busy: true }); return true; }
      const body = await readBody(req);
      if (!body.qid) { json(res, 400, { ok: false, error: 'qid required' }); return true; }
      if (!body.target) { json(res, 400, { ok: false, error: 'target language required' }); return true; }
      const found = getEntity(db, String(body.qid));
      if (!found) { json(res, 404, { ok: false, error: 'entity not found' }); return true; }
      const ac = new AbortController();
      req.on('close', () => ac.abort());
      try {
        const relations = [...(found.out || []), ...(found.in || [])];
        const r = await generateEntityArticle(found.entity, String(body.target), { relations, signal: ac.signal });
        logSync(db, 'generate', r.target, found.entity.label_en || found.entity.label_zh || found.entity.qid, `model=${r.model}`);
        if (!res.writableEnded) json(res, 200, { ok: true, ...r });
      } catch (e) {
        if (!res.writableEnded) json(res, ac.signal.aborted ? 499 : 500, { ok: false, error: String(e && e.message || e) });
      }
      return true;
    }
    return false;
  };
}
