// Scientists backend -- REST + SSE API for the roleplay chat.
//
//   node server.mjs                 -> listens on 127.0.0.1:5188
//   SCI_PORT=7100 node server.mjs   -> custom port
//
// Binds to loopback by default; expose to a phone over Tailscale with
//   tailscale serve --bg --https=5188 http://127.0.0.1:5188
// (see README for the full mobile + tailnet setup).
//
// Clean isolation: the browser only ever sees the JSON/SSE contract below; it
// shares no code with the static demo. The demo's serve.mjs is untouched.

import { createServer } from 'node:http';
import { config, resolveModel, normalizeLang } from './config.mjs';
import {
  listScientists, getScientist, buildSystemPrompt, rankScientists, nameOf,
} from './personas/scientists.mjs';
import { chatStream, ping } from './lib/ollama.mjs';
import { refreshInstalled, installedModels, pickModel } from './lib/model-resolver.mjs';
import {
  shouldSummarize, summarizeConversation, usageFraction, estimateTokens,
} from './lib/context.mjs';
import {
  getOrCreateSession, getSession, appendMessage, restartWithSummary, deleteSession, sessionCount,
  getOrCreateDiscussion, getDiscussion, appendDiscussionRound, restartDiscussionWithSummary,
  deleteDiscussion,
} from './lib/sessions.mjs';
import { runDiscussion } from './lib/discussion.mjs';
import { retrieveContext } from './knowledge/wiki.mjs';

// ---- small HTTP helpers ----

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allow = config.corsOrigins;
  if (allow.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && allow.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJson(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// One Server-Sent-Events frame. `type` discriminates the payload for the client.
function sse(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

// ---- route handlers ----

async function handleHealth(req, res) {
  await refreshInstalled(); // keep the effective-model view live
  const ollama = await ping();
  const zh = pickModel('zh');
  const en = pickModel('en');
  sendJson(res, 200, {
    ok: true,
    service: 'kn-scientists-backend',
    sessions: sessionCount(),
    // Effective models actually in use (after fallback reconciliation).
    models: { zh: zh.name, en: en.name },
    // Preferred (strongest) targets + whether each is the one running.
    modelStatus: { zh, en },
    installed: installedModels().installed,
    wikiRag: config.wiki.enabled,
    ollama,
  });
}

function handleScientists(req, res) {
  sendJson(res, 200, { scientists: listScientists() });
}

async function handleChat(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const scientistId = String(body.scientistId || '');
  const lang = normalizeLang(body.lang);
  const sessionId = body.sessionId ? String(body.sessionId) : '';

  const scientist = getScientist(scientistId);
  if (!scientist) return sendJson(res, 400, { error: `unknown scientist: ${scientistId}` });
  if (!message) return sendJson(res, 400, { error: 'empty message' });

  // Resolve the per-language config, then swap in the effective (installed)
  // model tag so the chat works whether or not the preferred model is pulled.
  const cfg = resolveModel(lang);
  const picked = pickModel(cfg.lang);
  const model = { ...cfg, name: picked.name };
  const session = getOrCreateSession(sessionId, scientistId, lang);

  // Open the SSE stream.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Cancel the upstream generation if the browser disconnects.
  const ac = new AbortController();
  req.on('close', () => ac.abort());

  try {
    // Optional Wikipedia retrieval (best-effort; '' when disabled).
    const wikiContext = await retrieveContext(message, lang);

    // System prompt WITHOUT summary, used only for the summarize decision so the
    // growing summary itself doesn't keep tripping the threshold.
    const baseSystem = buildSystemPrompt(scientist, { wikiContext });

    // Context management: summarize + restart at the configured fraction.
    if (shouldSummarize(model, baseSystem, session.messages, message)) {
      sse(res, 'summary', { state: 'start', lang });
      try {
        const merged = await summarizeConversation(model, lang, session.messages, session.summary);
        restartWithSummary(session, merged);
        sse(res, 'summary', { state: 'done', summary: merged, summaryCount: session.summaryCount });
      } catch (e) {
        // Summarization failure shouldn't kill the chat; drop oldest turns instead.
        session.messages = session.messages.slice(-4);
        sse(res, 'summary', { state: 'error', error: String(e && e.message || e) });
      }
    }

    // Final system prompt includes any carried-over summary memory.
    const systemPrompt = buildSystemPrompt(scientist, { wikiContext, summary: session.summary });

    sse(res, 'meta', {
      sessionId: session.id,
      model: model.name,
      lang: model.lang,
      scientistId,
      usage: usageFraction(model, systemPrompt, session.messages),
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.messages,
      { role: 'user', content: message },
    ];

    let reply = '';
    const stats = await chatStream({ model, messages, signal: ac.signal }, (delta) => {
      reply += delta;
      sse(res, 'token', { text: delta });
    });

    // Persist the turn.
    appendMessage(session, 'user', message);
    appendMessage(session, 'assistant', reply);
    if (stats.promptTokens) session.lastPromptTokens = stats.promptTokens;

    sse(res, 'done', {
      sessionId: session.id,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      usage: usageFraction(model, systemPrompt, session.messages),
      contextTokens: model.contextTokens,
    });
  } catch (err) {
    if (!ac.signal.aborted) sse(res, 'error', { error: String(err && err.message || err) });
  } finally {
    res.end();
  }
}

async function handleReset(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const ok = body.sessionId ? deleteSession(String(body.sessionId)) : false;
  sendJson(res, 200, { ok });
}

// Manual summarize: compress the running dialogue into the carried-over memory
// on demand (same machinery as the automatic threshold summarize), and return
// the bullet-point summary so the client can show the key points.
async function handleSummarize(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const sessionId = body.sessionId ? String(body.sessionId) : '';
  const lang = normalizeLang(body.lang);

  const session = getSession(sessionId);
  if (!session) return sendJson(res, 404, { error: 'unknown session' });
  // Nothing to compress yet -> report unchanged so the UI can say so.
  if (!session.messages.length) {
    return sendJson(res, 200, { ok: true, changed: false, summary: session.summary || '', summaryCount: session.summaryCount });
  }

  const cfg = resolveModel(lang);
  const picked = pickModel(cfg.lang);
  const model = { ...cfg, name: picked.name };
  const scientist = getScientist(session.scientistId);

  try {
    const merged = await summarizeConversation(model, lang, session.messages, session.summary);
    restartWithSummary(session, merged);
    const systemPrompt = scientist ? buildSystemPrompt(scientist, { summary: merged }) : '';
    sendJson(res, 200, {
      ok: true,
      changed: true,
      summary: merged,
      summaryCount: session.summaryCount,
      usage: scientist ? usageFraction(model, systemPrompt, session.messages) : 0,
    });
  } catch (err) {
    sendJson(res, 500, { error: String(err && err.message || err) });
  }
}

// ---- multi-scientist roundtable (Science Dialogue tab) ----

// Compact panel memory carried into a new question: the running summary plus the
// most recent (question -> conclusion) pairs (full turn-by-turn history is not
// replayed, to keep follow-ups inside the context budget).
function buildDiscussionMemory(disc, lang) {
  const parts = [];
  if (disc.summary) parts.push(disc.summary);
  for (const r of disc.rounds.slice(-config.discussion.memoryRounds)) {
    parts.push(lang === 'zh'
      ? `問:${r.question}\n結論:${r.conclusion}`
      : `Q: ${r.question}\nConclusion: ${r.conclusion}`);
  }
  return parts.join('\n\n');
}

async function handleDiscuss(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const lang = normalizeLang(body.lang);
  const sessionId = body.sessionId ? String(body.sessionId) : '';
  const rawIds = Array.isArray(body.scientistIds) ? body.scientistIds.map(String) : [];

  // Keep only known ids, de-duplicated and capped, preserving the caller order.
  const ids = [];
  for (const id of rawIds) {
    if (getScientist(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= config.discussion.maxParticipants) break;
  }
  if (!ids.length) return sendJson(res, 400, { error: 'no valid scientists selected' });
  if (!message) return sendJson(res, 400, { error: 'empty message' });

  const cfg = resolveModel(lang);
  const picked = pickModel(cfg.lang);
  const model = { ...cfg, name: picked.name };
  const disc = getOrCreateDiscussion(sessionId, ids, lang);

  // Rank the panel by expertise for THIS question (most-relevant leads + concludes).
  const ranked = rankScientists(message, ids).map((r) => r.scientist);
  const speakers = ranked.map((s) => ({ id: s.id, name: nameOf(s, lang), accent: s.accent || '' }));

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const ac = new AbortController();
  req.on('close', () => ac.abort());
  const emit = (type, data) => sse(res, type, data);

  try {
    const memory = buildDiscussionMemory(disc, lang);
    emit('meta', { sessionId: disc.id, model: model.name, lang: model.lang, speakers, usage: 0 });

    const result = await runDiscussion(
      { model, lang, scientists: ranked, question: message, memory, signal: ac.signal },
      emit,
    );

    // Retain only the (question -> conclusion) pair as panel memory.
    appendDiscussionRound(disc, message, result.conclusion.content);

    emit('done', {
      sessionId: disc.id,
      usage: result.usage,
      rounds: result.rounds,
      resolved: result.resolved,
      stopReason: result.stopReason,
    });
  } catch (err) {
    if (!ac.signal.aborted) emit('error', { error: String(err && err.message || err) });
  } finally {
    res.end();
  }
}

async function handleDiscussReset(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const ok = body.sessionId ? deleteDiscussion(String(body.sessionId)) : false;
  sendJson(res, 200, { ok });
}

async function handleDiscussSummarize(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const lang = normalizeLang(body.lang);
  const disc = getDiscussion(body.sessionId ? String(body.sessionId) : '');
  if (!disc) return sendJson(res, 404, { error: 'unknown session' });
  if (!disc.rounds.length) {
    return sendJson(res, 200, { ok: true, changed: false, summary: disc.summary || '', summaryCount: disc.summaryCount });
  }

  const cfg = resolveModel(lang);
  const picked = pickModel(cfg.lang);
  const model = { ...cfg, name: picked.name };

  // Flatten the retained (question -> conclusion) pairs into a transcript the
  // shared summarizer understands, then fold it into the carried-over memory.
  const history = [];
  for (const r of disc.rounds) {
    history.push({ role: 'user', content: r.question });
    history.push({ role: 'assistant', content: r.conclusion });
  }
  try {
    const merged = await summarizeConversation(model, lang, history, disc.summary);
    restartDiscussionWithSummary(disc, merged);
    sendJson(res, 200, {
      ok: true,
      changed: true,
      summary: merged,
      summaryCount: disc.summaryCount,
      usage: Math.min(1, estimateTokens(merged) / model.contextTokens),
    });
  } catch (err) {
    sendJson(res, 500, { error: String(err && err.message || err) });
  }
}

// ---- router ----

const server = createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (req.method === 'GET' && (path === '/' || path === '/api' || path === '/api/health')) {
      return await handleHealth(req, res);
    }
    if (req.method === 'GET' && path === '/api/scientists') {
      return handleScientists(req, res);
    }
    if (req.method === 'POST' && path === '/api/chat') {
      return await handleChat(req, res);
    }
    if (req.method === 'POST' && path === '/api/session/reset') {
      return await handleReset(req, res);
    }
    if (req.method === 'POST' && path === '/api/session/summarize') {
      return await handleSummarize(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss') {
      return await handleDiscuss(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss/reset') {
      return await handleDiscussReset(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss/summarize') {
      return await handleDiscussSummarize(req, res);
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: String(err && err.message || err) });
    else res.end();
  }
});

server.listen(config.port, config.host, async () => {
  console.log('KN Scientists backend');
  console.log(`  Local:   http://${config.host}:${config.port}/api/health`);
  console.log(`  Ollama:  ${config.ollama.baseUrl}`);

  // Reconcile preferred models against what's installed and report clearly.
  const { available } = await refreshInstalled();
  if (!available) {
    console.log('  Models:  Ollama not reachable yet -- start it, then refresh.');
  } else {
    for (const lang of ['zh', 'en']) {
      const p = pickModel(lang);
      const note = p.status === 'preferred' ? '(preferred)'
        : p.status === 'fallback' ? `(fallback; pull "${p.preferred}" to upgrade)`
        : p.status === 'missing' ? `(MISSING; pull "${p.preferred}")` : '';
      console.log(`  Model ${lang}: ${p.name} ${note}`);
    }
  }
  console.log(`  WikiRAG: ${config.wiki.enabled ? 'on' : 'off'}`);
  console.log('  Tailnet: tailscale serve --bg --https=' + config.port +
    ' http://127.0.0.1:' + config.port);
});
