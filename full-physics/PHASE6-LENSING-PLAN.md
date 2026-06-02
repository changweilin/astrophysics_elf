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
4. **P6.4 — Mobile + i18n.** Wire `mobile-app.jsx`; externalize strings via
   `kn-l10n-translation`.
5. **P6.5 — Optional Option B overlay.** Add the one-line `render.js` hook and
   the equatorial bent-ray overlay, behind its own toggle.

Each checkpoint is independently revertable; stop after any one.

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
