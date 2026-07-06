// Minimal MediaWiki / Wikidata API client: serial requests with a polite gap,
// descriptive User-Agent, maxlag handling, retries with backoff, automatic
// continuation, and zh-TW variant negotiation for zh.wikipedia.

import { config } from '../config.mjs';

let lastRequest = 0;
async function politeWait() {
  const due = lastRequest + config.crawl.requestGapMs;
  const wait = due - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
}

export function wikiHost(lang) {
  return `${lang}.wikipedia.org`;
}

function baseParams(lang) {
  const p = { format: 'json', formatversion: '2', maxlag: '5' };
  if (lang === 'zh') p.variant = config.zhVariant;
  return p;
}

async function apiGet(host, params, lang = '') {
  const url = new URL(`https://${host}/w/api.php`);
  const merged = { ...baseParams(lang), ...params };
  for (const k of Object.keys(merged)) {
    if (merged[k] === undefined || merged[k] === null) delete merged[k];
  }
  url.search = new URLSearchParams(merged).toString();
  const headers = { 'User-Agent': config.userAgent, Accept: 'application/json' };
  if (lang === 'zh') headers['Accept-Language'] = config.zhVariant;

  let lastErr;
  for (let attempt = 0; attempt <= config.crawl.retries; attempt++) {
    await politeWait();
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(config.crawl.timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${host}`);
      const data = await res.json();
      if (data?.error?.code === 'maxlag') throw new Error('maxlag');
      if (data?.error) throw new Error(`${data.error.code}: ${data.error.info}`);
      return data;
    } catch (e) {
      lastErr = e;
      if (attempt < config.crawl.retries) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

// Follow API continuation; `collect(data)` is called once per response.
async function apiGetAll(host, params, lang, collect) {
  let cont = {};
  for (;;) {
    const data = await apiGet(host, { ...params, ...cont }, lang);
    collect(data);
    if (!data.continue) return;
    cont = data.continue;
  }
}

// --- discovery -----------------------------------------------------------------

// Outgoing mainspace wikilinks from a page, in article order -- used to read
// the entries out of a "List of X" article (namespace 0 only, so File:/
// Category:/Template: links etc. never show up as list items). Stops paging
// once `max` is reached instead of always walking the full continuation
// chain, so a cap actually bounds the request count for huge lists (e.g.
// "List of exoplanets" has thousands of links).
export async function fetchPageLinks(lang, title, { max = 500 } = {}) {
  const titles = [];
  let cont = {};
  for (;;) {
    const data = await apiGet(
      wikiHost(lang),
      { action: 'query', titles: title, prop: 'links', plnamespace: '0', pllimit: 'max', ...cont },
      lang
    );
    for (const p of data?.query?.pages ?? []) {
      for (const l of p.links ?? []) titles.push(l.title);
    }
    if (titles.length >= max || !data.continue) break;
    cont = data.continue;
  }
  return titles.slice(0, max);
}

export async function categoryMembers(lang, category) {
  const pages = [];
  const subcats = [];
  await apiGetAll(
    wikiHost(lang),
    {
      action: 'query',
      list: 'categorymembers',
      cmtitle: category,
      cmtype: 'page|subcat',
      cmnamespace: '0|14',
      cmlimit: 'max',
    },
    lang,
    (data) => {
      for (const m of data?.query?.categorymembers ?? []) {
        if (m.ns === 14) subcats.push(m.title);
        else if (m.ns === 0) pages.push({ pageid: m.pageid, title: m.title });
      }
    }
  );
  return { pages, subcats };
}

export async function searchTitles(lang, query, limit = 5) {
  const data = await apiGet(
    wikiHost(lang),
    { action: 'query', list: 'search', srsearch: query, srlimit: String(limit) },
    lang
  );
  return (data?.query?.search ?? []).map((h) => h.title);
}

// --- page metadata (batch, <= 50 titles) ------------------------------------------
// Returns latest revid/timestamp + Wikidata QID + disambiguation flag per page,
// plus normalization/redirect maps so callers can trace their original titles.

export async function fetchPagesMeta(lang, titles) {
  const data = await apiGet(
    wikiHost(lang),
    {
      action: 'query',
      titles: titles.join('|'),
      redirects: '1',
      converttitles: '1',
      prop: 'info|pageprops',
      inprop: 'url',
      ppprop: 'wikibase_item|disambiguation',
    },
    lang
  );
  const pages = (data?.query?.pages ?? []).map((p) => ({
    title: p.title,
    pageid: p.pageid ?? null,
    missing: !!p.missing,
    url: p.fullurl ?? null,
    revId: p.lastrevid ?? null,
    revTime: p.touched ?? null,
    qid: p.pageprops?.wikibase_item ?? null,
    disambiguation: p.pageprops ? 'disambiguation' in p.pageprops : false,
  }));
  const resolveMap = {};
  for (const n of data?.query?.normalized ?? []) resolveMap[n.from] = n.to;
  for (const c of data?.query?.converted ?? []) resolveMap[c.from] = c.to;
  const redirects = {};
  for (const r of data?.query?.redirects ?? []) redirects[r.from] = r.to;
  return { pages, resolveMap, redirects };
}

export function resolveTitle(meta, original) {
  let t = meta.resolveMap[original] ?? original;
  // follow at most a short redirect chain
  for (let i = 0; i < 3 && meta.redirects[t]; i++) t = meta.redirects[t];
  return t;
}

// --- zh-TW display title -------------------------------------------------------
// action=query's `title` field is NOT run through the LanguageConverter even
// with variant=zh-tw+converttitles=1 (only content props like `extract` are
// converted) -- zh.wikipedia stores each page's title in whichever variant its
// creator used, often Simplified. action=parse&prop=displaytitle IS variant-
// aware, so it is the one reliable way to get a page's title in zh-tw.
export async function fetchDisplayTitle(lang, title) {
  if (lang !== 'zh') return null;
  const data = await apiGet(wikiHost(lang), { action: 'parse', page: title, prop: 'displaytitle' }, lang);
  const html = data?.parse?.displaytitle;
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text || null;
}

// --- full page bundle (single title) ------------------------------------------
// Plaintext extract (full article or intro), visible categories, revision info,
// canonical URL and QID in as few requests as possible (categories and long
// extracts may continue).

export async function fetchPageBundle(lang, title, { fullText = true } = {}) {
  const params = {
    action: 'query',
    titles: title,
    redirects: '1',
    converttitles: '1',
    prop: 'extracts|categories|info|revisions|pageprops',
    explaintext: '1',
    exsectionformat: 'wiki',
    inprop: 'url',
    rvprop: 'ids|timestamp',
    ppprop: 'wikibase_item|disambiguation',
    clshow: '!hidden',
    cllimit: 'max',
  };
  if (!fullText) params.exintro = '1';

  let page = null;
  const categories = [];
  await apiGetAll(wikiHost(lang), params, lang, (data) => {
    const p = data?.query?.pages?.[0];
    if (!p) return;
    if (!page) {
      page = p;
    } else {
      if (p.extract && !page.extract) page.extract = p.extract;
      if (p.revisions && !page.revisions) page.revisions = p.revisions;
      if (p.pageprops && !page.pageprops) page.pageprops = p.pageprops;
    }
    for (const c of p.categories ?? []) {
      categories.push(c.title.replace(/^[^:]+:/, ''));
    }
  });
  if (!page) return null;
  return {
    missing: !!page.missing,
    title: page.title,
    pageid: page.pageid ?? null,
    url: page.fullurl ?? null,
    revId: page.revisions?.[0]?.revid ?? page.lastrevid ?? null,
    revTime: page.revisions?.[0]?.timestamp ?? page.touched ?? null,
    qid: page.pageprops?.wikibase_item ?? null,
    disambiguation: page.pageprops ? 'disambiguation' in page.pageprops : false,
    extract: page.extract ?? '',
    categories: [...new Set(categories)],
  };
}

// --- interlanguage links (batch, <= 50 titles) --------------------------------

export async function fetchLangLinks(lang, titles, targetLangs) {
  const want = new Set(targetLangs);
  const map = new Map(); // final title -> [{lang, title}]
  await apiGetAll(
    wikiHost(lang),
    {
      action: 'query',
      titles: titles.join('|'),
      redirects: '1',
      prop: 'langlinks',
      lllimit: 'max',
    },
    lang,
    (data) => {
      for (const p of data?.query?.pages ?? []) {
        if (!map.has(p.title)) map.set(p.title, []);
        for (const ll of p.langlinks ?? []) {
          if (want.has(ll.lang)) map.get(p.title).push({ lang: ll.lang, title: ll.title });
        }
      }
    }
  );
  return map;
}

// --- Wikidata -------------------------------------------------------------------

export async function wdGetEntities(qids, {
  props = 'labels|descriptions|claims',
  languages = 'en|zh|zh-tw',
} = {}) {
  const data = await apiGet('www.wikidata.org', {
    action: 'wbgetentities',
    ids: qids.join('|'),
    props,
    languages,
  });
  return data?.entities ?? {};
}
