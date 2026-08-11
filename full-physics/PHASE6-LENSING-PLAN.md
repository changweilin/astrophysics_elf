# Lensing / Black-Hole Shadow — Implementation Notes

**Status: shipped and live.** This was a plan; it is now the reference for what
the code *does*. Section numbers are load-bearing — `lensing-worker.mjs`,
`lensing.js`, `observer-view.jsx`, `mobile-app.jsx`, and the lensing sample
runners cite **sec 4.5** and **sec 7** by name. Keep those headings stable.

Files: `full-physics/lensing-worker.mjs` (renderer + LUT + equatorial rays),
`lensing-worker-entry.mjs` (module-worker entry), root `lensing.js`
(`window.KNLensing` bridge), `observer-view.jsx` (`window.ObserverView`),
samples `run-lensing-sample.mjs` / `run-lensing-lut-sample.mjs` /
`run-lensing-sky-sample.mjs`.

## 1. Why a separate view exists

The main canvas is a **top-down map of the equatorial plane** — there is no
observer line-of-sight toward the hole, so a lensed starfield painted behind it
would be physically incoherent (the two projections share no camera). Hence the
dedicated **Observer View** panel (own canvas, own camera: inclination /
distance / FOV / azimuth). A complementary top-down overlay also shipped: a fan
of true equatorial null geodesics plus the dashed critical-impact-parameter
circle, drawn from one hook in `render.js` gated by `sim.flags.showLensing`.

**The two are decoupled on purpose.** `LENS` (`sim.flags.showLensing`) drives
only the main-canvas overlay; the Observer View window is opened from the
window dock (`KN_WIN_REGISTRY` in `drag-move.js`) and defaults closed, because
ray tracing is the heavy half. `window.KNLensing` is always available, so the
window works with the flag off — and a `?demo=` that sets `showLensing` does
not auto-open the window.

## 4. Performance strategy

Per-pixel RK45 geodesics cannot run per frame. The shipped decoupling:
off-thread module worker; render on parameter change, debounced ~220 ms;
progressive coarse-then-fine with a cancel token; LRU cache keyed by
(params, camera, size); main-thread `import()` fallback when a module worker
cannot be created.

**Hard numeric constraints found by measurement — do not "optimize" these away:**

- Full GR tracing costs ~1.4 ms/ray.
- The shadow needs `targetAffine >= ~30`; shorter budgets stop classifying
  central plunging rays as captured and the shadow disappears.
- The horizon capture test needs the default small `minStep`; raising the step
  floor also erases the shadow. Cost is therefore `targetAffine/maxStep`-bound,
  not tolerance-bound — the real lever is the WASM kernel (`wasm-poc/`), not
  looser tolerances.
- Base trace grids stay small (desktop 72x40, mobile 64x40).

### 4.5 Deflection LUT (the fast path)

`buildDeflectionLUT` + `shadeLUTImage` (`build-lut` worker message) trace the
grid **once** into a per-pixel outcome LUT: capture flag, escaped sky
direction, ring glow, disc-crossing (r, phi), and `discG`. The bridge
(`KNLensing.buildLUT` / `shadeLUT` / `requestRenderLUT` / `reshadeLUT`) caches
it under a key that **omits camera azimuth** — Kerr-Newman is axisymmetric, so
an azimuth change is a cheap reshade of the cached trace (this is what the
desktop AZ control uses). Shading runs on the main thread at a larger display
resolution (desktop 180x100, mobile 160x100) via boundary-aware bilinear
upsampling with an anti-aliased shadow edge, so the panel no longer
block-upscales the trace grid.

Gate: `run-lensing-lut-sample.mjs` asserts the LUT base shade equals the direct
render **byte-for-byte**.

## 7. Physics mapping

- **Shadow**: rays classified `captured` -> dark.
- **Photon ring**: analytic `photonRingSamples(...).angularRadius`,
  cross-checked against per-pixel grazing rays.
- **Lensed starfield**: sampled along the ray's `asymptoticSkyDirection` — the
  velocity **heading** at the endpoint, not the endpoint position angle. Most
  bending happens near periapsis, so by the truncation radius (~40) the photon
  is already on its near-straight asymptote. Validated against rays integrated
  to r~4000: heading reproduces the asymptotic direction to <=0.16 deg (max over
  37 rays) vs ~24 deg for the raw position angle. Integrating far enough for
  rays to genuinely escape was measured impractical (10-70 s/build), and a 1/r
  analytic tail correction measured ~10x worse than the heading — both rejected.
- **Disc image**: `renderRayRadiance` + `composeFalseColor`, with the exact
  per-ray redshift below.

**Exact disc redshift.** `discRedshiftExact` replaces the old kinematic
`discShiftApprox` (now a last-resort fallback only). Pt and Pphi are conserved
along the geodesic and both the circular-orbit emitter and the ZAMO observer
have only t/phi four-velocity components, so g = nu_obs/nu_emit follows from
`redshiftFactor()` using the per-ray conserved Pt/Pphi on `finalState`. g is
azimuth-invariant -> cached per pixel in the LUT as `discG`.

**Inside the ISCO the emitter plunges.** No timelike circular orbit is
occupied there, so `resolveDiscG` models the gas as geodesically plunging from
the marginally stable orbit carrying the ISCO's conserved (E, L) (Cunningham
1975; Reynolds & Begelman 1997): `iscoConservedEL` + `plungingFourVelocity`.
That u^mu has u^r != 0, so the photon's own P_r at the crossing enters -k.u —
the integrator records `Pr` per frame and `crossingRadialMomentum` interpolates
it at the equatorial crossing (u^theta = 0, so P_theta drops out). Two
refinements: (a) `iscoConservedEL` takes the ISCO radius and (E, L) from the
benchmarked numeric solver (`findISCO` + `solveCircularMassiveOrbit`), so the
charge Q enters both — M=1.5, Q=0.22, a=0.6 gives exact ISCO 6.865 vs the
charge-ignoring Kerr 6.922; (b) the split is on `r < r_ISCO` directly, not on
whether a circular orbit exists — unstable circular orbits do persist between
the photon orbit and the ISCO, but accreting gas does not occupy them.

**Zero-torque boundary at the ISCO.** `novikovThorneLikeFlux` takes an optional
`torqueRadius` (defaults to `innerR`, so all other callers are byte-identical);
the lensing render passes `geom.iscoEL.rIsco`, pinning the `1 - sqrt(r_t/r)`
factor's bright inner edge at the ISCO and clamping flux to 0 inside it. A
finite-ISCO-torque (Agol-Krolik) glowing plunging region was considered and
deferred.

Gates in `run-lensing-lut-sample.mjs`: inside-ISCO crossings all yield finite,
positive g straddling 1 (check 4); flux inside the ISCO is exactly 0 with the
pin and > 0 just outside (check 5).

## Still deferred (needs approval before starting)

- Fully-exact elliptic-integral sky. Measured unnecessary — the heading
  approximation is already within 0.16 deg.
- Agol-Krolik finite-ISCO-torque plunging-region glow (deliberately rejected in
  favour of the zero-torque thin-disc model).

## Verification

`node full-physics/run-benchmarks.mjs` (26/26), `run-lensing-sample.mjs`,
`run-lensing-lut-sample.mjs`, `run-lensing-sky-sample.mjs` — the last two are
part of the slow tier (`npm run test:full`). Manual: toggle LENS and sweep `a`
from 0 to near-extremal; the shadow must go asymmetric (D-shape) and the photon
ring must shift. Visuals stay muted, never neon.
