# CLAUDE.md

Guidance for Claude Code when working in this repo. See `AGENTS.md` for the
cross-tool (Codex/ChatGPT) operating map; this file is the Claude-specific
companion and the two are kept in sync.

## What This Project Is

The **Kerr-Newman Black Hole Laboratory** — a static, browser-based physics
demo plus an additive high-fidelity physics core.

- **Root files** = the browser demo. Plain `.js`/`.jsx` loaded via
  `index.html` with in-browser Babel + React 18 UMD. No bundler, no build step.
  - Engine: `physics.js`, `sim.js`, `disc.js` (define `window.KNphysics`,
    `window.KNSim`, `window.KNDisc`).
  - Renderers: `render.js` (Canvas2D fallback + mobile) and `render3d.mjs`
    (default desktop WebGL renderer, `window.KNRender3D`, vendored Three.js in
    `vendor/`). While `sim.view.mode3d` is set, `KNSim.worldToScreen/
    screenToWorld` delegate to the 3D camera, so pointer interaction is
    renderer-agnostic. Small windows try `KNRender3D.create*View` first and
    fall back to the 2D canvas renderers (which mobile still uses).
  - Desktop UI: `panel-*.jsx`, `tidal-scope.jsx`, `mhd-monitor.jsx`,
    `app.jsx` (defines `window.App`).
  - Mobile UI: `mobile-panels.jsx`, `mobile-app.jsx` (defines
    `window.MobileApp`); `mobile-styles.css`. Layout is picked at runtime by
    `window.__knIsMobile()`.
- **`full-physics/`** = additive, benchmarked physics core (ES modules,
  `.mjs`). This is the stable source for high-fidelity calculations. New
  engine-facing work goes through `full-physics/physics-engine.mjs`; its
  contract is `full-physics/engine-contract.md`.

## Run / Serve

```powershell
npm run dev          # node serve.mjs -> http://127.0.0.1:5184/
PORT=7000 node serve.mjs
```

`serve.mjs` is a static server bound to `127.0.0.1`; HTTPS is terminated by
`tailscale serve` (see `serve.mjs` header). Prefer the `run` skill to launch
and confirm a change in the real app.

## Verify Before Finishing

- Syntax: `node --check physics.js`, `node --check sim.js`,
  `node --check disc.js`, `node --check serve.mjs`.
- Physics regression (run after any physics/catalog/facade/unit/integration
  change): `node .\full-physics\run-benchmarks.mjs`.
- Smoke samples: `node .\full-physics\run-sample.mjs`,
  `node .\full-physics\run-object-mhd-sample.mjs`,
  `node .\full-physics\run-units-sample.mjs`.

## Guardrails (do not break)

- **ASCII only** for identifiers, object IDs, API field names, file paths.
  Corrupt UI glyphs are localization debt, not physics intent — treat as l10n.
- **Preserve browser globals** unless intentionally migrating:
  `window.KNphysics`, `window.KNSim`, `window.KNDisc`, `window.App`,
  `window.MobileApp`.
- **`full-physics/` is add-only.** Do not modify the original browser demo
  files to wire it in. Editing root demo files for integration is **Phase 6**
  and is *blocked until explicitly approved* — read
  `full-physics/PROGRESS-PLAN.md` first.
- Visual effects should be clearly visible but **muted/gentle, never neon
  glare** (user preference).

## Skills And Subagents

Claude project skills live in `.claude/skills/`, with matching subagents in
`.claude/agents/`. Five role families mirror the Codex roles in `AGENTS.md`.
Invoke a skill with the Skill tool; delegate to a subagent with the Agent tool
when the work is self-contained and benefits from an isolated context.

| Task domain | Skill (`/`) | Subagent |
|---|---|---|
| Translation, i18n, terminology, mojibake cleanup | `kn-l10n-translation` | `kn-l10n-translator` |
| React panels, Canvas2D, pointer/keyboard/event logic | `kn-ui-events` | `kn-ui-event-engineer` |
| Presets, object catalog, param ranges, units, schemas, facade contracts | `kn-parameter-db` | `kn-parameter-curator` |
| Geometry, geodesics, integrators, tidal, MHD, ray tracing, benchmarks | `kn-spatial-numerics` | `kn-spatial-numerics-analyst` |
| Product/education/market analysis | `kn-market-science` | `kn-market-science-analyst` |

Routing notes:
- Editing `app.jsx` / `mobile-app.jsx` / `panel-*.jsx` / Canvas rendering →
  `kn-ui-events`.
- Touching `physics.js` / `sim.js` / `full-physics/*.mjs` numerics →
  `kn-spatial-numerics`; always re-run `run-benchmarks.mjs` after.
- Object library / presets / parameter ranges / `engine-contract.md` →
  `kn-parameter-db`.
- Any user-visible string → `kn-l10n-translation` (keep code/IDs ASCII).
- Only spawn a subagent when the user asks, or when a task is large and
  isolatable. Default to handling work inline with the matching skill.

## Conventions

- Match surrounding style; comment density mirrors neighboring code.
- No build/lint config beyond `node --check` and the benchmark suite — use
  them as the gate.
- Keep root demo files framework-light (UMD React + Babel-in-browser); do not
  introduce a bundler or npm UI dependencies without explicit approval.
