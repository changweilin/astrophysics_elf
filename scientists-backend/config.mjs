// Central configuration for the Scientists backend.
//
// Everything is environment-driven so the same code runs on the local 3060 box
// and is reachable from a phone over Tailscale without edits. Nothing here
// imports frontend code -- the only contract with the browser is the REST/SSE
// API in server.mjs.

function envStr(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function envNum(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function envBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}
function envList(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  // --- HTTP server (bind to loopback; Tailscale terminates HTTPS, see README) ---
  host: envStr('SCI_HOST', '127.0.0.1'),
  port: envNum('SCI_PORT', 5188),

  // CORS: the static frontend is usually served from a different origin/port
  // (serve.mjs on :5184, or a Tailnet hostname). Allow it to call this API.
  // '*' echoes the request Origin; otherwise list exact origins.
  corsOrigins: envList('SCI_CORS_ORIGINS', ['*']),

  // --- Inference backend (Ollama by default; OpenAI-compatible servers work too) ---
  //
  // One model per UI language: the frontend sends `lang` ('zh' | 'en') with each
  // request and the backend serves it with that language's strongest 3060-sized
  // model. Switching language in the UI therefore switches the model.
  ollama: {
    baseUrl: envStr('SCI_OLLAMA_URL', 'http://127.0.0.1:11434'),
    defaultLang: envStr('SCI_DEFAULT_LANG', 'zh'),
    // Shared sampling. Physics answers want low-ish temperature for accuracy but
    // enough warmth to keep the persona voice.
    temperature: envNum('SCI_TEMPERATURE', 0.6),
    topP: envNum('SCI_TOP_P', 0.9),
    // Request timeout for a single generation (ms). Generous for slow 3060 runs.
    requestTimeoutMs: envNum('SCI_REQUEST_TIMEOUT_MS', 300000),
    // Per-language models. `contextTokens` should match the num_ctx you serve;
    // on a 3060 the KV cache is the real budget, so 8192 is a safe default.
    models: {
      // Strongest Taiwan-localized Traditional-Chinese model that fits a 3060
      // (tops the Open TW LLM Leaderboard among 8B Taiwan tunes). Alternatives:
      // MediaTek Breeze-2 (`...breeze...`), Qwen3 (`qwen3:8b`) for harder STEM.
      zh: {
        name: envStr('SCI_MODEL_ZH', 'jcai/llama-3-taiwan-8b-instruct'),
        summaryModel: envStr('SCI_SUMMARY_MODEL_ZH', ''),
        contextTokens: envNum('SCI_CONTEXT_TOKENS_ZH', envNum('SCI_CONTEXT_TOKENS', 8192)),
      },
      // Strongest English STEM model at this tier: Phi-4 (14B) leads on math/
      // reasoning. Tight on 12GB -- if VRAM is short, set SCI_MODEL_EN=qwen3:8b
      // or lower SCI_CONTEXT_TOKENS_EN. Alternative for quality: qwen3:14b.
      en: {
        name: envStr('SCI_MODEL_EN', 'phi4'),
        summaryModel: envStr('SCI_SUMMARY_MODEL_EN', ''),
        contextTokens: envNum('SCI_CONTEXT_TOKENS_EN', envNum('SCI_CONTEXT_TOKENS', 8192)),
      },
    },
    // If a preferred model above isn't pulled yet, fall back (in order) to the
    // best already-installed model so the page works immediately. Once you
    // `ollama pull` a preferred model it is used automatically -- no config edit.
    // Order = strongest-first; reasoning models that emit <think> tags are left
    // out on purpose.
    modelFallbacks: {
      zh: envList('SCI_FALLBACKS_ZH', ['qwen3:8b', 'qwen2.5:7b', 'qwen2.5', 'breeze', 'gemma2', 'llama3']),
      en: envList('SCI_FALLBACKS_EN', ['qwen3:14b', 'qwen3:8b', 'phi4-mini', 'llama3.1', 'llama3', 'qwen2.5:7b']),
    },
  },

  // --- Context-window management (window size is per-language; see ollama.models) ---
  context: {
    // When the running estimate reaches this fraction of the window, summarize
    // the conversation and restart with the summary as seed memory.
    summarizeAtFraction: envNum('SCI_SUMMARIZE_AT', 0.7),
    // Reserve this many tokens for the model's reply so we summarize before the
    // prompt actually overflows.
    replyReserveTokens: envNum('SCI_REPLY_RESERVE', 1024),
    // Heuristic chars-per-token when the inference server hasn't reported a real
    // token count yet. Mixed CJK/English sits around 2.5-3.
    charsPerToken: envNum('SCI_CHARS_PER_TOKEN', 2.8),
    // When a thread is resumed (page reload / saved-thread / restarted backend),
    // the client replays its visible history so the backend can rebuild context.
    // Cap how many turns we seed; the summarizer compresses if it is still large.
    rehydrateMaxMessages: envNum('SCI_REHYDRATE_MAX_MESSAGES', 80),
  },

  // --- Multi-scientist roundtable (Science Dialogue tab; see lib/discussion.mjs) ---
  discussion: {
    // One "round" = every participant speaks once. The panel keeps going until
    // it resolves, runs out of context budget, or hits this many rounds.
    maxRounds: envNum('SCI_DISCUSS_MAX_ROUNDS', 3),
    // Stop and move to the conclusion once the running transcript reaches this
    // fraction of the model's window (the user-facing "touch 50% of context").
    stopFraction: envNum('SCI_DISCUSS_STOP_AT', 0.5),
    // After each completed round, ask a neutral moderator whether the question
    // is fully answered; if so, conclude early. Set false to always run rounds.
    moderator: envBool('SCI_DISCUSS_MODERATOR', true),
    // The panel carries ALL retained (question -> conclusion) rounds as memory;
    // once that memory reaches this fraction of the window it is summarized and
    // restarted (mirrors the single chat). Keep it below stopFraction so the
    // live roundtable still has room to happen after the memory is loaded.
    memorySummarizeAtFraction: envNum('SCI_DISCUSS_MEMORY_SUMMARIZE_AT', 0.35),
    // Fallback only: if that summarization fails, keep at most this many of the
    // most recent rounds verbatim instead of dropping the whole history.
    memoryRounds: envNum('SCI_DISCUSS_MEMORY_ROUNDS', 2),
    // Hard ceiling on participants per discussion (keeps turns/latency bounded).
    maxParticipants: envNum('SCI_DISCUSS_MAX_PARTICIPANTS', 5),
    // Reply length budgets: short for back-and-forth turns, longer for the wrap.
    turnTokens: envNum('SCI_DISCUSS_TURN_TOKENS', 420),
    conclusionTokens: envNum('SCI_DISCUSS_CONCLUSION_TOKENS', 900),
    // If a turn/conclusion stops only because it hit its num_predict cap (rather
    // than finishing), continue generation up to this many extra passes so a
    // reply is never shown cut off mid-sentence. 0 disables continuation.
    maxContinuations: envNum('SCI_DISCUSS_MAX_CONTINUATIONS', 2),
    // Two turns whose character-bigram Jaccard similarity reaches this are
    // treated as saying the same thing; a whole round of such turns ends the
    // panel early (the lead still delivers the conclusion). Range 0..1;
    // calibrated so clear restatements (~0.55-0.7) trip it but turns that add a
    // new point (~0-0.15) do not.
    repeatThreshold: envNum('SCI_DISCUSS_REPEAT_THRESHOLD', 0.45),
  },

  // --- Single-chat helpers (auto-assign routing + follow-up suggestions) ---
  followups: {
    // After a turn, propose this many on-topic follow-up questions (the model is
    // asked for 3-4; the client shows whatever comes back). Set 0 to disable.
    enabled: envBool('SCI_FOLLOWUPS', true),
    // How many of the most recent turns to feed the suggestion generator.
    contextTurns: envNum('SCI_FOLLOWUPS_CONTEXT_TURNS', 6),
    // Generation length budget (short list of short questions).
    maxTokens: envNum('SCI_FOLLOWUPS_TOKENS', 256),
  },

  // --- Knowledge augmentation (Wikipedia RAG; see knowledge/wiki.mjs) ---
  wiki: {
    enabled: envBool('SCI_WIKI_RAG', false),
    // 'zh' uses zh.wikipedia.org (served as Traditional via the variant header).
    lang: envStr('SCI_WIKI_LANG', 'zh'),
    // Traditional-Chinese variant for zh.wikipedia content negotiation.
    zhVariant: envStr('SCI_WIKI_ZH_VARIANT', 'zh-tw'),
    maxChars: envNum('SCI_WIKI_MAX_CHARS', 1500),
    timeoutMs: envNum('SCI_WIKI_TIMEOUT_MS', 8000),
  },

  // Soft cap on concurrently retained sessions (oldest evicted). Sessions are
  // in-memory only; restart the process to clear everything.
  maxSessions: envNum('SCI_MAX_SESSIONS', 200),
};

// Normalize an arbitrary language tag to a supported model key.
export function normalizeLang(lang) {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('en')) return 'en';
  if (l.startsWith('zh') || l.startsWith('cmn') || l === 'tw') return 'zh';
  return config.ollama.defaultLang in config.ollama.models
    ? config.ollama.defaultLang
    : 'zh';
}

// Resolve the inference settings (model name, summary model, context size) for a
// given UI language. This is the single switch point that makes language ->
// model selection happen.
export function resolveModel(lang) {
  const key = normalizeLang(lang);
  const m = config.ollama.models[key] || config.ollama.models[config.ollama.defaultLang];
  return {
    lang: key,
    name: m.name,
    summaryModel: m.summaryModel || m.name,
    contextTokens: m.contextTokens,
    temperature: config.ollama.temperature,
    topP: config.ollama.topP,
  };
}

export default config;
