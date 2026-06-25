// Expert routing for the single-chat "auto-assign" mode.
//
// Given a question, pick the ONE scientist best suited to answer it by domain.
// An LLM does the assignment (the user asked for the model to choose by field),
// with the keyword expertise ranking as a deterministic fallback when the model
// is unsure, unreachable, or returns something unrecognizable.
//
// Crucially, this is an ISOLATED call: its prompt and output never enter the
// chat session's message history, so the routing reasoning does not pollute the
// context window of the answer that follows.

import { chat } from './ollama.mjs';
import { SCIENTISTS, getScientist, rankScientists, nameOf } from '../personas/scientists.mjs';

// Compact "id: name -- fields" roster the router model chooses from.
function rosterLines(lang) {
  return SCIENTISTS.map((s) => {
    const fields = (s.fields && (s.fields[lang] || s.fields.en)) || '';
    return `${s.id}: ${nameOf(s, lang)} -- ${fields}`;
  }).join('\n');
}

function routingPrompt(lang) {
  if (lang === 'zh') {
    return '你是一個學科分流助手。根據使用者的問題,從下列科學家名單中,挑出「最適合」回答這個問題的那一位'
      + '(依專業領域判斷)。只回覆該科學家的 id(例如 einstein),不要任何其他文字、標點或解釋。';
  }
  return 'You are a subject-routing assistant. From the scientist roster below, choose the ONE best suited to '
    + "answer the user's question, judged by domain expertise. Reply with ONLY that scientist's id "
    + '(e.g. einstein) -- no other words, punctuation, or explanation.';
}

// Find the first known scientist id mentioned anywhere in the model's reply.
function extractId(raw) {
  const text = String(raw || '').toLowerCase();
  let best = null;
  let bestAt = Infinity;
  for (const s of SCIENTISTS) {
    const at = text.indexOf(s.id);
    if (at >= 0 && at < bestAt) { best = s.id; bestAt = at; }
  }
  return best;
}

// Resolve the answering scientist for a question in auto mode. Returns a
// scientist object plus how it was chosen ('llm' | 'keywords'). Never throws --
// always lands on a valid persona so the chat can proceed.
export async function assignScientist({ model, lang, message, signal }) {
  // Deterministic baseline from topic keywords (also the fallback below).
  const ranked = rankScientists(message);
  const keywordPick = (ranked[0] && ranked[0].scientist) || SCIENTISTS[0];
  const keywordHasSignal = (ranked[0] && ranked[0].score) > 0;

  try {
    const { content } = await chat({
      model,
      messages: [
        { role: 'system', content: `${routingPrompt(lang)}\n\n${rosterLines(lang)}` },
        { role: 'user', content: message },
      ],
      // Deterministic, just need an id token.
      optionOverrides: { temperature: 0, num_predict: 12 },
      signal,
    });
    const id = extractId(content);
    const sci = id ? getScientist(id) : null;
    if (sci) return { scientist: sci, via: 'llm' };
  } catch {
    // fall through to the keyword pick
  }

  // If the model gave nothing usable, prefer the keyword pick when it actually
  // matched something; otherwise it is still a sane default (first persona).
  return { scientist: keywordPick, via: keywordHasSignal ? 'keywords' : 'default' };
}
