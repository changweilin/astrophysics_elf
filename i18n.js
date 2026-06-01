/* Multilingual layer — English, Traditional Chinese (Taiwan), Japanese, Korean,
 * German, French, Spanish, Italian.
 *
 * Two call styles, both falling back to English when a translation is missing:
 *
 *   tr(en, zh)          — static UI strings. The English text is the dictionary
 *                         key; zh may be supplied inline (legacy) and the other
 *                         six languages come from window.KN_L10N[en][lang].
 *
 *   trp(template, vars) — strings with interpolation. `template` carries
 *                         {placeholder} tokens and is the dictionary key; each
 *                         language's template lives in KN_L10N[template][lang].
 *                         Placeholders are substituted from `vars`.
 *
 * Physics notation (M, Q, a, r₊, ISCO, Kerr-Newman, …) is kept identical across
 * languages. Globals: window.tr, window.trp, window.KNi18n. Load before every
 * other script; the dictionary (i18n-dict.js) loads right after.
 */
(function () {
  var KEY = 'kn-lang';

  // Display order + native names for the language selector.
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
    catch (e) { l = ''; }
    var p = l.split('-')[0];
    return SUPPORTED[p] ? p : 'en';
  }

  var lang = browserDefault();
  try {
    var saved = localStorage.getItem(KEY);
    if (saved && SUPPORTED[saved]) lang = saved;
  } catch (e) { /* private mode — fall back to browser default */ }

  var subs = new Set();
  function notify() { subs.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  function setLang(next) {
    if (!SUPPORTED[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    notify();
  }

  function subscribe(fn) {
    subs.add(fn);
    return function () { subs.delete(fn); };
  }

  function dictEntry(key) {
    var d = window.KN_L10N;
    return (d && d[key]) || null;
  }

  // Static lookup. `en` is both the source and the dictionary key.
  function tr(en, zh) {
    if (lang === 'en') return en;
    var e = dictEntry(en);
    if (e && e[lang] != null) return e[lang];
    if (lang === 'zh') return zh != null ? zh : en;
    return en;  // missing translation → English
  }

  // Parametric lookup for interpolated strings. `template` is the dictionary
  // key and the English source; both carry {placeholder} tokens.
  function trp(template, vars) {
    var s = template;
    if (lang !== 'en') {
      var e = dictEntry(template);
      if (e && e[lang] != null) s = e[lang];
    }
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return (vars && Object.prototype.hasOwnProperty.call(vars, k)) ? vars[k] : m;
    });
  }

  window.tr = tr;
  window.trp = trp;
  window.KNi18n = {
    get lang() { return lang; },
    get isZh() { return lang === 'zh'; },
    LANGS: LANGS,
    setLang: setLang,
    subscribe: subscribe,
  };
})();
