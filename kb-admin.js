/* kb-admin.js — hidden management console for the wiki-kb service.
 *
 * Plain DOM (no React/Babel), same pattern as library.js. Talks to the wiki-kb
 * HTTP API through window.KNKB (kb-config.js). The page is collaborative in the
 * simple sense: several people can keep it open against the same wiki-kb
 * instance; every mutation is written to the shared sync log (activity tab),
 * and each tab re-fetches on entry so views converge on the server state.
 *
 * Bilingual zh/en, persisted to the shared 'kn-lang' key.
 */
(function () {
  var LANG_KEY = 'kn-lang';
  var KB_LANGS = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'it'];
  var lang = (function () {
    try { var s = localStorage.getItem(LANG_KEY); if (s === 'zh' || s === 'en') return s; } catch (e) {}
    return 'zh';
  })();

  function t(pair) {
    if (pair == null) return '';
    if (typeof pair === 'string') return pair;
    return pair[lang] != null ? pair[lang] : pair.en;
  }

  var S = {
    tab: 'overview',
    // pages tab
    pFilter: { lang: '', kind: '', status: 'active', q: '', offset: 0 },
    pData: null,
    // graph tab
    gQuery: '',
    gList: [],
    gSel: null,       // qid
    gDetail: null,
    // rag tab
    rQuery: '',
    rLangs: ['zh', 'en'],
    rResults: null,
    rContext: null,
    // log tab
    logRows: null,
  };

  var TABS = [
    { id: 'overview', label: { en: 'Overview', zh: '總覽' } },
    { id: 'pages', label: { en: 'Pages (RAG corpus)', zh: '頁面(RAG 語料)' } },
    { id: 'graph', label: { en: 'Knowledge graph', zh: '知識圖譜' } },
    { id: 'rag', label: { en: 'RAG test', zh: 'RAG 檢索測試' } },
    { id: 'log', label: { en: 'Activity', zh: '協作紀錄' } },
  ];

  // Common Wikidata relations for the add-edge form (same set as graph.mjs).
  var RELS = [
    ['P31', 'instance of'], ['P279', 'subclass of'], ['P361', 'part of'],
    ['P527', 'has part'], ['P397', 'parent astronomical body'], ['P61', 'discoverer or inventor'],
    ['P101', 'field of work'], ['P737', 'influenced by'], ['P184', 'doctoral advisor'],
    ['P185', 'doctoral student'], ['P1066', 'student of'], ['P800', 'notable work'],
    ['related', 'related to'],
  ];

  // ---- tiny DOM helpers --------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(cls, label, onClick) {
    var b = el('button', cls, label);
    b.addEventListener('click', onClick);
    return b;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var toastTimer = null;
  function toast(kind, msg) {
    var old = document.querySelector('.ka-toast');
    if (old) old.remove();
    var d = el('div', 'ka-toast ' + kind, msg);
    document.body.appendChild(d);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { d.remove(); }, 3500);
  }
  function errToast(e) { toast('err', t({ en: 'Error: ', zh: '錯誤:' }) + (e && e.message || e)); }

  function modal(build) {
    var bg = el('div', 'ka-modal-bg');
    var box = el('div', 'ka-modal');
    bg.appendChild(box);
    bg.addEventListener('click', function (ev) { if (ev.target === bg) bg.remove(); });
    build(box, function () { bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  }

  function entLabel(e) {
    if (!e) return '?';
    var l = (lang === 'zh' ? (e.label_zh || e.label_en) : (e.label_en || e.label_zh));
    return l || e.qid;
  }

  // ---- header / health ----------------------------------------------------
  function refreshHealth() {
    var h = document.getElementById('ka-health');
    window.KNKB.api('/api/health').then(function (r) {
      h.className = 'ka-health on';
      h.querySelector('.txt').textContent =
        r.pages + ' pages · ' + r.edges + ' edges · embed ' + (r.embedReady ? 'ready' : 'off');
    }).catch(function () {
      h.className = 'ka-health off';
      h.querySelector('.txt').textContent = t({ en: 'offline', zh: '離線' });
    });
  }

  // ---- overview tab --------------------------------------------------------
  function renderOverview(main) {
    main.appendChild(el('p', 'ka-note', t({
      en: 'This console manages the shared wiki-kb service (knowledge graph + RAG corpus). It is unlinked — reachable only by direct URL. Changes are logged in the Activity tab for other collaborators.',
      zh: '此主控台管理共用的 wiki-kb 服務(知識圖譜 + RAG 語料)。頁面不在任何導覽列中,只能直接輸入網址進入;所有變更都會寫入「協作紀錄」供其他協作者查看。',
    })));
    var cards = el('div', 'ka-cards');
    main.appendChild(cards);
    var row = el('div', 'ka-row');
    main.appendChild(row);

    window.KNKB.api('/api/stats').then(function (r) {
      var s = r.stats;
      function card(k, v, sub) {
        var c = el('div', 'ka-card');
        c.appendChild(el('div', 'k', k));
        c.appendChild(el('div', 'v', String(v)));
        if (sub) c.appendChild(el('div', 'sub', sub));
        cards.appendChild(c);
      }
      card(t({ en: 'active pages', zh: '有效頁面' }), s.pagesActive,
        s.byLang.map(function (x) { return x.lang + ' ' + x.n; }).join(' · '));
      card(t({ en: 'chunks', zh: '文字區塊' }), s.chunks,
        t({ en: 'embedded ', zh: '已向量化 ' }) + s.embedded + ' (' +
        (s.chunks ? Math.round(100 * s.embedded / s.chunks) : 0) + '%)');
      card(t({ en: 'graph entities', zh: '圖譜實體' }), s.entities,
        t({ en: 'stubs ', zh: '殘根節點 ' }) + s.stubEntities);
      card(t({ en: 'graph edges', zh: '圖譜關聯' }), s.edges);
      card(t({ en: 'crawl queue', zh: '爬蟲佇列' }), s.queuePending,
        t({ en: 'errors ', zh: '錯誤 ' }) + s.queueErrors);
      card(t({ en: 'kinds', zh: '頁面類型' }), s.byKind.length,
        s.byKind.map(function (x) { return x.kind + ' ' + x.n; }).join(' · '));
      if (s.lastSync) {
        card(t({ en: 'last activity', zh: '最近活動' }), s.lastSync.kind,
          (s.lastSync.ts || '').replace('T', ' ').slice(0, 16) + ' · ' + (s.lastSync.title || ''));
      }
    }).catch(function (e) {
      cards.appendChild(el('div', 'ka-empty', t({
        en: 'Cannot reach wiki-kb. Start it with `node wiki-kb/server.mjs` or set the URL above.',
        zh: '無法連線 wiki-kb。請先執行 `node wiki-kb/server.mjs`,或在右上方設定服務位址。',
      }) + ' (' + (e && e.message || e) + ')'));
    });

    row.appendChild(btn('ka-btn', t({ en: 'Embed pending chunks now', zh: '立即向量化未處理區塊' }), function (ev) {
      ev.target.disabled = true;
      window.KNKB.api('/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function (r) {
          toast('ok', t({ en: 'Embedded ', zh: '已向量化 ' }) + r.embedded + t({ en: ' chunks', zh: ' 個區塊' }) +
            (r.remaining ? (t({ en: ', remaining ', zh: ',剩餘 ' }) + r.remaining) : ''));
          render();
        })
        .catch(errToast)
        .finally(function () { ev.target.disabled = false; });
    }));
    row.appendChild(btn('ka-btn', t({ en: 'Refresh', zh: '重新整理' }), render));
  }

  // ---- pages tab ------------------------------------------------------------
  function loadPages() {
    var f = S.pFilter;
    var qs = new URLSearchParams();
    if (f.lang) qs.set('lang', f.lang);
    if (f.kind) qs.set('kind', f.kind);
    if (f.status) qs.set('status', f.status);
    if (f.q) qs.set('q', f.q);
    qs.set('limit', '50');
    qs.set('offset', String(f.offset));
    return window.KNKB.api('/api/pages?' + qs).then(function (r) { S.pData = r; render(); });
  }

  function pageViewModal(id) {
    window.KNKB.api('/api/page?id=' + id + '&chunks=1').then(function (r) {
      modal(function (box, close) {
        var p = r.page;
        box.appendChild(el('h2', null, p.title));
        box.appendChild(el('div', 'meta',
          '#' + p.id + ' · ' + p.lang + ' · ' + p.kind + ' · ' + (p.qid || 'no-qid') +
          ' · ' + p.source + ' · ' + (p.contentChars || 0) + ' chars' +
          (r.categories && r.categories.length ? (' · ' + r.categories.slice(0, 6).join(', ')) : '')));
        var actions = el('div', 'ka-row');
        if (p.url) {
          var a = el('a', null, t({ en: 'Open source page ↗', zh: '開啟原始頁面 ↗' }));
          a.href = p.url; a.target = '_blank'; a.style.color = 'var(--cyan)';
          actions.appendChild(a);
        }
        if (p.source !== 'wikipedia') {
          actions.appendChild(btn('ka-btn', t({ en: 'Edit', zh: '編輯' }), function () {
            close();
            // Editing a manual page = re-contributing under the same lang+title.
            window.KNKB.api('/api/page?id=' + id).then(function () {
              contributeModal({
                lang: p.lang, title: p.title, kind: p.kind, qid: p.qid || '',
                summary: p.summary || '',
                content: (r.chunks || []).map(function (c) { return c.text; }).join('\n\n'),
                source: p.source,
              });
            }).catch(errToast);
          }));
        }
        box.appendChild(actions);
        box.appendChild(el('div', 'body', p.summary || ''));
        (r.chunks || []).forEach(function (c) {
          var d = el('div', 'chunk');
          if (c.section) d.appendChild(el('div', 'sec', c.section));
          d.appendChild(el('div', 'body', c.text));
          box.appendChild(d);
        });
        box.appendChild(el('div', 'ka-row')).appendChild(btn('ka-btn', t({ en: 'Close', zh: '關閉' }), close));
      });
    }).catch(errToast);
  }

  // Shared add/edit form for manual pages (notes, corrections, translations).
  function contributeModal(pre) {
    pre = pre || {};
    modal(function (box, close) {
      box.appendChild(el('h2', null, pre.title
        ? t({ en: 'Edit page', zh: '編輯頁面' })
        : t({ en: 'Add manual page', zh: '新增手動頁面' })));
      box.appendChild(el('div', 'meta', t({
        en: 'Stored in the RAG corpus; give it a QID (or tick "create graph node") to place it on the knowledge graph.',
        zh: '內容會存入 RAG 語料;填 QID(或勾選「建立圖譜節點」)即可掛上知識圖譜。',
      })));
      var form = el('div', 'ka-form');
      function frow(label, input) {
        var r = el('div', 'frow');
        r.appendChild(el('label', null, label));
        r.appendChild(input);
        form.appendChild(r);
        return input;
      }
      var selLang = el('select');
      KB_LANGS.forEach(function (c) {
        var o = el('option', null, c); o.value = c; selLang.appendChild(o);
      });
      selLang.value = pre.lang || lang;
      frow(t({ en: 'Language', zh: '語言' }), selLang);
      var inTitle = frow(t({ en: 'Title', zh: '標題' }), el('input'));
      inTitle.type = 'text'; inTitle.value = pre.title || '';
      var selKind = el('select');
      ['note', 'topic', 'scientist'].forEach(function (k) {
        var o = el('option', null, k); o.value = k; selKind.appendChild(o);
      });
      selKind.value = pre.kind && ['note', 'topic', 'scientist'].indexOf(pre.kind) >= 0 ? pre.kind : 'note';
      frow(t({ en: 'Kind', zh: '類型' }), selKind);
      var inQid = frow('QID', el('input'));
      inQid.type = 'text'; inQid.placeholder = 'Q937 / KN… (optional)'; inQid.value = pre.qid || '';
      var chkRow = el('div', 'frow');
      var chk = el('input'); chk.type = 'checkbox'; chk.id = 'ka-mk-ent';
      var chkLbl = el('label', null, t({ en: 'Create graph node when no QID', zh: '無 QID 時自動建立圖譜節點' }));
      chkLbl.htmlFor = 'ka-mk-ent';
      chkRow.appendChild(chk); chkRow.appendChild(chkLbl);
      form.appendChild(chkRow);
      var inSummary = el('textarea'); inSummary.style.minHeight = '60px';
      inSummary.value = pre.summary || '';
      frow(t({ en: 'Summary', zh: '摘要' }), inSummary);
      var inContent = el('textarea');
      inContent.value = pre.content || '';
      frow(t({ en: 'Content', zh: '內文' }), inContent);
      box.appendChild(form);

      var row = el('div', 'ka-row');
      row.style.marginTop = '12px';
      row.appendChild(btn('ka-btn primary', t({ en: 'Save', zh: '儲存' }), function (ev) {
        ev.target.disabled = true;
        window.KNKB.api('/api/contribute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lang: selLang.value,
            title: inTitle.value.trim(),
            kind: selKind.value,
            qid: inQid.value.trim() || undefined,
            createEntity: chk.checked || undefined,
            summary: inSummary.value.trim() || undefined,
            content: inContent.value,
            source: pre.source || 'admin',
          }),
        }).then(function (r) {
          toast('ok', t({ en: 'Saved: ', zh: '已儲存:' }) + r.title + ' (' + r.status + ')');
          close();
          loadPages().catch(errToast);
        }).catch(function (e) { errToast(e); ev.target.disabled = false; });
      }));
      row.appendChild(btn('ka-btn', t({ en: 'Cancel', zh: '取消' }), close));
      box.appendChild(row);
    });
  }

  function renderPages(main) {
    var f = S.pFilter;
    var bar = el('div', 'ka-row');

    var selLang = el('select');
    [['', t({ en: 'all languages', zh: '全部語言' })]].concat(KB_LANGS.map(function (c) { return [c, c]; }))
      .forEach(function (p) { var o = el('option', null, p[1]); o.value = p[0]; selLang.appendChild(o); });
    selLang.value = f.lang;
    selLang.addEventListener('change', function () { f.lang = selLang.value; f.offset = 0; loadPages().catch(errToast); });
    bar.appendChild(selLang);

    var selKind = el('select');
    [['', t({ en: 'all kinds', zh: '全部類型' })], ['topic', 'topic'], ['scientist', 'scientist'], ['note', 'note']]
      .forEach(function (p) { var o = el('option', null, p[1]); o.value = p[0]; selKind.appendChild(o); });
    selKind.value = f.kind;
    selKind.addEventListener('change', function () { f.kind = selKind.value; f.offset = 0; loadPages().catch(errToast); });
    bar.appendChild(selKind);

    var selStatus = el('select');
    [['active', t({ en: 'active', zh: '有效' })], ['deleted', t({ en: 'deleted', zh: '已刪除' })], ['all', t({ en: 'all', zh: '全部' })]]
      .forEach(function (p) { var o = el('option', null, p[1]); o.value = p[0]; selStatus.appendChild(o); });
    selStatus.value = f.status;
    selStatus.addEventListener('change', function () { f.status = selStatus.value; f.offset = 0; loadPages().catch(errToast); });
    bar.appendChild(selStatus);

    var inQ = el('input');
    inQ.type = 'text'; inQ.placeholder = t({ en: 'search title…', zh: '搜尋標題…' }); inQ.value = f.q;
    inQ.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { f.q = inQ.value.trim(); f.offset = 0; loadPages().catch(errToast); }
    });
    bar.appendChild(inQ);

    bar.appendChild(btn('ka-btn', t({ en: 'Search', zh: '搜尋' }), function () {
      f.q = inQ.value.trim(); f.offset = 0; loadPages().catch(errToast);
    }));
    var spacer = el('span'); spacer.style.flex = '1'; bar.appendChild(spacer);
    bar.appendChild(btn('ka-btn', t({ en: '+ Manual page', zh: '+ 手動頁面' }), function () { contributeModal(); }));
    bar.appendChild(btn('ka-btn', t({ en: '+ Ingest from Wikipedia', zh: '+ 從 Wikipedia 擷取' }), function () {
      modal(function (box, close) {
        box.appendChild(el('h2', null, t({ en: 'Ingest a Wikipedia page', zh: '從 Wikipedia 擷取頁面' })));
        var form = el('div', 'ka-form');
        var rowL = el('div', 'frow');
        rowL.appendChild(el('label', null, t({ en: 'Language', zh: '語言' })));
        var selL = el('select');
        KB_LANGS.forEach(function (c) { var o = el('option', null, c); o.value = c; selL.appendChild(o); });
        selL.value = lang;
        rowL.appendChild(selL); form.appendChild(rowL);
        var rowT = el('div', 'frow');
        rowT.appendChild(el('label', null, t({ en: 'Title', zh: '條目標題' })));
        var inT = el('input'); inT.type = 'text'; inT.placeholder = t({ en: 'e.g. Kerr metric', zh: '例:克爾度規' });
        rowT.appendChild(inT); form.appendChild(rowT);
        box.appendChild(form);
        var row = el('div', 'ka-row'); row.style.marginTop = '12px';
        row.appendChild(btn('ka-btn primary', t({ en: 'Ingest', zh: '擷取' }), function (ev) {
          if (!inT.value.trim()) return;
          ev.target.disabled = true;
          window.KNKB.api('/api/page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lang: selL.value, title: inT.value.trim(), force: true }),
          }).then(function (r) {
            toast(r.status === 'missing' ? 'err' : 'ok',
              t({ en: 'Ingest: ', zh: '擷取結果:' }) + (r.title || inT.value) + ' → ' + r.status);
            close();
            loadPages().catch(errToast);
          }).catch(function (e) { errToast(e); ev.target.disabled = false; });
        }));
        row.appendChild(btn('ka-btn', t({ en: 'Cancel', zh: '取消' }), close));
        box.appendChild(row);
      });
    }));
    main.appendChild(bar);

    if (!S.pData) {
      main.appendChild(el('div', 'ka-empty', t({ en: 'Loading…', zh: '載入中…' })));
      loadPages().catch(function (e) {
        clear(main);
        main.appendChild(el('div', 'ka-empty', t({ en: 'Cannot reach wiki-kb: ', zh: '無法連線 wiki-kb:' }) + (e.message || e)));
      });
      return;
    }

    var wrap = el('div', 'ka-tablewrap');
    var table = el('table', 'ka-table');
    var thead = el('thead');
    var trh = el('tr');
    ['#', t({ en: 'lang', zh: '語言' }), t({ en: 'title', zh: '標題' }), t({ en: 'kind', zh: '類型' }),
      'QID', t({ en: 'source', zh: '來源' }), t({ en: 'chunks', zh: '區塊' }),
      t({ en: 'updated', zh: '更新時間' }), ''].forEach(function (h) { trh.appendChild(el('th', null, h)); });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = el('tbody');
    S.pData.rows.forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('td', 'mono', String(p.id)));
      tr.appendChild(el('td', 'mono', p.lang));
      var tdT = el('td', 'title-cell');
      var aT = el('a', null, p.title);
      aT.href = '#'; aT.addEventListener('click', function (ev) { ev.preventDefault(); pageViewModal(p.id); });
      tdT.appendChild(aT);
      tr.appendChild(tdT);
      var tdK = el('td');
      tdK.appendChild(el('span', 'ka-badge ' + p.kind, p.kind));
      if (p.status === 'deleted') tdK.appendChild(el('span', 'ka-badge deleted', 'deleted'));
      tr.appendChild(tdK);
      tr.appendChild(el('td', 'mono', p.qid || '—'));
      tr.appendChild(el('td', 'mono', p.source));
      tr.appendChild(el('td', 'mono', String(p.chunks)));
      tr.appendChild(el('td', 'mono', (p.updated_at || '').replace('T', ' ').slice(0, 16)));
      var tdA = el('td');
      if (p.source === 'wikipedia' && p.status === 'active') {
        tdA.appendChild(btn('ka-mini', t({ en: 'refresh', zh: '重新擷取' }), function (ev) {
          ev.target.disabled = true;
          window.KNKB.api('/api/page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lang: p.lang, title: p.title, force: true }),
          }).then(function (r) {
            toast('ok', p.title + ' → ' + r.status);
            loadPages().catch(errToast);
          }).catch(function (e) { errToast(e); ev.target.disabled = false; });
        }));
      }
      if (p.status === 'active') {
        tdA.appendChild(document.createTextNode(' '));
        tdA.appendChild(btn('ka-mini danger', t({ en: 'delete', zh: '刪除' }), function () {
          if (!window.confirm(t({ en: 'Soft-delete "', zh: '確定刪除「' }) + p.title + t({ en: '"? (recoverable by re-ingesting)', zh: '」?(可重新擷取復原)' }))) return;
          window.KNKB.api('/api/page?id=' + p.id, { method: 'DELETE' }).then(function () {
            toast('ok', t({ en: 'Deleted: ', zh: '已刪除:' }) + p.title);
            loadPages().catch(errToast);
          }).catch(errToast);
        }));
      }
      tr.appendChild(tdA);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    main.appendChild(wrap);
    if (!S.pData.rows.length) main.appendChild(el('div', 'ka-empty', t({ en: 'No pages match.', zh: '沒有符合的頁面。' })));

    // pagination
    var pg = el('div', 'ka-row');
    pg.style.marginTop = '10px';
    var page = Math.floor(f.offset / 50) + 1;
    var pages = Math.max(1, Math.ceil(S.pData.total / 50));
    pg.appendChild(el('label', null, t({ en: 'Total ', zh: '共 ' }) + S.pData.total + t({ en: ' · page ', zh: ' 筆 · 第 ' }) + page + '/' + pages));
    var prev = btn('ka-btn', '←', function () { f.offset = Math.max(0, f.offset - 50); loadPages().catch(errToast); });
    prev.disabled = f.offset <= 0;
    var next = btn('ka-btn', '→', function () { f.offset += 50; loadPages().catch(errToast); });
    next.disabled = f.offset + 50 >= S.pData.total;
    pg.appendChild(prev);
    pg.appendChild(next);
    main.appendChild(pg);
  }

  // ---- graph tab -------------------------------------------------------------
  function loadEntities() {
    var qs = new URLSearchParams();
    if (S.gQuery) qs.set('q', S.gQuery);
    qs.set('limit', '80');
    return window.KNKB.api('/api/entities?' + qs).then(function (r) { S.gList = r.entities; render(); });
  }
  function loadEntityDetail(qid) {
    S.gSel = qid;
    S.gDetail = null;
    render();
    window.KNKB.api('/api/entity?qid=' + encodeURIComponent(qid))
      .then(function (r) { S.gDetail = r; render(); })
      .catch(errToast);
  }

  function entityFormModal(pre) {
    pre = pre || {};
    modal(function (box, close) {
      box.appendChild(el('h2', null, pre.qid
        ? t({ en: 'Edit entity', zh: '編輯實體' })
        : t({ en: 'New entity', zh: '新增實體' })));
      var form = el('div', 'ka-form');
      function frow(label, input) {
        var r = el('div', 'frow');
        r.appendChild(el('label', null, label));
        r.appendChild(input);
        form.appendChild(r);
        return input;
      }
      var inQid = frow('QID', el('input'));
      inQid.type = 'text'; inQid.placeholder = t({ en: 'blank = mint KN… id', zh: '留空 = 自動產生 KN… 編號' });
      inQid.value = pre.qid || '';
      if (pre.qid) inQid.disabled = true;
      var selKind = el('select');
      ['topic', 'person', 'note'].forEach(function (k) { var o = el('option', null, k); o.value = k; selKind.appendChild(o); });
      selKind.value = pre.kind && ['topic', 'person', 'note'].indexOf(pre.kind) >= 0 ? pre.kind : 'topic';
      frow(t({ en: 'Kind', zh: '類型' }), selKind);
      var inEn = frow('label (en)', el('input')); inEn.type = 'text'; inEn.value = pre.label_en || '';
      var inZh = frow('label (zh)', el('input')); inZh.type = 'text'; inZh.value = pre.label_zh || '';
      var inDesc = el('textarea'); inDesc.style.minHeight = '54px'; inDesc.value = pre.description || '';
      frow(t({ en: 'Description', zh: '描述' }), inDesc);
      box.appendChild(form);
      var row = el('div', 'ka-row'); row.style.marginTop = '12px';
      row.appendChild(btn('ka-btn primary', t({ en: 'Save', zh: '儲存' }), function (ev) {
        ev.target.disabled = true;
        window.KNKB.api('/api/entity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qid: inQid.value.trim() || undefined,
            kind: selKind.value,
            label_en: inEn.value.trim() || undefined,
            label_zh: inZh.value.trim() || undefined,
            description: inDesc.value.trim() || undefined,
          }),
        }).then(function (r) {
          toast('ok', t({ en: 'Saved entity ', zh: '已儲存實體 ' }) + r.entity.qid);
          close();
          loadEntities().catch(errToast);
          loadEntityDetail(r.entity.qid);
        }).catch(function (e) { errToast(e); ev.target.disabled = false; });
      }));
      row.appendChild(btn('ka-btn', t({ en: 'Cancel', zh: '取消' }), close));
      box.appendChild(row);
    });
  }

  function renderGraph(main) {
    main.appendChild(el('p', 'ka-note', t({
      en: 'Browse and edit graph entities and relations. The library page shows this graph read-only.',
      zh: '瀏覽並編輯圖譜實體與關聯。圖書館頁面以唯讀方式呈現同一張圖。',
    })));
    var split = el('div', 'ka-split');
    main.appendChild(split);

    // left: entity search + list
    var left = el('div', 'ka-pane');
    split.appendChild(left);
    var bar = el('div', 'ka-row');
    var inQ = el('input');
    inQ.type = 'text'; inQ.placeholder = t({ en: 'search entities…', zh: '搜尋實體…' }); inQ.value = S.gQuery;
    inQ.style.flex = '1';
    function doSearch() { S.gQuery = inQ.value.trim(); loadEntities().catch(errToast); }
    inQ.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doSearch(); });
    bar.appendChild(inQ);
    bar.appendChild(btn('ka-btn', t({ en: 'Go', zh: '搜尋' }), doSearch));
    left.appendChild(bar);
    left.appendChild(btn('ka-btn', t({ en: '+ New entity', zh: '+ 新增實體' }), function () { entityFormModal(); }));

    var list = el('div', 'ka-entlist');
    list.style.marginTop = '10px';
    left.appendChild(list);
    if (!S.gList.length) {
      list.appendChild(el('div', 'ka-empty', t({ en: 'Loading…', zh: '載入中…' })));
      loadEntities().catch(function (e) {
        clear(list);
        list.appendChild(el('div', 'ka-empty', (e.message || e)));
      });
    } else {
      S.gList.forEach(function (e) {
        var r = el('div', 'ka-entrow' + (S.gSel === e.qid ? ' sel' : ''));
        var nm = el('span');
        nm.appendChild(el('span', 'ka-badge ' + e.kind, e.kind));
        nm.appendChild(document.createTextNode(' ' + entLabel(e)));
        r.appendChild(nm);
        r.appendChild(el('span', 'deg', e.qid + ' · ' + e.degree));
        r.addEventListener('click', function () { loadEntityDetail(e.qid); });
        list.appendChild(r);
      });
    }

    // right: entity detail + edge management
    var right = el('div', 'ka-pane');
    split.appendChild(right);
    if (!S.gSel) {
      right.appendChild(el('div', 'ka-empty', t({ en: 'Select an entity on the left.', zh: '請從左側選擇一個實體。' })));
      return;
    }
    if (!S.gDetail) {
      right.appendChild(el('div', 'ka-empty', t({ en: 'Loading…', zh: '載入中…' })));
      return;
    }
    var d = S.gDetail;
    var e = d.entity;
    right.appendChild(el('h3', null, entLabel(e) + '  ·  ' + e.qid));
    var meta = el('div', 'ka-note',
      e.kind + (e.birth ? (' · ' + e.birth + ' — ' + (e.death || '')) : '') +
      (e.description ? (' · ' + e.description) : ''));
    right.appendChild(meta);
    right.appendChild(btn('ka-mini', t({ en: 'edit', zh: '編輯' }), function () { entityFormModal(e); }));

    function edgeList(title, rows, dir) {
      right.appendChild(el('h3', null, title));
      var box = el('div', 'ka-edges');
      right.appendChild(box);
      if (!rows.length) box.appendChild(el('div', 'ka-note', t({ en: '(none)', zh: '(無)' })));
      rows.forEach(function (ed) {
        var otherQid = dir === 'out' ? ed.dst : ed.src;
        var row = el('div', 'ka-edge');
        row.appendChild(el('span', 'rel', (dir === 'out' ? '→ ' : '← ') + (ed.rel_label || ed.rel)));
        var who = el('span', 'who');
        var a = el('a', null, (lang === 'zh' ? (ed.label_zh || ed.label_en) : (ed.label_en || ed.label_zh)) || otherQid);
        a.addEventListener('click', function () { loadEntityDetail(otherQid); });
        who.appendChild(a);
        who.appendChild(el('span', 'deg', ' ' + otherQid));
        row.appendChild(who);
        row.appendChild(btn('ka-mini danger', '×', function () {
          var src = dir === 'out' ? e.qid : otherQid;
          var dst = dir === 'out' ? otherQid : e.qid;
          if (!window.confirm(t({ en: 'Remove edge?', zh: '確定移除這條關聯?' }))) return;
          window.KNKB.api('/api/edge?src=' + encodeURIComponent(src) + '&rel=' + encodeURIComponent(ed.rel) + '&dst=' + encodeURIComponent(dst), { method: 'DELETE' })
            .then(function () { toast('ok', t({ en: 'Edge removed', zh: '已移除關聯' })); loadEntityDetail(e.qid); })
            .catch(errToast);
        }));
        box.appendChild(row);
      });
    }
    edgeList(t({ en: 'Outgoing relations', zh: '對外關聯' }), d.out || [], 'out');
    edgeList(t({ en: 'Incoming relations', zh: '被指向關聯' }), d.in || [], 'in');

    // add edge form
    right.appendChild(el('h3', null, t({ en: 'Add relation', zh: '新增關聯' })));
    var form = el('div', 'ka-form');
    var fr1 = el('div', 'frow');
    fr1.appendChild(el('label', null, t({ en: 'Relation', zh: '關聯' })));
    var selRel = el('select');
    RELS.forEach(function (p) {
      var o = el('option', null, p[1] + ' (' + p[0] + ')'); o.value = p[0]; o.dataset.label = p[1];
      selRel.appendChild(o);
    });
    fr1.appendChild(selRel);
    var selDir = el('select');
    [['out', t({ en: 'this → target', zh: '此實體 → 目標' })], ['in', t({ en: 'target → this', zh: '目標 → 此實體' })]]
      .forEach(function (p) { var o = el('option', null, p[1]); o.value = p[0]; selDir.appendChild(o); });
    fr1.appendChild(selDir);
    form.appendChild(fr1);
    var fr2 = el('div', 'frow');
    fr2.appendChild(el('label', null, t({ en: 'Target QID', zh: '目標 QID' })));
    var inDst = el('input'); inDst.type = 'text'; inDst.placeholder = 'Q937 / KN…';
    fr2.appendChild(inDst);
    fr2.appendChild(btn('ka-btn', t({ en: 'Add', zh: '加入' }), function (ev) {
      var target = inDst.value.trim();
      if (!target) return;
      ev.target.disabled = true;
      var opt = selRel.selectedOptions[0];
      var src = selDir.value === 'out' ? e.qid : target;
      var dst = selDir.value === 'out' ? target : e.qid;
      window.KNKB.api('/api/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: src, rel: selRel.value, rel_label: opt ? opt.dataset.label : selRel.value, dst: dst }),
      }).then(function () {
        toast('ok', t({ en: 'Edge added', zh: '已新增關聯' }));
        loadEntityDetail(e.qid);
      }).catch(function (er) { errToast(er); ev.target.disabled = false; });
    }));
    form.appendChild(fr2);
    right.appendChild(form);

    // linked corpus pages
    right.appendChild(el('h3', null, t({ en: 'Corpus pages', zh: '對應語料頁面' })));
    if (!(d.pages || []).length) {
      right.appendChild(el('div', 'ka-note', t({ en: '(no pages carry this QID yet)', zh: '(尚無頁面掛在此 QID 上)' })));
    } else {
      d.pages.forEach(function (p) {
        var row = el('div', 'ka-edge');
        row.appendChild(el('span', 'rel', p.lang));
        var who = el('span', 'who');
        var a = el('a', null, p.title);
        a.addEventListener('click', function () { pageViewModal(p.id); });
        who.appendChild(a);
        row.appendChild(who);
        right.appendChild(row);
      });
    }
  }

  // ---- RAG test tab ------------------------------------------------------------
  function renderRag(main) {
    main.appendChild(el('p', 'ka-note', t({
      en: 'Run the hybrid retriever (BM25 + vectors) the scientists backend uses, to sanity-check what the LLM would see.',
      zh: '執行與科學家後端相同的混合檢索(BM25 + 向量),檢查 LLM 實際會拿到的內容。',
    })));
    var bar = el('div', 'ka-row');
    var inQ = el('input');
    inQ.type = 'text'; inQ.placeholder = t({ en: 'query…', zh: '輸入查詢…' }); inQ.value = S.rQuery;
    inQ.style.minWidth = '280px';
    bar.appendChild(inQ);
    KB_LANGS.forEach(function (c) {
      var lbl = el('label');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = S.rLangs.indexOf(c) >= 0;
      cb.addEventListener('change', function () {
        if (cb.checked) { if (S.rLangs.indexOf(c) < 0) S.rLangs.push(c); }
        else S.rLangs = S.rLangs.filter(function (x) { return x !== c; });
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(c));
      bar.appendChild(lbl);
    });
    function run() {
      S.rQuery = inQ.value.trim();
      if (!S.rQuery) return;
      var qs = new URLSearchParams({ q: S.rQuery, k: '8' });
      if (S.rLangs.length) qs.set('langs', S.rLangs.join(','));
      Promise.all([
        window.KNKB.api('/api/search?' + qs),
        window.KNKB.api('/api/context?' + new URLSearchParams({ q: S.rQuery, lang: S.rLangs[0] || 'zh' })),
      ]).then(function (rs) {
        S.rResults = rs[0];
        S.rContext = rs[1];
        render();
      }).catch(errToast);
    }
    inQ.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') run(); });
    bar.appendChild(btn('ka-btn primary', t({ en: 'Search', zh: '檢索' }), run));
    main.appendChild(bar);

    if (S.rResults) {
      var wrap = el('div', 'ka-tablewrap');
      var table = el('table', 'ka-table');
      var trh = el('tr');
      ['score', t({ en: 'lang', zh: '語言' }), t({ en: 'page', zh: '頁面' }), t({ en: 'section', zh: '章節' }), t({ en: 'snippet', zh: '內容片段' })]
        .forEach(function (h) { trh.appendChild(el('th', null, h)); });
      var thead = el('thead'); thead.appendChild(trh); table.appendChild(thead);
      var tbody = el('tbody');
      (S.rResults.results || []).forEach(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', 'mono', String(r.score)));
        tr.appendChild(el('td', 'mono', r.lang));
        var tdT = el('td', 'title-cell');
        var a = el('a', null, r.title);
        a.href = '#';
        a.addEventListener('click', function (ev) { ev.preventDefault(); pageViewModal(r.pageId || r.page_id || r.id); });
        tdT.appendChild(a);
        tr.appendChild(tdT);
        tr.appendChild(el('td', 'mono', r.section || '—'));
        tr.appendChild(el('td', 'ka-snippet', String(r.text || '').slice(0, 220) + '…'));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      main.appendChild(wrap);
      if (!(S.rResults.results || []).length) {
        main.appendChild(el('div', 'ka-empty', t({ en: 'No hits.', zh: '沒有命中結果。' })));
      }
      if (S.rContext && S.rContext.context) {
        main.appendChild(el('h3', null, t({ en: 'Prompt-ready context block', zh: '提示詞用 context 區塊' })));
        main.appendChild(el('pre', 'ka-context-pre', S.rContext.context));
      }
    }
  }

  // ---- activity log tab ----------------------------------------------------------
  function renderLog(main) {
    main.appendChild(el('p', 'ka-note', t({
      en: 'Shared change history (crawls, manual edits, graph edits, translations) — how collaborators see each other\'s work.',
      zh: '共用變更紀錄(爬蟲、手動編輯、圖譜編輯、翻譯)——協作者可在此互相看到彼此的操作。',
    })));
    var bar = el('div', 'ka-row');
    bar.appendChild(btn('ka-btn', t({ en: 'Refresh', zh: '重新整理' }), function () { S.logRows = null; render(); }));
    main.appendChild(bar);
    if (!S.logRows) {
      main.appendChild(el('div', 'ka-empty', t({ en: 'Loading…', zh: '載入中…' })));
      window.KNKB.api('/api/log?limit=200').then(function (r) { S.logRows = r.log; render(); })
        .catch(function (e) { clear(main); main.appendChild(el('div', 'ka-empty', (e.message || e))); });
      return;
    }
    var wrap = el('div', 'ka-tablewrap');
    var table = el('table', 'ka-table');
    var trh = el('tr');
    [t({ en: 'time', zh: '時間' }), t({ en: 'action', zh: '動作' }), t({ en: 'lang', zh: '語言' }), t({ en: 'title', zh: '標題' }), t({ en: 'detail', zh: '細節' })]
      .forEach(function (h) { trh.appendChild(el('th', null, h)); });
    var thead = el('thead'); thead.appendChild(trh); table.appendChild(thead);
    var tbody = el('tbody');
    S.logRows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'mono', (r.ts || '').replace('T', ' ').slice(0, 19)));
      tr.appendChild(el('td', 'mono', r.kind));
      tr.appendChild(el('td', 'mono', r.lang || '—'));
      tr.appendChild(el('td', 'title-cell', r.title || '—'));
      tr.appendChild(el('td', 'ka-snippet', r.detail || ''));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    main.appendChild(wrap);
  }

  // ---- shell ----------------------------------------------------------------
  function render() {
    document.documentElement.lang = (lang === 'zh') ? 'zh-Hant' : 'en';
    var tabs = document.getElementById('ka-tabs');
    clear(tabs);
    TABS.forEach(function (tb) {
      var b = el('button', 'ka-tab' + (S.tab === tb.id ? ' active' : ''), t(tb.label));
      b.addEventListener('click', function () {
        S.tab = tb.id;
        if (tb.id === 'log') S.logRows = null;   // always fresh — it is the collab feed
        render();
      });
      tabs.appendChild(b);
    });
    var main = document.getElementById('ka-main');
    clear(main);
    if (S.tab === 'overview') renderOverview(main);
    else if (S.tab === 'pages') renderPages(main);
    else if (S.tab === 'graph') renderGraph(main);
    else if (S.tab === 'rag') renderRag(main);
    else if (S.tab === 'log') renderLog(main);
  }

  function boot() {
    var inUrl = document.getElementById('ka-url');
    inUrl.value = window.KNKB.getBaseUrl();
    document.getElementById('ka-url-save').addEventListener('click', function () {
      window.KNKB.setBaseUrl(inUrl.value.trim());
      inUrl.value = window.KNKB.getBaseUrl();
      refreshHealth();
      S.pData = null; S.gList = []; S.gSel = null; S.gDetail = null; S.logRows = null;
      render();
    });
    var selLang = document.getElementById('ka-lang');
    selLang.value = lang;
    selLang.addEventListener('change', function () {
      lang = selLang.value;
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
      render();
      refreshHealth();
    });
    refreshHealth();
    setInterval(refreshHealth, 30000);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
