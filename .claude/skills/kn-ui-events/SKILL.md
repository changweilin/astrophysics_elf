---
name: kn-ui-events
description: Work on Kerr-Newman Lab UI interaction logic. Use when editing React panels, Canvas2D rendering hooks, pointer placement, aiming, panning, zooming, keyboard shortcuts, event logs, selected-object state, overlay controls, or wiring the browser demo to the full-physics facade.
---

# Kerr-Newman UI Events

Use this skill for browser-demo behavior in the root files. Keep the interface
responsive and instrument-like while protecting the physics contract.

## Map The Flow

Before editing, identify which state owner is involved:

- `app.jsx`: app wiring, canvas lifecycle, pointer flow, keyboard shortcuts,
  animation loop, top-level overlays.
- `sim.js`: simulation state, body integration, canvas rendering,
  coordinate transforms, trajectory preview.
- `panel-left.jsx`: central body parameters, classification, derived geometry,
  disc controls, presets.
- `panel-right.jsx`: roster, telemetry, diagnosis, ship burns.
- `panel-bottom.jsx`: object library, placement start, time controls, event log.
- `tidal-scope.jsx` and `mhd-monitor.jsx`: floating canvas instruments.
- `styles.css`: layout, panel density, overlays, responsive behavior.

## Interaction Rules

1. Preserve the placement -> aim -> launch sequence unless the user asks for a
   new interaction model.
2. Keep pointer math explicit. Convert through `screenToWorld` and
   `worldToScreen`; do not mix CSS pixels, canvas pixels, and world units.
3. Avoid React state churn inside animation loops. Mutate `SIM` for high-rate
   simulation state and call `force()` only for visible UI refresh.
4. Keep global browser contracts stable: `window.KNSim`, `window.KNphysics`,
   `window.KNDisc`, and `window.App`.
5. If integrating `full-physics`, prefer `full-physics/physics-engine.mjs` as
   the import facade and read `full-physics/engine-contract.md` first.
6. Make controls discoverable with stateful labels, cursor changes, disabled
   states, and event log feedback. Avoid adding instruction-heavy panels.

## Verification

- Run `node --check physics.js`, `node --check sim.js`, and
  `node --check disc.js` after edits to plain JS files.
- Run `node .\full-physics\run-benchmarks.mjs` after any change that could
  affect physics behavior or engine integration.
- For JSX files loaded by browser Babel, manually inspect changed JSX syntax
  for balanced tags, quotes, and braces. Use the browser when available.
- Check that text does not overlap in panels or fixed overlays at desktop and
  mobile widths.

## Handoff Notes

When finishing, report which interaction states were changed, which files own
the behavior, and what manual browser paths still need checking.
