// Frontend <-> wiki-kb wiring, shared by the library knowledge-graph view, the
// scientists page (save-to-KB) and the hidden kb-admin page. The wiki-kb
// routes are merged into scientists-backend/server.mjs (default :5188), so
// this points at the same backend as scientists-config.js by default; this
// module only decides which base URL to call.
//
// Resolution order:
//   1. ?kb=<url> query param (one-off override)
//   2. localStorage 'kn_wkb_url' (sticky, set via in-page settings)
//   3. derived default: same host as this page, port 5188
//
// Point this at a standalone `npm run kb:serve` instance (default :5189, see
// wiki-kb/README.md) instead via the ?kb= override or in-page settings when
// doing admin/crawl work without the full backend running.

(function () {
  var STORAGE_KEY = 'kn_wkb_url';

  function deriveDefault() {
    try {
      var loc = window.location;
      var proto = loc.protocol === 'https:' ? 'https:' : 'http:';
      var host = loc.hostname || '127.0.0.1';
      return proto + '//' + host + ':5188';
    } catch (e) {
      return 'http://127.0.0.1:5188';
    }
  }

  function fromQuery() {
    try {
      var p = new URLSearchParams(window.location.search).get('kb');
      return p && p.trim() ? p.trim() : '';
    } catch (e) { return ''; }
  }

  function normalize(url) {
    if (!url) return '';
    return String(url).trim().replace(/\/+$/, '');
  }

  window.KNKB = {
    getBaseUrl: function () {
      var q = fromQuery();
      if (q) return normalize(q);
      var stored = '';
      try { stored = localStorage.getItem(STORAGE_KEY) || ''; } catch (e) {}
      return normalize(stored || deriveDefault());
    },
    setBaseUrl: function (url) {
      try {
        if (url) localStorage.setItem(STORAGE_KEY, normalize(url));
        else localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    },
    defaultBaseUrl: deriveDefault,
    // Small fetch helper: returns parsed JSON, throws Error with a readable
    // message on HTTP/network/API failure.
    api: function (path, opts) {
      var base = window.KNKB.getBaseUrl();
      return fetch(base + path, opts).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!res.ok || !body || body.ok === false) {
            var msg = (body && body.error) ? body.error : ('HTTP ' + res.status);
            throw new Error(msg);
          }
          return body;
        });
      });
    },
  };
})();
