/* Minimal bilingual (English / Traditional Chinese — Taiwan) layer.
 *
 * No framework, no dictionary file: strings live inline at each call site as a
 * pair, e.g. tr('Classification', '分類'). The active language picks one branch.
 * Both arguments are plain literals, so the source stays readable in context and
 * physics notation (M, Q, a, r₊, ISCO, …) is simply kept identical in both.
 *
 * Globals defined here (loaded before every other script in index.html):
 *   window.KNi18n  — { lang, setLang, toggle, subscribe, isZh }
 *   window.tr      — the translation picker, callable as bare tr(en, zh)
 *
 * Components re-render on change via KNi18n.subscribe (App / MobileApp wire a
 * force() callback); canvas overlays redraw every frame and so update for free.
 */
(function () {
  var KEY = 'kn-lang';

  function browserDefault() {
    var l = '';
    try { l = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase(); }
    catch (e) { l = ''; }
    return l.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  var lang = browserDefault();
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'zh' || saved === 'en') lang = saved;
  } catch (e) { /* private mode — fall back to browser default */ }

  var subs = new Set();

  function notify() { subs.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  function setLang(next) {
    if (next !== 'zh' && next !== 'en') return;
    if (next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    notify();
  }

  function toggle() { setLang(lang === 'zh' ? 'en' : 'zh'); }

  function subscribe(fn) {
    subs.add(fn);
    return function () { subs.delete(fn); };
  }

  // Pick the Traditional-Chinese branch when active. If a zh string is omitted,
  // fall back to the English one (lets notation-only strings skip the pair).
  function tr(en, zh) {
    return lang === 'zh' ? (zh == null ? en : zh) : en;
  }

  window.tr = tr;
  window.KNi18n = {
    get lang() { return lang; },
    get isZh() { return lang === 'zh'; },
    setLang: setLang,
    toggle: toggle,
    subscribe: subscribe,
  };
})();
