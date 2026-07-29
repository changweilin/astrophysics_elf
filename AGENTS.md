# Project AI Operating Map

This repository is **Astro ELF — Kerr-Newman Black Hole Lab**: a zero-build
browser physics demo (root files) plus three cleanly isolated subsystems.
`CLAUDE.md` is the Claude-specific companion; keep the two in sync.

## Architecture In One Breath

- **Root files**: the browser demo + pages (`index.html`, `library.html`,
  `scientists.html`, `kb-admin.html`). React 18 UMD + in-browser Babel, no
  bundler. Public globals: `window.KNphysics`, `KNSim`, `KNDisc`,
  `KNRender3D`, `KNFull`, `App`, `MobileApp`.
- **`full-physics/`**: benchmarked physics core. New engine-facing work goes
  through `physics-engine.mjs` (contract: `engine-contract.md`); it reaches
  the demo only via root `full-physics-bridge.mjs` (`window.KNFull`).
- **`scientists-backend/`**: local Ollama persona LLM (:5188), also serves
  the merged wiki-kb API. HTTP-only contract, shares no code with the demo.
- **`wiki-kb/`**: Wikipedia knowledge graph + hybrid RAG (`node:sqlite`,
  Ollama embeddings; standalone admin on :5189).

## Default Guardrails

- **Isolation by contract**: never import across subsystem boundaries; the
  only crossings are the window globals, `window.KNFull`, and the HTTP APIs.
- **Additive first**: new standalone files → verification scripts → adapters
  → (only with per-target approval) edits to shared originals. SQLite
  migrations are add-only. Phase 6 demo integration is complete — see
  `full-physics/PROGRESS-PLAN.md` for the record and remaining approved-only
  work (exact-GR live motion).
- **Measure before tuning**: `node full-physics/run-benchmarks.mjs` gates
  physics; the wiki-kb golden-set eval + committed baseline gates
  retrieval/LLM changes (`OPTIMIZATION-PLAN.md`). No knob without a metric.
- **Zero-dependency bias**: no bundler or npm UI deps in the demo; Node
  built-ins + local Ollama only in the backends.
- **ASCII code, zh-TW copy**: identifiers/IDs/fields/paths ASCII; corrupt
  UI glyphs are localization debt, not physics intent.
- **Muted visuals**: clearly visible but gentle, never neon glare.

## Verification Shortlist

- Full gate: `npm test` (unit/interaction/render tests + physics
  benchmarks).
- Targeted: `node --check <file>.js`; `node full-physics/run-benchmarks.mjs`
  after physics/catalog/facade/unit/integration changes;
  `full-physics/run-*-sample.mjs` smoke checks.

## Skills And Sub-Agent Roles

Five role families, defined once per tool: ChatGPT/Codex in
`.codex/skills/` + `.codex/agents/`, Claude in `.claude/skills/` +
`.claude/agents/`. When asked to use a role, read the matching file and
apply its prompt.

| Role family | Scope |
|---|---|
| `kn-l10n-translation` / `kn-l10n-translator` | translation, i18n, terminology, mojibake cleanup |
| `kn-ui-events` / `kn-ui-event-engineer` | React panels, Canvas2D, pointer/keyboard/event logic |
| `kn-parameter-db` / `kn-parameter-curator` | presets, object catalog, ranges, units, schemas, facade contracts |
| `kn-spatial-numerics` / `kn-spatial-numerics-analyst` | geometry, geodesics, integrators, tidal, MHD, ray tracing, benchmarks |
| `kn-market-science` / `kn-market-science-analyst` | evidence-based product, education, market analysis |

Wiki-KB / scientists-backend work has no dedicated role: follow
`OPTIMIZATION-PLAN.md` and the subsystem READMEs.
