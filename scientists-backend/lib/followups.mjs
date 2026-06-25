// Topic-aware follow-up question suggestions.
//
// After a turn, propose a few short questions the curious user might naturally
// ask next, drawn from what was just discussed. Like the router, this is an
// ISOLATED call: it reads the conversation but its prompt and output never enter
// the session history, so the suggestions (and the act of generating them) never
// consume the answer's context window. The clicked suggestion becomes a normal
// user turn; the unclicked ones simply vanish.

import { config } from '../config.mjs';
import { chat } from './ollama.mjs';
import { shingles, jaccard } from './text-similarity.mjs';

const WANT = 4; // aim for 3-4; we trim to this many
// Suggestions whose character-bigram similarity reaches this are "the same
// question reworded"; we drop the later one so the shown set genuinely points in
// different directions. Calibrated so rewordings (~0.4-0.8) are dropped but
// distinct angles (~0-0.1) are kept.
const DIVERSITY_MAX = 0.35;

function instruction(lang) {
  if (lang === 'zh') {
    return [
      '依據以下使用者與科學家的對話,設計 3 到 4 個使用者「接下來可能會問」的後續問題。',
      '目標:每個問題都延續剛才談到的內容,但各自探索「不同方向」',
      '(例如:更深入的原理、實際應用、歷史脈絡、反例或例外、與其他概念的關聯)。',
      '嚴格規則:',
      '- 只輸出問題本身。不要回答問題、不要預告或暗示答案內容、不要任何前言或說明。',
      '- 各題之間不可重複,也不能只是換句話說同一件事;要真的指向不同面向。',
      '- 每個問題單獨一行;不要編號、項目符號、引號或多餘文字。',
      '- 以使用者第一人稱發問的口吻,且每題都必須是真正的問句(以問號「?」結尾)。',
      '- 每題盡量簡短(20 字以內),使用繁體中文。',
    ].join('\n');
  }
  return [
    'Based on the conversation below between a user and a scientist, write 3 to 4 follow-up questions the user might ask next.',
    'Goal: each question continues from what was just discussed, but explores a DIFFERENT direction',
    '(e.g. a deeper mechanism, a real-world application, the historical context, an edge case, a link to another concept).',
    'Strict rules:',
    '- Output only the questions themselves. Do NOT answer them, preview or hint at an answer, or add any preamble or commentary.',
    '- The questions must not overlap or merely reword one another; each must point at a genuinely different angle.',
    '- One question per line; no numbering, bullets, quotes, or extra text.',
    "- Phrase each in the user's first-person voice, and make each a real question ending with a question mark.",
    '- Keep each short (under ~15 words); reply in English.',
  ].join('\n');
}

// Make sure a kept suggestion reads as a question: trim trailing punctuation and
// append the language-appropriate question mark when one is missing, so every
// chip the user sees is unmistakably a question.
function ensureQuestion(text, lang) {
  if (/[??]\s*$/.test(text)) return text.replace(/\s+$/, '');
  const stripped = text.replace(/[\s。.!！,，;；:：]+$/u, '');
  return stripped + (lang === 'zh' ? '?' : '?');
}

// Flatten recent turns (and any carried summary) into a compact transcript that
// is enough to ground good suggestions without resending the whole history.
function buildTranscript(lang, history, summary) {
  const parts = [];
  if (summary) {
    parts.push(lang === 'zh' ? `先前摘要:\n${summary}` : `Earlier summary:\n${summary}`);
  }
  const recent = (history || []).slice(-config.followups.contextTurns);
  const userTag = lang === 'zh' ? '使用者' : 'User';
  const sciTag = lang === 'zh' ? '科學家' : 'Scientist';
  for (const m of recent) {
    parts.push(`${m.role === 'user' ? userTag : sciTag}: ${m.content}`);
  }
  return parts.join('\n');
}

// Parse the model's lines into clean question strings.
function parseLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim()) // strip bullets/numbering
    .map((l) => l.replace(/^["'「“]+|["'」”]+$/g, '').trim()) // strip wrapping quotes
    .filter((l) => l.length > 1 && l.length < 120)
    .filter((l) => !/[:：]\s*$/.test(l)); // drop "Here are some questions:" style preambles
}

// Generate follow-up questions. Returns [] on any failure (the UI just shows no
// chips), so this never breaks the chat flow.
export async function generateFollowups({ model, lang, history = [], summary = '', signal }) {
  if (!history.length && !summary) return [];
  try {
    const { content } = await chat({
      model,
      messages: [
        { role: 'system', content: instruction(lang) },
        { role: 'user', content: buildTranscript(lang, history, summary) },
      ],
      optionOverrides: { temperature: 0.7, num_predict: config.followups.maxTokens },
      signal,
    });
    const lines = parseLines(content);
    // Keep questions that point in different directions: normalize each to a real
    // question, then skip any that exactly- or near-duplicate one already kept.
    const out = [];
    const keptSets = [];
    const seen = new Set();
    for (const raw of lines) {
      const q = ensureQuestion(raw, lang);
      const key = q.toLowerCase();
      if (seen.has(key)) continue; // exact duplicate
      const s = shingles(q);
      if (keptSets.some((ks) => jaccard(s, ks) >= DIVERSITY_MAX)) continue; // same question, reworded
      seen.add(key);
      keptSets.push(s);
      out.push(q);
      if (out.length >= WANT) break;
    }
    return out;
  } catch {
    return [];
  }
}
