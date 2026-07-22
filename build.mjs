// Production precompile for the Kerr-Newman Lab browser demo.
//
//   node build.mjs            -> writes a self-contained dist/
//   node dist/serve.mjs       -> serve the precompiled site (serve.mjs resolves
//                                its root from its own location, so the copy
//                                in dist/ serves dist/)
//
// The dev flow is untouched: the repo root stays zero-build (UMD React
// development build + @babel/standalone transpiling <script type="text/babel">
// in the browser). This script moves that transpile to build time for
// production and swaps React to the vendored production UMD
// (vendor/react/*.production.min.js, same vendoring pattern as
// vendor/three.module.js). Zero new dependencies: the transpiler is the
// @babel/standalone package already in node_modules.
//
// Semantics note: @babel/standalone executes text/babel scripts by injecting
// plain <script> elements, so all files share ONE global lexical scope --
// top-level const in app.jsx (e.g. KNIconBook) is referenced directly by
// mobile-app.jsx, and index.html's inline block renames its React aliases
// (useRootState) precisely to avoid colliding with the panels'. Precompiled
// output must therefore stay UNWRAPPED classic scripts (no IIFE), which
// reproduces that shared scope exactly. The only cross-file re-declarations
// (regionLabel/glyphFor/stateLabel in panel-right.jsx + mobile-panels.jsx)
// are `function` declarations, where last-wins overwrite is legal and matches
// today's behavior; a new top-level const/let duplicated across two files
// would be a SyntaxError in BOTH the dev and the precompiled flow.
//
// Timing note: Babel runs text/babel scripts at DOMContentLoaded, i.e. after
// the type="module" scripts (render3d.mjs, full-physics-bridge.mjs,
// scientists-data.mjs) have executed. Precompiled tags get `defer`, which the
// spec queues in document order together with module scripts, so the relative
// order module-then-jsx is preserved. Inline text/babel blocks are
// externalized to <page>-boot.js because `defer` is ignored on inline tags.

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Babel from '@babel/standalone';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(ROOT, 'dist');

// Directories shipped verbatim (everything the pages reference at runtime).
const COPY_DIRS = ['avatars', 'logos', 'library-images', 'portraits', 'vendor', 'full-physics'];

// Single files pulled out of otherwise server-only directories.
// scientists-data.mjs imports the backend persona registry directly in the
// browser (dependency-free ESM, see its header comment).
const EXTRA_FILES = ['scientists-backend/personas/scientists.mjs'];

// Root files never shipped to production.
const SKIP_FILES = new Set([
  'build.mjs', 'dev-all.mjs', 'package.json', 'package-lock.json', '_g.txt',
]);
const SKIP_EXT = new Set(['.md']);

function transpile(src, filename) {
  const out = Babel.transform(src, {
    presets: ['react'],
    filename,
    compact: true,
    comments: false,
  });
  return `${out.code}\n`;
}

// Rewrite one HTML page: local production React, no in-browser Babel,
// precompiled .js instead of text/babel .jsx.
async function buildHtml(name, html) {
  html = html
    .replace(
      /<script src="https:\/\/unpkg\.com\/react@[^"]*\/umd\/react\.development\.js"[^>]*><\/script>/,
      '<script src="vendor/react/react.production.min.js"></script>'
    )
    .replace(
      /<script src="https:\/\/unpkg\.com\/react-dom@[^"]*\/umd\/react-dom\.development\.js"[^>]*><\/script>/,
      '<script src="vendor/react/react-dom.production.min.js"></script>'
    )
    .replace(/[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"[^>]*><\/script>\r?\n?/, '')
    .replace(/<script type="text\/babel" src="([^"]+)\.jsx"><\/script>/g, '<script defer src="$1.js"></script>');

  // Externalize inline text/babel blocks so they can carry `defer` and keep
  // running after the precompiled panel scripts.
  let bootIndex = 0;
  const inlineRe = /<script type="text\/babel">([\s\S]*?)<\/script>/g;
  const jobs = [];
  html = html.replace(inlineRe, (m, code) => {
    const bootName = `${name.replace(/\.html$/, '')}-boot${bootIndex ? bootIndex : ''}.js`;
    bootIndex += 1;
    jobs.push(writeFile(join(DIST, bootName), transpile(code, bootName)));
    return `<script defer src="${bootName}"></script>`;
  });
  await Promise.all(jobs);
  await writeFile(join(DIST, name), html);
}

const t0 = Date.now();
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

let jsxCount = 0;
let htmlCount = 0;
for (const entry of await readdir(ROOT, { withFileTypes: true })) {
  const { name } = entry;
  if (entry.isDirectory()) {
    if (COPY_DIRS.includes(name)) await cp(join(ROOT, name), join(DIST, name), { recursive: true });
    continue;
  }
  if (SKIP_FILES.has(name) || SKIP_EXT.has(name.slice(name.lastIndexOf('.')))) continue;
  if (name.endsWith('.jsx')) {
    const src = await readFile(join(ROOT, name), 'utf8');
    await writeFile(join(DIST, name.replace(/\.jsx$/, '.js')), transpile(src, name));
    jsxCount += 1;
  } else if (name.endsWith('.html')) {
    await buildHtml(name, await readFile(join(ROOT, name), 'utf8'));
    htmlCount += 1;
  } else {
    await cp(join(ROOT, name), join(DIST, name));
  }
}

for (const rel of EXTRA_FILES) {
  const dest = join(DIST, rel);
  await mkdir(join(dest, '..'), { recursive: true });
  await cp(join(ROOT, rel), dest);
}

console.log(`dist/ built in ${Date.now() - t0}ms (${jsxCount} jsx precompiled, ${htmlCount} pages)`);
console.log('serve with: node dist/serve.mjs');
