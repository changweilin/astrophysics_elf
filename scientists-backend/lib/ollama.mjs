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

const CHAT_URL = () => `${config.ollama.baseUrl.replace(/\/+$/, '')}/api/chat`;

// Build the Ollama "options" block from resolved per-language model settings.
function buildOptions(model, overrides = {}) {
  return {
    temperature: model.temperature,
    top_p: model.topP,
    num_ctx: model.contextTokens,
    ...overrides,
  };
}

// Streaming chat. Invokes onToken(textChunk) for every delta and resolves with
// final stats from Ollama (prompt_eval_count = real prompt tokens, eval_count =
// generated tokens, done_reason = 'stop' when the model finished its thought or
// 'length' when it was cut off at num_predict). Honors an AbortSignal so the
// HTTP handler can cancel.
export async function chatStream({ model, messages, signal, optionOverrides }, onToken) {
  const timeout = AbortSignal.timeout(config.ollama.requestTimeoutMs);
  const composite = signal ? anySignal([signal, timeout]) : timeout;

  const res = await fetch(CHAT_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.name,
      messages,
      stream: true,
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
}

// Blocking chat used for summarization + discussion moderator/conclusion (no
// streaming needed). Honors an optional AbortSignal alongside the timeout.
export async function chat({ model, messages, optionOverrides, signal }) {
  const timeout = AbortSignal.timeout(config.ollama.requestTimeoutMs);
  const composite = signal ? anySignal([signal, timeout]) : timeout;
  const res = await fetch(CHAT_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.name,
      messages,
      stream: false,
      options: buildOptions(model, optionOverrides),
    }),
    signal: composite,
  });
  if (!res.ok) throw new Error(`Ollama chat failed (${res.status}): ${await safeText(res)}`);
  const data = await res.json();
  return {
    content: (data.message && data.message.content) || '',
    promptTokens: data.prompt_eval_count || 0,
    completionTokens: data.eval_count || 0,
  };
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
