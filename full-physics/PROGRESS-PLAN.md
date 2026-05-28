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

Status: blocked until explicitly approved.

Only after the add-only layers are stable should we consider modifying the
original browser demo files.

Potential integration targets:

- Replace or wrap `physics.js` with the new facade.
- Replace preview trajectory logic in `sim.js`.
- Add Object Library data to the current object picker.
- Feed MHD jet output into existing MHD panels.
- Move heavy physics into a Web Worker.

Original files touched: yes, but only after explicit approval.

## Recommended Next Task

Review the add-only package and decide whether to approve Phase 6 UI
integration.

Reason: all planned add-only physics, reliability, facade, units,
performance/worker, and rendering-preparation layers are now in place. The
remaining work requires explicit approval because it would modify original
browser demo files.
