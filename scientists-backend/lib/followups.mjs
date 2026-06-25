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

const WANT = 4; // aim for 3-4; we trim to this many

function instruction(lang) {
  if (lang === 'zh') {
    return [
      '依據以下使用者與科學家的對話,設計 3 到 4 個使用者「接下來可能會問」的後續問題,',
      '用來延伸或深入剛才談到的主題。',
      '規則:每個問題單獨一行;不要編號、項目符號或任何多餘文字;',
      '以使用者第一人稱發問的口吻;每題盡量簡短(20 字以內);使用繁體中文。',
    ].join('\n');
  }
  return [
    'Based on the conversation below between a user and a scientist, propose 3 to 4 natural follow-up',
    'questions the user might ask next to go deeper or sideways into what was just discussed.',
    'Rules: one question per line; no numbering, bullets, or extra text; phrased as the user asking;',
    'keep each short (under ~15 words); reply in English.',
  ].join('\n');
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
    .filter((l) => l.length > 1 && l.length < 120);
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
    // De-duplicate while preserving order, then cap.
    const seen = new Set();
    const out = [];
    for (const q of lines) {
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= WANT) break;
    }
    return out;
  } catch {
    return [];
  }
}
