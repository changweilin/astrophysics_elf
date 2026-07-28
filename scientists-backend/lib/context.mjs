// Context-window management: estimate token usage and, when a conversation
// reaches the configured fraction of the model's window (default 70%), compress
// the dialogue into a compact "memory" and restart with that memory as seed.
//
// This is what keeps long tutoring sessions from overflowing the small KV cache
// available on a 3060, while preserving continuity.

import { config } from '../config.mjs';
import { chat } from './ollama.mjs';

// CJK ideographs, kana and hangul tokenize at roughly one token per character
// (~1.5-1.8 chars/token), whereas latin script runs ~4 chars/token. A single
// blended divisor therefore badly mis-estimates either extreme; bucketing by
// script (ORCH2) tracks mixed CJK/English text far more closely and self-
// adjusts to the actual mix instead of assuming one.
function isCjkCodePoint(cp) {
  return (
    (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana + Katakana
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0x20000 && cp <= 0x2ebef)  // CJK Unified Ext B-F
  );
}

// Script-aware token estimate (heuristic fallback used when the inference
// server has not reported a real prompt_eval_count; see shouldSummarize).
export function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (isCjkCodePoint(ch.codePointAt(0))) cjk++;
    else other++;
  }
  return Math.ceil(cjk / config.context.cjkCharsPerToken + other / config.context.charsPerToken);
}

export function estimateMessagesTokens(messages) {
  // +4 tokens/message for role tags and chat-template overhead.
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

// Projected prompt size for the next request = system prompt + history + the new
// user turn we are about to send.
export function projectedPromptTokens(systemPrompt, history, nextUser) {
  return estimateTokens(systemPrompt)
    + estimateMessagesTokens(history)
    + estimateTokens(nextUser) + 4;
}

// True when sending `nextUser` would push the prompt past the summarize line.
// The line sits at (window * fraction) minus the reply reservation, so we act
// before the prompt+reply can actually overflow the window.
//
// `lastPromptTokens` is Ollama's real prompt_eval_count from the previous turn
// (0 when unmeasured -- first turn, or just after a summary restart). When we
// have it, anchor to it (ORCH2): it already counted system+history+prevUser
// exactly, and the only thing appended since is the previous assistant reply,
// so the real next prompt is essentially that measurement plus the last reply
// plus this new user turn. Taking the max of the char-estimate and this
// real-count anchor means the estimate can never silently drift below reality
// (the goal is: no prompt exceeds num_ctx), which the old char-only path did
// for Traditional Chinese.
export function shouldSummarize(model, systemPromptNoSummary, history, nextUser, lastPromptTokens = 0) {
  const window = model.contextTokens;
  const limit = Math.max(
    256,
    window * config.context.summarizeAtFraction - config.context.replyReserveTokens,
  );
  const estimate = projectedPromptTokens(systemPromptNoSummary, history, nextUser);
  let anchored = 0;
  if (lastPromptTokens > 0) {
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
    anchored = lastPromptTokens
      + (lastAssistant ? estimateTokens(lastAssistant.content) + 4 : 0)
      + estimateTokens(nextUser) + 4;
  }
  return Math.max(estimate, anchored) >= limit;
}

// Fraction of the window currently in use (for telemetry shown in the UI).
export function usageFraction(model, systemPrompt, history) {
  return Math.min(
    1,
    (estimateTokens(systemPrompt) + estimateMessagesTokens(history)) / model.contextTokens,
  );
}

function summaryInstruction(lang, priorSummary) {
  if (lang === 'zh') {
    return [
      '請將以下師生對話濃縮成精簡的「記憶摘要」,供稍後延續對話使用。',
      '保留:使用者的學習目標與背景、已建立的物理/數學結論、定義過的符號與假設、尚未解決的問題。',
      '捨棄:寒暄與重複內容。以條列式繁體中文輸出,控制在 250 字以內。',
      priorSummary ? `先前已有的摘要(請整合,不要遺漏):\n${priorSummary}` : '',
    ].filter(Boolean).join('\n');
  }
  return [
    'Condense the following tutor-student conversation into a concise "memory summary" to continue the dialogue later.',
    'Keep: the user\'s goals and background, established physics/math conclusions, defined symbols and assumptions, and open questions.',
    'Drop: pleasantries and repetition. Output as English bullet points, under 200 words.',
    priorSummary ? `Existing summary to merge (do not lose its content):\n${priorSummary}` : '',
  ].filter(Boolean).join('\n');
}

// Summarize the running dialogue into a memory string. Uses the per-language
// summary model (falls back to the main model). Returns the merged summary text.
export async function summarizeConversation(model, lang, history, priorSummary = '') {
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Scientist'}: ${m.content}`)
    .join('\n');

  const summaryModel = { ...model, name: model.summaryModel };
  const { content } = await chat({
    model: summaryModel,
    messages: [
      { role: 'system', content: summaryInstruction(lang, priorSummary) },
      { role: 'user', content: transcript },
    ],
    // Summaries want to be deterministic and short.
    optionOverrides: { temperature: 0.2, num_predict: 512 },
  });
  return content.trim();
}
