// LLM translation of a corpus page into a language the knowledge base does not
// yet cover, via the same local Ollama server used for embeddings. The result
// is returned as a preview only — the caller (browser UI) decides whether to
// commit it with POST /api/contribute, so nothing lands in the KB untouched.

import { config } from '../config.mjs';

const LANG_NAMES = {
  en: 'English',
  zh: 'Traditional Chinese (Taiwan)',
  ja: 'Japanese',
  ko: 'Korean',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
};

// Pick the chat model: explicit config wins; otherwise the first installed tag
// that is not an embedding model. Cached per process (Ollama tags are stable).
let cachedModel = null;
export async function resolveTranslateModel() {
  if (config.translate.model) return config.translate.model;
  if (cachedModel) return cachedModel;
  const res = await fetch(`${config.embed.baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`ollama tags HTTP ${res.status}`);
  const data = await res.json();
  const names = (data?.models ?? [])
    .map((m) => String(m.name || m.model || ''))
    .filter((n) => n && !/bge|embed|minilm/i.test(n));
  if (!names.length) throw new Error('no chat model installed in Ollama');
  // Prefer an instruction-tuned general model when one is present.
  cachedModel = names.find((n) => /taiwan|qwen|phi|llama|gemma|mistral/i.test(n)) || names[0];
  return cachedModel;
}

function parseSections(text) {
  const m = /TITLE:\s*([\s\S]*?)\nSUMMARY:\s*([\s\S]*?)\nCONTENT:\s*([\s\S]*)/.exec(text);
  if (!m) return null;
  return { title: m[1].trim(), summary: m[2].trim(), content: m[3].trim() };
}

// Translate one page. `page` is a row from the pages table; `target` is a
// corpus language code. Long articles are truncated — the goal is a readable
// knowledge-graph card plus RAG-retrievable text, not a full mirror.
export async function translatePage(page, target, { maxChars = 3500 } = {}) {
  const targetName = LANG_NAMES[target];
  if (!targetName) throw new Error(`unsupported target language: ${target}`);
  const model = await resolveTranslateModel();

  const srcContent = String(page.content || page.summary || '').trim().slice(0, maxChars);
  const srcSummary = String(page.summary || '').trim().slice(0, 1200);
  const prompt = [
    `You are a careful scientific translator. Translate the article below from its original language into ${targetName}.`,
    'Rules:',
    `- Output ONLY the translation, in exactly this format (keep the three uppercase markers):`,
    'TITLE: <translated title>',
    'SUMMARY: <translated summary>',
    'CONTENT: <translated content>',
    '- Keep physics/math notation, symbols, formulas, units and proper nouns like "Kerr-Newman" unchanged.',
    '- Do not add commentary, notes, or text in any other language.',
    '',
    `TITLE: ${page.title}`,
    `SUMMARY: ${srcSummary || '(none)'}`,
    `CONTENT: ${srcContent}`,
  ].join('\n');

  const res = await fetch(`${config.embed.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 2048 },
    }),
    signal: AbortSignal.timeout(config.translate.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`translate HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = String(data?.response ?? '').trim();
  if (!raw) throw new Error('translate: empty model response');

  const parsed = parseSections(raw) || {
    title: page.title,
    summary: '',
    content: raw,
  };
  if (!parsed.content) parsed.content = parsed.summary || raw;
  if (!parsed.summary) parsed.summary = parsed.content.slice(0, 400);
  return {
    model,
    target,
    sourcePageId: page.id,
    sourceLang: page.lang,
    qid: page.qid || null,
    kind: page.kind,
    title: parsed.title || page.title,
    summary: parsed.summary,
    content: parsed.content,
  };
}
