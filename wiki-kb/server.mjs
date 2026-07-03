#!/usr/bin/env node
// Wiki knowledge-base HTTP API, standalone entry point (loopback by default;
// Tailscale terminates TLS like the other services in this repo).
//
//   node server.mjs                 -> http://127.0.0.1:5189
//   WKB_PORT=7100 node server.mjs   -> custom port
//
// The route dispatch itself lives in lib/routes.mjs, shared with
// scientists-backend/server.mjs, which mounts the SAME routes in-process on
// :5188 so the live app (chat + knowledge graph + save-to-KB) needs only one
// backend. This file stays useful on its own for admin/crawl work
// (kb-admin.html, npm run kb:crawl / kb:update) without needing Ollama or a
// chat session running.
//
//   GET /api/health   liveness + corpus counts (see lib/routes.mjs for the
//                      rest of the API surface).

import http from 'node:http';
import { openDb, stats } from './lib/db.mjs';
import { createKbRouter, kbHealthPayload } from './lib/routes.mjs';
import { config } from './config.mjs';

const db = openDb();
const handleKbRoute = createKbRouter(db);
const startedAt = Date.now();

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = config.server.corsOrigins.includes('*')
    ? origin
    : config.server.corsOrigins.find((o) => o === origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const payload = await kbHealthPayload(db);
      json(res, 200, { ok: true, uptimeSec: Math.round((Date.now() - startedAt) / 1000), ...payload });
      return;
    }
    if (await handleKbRoute(req, res, url)) return;
    json(res, 404, { ok: false, error: 'unknown endpoint' });
  } catch (e) {
    json(res, 500, { ok: false, error: String(e?.message ?? e) });
  }
});

server.listen(config.server.port, config.server.host, () => {
  const s = stats(db);
  console.log(`[wiki-kb] http://${config.server.host}:${config.server.port}`);
  console.log(`[wiki-kb] db: ${config.dbPath}`);
  console.log(`[wiki-kb] corpus: ${s.pagesActive} pages, ${s.chunks} chunks (${s.embedded} embedded), ${s.edges} edges`);
});
