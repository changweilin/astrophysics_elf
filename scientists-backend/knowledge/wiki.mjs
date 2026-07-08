// Wikipedia knowledge source.
//
// Two ways the backend can stay "wiki-compatible", as requested:
//
//  1. Live retrieval (this file): best-effort RAG that pulls the intro of the
//     most relevant Wikipedia article and injects it into the persona prompt.
//     Enabled with SCI_WIKI_RAG=1. Fully optional and fails open (empty string).
//
//  2. Offline fine-tuning: knowledge/build-finetune-dataset.mjs turns a topic
//     list into chat-format JSONL you can LoRA-fine-tune on (Unsloth / Llama-
//     Factory), then point SCI_MODEL_ZH/EN at the resulting model. See README.
//
// The KnowledgeSource interface below (retrieveContext) is the single seam, so a
// future "LLM-wiki" service can be dropped in without touching the chat path.

import { config } from '../config.mjs';
import { openDb } from '../../wiki-kb/lib/db.mjs';
import { search, buildContext } from '../../wiki-kb/lib/retrieve.mjs';
import { recordTrace } from '../../wiki-kb/lib/trace.mjs';

const UA = 'KN-Scientists-Lab/1.0 (local educational app; contact: local user)';
// Own connection to the shared kb.sqlite (WAL mode; safe alongside the
// server's own handle and any standalone wiki-kb/server.mjs instance).
const kbDb = openDb();

// Public interface: given a user question, return { context, sources } (context
// is '' if disabled / nothing useful / any error). Never throws -- RAG is
// additive. `force` bypasses the config.wiki.enabled kill switch -- it is how
// the chat's per-message reply-mode selector (direct/RAG/compare) asks for
// retrieval regardless of the server's default-off env setting.
export async function retrieveContext(query, lang, { force = false, signal } = {}) {
  if ((!force && !config.wiki.enabled) || !query || !query.trim()) return { context: '', sources: [] };
  if (signal && signal.aborted) return { context: '', sources: [] };
  const fromKb = await retrieveFromKb(query, lang, signal);
  if (fromKb.context) return fromKb;
  if (signal && signal.aborted) return { context: '', sources: [] };
  try {
    const site = wikiSite(lang);
    const title = await searchTitle(site, query, lang, signal);
    if (!title) return { context: '', sources: [] };
    const extract = await fetchIntro(site, title, lang, signal);
    if (!extract) return { context: '', sources: [] };
    const clipped = extract.slice(0, config.wiki.maxChars);
    return {
      context: `[Wikipedia: ${title}]\n${clipped}`,
      sources: [{ title, lang: lang === 'en' ? 'en' : config.wiki.lang, url: `https://${site}/wiki/${encodeURIComponent(title)}` }],
    };
  } catch {
    return { context: '', sources: [] };
  }
}

// Offline knowledge base (../../wiki-kb): hybrid BM25+vector retrieval with
// time decay over a crawled astronomy/astrophysics corpus. The KB now lives
// in this same process (see server.mjs), so retrieval is a direct in-process
// call, not an HTTP round-trip. Any error falls back to the live Wikipedia
// path below, so this can never break the chat.
async function retrieveFromKb(query, lang, signal) {
  const t0 = Date.now();
  try {
    const kbLang = lang === 'en' ? 'en' : config.wiki.lang;
    const langs = kbLang === 'en' ? ['en'] : [kbLang, 'en'];
    const results = await search(kbDb, { q: query, langs, signal });
    const ctx = buildContext(results, config.wiki.maxChars);
    recordTrace(kbDb, {
      kind: 'chat-rag', input: query, ms: Date.now() - t0,
      output: ctx.sources.map((s) => s.title).join(' | '),
      meta: { lang, sources: ctx.sources.length, graphBoosted: results.filter((r) => r.g > 0).length },
    });
    return ctx;
  } catch (e) {
    recordTrace(kbDb, { kind: 'chat-rag', input: query, ms: Date.now() - t0, ok: false, error: e && e.message || e });
    return { context: '', sources: [] };
  }
}

function wikiSite(lang) {
  // English personas read en.wikipedia; everything else uses the configured wiki
  // (zh by default, served in the Traditional-Chinese variant).
  if (lang === 'en') return 'en.wikipedia.org';
  return `${config.wiki.lang}.wikipedia.org`;
}

function headers(lang) {
  const h = { 'User-Agent': UA, Accept: 'application/json' };
  // Ask zh.wikipedia for the Traditional-Chinese variant.
  if (lang !== 'en') h['Accept-Language'] = config.wiki.zhVariant;
  return h;
}

// Combine the per-call timeout with an optional caller signal (e.g. the
// chat/discuss request's own AbortController) so an explicit Stop cancels an
// in-flight live-Wikipedia lookup immediately instead of waiting out the
// timeout.
function withTimeout(signal) {
  const timeout = AbortSignal.timeout(config.wiki.timeoutMs);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
}

async function searchTitle(site, query, lang, signal) {
  const url = new URL(`https://${site}/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '1',
    format: 'json',
    origin: '*',
  }).toString();
  const res = await fetch(url, {
    headers: headers(lang),
    signal: withTimeout(signal),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.query?.search?.[0];
  return hit ? hit.title : null;
}

async function fetchIntro(site, title, lang, signal) {
  const url = new URL(`https://${site}/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    redirects: '1',
    titles: title,
    format: 'json',
    origin: '*',
    // variant negotiation for zh content
    variant: lang === 'en' ? 'en' : config.wiki.zhVariant,
  }).toString();
  const res = await fetch(url, {
    headers: headers(lang),
    signal: withTimeout(signal),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  return first && first.extract ? first.extract.trim() : null;
}
