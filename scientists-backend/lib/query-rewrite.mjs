// History-aware query rewrite for retrieval (RET1).
//
// retrieveContext (knowledge/wiki.mjs) sees only the bare last user turn, so a
// conversational follow-up -- "why?", "and its temperature?", "那中子星呢?" --
// retrieves on a dangling pronoun exactly when grounding matters most. This
// rewrites such a turn into a standalone search query from the recent history,
// mirroring the isolated-call pattern in router.mjs: one cheap, deterministic
// Ollama call, fail-open to the raw message, and -- crucially -- invoked only
// when a cheap heuristic says the turn actually needs it, so a self-contained
// question never pays for an extra generation on the single local GPU.

import { chat } from './ollama.mjs';

const HAS_CJK = /[㐀-鿿豈-﫿]/;

// High-precision markers a follow-up leans on prior context with. Pronouns/
// deixis are matched anywhere; opener connectives only at the START, so a normal
// question that merely CONTAINS "and"/"that" mid-sentence isn't flagged. A false
// positive only costs a wasted rewrite call (the LLM returns a self-contained
// question ~unchanged), but we still keep it rare for the single-GPU budget.
const EN_PRONOUN = /\b(it|its|it's|they|them|their|he|she|his|her|him|the same|the other|the former|the latter|which one|that one)\b/i;
const EN_OPENER = /^\s*(why|why not|how come|what about|and|but|so|then|also|elaborate|explain|continue|go on|more|tell me more)\b/i;
const ZH_PRONOUN = /(它|牠|他|她|其|該|前者|後者)/;
const ZH_OPENER = /^\s*(為什麼|為何|怎麼|怎樣|如何|然後|還有|所以|接著|再|又|也|更|繼續|詳細|多說|那它|那他|那這)/;

// Cheap gate: only rewrite when there is history to resolve against AND the turn
// carries a pronoun/opener or is a bare elliptical fragment. A self-contained
// question skips the LLM call entirely.
export function needsRewrite(message, history) {
  const msg = String(message || '').trim();
  if (!msg || !Array.isArray(history) || !history.length) return false;
  const cjk = HAS_CJK.test(msg);
  // Very short = a bare elliptical follow-up ("the temperature?", "更多?").
  // Kept tight so ordinary short questions ("What is a magnetar?") don't trip it.
  const short = cjk ? msg.length <= 4 : msg.replace(/\s+/g, ' ').split(' ').length <= 3;
  const dependent = cjk
    ? ZH_PRONOUN.test(msg) || ZH_OPENER.test(msg)
    : EN_PRONOUN.test(msg) || EN_OPENER.test(msg);
  return short || dependent;
}

function rewritePrompt(lang) {
  if (lang === 'zh') {
    return '你是檢索查詢改寫助手。根據對話紀錄,把使用者「最新的一句」改寫成一則可獨立檢索的完整查詢,'
      + '補齊代名詞與省略的主詞(例如「為什麼?」→「為什麼黑洞附近的光無法逃離?」)。'
      + '只輸出改寫後的查詢,使用繁體中文,不要任何解釋、引號或前綴。若原句已可獨立檢索,原樣輸出。';
  }
  return 'You rewrite the user\'s LATEST message into a single self-contained search query, resolving pronouns and '
    + 'omitted subjects from the conversation (e.g. "why?" -> "why can\'t light escape a black hole?"). '
    + 'Output ONLY the rewritten query -- no explanation, quotes, or prefix. If it is already self-contained, output it unchanged.';
}

// Last few turns as a compact transcript for the rewriter.
function recentTranscript(history, maxTurns = 6) {
  return history.slice(-maxTurns)
    .map((m) => `${m.role === 'user' ? 'User' : 'Scientist'}: ${m.content}`)
    .join('\n');
}

// Strip wrapping quotes / "Query:" style prefixes a model sometimes adds, and
// reject a rewrite that ballooned or collapsed (untrustworthy -> use the raw).
function cleanup(raw, fallback) {
  let s = String(raw || '').trim();
  if (!s) return fallback;
  s = s.replace(/^["'`「『]+|["'`」』]+$/g, '').trim();
  s = s.replace(/^(query|search|搜尋|查詢|改寫後的查詢)\s*[:：]\s*/i, '').trim();
  if (!s || s.length > fallback.length + 200) return fallback;
  return s;
}

// Return a standalone retrieval query for `message`. Never throws; falls back to
// the raw message on heuristic-skip, empty history, timeout, or any error.
export async function standaloneQuery({ message, history = [], summary = '', lang, model, signal }) {
  const msg = String(message || '').trim();
  if (!needsRewrite(msg, history)) return { query: msg, rewritten: false, reason: 'self-contained' };
  try {
    const parts = [];
    if (summary) parts.push(`Summary of earlier discussion:\n${summary}`);
    parts.push(`Conversation:\n${recentTranscript(history)}`);
    parts.push(`Latest message: ${msg}`);
    const { content } = await chat({
      model,
      messages: [
        { role: 'system', content: rewritePrompt(lang) },
        { role: 'user', content: parts.join('\n\n') },
      ],
      optionOverrides: { temperature: 0, num_predict: 64 },
      signal,
    });
    const query = cleanup(content, msg);
    return { query, rewritten: query !== msg, reason: query !== msg ? 'llm' : 'unchanged' };
  } catch {
    return { query: msg, rewritten: false, reason: 'error' };
  }
}
