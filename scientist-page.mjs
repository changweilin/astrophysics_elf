/* Standalone scientist profile page (scientist.html).
 *
 *   scientist.html            -> roster grid (every scientist, no backend)
 *   scientist.html?id=galileo -> full profile: three-stage portrait gallery,
 *                                complete bio, starter questions, and the
 *                                scientist's wiki-kb knowledge-graph links.
 *
 * Everything renders from the static roster (scientists-data.mjs, which
 * re-exports the backend persona registry) -- no backend required. Only the
 * "related entities" block asks the wiki-kb service (window.KNKB) and it
 * degrades to a hint when that service is down.
 *
 * Technical terms in the bio prose are linked to the library's knowledge
 * graph on first occurrence, reusing the glossary in library-terms.js with
 * the same normalisation rules as library.js's linkifyTerms.
 */

import { SCIENTISTS_PUBLIC } from './scientists-data.mjs';

const LANG_KEY = 'kn_sci_lang'; // shared with scientists.jsx

const STR = {
  zh: {
    brandSuffix: '黑洞實驗室',
    listTitle: '科學家介紹',
    listSubtitle: '點選任一位科學家,查看完整介紹、生涯立繪與知識圖譜連結。',
    docList: '科學家介紹 · Black Hole Lab',
    backToList: '← 科學家清單',
    chatWith: (name) => `與${name}對談`,
    stageYouth: '青年',
    stagePrime: '壯年',
    stageSenior: '晚年',
    stagesLabel: '生涯立繪',
    secLife: '生平背景',
    secExpertise: '研究專長',
    secAchievements: '主要成就',
    secAsk: (name) => `問問${name}`,
    askHint: '點一個問題,會帶到對談頁由這位科學家回答。',
    secKg: '知識圖譜',
    kgOpen: '在知識圖譜中開啟',
    kgOut: '關聯條目',
    kgIn: '被這些條目引用',
    kgPages: (n) => `資料來源:${n} 篇維基條目`,
    kgOffline: '知識圖譜服務未連線;啟動後端後,這裡會列出這位科學家在圖譜中的關聯條目。',
    kgNotCrawled: '這位科學家尚未加入知識圖譜;可先用名稱搜尋開啟圖譜檢視。',
    kgMore: '(僅列出部分關聯;完整圖譜請用上方按鈕開啟)',
    termTitle: '在知識圖譜中開啟',
    notFound: '找不到這位科學家,以下是完整清單。',
  },
  en: {
    brandSuffix: 'Black Hole Lab',
    listTitle: 'Scientists',
    listSubtitle: 'Pick a scientist for the full introduction, career portraits, and knowledge-graph links.',
    docList: 'Scientists · Black Hole Lab',
    backToList: '← All scientists',
    chatWith: (name) => `Chat with ${name}`,
    stageYouth: 'Youth',
    stagePrime: 'Prime',
    stageSenior: 'Later years',
    stagesLabel: 'Career portraits',
    secLife: 'Life & Background',
    secExpertise: 'Areas of Expertise',
    secAchievements: 'Key Achievements',
    secAsk: (name) => `Ask ${name}`,
    askHint: 'Pick a question to open the chat page and have this scientist answer it.',
    secKg: 'Knowledge graph',
    kgOpen: 'Open in the knowledge graph',
    kgOut: 'Related entities',
    kgIn: 'Referenced by',
    kgPages: (n) => `Sources: ${n} wiki page${n === 1 ? '' : 's'}`,
    kgOffline: 'Knowledge-graph service is offline; start the backend to see this scientist\'s graph relations here.',
    kgNotCrawled: 'This scientist is not in the knowledge graph yet; the button above opens a label search instead.',
    kgMore: '(partial list -- open the full graph with the button above)',
    termTitle: 'Open in the knowledge graph',
    notFound: 'Scientist not found -- here is the full roster.',
  },
};

function getLang() {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'zh' || q === 'en') return q;
  } catch (e) {}
  try { const v = localStorage.getItem(LANG_KEY); if (v === 'zh' || v === 'en') return v; } catch (e) {}
  return 'zh';
}

let lang = getLang();
let S = STR[lang];

function t(bi) {
  if (!bi) return '';
  if (typeof bi === 'string') return bi;
  return bi[lang] || bi.en || bi.zh || '';
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// ---- glossary term -> knowledge graph links ------------------------------
// Same normalisation + boundary rules as library.js's linkifyTerms, applied
// to strings as we build the DOM (this page renders its own prose, so no
// TreeWalker pass is needed). A term links at most once per profile.

function normTerm(s) {
  return String(s || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isAscii(s) { return /^[\x20-\x7e]+$/.test(s); }

// Earliest occurrence of `needle` in `hay`; Latin needles must sit on word
// boundaries (keeps "galaxy" from firing inside "galaxies'"). Unlike the
// library version this retries later occurrences when the first fails the
// boundary check.
function findSurface(hay, needle) {
  const low = hay.toLowerCase();
  const nlow = needle.toLowerCase();
  let i = low.indexOf(nlow);
  while (i >= 0) {
    if (!isAscii(needle)) return i;
    const before = i > 0 ? hay.charAt(i - 1) : ' ';
    const after = hay.charAt(i + needle.length) || ' ';
    if (!/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after)) return i;
    i = low.indexOf(nlow, i + 1);
  }
  return -1;
}

const TERMS = Array.isArray(window.KN_LIB_TERMS) ? window.KN_LIB_TERMS : [];

function termKey(entry) { return entry.qid || normTerm((entry.en || [''])[0]); }

function formsFor(entry) {
  const f = entry[lang] || entry.en || [];
  return f.slice().sort((a, b) => b.length - a.length);
}

function termAnchor(entry, text) {
  const a = el('a', 'sp-term', text);
  a.href = 'library.html?kg=' + encodeURIComponent(entry.qid || text);
  a.title = S.termTitle;
  return a;
}

// Append `text` to `parent`, wrapping the first occurrence of each glossary
// term not already in `used` with a graph link.
function appendLinkified(parent, text, used) {
  let rest = String(text == null ? '' : text);
  for (;;) {
    let best = null;
    for (const entry of TERMS) {
      const key = termKey(entry);
      if (!key || used.has(key)) continue;
      for (const form of formsFor(entry)) {
        const at = findSurface(rest, form);
        if (at < 0) continue;
        // earliest occurrence wins; on a tie, the longer surface form
        // (so "超大質量黑洞" beats the "黑洞" nested inside it)
        if (!best || at < best.at || (at === best.at && form.length > best.len)) {
          best = { at, len: form.length, entry, key };
        }
      }
    }
    if (!best) break;
    if (best.at > 0) parent.appendChild(document.createTextNode(rest.slice(0, best.at)));
    parent.appendChild(termAnchor(best.entry, rest.slice(best.at, best.at + best.len)));
    used.add(best.key);
    rest = rest.slice(best.at + best.len);
  }
  if (rest) parent.appendChild(document.createTextNode(rest));
}

// ---- shared bits ----------------------------------------------------------

function birthYear(s) {
  const m = String(s.years || '').match(/^-?\d+/);
  return m ? parseInt(m[0], 10) : Infinity;
}

function nameFor(s, l) { return (s.name && (s.name[l] || s.name.en)) || s.id; }

function accentOf(s) { return s.accent || '#82aee8'; }

// ---- roster grid (no ?id) --------------------------------------------------

function renderList(root, note) {
  document.title = S.docList;
  const wrap = el('div', 'sp-shell');
  const head = el('header', 'sp-list-head');
  head.appendChild(el('h1', null, S.listTitle));
  head.appendChild(el('p', 'sp-dim', note || S.listSubtitle));
  wrap.appendChild(head);

  const grid = el('div', 'sp-grid');
  const list = SCIENTISTS_PUBLIC.slice().sort((a, b) => birthYear(a) - birthYear(b));
  for (const s of list) {
    const card = el('a', 'sp-card');
    card.href = 'scientist.html?id=' + encodeURIComponent(s.id);
    card.style.setProperty('--sp-accent', accentOf(s));
    const img = el('img', 'sp-card-avatar');
    img.src = 'avatars/' + s.id + '.png';
    img.alt = nameFor(s, lang);
    img.loading = 'lazy';
    card.appendChild(img);
    const who = el('div', 'sp-card-who');
    who.appendChild(el('div', 'sp-card-name', nameFor(s, lang)));
    who.appendChild(el('div', 'sp-card-meta', s.years));
    who.appendChild(el('div', 'sp-card-fields', t(s.fields)));
    card.appendChild(who);
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  root.replaceChildren(wrap);
}

// ---- profile ----------------------------------------------------------------

const STAGES = [
  { key: 'youth', label: () => S.stageYouth },
  { key: 'prime', label: () => S.stagePrime },
  { key: 'senior', label: () => S.stageSenior },
];

function renderProfile(root, s) {
  const name = nameFor(s, lang);
  const altName = nameFor(s, lang === 'zh' ? 'en' : 'zh');
  document.title = name + ' · ' + S.docList;
  const used = new Set(); // one graph link per term per profile

  const wrap = el('div', 'sp-shell sp-profile');
  wrap.style.setProperty('--sp-accent', accentOf(s));

  // breadcrumb / actions
  const bar = el('div', 'sp-actions');
  const back = el('a', 'sp-back', S.backToList);
  back.href = 'scientist.html';
  bar.appendChild(back);
  bar.appendChild(el('div', 'spacer'));
  const chat = el('a', 'sp-chatbtn', S.chatWith(name));
  chat.href = 'scientists.html?sci=' + encodeURIComponent(s.id);
  bar.appendChild(chat);
  wrap.appendChild(bar);

  // hero: portrait gallery + identity
  const hero = el('section', 'sp-hero');
  const fig = el('figure', 'sp-portrait');
  const img = el('img');
  // portraits/keyed/ holds the chroma-keyed (transparent) copies of the raw
  // green-screen art in portraits/, so the accent wash shows through behind
  // the figure instead of the key green.
  img.src = 'portraits/keyed/' + s.id + '_prime.png';
  img.alt = name + ' — ' + S.stagePrime;
  fig.appendChild(img);
  const stages = el('div', 'sp-stages');
  stages.setAttribute('role', 'tablist');
  stages.setAttribute('aria-label', S.stagesLabel);
  for (const st of STAGES) {
    const b = el('button', 'sp-stage' + (st.key === 'prime' ? ' active' : ''), st.label());
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', st.key === 'prime' ? 'true' : 'false');
    b.addEventListener('click', () => {
      img.src = 'portraits/keyed/' + s.id + '_' + st.key + '.png';
      img.alt = name + ' — ' + st.label();
      for (const o of stages.children) {
        o.classList.toggle('active', o === b);
        o.setAttribute('aria-selected', o === b ? 'true' : 'false');
      }
    });
    stages.appendChild(b);
  }
  const cap = el('figcaption');
  cap.appendChild(stages);
  fig.appendChild(cap);
  hero.appendChild(fig);

  const info = el('div', 'sp-info');
  info.appendChild(el('h1', 'sp-name', name));
  info.appendChild(el('div', 'sp-name-alt', altName));
  const meta = el('div', 'sp-meta');
  meta.appendChild(el('span', 'sp-years', s.years));
  meta.appendChild(el('span', 'sp-fields', t(s.fields)));
  info.appendChild(meta);
  const blurb = el('p', 'sp-blurb');
  appendLinkified(blurb, t(s.blurb), used);
  info.appendChild(blurb);

  // full bio sections
  const details = s.details && (s.details[lang] || s.details.en);
  if (details) {
    const secs = [
      [S.secLife, details.life],
      [S.secExpertise, details.expertise],
      [S.secAchievements, details.achievements],
    ];
    for (const [title, body] of secs) {
      if (!body) continue;
      const sec = el('section', 'sp-section');
      sec.appendChild(el('h2', null, title));
      const p = el('p');
      appendLinkified(p, body, used);
      sec.appendChild(p);
      info.appendChild(sec);
    }
  }
  hero.appendChild(info);
  wrap.appendChild(hero);

  // starter questions -> chat deep link (scientists.jsx ?sci=&ask=)
  const starters = s.starters && (s.starters[lang] || s.starters.en);
  if (starters && starters.length) {
    const sec = el('section', 'sp-section sp-ask');
    sec.appendChild(el('h2', null, S.secAsk(name)));
    sec.appendChild(el('p', 'sp-dim', S.askHint));
    const list = el('div', 'sp-ask-list');
    for (const q of starters) {
      const a = el('a', 'sp-ask-item', q);
      a.href = 'scientists.html?sci=' + encodeURIComponent(s.id) + '&ask=' + encodeURIComponent(q);
      list.appendChild(a);
    }
    sec.appendChild(list);
    wrap.appendChild(sec);
  }

  wrap.appendChild(renderKgSection(s));
  root.replaceChildren(wrap);
}

// ---- knowledge-graph section -------------------------------------------------
// The one backend-dependent block: /api/entity via window.KNKB when the
// scientist has a crawled entity; everything else on the page stays static.

function renderKgSection(s) {
  const sec = el('section', 'sp-section sp-kg');
  sec.appendChild(el('h2', null, S.secKg));

  const kg = s.kg || {};
  const focus = kg.qid || kg.q || nameFor(s, 'en');
  const open = el('a', 'sp-chatbtn sp-kg-open', S.kgOpen);
  open.href = 'library.html?kg=' + encodeURIComponent(focus);
  sec.appendChild(open);

  const box = el('div', 'sp-kg-body');
  sec.appendChild(box);

  if (!kg.qid) {
    box.appendChild(el('p', 'sp-dim', S.kgNotCrawled));
    return sec;
  }
  if (!window.KNKB) {
    box.appendChild(el('p', 'sp-dim', S.kgOffline));
    return sec;
  }

  box.appendChild(el('p', 'sp-dim', '…'));
  window.KNKB.api('/api/entity?qid=' + encodeURIComponent(kg.qid))
    .then((d) => { box.replaceChildren(); renderKgBody(box, d); })
    .catch(() => { box.replaceChildren(el('p', 'sp-dim', S.kgOffline)); });
  return sec;
}

const KG_CHIP_CAP = 40; // per direction; the full graph is one click away

function edgeLabel(e) { return lang === 'zh' ? (e.label_zh || e.label_en) : (e.label_en || e.label_zh); }

function renderKgEdges(box, title, edges, otherKey) {
  const labelled = edges.filter((e) => edgeLabel(e));
  if (!labelled.length) return;
  const group = el('div', 'sp-kg-group');
  group.appendChild(el('h3', null, title));
  const chips = el('div', 'sp-kg-chips');
  // group edges under their relation label, preserving DB order
  const byRel = new Map();
  for (const e of labelled) {
    const rel = e.rel_label || e.rel || '';
    if (!byRel.has(rel)) byRel.set(rel, []);
    byRel.get(rel).push(e);
  }
  let shown = 0;
  for (const [rel, list] of byRel) {
    if (shown >= KG_CHIP_CAP) break;
    const row = el('div', 'sp-kg-rel-row');
    if (rel) row.appendChild(el('span', 'sp-kg-rel', rel));
    for (const e of list) {
      if (shown >= KG_CHIP_CAP) break;
      const a = el('a', 'sp-kg-chip', edgeLabel(e));
      a.href = 'library.html?kg=' + encodeURIComponent(e[otherKey]);
      row.appendChild(a);
      shown += 1;
    }
    chips.appendChild(row);
  }
  group.appendChild(chips);
  if (labelled.length > shown) group.appendChild(el('p', 'sp-dim', S.kgMore));
  box.appendChild(group);
}

function renderKgBody(box, d) {
  if (!d || !d.entity) { box.appendChild(el('p', 'sp-dim', S.kgOffline)); return; }
  renderKgEdges(box, S.kgOut, d.out || [], 'dst');
  renderKgEdges(box, S.kgIn, d['in'] || [], 'src');
  const pages = d.pages || [];
  if (pages.length) box.appendChild(el('p', 'sp-dim sp-kg-pages', S.kgPages(pages.length)));
}

// ---- boot ---------------------------------------------------------------------

function currentId() {
  try { return (new URLSearchParams(window.location.search).get('id') || '').trim(); } catch (e) { return ''; }
}

function render() {
  S = STR[lang];
  const suffix = document.getElementById('sp-brand-suffix');
  if (suffix) suffix.textContent = S.brandSuffix;
  const root = document.getElementById('sp-root');
  const id = currentId();
  if (!id) { renderList(root); return; }
  const s = SCIENTISTS_PUBLIC.find((x) => x.id === id);
  if (!s) { renderList(root, S.notFound); return; }
  renderProfile(root, s);
}

const langSel = document.getElementById('sp-lang');
langSel.value = lang;
langSel.addEventListener('change', () => {
  lang = langSel.value === 'en' ? 'en' : 'zh';
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  render();
});

render();
