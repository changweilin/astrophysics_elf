# Project Operating Map

Single source of truth for every AI agent working in this repo (Claude Code,
Codex/ChatGPT, subagents). `AGENTS.md` is a pointer to this file — there is
nothing to keep in sync. Durable principles and the map live here; operational
detail lives in the subsystem docs linked at the bottom.

## What This Project Is

**Astro ELF — Kerr-Newman Black Hole Laboratory**: a zero-build browser physics
lab plus three cleanly isolated companion subsystems.

| Part | What it is | Contract with the rest |
|---|---|---|
| Root files | Browser demo + pages (`index.html` lab, `library.html`, `scientists.html`, `scientist.html`, `kb-admin.html`). Plain `.js`/`.jsx`, React 18 UMD + in-browser Babel, no bundler. | `window.*` globals |
| `full-physics/` | Benchmarked high-fidelity physics core (ES modules). | Facade `physics-engine.mjs` (spec: `engine-contract.md`); reaches the demo only through root `full-physics-bridge.mjs` as `window.KNFull` |
| `scientists-backend/` | Local Ollama persona LLM, port 5188; also serves the merged wiki-kb API for the live app. | REST/SSE HTTP API only — shares no code with the demo |
| `wiki-kb/` | Wikipedia knowledge graph + hybrid RAG (`node:sqlite`, Ollama `bge-m3` embeddings; standalone admin server on 5189). | Small HTTP API (`lib/routes.mjs`) |

Root demo internals: engine `physics.js` / `sim.js` / `disc.js`
(`window.KNphysics/KNSim/KNDisc`); renderers `render.js` (Canvas2D fallback +
mobile) and `render3d.mjs` (desktop WebGL, `window.KNRender3D`, vendored
Three.js in `vendor/`); lensing bridge `lensing.js` (`window.KNLensing`);
desktop UI `app.jsx` (`window.App`) + `panel-*.jsx`; mobile UI
`mobile-app.jsx` (`window.MobileApp`) + `mobile-panels.jsx`, chosen at runtime
by `window.__knIsMobile()`; UI strings in `i18n-dict.js`.

## Principles (durable — apply to every task)

1. **Isolation by contract.** Subsystems share no code. The only crossings
   are `window.*` globals inside the demo, `window.KNFull` from the bridge,
   and the two HTTP APIs. Never import across subsystem boundaries.
2. **Additive first.** Prefer, in order: new standalone files → verification
   scripts/samples → adapter/facade files → edits to shared originals (only
   with per-target approval, kept small and reversible). SQLite migrations
   are add-only.
3. **Measure before tuning.** Physics changes are gated by
   `full-physics/run-benchmarks.mjs` (thresholds in `CONSERVATION-LEDGER.md`);
   retrieval/LLM changes are gated by the wiki-kb golden-set eval and its
   committed `eval/baseline.json`. Never tune a knob that has no falsifiable
   metric — grow the eval set first.
4. **Zero-dependency bias.** Root demo stays bundler-free (UMD React +
   Babel-in-browser); wiki-kb and scientists-backend use Node built-ins
   (`node:sqlite`, Node >= 22.5) plus local Ollama only. No new npm or cloud
   dependencies without explicit approval.
5. **ASCII code, zh-TW copy.** Identifiers, object IDs, API field names, file
   paths: ASCII only. User-visible text is Traditional Chinese first with i18n
   support; corrupt glyphs are localization debt, not physics intent.
   Internal docs (this file and the subsystem docs) are English — they are
   read by agents, not users.
6. **Muted visuals.** Effects clearly visible but gentle — never neon glare
   (user preference).
7. **Preserve public globals** unless intentionally migrating:
   `window.KNphysics`, `KNSim`, `KNDisc`, `KNRender3D`, `KNLensing`, `KNFull`,
   `App`, `MobileApp`.
8. **Match surrounding style.** Comment density mirrors neighboring code; no
   lint config beyond `node --check`, tests, and the benchmark suite.

## Gotchas learned the hard way

- All `text/babel` root scripts share **one global lexical scope** (and
  `build.mjs` deliberately preserves this in `dist/`): a top-level `const` in
  `app.jsx` is referenced by `mobile-app.jsx`, and a top-level `const`/`let`
  duplicated across two files is a SyntaxError in both dev and build.
  Duplicate `function` declarations are last-wins.
- Live N-body motion is **deliberately pseudo-Newtonian**. Only displayed
  geometry was wrapped by the exact core (see `full-physics/README.md`).
  Porting the live motion RHS to the exact integrator is a separate pass that
  needs explicit approval.
- While `sim.view.mode3d` is set, `KNSim.worldToScreen/screenToWorld` delegate
  to the 3D camera, so pointer interaction is renderer-agnostic.
- Bridge consumers use the `knfull-ready` / `knfull-update` event pattern and
  must keep an inline fallback for when the bridge has not loaded.

## Run

```bash
npm run dev        # static demo -> http://127.0.0.1:5184/
npm run dev:all    # demo (5184) + scientists-backend / merged KB API (5188)
npm run kb:serve   # wiki-kb standalone admin server (5189, no chat model)
npm run build      # precompile to dist/ (dev flow stays zero-build)
```

HTTPS is terminated by `tailscale serve` (see `serve.mjs` header). Prefer the
`run` skill to launch and confirm a change in the real app.

## Verify Before Finishing

- Full gate: `npm run verify` = `npm run check` + `npm test`.
  - `npm run check` (`tools/check-syntax.mjs`) parse-checks every
    `.js`/`.mjs`/`.cjs` via `node --check` and every `.jsx` via Babel, and
    fails on a top-level `const`/`let`/`class` declared in two `.jsx` files
    (the shared-global-scope trap above). It globs, so nothing has to be added
    to a list.
  - `npm test` (`test/run-all.mjs`) is the fast tier: physics / interaction /
    pace-fit / render-smoke / transient + the physics regression benchmarks.
  - `npm run test:full` adds the slow tier (~60 s: structure N-body acceptance
    + the two ray-tracing samples). Two N-body thresholds are marked `xfail`
    with measured numbers — a documented numerics call; never widen a band to
    go green.
- Writing a test: reuse `test/harness.mjs` (vm sandbox with browser globals,
  recording Canvas2D stub, seeded PRNG) and register the file in `SUITES` in
  `test/run-all.mjs`, which is what CI runs.
- Targeted: `node --check <file>.js` for edited root scripts;
  `node full-physics/run-benchmarks.mjs` after any physics / catalog / facade /
  unit / integration change; `full-physics/run-*-sample.mjs` for smoke checks.
- Retrieval or persona changes: `npm run eval:gate` in `wiki-kb/` against the
  committed baseline (`OPTIMIZATION-PLAN.md`). Local-only gate (needs the
  corpus + Ollama); CI runs only the pure-logic KB tests.
- CI/CD: `.github/workflows/ci.yml` runs exactly the commands above on every
  PR (plus a weekly slow-tier run); `deploy.yml` calls it and publishes the
  `build.mjs` output (`dist/`) to Pages only when it passes. Rebuild and
  re-check `dist/` after root edits.

## Skills And Subagents

Project skills live in `.claude/skills/`, matching subagents in
`.claude/agents/` (mirrored for Codex in `.codex/`). Default to handling work
inline with the matching skill; spawn a subagent only when asked, or when a
task is large and isolatable.

| Task domain | Skill (`/`) | Subagent |
|---|---|---|
| Translation, i18n, terminology, mojibake cleanup | `kn-l10n-translation` | `kn-l10n-translator` |
| React panels, Canvas2D, pointer/keyboard/event logic | `kn-ui-events` | `kn-ui-event-engineer` |
| Presets, object catalog, param ranges, units, schemas, facade contracts | `kn-parameter-db` | `kn-parameter-curator` |
| Geometry, geodesics, integrators, tidal, MHD, ray tracing, benchmarks | `kn-spatial-numerics` | `kn-spatial-numerics-analyst` |
| Product/education/market analysis | `kn-market-science` | `kn-market-science-analyst` |

Wiki-KB / scientists-backend work (retrieval, knowledge graph, eval, personas,
feedback) has no dedicated skill: follow `OPTIMIZATION-PLAN.md` and the
subsystem READMEs directly.

## Deeper Docs (read before touching that area)

- `full-physics/README.md` — physics-core module map, integration record, and
  the one approval-gated open item.
- `full-physics/engine-contract.md` — stable facade contract.
- `full-physics/CONSERVATION-LEDGER.md` — benchmark acceptance thresholds.
- `full-physics/PHASE6-LENSING-PLAN.md` — lensing/shadow implementation notes
  (cited by section from `lensing-worker.mjs` and `lensing.js`).
- `OPTIMIZATION-PLAN.md` — knowledge-graph + scientist-LLM roadmap and eval
  baselines.
- `wiki-kb/README.md`, `wiki-kb/eval/README.md`,
  `scientists-backend/README.md` — subsystem operations.
- `README.md` — the only user-facing doc (bilingual); everything else above is
  agent-facing English.
