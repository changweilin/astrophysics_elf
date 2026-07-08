// LLM-as-judge plumbing for the eval pipeline: blocking Ollama /api/generate
// calls at temperature 0, plus robust parsers for the two verdict shapes the
// metrics use (numbered yes/no lines, and a plain claim list). Shares the
// busy gate with every other LLM caller so an eval run never silently queues
// behind (or stalls) a live chat.

import { config } from '../config.mjs';
import { withBusy } from '../lib/ollama-gate.mjs';
import { resolveTranslateModel } from '../lib/translate.mjs';

export async function resolveJudgeModel() {
  return config.eval.judgeModel || resolveTranslateModel();
}
export async function resolveAnswerModel() {
  return config.eval.answerModel || resolveTranslateModel();
}

export async function generate(model, prompt, { temperature = 0, numPredict = 700, signal } = {}) {
  return withBusy(async () => {
    const res = await fetch(`${config.embed.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: config.translate.keepAlive,
        options: { temperature, num_predict: numPredict },
      }),
      signal: signal ?? AbortSignal.timeout(config.eval.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`eval generate HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    // Reasoning models may inline <think> blocks; the verdicts follow them.
    return String(data?.response ?? '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/i, '')
      .trim();
  });
}

// Parse "1: yes" / "2. NO" / "3) Yes — because ..." lines into a boolean per
// index (1-based, length n). Unparseable lines default to `false` so a lazy
// judge can only ever hurt the score, not inflate it.
export function parseYesNoLines(text, n) {
  const out = new Array(n).fill(false);
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\d+)\s*[:.)\-]\s*(yes|no|是|否)/i.exec(line);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    if (idx >= 0 && idx < n) out[idx] = /^(yes|是)$/i.test(m[2]);
  }
  return out;
}

// Parse a "one claim per line" list, dropping numbering/bullets and empties.
export function parseClaimLines(text, max = 10) {
  return String(text)
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+\s*[:.)\-]|[-*•])\s*/, '').trim())
    .filter((l) => l.length >= 8)
    .slice(0, max);
}
