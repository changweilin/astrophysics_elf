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

  // ---- page assembly ---------------------------------------------------
  function render() {
    var data = window.KN_LIBRARY;
    var main = document.getElementById('lp-main');
    var toc = document.getElementById('lp-toc-list');
    if (!data || !main) return;
    main.innerHTML = '';
    toc.innerHTML = '';

    document.documentElement.lang = (lang === 'zh') ? 'zh-Hant' : 'en';
    document.title = t(data.docTitle || { en: 'Black Hole Lab — Library', zh: '黑洞實驗室 · 圖書館' });

    // language selector state
    var sel = document.getElementById('lp-lang');
    if (sel && sel.value !== lang) sel.value = lang;

    // hero / prologue
    var p = data.prologue || {};
    var hero = el('section', 'lp-hero');
    hero.id = 'prologue';
    hero.appendChild(el('div', 'lp-kicker', t(p.kicker)));
    hero.appendChild(el('h1', null, t(p.title)));
    hero.appendChild(el('p', 'lede', t(p.lede)));
    main.appendChild(hero);
    (p.blocks || []).forEach(function (b) { hero.appendChild(renderBlock(b)); });

    // chapters
    (data.chapters || []).forEach(function (ch) {
      var sec = el('section', 'lp-chapter');
      sec.id = ch.id;
      sec.appendChild(el('div', 'ch-no', (ch.no != null ? ('§ ' + ch.no + '  ') : '') + t(ch.kicker || { en: '', zh: '' })));
      sec.appendChild(el('h2', null, t(ch.title)));
      if (ch.sub) sec.appendChild(el('p', 'ch-sub', t(ch.sub)));
      (ch.blocks || []).forEach(function (b) { sec.appendChild(renderBlock(b)); });
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

    // footer
    var foot = el('footer', 'lp-foot');
    foot.appendChild(el('span', null, t({ en: 'Kerr-Newman Black Hole Laboratory', zh: 'Kerr-Newman 黑洞實驗室' })));
    foot.appendChild(el('span', null, t({
      en: 'Diagrams are schematic, not to scale. Math uses geometrized units G = c = 1.',
      zh: '示意圖未按比例繪製。數學採幾何化單位 G = c = 1。'
    })));
    document.querySelector('.lp-shell').appendChild(foot);

    initScrollSpy();
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
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
