// Start the static page server and the Scientists backend together, so a
// single `npm run dev:all` runs the whole stack instead of two terminals.
//
//   [web] static page  -> http://127.0.0.1:5184  (serve.mjs)
//   [api] LLM backend  -> http://127.0.0.1:5188  (scientists-backend/server.mjs,
//                          which also serves the merged wiki-kb knowledge-base
//                          API -- see wiki-kb/lib/routes.mjs)
//
// Zero dependencies. Output from each server is line-prefixed; Ctrl+C (or either
// child exiting) shuts both down. Env vars pass through, so the usual SCI_* /
// PORT overrides still work, e.g.  SCI_MODEL_ZH=qwen3:8b npm run dev:all
//
// The wiki-kb corpus can still be served standalone on :5189
// (`npm run kb:serve`, from wiki-kb/) for admin/crawl work via kb-admin.html
// without needing Ollama or this stack running; that's a separate, optional
// process this script does not manage.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

const root = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const targets = [
  { tag: 'web', label: 'static page  http://127.0.0.1:5184', cwd: root, args: ['serve.mjs'] },
  { tag: 'api', label: 'LLM backend  http://127.0.0.1:5188', cwd: join(root, 'scientists-backend'), args: ['server.mjs'] },
];

const children = [];
let shuttingDown = false;

function pipe(tag, stream) {
  const rl = createInterface({ input: stream });
  rl.on('line', (line) => process.stdout.write(`[${tag}] ${line}\n`));
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  process.exit(code);
}

for (const t of targets) {
  const child = spawn(node, t.args, { cwd: t.cwd, env: process.env });
  children.push(child);
  pipe(t.tag, child.stdout);
  pipe(t.tag, child.stderr);
  child.on('error', (err) => {
    process.stdout.write(`[${t.tag}] failed to start: ${err.message}\n`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    process.stdout.write(`[${t.tag}] exited (code=${code} signal=${signal}); stopping the other server.\n`);
    shutdown(code || 0);
  });
}

console.log('Running both servers (Ctrl+C to stop):');
for (const t of targets) console.log(`  [${t.tag}] ${t.label}`);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
