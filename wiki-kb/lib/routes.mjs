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
//   GET    /api/traces?kind=&limit=&offset=              LLM/retrieval call log (lib/trace.mjs)
//   GET    /api/traces/summary?hours=24                  monitoring aggregates by kind/model
//   GET    /api/eval/runs?limit=20                       past evaluation runs + averaged metrics
//   GET    /api/eval/run?id=N                            one run with per-case results
//   POST   /api/eval/run {mode?,k?,graph?,limit?}        run the eval pipeline (eval/run-eval.mjs);
//                                                        mode 'full' is LLM-gated like translate
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
import { CATEGORY_TREE, categoryCounts, classifyEntity, buildClassifyStmts } from './classify.mjs';
import { recordTrace, listTraces, traceSummary } from './trace.mjs';
import { runEval } from '../eval/run-eval.mjs';
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
      const t0 = Date.now();
      const results = await search(db, {
        q,
        langs: langsParam(url),
        kinds: kind ? [kind] : undefined,
        k: Number(url.searchParams.get('k')) || undefined,
      });
      recordTrace(db, {
        kind: 'search', input: q, ms: Date.now() - t0,
        output: results.map((r) => r.title).join(' | '),
        meta: { hits: results.length, graphBoosted: results.filter((r) => r.g > 0).length },
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
      const t0 = Date.now();
      const results = await search(db, { q, langs: langsParam(url) });
      const maxChars = Number(url.searchParams.get('maxChars')) || undefined;
      const ctx = buildContext(results, maxChars);
      recordTrace(db, {
        kind: 'context', input: q, ms: Date.now() - t0,
        output: ctx.sources.map((s) => s.title).join(' | '),
        meta: { sources: ctx.sources.length, chars: ctx.context.length },
      });
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
      const t0 = Date.now();
      const r = await embedPending(db, { limit: Number(body.limit) || Infinity });
      recordTrace(db, {
        kind: 'embed', model: config.embed.model, ms: Date.now() - t0,
        meta: r,
      });
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
      // LLM-suggested links (from POST /api/entity/generate's `suggestedLinks`,
      // reader-confirmed in the UI before this request) -- committed only now,
      // same preview-then-commit rule as the content itself.
      if (qid && Array.isArray(body.relatedLinks) && body.relatedLinks.length) {
        for (const link of body.relatedLinks) {
          const dst = link && typeof link.qid === 'string' ? link.qid.trim() : '';
          if (dst) addEdge(db, qid, 'related', 'related to', dst, 'llm-suggested');
        }
        logSync(db, 'edge-add', null, qid, `llm-suggested +${body.relatedLinks.length}`);
      }
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
      const t0 = Date.now();
      try {
        const r = await translatePage(page, String(body.target), { signal: ac.signal });
        logSync(db, 'translate', r.target, page.title, `model=${r.model} from=${page.lang}`);
        recordTrace(db, {
          kind: 'translate', name: page.title, model: r.model, ms: Date.now() - t0,
          input: `${page.lang} -> ${r.target}`, output: r.title,
          meta: { pageId: page.id, chars: r.content.length },
        });
        if (!res.writableEnded) json(res, 200, { ok: true, ...r });
      } catch (e) {
        recordTrace(db, {
          kind: 'translate', name: page.title, ms: Date.now() - t0,
          input: `${page.lang} -> ${body.target}`, ok: false,
          error: ac.signal.aborted ? 'cancelled' : e && e.message || e,
        });
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
        const connected = new Set([found.entity.qid, ...relations.map((r) => r.dst || r.src)]);
        // Fixed candidate pool for the LLM to pick NEW links from (never let
        // it invent a QID against a 110k-node graph): same-category siblings
        // plus whatever the hybrid retriever turns up for this label -- the
        // latter also catches cross-category links (e.g. a topic <-> the
        // scientist who discovered it).
        const label = found.entity.label_en || found.entity.label_zh || found.entity.qid;
        // Batch classification (lib/classify.mjs classifyEntities) only ever
        // runs on non-stub rows, so a stub entity -- the normal case reaching
        // this route -- never has a persisted `category`. Classify it live
        // instead of leaving both the prompt's anti-conflation context and
        // the candidate pool empty for exactly the nodes that need them most.
        const category = found.entity.category || classifyEntity(db, found.entity, buildClassifyStmts(db));
        const entityForPrompt = { ...found.entity, category };
        const siblings = category ? listEntities(db, { category, limit: 12 }) : [];
        let searchHits = [];
        try {
          const searchQ = [label, found.entity.description].filter(Boolean).join(' ');
          searchHits = searchQ ? await search(db, { q: searchQ, k: 10 }) : [];
        } catch { searchHits = []; }
        const candMap = new Map();
        for (const s of siblings) {
          if (!connected.has(s.qid)) candMap.set(s.qid, s.label_en || s.label_zh || s.qid);
        }
        for (const h of searchHits) {
          if (h.qid && !connected.has(h.qid) && !candMap.has(h.qid)) candMap.set(h.qid, h.title);
        }
        const candidates = [...candMap].slice(0, 20).map(([qid, clabel]) => ({ qid, label: clabel }));
        const t0 = Date.now();
        const r = await generateEntityArticle(entityForPrompt, String(body.target), { relations, candidates, signal: ac.signal });
        logSync(db, 'generate', r.target, found.entity.label_en || found.entity.label_zh || found.entity.qid, `model=${r.model}`);
        recordTrace(db, {
          kind: 'generate', name: label, model: r.model, ms: Date.now() - t0,
          input: `${found.entity.qid} -> ${r.target}`, output: r.title,
          meta: { suggestedLinks: r.suggestedLinks.length },
        });
        if (!res.writableEnded) json(res, 200, { ok: true, ...r });
      } catch (e) {
        recordTrace(db, {
          kind: 'generate', name: String(body.qid), ok: false,
          error: ac.signal.aborted ? 'cancelled' : e && e.message || e,
        });
        if (!res.writableEnded) json(res, ac.signal.aborted ? 499 : 500, { ok: false, error: String(e && e.message || e) });
      }
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/traces') {
      json(res, 200, {
        ok: true,
        ...listTraces(db, {
          kind: url.searchParams.get('kind') || undefined,
          limit: Number(url.searchParams.get('limit')) || 100,
          offset: Number(url.searchParams.get('offset')) || 0,
        }),
      });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/traces/summary') {
      json(res, 200, {
        ok: true,
        ...traceSummary(db, { sinceHours: Number(url.searchParams.get('hours')) || 24 }),
      });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/eval/runs') {
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20));
      const runs = db.prepare(
        `SELECT id, ts, mode, judge_model AS judgeModel, answer_model AS answerModel,
                k, graph, cases, metrics FROM eval_runs ORDER BY id DESC LIMIT ?`
      ).all(limit).map((r) => ({ ...r, metrics: r.metrics ? JSON.parse(r.metrics) : null }));
      json(res, 200, { ok: true, runs });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/eval/run') {
      const id = Number(url.searchParams.get('id'));
      const run = db.prepare('SELECT * FROM eval_runs WHERE id=?').get(id);
      if (!run) { json(res, 404, { ok: false, error: 'not found' }); return true; }
      const cases = db.prepare('SELECT * FROM eval_cases WHERE run_id=? ORDER BY id').all(id)
        .map((c) => ({
          ...c,
          contexts: c.contexts ? JSON.parse(c.contexts) : [],
          metrics: c.metrics ? JSON.parse(c.metrics) : {},
          detail: c.detail ? JSON.parse(c.detail) : {},
        }));
      json(res, 200, {
        ok: true,
        run: { ...run, metrics: run.metrics ? JSON.parse(run.metrics) : null },
        cases,
      });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/eval/run') {
      const body = await readBody(req);
      const mode = body.mode === 'full' ? 'full' : 'retrieval';
      // Full runs hold the LLM for many minutes; same fast-refusal contract
      // as translate/generate. Retrieval-only runs never touch Ollama's chat
      // model (only the embedder) and stay quick enough for a UI button.
      if (mode === 'full' && llmBusy()) { json(res, 409, { ok: false, error: 'busy', busy: true }); return true; }
      try {
        const r = await runEval(db, {
          mode,
          k: Number(body.k) || 8,
          graph: body.graph !== false,
          limit: Number(body.limit) || Infinity,
        });
        logSync(db, 'eval-run', null, `run#${r.runId}`, `mode=${mode} graph=${r.graph} cases=${r.cases}`);
        json(res, 200, { ok: true, ...r });
      } catch (e) {
        json(res, 500, { ok: false, error: String(e && e.message || e) });
      }
      return true;
    }
    return false;
  };
}
