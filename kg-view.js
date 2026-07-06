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
    addToKb: { en: 'Add to knowledge graph', zh: '加入知識圖譜' },
    adding: { en: 'Adding…', zh: '加入中…' },
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
      en: 'Drag to pan · scroll to zoom · click a node to read · ringed nodes are parents',
      zh: '拖曳平移 · 滾輪縮放 · 點選節點閱讀 · 有外框的節點為上層(父)節點',
    },
    depthLabel: { en: 'Link depth', zh: '連結層數' },
    histPrev: { en: 'Previous center', zh: '上一個中心點' },
    histNext: { en: 'Next center', zh: '下一個中心點' },
  };

  // Small stroke icons (match the muted style used elsewhere in the app --
  // currentColor, no fill, gentle strokes).
  var ICON_CHEVRON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
  var ICON_CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------- component
  // KNKG.mount(container, { lang }) -> { destroy, setLang }
  function mount(container, opts) {
    var lang = (opts && opts.lang) || 'en';
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
    var hint = el('div', 'kg-hint', t(STR.hint));
    stage.appendChild(hint);

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
    stage.appendChild(toolbar);
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

    var searchWrap = el('div', 'kg-search');
    var inQ = document.createElement('input');
    inQ.type = 'text';
    inQ.placeholder = t(STR.search);
    searchWrap.appendChild(inQ);
    side.appendChild(searchWrap);
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
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
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
    canvas.addEventListener('pointerdown', function (ev) {
      drag = { x: ev.clientX, y: ev.clientY, moved: false };
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.x += dx; view.y += dy;
      drag.x = ev.clientX; drag.y = ev.clientY;
      kickDraw();
    });
    canvas.addEventListener('pointerup', function (ev) {
      var wasClick = drag && !drag.moved;
      drag = null;
      if (wasClick) {
        var nd = pick(ev.clientX, ev.clientY);
        if (nd) selectNode(nd.qid);
      }
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
          row.appendChild(dotEl);
          row.appendChild(el('span', 'nm', entLabel(e)));
          row.appendChild(el('span', 'deg', String(e.degree)));
          row.addEventListener('click', function () { focusEntity(e.qid); });
          list.appendChild(row);
        });
        // First load: focus the busiest entity so the stage is never blank.
        if (!q && !focusQid && r.entities[0]) focusEntity(r.entities[0].qid);
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
          renderDetail(qid);
        })
        .catch(function (e) {
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
            if (pg.url) {
              var a = el('a', 'kg-d-link', t(STR.readMore));
              a.href = pg.url; a.target = '_blank'; a.rel = 'noopener';
              detail.appendChild(a);
            }
          }).catch(function () {});
          return;
        }

        // -------- no article in the reader's language --------
        detail.appendChild(el('p', 'kg-d-body dim', t(STR.noLangPage)));
        if (!pages.length) return;
        // translation source: prefer en, then zh, then whatever exists
        var src = pages.find(function (p) { return p.lang === 'en'; })
          || pages.find(function (p) { return p.lang === 'zh'; })
          || pages[0];
        var box = el('div', 'kg-translate');
        var tb = el('button', 'kg-btn primary', t(STR.translateWith) + src.lang + ' · "' + src.title + '")');
        box.appendChild(tb);
        detail.appendChild(box);
        tb.addEventListener('click', function () {
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
          var progLabel = el('div', 'kg-progress-label', t(STR.translating));
          var progBar = el('div', 'kg-progress-bar');
          var progFill = el('div', 'kg-progress-fill');
          progBar.appendChild(progFill);
          var cancelBtn = el('button', 'kg-btn', t(STR.cancel));
          prog.appendChild(progLabel);
          prog.appendChild(progBar);
          prog.appendChild(cancelBtn);
          box.appendChild(prog);
          var elapsedTimer = setInterval(function () {
            progLabel.textContent = t(STR.translating) + ' (' + Math.round((Date.now() - startTs) / 1000) + 's)';
          }, 1000);
          cancelBtn.addEventListener('click', function () { ac.abort(); });

          window.KNKB.api('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: src.id, target: lang }),
            signal: ac.signal,
          }).then(function (tr) {
            clearInterval(elapsedTimer);
            if (destroyed || selQid !== qid) return;
            prog.remove();
            box.appendChild(el('p', 'kg-d-sect', t(STR.translated) + ' · ' + tr.model));
            box.appendChild(el('p', 'kg-d-meta', t(STR.translatedFrom) + tr.sourceLang));
            box.appendChild(el('h4', 'kg-d-title', tr.title));
            var bodyP = el('p', 'kg-d-body kg-preview', tr.content.length > 900 ? tr.content.slice(0, 900) + '…' : tr.content);
            box.appendChild(bodyP);
            var add = el('button', 'kg-btn primary', t(STR.addToKb));
            box.appendChild(add);

            // Contributed content so far -- kept mutable so a follow-up
            // correction (re-contribute under the same lang+title, which
            // upserts in place) always sends the latest saved version.
            var current = {
              title: tr.title, summary: tr.summary, content: tr.content, kind: tr.kind || 'topic',
              pageId: null, sourceLang: tr.sourceLang,
            };

            function contribute(payload, onOk, onErr) {
              window.KNKB.api('/api/contribute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign(
                  { lang: lang, qid: qid, source: 'llm-translation', sourceLang: current.sourceLang }, payload
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
              contribute({ title: current.title, summary: current.summary, content: current.content, kind: current.kind }, function () {
                add.remove();
                renderPostAddControls('added');
              }, function (er) {
                add.disabled = false;
                add.textContent = t(STR.addToKb);
                box.appendChild(el('p', 'kg-d-body err', t(STR.addErr) + (er.message || er)));
              });
            });
          }).catch(function (er) {
            clearInterval(elapsedTimer);
            if (destroyed) return;
            prog.remove();
            tb.disabled = false;
            if (ac.signal.aborted) {
              box.appendChild(el('p', 'kg-d-body dim', t(STR.translateCancelled)));
            } else {
              box.appendChild(el('p', 'kg-d-body err', t(STR.translateErr) + (er.message || er)));
            }
          });
        });
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
    loadList('');
    detail.appendChild(el('div', 'kg-msg', t(STR.pickNode)));

    return {
      destroy: function () {
        destroyed = true;
        window.removeEventListener('resize', resize);
        if (raf) cancelAnimationFrame(raf);
        container.classList.remove('kg-root');
        container.innerHTML = '';
      },
    };
  }

  window.KNKG = { mount: mount };
})();
