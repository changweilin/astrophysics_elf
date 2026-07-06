// Scientists backend -- REST + SSE API for the roleplay chat, merged with the
// wiki-kb knowledge-base API (search/graph/contribute/etc.) so the live app
// has a single backend to talk to.
//
//   node server.mjs                 -> listens on 127.0.0.1:5188
//   SCI_PORT=7100 node server.mjs   -> custom port
//
// Binds to loopback by default; expose to a phone over Tailscale with
//   tailscale serve --bg --https=5188 http://127.0.0.1:5188
// (see README for the full mobile + tailnet setup).
//
// Clean isolation from the static demo: the browser only ever sees the
// JSON/SSE contract below; the demo's serve.mjs is untouched. The wiki-kb
// route dispatch (../wiki-kb/lib/routes.mjs) IS shared code by design -- it's
// the same knowledge-base API also exposed standalone by wiki-kb/server.mjs
// for admin/crawl work (kb-admin.html) -- so a KB route works identically
// whichever process answers it.

import { createServer } from 'node:http';
import { config, normalizeLang } from './config.mjs';
import {
  listScientists, getScientist, buildSystemPrompt, rankScientists, nameOf, AUTO_ID,
} from './personas/scientists.mjs';
import { chatStream, ping, isBusy } from './lib/ollama.mjs';
import {
  refreshInstalled, installedModels, pickModel, resolveRequestedModel, getGlobalOverride,
} from './lib/model-resolver.mjs';
import {
  shouldSummarize, summarizeConversation, usageFraction, estimateTokens,
} from './lib/context.mjs';
import {
  getOrCreateSession, getSession, appendMessage, restartWithSummary, deleteSession, sessionCount,
  getOrCreateDiscussion, getDiscussion, appendDiscussionRound, restartDiscussionWithSummary,
  deleteDiscussion, rememberFollowups,
} from './lib/sessions.mjs';
import { runDiscussion } from './lib/discussion.mjs';
import { assignScientist } from './lib/router.mjs';
import { generateFollowups } from './lib/followups.mjs';
import { registerRequest, unregisterRequest, abortRequest } from './lib/active-requests.mjs';
import { retrieveContext } from './knowledge/wiki.mjs';
import { openDb } from '../wiki-kb/lib/db.mjs';
import { createKbRouter, kbHealthPayload } from '../wiki-kb/lib/routes.mjs';

const kbDb = openDb();
const handleKbRoute = createKbRouter(kbDb);

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
  // DELETE is required by the merged wiki-kb routes (page/edge delete) --
  // without it, any cross-origin page (e.g. library.html/kb-admin.html on the
  // static :5184 server calling this :5188 API) has its DELETE requests
  // silently rejected at the CORS preflight, well before routes.mjs even sees
  // them.
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

// ---- conversation rehydration ----
//
// Sessions live only in this process's memory, so a page reload, a saved-thread
// resume, or a backend restart leaves the client holding a transcript the
// backend has forgotten. The client replays that transcript and we seed a fresh
// (empty) session from it, so the dialogue keeps its context. We only ever seed
// an *empty* session, so a live continuing conversation is never double-counted.

// Normalize a client-sent history ([{role:'user'|'sci'|'assistant', text|content}])
// into the internal {role:'user'|'assistant', content} shape, dropping notices,
// blanks, and anything unrecognized; capped to a sane length.
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m) continue;
    const role = (m.role === 'assistant' || m.role === 'sci') ? 'assistant'
      : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    const content = typeof m.content === 'string' ? m.content
      : typeof m.text === 'string' ? m.text : '';
    if (!content.trim()) continue;
    out.push({ role, content });
  }
  return out.slice(-config.context.rehydrateMaxMessages);
}

// Seed an empty single-chat session from replayed history. Returns true if it
// actually seeded (so the caller knows the normal summarize check should run).
function seedSessionIfEmpty(session, rawHistory) {
  if (session.messages.length || session.summary) return false;
  const seeded = sanitizeHistory(rawHistory);
  if (!seeded.length) return false;
  session.messages = seeded;
  return true;
}

// Normalize replayed discussion rounds ([{question, conclusion}]).
function sanitizeRounds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r) continue;
    const question = typeof r.question === 'string' ? r.question.trim() : '';
    const conclusion = typeof r.conclusion === 'string' ? r.conclusion.trim() : '';
    if (!question || !conclusion) continue;
    out.push({ question, conclusion });
  }
  return out.slice(-config.context.rehydrateMaxMessages);
}

// Seed an empty discussion from replayed rounds. Returns true if it seeded.
function seedDiscussionIfEmpty(disc, rawRounds) {
  if (disc.rounds.length || disc.summary) return false;
  const rounds = sanitizeRounds(rawRounds);
  if (!rounds.length) return false;
  disc.rounds = rounds;
  return true;
}

// The backend's shown-followups memory lives only on the in-memory session, so
// it is lost whenever the backend restarts. The client separately keeps its own
// running list of every follow-up it has ever shown for this thread (persisted
// in localStorage across reloads / scientist switches) and resends it with every
// request; merging the two means the "don't repeat yourself" memory survives a
// backend restart even though the server-side copy alone would not.
function mergeClientFollowups(existing, raw) {
  const clientList = Array.isArray(raw) ? raw.filter((q) => typeof q === 'string' && q.trim()).slice(-40) : [];
  if (!clientList.length) return existing;
  const seen = new Set(existing.map((q) => q.toLowerCase()));
  const merged = existing.slice();
  for (const q of clientList) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(q);
  }
  return merged.slice(-40);
}

// Flatten retained (question -> conclusion) rounds into a {user, assistant}
// transcript the shared summarizer / follow-up generator understand.
function flattenRounds(rounds) {
  const history = [];
  for (const r of rounds) {
    history.push({ role: 'user', content: r.question });
    history.push({ role: 'assistant', content: r.conclusion });
  }
  return history;
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
    // Effective models actually in use (after fallback reconciliation AND the
    // shared model-picker pin, if one is set -- see model-resolver.mjs). This
    // is what a dialog should check first before assuming a model, so it
    // converges on what the backend is already running instead of nudging
    // Ollama toward a different one on its own.
    models: {
      zh: resolveRequestedModel('zh', undefined).name,
      en: resolveRequestedModel('en', undefined).name,
    },
    // Preferred (strongest) targets + whether each is the one running (ignores
    // the shared pin -- this is about the per-language default, not the pin).
    modelStatus: { zh, en },
    // The shared model-picker pin ('' = no pin, following per-language auto).
    modelOverride: getGlobalOverride(),
    installed: installedModels().installed,
    // True while a generation is already in flight (this device's or another
    // device's) -- Ollama serializes requests, so a new one will queue behind
    // it rather than answer immediately.
    busy: isBusy(),
    wikiRag: config.wiki.enabled,
    ollama,
    kb: await kbHealthPayload(kbDb),
  });
}

function handleScientists(req, res) {
  sendJson(res, 200, { scientists: listScientists() });
}

// Explicit language lock appended right before generation -- the last line of
// the prompt carries the most weight for small local models, and a long,
// English-flavoured persona/style block earlier in the system prompt can
// otherwise pull them off-language partway through a reply (mirrors the same
// fix already used for the roundtable in lib/discussion.mjs).
function languageLock(lang) {
  return lang === 'zh'
    ? '(請務必全程以繁體中文回答,不要中途切換成英文。)'
    : '(Reply in English throughout.)';
}

// Reply-mode selector: 'direct' skips knowledge-base retrieval entirely;
// 'rag' forces it regardless of the server's default-off SCI_WIKI_RAG env
// switch (that switch alone would otherwise make the RAG/compare options a
// no-op out of the box). Omitted/unrecognized falls back to the original
// behavior (retrieval gated only by config.wiki.enabled).
function normalizeReplyMode(raw) {
  return raw === 'direct' || raw === 'rag' ? raw : null;
}

async function handleChat(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const scientistId = String(body.scientistId || '');
  const lang = normalizeLang(body.lang);
  const sessionId = body.sessionId ? String(body.sessionId) : '';
  const requestId = body.requestId ? String(body.requestId) : '';
  const isAuto = scientistId === AUTO_ID;
  const replyMode = normalizeReplyMode(body.replyMode);
  // Compare mode's second ("direct") call is an ISOLATED generation, exactly
  // like the auto-assign routing / follow-ups calls elsewhere in this file:
  // it reads the client-replayed transcript for context but its prompt/output
  // never touch the real session, so it doesn't fork or pollute the
  // conversation's memory. The client sends its current visible history with
  // this flag instead of relying on server-side session state.
  const isolated = body.isolated === true;

  // In auto mode the answering persona is chosen per-question below; otherwise it
  // must be a known scientist up front.
  if (!isAuto && !getScientist(scientistId)) {
    return sendJson(res, 400, { error: `unknown scientist: ${scientistId}` });
  }
  if (!message) return sendJson(res, 400, { error: 'empty message' });

  // Resolve the per-language config, reconciling both the chat and summary model
  // names to the installed tags so chat AND summarization work whether or not the
  // preferred model is pulled. An explicit body.model (the model-picker dropdown)
  // sets the shared pin (see model-resolver.mjs) for every device when it names
  // an installed tag; omitting it just reads whatever the shared pin currently is.
  const model = resolveRequestedModel(lang, typeof body.model === 'string' ? body.model : undefined);
  // The session id stays stable across turns. In auto mode it tracks 'auto', so
  // each question can be answered by a different expert without resetting memory.
  // Isolated (compare-mode) calls never create or touch a real session.
  const session = isolated ? null : getOrCreateSession(sessionId, scientistId, lang);

  // Rehydrate context from replayed history when this session is empty (page
  // reload / saved-thread resume / restarted backend). No-op for a live session.
  if (session) seedSessionIfEmpty(session, body.history);

  let priorMessages = session ? session.messages : sanitizeHistory(body.history);
  let priorSummary = session ? session.summary : (typeof body.summary === 'string' ? body.summary : '');

  // Open the SSE stream.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Cancel the upstream generation if the browser disconnects. This is a
  // fallback: the real cancel path is the explicit /api/chat/stop endpoint
  // below (see lib/active-requests.mjs for why "wait for the socket to
  // close" alone isn't reliable enough over a mobile/proxied connection).
  const ac = new AbortController();
  req.on('close', () => ac.abort());
  registerRequest(requestId, ac);

  try {
    // Auto-assign: route this question to the best-matched scientist with an
    // ISOLATED call. Its prompt/output never touch the session, so the routing
    // decision does not consume the answer's context window.
    let scientist;
    if (isAuto) {
      const pick = await assignScientist({ model, lang, message, signal: ac.signal });
      scientist = pick.scientist;
      sse(res, 'assigned', {
        id: scientist.id, name: nameOf(scientist, lang), accent: scientist.accent || '', via: pick.via,
      });
    } else {
      scientist = getScientist(scientistId);
    }

    // Optional Wikipedia/KB retrieval. 'direct' skips it outright; 'rag' forces
    // it past the config.wiki.enabled default; unset keeps the legacy gating.
    const wikiResult = replyMode === 'direct'
      ? { context: '', sources: [] }
      : await retrieveContext(message, lang, { force: replyMode === 'rag', signal: ac.signal });
    const wikiContext = wikiResult.context;

    // System prompt WITHOUT summary, used only for the summarize decision so the
    // growing summary itself doesn't keep tripping the threshold.
    const baseSystem = buildSystemPrompt(scientist, { wikiContext });

    // Context management: summarize + restart at the configured fraction. This
    // also compresses a large *rehydrated* history before it enters the prompt.
    // Isolated calls never mutate shared state, so they skip this step and
    // simply use whatever (bounded) history the client sent.
    if (!isolated && shouldSummarize(model, baseSystem, priorMessages, message)) {
      sse(res, 'summary', { state: 'start', lang });
      try {
        const merged = await summarizeConversation(model, lang, priorMessages, priorSummary);
        restartWithSummary(session, merged);
        priorMessages = session.messages;
        priorSummary = session.summary;
        sse(res, 'summary', { state: 'done', summary: merged, summaryCount: session.summaryCount });
      } catch (e) {
        // Summarization failure shouldn't kill the chat; drop oldest turns instead.
        session.messages = session.messages.slice(-4);
        priorMessages = session.messages;
        sse(res, 'summary', { state: 'error', error: String(e && e.message || e) });
      }
    }

    // Final system prompt includes any carried-over summary memory.
    const systemPrompt = buildSystemPrompt(scientist, { wikiContext, summary: priorSummary });

    sse(res, 'meta', {
      sessionId: session ? session.id : (sessionId || 'isolated'),
      model: model.name,
      lang: model.lang,
      scientistId: scientist.id,
      auto: isAuto,
      usage: usageFraction(model, systemPrompt, priorMessages),
      replyMode: replyMode || (config.wiki.enabled ? 'rag' : 'direct'),
      ragUsed: !!wikiContext,
      sources: wikiResult.sources,
      isolated,
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...priorMessages,
      { role: 'user', content: `${message}\n\n${languageLock(lang)}` },
    ];

    let reply = '';
    const stats = await chatStream({ model, messages, signal: ac.signal }, (delta) => {
      reply += delta;
      sse(res, 'token', { text: delta });
    });

    // Persist the turn (isolated/compare calls never write to a session).
    if (!isolated) {
      appendMessage(session, 'user', message);
      appendMessage(session, 'assistant', reply);
      if (stats.promptTokens) session.lastPromptTokens = stats.promptTokens;
    }

    sse(res, 'done', {
      sessionId: session ? session.id : (sessionId || 'isolated'),
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      usage: usageFraction(model, systemPrompt, priorMessages),
      contextTokens: model.contextTokens,
    });
  } catch (err) {
    if (!ac.signal.aborted) sse(res, 'error', { error: String(err && err.message || err) });
  } finally {
    unregisterRequest(requestId);
    res.end();
  }
}

// Explicit cancel: the client sends back the requestId it minted for the
// /api/chat call it wants to stop. Aborting here happens immediately and does
// not depend on the browser's fetch-abort actually tearing down the
// underlying TCP connection promptly (see lib/active-requests.mjs).
async function handleChatStop(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const requestId = body.requestId ? String(body.requestId) : '';
  sendJson(res, 200, { ok: abortRequest(requestId) });
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
  // No real session: this is compare mode's isolated direct-reply lineage,
  // which never holds server-side state. The client carries its own history
  // + prior summary forward (mirrors the isolated /api/chat contract) and we
  // just return the merged text -- there is no session to restart.
  const isolated = !session;
  if (isolated && !(Array.isArray(body.history) && body.history.length)) {
    return sendJson(res, 404, { error: 'unknown session' });
  }

  const history = session ? session.messages : sanitizeHistory(body.history);
  const priorSummary = session ? session.summary : (typeof body.summary === 'string' ? body.summary : '');

  // Nothing to compress yet -> report unchanged so the UI can say so.
  if (!history.length) {
    return sendJson(res, 200, { ok: true, changed: false, summary: priorSummary || '', summaryCount: session ? session.summaryCount : 0 });
  }

  const model = resolveRequestedModel(lang, typeof body.model === 'string' ? body.model : undefined);

  try {
    const merged = await summarizeConversation(model, lang, history, priorSummary);
    let summaryCount = 0;
    let usage = 0;
    if (session) {
      restartWithSummary(session, merged);
      summaryCount = session.summaryCount;
      const scientist = getScientist(session.scientistId);
      const systemPrompt = scientist ? buildSystemPrompt(scientist, { summary: merged }) : '';
      usage = scientist ? usageFraction(model, systemPrompt, session.messages) : 0;
    }
    sendJson(res, 200, { ok: true, changed: true, summary: merged, summaryCount, usage });
  } catch (err) {
    sendJson(res, 500, { error: String(err && err.message || err) });
  }
}

// Topic-aware follow-up suggestions for the single chat. Reads the running
// session (or replayed history when the session was lost) and proposes a few
// questions the user might ask next. This is an ISOLATED generation: it never
// appends to the session, so neither the act of suggesting nor the unclicked
// options consume the conversation's context window.
async function handleFollowups(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const lang = normalizeLang(body.lang);
  if (!config.followups.enabled) return sendJson(res, 200, { ok: true, followups: [] });

  const session = getSession(body.sessionId ? String(body.sessionId) : '');
  let history = [];
  let summary = '';
  let existing = [];
  if (session) {
    history = session.messages;
    summary = session.summary;
    existing = session.shownFollowups || [];
  } else {
    history = sanitizeHistory(body.history);
  }
  existing = mergeClientFollowups(existing, body.existingFollowups);
  if (!history.length && !summary) return sendJson(res, 200, { ok: true, followups: [] });

  const model = resolveRequestedModel(lang, typeof body.model === 'string' ? body.model : undefined);
  const followups = await generateFollowups({ model, lang, history, summary, existing });
  rememberFollowups(session, followups);
  sendJson(res, 200, { ok: true, followups });
}

// ---- multi-scientist roundtable (Science Dialogue tab) ----

// Panel memory carried into a new question: the running summary plus EVERY
// retained (question -> conclusion) pair, so a follow-up sees the whole prior
// conversation. The full turn-by-turn transcript of each past question stays
// ephemeral; only its (question, conclusion) is kept. When this grows too large
// it is summarized and restarted (see handleDiscuss), so "include everything"
// never overflows the window.
function buildDiscussionMemory(disc, lang) {
  const parts = [];
  if (disc.summary) parts.push(disc.summary);
  for (const r of disc.rounds) {
    parts.push(lang === 'zh'
      ? `問:${r.question}\n結論:${r.conclusion}`
      : `Q: ${r.question}\nConclusion: ${r.conclusion}`);
  }
  return parts.join('\n\n');
}

// Discussion analogue of context.shouldSummarize: true once the carried memory
// (+ the new question) reaches the configured fraction of the window, so we
// compress before the next roundtable instead of dropping or overflowing it.
function shouldSummarizeDiscussionMemory(model, memoryText, nextQuestion) {
  const limit = Math.max(256, model.contextTokens * config.discussion.memorySummarizeAtFraction);
  return estimateTokens(memoryText) + estimateTokens(nextQuestion) >= limit;
}

async function handleDiscuss(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const lang = normalizeLang(body.lang);
  const sessionId = body.sessionId ? String(body.sessionId) : '';
  const requestId = body.requestId ? String(body.requestId) : '';
  const rawIds = Array.isArray(body.scientistIds) ? body.scientistIds.map(String) : [];
  const replyMode = normalizeReplyMode(body.replyMode);

  // Keep only known ids, de-duplicated and capped, preserving the caller order.
  const ids = [];
  for (const id of rawIds) {
    if (getScientist(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= config.discussion.maxParticipants) break;
  }
  if (!ids.length) return sendJson(res, 400, { error: 'no valid scientists selected' });
  if (!message) return sendJson(res, 400, { error: 'empty message' });

  const model = resolveRequestedModel(lang, typeof body.model === 'string' ? body.model : undefined);
  const disc = getOrCreateDiscussion(sessionId, ids, lang);

  // Rehydrate panel memory from replayed (question -> conclusion) rounds when the
  // discussion is empty (reload / resume / restarted backend). After this,
  // disc.rounds holds the full prior conversation -- live or rehydrated alike.
  seedDiscussionIfEmpty(disc, body.rounds);

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
  registerRequest(requestId, ac);
  const emit = (type, data) => sse(res, type, data);

  try {
    // Optional Wikipedia/KB retrieval, same reply-mode semantics as the single
    // chat: 'direct' skips it, 'rag' forces it, unset keeps the legacy gating.
    // Retrieved once for the question and shared by every panelist + the
    // conclusion, rather than once per speaker.
    const wikiResult = replyMode === 'direct'
      ? { context: '', sources: [] }
      : await retrieveContext(message, lang, { force: replyMode === 'rag', signal: ac.signal });

    // No usage here: runDiscussion reports the real starting usage from the
    // carried memory below, so a continued discussion isn't shown as 0%.
    emit('meta', {
      sessionId: disc.id, model: model.name, lang: model.lang, speakers,
      replyMode: replyMode || (config.wiki.enabled ? 'rag' : 'direct'),
      ragUsed: !!wikiResult.context,
      sources: wikiResult.sources,
    });

    // Context management: the panel's memory carries ALL prior (question ->
    // conclusion) rounds and -- like the single chat -- is summarized and
    // restarted once it grows too large, so a long discussion keeps full
    // continuity without overflowing the window. This also compresses a large
    // rehydrated history on the first turn after a reload.
    let memory = buildDiscussionMemory(disc, lang);
    if (disc.rounds.length && shouldSummarizeDiscussionMemory(model, memory, message)) {
      emit('summary', { state: 'start', lang });
      try {
        const merged = await summarizeConversation(model, lang, flattenRounds(disc.rounds), disc.summary);
        restartDiscussionWithSummary(disc, merged);
        emit('summary', { state: 'done', summaryCount: disc.summaryCount });
      } catch (e) {
        // Don't let a summarization failure kill the panel; keep the most recent
        // rounds verbatim and carry on.
        disc.rounds = disc.rounds.slice(-config.discussion.memoryRounds);
        emit('summary', { state: 'error', error: String(e && e.message || e) });
      }
      memory = buildDiscussionMemory(disc, lang);
    }

    const result = await runDiscussion(
      { model, lang, scientists: ranked, question: message, memory, wikiContext: wikiResult.context, signal: ac.signal },
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
    unregisterRequest(requestId);
    res.end();
  }
}

async function handleDiscussStop(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const requestId = body.requestId ? String(body.requestId) : '';
  sendJson(res, 200, { ok: abortRequest(requestId) });
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

  const model = resolveRequestedModel(lang, typeof body.model === 'string' ? body.model : undefined);

  // Flatten the retained (question -> conclusion) pairs into a transcript the
  // shared summarizer understands, then fold it into the carried-over memory.
  const history = flattenRounds(disc.rounds);
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

// Topic-aware follow-up suggestions for a discussion, from its retained
// (question -> conclusion) memory (or replayed rounds when the session was lost).
// Isolated generation -- never mutates the discussion's memory.
async function handleDiscussFollowups(req, res) {
  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'bad JSON body' }); }
  const lang = normalizeLang(body.lang);
  if (!config.followups.enabled) return sendJson(res, 200, { ok: true, followups: [] });

  const disc = getDiscussion(body.sessionId ? String(body.sessionId) : '');
  let rounds = [];
  let summary = '';
  let existing = [];
  if (disc) {
    rounds = disc.rounds;
    summary = disc.summary;
    existing = disc.shownFollowups || [];
  } else {
    rounds = sanitizeRounds(body.rounds);
  }
  existing = mergeClientFollowups(existing, body.existingFollowups);
  if (!rounds.length && !summary) return sendJson(res, 200, { ok: true, followups: [] });

  const model = resolveRequestedModel(lang, typeof body.model === 'string' ? body.model : undefined);
  const followups = await generateFollowups({ model, lang, history: flattenRounds(rounds), summary, existing });
  rememberFollowups(disc, followups);
  sendJson(res, 200, { ok: true, followups });
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
    if (req.method === 'POST' && path === '/api/chat/stop') {
      return await handleChatStop(req, res);
    }
    if (req.method === 'POST' && path === '/api/session/reset') {
      return await handleReset(req, res);
    }
    if (req.method === 'POST' && path === '/api/session/summarize') {
      return await handleSummarize(req, res);
    }
    if (req.method === 'POST' && path === '/api/followups') {
      return await handleFollowups(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss') {
      return await handleDiscuss(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss/stop') {
      return await handleDiscussStop(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss/reset') {
      return await handleDiscussReset(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss/summarize') {
      return await handleDiscussSummarize(req, res);
    }
    if (req.method === 'POST' && path === '/api/discuss/followups') {
      return await handleDiscussFollowups(req, res);
    }
    // Wiki-kb routes (search/graph/contribute/etc.), merged in-process --
    // see ../wiki-kb/lib/routes.mjs. /api/health is handled above (this
    // server's own handler already folds in kbHealthPayload).
    if (await handleKbRoute(req, res, url)) return;
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
  const kb = await kbHealthPayload(kbDb);
  console.log(`  KB:      ${kb.pages} pages, ${kb.chunks} chunks (${kb.embedded} embedded), ${kb.edges} edges`);
  console.log('  Tailnet: tailscale serve --bg --https=' + config.port +
    ' http://127.0.0.1:' + config.port);
});
