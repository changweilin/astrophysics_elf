# Full Kerr-Newman Physics Core

Benchmarked, high-fidelity ES-module physics core. It is **add-only**: nothing
here imports from the browser demo, and the demo reaches it only through the
root bridge `full-physics-bridge.mjs` (`window.KNFull`).

New engine-facing work goes through the facade `physics-engine.mjs`; its stable
method and JSON shapes are specified in `engine-contract.md`.

## Module map

| Module | Contents |
|---|---|
| `kn-full-physics.mjs` | Kerr-Newman metric in Boyer-Lindquist, horizons / static limit / horizon angular velocity / area / surface gravity / electric potential, ZAMO-frame init, charged Hamiltonian `H = 1/2 g^ab (P_a - qA_a)(P_b - qA_b)`, RK4 canonical integration, tidal estimates, thin-disc helpers, Blandford-Znajek jet diagnostics |
| `physics-engine.mjs` | Unified facade: geometry summaries, object spawning, orbit diagnostics, trajectory integration, tidal diagnostics, MHD jet updates, binary inspiral. Boyer-Lindquist outside horizon crossing, Kerr-Schild through it |
| `adaptive-integrator.mjs` | RK45 (Dormand-Prince) adaptive BL Hamiltonian integrator, error tracking, horizon guard; records `Pr`/`Ptheta` per frame |
| `kerr-schild-geodesics.mjs` | Horizon-penetrating Kerr-Schild metric + adaptive geodesic integrator |
| `orbit-diagnostics.mjs` | Numerical circular-orbit, ISCO, photon-orbit, charged-particle diagnostics (`findISCO`, `solveCircularMassiveOrbit`, `findPhotonCircularOrbit`) |
| `tidal-tensor.mjs` | Numerical Riemann / tidal tensor projected into a local tetrad |
| `object-library.mjs` | Standalone catalog: planets, stars, probes, ships, photons, dust, plasma |
| `mhd-jet-engine.mjs` | Reduced dynamic MHD jet: mass loading, magnetization, collimation, emissivity, kink risk, reconnection flares |
| `binary-inspiral.mjs` | Quasi-circular two-body inspiral (Peters 1964 + leading PN phasing): orbits-to-merge, chirp mass, GW frequency sweep, 1/eta mass-ratio scaling |
| `ray-tracing.mjs` | Null-geodesic camera rays, adaptive tracing, redshift/Doppler helpers, disc-hit estimation, photon-ring sampling |
| `radiation-models.mjs` | Novikov-Thorne-like disc brightness/temperature (optional `torqueRadius`), synchrotron emissivity hooks, jet-zone emission, false color |
| `lensing-worker.mjs` | Lensed-image renderer, deflection LUT, exact disc redshift, equatorial ray fan — see `PHASE6-LENSING-PLAN.md` |
| `units.mjs` | Geometric-unit to SI conversion for length, time, mass, charge, B field, power, and whole geometry/object/trajectory/jet payloads |
| `performance-layer.mjs` | LRU metric/derivative caches, deterministic particle clouds, duplicate-state batch stepping, measurement helpers |
| `physics-worker-runtime.mjs` | Worker-compatible message dispatcher (geometry, spawn, trajectories, batch step, units, jets) |
| `physics-benchmarks.mjs` + `run-benchmarks.mjs` | Schwarzschild / Kerr / Reissner-Nordstrom / Kerr-Newman / Kerr-Schild acceptance suite; nonzero exit on tolerance failure |

Sample runners (`node full-physics/run-*.mjs`, all exit 0 when healthy):
`run-sample`, `run-object-mhd-sample`, `run-advanced-models-sample`,
`run-horizon-crossing-sample`, `run-units-sample`, `run-performance-benchmark`,
`run-rendering-prep-sample`, `run-binary-inspiral-sample`, `run-lensing-sample`,
`run-lensing-lut-sample`, `run-lensing-sky-sample`.

`wasm-poc/` is an unwired Rust/WASM evidence pack (~10x on the trace kernel);
see its README before proposing adoption.

## Demo integration record

The add-only layers (geometry, units, performance, worker boundary, ray
tracing) landed without touching demo files. The **Phase 6** pass then wired
five approved targets into the root demo, each small and reversible:

| Target | What actually shipped |
|---|---|
| `physics.js` geometry scalars | `isco` / `photonSphereEq` take an optional `Q` and delegate to `window.KNFull.geometryScalars` only when `Q != 0` **and** the bridge is loaded — exact charge-aware radii; `Q=0` scenes are byte-identical and pay nothing. `ergosphereEq/Pole` were already exact; `circularSpeed`/`tidalStress` drive motion and were left alone |
| `sim.js` preview trajectory | Added as a **second** reference line, not a replacement: `KNFull.previewGeodesic` runs the adaptive integrator and `render.js` draws it as a muted violet dashed "GR" overlay. The existing dashed line stays pseudo-Newtonian so it still matches where the body really goes |
| Object picker | `OBJECT_LIBRARY` mapped onto the demo spawn schema as `KNFull.objectCatalog` (10 bodies); desktop `panel-bottom.jsx` + mobile SPAWN tab consume it via `knfull-ready`, with their inline lists as fallback |
| MHD panels | `KNFull.jetDiagnostics` adds what the demo's analytic `KNDisc.jetMetrics` does not model — column sigma, kink risk, synchrotron luminosity — as extra rows in §04d, gated on bridge readiness |
| Web Worker offload | `physics-worker-entry.mjs` moves `orbitDiagnostics` off-thread (~20 ms blocking -> ~0.1 ms cached + `knfull-update`), latest-wins single-flight; synchronous solve kept as fallback |

**The one deliberately-untaken follow-up:** live N-body motion is still
pseudo-Newtonian `phys.acceleration` by design — only *displayed* geometry was
wrapped. Porting the live loop to the adaptive integrator (binary, charge,
tidal, capture, perf) is a separate, larger, higher-risk effort; do not start
it without explicit approval.

## Model boundaries

A fixed-background test-particle spacetime simulator, not numerical relativity
or GRMHD. It does not evolve Einstein-Maxwell fields, fluid pressure, radiation
transport, or magnetic turbulence self-consistently. Thin-disc and jet APIs are
reduced diagnostics — physically grounded enough for planning and
visualization, not for research claims.

## Minimal API

```js
import { KerrNewmanSimulator } from "./full-physics/kn-full-physics.mjs";

const sim = new KerrNewmanSimulator({ M: 1.5, Q: 0.2, a: 1.0, B: 0.4 });
sim.addCircularOrbit({ name: "ship", kind: "ship", r: 8, prograde: true, radius: 0.02, binding: 8 });
sim.addPhoton({ name: "photon", r: 15, direction: [-0.2, 0, 0.98] });

const frames = sim.run({ steps: 1000, stepSize: 0.02, recordEvery: 100 });
console.log(frames.at(-1));
```

## Verify

`node full-physics/run-benchmarks.mjs` after any physics / catalog / facade /
unit / integration change (also part of `npm test`). Thresholds live in
`CONSERVATION-LEDGER.md` and are only widened for a documented model change,
never to hide a regression.
