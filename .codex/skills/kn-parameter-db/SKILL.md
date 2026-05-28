---
name: kn-parameter-db
description: Maintain the Kerr-Newman Lab parameter database and object catalog. Use when changing presets, object library entries, simulation parameter ranges, schema shapes, unit conversions, scenario definitions, panel controls, or full-physics facade contracts.
---

# Kerr-Newman Parameter DB

Use this skill when the task is about data definitions rather than numerical
algorithms or UI event handling.

## Data Owners

- Browser demo parameters:
  `panel-left.jsx` (`PRESETS`, sliders), `panel-bottom.jsx` (`LIBRARY`),
  `sim.js` (`createSim`, body state shape), `disc.js` (`sim.disc` fields).
- Full physics catalog:
  `full-physics/object-library.mjs` (`OBJECT_LIBRARY`, `OBJECT_GROUPS`,
  `OBJECT_SCENARIOS`, object creation helpers).
- Stable API:
  `full-physics/physics-engine.mjs` and `full-physics/engine-contract.md`.
- Units:
  `full-physics/units.mjs` and any output conversion helpers.

## Update Rules

1. Start by identifying whether the change belongs to the quick browser demo,
   the additive full-physics core, or both.
2. Keep IDs stable and machine-friendly. Use lower camel case for catalog IDs
   and preserve existing public method names in `physics-engine.mjs`.
3. Keep UI labels and data IDs separate. Labels can be localized; IDs should
   remain ASCII and stable.
4. When adding an object type, include physical defaults: `kind`, `family`,
   `description`, `radius`, `binding`, `chargeToMass`, `restMass`,
   `crossSection`, `defaultOrbit`, and `material`.
5. When adding a scenario, verify all referenced object IDs exist and that
   placements are outside unsafe horizons unless the scenario explicitly tests
   capture or horizon crossing.
6. Update `engine-contract.md` whenever an exported facade shape or documented
   input/output contract changes.
7. Avoid hidden duplicated constants. If both root demo and full-physics need a
   value, name the duplication explicitly in the handoff or add an adapter.

## Validation

- Run `node .\full-physics\run-sample.mjs` after catalog or spawn changes.
- Run `node .\full-physics\run-object-mhd-sample.mjs` after object, disc,
  plasma, or jet-related data changes.
- Run `node .\full-physics\run-units-sample.mjs` after unit conversion
  changes.
- Run `node .\full-physics\run-benchmarks.mjs` when data affects physics
  initialization, orbit placement, or facade behavior.

## Handoff Notes

Summarize new or changed fields, compatibility impact, and any browser-demo
data that remains unsynchronized with the full-physics catalog.
