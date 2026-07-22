/* library.js — renders the physics library from window.KN_LIBRARY.
 *
 * Plain DOM (no React/Babel) so the teaching page stays light and loads fast.
 * Bilingual by design: every text node is an {en, zh} pair. zh = Traditional
 * Chinese (Taiwan) and en are the priority locales; the toggle persists to the
 * same localStorage key ('kn-lang') the lab uses, so a reader's choice carries
 * across both. Locales other than zh fall back to en here.
 *
 * Content block grammar (see library-content.js):
 *   { p:   {en, zh} }                 paragraph (inline <var>/<b>/<i> HTML allowed)
 *   { h:   {en, zh} }                 sub-heading (h3)
 *   { list:[{en, zh}, ...] }          bullet list
 *   { eq:  "ascii/unicode math", where:{en, zh} }   equation block
 *   { fig: "<svg>...</svg>", cap:{en, zh} }          figure + caption
 *   { call:"lab"|"key", title:{en, zh}, body:{en, zh} }  callout box
 *   { stub:{en, zh} }                 "coming soon" placeholder
 */
(function () {
  var KEY = 'kn-lang';
  var VIEW_KEY = 'kn-lib-view';        // 'course' | 'graph'
  var SCROLL_KEY = 'kn-lib-scroll-v1'; // remembered reading position (course view)

  // The eight locales the lab supports, with native names for the selector.
  // Same set + order as window.KNi18n.LANGS so the choice carries across pages.
  var LANGS = [
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'it', name: 'Italiano' },
  ];
  var SUPPORTED = LANGS.reduce(function (m, l) { m[l.code] = true; return m; }, {});

  function browserDefault() {
    var l = '';
    try { l = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase(); }
    catch (e) {}
    var p = l.split('-')[0];
    return SUPPORTED[p] ? p : 'en';
  }

  function curLang() {
    try {
      var s = localStorage.getItem(KEY);
      if (s && SUPPORTED[s]) return s;
    } catch (e) {}
    return browserDefault();
  }
  var lang = curLang();

  function setLang(next) {
    if (!SUPPORTED[next]) return;
    lang = next;
    try { localStorage.setItem(KEY, next); } catch (e) {}
    render();
  }

  // ---- view mode: linear course vs read-only knowledge graph -------------
  var view = (function () {
    try { var v = localStorage.getItem(VIEW_KEY); if (v === 'graph') return 'graph'; } catch (e) {}
    return 'course';
  })();
  var kgInstance = null; // live KNKG mount (destroyed when leaving graph view)
  var kgFocus = null;    // {qid, q} the graph opens on (set by a course term link)
  // A term-link jump (or a ?kg= deep link) should land the reader looking at the
  // graph itself, centered — not scrolled to the top of the page (the search
  // sidebar). Set when a focus is supplied; consumed once after the graph mounts.
  var pendingCenter = false;

  function setView(next, focus) {
    if (next !== 'course' && next !== 'graph') return;
    kgFocus = focus || null;
    if (focus) pendingCenter = true;   // a term link: land centered on the graph
    if (next === view) {
      if (focus) render(); // already in the graph: re-center it on the new term
      return;
    }
    if (view === 'course') saveScroll(); // keep the reading position we leave
    view = next;
    try { localStorage.setItem(VIEW_KEY, next); } catch (e) {}
    render();
    if (next === 'course') restoreScroll();      // return to the remembered spot
    else if (!focus) window.scrollTo(0, 0);      // plain toggle: graph from the top
  }

  // Scroll the graph stage (the canvas block, not the search sidebar) to the
  // vertical centre of the space under the sticky top bar, so a jump from a
  // course term link — or a stacked mobile layout — lands on the graph itself.
  function centerGraphStage() {
    var stage = document.querySelector('.lp-kg .kg-stage') || document.querySelector('.lp-kg');
    if (!stage) return;
    var header = document.querySelector('.lp-top');
    var headH = header ? header.offsetHeight : 0;
    var rect = stage.getBoundingClientRect();
    var avail = window.innerHeight - headH;
    var target = window.scrollY + rect.top - headH - Math.max(0, (avail - rect.height) / 2);
    // behavior:'auto' overrides the page's scroll-behavior:smooth so the repeated
    // passes below just snap to the settled position instead of animating each time.
    window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
  }
  // The knowledge graph loads its list/graph async, and the mobile stack (search
  // sidebar above the stage) reflows taller as that data arrives -- so centre once
  // now and again as it settles, otherwise we'd centre against the "Loading…" height.
  function scheduleCenterGraphStage() {
    requestAnimationFrame(centerGraphStage);
    setTimeout(centerGraphStage, 350);
    setTimeout(centerGraphStage, 800);
  }

  // ---- scroll memory (course view) ----------------------------------------
  var scrollTimer = null;
  function saveScroll() {
    if (view !== 'course') return;
    try { localStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY || 0))); } catch (e) {}
  }
  window.addEventListener('scroll', function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () { scrollTimer = null; saveScroll(); }, 250);
  }, { passive: true });
  window.addEventListener('pagehide', saveScroll);

  function restoreScroll() {
    var y = 0;
    try { y = parseInt(localStorage.getItem(SCROLL_KEY) || '0', 10) || 0; } catch (e) {}
    if (y > 0) window.scrollTo(0, y);
  }
  var didRestoreScroll = false;

  // Pick the localised string from a translation pair (en is the fallback for
  // any locale a string has not been translated into yet).
  function t(pair) {
    if (pair == null) return '';
    if (typeof pair === 'string') return pair;
    if (pair[lang] != null) return pair[lang];
    return pair.en != null ? pair.en : (pair.zh != null ? pair.zh : '');
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---- block renderers -------------------------------------------------
  function renderBlock(b) {
    if (b.p != null)    return el('p', null, t(b.p));
    if (b.h != null)    return el('h3', null, t(b.h));
    if (b.list != null) {
      var ul = el('ul');
      b.list.forEach(function (it) { ul.appendChild(el('li', null, t(it))); });
      return ul;
    }
    if (b.eq != null) {
      var d = el('div', 'lp-eq');
      d.appendChild(document.createTextNode(t(b.eq)));
      if (b.where) d.appendChild(el('span', 'where', t(b.where)));
      return d;
    }
    if (b.fig != null) {
      var fig = el('figure', 'lp-fig');
      fig.innerHTML = b.fig;
      if (b.cap) fig.appendChild(el('figcaption', null, t(b.cap)));
      return fig;
    }
    if (b.call != null) {
      var c = el('div', 'lp-call ' + b.call);
      var label = b.call === 'lab'
        ? { en: 'TRY IT IN THE LAB', zh: '在實驗室中試試' }
        : { en: 'KEY IDEA', zh: '核心觀念' };
      c.appendChild(el('span', 'ct', t(b.title || label)));
      c.appendChild(el('div', null, t(b.body)));
      return c;
    }
    if (b.stub != null) {
      var s = el('div', 'lp-stub');
      s.appendChild(el('span', 'ct', t({ en: 'Chapter in preparation', zh: '本章撰寫中' })));
      s.appendChild(el('div', null, t(b.stub)));
      return s;
    }
    return document.createComment('unknown block');
  }

  // ---- glossary -> knowledge graph ---------------------------------------
  // Terms are matched on a normalised surface form (see library-terms.js):
  // lower-cased, parentheticals dropped ("event horizon (事件視界)"), dashes
  // unified, and a trailing plural 's' retried. Latin matches additionally
  // require word boundaries so "galaxy" cannot fire inside "galaxies'".
  function normTerm(s) {
    return String(s || '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[‐-―−]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  var termIndex = (function () {
    var idx = {};
    (window.KN_LIB_TERMS || []).forEach(function (e) {
      Object.keys(e).forEach(function (k) {
        if (k === 'qid' || !Array.isArray(e[k])) return;
        e[k].forEach(function (form) {
          var n = normTerm(form);
          if (n && !idx[n]) idx[n] = e;
        });
      });
    });
    return idx;
  })();

  function lookupTerm(text) {
    var n = normTerm(text);
    if (!n) return null;
    if (termIndex[n]) return termIndex[n];
    if (n.length > 3 && n.charAt(n.length - 1) === 's' && termIndex[n.slice(0, -1)]) return termIndex[n.slice(0, -1)];
    return null;
  }

  function isAscii(s) { return /^[\x20-\x7e]+$/.test(s); }

  // Surface forms for the language actually on screen. Non-en/zh locales render
  // the English text (see t()), so they use the English forms too.
  function formsFor(entry) {
    var f = entry[lang] || entry.en || [];
    return f.slice().sort(function (a, b) { return b.length - a.length; });
  }

  function termAnchor(entry, text) {
    var a = el('a', 'lp-term');
    a.href = 'library.html?kg=' + encodeURIComponent(entry.qid || text);
    if (entry.qid) a.dataset.qid = entry.qid;
    a.dataset.q = text;
    a.title = t({ en: 'Open in the knowledge graph', zh: '在知識圖譜中開啟' });
    a.appendChild(document.createTextNode(text));
    return a;
  }

  // Text nodes we may rewrite: prose only. Equations, figures, headings and
  // anything already inside a link are left alone.
  var SKIP_TAGS = { A: 1, VAR: 1, H2: 1, H3: 1, FIGURE: 1, CODE: 1, BUTTON: 1 };
  function proseTextNodes(root) {
    var out = [];
    var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        for (var p = node.parentNode; p && p !== root; p = p.parentNode) {
          if (SKIP_TAGS[p.tagName] || (p.classList && (p.classList.contains('lp-eq') || p.classList.contains('lp-games') || p.classList.contains('lp-ask')))) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = walk.nextNode())) out.push(n);
    return out;
  }

  function findSurface(hay, needle) {
    var i = hay.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0) return -1;
    if (!isAscii(needle)) return i;
    var before = i > 0 ? hay.charAt(i - 1) : ' ';
    var after = hay.charAt(i + needle.length) || ' ';
    if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) return -1;
    return i;
  }

  // One chapter, two passes: (1) the <span class="term"> markup the content
  // already carries becomes a graph link; (2) any glossary term still unlinked
  // in this chapter is linked on its first prose occurrence. A term links at
  // most once per chapter -- a page of blue is a page nobody reads.
  function linkifyTerms(sec) {
    var used = {};
    Array.prototype.forEach.call(sec.querySelectorAll('span.term'), function (span) {
      var entry = lookupTerm(span.textContent);
      if (!entry) return;
      var a = termAnchor(entry, span.textContent);
      a.className = 'lp-term term';
      span.parentNode.replaceChild(a, span);
      used[entry.qid || normTerm(span.textContent)] = true;
    });

    (window.KN_LIB_TERMS || []).forEach(function (entry) {
      var key = entry.qid || normTerm((entry.en || [''])[0]);
      if (used[key]) return;
      var forms = formsFor(entry);
      var nodes = proseTextNodes(sec);
      for (var i = 0; i < nodes.length && !used[key]; i++) {
        var node = nodes[i];
        for (var j = 0; j < forms.length; j++) {
          var at = findSurface(node.nodeValue, forms[j]);
          if (at < 0) continue;
          var hit = node.nodeValue.substr(at, forms[j].length);
          var tail = node.splitText(at);
          tail.nodeValue = tail.nodeValue.slice(hit.length);
          tail.parentNode.insertBefore(termAnchor(entry, hit), tail);
          used[key] = true;
          break;
        }
      }
    });
  }

  // ---- chapter-closing scientist ------------------------------------------
  // Each chapter ends with the scientist who owns it offering follow-up
  // questions; a click hands the question to the Scientists page, which selects
  // that persona and asks it (see library-asks.js + scientists.jsx deep link).
  function renderAsk(ask) {
    var box = el('aside', 'lp-ask');
    var face = document.createElement('img');
    face.className = 'ask-face';
    face.src = '/avatars/' + ask.sci + '.png';
    face.alt = '';
    face.loading = 'lazy';
    box.appendChild(face);

    var body = el('div', 'ask-body');
    body.appendChild(el('p', 'ask-lead',
      '<b>' + t(ask.name) + '</b> ' + t({ en: 'is here for your questions', zh: '在這裡回答你的問題' })));
    var row = el('div', 'ask-qs');
    (ask.qs || []).forEach(function (q) {
      var a = el('a', 'lp-askq');
      a.href = 'scientists.html?sci=' + encodeURIComponent(ask.sci) + '&ask=' + encodeURIComponent(t(q));
      a.appendChild(el('span', 'qm', '?'));
      a.appendChild(document.createTextNode(t(q)));
      row.appendChild(a);
    });
    var own = el('a', 'lp-askq own');
    own.href = 'scientists.html?sci=' + encodeURIComponent(ask.sci);
    own.appendChild(document.createTextNode(t({ en: 'Ask something else…', zh: '問點別的…' })));
    row.appendChild(own);
    body.appendChild(row);
    box.appendChild(body);
    return box;
  }

  // ---- chapter demo mini-games -------------------------------------------
  // Launch buttons into the lab with a topic-matched configuration
  // (index.html?demo=<id>; see demo-presets.js + config.js applyDemo).
  function renderGames(ids) {
    var box = el('div', 'lp-games');
    box.appendChild(el('span', 'gt', t({ en: 'DEMO MINI-GAMES', zh: '示範小遊戲' })));
    var row = el('div', 'game-row');
    ids.forEach(function (id) {
      var d = window.KN_DEMOS[id];
      if (!d) return;
      var a = el('a', 'lp-game');
      a.href = 'index.html?demo=' + encodeURIComponent(id);
      a.appendChild(el('span', 'play', '▶'));
      var txt = el('span', 'gtxt');
      txt.appendChild(el('span', 'gname', t(d.label)));
      if (d.hint) txt.appendChild(el('span', 'ghint', t(d.hint)));
      a.appendChild(txt);
      row.appendChild(a);
    });
    box.appendChild(row);
    return box;
  }

  function updateViewToggle() {
    var bc = document.getElementById('lp-view-course');
    var bg = document.getElementById('lp-view-graph');
    if (!bc || !bg) return;
    bc.textContent = t({ en: 'Course', zh: '課程' });
    bg.textContent = t({ en: 'Knowledge graph', zh: '知識圖譜' });
    bc.classList.toggle('active', view === 'course');
    bg.classList.toggle('active', view === 'graph');
    bc.setAttribute('aria-selected', view === 'course' ? 'true' : 'false');
    bg.setAttribute('aria-selected', view === 'graph' ? 'true' : 'false');
  }

  // ---- about me (fixed signature block that closes the course) -----------
  var ICON_GITHUB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>';
  var ICON_LINKEDIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

  function renderAboutMe() {
    var sec = el('section', 'lp-chapter lp-about');
    sec.id = 'about-me';
    sec.appendChild(el('div', 'ch-no', t({ en: 'ABOUT', zh: '關於' })));
    sec.appendChild(el('h2', null, t({ en: 'About Me', zh: '關於我' })));

    sec.appendChild(el('p', 'about-name', 'Chang Wei Lin'));

    var quote = el('blockquote', 'about-quote');
    quote.appendChild(el('p', 'q-zh', '我愛星空至深，無懼黑夜。'));
    quote.appendChild(el('p', 'q-en', 'We have loved the stars too fondly to fear the dark.'));
    var cite = el('footer', 'q-src');
    cite.innerHTML = '— <cite>The Old Astronomer</cite>, Sarah Williams';
    quote.appendChild(cite);
    sec.appendChild(quote);

    var links = el('div', 'about-links');
    [
      { href: 'https://github.com/changweilin', label: 'GitHub', icon: ICON_GITHUB },
      { href: 'https://www.linkedin.com/in/wei-lin-chang-ba38049a/', label: 'LinkedIn', icon: ICON_LINKEDIN },
      { href: 'https://changweilin.github.io/demo_link/', label: t({ en: 'Demo site', zh: '作品展示' }), icon: ICON_LINK },
    ].forEach(function (d) {
      var a = el('a', 'about-link');
      a.href = d.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.appendChild(el('span', 'al-ic', d.icon));
      a.appendChild(el('span', null, d.label));
      links.appendChild(a);
    });
    sec.appendChild(links);
    return sec;
  }

  function renderFooter() {
    var shell = document.querySelector('.lp-shell');
    var old = shell.querySelector('.lp-foot');
    if (old) old.remove();
    var foot = el('footer', 'lp-foot');
    foot.appendChild(el('span', null, t({ en: 'Kerr-Newman Black Hole Laboratory', zh: 'Kerr-Newman 黑洞實驗室' })));
    foot.appendChild(el('span', null, t({
      en: 'Diagrams are schematic, not to scale. Math uses geometrized units G = c = 1.',
      zh: '示意圖未按比例繪製。數學採幾何化單位 G = c = 1。'
    })));
    shell.appendChild(foot);
  }

  // ---- page assembly ---------------------------------------------------
  function render() {
    var data = window.KN_LIBRARY;
    var main = document.getElementById('lp-main');
    var toc = document.getElementById('lp-toc-list');
    if (!data || !main) return;
    if (kgInstance) { kgInstance.destroy(); kgInstance = null; }
    main.innerHTML = '';
    toc.innerHTML = '';

    document.documentElement.lang = (lang === 'zh') ? 'zh-Hant' : 'en';
    document.title = t(data.docTitle || { en: 'Black Hole Lab — Library', zh: '黑洞實驗室 · 圖書館' });

    // Keep the shared brand suffix in step with the chosen language.
    var suffixEl = document.querySelector('.kn-brand-suffix');
    if (suffixEl) suffixEl.textContent = (lang === 'zh') ? '黑洞實驗室' : 'Black Hole Lab';

    // language selector state
    var sel = document.getElementById('lp-lang');
    if (sel && sel.value !== lang) sel.value = lang;

    updateViewToggle();
    var tocNav = document.querySelector('.lp-toc');

    // ---- knowledge-graph mode (read-only; see kg-view.js) ----
    if (view === 'graph') {
      if (tocNav) tocNav.style.display = 'none';
      document.body.classList.add('lp-graphmode');
      var wrap = el('div', 'lp-kg');
      main.appendChild(wrap);
      if (window.KNKG && window.KNKB) {
        kgInstance = window.KNKG.mount(wrap, { lang: lang, focus: kgFocus });
      } else {
        wrap.appendChild(el('p', null, 'knowledge-graph module failed to load'));
      }
      renderFooter();
      // Land centered on the graph after layout settles (a term-link jump or a
      // ?kg= deep link). Cleared so a later plain re-render doesn't re-scroll.
      if (pendingCenter) {
        pendingCenter = false;
        scheduleCenterGraphStage();
      }
      return;
    }
    document.body.classList.remove('lp-graphmode');
    if (tocNav) tocNav.style.display = '';

    // hero / prologue
    var p = data.prologue || {};
    var hero = el('section', 'lp-hero');
    hero.id = 'prologue';
    hero.appendChild(el('div', 'lp-kicker', t(p.kicker)));
    hero.appendChild(el('h1', null, t(p.title)));

    var heroImg = el('img', 'lp-chapter-banner');
    heroImg.src = 'library-images/prologue.png';
    heroImg.alt = '';
    heroImg.loading = 'lazy';
    heroImg.onerror = function () { heroImg.style.display = 'none'; };
    hero.appendChild(heroImg);

    hero.appendChild(el('p', 'lede', t(p.lede)));
    main.appendChild(hero);
    (p.blocks || []).forEach(function (b) { hero.appendChild(renderBlock(b)); });
    linkifyTerms(hero);
    var heroAsk = window.KN_LIB_ASKS && window.KN_LIB_ASKS.prologue;
    if (heroAsk) hero.appendChild(renderAsk(heroAsk));

    // chapters
    (data.chapters || []).forEach(function (ch) {
      var sec = el('section', 'lp-chapter');
      sec.id = ch.id;
      sec.appendChild(el('div', 'ch-no', (ch.no != null ? ('§ ' + ch.no + '  ') : '') + t(ch.kicker || { en: '', zh: '' })));
      sec.appendChild(el('h2', null, t(ch.title)));

      var chImg = el('img', 'lp-chapter-banner');
      chImg.src = 'library-images/' + ch.id + '.png';
      chImg.alt = '';
      chImg.loading = 'lazy';
      chImg.onerror = function () { chImg.style.display = 'none'; };
      sec.appendChild(chImg);

      if (ch.sub) sec.appendChild(el('p', 'ch-sub', t(ch.sub)));
      (ch.blocks || []).forEach(function (b) { sec.appendChild(renderBlock(b)); });
      linkifyTerms(sec);
      // Topic-matched lab demos for this chapter (demo-presets.js).
      var games = window.KN_CHAPTER_GAMES && window.KN_CHAPTER_GAMES[ch.id];
      if (games && games.length) sec.appendChild(renderGames(games));
      // ...and the scientist who closes the chapter (library-asks.js).
      var ask = window.KN_LIB_ASKS && window.KN_LIB_ASKS[ch.id];
      if (ask) sec.appendChild(renderAsk(ask));
      main.appendChild(sec);

      // TOC entry
      var li = el('li');
      var a = el('a');
      a.href = '#' + ch.id;
      a.dataset.target = ch.id;
      a.innerHTML = '<span class="n">' + (ch.no != null ? ch.no : '') + '</span>' + t(ch.title);
      li.appendChild(a);
      toc.appendChild(li);
    });

    main.appendChild(renderAboutMe());
    var aboutLi = el('li');
    var aboutA = el('a');
    aboutA.href = '#about-me';
    aboutA.dataset.target = 'about-me';
    aboutA.innerHTML = '<span class="n">•</span>' + t({ en: 'About Me', zh: '關於我' });
    aboutLi.appendChild(aboutA);
    toc.appendChild(aboutLi);

    renderFooter();
    initScrollSpy();

    // Return the reader to where they left off (first course render only, and
    // only when not deep-linking to a #chapter anchor).
    if (!didRestoreScroll) {
      didRestoreScroll = true;
      if (!window.location.hash) restoreScroll();
    }
  }

  // ---- TOC scroll-spy --------------------------------------------------
  var spy = null;
  function initScrollSpy() {
    if (spy) spy.disconnect();
    var links = {};
    Array.prototype.forEach.call(document.querySelectorAll('.lp-toc a'), function (a) {
      links[a.dataset.target] = a;
    });
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove('active'); });
          var a = links[en.target.id];
          if (a) a.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    document.querySelectorAll('.lp-chapter').forEach(function (s) { spy.observe(s); });
  }

  // ---- boot ------------------------------------------------------------
  // ?kg=<qid|term> opens the library straight in the graph view, centered on
  // that entity (what a term link in the course text points at, so the link is
  // shareable and survives a reload).
  function focusFromQuery() {
    var v = '';
    try { v = (new URLSearchParams(window.location.search).get('kg') || '').trim(); } catch (e) {}
    if (!v) return null;
    return /^Q\d+$/.test(v) ? { qid: v, q: '' } : { qid: '', q: v };
  }

  function boot() {
    var sel = document.getElementById('lp-lang');
    if (sel) {
      LANGS.forEach(function (l) {
        var o = document.createElement('option');
        o.value = l.code; o.textContent = l.name;
        sel.appendChild(o);
      });
      sel.value = lang;
      sel.addEventListener('change', function () { setLang(sel.value); });
    }
    var bc = document.getElementById('lp-view-course');
    var bg = document.getElementById('lp-view-graph');
    if (bc) bc.addEventListener('click', function () { setView('course'); });
    if (bg) bg.addEventListener('click', function () { setView('graph'); });

    // Term links stay in-page (the graph is a view of this same page); a
    // modified click keeps the browser's own "open in a new tab" behaviour.
    var main = document.getElementById('lp-main');
    if (main) {
      main.addEventListener('click', function (ev) {
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        var a = ev.target.closest ? ev.target.closest('a.lp-term') : null;
        if (!a) return;
        ev.preventDefault();
        var focus = { qid: a.dataset.qid || '', q: a.dataset.q || '' };
        try {
          history.replaceState(null, '', 'library.html?kg=' + encodeURIComponent(focus.qid || focus.q));
        } catch (e) {}
        setView('graph', focus);
      });
    }

    var booted = focusFromQuery();
    if (booted) {
      view = 'graph';
      kgFocus = booted;
      pendingCenter = true;   // deep link: land centered on the graph too
    }
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
