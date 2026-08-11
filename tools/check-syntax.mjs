/* Parse-check every source file in the repo (or in the given directories).
 *
 *   node tools/check-syntax.mjs                  whole repo
 *   node tools/check-syntax.mjs wiki-kb          one subsystem
 *   node tools/check-syntax.mjs --quiet .        only report failures
 *
 * Replaces the hand-listed `node --check a.mjs && node --check b.mjs && ...`
 * chains that used to live in three package.json files. Those lists had to be
 * edited by hand for every new module and had silently fallen behind by six
 * files (wiki-kb/lib/list-ingest, ollama-gate, translate, zh-convert,
 * crawl-lists, fix-zh-*), so the modules most likely to be new were the ones
 * least likely to be checked. Globbing cannot fall behind.
 *
 * Two checkers, because the repo has two kinds of source:
 *   .js / .mjs  -> `node --check` in a child process (real V8 parse).
 *   .jsx        -> @babel/standalone (the same transpiler the browser and
 *                  build.mjs use; node cannot parse JSX at all).
 *
 * It also enforces the root demo's one global-scope rule: every text/babel
 * script shares ONE lexical scope, so the same top-level const/let/class in
 * two .jsx files is a SyntaxError in the browser that no per-file check can
 * see. See CLAUDE.md "Gotchas learned the hard way".
 *
 * This is dev tooling, not runtime code: it reads the subsystems, imports
 * nothing from them, and nothing imports it. The subsystem isolation rule
 * (no cross-subsystem imports) is untouched.
 */
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { availableParallelism } from 'node:os';
import Babel from '@babel/standalone';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Not ours to parse: dependencies, build output, vendored bundles, Rust/WASM
// artifacts, and the agent-tooling mirrors.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'vendor', '.git', '.claude', '.codex',
  'data', 'target', 'pkg',
]);
const EXT = new Set(['.js', '.mjs', '.cjs', '.jsx']);

const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const roots = argv.filter((a) => !a.startsWith('--'));
if (!roots.length) roots.push('.');

async function walk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, out);
    } else if (EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

function nodeCheck(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], { cwd: ROOT });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve(code === 0 ? null : err.trim().split('\n').slice(0, 6).join('\n')));
  });
}

// Top-level const/let/class bindings, for the shared-global-scope check. A
// regex is enough and cheap: these files are formatted with declarations at
// column 0, and the Babel parse right above has already proven the file is
// syntactically valid.
const TOP_LEVEL_BINDING = /^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

async function babelCheck(file, bindings) {
  const src = await readFile(file, 'utf8');
  try {
    Babel.transform(src, { presets: ['react'], filename: file, compact: true, comments: false });
  } catch (e) {
    return String(e.message).split('\n').slice(0, 6).join('\n');
  }
  for (const m of src.matchAll(TOP_LEVEL_BINDING)) {
    const list = bindings.get(m[1]) || [];
    list.push(relative(ROOT, file));
    bindings.set(m[1], list);
  }
  return null;
}

const files = [];
for (const r of roots) await walk(join(ROOT, r), files);
files.sort();

const bindings = new Map();   // jsx top-level name -> files declaring it
const failures = [];
let done = 0;

const queue = files.slice();
const workers = Array.from({ length: Math.min(8, Math.max(2, availableParallelism() - 1)) }, async () => {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const rel = relative(ROOT, file);
    const err = file.endsWith('.jsx') ? await babelCheck(file, bindings) : await nodeCheck(file);
    done += 1;
    if (err) { failures.push({ rel, err }); console.log(`FAIL ${rel}\n  ${err.replace(/\n/g, '\n  ')}`); }
    else if (!quiet) console.log(`ok   ${rel}`);
  }
});
await Promise.all(workers);

// Shared-global-scope collisions across the root .jsx files (browser-fatal).
const collisions = [...bindings.entries()].filter(([, fs]) => new Set(fs).size > 1);
for (const [name, where] of collisions) {
  failures.push({ rel: [...new Set(where)].join(' + '), err: `duplicate top-level binding '${name}'` });
  console.log(`FAIL duplicate top-level '${name}' declared in ${[...new Set(where)].join(', ')}`
    + '\n  all text/babel scripts share one lexical scope — this is a browser SyntaxError');
}

const scope = roots.join(', ');
if (failures.length) {
  console.log(`\nFAIL — ${failures.length} problem(s) in ${done} file(s) under ${scope}`);
  process.exit(1);
}
console.log(`\nPASS — ${done} file(s) parse cleanly under ${scope}`);
