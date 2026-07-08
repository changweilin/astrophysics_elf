// Thin client for an Ollama server (the local inference engine on the 3060).
//
// Only two calls are needed: a streaming chat for the live reply, and a blocking
// chat used for context summarization. We talk to /api/chat with the native
// fetch in Node 18+, so this file has zero npm dependencies.
//
// Swapping inference engines: any server exposing an Ollama-style /api/chat (or
// an OpenAI-compatible /v1/chat/completions) can be dropped in by editing the
// two functions here -- nothing else in the backend knows the wire format.

import { config } from '../config.mjs';
import { isBusy as gateIsBusy, withBusy } from '../../wiki-kb/lib/ollama-gate.mjs';
import { openDb } from '../../wiki-kb/lib/db.mjs';
import { recordTrace } from '../../wiki-kb/lib/trace.mjs';

const CHAT_URL = () => `${config.ollama.baseUrl.replace(/\/+$/, '')}/api/chat`;

// Own lazy handle to the shared kb.sqlite for call tracing (WAL mode makes a
// second writer safe). Lazy + fail-open: chat must work even if the KB file
// is unavailable.
let traceDb = null;
function getTraceDb() {
  if (traceDb === null) {
    try { traceDb = openDb(); } catch { traceDb = false; }
  }
  return traceDb || null;
}

// One trace row per Ollama round-trip. Only the last user turn is kept as
// input (the full transcript would blow the trace field cap anyway).
function traceChat(kind, { model, messages, t0, stats, error }) {
  const db = getTraceDb();
  if (!db) return;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  recordTrace(db, {
    kind,
    model: model.name,
    input: lastUser ? lastUser.content : null,
    output: stats ? stats.content : null,
    ms: Date.now() - t0,
    tokensIn: stats ? stats.promptTokens : null,
    tokensOut: stats ? stats.completionTokens : null,
    ok: !error,
    error,
    meta: stats ? { doneReason: stats.doneReason } : null,
  });
}

// Build the Ollama "options" block from resolved per-language model settings.
function buildOptions(model, overrides = {}) {
  return {
    temperature: model.temperature,
    top_p: model.topP,
    num_ctx: model.contextTokens,
    ...overrides,
  };
}

// How long Ollama keeps this model resident (and its KV cache warm) after a
// call finishes. Ollama/llama.cpp reuse a matching prompt prefix's KV cache
// on their own whenever the model is still loaded -- there is no separate
// "implicit context caching" API to opt into the way Anthropic/Gemini's
// hosted APIs offer one. Leaving keep_alive at Ollama's default (5m) means a
// multi-turn conversation with any gap between turns pays a full model
// reload (and loses the cache) far more often than it needs to; pinning it
// longer here is what actually makes prefix reuse happen turn-to-turn.
const KEEP_ALIVE = config.ollama.keepAlive;

// Some locally-run "reasoning" models (Qwen3 in thinking mode, DeepSeek-R1,
// etc.) inline their chain-of-thought as a <think>...</think> block ahead of
// the actual answer instead of using Ollama's separate `message.thinking`
// field. The isolated blocking calls (follow-ups, summaries, routing,
// moderation) only want the final answer -- left unstripped, the reasoning
// prose breaks line-based parsing downstream (e.g. every "follow-up question"
// line parses as reasoning text instead), which is why suggestions like the
// follow-up chips silently come back empty for some models but not others.
function stripThinking(text) {
  let out = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  // A generation cut off mid-thought (e.g. by num_predict) leaves an unclosed
  // tag; drop everything from there on rather than surfacing a stray fragment.
  out = out.replace(/<think>[\s\S]*$/i, '');
  return out.trim();
}

// Whether an Ollama call (from this backend's chat, OR a wiki-kb write like
// translate/generate/embed -- see ../../wiki-kb/lib/ollama-gate.mjs) is
// currently in flight, so the health endpoint can report the backend as busy
// while it can't take on a new generation right away -- e.g. Ollama
// serializing a second device's request behind one already running, or
// swapping the loaded model.
export function isBusy() {
  return gateIsBusy();
}

// Streaming chat. Invokes onToken(textChunk) for every delta and resolves with
// final stats from Ollama (prompt_eval_count = real prompt tokens, eval_count =
// generated tokens, done_reason = 'stop' when the model finished its thought or
// 'length' when it was cut off at num_predict). Honors an AbortSignal so the
// HTTP handler can cancel.
export async function chatStream({ model, messages, signal, optionOverrides }, onToken) {
  const timeout = AbortSignal.timeout(config.ollama.requestTimeoutMs);
  const composite = signal ? anySignal([signal, timeout]) : timeout;

  const t0 = Date.now();
  return withBusy(async () => {
    const res = await fetch(CHAT_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.name,
        messages,
        stream: true,
        keep_alive: KEEP_ALIVE,
        // Same reasoning as chat() below: a model that natively supports
        // Ollama's thinking toggle streams its chain-of-thought through the
        // SEPARATE message.thinking field while message.content -- the only
        // field this function reads -- stays empty for the whole turn. Left
        // on, that turn's bubble never receives a single token even though
        // Ollama is visibly busy generating: the reported "LLM is running but
        // the reply never appears" symptom. Ignored (safely) by models that
        // don't support the toggle.
        think: false,
        options: buildOptions(model, optionOverrides),
      }),
      signal: composite,
    });

    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      throw new Error(`Ollama chat failed (${res.status}): ${detail}`);
    }

    let full = '';
    let stats = { promptTokens: 0, completionTokens: 0, doneReason: 'stop' };

    await readNdjson(res.body, (obj) => {
      if (obj.message && typeof obj.message.content === 'string' && obj.message.content) {
        full += obj.message.content;
        onToken(obj.message.content);
      }
      if (obj.done) {
        stats = {
          promptTokens: obj.prompt_eval_count || 0,
          completionTokens: obj.eval_count || 0,
          doneReason: obj.done_reason || 'stop',
        };
      }
    });

    return { content: full, ...stats };
  }).then((r) => {
    traceChat('chat-stream', { model, messages, t0, stats: r });
    return r;
  }, (e) => {
    traceChat('chat-stream', { model, messages, t0, error: e && e.message || e });
    throw e;
  });
}

// Blocking chat used for summarization, routing, follow-up suggestions, and
// discussion moderator/conclusion (no streaming needed). Honors an optional
// AbortSignal alongside the timeout.
export async function chat({ model, messages, optionOverrides, signal }) {
  const timeout = AbortSignal.timeout(config.ollama.requestTimeoutMs);
  const composite = signal ? anySignal([signal, timeout]) : timeout;
  const t0 = Date.now();
  return withBusy(async () => {
    const res = await fetch(CHAT_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.name,
        messages,
        stream: false,
        keep_alive: KEEP_ALIVE,
        // These are short, structured, single-shot asks (pick a name, list a
        // few questions, summarize a transcript) that never need a visible
        // chain-of-thought. Left on, a "thinking" model (e.g. the Qwen3-based
        // Qwythos persona model in our own fallback list) spends the whole
        // num_predict budget -- often just a few dozen to a couple hundred
        // tokens for a call like the router or follow-ups -- inside its
        // <think> block, and the real answer never gets generated, so that
        // model silently produces nothing (e.g. zero follow-up chips). Ollama
        // ignores this field for models that don't support thinking control,
        // so it's safe to send unconditionally. Note some reasoning builds
        // (raw DeepSeek-R1 in particular) don't implement this toggle at all
        // and always think regardless -- attemptTokenBudget() in
        // followups.mjs is the mitigation for that harder case.
        think: false,
        options: buildOptions(model, optionOverrides),
      }),
      signal: composite,
    });
    if (!res.ok) throw new Error(`Ollama chat failed (${res.status}): ${await safeText(res)}`);
    const data = await res.json();
    return {
      content: stripThinking((data.message && data.message.content) || ''),
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
    };
  }).then((r) => {
    traceChat('chat-blocking', { model, messages, t0, stats: r });
    return r;
  }, (e) => {
    traceChat('chat-blocking', { model, messages, t0, error: e && e.message || e });
    throw e;
  });
}

// Liveness/diagnostic probe for the health endpoint.
export async function ping() {
  try {
    const res = await fetch(`${config.ollama.baseUrl.replace(/\/+$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

// --- helpers ---

// Read an NDJSON body line by line, parsing each complete line as JSON.
async function readNdjson(body, onObject) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      onObject(obj);
    }
  }
  const tail = buf.trim();
  if (tail) {
    try { onObject(JSON.parse(tail)); } catch { /* ignore partial tail */ }
  }
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 500); } catch { return '<no body>'; }
}

// Minimal AbortSignal.any polyfill (older Node 18 lacks it).
function anySignal(signals) {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const ctrl = new AbortController();
  const onAbort = (s) => () => ctrl.abort(s.reason);
  for (const s of signals) {
    if (s.aborted) { ctrl.abort(s.reason); break; }
    s.addEventListener('abort', onAbort(s), { once: true });
  }
  return ctrl.signal;
}
