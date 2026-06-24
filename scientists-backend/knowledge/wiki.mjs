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

const UA = 'KN-Scientists-Lab/1.0 (local educational app; contact: local user)';

// Public interface: given a user question, return a short reference string (or
// '' if disabled / nothing useful / any error). Never throws -- RAG is additive.
export async function retrieveContext(query, lang) {
  if (!config.wiki.enabled || !query || !query.trim()) return '';
  try {
    const site = wikiSite(lang);
    const title = await searchTitle(site, query, lang);
    if (!title) return '';
    const extract = await fetchIntro(site, title, lang);
    if (!extract) return '';
    const clipped = extract.slice(0, config.wiki.maxChars);
    return `[Wikipedia: ${title}]\n${clipped}`;
  } catch {
    return '';
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

async function searchTitle(site, query, lang) {
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
    signal: AbortSignal.timeout(config.wiki.timeoutMs),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.query?.search?.[0];
  return hit ? hit.title : null;
}

async function fetchIntro(site, title, lang) {
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
    signal: AbortSignal.timeout(config.wiki.timeoutMs),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  return first && first.extract ? first.extract.trim() : null;
}
