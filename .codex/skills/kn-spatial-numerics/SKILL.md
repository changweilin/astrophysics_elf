---
name: kn-spatial-numerics
description: Analyze, modify, and verify Kerr-Newman spatial computation and numerical physics. Use for geometry, geodesics, Hamiltonian integration, Kerr-Schild horizon crossing, tidal tensors, MHD jets, ray tracing, radiation models, units, performance layers, and conservation benchmarks.
---

# Kerr-Newman Spatial Numerics

Use this skill for scientific and numerical work in `full-physics`. Treat the
root browser demo as a visual approximation unless the task explicitly asks to
wire in the full engine.

## First Reads

1. Read `full-physics/engine-contract.md` for the stable facade before using
   lower-level modules.
2. Read `full-physics/CONSERVATION-LEDGER.md` before changing benchmarks,
   integrators, or tolerances.
3. Read `full-physics/PROGRESS-PLAN.md` before editing original root demo files.

## Module Boundaries

- `kn-full-physics.mjs`: Kerr-Newman metric, canonical states, simulator,
  geometry summaries, core helpers.
- `adaptive-integrator.mjs`: Boyer-Lindquist adaptive integration.
- `kerr-schild-geodesics.mjs`: horizon-penetrating coordinates and adaptive
  integration for strong-field crossing.
- `orbit-diagnostics.mjs`: ISCO, photon orbit, circular-orbit solving, region
  classification.
- `tidal-tensor.mjs`: local tetrad and tidal tensor diagnostics.
- `mhd-jet-engine.mjs`: reduced jet dynamics and accretion-derived inputs.
- `ray-tracing.mjs` and `radiation-models.mjs`: rendering preparation,
  redshift, disc and jet emission helpers.
- `performance-layer.mjs` and `physics-worker-runtime.mjs`: caching, batch
  stepping, worker-compatible dispatch.
- `physics-engine.mjs`: preferred caller-facing facade.

## Numerical Rules

1. Preserve units: `G = c = 4 pi epsilon_0 = 1` in the full-physics core.
2. Keep Boyer-Lindquist integration for ordinary exterior trajectories and
   Kerr-Schild for horizon-penetrating timelike trajectories.
3. Do not loosen benchmark tolerances unless the model changed and the ledger
   explains the new bound.
4. Prefer facade additions over direct UI imports of low-level modules.
5. For random or batch processes, keep deterministic pathways available for
   tests and benchmarks.
6. Report physical model boundaries. This is a fixed-background test-particle
   simulator, not a full numerical-relativity or GRMHD solver.

## Verification Matrix

- Always run `node .\full-physics\run-benchmarks.mjs` after physics changes.
- Run targeted samples when relevant:
  `run-horizon-crossing-sample.mjs`, `run-advanced-models-sample.mjs`,
  `run-performance-benchmark.mjs`, `run-rendering-prep-sample.mjs`,
  `run-object-mhd-sample.mjs`, or `run-units-sample.mjs`.
- Include actual drift, convergence, or benchmark results in the handoff.
- If a benchmark fails, treat it as a regression until proven otherwise.

## Handoff Notes

Name the coordinate system, parameter regime, conserved quantities, known
approximations, and verification commands used.
