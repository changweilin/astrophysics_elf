# Phase 6 Wiring Plan: Gravitational Lensing / Black-Hole Shadow

Status: **proposed, awaiting approval.** This document is add-only and touches
no original demo files. It describes the first Phase 6 integration (see
`PROGRESS-PLAN.md`, Phase 6 "Review Gate"): wiring the already-benchmarked
`ray-tracing.mjs` + `radiation-models.mjs` layers into the browser demo so a
user can see relativistic light bending, the photon ring, and the shadow.

## 1. Goal

Let the user *see* the bending of light around the configured Kerr-Newman
object: the shadow (capture region), the bright photon ring, the Einstein-ring
lensing of a background starfield, and (when a disc is present) the
Doppler-beamed / gravitationally-redshifted disc image. Visuals stay muted and
gentle, never neon glare (user preference, `viz-soft-not-flashy`).

All heavy physics comes from the existing stable facade — no new numerical
core is written. The engine already provides every primitive we need:

- `traceCameraRays(params, camera, options)` — null geodesics per camera pixel.
- `makeCameraRayGrid` / `tracePhotonRay` / `classifyRayResult` — capture vs
  escape vs disc-hit classification.
- `photonRingSamples(params, options)` — analytic photon-ring angular radius.
- `redshiftFactor`, `dopplerBoost` — frequency shift along a ray.
- `renderRayRadiance`, `composeFalseColor`, `sampleDiskBrightnessProfile`
  (in `radiation-models.mjs`) — disc/jet emission and muted false-color.

## 2. The constraint that shapes everything: the main view is top-down

The main canvas (`render.js`) is a **bird's-eye map of the equatorial plane**.
`worldToScreen(sim, w, h, x, y)` projects world coordinates in the orbital
plane straight to the screen; the horizon, ergosphere, ISCO, disc, and bodies
are all drawn as a top-down map. There is **no observer line-of-sight toward
the hole** in this view.

The iconic lensed image (shadow + photon ring + warped starfield) is what an
observer *pointed at the hole* sees. Painting a lensed starfield "behind" the
top-down map would be physically incoherent — the two projections do not share
a camera. This is the central design decision below.

## 3. Two integration shapes

### Option A (recommended): a dedicated "Observer View" panel

A new draggable panel — a sibling of `TidalMicroscope`, `MHDMonitor`, and
`FieldScope` — renders the lensed image from a configurable observer camera
(inclination + distance + FOV). This is physically correct, reuses the
existing floating-panel pattern, and requires **near-zero changes to
`render.js`** (the main top-down loop is untouched).

- Pros: physically honest; isolates the expensive render from the 60 fps
  top-down loop; matches the established panel architecture; easy to gate
  behind a toggle so cost is opt-in.
- Cons: a second view to explain; needs its own small camera UI.

### Option B (complementary, lighter): top-down light-bending overlay

In the existing top-down canvas, draw a handful of **bent null geodesics** in
the equatorial plane (rays that graze the photon sphere and curve), plus a
faint lensing "halo" ring at the photon-ring impact radius. This augments the
map the user already understands but is *not* the classic shadow image.

- Pros: lives in the view the user is already looking at; cheap (tens of rays,
  not a full image); reinforces the existing photon-sphere ring.
- Cons: not the iconic shadow; only the equatorial slice of lensing.

**Recommendation:** build **Option A** as the headline feature, and optionally
add **Option B** later as a cheap toggle in the main view. The rest of this
plan details Option A and notes where Option B diverges.

## 4. Performance strategy (the real risk)

Per-pixel adaptive RK45 geodesic integration is far too heavy for a per-frame
real-time raytrace in the browser. The plan therefore decouples computation
from the animation loop:

1. **Off-thread render.** Move ray tracing into a Web Worker
   (`physics-worker-runtime.mjs` already establishes the worker-message
   pattern; add a lensing-specific handler or a thin dedicated worker).
2. **Render on parameter change, not per frame.** Recompute only when
   `(M, Q, a)` or the camera changes, debounced (~250 ms). Between renders the
   panel shows the last `ImageBitmap`.
3. **Progressive resolution.** Render coarse first (e.g. 48x48), then refine to
   the target (e.g. 192x192 or 256x256) so the panel updates immediately and
   sharpens. `traceCameraRays` already supports `maxRays` for chunking.
4. **Cache per `(M, Q, a, camera)` key** (the bridge already caches geometry
   and orbit diagnostics by a `paramsKey`; reuse that idea).
5. **Cheap-refresh path (optional).** Precompute a deflection lookup table
   (screen sample -> escaped sky direction / capture flag) once per parameter
   set, then warp a static starfield by bilinear LUT sampling on cheap frames
   (e.g. when only rotating the camera azimuth). Avoids re-integrating rays for
   pure view changes.

Target budget: a 192x192 progressive render completes within ~1-2 s on a param
change; cheap LUT-warp refreshes stay interactive.

## 5. Architecture and data flow

```
(M,Q,a) + camera                       new add-only files
      |                                 ----------------------------------
      v                                 lensing-worker.mjs  (Web Worker:
 Observer View panel --- postMessage -->  traceCameraRays / renderRayRadiance
 (observer-view.jsx)  <-- ImageBitmap --   + composeFalseColor; progressive)
      |                                 lensing.js          (window.KNLensing
      |  draws bitmap + photon-ring         bridge: param sync, debounce,
      |  overlay + redshift legend          cache, worker lifecycle)
      v
 floating canvas (own <canvas>, not the main top-down one)
```

- `lensing-worker.mjs` (add-only, ESM): imports `ray-tracing.mjs` and
  `radiation-models.mjs`, receives `{params, camera, options}`, returns a
  typed-array image (or `ImageBitmap` via `createImageBitmap`) plus the
  photon-ring angular radius and a redshift summary.
- `lensing.js` (add-only): defines `window.KNLensing`, mirroring the
  `full-physics-bridge.mjs` pattern — owns the worker, debounces requests,
  caches by params/camera key, and dispatches a `knlensing-ready` event.
- `observer-view.jsx` (add-only): the React panel. Owns its own `<canvas>`,
  camera state (inclination slider, distance, FOV, optional auto-rotate),
  blits the latest bitmap, overlays the analytic photon ring from
  `photonRingSamples`, and shows a small redshift/Doppler legend. Reuses the
  existing draggable-window CSS/behavior (`drag-move.js`).

## 6. File-by-file change list

### 6a. Add-only (no approval needed beyond this plan)

- `full-physics/lensing-worker.mjs` — worker render entry over existing
  ray-tracing/radiation modules.
- `lensing.js` — `window.KNLensing` bridge (worker lifecycle, debounce, cache).
- `observer-view.jsx` — the Observer View panel (`window.ObserverView`).
- `full-physics/run-lensing-sample.mjs` — node smoke runner that renders a tiny
  grid and prints capture/escape/disc-hit counts + photon-ring radius, mirroring
  `run-rendering-prep-sample.mjs`. Gives a `node --check`-able verification path
  before any browser wiring.

### 6b. Original demo files (THIS is the Phase 6 edit that needs approval)

Kept deliberately minimal — all logic lives in the add-only files above.

- `index.html` — add two `<script>` tags: `lensing.js` and the
  `observer-view.jsx` Babel module (and the worker is loaded by `lensing.js`,
  not from HTML). ~2 lines.
- `app.jsx` — mount `<ObserverView sim={SIM} force={force} />` next to
  `<MHDMonitor />` (line ~530) and add one `ToggleBtn` (e.g. `LENS` /
  `透鏡`) in the `overlay-bl` toggle row to show/hide it. ~3 lines.
- `mobile-app.jsx` — mount the mobile equivalent (or reuse with a compact
  layout) and a matching toggle. ~3 lines.
- `render.js` — **only if Option B is also adopted:** a single optional hook
  right after `ctx.clearRect` / `applyFrameLock`, e.g.
  `if (sim.flags.showLensing && window.KNLensing) window.KNLensing.renderOverlay(sim, ctx, w, h);`
  All overlay drawing lives in `lensing.js`. ~1 line. Option A alone needs no
  `render.js` change.
- `i18n-dict.js` — add the new UI strings (`LENS`, panel title, camera labels,
  redshift legend) for zh-Hant/zh-Hans/en via the `kn-l10n-translation` skill.

### 6c. Globals (guardrail compliance)

New globals follow the existing naming: `window.KNLensing`,
`window.ObserverView`. No existing global is touched. Identifiers, object IDs,
and file paths stay ASCII-only.

## 7. Physics mapping (what each visual element comes from)

- Shadow / capture region: pixels whose ray `classification.status` is
  `captured` -> dark.
- Photon ring: bright annulus at `photonRingSamples(...).angularRadius`;
  cross-checked against the per-pixel grazing rays.
- Lensed starfield: each escaping ray's `finalState` direction samples a
  background sky texture -> warped star positions (Einstein-ring arcs emerge
  naturally).
- Disc image: rays that hit the equatorial disc use `renderRayRadiance` +
  `composeFalseColor`; Doppler beaming and gravitational redshift come from
  `redshiftFactor` / `dopplerBoost` (one side brighter/bluer, the far side
  dimmer/redder). This is also feature #2 ("disc Doppler/redshift coloring");
  the lensing camera delivers it for free.

## 8. Phased rollout with checkpoints

1. **P6.1 — Add-only core. DONE.** Added `lensing-worker.mjs`
   (`renderLensingImage` pure renderer + `attachLensingWorkerGlobal` worker
   boundary, DOM-light, no auto-attach) and `run-lensing-sample.mjs` (prints ray
   counts, photon-ring radius, and an ASCII class map + luminance preview).
   Verified: smoke runner renders a centered shadow ringed by the photon ring
   inside a lensed disc that arcs over the top; `run-benchmarks.mjs` 26/26 pass;
   `run-rendering-prep-sample.mjs` / `run-sample.mjs` / `run-units-sample.mjs`
   still exit 0. *No demo files touched.* Known approximation: disc Doppler uses
   a kinematic+gravitational estimate (`discShiftApprox`) pending exact per-ray
   `redshiftFactor`; background starfield warp samples truncated "active" rays
   (longer affine budget would convert them to true "escaped" sky directions).
2. **P6.2 — Bridge. DONE.** Added `lensing.js` (`window.KNLensing`) and
   `lensing-worker-entry.mjs` (module-worker entry that calls
   `attachLensingWorkerGlobal`). The bridge owns the worker, debounces
   (~220 ms), caches results per (params, camera, size) with an LRU, renders
   progressively (coarse then full via a render token that cancels stale work),
   and falls back to a main-thread dynamic `import()` of `lensing-worker.mjs` if
   a module worker cannot be created or fails to load. Emits `knlensing-ready`,
   `knlensing-frame`, and `knlensing-error` events plus an optional `onFrame`
   callback; results carry `{ buffer, imageData }` ready for canvas blit.
   Verified: `node --check` on both files; the worker message protocol the
   bridge consumes (`{id, ok, type, payload, buffer}` + transferred ArrayBuffer,
   buffer length = w*h*4) confirmed against `handleLensingWorkerMessage`. No
   physics/facade/unit module changed, so the P6.1 benchmark result still holds.
   Neither file is referenced by `index.html` yet. *No demo files touched.*
3. **P6.3 — Panel (desktop). DONE.** Added `observer-view.jsx` (`window.ObserverView`,
   a draggable panel reusing the FieldScope shell: `field-section`/`fs-canvas`/
   `microscope-head` classes, `knUseDragMove('observer', ...)`, event-driven blit
   of `window.KNLensing` frames with no per-frame loop). Wired root files:
   `index.html` loads `lensing.js` + `observer-view.jsx`; `app.jsx` adds a
   `LENS`/`透鏡` toggle (`sim.flags.showLensing`) and mounts the panel only when
   on (opt-in, since ray tracing is heavy). Verified in-browser via Chrome
   (playwright, channel=chrome): clicking LENS opens the panel, the off-thread
   renderer produces a progressive coarse(24x24)->fine(72x40) image with a dark
   shadow center (luminance ~6/255) ringed by a bright photon ring (~138/255),
   no page/console/render errors. **Performance note:** full GR ray tracing is
   ~1.4 ms/ray and the shadow needs `targetAffine >= ~30` (shorter budgets stop
   classifying central plunging rays as captured, erasing the shadow), and the
   horizon capture test needs the default small `minStep` (raising the step floor
   erases the shadow). The panel therefore renders at low resolution (72x40) with
   a fast trace preset and relies on debounce + coarse-then-fine. A deflection-LUT
   fast path (sec 4.5) remains the route to higher resolution / smooth camera
   rotation. Toggle defaults off, so there is zero cost until opted in.
4. **P6.4 — Mobile + i18n. DONE.** Added a `lensing` target to the mobile
   PROFILE cycler in `mobile-app.jsx`: unlike the synchronous scopes it requests
   an off-thread render from `window.KNLensing` only when (M, Q, a) changes and
   blits the latest cached frame each tick, so cost is paid only while that
   target is open (no extra toggle/flag needed). Externalized the new UI strings
   in `i18n-dict.js` with full ja/ko/de/fr/es/it coverage (`LENS`, `OBSERVER
   VIEW`, `LENSING`, `TILT`, `shadow`, `ring`, `rendering…`, `lensing engine
   offline`, and the three tooltips); `DISC` reused an existing entry. Verified
   in mobile emulation (390x844, touch): cycling to 重力透鏡 opens the stage and
   renders the shadow+ring (center luminance ~6/255, peak ~150/255), no page or
   console errors. Known cosmetic limit: at the large mobile stage the 64x40
   render upscales blocky — the deflection-LUT path (sec 4.5) is the real fix.
5. **P6.5 — Option B overlay. DONE.** Added `traceEquatorialRays` to
   `lensing-worker.mjs` (a fan of true equatorial null geodesics via the existing
   integrator, returned as Cartesian polylines + the critical impact parameter)
   and a `equatorial-rays` worker message. The bridge gained
   `KNLensing.equatorialRays()` (off-thread, cached per (M,Q,a), main-thread
   fallback) and `KNLensing.renderOverlay(sim, ctx, w, h, worldToScreen)`, which
   recomputes the geodesics off-thread only on parameter change (debounced) and
   each frame draws the cached bent rays (cyan = bends past, red = falls in) plus
   a dashed critical-impact-parameter circle. `render.js` gained a single hook
   after the disc draw, gated by `sim.flags.showLensing` (so the LENS toggle now
   shows both the Observer View panel and this top-down overlay — one unified
   "lensing" concept rather than a second toggle). Verified: `traceEquatorialRays`
   returns 13 rays / 4 captured / bCrit ~6.5 in node; in-browser the overlay
   renders muted bent geodesics + the b_crit circle around the hole with no
   errors; `run-benchmarks.mjs` 26/26 still pass.

Each checkpoint is independently revertable; stop after any one.

## Status: complete

All of P6.1-P6.5 are implemented and verified. The headline feature (Option A
Observer View, desktop + mobile, with i18n) and the optional Option B top-down
overlay are both live behind the opt-in `LENS` toggle.

**Deflection-LUT fast path (sec 4.5): DONE.** `buildDeflectionLUT` +
`shadeLUTImage` (`lensing-worker.mjs`, `build-lut` worker message) trace the grid
once into a per-pixel outcome LUT (capture flag / escaped sky direction / ring
glow / disc-crossing r,phi). The bridge (`KNLensing.buildLUT` / `shadeLUT` /
`requestRenderLUT` / `reshadeLUT`) caches the LUT by a key that omits camera
azimuth (Kerr-Newman is axisymmetric) and shades it on the main thread at a
larger display resolution via boundary-aware bilinear upsampling with an
anti-aliased shadow edge — so the panel no longer block-upscales the trace grid
(desktop 180x100 from base 72x40, mobile 160x100 from base 64x40), and a new
desktop AZ control rotates the camera azimuth by reusing the cached trace.
Verified by `run-lensing-lut-sample.mjs` (LUT base shade == direct render
byte-for-byte; coherent upsample; cheap azimuth reshade), benchmarks 26/26, and
desktop+mobile browser drives.

**Exact per-ray disc redshift (sec 7): DONE.** `discRedshiftExact`
(`lensing-worker.mjs`) replaces the kinematic `discShiftApprox`. Because Pt and
Pphi are conserved along the geodesic and both the disc circular-orbit emitter
and the ZAMO camera observer have only t/phi 4-velocity components, the exact
g = nu_obs/nu_emit follows from `redshiftFactor()` using just the per-ray
conserved Pt/Pphi on `finalState`. g is azimuth-invariant, so it is cached per
pixel in the deflection LUT (`discG`) and interpolated on shade.

**Inside-ISCO plunging-region emitter (sec 7 follow-up): DONE.** Down to the
ISCO the emitter is a circular orbit (above); inside it no timelike circular
orbit exists and the first pass dropped back to the kinematic `discShiftApprox`.
`resolveDiscG` now models the gas as geodesically PLUNGING from the marginally
stable orbit, carrying the ISCO's conserved (E, L) (Cunningham 1975; Reynolds &
Begelman 1997): the emitter at r < r_isco is the equatorial timelike geodesic
with those (E, L) (`iscoConservedEL` + `plungingFourVelocity`). That u^mu has a
radial part u^r != 0, so unlike the circular case the photon's own P_r at the
crossing enters -k.u; the adaptive integrator now records `Pr`/`Ptheta` per
frame and `crossingRadialMomentum` interpolates P_r at the equatorial crossing
(u^theta is still 0, so P_theta drops out). g stays azimuth-invariant (an
azimuth rotation moves photon + crossing rigidly), so the per-pixel LUT cache is
preserved; `discShiftApprox` is now only a last-resort fallback.

Two refinements followed: (a) `iscoConservedEL` now takes the ISCO radius AND the
conserved (E, L) from the benchmarked Kerr-Newman numeric solver (`findISCO` +
`solveCircularMassiveOrbit` in `orbit-diagnostics.mjs`), so the charge Q enters
both — for M=1.5, Q=0.22, a=0.6 the exact ISCO is 6.865 vs the charge-ignoring
Kerr value 6.922; `iscoConservedELApprox` (Kerr analytic) is the fallback. (b)
`resolveDiscG` now splits on r vs r_ISCO directly rather than on whether a
circular orbit exists: timelike but UNSTABLE circular orbits persist between the
photon orbit and the ISCO, but accreting gas does not occupy them, so the whole
r < r_ISCO band uses the plunging emitter. Verified by
`run-lensing-lut-sample.mjs` (check 4): a disc reaching inside the ISCO yields
inside-ISCO crossings whose g are all finite/positive and straddle 1 (deeper
redshift than the circular region from the extra infall), asserted as a hard
regression gate; disc g straddles 1, LUT base shade still matches the direct
render byte-for-byte, benchmarks 26/26, muted in-browser.

**Inside-ISCO emissivity / zero-torque boundary: DONE.** With the plunging
redshift correct, the remaining question was where the disc actually emits inside
the ISCO. The thin-disc answer (chosen): the viscous zero-torque boundary belongs
at the ISCO, not at the disc's geometric inner edge. `novikovThorneLikeFlux` now
takes an optional `torqueRadius` (defaults to `innerR`, so all existing callers
are byte-identical); the lensing render passes `geom.iscoEL.rIsco`, so the
`1 - sqrt(r_torque/r)` factor pins the bright inner edge at the ISCO and clamps to
0 inside it — a disc reaching into the plunging region stays dim there (and the
plunging redshift still modulates the residual/edge emission). Verified by
`run-lensing-lut-sample.mjs` (check 5): for a disc with innerR < ISCO, flux inside
the ISCO is exactly 0 with the pin (vs > 0 without it) and > 0 just outside the
ISCO; asserted as a hard gate. A finite-ISCO-torque (Agol-Krolik) model that lets
the plunging region glow was considered and deferred in favour of the zero-torque
thin-disc model. Benchmarks 26/26, all smoke samples green.

**Starfield warp (P6.1 note): DONE (validated near-exact).** The literal fix
(longer affine budget so rays escape) was measured impractical (10-70 s/build at
72x40, ~0 rays escaping). Instead the lensed background is sampled along the
ray's `asymptoticSkyDirection` (the velocity HEADING at the endpoint) rather than
the endpoint position angle: most bending happens near periapsis (a few M), so by
the truncation radius (~40) the photon is already on its near-straight asymptote
and its tangent IS the sky direction. Validated by `run-lensing-sky-sample.mjs`
against rays integrated to r~4000: the heading reproduces the asymptotic
direction to <=0.16 deg (max over 37 rays) vs ~24 deg for the raw position angle.
A 1/r analytic tail correction was tried and measured ~10x worse than the
heading, so it was rejected; the elliptic-integral asymptotic is therefore
unnecessary. Verified: LUT base shade still matches the direct render
byte-for-byte, benchmarks 26/26, coherent in-browser.

All three follow-ups from the Phase 6 note (deflection LUT, exact disc redshift,
starfield warp) are now addressed.

## 9. Verification gate (per CLAUDE.md)

- `node --check render.js` (if touched), `node --check serve.mjs`.
- `node .\full-physics\run-benchmarks.mjs` — must pass.
- New smoke: `node .\full-physics\run-lensing-sample.mjs`.
- Existing smokes still green: `run-sample.mjs`, `run-object-mhd-sample.mjs`,
  `run-units-sample.mjs`, `run-rendering-prep-sample.mjs`.
- Manual: launch via the `run` skill, toggle the Observer View, sweep
  `a` from 0 to near-extremal and confirm the shadow goes asymmetric (D-shape)
  and the photon ring shifts — the qualitative GR signature.

## 10. Risks and mitigations

- **Cost / jank.** Mitigated by worker + debounce + progressive + cache (sec 4).
  The 60 fps top-down loop is never blocked (Option A renders off-thread into a
  separate canvas).
- **Babel-in-browser + Web Worker + ESM.** The worker uses native ESM
  (`type: "module"` worker), independent of the in-browser Babel that compiles
  the `.jsx`. `lensing.js` is plain UMD-style like the other root scripts. No
  bundler introduced (guardrail).
- **Coordinate edge cases** near the horizon and poles are already handled by
  the benchmarked integrator; the panel only consumes its output.
- **Scope creep into render.js.** Held to a single optional hook, and only if
  Option B is approved; Option A keeps `render.js` untouched.

## 11. Decision (confirmed)

**Chosen: Option A — Observer View panel.** Build the real lensed shadow image
as a new floating panel; `render.js` stays untouched; root-file edits (~8 lines)
land only at P6.3+. Option B remains available as a later cheap complementary
toggle but is out of scope for the first pass.

Next actionable step: **P6.1 (add-only)** — `lensing-worker.mjs` +
`run-lensing-sample.mjs`. P6.1 and P6.2 modify no original demo files and are
fully reversible. The first edits to original demo files happen at **P6.3**
(`index.html` + `app.jsx`) and still require an explicit go-ahead at that point.
