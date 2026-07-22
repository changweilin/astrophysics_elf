# WASM PoC — geodesic ray-trace batch (Rust -> wasm32)

Proof-of-concept for the "port the physics hot kernel to WebAssembly"
evaluation (2026-07-22). **Evidence pack only — nothing here is wired into
the app.** The engine stays JS; see the phased plan below before adopting.

## What it is

`kn-wasm-trace/` is a zero-dependency Rust cdylib (no wasm-bindgen; plain
`#[no_mangle] extern "C"` over flat f64/f32/u8 buffers) that ports the #1
measured hotspot of the browser demo: the deflection-LUT trace phase of
`lensing-worker.mjs` — BL Kerr-Newman metric, Hamiltonian + central-diff
gradients, Dormand-Prince RK45 adaptive integration, camera-ray init
(ZAMO/canonical momentum), and in-kernel outcome extraction (capture/escape,
perihelion min-r, equatorial disc crossing, sky heading), exported as one
`trace_ray_batch()` call per LUT rebuild. Shading/redshift physics stays in
JS (`shim.mjs` = the seam a real `full-physics/wasm-trace.mjs` would own).

## Measured results (this machine, Node 24)

| case | JS | WASM | speedup |
|---|---|---|---|
| LUT build 79x42 + disc (desktop observer view) | 2565 ms | 269 ms | **9.5x** |
| trace-only 79x42 | 2500 ms | 245 ms | **10.2x** |
| LUT build 40x21 (coarse progressive pass) | 656 ms | 84 ms | 7.8x |
| single ray x50 | 34.2 ms | 3.4 ms | 10.1x |

JS <-> WASM boundary: one call per rebuild; no-op call 4 ns, full 136 KiB
outcome read-back 0.055 ms ~= **0.025%** of kernel time (batch-dominated,
the ideal WASM shape). `bench.out.json` holds the original run;
`bench-rerun.out.json` is the same suite re-run from this directory
(ratios ~10x stable; absolute ms inflated by concurrent load that day).

Correctness vs the real JS implementation (3318 rays, same tolerances,
identical accepted/rejected step counts): 100% capture/escape/disc
classification agreement, max sky-angle diff 2.7e-7 rad (gate 1e-3), disc
crossing r rel-diff max 1.4e-6, Hamiltonian drift parity (-9.95e-12 vs
-9.93e-12 JS), Pt bit-exact / Pphi 5e-16. Bitwise parity is impossible by
design (V8 vs Rust libm last-ulp sin/cos/atan2/pow differences amplify near
the photon sphere) — hence classification + ledger-threshold gates.

## Reproduce

```powershell
node bench.mjs            # uses the prebuilt kn_wasm_trace.wasm (38 KB)
# rebuild the wasm (needs rustup target add wasm32-unknown-unknown):
cd kn-wasm-trace; cargo build --release --target wasm32-unknown-unknown
```

`bench.mjs` imports the live engine modules from `../` read-only and exits
nonzero if any parity/speedup gate regresses.

## Adoption plan (if/when approved — full-physics/ is add-only)

A. crate under `full-physics/wasm/` + `cargo test` mirroring the
   conservation ledger natively.
B. `wasm-pack --target web` pkg vendored like `vendor/three.module.js` +
   `full-physics/wasm-trace.mjs` shim + a `run-wasm-parity-sample.mjs` gate.
C. flag-guarded opt-in fast path for the trace phase inside the existing
   lensing module worker (JS path stays default + fallback) — this step
   edits an existing file, so it needs Phase-6-style explicit approval.
D. measured follow-ups only after C: shadeLUTImage (10.9 ms main-thread
   azimuth reshade), Kerr-Schild RHS (24 us -> ~1 us), orbitDiagnostics.

Side finding from the parity work: `lensingTraceOptions()` in
`lensing-worker.mjs` silently drops the UI's intended 1e-5 trace tolerances
(observer-view.jsx TRACE), so production rays integrate at the 1e-9/1e-8
defaults — honoring the intended tolerances would speed up the JS *and*
WASM paths further, independent of this port.
