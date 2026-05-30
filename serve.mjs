// Static file server for the Kerr-Newman Lab, fronted by `tailscale serve`.
// Binds to 127.0.0.1 only; Tailscale terminates HTTPS and proxies to here.
//
//   node serve.mjs            -> listens on 127.0.0.1:5184
//   PORT=7000 node serve.mjs  -> listens on 127.0.0.1:7000
//
// Pair with:  tailscale serve --bg --https=5184 http://127.0.0.1:5184

import { createServer } from 'node:http';
import { stat, readFile, readdir } from 'node:fs/promises';
import { join, normalize, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5184);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Resolve a request path to an absolute path that is guaranteed inside ROOT.
function resolveSafe(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const abs = normalize(join(ROOT, decoded));
  if (abs !== ROOT.replace(/[\\/]+$/, '') && !abs.startsWith(ROOT)) return null;
  return abs;
}

async function renderListing(absDir, urlPath) {
  const entries = await readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const base = urlPath.endsWith('/') ? urlPath : urlPath + '/';
  const rows = entries.map((e) => {
    const name = e.name + (e.isDirectory() ? '/' : '');
    const href = base + encodeURIComponent(e.name) + (e.isDirectory() ? '/' : '');
    return `<li><a href="${href}">${escapeHtml(name)}</a></li>`;
  });
  if (base !== '/') rows.unshift('<li><a href="../">../</a></li>');
  return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Index of ${escapeHtml(urlPath)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:1.5rem;background:#0b0d12;color:#e6e9ef}
a{color:#7db3ff;text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:1.1rem;color:#9aa4b2}ul{list-style:none;padding:0}li{padding:.15rem 0}</style>
<h1>Index of ${escapeHtml(urlPath)}</h1><ul>${rows.join('')}</ul>`;
}

const server = createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const abs = resolveSafe(urlPath);
  if (abs === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  try {
    const info = await stat(abs);
    if (info.isDirectory()) {
      // Prefer an index.html, otherwise show a listing.
      try {
        const idx = join(abs, 'index.html');
        const idxInfo = await stat(idx);
        if (idxInfo.isFile()) {
          const body = await readFile(idx);
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(req.method === 'HEAD' ? undefined : body);
          return;
        }
      } catch { /* no index.html */ }
      const html = await renderListing(abs, urlPath);
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(req.method === 'HEAD' ? undefined : html);
      return;
    }

    const type = MIME[extname(abs).toLowerCase()] || 'application/octet-stream';
    const body = await readFile(abs);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT}`);
  console.log(`Local:    http://${HOST}:${PORT}/`);
  console.log(`Tailnet:  https://desktop-2caj1dn.taile51bc0.ts.net:${PORT}/`);
});
