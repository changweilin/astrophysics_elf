// Context-window management: estimate token usage and, when a conversation
// reaches the configured fraction of the model's window (default 70%), compress
// the dialogue into a compact "memory" and restart with that memory as seed.
//
// This is what keeps long tutoring sessions from overflowing the small KV cache
// available on a 3060, while preserving continuity.

import { config } from '../config.mjs';
import { chat } from './ollama.mjs';

// Rough token estimate. Mixed CJK/English averages ~2.5-3 chars/token; the
// divisor is configurable. Good enough to trigger summarization safely early.
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / config.context.charsPerToken);
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
export function shouldSummarize(model, systemPromptNoSummary, history, nextUser) {
  const window = model.contextTokens;
  const limit = Math.max(
    256,
    window * config.context.summarizeAtFraction - config.context.replyReserveTokens,
  );
  return projectedPromptTokens(systemPromptNoSummary, history, nextUser) >= limit;
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
