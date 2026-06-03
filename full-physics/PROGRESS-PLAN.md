# Physics Core Progress Plan

This plan prioritizes work that does not modify the original project files.
The original browser demo files should remain untouched unless a later upgrade
phase explicitly approves integration.

## Guiding Rule

Priority order:

1. Add new standalone files.
2. Add verification scripts and samples.
3. Add adapter/facade files that can be imported later.
4. Only after review, modify original UI/demo files.

## Current Completed Add-Only Work

- `kn-full-physics.mjs`
  - Kerr-Newman metric, horizons, static limit, ZAMO frame, Hamiltonian dynamics,
    charged test particles, photons, tidal estimates, thin-disc helpers, and jet
    diagnostics.
- `object-library.mjs`
  - Standalone object catalog for planets, stars, probes, ships, photons, dust,
    and plasma objects.
- `mhd-jet-engine.mjs`
  - Reduced dynamic MHD jet model with mass loading, magnetization,
    collimation, emissivity, kink risk, and reconnection flares.
- `orbit-diagnostics.mjs`
  - Numerical circular-orbit, ISCO, photon-orbit, and charged-particle orbit
    diagnostics.
- `adaptive-integrator.mjs`
  - RK45 adaptive Boyer-Lindquist Hamiltonian integrator with error tracking and
    horizon guard.
- `tidal-tensor.mjs`
  - Numerical Riemann/tidal tensor projection into a local tetrad.
- `kerr-schild-geodesics.mjs`
  - Horizon-penetrating Kerr-Schild metric and adaptive geodesic integrator.
- `physics-benchmarks.mjs`
  - Executable benchmark suite for Schwarzschild, Kerr,
    Reissner-Nordstrom, Kerr-Newman, and Kerr-Schild checks.
- `run-benchmarks.mjs`
  - Command-line benchmark runner with nonzero exit on tolerance failures.
- `CONSERVATION-LEDGER.md`
  - Drift and diagnostic threshold ledger for benchmark acceptance.
- `physics-engine.mjs`
  - Unified additive facade for geometry summaries, object spawning, orbit
    diagnostics, trajectory integration, tidal diagnostics, and MHD jet updates.
- `engine-contract.md`
  - Stable method contract and JSON input/output shapes for facade callers.
- `units.mjs`
  - Geometric-unit to SI conversion helpers for length, time, mass, charge,
    magnetic field, power, geometry summaries, objects, trajectories, and jets.
- `performance-layer.mjs`
  - Optional LRU metric/derivative caches, deterministic particle clouds,
    duplicate-state batch stepping, and performance measurement helpers.
- `physics-worker-runtime.mjs`
  - Worker-compatible message dispatcher for geometry, spawning, trajectories,
    batch stepping, unit conversion, and jet updates.
- `ray-tracing.mjs`
  - Null geodesic camera ray generation, adaptive ray tracing, redshift and
    Doppler helpers, disc-hit estimation, and photon-ring sampling.
- `radiation-models.mjs`
  - Novikov-Thorne-like disc brightness/temperature profiles, synchrotron
    emissivity hooks, jet-zone emission, and false-color helpers.
- Sample runners:
  - `run-sample.mjs`
  - `run-object-mhd-sample.mjs`
  - `run-advanced-models-sample.mjs`
  - `run-horizon-crossing-sample.mjs`
  - `run-units-sample.mjs`
  - `run-performance-benchmark.mjs`
  - `run-rendering-prep-sample.mjs`

## Phase 1: Add-Only Reliability Work

Status: completed.

- Add `physics-benchmarks.mjs`
  - Schwarzschild: ISCO = 6M, photon orbit = 3M.
  - Kerr: prograde/retrograde ISCO sanity checks.
  - Reissner-Nordstrom: horizon and charge-coupling checks.
  - Kerr-Newman: circular-orbit convergence and Hamiltonian drift checks.
  - Kerr-Schild: crossing `r+` without coordinate failure.
- Add `run-benchmarks.mjs`
  - Executes all benchmark cases.
  - Fails with nonzero exit code when tolerances are exceeded.
- Add `CONSERVATION-LEDGER.md`
  - Defines acceptable drift thresholds for Hamiltonian, energy, angular
    momentum, and event-horizon crossing diagnostics.

Original files touched: none.

## Phase 2: Add-Only API Unification

Status: completed.

- Add `physics-engine.mjs`
  - Provides one facade for the current standalone modules.
  - Uses Boyer-Lindquist outside strong horizon-crossing cases.
  - Uses Kerr-Schild for horizon-penetrating trajectories.
  - Exposes unified methods for:
    - geometry summaries
    - object spawning
    - orbit diagnostics
    - trajectory integration
    - tidal diagnostics
    - MHD jet updates
- Add `engine-contract.md`
  - Documents stable method names and expected input/output JSON shapes.

Original files touched: none.

## Phase 3: Add-Only Unit System

Status: completed.

- Add `units.mjs`
  - Geometric units to SI conversions.
  - Solar mass, kilometer, second, Tesla/Gauss helpers.
  - Object Library conversion helpers.
- Add `run-units-sample.mjs`
  - Demonstrates converting a simulation setup into physical scales.

Original files touched: none.

## Phase 4: Add-Only Performance Layer

Status: completed.

- Add metric and derivative caches.
- Add batch stepping helpers for many particles.
- Add worker-compatible module boundaries.
- Add performance benchmark runner.

Original files touched: none.

## Phase 5: Add-Only Rendering/Ray-Tracing Preparation

Status: completed.

- Add `ray-tracing.mjs`
  - Null geodesic camera rays.
  - Redshift and Doppler factors.
  - Photon ring sampling.
- Add `radiation-models.mjs`
  - Novikov-Thorne-like disk temperature and brightness profiles.
  - Synchrotron-inspired emissivity hooks.

Original files touched: none.

## Phase 6: Review Gate Before Original File Edits

Status: in progress (approved per-target).

Only after the add-only layers are stable should we consider modifying the
original browser demo files. Each target below is approved and landed
individually, keeping the change set small and reversible.

Integration targets:

- Replace or wrap `physics.js` with the new facade. — not started.
- Replace preview trajectory logic in `sim.js`. — not started.
- Add Object Library data to the current object picker. — **DONE (2026-06-03).**
  `full-physics-bridge.mjs` maps `OBJECT_LIBRARY` onto the demo spawn schema
  (`{ name, name_zh, kind, radius, binding, charge, spawnR }`, kinds collapsed to
  the five the drop flow understands; photon + Infinity-binding parcels excluded)
  and exposes it as `window.KNFull.objectCatalog` (10 bodies). The desktop picker
  (`panel-bottom.jsx`) and mobile SPAWN tab (`mobile-panels.jsx`) now source that
  catalog via the existing `knfull-ready` pattern, falling back to their inline
  lists if the bridge has not loaded. Verified in-browser (Playwright, desktop +
  mobile): both pickers render the 10 mapped cards with zh labels and a placed
  White-dwarf card spawns a `star` body. The only console 404 is the pre-existing
  external favicon for the AboutMe Portfolio link.
- Feed MHD jet output into existing MHD panels. — **DONE (2026-06-03).**
  `full-physics-bridge.mjs` adds `window.KNFull.jetDiagnostics(params, accretionRate)`,
  which settles the reduced multi-zone `MHDJetEngine` (owned by the facade) for the
  current (M,Q,a,B) + accretion and returns the calibrated quantities the demo's
  analytic `KNDisc.jetMetrics` does NOT model — column magnetization sigma,
  kink-instability risk, and synchrotron luminosity (bursty terms tail-averaged;
  result cached per params + accretion bucket so the settle runs only on change).
  The §04d `MHDReadout` (`panel-right.jsx`) shows those three as extra rows below
  the existing demo metrics, gated on `useFullBridgeReady()` and only when the jet
  is active/valid. The MHD monitor canvas (`mhd-monitor.jsx`) and demo visual loop
  are untouched. Verified in-browser (Playwright): jetDiagnostics settles to
  sensible values (valid for a/B>0, inert for a=B=0) and §04d renders the new
  sigma / kink / L_synch rows with no new console errors.
- Move heavy physics into a Web Worker. — not started.

Original files touched: yes, per approved target (so far: `panel-bottom.jsx`,
`mobile-panels.jsx`, and the add-only `full-physics-bridge.mjs`).

## Recommended Next Task

Phase 6 in progress: object library -> picker and MHD jet -> panels have landed.
Pick the next approved target. Remaining, lowest-risk-first: replace the `sim.js`
preview trajectory with the adaptive integrator, then wrap `physics.js` with the
facade, and finally move heavy physics into a Web Worker. Each remains gated on
explicit per-target approval before editing the corresponding root demo file.
