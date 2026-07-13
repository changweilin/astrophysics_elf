/* kg-view.js — read-only knowledge-graph view for the library page.
 *
 * Plain JS + Canvas2D (no React/Babel — the library stays light). Data comes
 * from the wiki-kb HTTP API via window.KNKB (kb-config.js):
 *   /api/entities  — search / top-degree browse list
 *   /api/graph     — 1..2-hop subgraph around the focused entity
 *   /api/entity    — detail card (labels, edges, corpus pages)
 *   /api/page      — summary text for the reader panel
 *   /api/translate + /api/contribute — the "no content in my language" flow:
 *     an LLM translation is previewed first, and only lands in the knowledge
 *     base when the reader presses "add to knowledge graph".
 *
 * Rendering is intentionally muted (soft cyan/amber on the dark theme, gentle
 * glow only on the focused node — never neon).
 */
(function () {
  var COLORS = {
    person: '#d9a866',
    scientist: '#d9a866',
    topic: '#6fc3c9',
    note: '#9d8cd6',
    list: '#8caa7e',
    stub: '#4a5262',
    unknown: '#4a5262',
    edge: 'rgba(120,132,152,0.28)',
    edgeLabel: '#6b7482',
    label: '#c8cfda',
    focusRing: 'rgba(111,195,201,0.35)',
    parentRing: 'rgba(214,140,140,0.65)',
  };

  // Outer-ring markers for content status relative to the reader's current
  // language (see contentState() below) -- kept a clear ring's-width outside
  // COLORS.parentRing so a node can carry both a taxonomy ring (parent) and a
  // content-status ring at once without the two blending into one shape.
  // 'native' (an original, non-LLM article already in this language) is the
  // common/baseline case and intentionally gets no ring at all.
  var STATE_RING = {
    translated: { color: 'rgba(120,166,214,0.85)', dash: [3, 2] },
    generated: { color: 'rgba(214,168,90,0.85)', dash: [3, 2] },
    untranslated: { color: 'rgba(200,207,218,0.45)', dash: [1, 3] },
    ungenerated: { color: 'rgba(120,128,144,0.5)', dash: [1, 3] },
  };

  // Relations that point "upward" (root -> parent), same taxonomy as
  // wiki-kb/lib/graph.mjs RELS (duplicated here the same way kb-admin.js
  // duplicates its own RELS list -- no shared module between the plain-JS
  // frontend and the ESM backend). Used to ring parent nodes in a distinct
  // color so they read as "above" the focus, not just another neighbor.
  var PARENT_RELS = { P279: 1, P361: 1, P397: 1, P184: 1, P69: 1, P108: 1, P1066: 1 };

  // UI strings ({en, zh}; other locales read English, same policy as library.js)
  var STR = {
    search: { en: 'Search the knowledge graph…', zh: '搜尋知識圖譜…' },
    browse: { en: 'Most connected topics', zh: '連結最多的主題' },
    loading: { en: 'Loading…', zh: '載入中…' },
    offline: {
      en: 'The knowledge-base service is offline. Start it with `node wiki-kb/server.mjs`, or set its URL below.',
      zh: '知識庫服務目前離線。請先執行 `node wiki-kb/server.mjs`,或在下方設定服務位址。',
    },
    kbUrl: { en: 'Knowledge-base URL', zh: '知識庫服務位址' },
    retry: { en: 'Retry', zh: '重試' },
    empty: {
      en: 'The knowledge base has no entities yet — run the wiki-kb crawler first (see wiki-kb/README.md).',
      zh: '知識庫中還沒有任何實體——請先執行 wiki-kb 爬蟲(見 wiki-kb/README.md)。',
    },
    pickNode: { en: 'Select a node to read about it.', zh: '點選節點即可閱讀對應內容。' },
    recenter: { en: 'Focus graph here', zh: '以此節點為中心' },
    outEdges: { en: 'Relations', zh: '關聯' },
    showAllRels: { en: 'Show all', zh: '顯示全部' },
    sortByRel: { en: 'relation', zh: '關聯類型' },
    sortByName: { en: 'name', zh: '名稱' },
    sortByDegree: { en: 'links', zh: '連結數' },
    sortByAlpha: { en: 'A-Z', zh: '字母' },
    sortByKind: { en: 'kind', zh: '類型' },
    categories: { en: 'Categories', zh: '分類' },
    allCategories: { en: 'All', zh: '全部' },
    pages: { en: 'Article', zh: '條目內容' },
    noLangPage: {
      en: 'No article in your language yet.',
      zh: '這個節點還沒有你目前語言的內容。',
    },
    translateWith: { en: 'Translate with local LLM (from ', zh: '用本機 LLM 翻譯(來源:' },
    translating: {
      en: 'Translating with the local model — this can take a minute…',
      zh: '本機模型翻譯中——可能需要一點時間…',
    },
    translated: { en: 'LLM translation (unsaved preview)', zh: 'LLM 翻譯結果(尚未儲存的預覽)' },
    translatedFrom: { en: 'Translated from: ', zh: '翻譯來源:' },
    cancel: { en: 'Cancel', zh: '中斷' },
    translateCancelled: { en: 'Translation cancelled.', zh: '已中斷翻譯。' },
    // No source article exists in ANY language for this node (a Wikidata stub
    // that only appears because another page links to it) -- there is
    // nothing to translate, but the reader can still ask the local LLM to
    // write a short draft from its own general knowledge instead.
    generateWith: { en: 'No source article — write a draft with local LLM', zh: '沒有來源條目——用本機 LLM 生成草稿' },
    generating: {
      en: 'Writing a draft with the local model — this can take a minute…',
      zh: '本機模型生成草稿中——可能需要一點時間…',
    },
    generateCancelled: { en: 'Draft generation cancelled.', zh: '已中斷生成。' },
    generateErr: { en: 'Draft generation failed: ', zh: '生成草稿失敗:' },
    generatedDisclaimer: {
      en: 'AI-written draft — not sourced from an existing article. May contain mistakes; verify before relying on it.',
      zh: 'AI 生成草稿——並非來自現有條目,可能有誤,使用前請自行查證。',
    },
    busyErr: {
      en: 'The local model is busy with something else right now — try again in a moment.',
      zh: '本機模型目前忙線中(可能正在處理其他請求)——請稍後再試。',
    },
    addToKb: { en: 'Add to knowledge graph', zh: '加入知識圖譜' },
    adding: { en: 'Adding…', zh: '加入中…' },
    showFullContent: { en: 'Show full content', zh: '顯示詳細內容' },
    hideFullContent: { en: 'Hide full content', zh: '隱藏詳細內容' },
    added: { en: 'Added — this article is now part of the knowledge base.', zh: '已加入——這篇內容現在是知識庫的一部分了。' },
    translateErr: { en: 'Translation failed: ', zh: '翻譯失敗:' },
    addErr: { en: 'Could not add: ', zh: '加入失敗:' },
    correctBtn: { en: 'Not quite right — correct it', zh: '翻譯不滿意——提出修正' },
    deleteBtn: { en: 'Delete', zh: '刪除' },
    deleteConfirm: {
      en: 'Delete this contributed translation? This removes it from the knowledge base.',
      zh: '確定刪除這篇貢獻的翻譯?這會將它從知識庫中移除。',
    },
    deleted: { en: 'Deleted.', zh: '已刪除。' },
    correctTitle: { en: 'Title', zh: '標題' },
    correctSave: { en: 'Save correction', zh: '儲存修正' },
    correctCancel: { en: 'Cancel', zh: '取消' },
    corrected: { en: 'Correction saved.', zh: '已儲存修正。' },
    source: { en: 'source', zh: '來源' },
    readMore: { en: 'Full article on Wikipedia ↗', zh: '在 Wikipedia 閱讀全文 ↗' },
    hint: {
      en: 'Mouse: drag to pan\nMouse: scroll to zoom\nTouch: one finger scrolls the page\nTouch: two fingers pinch/pan the graph\nClick/tap a node to read\nDouble-click/double-tap a node to center on it',
      zh: '滑鼠:拖曳平移\n滑鼠:滾輪縮放\n觸控:單指滑動頁面\n觸控:雙指平移/縮放圖譜\n點選節點閱讀\n雙擊(或連續點兩下)節點以此為中心',
    },
    depthLabel: { en: 'Link depth', zh: '連結層數' },
    histPrev: { en: 'Previous center', zh: '上一個中心點' },
    histNext: { en: 'Next center', zh: '下一個中心點' },
    legendBtnLabel: { en: 'Legend', zh: '說明' },
    legendHintHead: { en: 'How to use', zh: '操作說明' },
    legendKindHead: { en: 'Node color = kind', zh: '節點顏色 = 類型' },
    legendStateHead: { en: 'Outer ring = content status (this language)', zh: '外圈 = 內容狀態(目前語言)' },
    legendParentLabel: { en: 'Ringed in red = a parent/upper node of the focused entity', zh: '紅色外框 = 目前中心節點的上層(父)節點' },
    suggestedLinksHead: { en: 'Suggested links to other topics', zh: '建議連結到其他主題' },
    suggestedLinksNote: {
      en: 'Picked by the LLM from existing graph topics only — review before adding.',
      zh: 'LLM 僅從既有圖譜主題中挑選——加入前請自行確認。',
    },
  };

  var LEGEND_KIND = [
    ['person', { en: 'Person / scientist', zh: '人物 / 科學家' }],
    ['topic', { en: 'Topic', zh: '主題' }],
    ['note', { en: 'Note / contributed page', zh: '筆記 / 貢獻頁面' }],
    ['list', { en: 'List page', zh: '清單頁面' }],
    ['stub', { en: 'Stub (no article yet)', zh: '殘根節點(尚無條目)' }],
  ];
  var LEGEND_STATE = [
    ['translated', { en: 'Translated by local LLM', zh: '已由本機 LLM 翻譯' }],
    ['generated', { en: 'Written by local LLM (unverified, no source article)', zh: '由本機 LLM 生成(未經查證,無來源條目)' }],
    ['untranslated', { en: 'Not yet in this language (source exists in another)', zh: '此語言尚無內容(其他語言已有來源)' }],
    ['ungenerated', { en: 'No article in any language yet', zh: '任何語言都尚無條目' }],
  ];

  // Small stroke icons (match the muted style used elsewhere in the app --
  // currentColor, no fill, gentle strokes).
  var ICON_CHEVRON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
  var ICON_CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/></svg>';

  // Content status for one graph node relative to the reader's current
  // language -- see STATE_RING for the visual side. `node.pages` is the
  // per-language {lang, source} list the backend attaches (subgraph()/
  // listEntities() in wiki-kb/lib/graph.mjs + db.mjs).
  function contentState(node, uiLang) {
    var pages = (node && node.pages) || [];
    var mine = pages.filter(function (p) { return p.lang === uiLang; });
    if (mine.length) {
      if (mine.some(function (p) { return p.source === 'llm-translation'; })) return 'translated';
      if (mine.some(function (p) { return p.source === 'llm-generated'; })) return 'generated';
      return 'native';
    }
    return pages.length ? 'untranslated' : 'ungenerated';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------- component
  // KNKG.mount(container, { lang, focus }) -> { destroy }
  //   focus: { qid, q } -- open centered on this entity instead of the
  //   remembered/busiest one. `qid` centers directly; `q` (a term label, e.g. a
  //   link from the course text) is resolved to the best-matching entity and
  //   also seeds the search box, so the reader sees where they landed.
  function mount(container, opts) {
    var lang = (opts && opts.lang) || 'en';
    var focus = (opts && opts.focus && (opts.focus.qid || opts.focus.q)) ? opts.focus : null;
    var destroyed = false;
    var t = function (pair) { return pair[lang] != null ? pair[lang] : pair.en; };

    function entLabel(e) {
      if (!e) return '?';
      return (lang === 'zh' ? (e.label_zh || e.label_en) : (e.label_en || e.label_zh)) || e.qid;
    }

    // ---- static skeleton ----
    container.classList.add('kg-root');
    var side = el('aside', 'kg-side');
    var stage = el('div', 'kg-stage');
    var canvas = document.createElement('canvas');
    stage.appendChild(canvas);

    // Toolbar overlay: center-point back/forward history + link-depth (1/2 hop).
    var toolbar = el('div', 'kg-toolbar');
    var histPrevBtn = el('button', 'kg-tbtn', '');
    histPrevBtn.innerHTML = ICON_CHEVRON_LEFT;
    histPrevBtn.title = t(STR.histPrev);
    histPrevBtn.setAttribute('aria-label', t(STR.histPrev));
    var histNextBtn = el('button', 'kg-tbtn', '');
    histNextBtn.innerHTML = ICON_CHEVRON_RIGHT;
    histNextBtn.title = t(STR.histNext);
    histNextBtn.setAttribute('aria-label', t(STR.histNext));
    toolbar.appendChild(histPrevBtn);
    toolbar.appendChild(histNextBtn);
    var depthGrp = el('div', 'kg-depthgrp');
    depthGrp.setAttribute('role', 'group');
    depthGrp.setAttribute('aria-label', t(STR.depthLabel));
    depthGrp.title = t(STR.depthLabel);
    [1, 2].forEach(function (d) {
      var b = el('button', 'kg-tbtn kg-depthbtn', String(d));
      b.title = t(STR.depthLabel) + ': ' + d;
      b.addEventListener('click', function () {
        if (depth === d) return;
        depth = d;
        try { localStorage.setItem('kn_kg_depth', String(d)); } catch (e) {}
        repaintDepthBtns();
        if (focusQid) focusEntity(focusQid, { skipHistory: true });
      });
      depthGrp.appendChild(b);
    });
    toolbar.appendChild(depthGrp);
    var legendBtn = el('button', 'kg-tbtn', '');
    legendBtn.innerHTML = ICON_INFO;
    legendBtn.title = t(STR.legendBtnLabel);
    legendBtn.setAttribute('aria-label', t(STR.legendBtnLabel));
    toolbar.appendChild(legendBtn);
    stage.appendChild(toolbar);

    // Legend popover: explains every visual channel used on the canvas (fill
    // color = kind, parent ring, content-status ring) in one place, so
    // "all annotations get an explanation" holds even as more get added.
    var legend = el('div', 'kg-legend hidden');
    (function buildLegend() {
      legend.appendChild(el('p', 'kg-legend-head', t(STR.legendHintHead)));
      legend.appendChild(el('p', 'kg-legend-hint', t(STR.hint)));
      legend.appendChild(el('p', 'kg-legend-head', t(STR.legendKindHead)));
      LEGEND_KIND.forEach(function (pair) {
        var row = el('div', 'kg-legend-row');
        var sw = el('span', 'kg-legend-dot');
        sw.style.background = COLORS[pair[0]] || COLORS.unknown;
        row.appendChild(sw);
        row.appendChild(el('span', null, t(pair[1])));
        legend.appendChild(row);
      });
      var parentRow = el('div', 'kg-legend-row');
      var parentSw = el('span', 'kg-legend-dot ring');
      parentSw.style.borderColor = COLORS.parentRing;
      parentRow.appendChild(parentSw);
      parentRow.appendChild(el('span', null, t(STR.legendParentLabel)));
      legend.appendChild(parentRow);

      legend.appendChild(el('p', 'kg-legend-head', t(STR.legendStateHead)));
      LEGEND_STATE.forEach(function (pair) {
        var row = el('div', 'kg-legend-row');
        var sw = el('span', 'kg-legend-dot ring');
        sw.style.borderColor = STATE_RING[pair[0]].color;
        sw.style.borderStyle = 'dashed';
        row.appendChild(sw);
        row.appendChild(el('span', null, t(pair[1])));
        legend.appendChild(row);
      });
    })();
    stage.appendChild(legend);
    legendBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      legend.classList.toggle('hidden');
    });
    legend.addEventListener('click', function (ev) { ev.stopPropagation(); });
    function hideLegend() { legend.classList.add('hidden'); }
    document.addEventListener('click', hideLegend);

    function repaintDepthBtns() {
      [].forEach.call(depthGrp.children, function (btn, i) {
        btn.className = 'kg-tbtn kg-depthbtn' + (depth === (i + 1) ? ' active' : '');
      });
    }
    histPrevBtn.addEventListener('click', function () {
      if (histIdx <= 0) return;
      histIdx--;
      focusEntity(histStack[histIdx], { skipHistory: true });
    });
    histNextBtn.addEventListener('click', function () {
      if (histIdx >= histStack.length - 1) return;
      histIdx++;
      focusEntity(histStack[histIdx], { skipHistory: true });
    });
    var detail = el('aside', 'kg-detail');
    container.appendChild(side);
    container.appendChild(stage);
    container.appendChild(detail);

    // Mobile stacks side/stage/detail into one vertical page (see the
    // max-width:980px rule in library.css) instead of the desktop 3-column
    // grid, so a tap on one list should carry the reader down/up to the next
    // block rather than leaving them staring at whichever piece happened to
    // already be on screen.
    var MOBILE_MQ = '(max-width: 980px)';
    function isMobileLayout() {
      return !!(window.matchMedia && window.matchMedia(MOBILE_MQ).matches);
    }
    function scrollIntoViewOnMobile(node) {
      if (!isMobileLayout()) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    var searchWrap = el('div', 'kg-search');
    var inQ = document.createElement('input');
    inQ.type = 'text';
    inQ.placeholder = t(STR.search);
    searchWrap.appendChild(inQ);
    side.appendChild(searchWrap);

    // Subject/content classification tree (see wiki-kb/lib/classify.mjs):
    // groups the root-node browse list by the same Wikidata-ontology +
    // Wikipedia-category signals used to seed the crawl itself. Fetched once;
    // clicking a group or leaf filters the list below via /api/entities?category=.
    var catTitleRow = el('div', 'kg-d-sect-row');
    catTitleRow.appendChild(el('p', 'kg-side-title', t(STR.categories)));
    side.appendChild(catTitleRow);
    var catTree = el('div', 'kg-cat-tree');
    side.appendChild(catTree);
    var curCategory = '';
    window.KNKB.api('/api/categories').then(function (r) {
      if (destroyed) return;
      catTree.innerHTML = '';
      var allBtn = el('button', 'kg-btn kg-cat-leaf active', t(STR.allCategories));
      catTree.appendChild(allBtn);
      var leafBtns = [allBtn];
      function repaintCatBtns() {
        leafBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.cat === curCategory); });
      }
      function bindLeaf(btn, key) {
        btn.dataset.cat = key || '';
        btn.addEventListener('click', function () {
          curCategory = curCategory === (key || '') ? '' : (key || '');
          repaintCatBtns();
          loadList(lastQ);
          scrollIntoViewOnMobile(list);
        });
        leafBtns.push(btn);
      }
      allBtn.dataset.cat = '';
      allBtn.addEventListener('click', function () {
        curCategory = ''; repaintCatBtns(); loadList(lastQ);
        scrollIntoViewOnMobile(list);
      });
      (r.tree || []).forEach(function (node) {
        var groupBtn = el('button', 'kg-btn kg-cat-group', t(node.label) + ' (' + node.n + ')');
        catTree.appendChild(groupBtn);
        bindLeaf(groupBtn, node.key);
        (node.children || []).forEach(function (child) {
          var leafBtn = el('button', 'kg-btn kg-cat-leaf indent', t(child.label) + ' (' + child.n + ')');
          catTree.appendChild(leafBtn);
          bindLeaf(leafBtn, child.key);
        });
      });
    }).catch(function () { /* classification tree is a nice-to-have; browse list still works without it */ });

    var listTitleRow = el('div', 'kg-d-sect-row');
    listTitleRow.appendChild(el('p', 'kg-side-title', t(STR.browse)));
    var listSortBar = el('div', 'kg-d-sort');
    listTitleRow.appendChild(listSortBar);
    side.appendChild(listTitleRow);
    var list = el('div', 'kg-entlist');
    side.appendChild(list);

    // Sort state for the root-node browse list (link count / name / kind,
    // forward+reverse) -- server-side, since the list is a truncated top-N
    // and re-sorting client-side would just reorder whichever N happened to
    // come back for the previous sort, not surface the true top-N for that
    // order.
    var listSort = { by: 'degree', dir: 'desc' };
    var lastQ = '';
    var LIST_SORT_KEYS = [['degree', STR.sortByDegree], ['label', STR.sortByAlpha], ['kind', STR.sortByKind]];
    function repaintListSortBar() {
      [].forEach.call(listSortBar.children, function (btn, i) {
        var key = LIST_SORT_KEYS[i][0];
        var label = t(LIST_SORT_KEYS[i][1]) + (listSort.by === key ? (listSort.dir === 'asc' ? ' ↑' : ' ↓') : '');
        btn.textContent = label;
        btn.className = 'kg-btn kg-sort-btn' + (listSort.by === key ? ' active' : '');
      });
    }
    LIST_SORT_KEYS.forEach(function (pair) {
      var key = pair[0];
      var btn = el('button', 'kg-btn kg-sort-btn', '');
      btn.addEventListener('click', function () {
        if (listSort.by === key) listSort.dir = listSort.dir === 'asc' ? 'desc' : 'asc';
        else { listSort.by = key; listSort.dir = key === 'degree' ? 'desc' : 'asc'; }
        repaintListSortBar();
        loadList(lastQ);
      });
      listSortBar.appendChild(btn);
    });
    repaintListSortBar();

    // ---- graph model + layout ----
    var G = { nodes: [], edges: [], byId: {} };  // layout state
    var focusQid = null;
    var selQid = null;
    // Link depth for the focused subgraph (1 or 2 hops); persists across visits.
    var depth = (function () {
      try {
        var v = parseInt(localStorage.getItem('kn_kg_depth') || '1', 10);
        return v === 2 ? 2 : 1;
      } catch (e) { return 1; }
    })();
    // Remembered center node (qid): restored on the first list load below so a
    // page reload reopens on the same part of the graph the reader left.
    var CENTER_KEY = 'kn_kg_center_qid';
    function savedCenterQid() {
      try { return localStorage.getItem(CENTER_KEY) || null; } catch (e) { return null; }
    }
    function saveCenterQid(qid) {
      try { localStorage.setItem(CENTER_KEY, qid); } catch (e) {}
    }
    // Back/forward history of focused center-nodes (like browser history: a
    // stack + current index, so forward is only available right after a back).
    var histStack = [];
    var histIdx = -1;
    function repaintHistButtons() {
      histPrevBtn.disabled = histIdx <= 0;
      histNextBtn.disabled = histIdx >= histStack.length - 1;
    }
    // Sort state for the detail panel's relations list (persists across node
    // switches within this mounted instance, same convention as {by, dir} in
    // the library page's own sort controls).
    var relSort = { by: null, dir: 'asc' };
    // Relation list starts truncated (most nodes have a handful of edges and
    // a long default list would dominate the panel); list-kind nodes commonly
    // have hundreds of child items, so a "show all" expand is worth it. Resets
    // whenever the reader moves to a different node.
    var relExpanded = false;
    var relExpandedQid = null;
    var view = { x: 0, y: 0, scale: 1 };
    var raf = null;
    var settling = 0;

    function resize() {
      var r = stage.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var w = Math.max(1, Math.round(r.width * dpr));
      var h = Math.max(1, Math.round(r.height * dpr));
      // Setting canvas.width/height clears its bitmap even when the value is
      // unchanged. Mobile browsers fire spurious 'resize' events for things
      // like the address bar hiding/showing on tap or scroll -- without this
      // guard + redraw, a tap on a node could clear the stage and never
      // repaint it (looks like a flicker, then a black stage).
      if (w === canvas.width && h === canvas.height) return;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      kickDraw();
    }
    window.addEventListener('resize', resize);

    function setGraph(root, nodes, edges) {
      var old = G.byId;
      G.byId = {};
      G.nodes = nodes.map(function (n, i) {
        var prev = old[n.qid];
        var angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        var node = {
          qid: n.qid,
          kind: n.kind || 'unknown',
          label: entLabel(n),
          state: contentState(n, lang),
          x: prev ? prev.x : Math.cos(angle) * 160 + (Math.random() - 0.5) * 40,
          y: prev ? prev.y : Math.sin(angle) * 160 + (Math.random() - 0.5) * 40,
          vx: 0, vy: 0,
          deg: 0,
        };
        if (n.qid === root) { node.x = prev ? prev.x : 0; node.y = prev ? prev.y : 0; }
        G.byId[n.qid] = node;
        return node;
      });
      G.edges = edges.filter(function (e) { return G.byId[e.src] && G.byId[e.dst]; });
      G.edges.forEach(function (e) { G.byId[e.src].deg++; G.byId[e.dst].deg++; });
      // Mark direct parents of the focused root (edges root --parentRel--> dst)
      // so draw() can ring them in a distinct color.
      G.edges.forEach(function (e) {
        if (e.src === root && PARENT_RELS[e.rel] && G.byId[e.dst]) G.byId[e.dst].parent = true;
      });
      focusQid = root;
      settling = 260;               // frames of force layout before it freezes
      view = { x: 0, y: 0, scale: 1 };
      kickDraw();
    }

    function stepForces() {
      var nodes = G.nodes;
      var n = nodes.length;
      if (!n) return;
      // repulsion (O(n^2) is fine: subgraphs are capped at 150 nodes)
      for (var i = 0; i < n; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < n; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy + 40;
          var f = 1300 / d2;
          var d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f;
          b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      // springs
      for (var k = 0; k < G.edges.length; k++) {
        var e = G.edges[k];
        var s = G.byId[e.src], d3 = G.byId[e.dst];
        var ex = d3.x - s.x, ey = d3.y - s.y;
        var dist = Math.hypot(ex, ey) || 1;
        var want = 95 + 14 * Math.min(6, Math.max(s.deg, d3.deg));
        var f2 = (dist - want) * 0.004;
        ex /= dist; ey /= dist;
        s.vx += ex * f2 * dist * 0.02 + ex * f2;
        s.vy += ey * f2 * dist * 0.02 + ey * f2;
        d3.vx -= ex * f2 * dist * 0.02 + ex * f2;
        d3.vy -= ey * f2 * dist * 0.02 + ey * f2;
      }
      // gentle gravity toward origin + integrate
      for (var m = 0; m < n; m++) {
        var nd = nodes[m];
        nd.vx -= nd.x * 0.0022;
        nd.vy -= nd.y * 0.0022;
        nd.vx *= 0.86; nd.vy *= 0.86;
        if (nd.qid !== focusQid) { nd.x += nd.vx; nd.y += nd.vy; }
      }
    }

    function draw() {
      raf = null;
      if (destroyed) return;
      if (settling > 0) { stepForces(); settling--; }
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      var w = canvas.width / dpr, h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + view.x, h / 2 + view.y);
      ctx.scale(view.scale, view.scale);

      ctx.lineWidth = 1;
      for (var k = 0; k < G.edges.length; k++) {
        var e = G.edges[k];
        var s = G.byId[e.src], d = G.byId[e.dst];
        ctx.strokeStyle = COLORS.edge;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
        // relation label on hover-scale zooms only (avoid clutter)
        if (view.scale > 1.35 && e.rel_label) {
          ctx.fillStyle = COLORS.edgeLabel;
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillText(e.rel_label, (s.x + d.x) / 2 + 4, (s.y + d.y) / 2 - 3);
        }
      }
      for (var i = 0; i < G.nodes.length; i++) {
        var nd = G.nodes[i];
        var r = nd.qid === focusQid ? 11 : (5 + Math.min(5, nd.deg * 0.7));
        if (nd.qid === selQid) {
          ctx.fillStyle = COLORS.focusRing;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, r + 6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (nd.parent && nd.qid !== focusQid) {
          ctx.strokeStyle = COLORS.parentRing;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Content-status ring: drawn further out than the parent ring so the
        // two never merge into one shape (a node can be both a parent AND, say,
        // untranslated). 'native' (ordinary original-language article) is the
        // common case and deliberately carries no ring.
        var stateRing = STATE_RING[nd.state];
        if (stateRing) {
          ctx.strokeStyle = stateRing.color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash(stateRing.dash);
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, r + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = COLORS[nd.kind] || COLORS.unknown;
        ctx.globalAlpha = nd.kind === 'stub' ? 0.7 : 1;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (nd.qid === focusQid || nd.deg > 1 || view.scale > 1.1 || nd.qid === selQid) {
          ctx.fillStyle = COLORS.label;
          ctx.font = (nd.qid === focusQid ? '600 12px' : '11px') + ' Inter, system-ui, sans-serif';
          ctx.fillText(nd.label.slice(0, 28), nd.x + r + 4, nd.y + 4);
        }
      }
      ctx.restore();
      if (settling > 0) kickDraw();
    }
    function kickDraw() { if (!raf && !destroyed) raf = requestAnimationFrame(draw); }

    // ---- pointer interaction (pan / zoom / pick) ----
    var drag = null;
    function toWorld(px, py) {
      var r = canvas.getBoundingClientRect();
      var w = r.width, h = r.height;
      return [
        (px - r.left - w / 2 - view.x) / view.scale,
        (py - r.top - h / 2 - view.y) / view.scale,
      ];
    }
    function pick(px, py) {
      var p = toWorld(px, py);
      var best = null, bestD = 18 / view.scale;
      for (var i = 0; i < G.nodes.length; i++) {
        var nd = G.nodes[i];
        var d = Math.hypot(nd.x - p[0], nd.y - p[1]);
        if (d < bestD) { bestD = d; best = nd; }
      }
      return best;
    }
    // Touch policy (see the touch-action:pan-y rule in library.css): a lone
    // finger is left alone so the browser scrolls the *page* natively (the
    // stage is one block in a long mobile page, not the whole viewport) --
    // only a second finger arriving turns the gesture into a pinch-pan/zoom
    // of the graph. Mouse/pen keep the original single-pointer drag-to-pan.
    // `pointers` tracks every currently-down pointer so the code can tell a
    // lone touch from the first half of a pinch; the three gesture states
    // below (`drag` for mouse, `touchTap` for a lone finger, `pinch` for two)
    // are kept mutually exclusive so no two of them ever fight over `view`.
    var pointers = new Map(); // pointerId -> {x, y}
    var touchTap = null;      // lone-finger tap/double-tap tracking (no panning)
    var pinch = null;         // two-finger pan+zoom state
    function pinchPointsOf() { return Array.from(pointers.values()).slice(0, 2); }
    canvas.addEventListener('pointerdown', function (ev) {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size >= 2) {
        touchTap = null;
        drag = null;
        var pts = pinchPointsOf();
        var d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinch = {
          startDist: d0, startScale: view.scale,
          startMidX: (pts[0].x + pts[1].x) / 2, startMidY: (pts[0].y + pts[1].y) / 2,
          startViewX: view.x, startViewY: view.y,
        };
        canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
      if (ev.pointerType === 'touch') {
        touchTap = { x: ev.clientX, y: ev.clientY, moved: false };
        return; // no capture/preventDefault: let the page scroll natively
      }
      drag = { x: ev.clientX, y: ev.clientY, moved: false };
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && pointers.size >= 2) {
        var pts = pinchPointsOf();
        var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
        view.scale = Math.min(3.5, Math.max(0.3, pinch.startScale * (d / pinch.startDist)));
        view.x = pinch.startViewX + (midX - pinch.startMidX);
        view.y = pinch.startViewY + (midY - pinch.startMidY);
        ev.preventDefault();
        kickDraw();
        return;
      }
      if (touchTap) {
        if (Math.abs(ev.clientX - touchTap.x) + Math.abs(ev.clientY - touchTap.y) > 3) touchTap.moved = true;
        return; // the page (not the graph) is what scrolls under a lone finger
      }
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.x += dx; view.y += dy;
      drag.x = ev.clientX; drag.y = ev.clientY;
      kickDraw();
    });
    // Double-click/double-tap-to-recenter: tracked here (rather than a native
    // 'dblclick' listener) because 'dblclick' isn't reliably synthesized for
    // touch pointers -- checking the same node was picked twice within a
    // short window works for both mouse and touch, and never fights with the
    // drag-to-pan gesture (which requires actual movement).
    var lastTap = null;
    var DBLTAP_MS = 350;
    function handleTap(px, py) {
      var nd = pick(px, py);
      if (!nd) { lastTap = null; return; }
      var now = Date.now();
      if (lastTap && lastTap.qid === nd.qid && (now - lastTap.time) < DBLTAP_MS) {
        lastTap = null;
        focusEntity(nd.qid);
      } else {
        lastTap = { qid: nd.qid, time: now };
        selectNode(nd.qid);
      }
    }
    canvas.addEventListener('pointerup', function (ev) {
      var wasPinch = pinch && pointers.size >= 2;
      pointers.delete(ev.pointerId);
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (wasPinch) {
        if (pointers.size < 2) pinch = null;
        return; // ending a pinch never selects/centers a node
      }
      if (touchTap) {
        var tt = touchTap; touchTap = null;
        if (!tt.moved) handleTap(ev.clientX, ev.clientY);
        return;
      }
      var wasClick = drag && !drag.moved;
      drag = null;
      if (wasClick) handleTap(ev.clientX, ev.clientY);
    });
    canvas.addEventListener('pointercancel', function (ev) {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = null;
      touchTap = null;
      drag = null;
    });
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var f = Math.exp(-ev.deltaY * 0.0012);
      view.scale = Math.min(3.5, Math.max(0.3, view.scale * f));
      kickDraw();
    }, { passive: false });

    // ---- data loading ----
    function showSideMsg(msg, withRetry) {
      list.innerHTML = '';
      list.appendChild(el('div', 'kg-msg', msg));
      if (withRetry) {
        var urlRow = el('div', 'kg-url-row');
        var inUrl = document.createElement('input');
        inUrl.type = 'text';
        inUrl.value = window.KNKB.getBaseUrl();
        inUrl.setAttribute('aria-label', t(STR.kbUrl));
        urlRow.appendChild(inUrl);
        var b = el('button', 'kg-btn', t(STR.retry));
        b.addEventListener('click', function () {
          window.KNKB.setBaseUrl(inUrl.value.trim());
          loadList('');
        });
        urlRow.appendChild(b);
        list.appendChild(urlRow);
      }
    }

    function loadList(q) {
      lastQ = q || '';
      showSideMsg(t(STR.loading));
      var qs = new URLSearchParams({ limit: '40' });
      if (q) qs.set('q', q);
      if (curCategory) qs.set('category', curCategory);
      // 'label' is a UI-level sort key; the API sorts on whichever language
      // column the reader is actually looking at.
      qs.set('sort', listSort.by === 'label' ? (lang === 'zh' ? 'label_zh' : 'label_en') : listSort.by);
      qs.set('dir', listSort.dir);
      window.KNKB.api('/api/entities?' + qs).then(function (r) {
        if (destroyed) return;
        list.innerHTML = '';
        if (!r.entities.length) {
          showSideMsg(t(q ? { en: 'No matches.', zh: '沒有符合的實體。' } : STR.empty));
          return;
        }
        r.entities.forEach(function (e) {
          var row = el('div', 'kg-entrow');
          var dotEl = el('span', 'dot');
          dotEl.style.background = COLORS[e.kind] || COLORS.unknown;
          var st = contentState(e, lang);
          var ring = STATE_RING[st];
          if (ring) { dotEl.style.boxShadow = '0 0 0 2px ' + ring.color; dotEl.title = t(LEGEND_STATE.find(function (p) { return p[0] === st; })[1]); }
          row.appendChild(dotEl);
          row.appendChild(el('span', 'nm', entLabel(e)));
          row.appendChild(el('span', 'deg', String(e.degree)));
          row.addEventListener('click', function () {
            focusEntity(e.qid);
            scrollIntoViewOnMobile(stage);
          });
          list.appendChild(row);
        });
        // First load: reopen on whatever node the reader last centered on (see
        // CENTER_KEY), falling back to the busiest entity so the stage is
        // never blank (including when the saved node no longer resolves). A
        // caller-supplied focus (a term link from the course) wins over both.
        if (!q && !focusQid && !focus && r.entities[0]) {
          var saved = savedCenterQid();
          focusEntity(saved || r.entities[0].qid, { fallbackQid: r.entities[0].qid });
        }
      }).catch(function () {
        if (!destroyed) showSideMsg(t(STR.offline), true);
      });
    }

    function focusEntity(qid, opts) {
      opts = opts || {};
      selQid = qid;
      if (!opts.skipHistory) {
        // A real navigation (click, search pick, "focus here"): drop any
        // forward history past the current point (like browser history), then
        // push -- unless we're already sitting on this node.
        if (histIdx < histStack.length - 1) histStack = histStack.slice(0, histIdx + 1);
        if (histStack[histIdx] !== qid) {
          histStack.push(qid);
          histIdx = histStack.length - 1;
        }
      }
      repaintHistButtons();
      window.KNKB.api('/api/graph?qid=' + encodeURIComponent(qid) + '&depth=' + depth)
        .then(function (r) {
          if (destroyed) return;
          setGraph(r.root, r.nodes, r.edges);
          saveCenterQid(qid);
          renderDetail(qid);
        })
        .catch(function (e) {
          if (destroyed) return;
          // A restored-from-storage center that no longer resolves (deleted
          // entity, stale id): fall back once to the caller-supplied default
          // instead of leaving the stage blank.
          if (opts.fallbackQid && qid !== opts.fallbackQid) {
            focusEntity(opts.fallbackQid, { skipHistory: opts.skipHistory });
            return;
          }
          detail.innerHTML = '';
          detail.appendChild(el('div', 'kg-msg', (e && e.message) || String(e)));
        });
    }

    function selectNode(qid) {
      selQid = qid;
      kickDraw();
      renderDetail(qid);
    }

    // ---- detail / reader panel (incl. the LLM-translate fallback) ----
    function renderDetail(qid) {
      detail.innerHTML = '';
      detail.appendChild(el('div', 'kg-msg', t(STR.loading)));
      window.KNKB.api('/api/entity?qid=' + encodeURIComponent(qid)).then(function (d) {
        if (destroyed || selQid !== qid) return;
        detail.innerHTML = '';
        var e = d.entity;
        var head = el('div', 'kg-d-head');
        var kdot = el('span', 'dot');
        kdot.style.background = COLORS[e.kind] || COLORS.unknown;
        head.appendChild(kdot);
        head.appendChild(el('h3', null, entLabel(e)));
        detail.appendChild(head);
        var metaBits = [e.qid, e.kind];
        if (e.birth) metaBits.push(e.birth.slice(0, 4) + '–' + (e.death ? e.death.slice(0, 4) : ''));
        detail.appendChild(el('div', 'kg-d-meta', metaBits.join(' · ')));
        if (e.description) detail.appendChild(el('p', 'kg-d-desc', e.description));

        if (qid !== focusQid) {
          var rec = el('button', 'kg-btn', t(STR.recenter));
          rec.addEventListener('click', function () { focusEntity(qid); });
          detail.appendChild(rec);
        }

        // relations summary (few, textual, read-only)
        var relLabel = function (ed) {
          return (lang === 'zh' ? (ed.label_zh || ed.label_en) : (ed.label_en || ed.label_zh)) || ed.dst;
        };
        if (relExpandedQid !== qid) { relExpanded = false; relExpandedQid = qid; }
        var allRels = (d.out || []).slice();
        if (relSort.by) {
          allRels.sort(function (a, b) {
            var va = relSort.by === 'name' ? relLabel(a) : (a.rel_label || a.rel);
            var vb = relSort.by === 'name' ? relLabel(b) : (b.rel_label || b.rel);
            var cmp = String(va).localeCompare(String(vb));
            return relSort.dir === 'asc' ? cmp : -cmp;
          });
        }
        var rels = relExpanded ? allRels : allRels.slice(0, 8);
        if (rels.length) {
          var sectRow = el('div', 'kg-d-sect-row');
          sectRow.appendChild(el('p', 'kg-d-sect', t(STR.outEdges)));
          var sortBar = el('div', 'kg-d-sort');
          [['rel', STR.sortByRel], ['name', STR.sortByName]].forEach(function (pair) {
            var key = pair[0];
            var label = t(pair[1]) + (relSort.by === key ? (relSort.dir === 'asc' ? ' ↑' : ' ↓') : '');
            var b = el('button', 'kg-btn kg-sort-btn' + (relSort.by === key ? ' active' : ''), label);
            b.addEventListener('click', function () {
              if (relSort.by === key) relSort.dir = relSort.dir === 'asc' ? 'desc' : 'asc';
              else { relSort.by = key; relSort.dir = 'asc'; }
              renderDetail(qid);
            });
            sortBar.appendChild(b);
          });
          sectRow.appendChild(sortBar);
          detail.appendChild(sectRow);
          var ul = el('div', 'kg-d-rels');
          rels.forEach(function (ed) {
            var row = el('div', 'kg-d-rel');
            row.appendChild(el('span', 'rel', ed.rel_label || ed.rel));
            var a = el('a', null, relLabel(ed));
            a.addEventListener('click', function () { selectNode(ed.dst); });
            row.appendChild(a);
            ul.appendChild(row);
          });
          detail.appendChild(ul);
          if (!relExpanded && allRels.length > rels.length) {
            var showAll = el('button', 'kg-btn', t(STR.showAllRels) + ' (' + allRels.length + ')');
            showAll.addEventListener('click', function () { relExpanded = true; renderDetail(qid); });
            detail.appendChild(showAll);
          }
        }

        detail.appendChild(el('p', 'kg-d-sect', t(STR.pages)));
        var pages = d.pages || [];
        var mine = pages.find(function (p) { return p.lang === lang; });
        if (mine) {
          window.KNKB.api('/api/page?id=' + mine.id).then(function (pr) {
            if (destroyed || selQid !== qid) return;
            var pg = pr.page;
            detail.appendChild(el('h4', 'kg-d-title', pg.title));
            detail.appendChild(el('p', 'kg-d-body', pg.summary || ''));
            var srcRow = el('div', 'kg-d-meta', t(STR.source) + ': ' + pg.source);
            detail.appendChild(srcRow);
            if (pg.source_lang) {
              detail.appendChild(el('div', 'kg-d-meta dim', t(STR.translatedFrom) + pg.source_lang));
            }
            // Detailed-content toggle: the summary above is always short;
            // the full stored article (fetched on demand via ?chunks=1, since
            // most readers never open it) goes here, below the summary and
            // above the outbound Wikipedia link.
            if (pg.contentChars > 0) {
              var fullBtn = el('button', 'kg-btn', t(STR.showFullContent));
              var fullBox = null;
              fullBtn.addEventListener('click', function () {
                if (fullBox) { fullBox.remove(); fullBox = null; fullBtn.textContent = t(STR.showFullContent); return; }
                fullBtn.disabled = true;
                window.KNKB.api('/api/page?id=' + mine.id + '&chunks=1').then(function (cr) {
                  if (destroyed || selQid !== qid) return;
                  fullBtn.disabled = false;
                  fullBtn.textContent = t(STR.hideFullContent);
                  fullBox = el('div', 'kg-d-body kg-preview');
                  fullBox.textContent = (cr.chunks || []).map(function (c) { return c.text; }).join('\n\n') || pg.summary || '';
                  fullBtn.insertAdjacentElement('afterend', fullBox);
                }).catch(function () {
                  fullBtn.disabled = false;
                });
              });
              detail.appendChild(fullBtn);
            }
            if (pg.url) {
              var a = el('a', 'kg-d-link', t(STR.readMore));
              a.href = pg.url; a.target = '_blank'; a.rel = 'noopener';
              detail.appendChild(a);
            }
          }).catch(function () {});
          return;
        }

        // -------- no article in the reader's language --------
        // Shared "preview -> add/correct/delete" rendering for both the
        // translate flow (a source article exists in another language) and
        // the generate flow (no source anywhere -- see below). `tr` is the
        // LLM response; `sourceTag`/`metaNode` distinguish provenance for
        // /api/contribute and the line shown right under the preview.
        function renderLlmPreview(box, tr, sourceTag, metaNode) {
          box.appendChild(el('p', 'kg-d-sect', t(STR.translated) + ' · ' + tr.model));
          if (metaNode) box.appendChild(metaNode);
          box.appendChild(el('h4', 'kg-d-title', tr.title));
          var bodyP = el('p', 'kg-d-body kg-preview', tr.content.length > 900 ? tr.content.slice(0, 900) + '…' : tr.content);
          box.appendChild(bodyP);

          // LLM-suggested links to other existing graph topics (generate flow
          // only -- see wiki-kb/lib/translate.mjs generateEntityArticle). The
          // model could only select QIDs from a fixed candidate list it was
          // handed, so these are safe to show as pre-checked, reader-reviewed
          // suggestions; nothing is written until "Add to knowledge graph".
          var linkChecks = [];
          if (tr.suggestedLinks && tr.suggestedLinks.length) {
            box.appendChild(el('p', 'kg-d-sect', t(STR.suggestedLinksHead)));
            box.appendChild(el('p', 'kg-d-meta dim', t(STR.suggestedLinksNote)));
            tr.suggestedLinks.forEach(function (sl) {
              var row = el('label', 'kg-suggest-row');
              var cb = document.createElement('input');
              cb.type = 'checkbox'; cb.checked = true; cb.dataset.qid = sl.qid;
              row.appendChild(cb);
              row.appendChild(document.createTextNode(' ' + sl.label + ' (' + sl.qid + ')'));
              box.appendChild(row);
              linkChecks.push(cb);
            });
          }

          var add = el('button', 'kg-btn primary', t(STR.addToKb));
          box.appendChild(add);

          // Contributed content so far -- kept mutable so a follow-up
          // correction (re-contribute under the same lang+title, which
          // upserts in place) always sends the latest saved version.
          var current = {
            title: tr.title, summary: tr.summary, content: tr.content, kind: tr.kind || 'topic',
            pageId: null, sourceLang: tr.sourceLang || null,
          };

          function contribute(payload, onOk, onErr) {
            window.KNKB.api('/api/contribute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.assign(
                { lang: lang, qid: qid, source: sourceTag, sourceLang: current.sourceLang }, payload
              )),
            }).then(function (cr) {
              if (destroyed) return;
              current.pageId = cr.pageId;
              onOk(cr);
            }).catch(function (er) { onErr(er); });
          }

          // After a save (initial add, or a later correction): the reader
          // can still say "not quite right" and either re-edit or delete
          // this contribution outright.
          function renderPostAddControls(msgKey) {
            box.appendChild(el('p', 'kg-d-body ok', t(STR[msgKey])));
            var actions = el('div', 'kg-translate');
            var correctBtn = el('button', 'kg-btn', t(STR.correctBtn));
            var delBtn = el('button', 'kg-btn', t(STR.deleteBtn));
            actions.appendChild(correctBtn);
            actions.appendChild(delBtn);
            box.appendChild(actions);

            delBtn.addEventListener('click', function () {
              if (!window.confirm(t(STR.deleteConfirm))) return;
              delBtn.disabled = true; correctBtn.disabled = true;
              window.KNKB.api('/api/page?id=' + current.pageId, { method: 'DELETE' }).then(function () {
                if (destroyed) return;
                actions.remove();
                box.appendChild(el('p', 'kg-d-body dim', t(STR.deleted)));
              }).catch(function (er) {
                delBtn.disabled = false; correctBtn.disabled = false;
                box.appendChild(el('p', 'kg-d-body err', t(STR.addErr) + (er.message || er)));
              });
            });

            correctBtn.addEventListener('click', function () {
              actions.remove();
              var editBox = el('div', 'kg-translate');
              var titleIn = el('input', 'kg-edit-title');
              titleIn.type = 'text'; titleIn.value = current.title;
              var contentTa = el('textarea', 'kg-edit-content');
              contentTa.value = current.content;
              editBox.appendChild(el('p', 'kg-d-sect', t(STR.correctTitle)));
              editBox.appendChild(titleIn);
              editBox.appendChild(contentTa);
              var saveBtn = el('button', 'kg-btn primary', t(STR.correctSave));
              var cancelBtn = el('button', 'kg-btn', t(STR.correctCancel));
              editBox.appendChild(saveBtn);
              editBox.appendChild(cancelBtn);
              box.appendChild(editBox);

              cancelBtn.addEventListener('click', function () {
                editBox.remove();
                box.appendChild(actions);
              });
              saveBtn.addEventListener('click', function () {
                saveBtn.disabled = true; cancelBtn.disabled = true;
                contribute({
                  title: titleIn.value.trim() || current.title,
                  summary: current.summary,
                  content: contentTa.value,
                  kind: current.kind,
                }, function () {
                  if (destroyed) return;
                  current.title = titleIn.value.trim() || current.title;
                  current.content = contentTa.value;
                  editBox.remove();
                  renderPostAddControls('corrected');
                }, function (er) {
                  saveBtn.disabled = false; cancelBtn.disabled = false;
                  editBox.appendChild(el('p', 'kg-d-body err', t(STR.addErr) + (er.message || er)));
                });
              });
            });
          }

          add.addEventListener('click', function () {
            add.disabled = true;
            add.textContent = t(STR.adding);
            var relatedLinks = linkChecks
              .filter(function (cb) { return cb.checked; })
              .map(function (cb) { return { qid: cb.dataset.qid }; });
            var payload = { title: current.title, summary: current.summary, content: current.content, kind: current.kind };
            if (relatedLinks.length) payload.relatedLinks = relatedLinks;
            contribute(payload, function () {
              add.remove();
              renderPostAddControls('added');
            }, function (er) {
              add.disabled = false;
              add.textContent = t(STR.addToKb);
              box.appendChild(el('p', 'kg-d-body err', t(STR.addErr) + (er.message || er)));
            });
          });
        }

        // Shared progress-bar/cancel/busy-refuse plumbing around one LLM
        // call (translate OR generate). `run` performs the actual
        // window.KNKB.api(...) call and receives the AbortSignal to attach.
        function runLlmDraft(opts) {
          var tb = opts.tb, box = opts.box;
          tb.disabled = true;
          // No real total to measure progress against (an LLM's output length
          // isn't known ahead of time), so this is a time-based indeterminate
          // bar plus an elapsed-seconds label -- honest about being an
          // estimate, but still gives the reader visible movement and a way
          // out via the cancel button (which aborts the fetch; the server
          // then aborts its own call to Ollama, see wiki-kb/lib/routes.mjs).
          var ac = new AbortController();
          var startTs = Date.now();
          var prog = el('div', 'kg-progress busy');
          var progLabel = el('div', 'kg-progress-label', t(opts.progressStr));
          var progBar = el('div', 'kg-progress-bar');
          var progFill = el('div', 'kg-progress-fill');
          progBar.appendChild(progFill);
          var cancelBtn = el('button', 'kg-btn', t(STR.cancel));
          prog.appendChild(progLabel);
          prog.appendChild(progBar);
          prog.appendChild(cancelBtn);
          box.appendChild(prog);
          var elapsedTimer = setInterval(function () {
            progLabel.textContent = t(opts.progressStr) + ' (' + Math.round((Date.now() - startTs) / 1000) + 's)';
          }, 1000);
          cancelBtn.addEventListener('click', function () { ac.abort(); });

          opts.run(ac.signal).then(function (tr) {
            clearInterval(elapsedTimer);
            if (destroyed || selQid !== qid) return;
            prog.remove();
            renderLlmPreview(box, tr, opts.sourceTag, opts.metaNode(tr));
          }).catch(function (er) {
            clearInterval(elapsedTimer);
            if (destroyed) return;
            prog.remove();
            tb.disabled = false;
            if (ac.signal.aborted) {
              box.appendChild(el('p', 'kg-d-body dim', t(opts.cancelledStr)));
            } else if (er && er.message === 'busy') {
              box.appendChild(el('p', 'kg-d-body err', t(STR.busyErr)));
            } else {
              box.appendChild(el('p', 'kg-d-body err', t(opts.errStr) + (er.message || er)));
            }
          });
        }

        detail.appendChild(el('p', 'kg-d-body dim', t(STR.noLangPage)));
        var box = el('div', 'kg-translate');
        detail.appendChild(box);

        if (pages.length) {
          // -------- translate: a source article exists in another language --------
          var src = pages.find(function (p) { return p.lang === 'en'; })
            || pages.find(function (p) { return p.lang === 'zh'; })
            || pages[0];
          var tb = el('button', 'kg-btn primary', t(STR.translateWith) + src.lang + ' · "' + src.title + '")');
          box.appendChild(tb);
          tb.addEventListener('click', function () {
            runLlmDraft({
              tb: tb, box: box, progressStr: STR.translating, cancelledStr: STR.translateCancelled,
              errStr: STR.translateErr, sourceTag: 'llm-translation',
              metaNode: function (tr) { return el('p', 'kg-d-meta', t(STR.translatedFrom) + tr.sourceLang); },
              run: function (signal) {
                return window.KNKB.api('/api/translate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pageId: src.id, target: lang }),
                  signal: signal,
                });
              },
            });
          });
        } else {
          // -------- generate: no source article in any language (a Wikidata
          // stub node) -- offer an LLM-written, explicitly-unverified draft
          // instead, seeded from the entity's label/kind/relations. --------
          var gb = el('button', 'kg-btn primary', t(STR.generateWith));
          box.appendChild(gb);
          gb.addEventListener('click', function () {
            runLlmDraft({
              tb: gb, box: box, progressStr: STR.generating, cancelledStr: STR.generateCancelled,
              errStr: STR.generateErr, sourceTag: 'llm-generated',
              metaNode: function () { return el('p', 'kg-d-meta warn', t(STR.generatedDisclaimer)); },
              run: function (signal) {
                return window.KNKB.api('/api/entity/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ qid: qid, target: lang }),
                  signal: signal,
                });
              },
            });
          });
        }
      }).catch(function (e2) {
        if (destroyed) return;
        detail.innerHTML = '';
        detail.appendChild(el('div', 'kg-msg', (e2 && e2.message) || String(e2)));
      });
    }

    // ---- search wiring ----
    var searchTimer = null;
    inQ.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { loadList(inQ.value.trim()); }, 300);
    });

    repaintDepthBtns();
    repaintHistButtons();
    resize();
    if (focus) {
      if (focus.q) inQ.value = focus.q;
      loadList(focus.q || '');
      if (focus.qid) {
        focusEntity(focus.qid);
      } else {
        // Label-only link (the term has no entity id yet): center on the best
        // match the KB can offer for that label.
        window.KNKB.api('/api/entities?limit=1&q=' + encodeURIComponent(focus.q)).then(function (r) {
          if (destroyed) return;
          if (r.entities && r.entities[0]) focusEntity(r.entities[0].qid);
        }).catch(function () { /* the browse list already reports the failure */ });
      }
    } else {
      loadList('');
    }
    detail.appendChild(el('div', 'kg-msg', t(STR.pickNode)));

    return {
      destroy: function () {
        destroyed = true;
        window.removeEventListener('resize', resize);
        document.removeEventListener('click', hideLegend);
        if (raf) cancelAnimationFrame(raf);
        container.classList.remove('kg-root');
        container.innerHTML = '';
      },
    };
  }

  window.KNKG = { mount: mount };
})();
