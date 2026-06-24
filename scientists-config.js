// Frontend <-> backend wiring for the Scientists page.
//
// The page itself is a static file (served by serve.mjs). The LLM backend is a
// SEPARATE process (scientists-backend/, default :5188). They share no code --
// only the REST/SSE contract. This file decides which backend URL to call and
// lets the user override it (needed on mobile over Tailscale).
//
// Resolution order for the backend base URL:
//   1. ?api=<url> query param (one-off override)
//   2. localStorage 'kn_sci_backend' (sticky, set via the in-page settings)
//   3. derived default: same host as this page, port 5188
//
// On a phone over Tailscale you typically set it to your tailnet host, e.g.
//   https://desktop-2caj1dn.taile51bc0.ts.net:5188

(function () {
  var STORAGE_KEY = 'kn_sci_backend';

  function deriveDefault() {
    try {
      var loc = window.location;
      var proto = loc.protocol === 'https:' ? 'https:' : 'http:';
      var host = loc.hostname || '127.0.0.1';
      // Same host the page came from, on the backend's default port.
      return proto + '//' + host + ':5188';
    } catch (e) {
      return 'http://127.0.0.1:5188';
    }
  }

  function fromQuery() {
    try {
      var p = new URLSearchParams(window.location.search).get('api');
      return p && p.trim() ? p.trim() : '';
    } catch (e) { return ''; }
  }

  function normalize(url) {
    if (!url) return '';
    return String(url).trim().replace(/\/+$/, '');
  }

  window.SCI = {
    getBackendUrl: function () {
      var q = fromQuery();
      if (q) return normalize(q);
      var stored = '';
      try { stored = localStorage.getItem(STORAGE_KEY) || ''; } catch (e) {}
      return normalize(stored || deriveDefault());
    },
    setBackendUrl: function (url) {
      try {
        if (url) localStorage.setItem(STORAGE_KEY, normalize(url));
        else localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    },
    defaultBackendUrl: deriveDefault,
  };
})();
