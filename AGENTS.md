# Project AI Operating Map

This repository is the Kerr-Newman Black Hole Lab. Root files are the browser
demo. `full-physics/` is the additive, benchmarked physics core and should be
treated as the stable source for high-fidelity calculations.

## Default Guardrails

- Prefer `full-physics/physics-engine.mjs` and
  `full-physics/engine-contract.md` for new engine-facing work.
- Read `full-physics/PROGRESS-PLAN.md` before modifying original root demo
  files. It records the add-only history and the review gate for UI integration.
- Preserve public browser globals unless intentionally migrating them:
  `window.KNphysics`, `window.KNSim`, `window.KNDisc`, and `window.App`.
- Keep identifiers, object IDs, API field names, and file paths ASCII.
- Treat corrupt UI glyphs as localization debt, not physics intent.
- Run `node .\full-physics\run-benchmarks.mjs` after physics, catalog,
  facade, unit, or integration changes.

## ChatGPT/Codex Skills

Project-local skills live in `.codex/skills/`:

- `kn-l10n-translation`: translation, i18n, terminology, mojibake cleanup.
- `kn-ui-events`: React panels, Canvas2D, pointer/keyboard/event logic.
- `kn-parameter-db`: presets, object catalog, parameter ranges, units,
  schemas, and facade contracts.
- `kn-spatial-numerics`: geometry, geodesics, integrators, tidal tensors,
  MHD, ray tracing, units, performance, and benchmarks.
- `kn-market-science`: evidence-based product, education, and market analysis.

## ChatGPT/Codex Sub-Agent Prompts

Reusable sub-agent prompt definitions live in `.codex/agents/`. They are
project-local role prompts for Codex/ChatGPT sessions that support delegation.
When asked to use a role, read the matching file and apply its prompt:

- `.codex/agents/kn-l10n-translator.md`
- `.codex/agents/kn-ui-event-engineer.md`
- `.codex/agents/kn-parameter-curator.md`
- `.codex/agents/kn-spatial-numerics-analyst.md`
- `.codex/agents/kn-market-science-analyst.md`

## Claude Skills And Subagents

Claude Code project skills live in `.claude/skills/`, with matching
project-level subagents in `.claude/agents/`. The five Claude role families
mirror the ChatGPT/Codex role families:

- `.claude/skills/kn-l10n-translation/` and
  `.claude/agents/kn-l10n-translator.md`
- `.claude/skills/kn-ui-events/` and
  `.claude/agents/kn-ui-event-engineer.md`
- `.claude/skills/kn-parameter-db/` and
  `.claude/agents/kn-parameter-curator.md`
- `.claude/skills/kn-spatial-numerics/` and
  `.claude/agents/kn-spatial-numerics-analyst.md`
- `.claude/skills/kn-market-science/` and
  `.claude/agents/kn-market-science-analyst.md`

## Verification Shortlist

- Plain JS syntax: `node --check physics.js`, `node --check sim.js`,
  `node --check disc.js`.
- Full physics regression: `node .\full-physics\run-benchmarks.mjs`.
- Catalog/facade smoke tests: `node .\full-physics\run-sample.mjs` and
  `node .\full-physics\run-object-mhd-sample.mjs`.
- Unit conversion smoke test: `node .\full-physics\run-units-sample.mjs`.
