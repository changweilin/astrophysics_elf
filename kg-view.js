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
    stub: '#4a5262',
    unknown: '#4a5262',
    edge: 'rgba(120,132,152,0.28)',
    edgeLabel: '#6b7482',
    label: '#c8cfda',
    focusRing: 'rgba(111,195,201,0.35)',
  };

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
    addToKb: { en: 'Add to knowledge graph', zh: '加入知識圖譜' },
    adding: { en: 'Adding…', zh: '加入中…' },
    added: { en: 'Added — this article is now part of the knowledge base.', zh: '已加入——這篇內容現在是知識庫的一部分了。' },
    translateErr: { en: 'Translation failed: ', zh: '翻譯失敗:' },
    addErr: { en: 'Could not add: ', zh: '加入失敗:' },
    source: { en: 'source', zh: '來源' },
    readMore: { en: 'Full article on Wikipedia ↗', zh: '在 Wikipedia 閱讀全文 ↗' },
    hint: {
      en: 'Drag to pan · scroll to zoom · click a node to read',
      zh: '拖曳平移 · 滾輪縮放 · 點選節點閱讀',
    },
  };

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
    var listTitle = el('p', 'kg-side-title', t(STR.browse));
    side.appendChild(listTitle);
    var list = el('div', 'kg-entlist');
    side.appendChild(list);

    // ---- graph model + layout ----
    var G = { nodes: [], edges: [], byId: {} };  // layout state
    var focusQid = null;
    var selQid = null;
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
      showSideMsg(t(STR.loading));
      var qs = new URLSearchParams({ limit: '40' });
      if (q) qs.set('q', q);
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

    function focusEntity(qid) {
      selQid = qid;
      window.KNKB.api('/api/graph?qid=' + encodeURIComponent(qid) + '&depth=1')
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
        var rels = (d.out || []).slice(0, 8);
        if (rels.length) {
          detail.appendChild(el('p', 'kg-d-sect', t(STR.outEdges)));
          var ul = el('div', 'kg-d-rels');
          rels.forEach(function (ed) {
            var row = el('div', 'kg-d-rel');
            row.appendChild(el('span', 'rel', ed.rel_label || ed.rel));
            var a = el('a', null, (lang === 'zh' ? (ed.label_zh || ed.label_en) : (ed.label_en || ed.label_zh)) || ed.dst);
            a.addEventListener('click', function () { selectNode(ed.dst); });
            row.appendChild(a);
            ul.appendChild(row);
          });
          detail.appendChild(ul);
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
          box.appendChild(el('p', 'kg-d-body dim busy', t(STR.translating)));
          window.KNKB.api('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: src.id, target: lang }),
          }).then(function (tr) {
            if (destroyed || selQid !== qid) return;
            var busy = box.querySelector('.busy');
            if (busy) busy.remove();
            box.appendChild(el('p', 'kg-d-sect', t(STR.translated) + ' · ' + tr.model));
            box.appendChild(el('h4', 'kg-d-title', tr.title));
            var bodyP = el('p', 'kg-d-body kg-preview', tr.content.length > 900 ? tr.content.slice(0, 900) + '…' : tr.content);
            box.appendChild(bodyP);
            var add = el('button', 'kg-btn primary', t(STR.addToKb));
            box.appendChild(add);
            add.addEventListener('click', function () {
              add.disabled = true;
              add.textContent = t(STR.adding);
              window.KNKB.api('/api/contribute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  lang: lang,
                  title: tr.title,
                  summary: tr.summary,
                  content: tr.content,
                  kind: tr.kind || 'topic',
                  qid: qid,
                  source: 'llm-translation',
                }),
              }).then(function () {
                if (destroyed) return;
                add.remove();
                box.appendChild(el('p', 'kg-d-body ok', t(STR.added)));
              }).catch(function (er) {
                add.disabled = false;
                add.textContent = t(STR.addToKb);
                box.appendChild(el('p', 'kg-d-body err', t(STR.addErr) + (er.message || er)));
              });
            });
          }).catch(function (er) {
            if (destroyed) return;
            var busy = box.querySelector('.busy');
            if (busy) busy.remove();
            tb.disabled = false;
            box.appendChild(el('p', 'kg-d-body err', t(STR.translateErr) + (er.message || er)));
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
