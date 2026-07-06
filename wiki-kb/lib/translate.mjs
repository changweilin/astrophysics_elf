// LLM translation of a corpus page into a language the knowledge base does not
// yet cover, via the same local Ollama server used for embeddings. The result
// is returned as a preview only — the caller (browser UI) decides whether to
// commit it with POST /api/contribute, so nothing lands in the KB untouched.

import { config } from '../config.mjs';
import { toTaiwan } from './zh-convert.mjs';
import { withBusy } from './ollama-gate.mjs';
import { categoryLabel } from './classify.mjs';

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
export async function translatePage(page, target, { maxChars = 3500, signal } = {}) {
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

  return withBusy(async () => {
    const res = await fetch(`${config.embed.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: config.translate.keepAlive,
        options: { temperature: 0.2, num_predict: 2048 },
      }),
      signal: anySignal([AbortSignal.timeout(config.translate.timeoutMs), ...(signal ? [signal] : [])]),
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
    // Local models drift into Simplified even when told the target is Taiwan --
    // normalize before this ever reaches the preview/contribute flow.
    const fix = target === 'zh' ? toTaiwan : (s) => s;
    return {
      model,
      target,
      sourcePageId: page.id,
      sourceLang: page.lang,
      qid: page.qid || null,
      kind: page.kind,
      title: fix(parsed.title || page.title),
      summary: fix(parsed.summary),
      content: fix(parsed.content),
    };
  });
}

// Split off a trailing "RELATED: ..." line (if the model produced one) from
// the TITLE/SUMMARY/CONTENT block so parseSections() only ever sees the
// three markers it already understands.
function splitRelated(raw) {
  const m = /\nRELATED:\s*([\s\S]*)$/i.exec(raw);
  if (!m) return { body: raw, relatedRaw: '' };
  return { body: raw.slice(0, m.index), relatedRaw: m[1].trim() };
}

// Generate a short article for a knowledge-graph node that has NO existing
// corpus page in ANY language -- typically a Wikidata "stub" entity that only
// exists in the graph because some other page links to it (see
// wiki-kb/lib/graph.mjs labelStubs). There is nothing to translate here: the
// LLM writes from its own general knowledge, seeded only with the entity's
// Wikidata label/kind and its known graph relations. Unlike translatePage,
// there is no source article to check facts against, so the result is marked
// `generated: true` and the caller (kg-view.js) MUST show it as an
// unverified, LLM-written draft rather than reusing the "translated from"
// framing.
//
// `relations` (existing edges) and `candidates` (other graph nodes the caller
// has picked as plausible link targets -- see routes.mjs) are both given as
// context: relations anchor the topic's domain so a same-named-but-unrelated
// subject in a different field doesn't get conflated with it, and candidates
// let the model propose NEW edges (`suggestedLinks`) without ever letting it
// invent a QID -- it may only select from the fixed list it was handed.
export async function generateEntityArticle(entity, target, { relations = [], candidates = [], signal } = {}) {
  const targetName = LANG_NAMES[target];
  if (!targetName) throw new Error(`unsupported target language: ${target}`);
  const model = await resolveTranslateModel();

  const label = entity.label_en || entity.label_zh || entity.qid;
  const categoryName = categoryLabel(entity.category, 'en');
  const relLines = relations
    .filter((r) => r.label_en || r.label_zh)
    .slice(0, 12)
    .map((r) => `- ${r.rel_label || r.rel}: ${r.label_en || r.label_zh}`);
  const candList = candidates.filter((c) => c.qid && c.label).slice(0, 20);
  const candLines = candList.map((c) => `- ${c.qid}: ${c.label}`);

  const prompt = [
    `You are a careful science writer. Write a short, factual encyclopedia-style entry in ${targetName} about the topic below, using only well-established knowledge.`,
    'IMPORTANT: the topic label alone may be shared by an unrelated subject in a different field (e.g. a person vs. a place, or a physics term vs. an everyday word). Stay strictly within the domain implied by the category and known relations given below -- never write about a different, unrelated subject that merely shares the same name.',
    categoryName ? `TOPIC CATEGORY: ${categoryName}` : '',
    'Rules:',
    'Output ONLY the entry, in exactly this format (keep the uppercase markers):',
    'TITLE: <title>',
    'SUMMARY: <one or two sentence summary>',
    'CONTENT: <3-6 sentences of factual body text>',
    candLines.length
      ? 'RELATED: <comma-separated QIDs, taken ONLY from the CANDIDATE TOPICS list below, that this entry meaningfully discusses or connects to -- or write "none" if none genuinely apply>'
      : '',
    '- Keep physics/math notation, symbols, formulas, units and proper nouns unchanged.',
    '- If you are not confident about a specific fact (exact dates, numeric values, discoverer names), write in general/qualitative terms instead of inventing specifics.',
    '- Do not add commentary, notes, disclaimers, or text in any other language.',
    '',
    `TOPIC: ${label}`,
    entity.description ? `KNOWN DESCRIPTION: ${entity.description}` : '',
    relLines.length ? `KNOWN GRAPH RELATIONS:\n${relLines.join('\n')}` : '',
    candLines.length ? `CANDIDATE TOPICS (for RELATED: -- do not use any QID not listed here):\n${candLines.join('\n')}` : '',
  ].filter(Boolean).join('\n');

  return withBusy(async () => {
    const res = await fetch(`${config.embed.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: config.translate.keepAlive,
        options: { temperature: 0.3, num_predict: 900 },
      }),
      signal: anySignal([AbortSignal.timeout(config.translate.timeoutMs), ...(signal ? [signal] : [])]),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`generate HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw = String(data?.response ?? '').trim();
    if (!raw) throw new Error('generate: empty model response');

    const { body: sectionsRaw, relatedRaw } = splitRelated(raw);
    const parsed = parseSections(sectionsRaw) || { title: label, summary: '', content: sectionsRaw };
    if (!parsed.content) parsed.content = parsed.summary || raw;
    if (!parsed.summary) parsed.summary = parsed.content.slice(0, 400);
    const fix = target === 'zh' ? toTaiwan : (s) => s;

    const suggestedLinks = relatedRaw && !/^none\b/i.test(relatedRaw)
      ? relatedRaw.split(',').map((s) => s.trim()).filter(Boolean)
        .map((qid) => candList.find((c) => c.qid === qid))
        .filter(Boolean)
      : [];

    return {
      model,
      target,
      qid: entity.qid,
      kind: entity.kind && entity.kind !== 'stub' ? entity.kind : 'topic',
      title: fix(parsed.title || label),
      summary: fix(parsed.summary),
      content: fix(parsed.content),
      generated: true,
      suggestedLinks,
    };
  });
}

// Minimal AbortSignal.any polyfill (older Node lacks it) -- same pattern used
// in scientists-backend/lib/ollama.mjs, duplicated here since wiki-kb has no
// dependency on that package.
function anySignal(signals) {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) { ctrl.abort(s.reason); break; }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}
