# GPU Render Layer Plan (`render3d-gpu.mjs`)

Phased replacement of the fixed-function look of `render3d.mjs` with a GPU
shader layer. Agent-facing; read with `CLAUDE.md` and
`full-physics/PHASE6-LENSING-PLAN.md`.

## Why

`render3d.mjs` is 2161 lines of Three.js r169 that contains **zero**
`ShaderMaterial`, `onBeforeCompile` or `InstancedMesh`. Everything is drawn
with the fixed-function materials that shipped with WebGL 1-era Three:

| Current | Consequence |
|---|---|
| `MeshBasicMaterial` everywhere (horizon, ergosphere, star, jets, bodies) | no lighting, no depth cues, flat silhouettes |
| `PointsMaterial` x3 pools (disc 2200 + cloud 4500 + fx 4500 pts) | 11200 points refilled by JS loops **every frame**; per-particle look is one canvas gradient |
| `SpriteMaterial` billboards, `LineBasicMaterial` 1px lines | glare control only via opacity; lines cannot be weighted |
| no `toneMapping`, no `outputColorSpace` set, no post stack | LDR straight to canvas: banding on the near-black sky, highlights clip hard |
| accretion disc is a point cloud | no continuous surface, so no proper Doppler beaming, no gravitational redshift gradient, no secondary (lensed) image |
| jets are two unlit `CylinderGeometry` cones | no volume, no plasma structure |
| lensing runs in a CPU worker and `shadeLUT` shades **on the main thread** | display resolution coupled to CPU cost; cannot run per-frame |

`vendor/` holds only `three.module.js` — no `examples/jsm` addons — so the post
stack is hand-written. That is consistent with the zero-dependency rule.

## Constraints this plan respects

1. **Additive first.** The layer lives in new files. Phase 1 reaches the
   existing renderer only by patching `R3D.attach` / `R3D.detach` and
   `renderer.render` at runtime — `render3d.mjs` keeps a zero diff, and with
   the layer off the old path is byte-identical.
2. **`window.KNRender3D` is unchanged.** The layer adds one property,
   `KNRender3D.gpu`, and nothing else.
3. **Muted visuals.** High bloom threshold, low intensity, highlight
   desaturation instead of saturation boost. Never neon.
4. **Measure before tuning.** No physics constant is invented in a shader.
   Phase 2 takes `beta`/`g` from the same expressions `disc.js` already uses;
   Phase 3 samples the benchmarked deflection LUT. Shaders present physics,
   they do not define it.
5. **Graceful degrade.** Feature detection on WebGL2 + half-float render
   targets. On failure, or with `quality: 'off'`, the patch is removed and the
   fixed-function path runs exactly as before.

## Public control surface

```js
window.KNRender3D.gpu = {
  available,                 // feature detection result (read-only)
  enabled,                   // live toggle
  quality: 'high'|'medium'|'off',
  exposure, vignette, grain,
  bloom: { threshold, intensity, radius },
  disc: {                    // Phase 2, render3d-gpu-disc.mjs
    enabled, gExp, brightness, turbulence, flare,
    colorGamma, hotDesat, maxIntensity, showPoints,
  },
  jets: {                    // Phase 4, render3d-gpu-jets.mjs
    enabled, brightness, density, turbulence, turns, flow, knots,
    beaming, beamExp, maxIntensity,
    fieldLines, lineWidth, showCones, steps,
  },
  bodies: { enabled },       // Phase 5, render3d-gpu-bodies.mjs
  lines: { enabled, width }, // Phase 5, render3d-gpu-lines.mjs (width: device px)
  set(partial),              // merge + re-apply without a reload
};
```

`set()` MERGES `bloom`, `disc`, `jets`, `bodies` and `lines` rather than replacing them — the
layer modules hold the same object references, so assigning a fresh one would
detach every uniform from the control surface.

## Phases

### Phase 1 — HDR pipeline and GPU point sprites  *(DONE)*

New file `render3d-gpu.mjs`, one `<script type="module">` line in
`index.html`.

- Scene renders into a half-float, 4x-multisampled `WebGLRenderTarget`
  instead of the default framebuffer (MSAA is preserved; `antialias: true` on
  the default framebuffer stops applying once a target is bound).
- Hand-written bloom: soft-knee bright pass -> 3-4 mip levels, separable
  5-tap Gaussian (linear-sampling weights) -> additive upsample walk.
- Composite pass: exposure -> highlight desaturation -> ACES (Narkowicz)
  tonemap -> radial vignette -> manual linear->sRGB encode -> hash dither
  against 8-bit banding. The encode must be manual: a raw `ShaderMaterial`
  gets no `colorspace_fragment` injection from Three.
- The three `PointsPool` materials become a `ShaderMaterial`: analytic
  halo+core falloff instead of the 64px canvas gradient, per-particle size
  jitter and twinkle hashed from world position (so no attribute is added and
  `PointsPool.add()` keeps its signature — every `draw*` function is
  untouched).

Verification: `npm run check`, then the app in the browser — the layer must be
invisible at `exposure 1, bloom.intensity 0, tonemap bypass`, which is the
no-regression check.

*Known gap:* `makeMini`'s pools are closure-private, so mini views keep the
fixed-function materials in Phase 1. Closing that needs one additive line in
`render3d.mjs` exposing the pool classes — deferred, per-target approval.

### Phase 2 — Relativistic accretion disc  *(DONE)*

Shipped as `render3d-gpu-disc.mjs`, installed and torn down by the Phase 1
layer. A shader-driven annulus, 160 x 256 quads (82k triangles), logarithmic
in radius so the tessellation sits where the gradients are. `position` carries
`(u, v)` parameters rather than coordinates and the vertex stage places every
vertex from `uRin`/`uRout`, so a change of mass, spin or charge needs no
rebuild.

Redshift came out stronger than the plan asked for. Rather than the
Schwarzschild `β·n` form, the shader uses the **exact Kerr equatorial circular
geodesic**, which costs no more arithmetic:

```
Omega = s sqrt(M) / (r^3/2 + |a| sqrt(M))
u^t   = (r^3/2 + |a| sqrt(M)) / sqrt(r^3 - 3 M r^2 + 2 |a| sqrt(M) r^3/2)
b     = x n_y - y n_x                      photon impact parameter L/E
g     = 1 / (u^t (1 - Omega b))
```

Face-on with `a = 0` this reduces to `g = sqrt(1 - 3M/r)` and the `u^t`
denominator vanishes at the *photon* orbit, always inside the prograde ISCO,
so it stays finite wherever the disc exists. Inner edge is the exact
Kerr-Newman ISCO from `KNphysics.isco`.

- Emission is Novikov-Thorne, `T ~ r^-3/4 (1 - sqrt(r_in/r))^1/4`, normalised
  to its own peak at `(49/36) r_in`. The zero-torque factor is why the inner
  rim is dark rather than brightest.
- Colour and brightness both come from the *observed* temperature `g*T` —
  one quantity, not two tuned ones. `I = (g T)^gExp`, default 4, the
  bolometric Liouville result; the plan's `g^(3+α)` is this knob at `3 + α`.
- 3-octave domain-warped value noise, sampled on a cylinder so azimuth has no
  seam, advected by `Omega(r)` so differential rotation winds it into trailing
  spirals with no explicit spiral term.
- Flared scale height `h = 0.055 r`, the constant the point pool already uses,
  corrugated by the same noise field the fragment stage shades with.

Light bending is NOT included — rays run straight from the emitting ring to
the observer, which is why the far side is not lifted into an arc over the
shadow. Phase 3 put the lensed image on the GPU in the Observer View only;
lensing this main-view surface is an open item (see Phase 3).

The point pool keeps running untouched: it still owns accretion, capture,
`mDot` and the reconnection flares. Only its *drawing* is suppressed while the
surface is up, because both represent the same gas and leaving both on doubles
the emission. `gpu.disc.showPoints = true` draws both.

### Phase 3 — Lensing and photon ring on the GPU  *(DONE — Observer View)*

Shipped as `lensing-gpu.js` (classic script, loaded right after `lensing.js`)
plus one `<script>` line in `index.html` and a five-line change in
`observer-view.jsx`. `lensing.js` and `lensing-worker.mjs`: **zero diff**.

- The LUT from `buildDeflectionLUT` is uploaded once per LUT object as two
  `RGBA32F` textures read with `texelFetch` (no float filtering extension
  needed): `(capture, ringGlow, discHit, discG)` and
  `(skyTheta, skyPhi, discR cos discPhi, discR sin discPhi)`.
- One WebGL2 fragment shader ports `sampleLUT` + `shadeSample` verbatim:
  boundary-aware bilinear vote, sky directions blended as vectors over the
  escaped neighbours only, the `hashAngle` starfield (uint32 arithmetic
  reproduces the JS `ToInt32` bit pattern exactly), Novikov-Thorne flux with
  the ISCO torque pin, `g^(3+alpha)` beaming, `composeFalseColor`, the photon
  ring and the anti-aliased shadow edge. Camera azimuth and output size are
  uniforms.
- Attachment is a runtime patch of `KNLensing.shadeLUT`, the one entry point
  `requestRenderLUT` and `reshadeLUT` both use, so `observer-view.jsx` and
  `mobile-app.jsx` get the same `{ buffer, imageData, ... }` result as before.
  The result is read back with `readPixels`; GL row y is image row y, so the
  never-displayed canvas is upside down and the buffer comes out top-first.
- Falls back to the original CPU reshade, per call, when `gpu.enabled` is
  false, WebGL2 is missing, the context is lost, or a LUT holds a non-finite
  `discG` on a hit cell (the CPU recovers those with `discShiftApprox`, which
  is not ported).
- `observer-view.jsx` now shades at **device pixels** (capped at 1080 rows)
  when `KNLensing.gpu.ready()`; the trace grid is still sized from CSS pixels,
  so the LUT build cost is unchanged. Mobile keeps its 160x100 request and
  simply gets it shaded on the GPU.

Control surface: `KNLensing.gpu = { available, enabled, lastMs, ready(),
shade(lut, options) }`; `shade` has `shadeLUTImage`'s exact contract.

Physics stays in the benchmarked worker; only shading moves. No new threshold.

*Open item, not started:* lensing the main 3D view (lifting the Phase 2 disc's
far side over the shadow). The LUT is azimuth-invariant but not
inclination- or distance-invariant, so every tilt or zoom of the main camera
would cost a fresh trace (~2.3 s at 76x42 in the browser worker); it needs its
own design pass.

*Not a GPU problem:* the shadow edge and photon ring still show the trace
grid's staircase at high display resolution, identically on both paths —
the capture vote is one base texel wide. Sharper edges need a finer trace or
an edge-refining pass in the worker, not more shading resolution.

### Phase 4 — Volumetric jets and plasma  *(DONE)*

Shipped as `render3d-gpu-jets.mjs`, installed and torn down by the Phase 1
layer. `render3d.mjs`: **zero diff**. The two unlit `CylinderGeometry` cones
are replaced by a raymarched bipolar volume (one `BoxGeometry` per jet, back
faces, 48 steps at `high` / 28 at `medium`) plus instanced field-line ribbons
(one `InstancedBufferGeometry`, 72 quads x 4 instances — the same two phases
and two directions `drawJet` traced with 1px lines).

Every dimension is re-derived from `drawJet`'s own expressions, so the volume
occupies exactly the space the cones did: `lum = min(1, P/30)`,
`len = 6 + 10 lum`, `baseR = 0.5 + 0.8 lum`,
`tipR = max(1.4 baseR, baseR + tan(theta) len 1.2)`, knot count
`min(5, floor(gamma/4))`, helix pitch 4 turns. Density is a limb-brightened
sheath over a Poynting spine, modulated by 3-octave value noise sampled in a
frame sheared by the helix and advected outward, with the Mach knots as
Gaussian density pulses at `drawJet`'s own knot positions. Emission is faded
to zero inside `r+`.

The one piece of physics this phase ADDS, which the cones never had, is
relativistic beaming of the two lobes:

```
beta = sqrt(1 - 1/Gamma^2)
D    = 1 / (Gamma (1 - beta cos(theta_obs)))      Doppler factor
I    = I_0 D^(2+alpha)                            steady jet, alpha ~ 0.7
```

`Gamma` is `jetMetrics().gamma`; `beamExp` defaults to 2.7 and is the
discrete-blob `3+alpha` at 3.7. `D` is **not** used as an absolute scale:
looking down the barrel of a `Gamma = 10` jet gives `D ~ 20` and
`D^2.7 ~ 3000`, which blows the frame out for a reason that is normalisation
rather than physics. The pair is normalised so the brighter lobe is 1 and the
counter-jet carries the ratio `(D_dn/D_up)^beamExp`. That ratio is the
falsifiable content, and it is what the verification below measures.

The cones are suppressed by flipping `visible` on the meshes `jetSlot()`
already parks in `R.jetSlots[key]` — that is the whole reason `render3d.mjs`
needs no diff. `gpu.jets.showCones = true` draws both.

The 1px helix and the knot circles go into the **shared** `LinePool`, which has
no per-caller channel, so they are dropped as they arrive by a filter on
`pools.line.seg`, with the envelopes refreshed from a patched
`pools.line.begin` (the frame calls it before any drawing, so there is no
one-frame lag).

*Known gaps:* `makeMini`'s MHD-monitor jets keep the fixed-function cones — the
same closure-privacy gap Phase 1 hit. The ribbons do not carry the beaming
factor: like the lines they replace they are a field diagnostic, not emission.
The volume does not depth-test (see the results below).

### Phase 5 — Perf and consolidation  *(DONE — integrated-GPU 60fps unverified)*

- *(DONE)* `InstancedMesh` for N-body bodies, shipped as
  `render3d-gpu-bodies.mjs` and installed by the Phase 1 layer;
  `render3d.mjs`: **zero diff**. One batch per shape (sphere, ship cone, probe
  box) with the same geometry, material and `renderOrder` as `bodyMesh()`.
  The per-body meshes stay the source of truth: `drawBodies()` still places
  and retires them, the layer copies each one's matrix and colour into an
  instance slot and hides it for the frame, and `drawBodies()` sets it
  visible again on the next one — so turning the layer off needs no restore.
- *(DONE)* Instanced line quads for the shared `LinePool`, shipped as
  `render3d-gpu-lines.mjs`. One instance per segment, read zero-copy from the
  pool's own `pos` / `col` arrays (their per-segment layout is exactly two
  vec3), only the used prefix uploaded. Screen-space quads with a near-plane
  trim in view space, so a segment crossing behind the camera cannot smear.
  `LinePool.seg()` keeps its signature, so the Phase 4 filter on it is
  untouched; only the pool's `LineSegments` is hidden. Width is now a real
  control (`lines.width`, device pixels). Not a speed change — the pool was
  already one draw call — but it is what keeps lines one device pixel wide
  under `medium`'s reduced render scale. The other GL lines (horizon and
  ergosphere rims, photon-orbit band) are separate `Line` objects and stay GL
  lines.
- *(DONE, target unverified)* Frame-time budget measured at 1080p/high (see
  results). `quality: 'medium'` now renders the scene at 0.75x the drawing
  buffer (56% of the pixels) with 2x instead of 4x MSAA, and the composite
  upsamples. Pixel-sized things are compensated so they land at the same
  device size: the point sprites' `uDpr`, the starfield's `PointsMaterial`
  size (set and restored around each frame) and the line-quad width. Whether
  that holds 60fps on integrated graphics could not be checked — no such GPU
  was available.
- *(DONE)* `npm run verify`, rebuild `dist/`, `README.md` and this file.

## Phase 1 results (measured, not estimated)

Shipped: `render3d-gpu.mjs` (new) + one `<script type="module">` line in
`index.html`. `render3d.mjs` diff: **zero**.

Measured in the running app at a 1440x1080 drawing buffer, accretion disc on
and populated (700 particles), camera settled, sim paused so consecutive
frames are bit-identical, by reading the canvas back with `gl.readPixels` and
diffing GPU-on against GPU-off.

| Comparison | mean \|delta\| / 255 | max | channels moved > 8 |
|---|---|---|---|
| post stack alone, bloom and dither off | 0.68 | 70 | 1.6% |
| the new point sprites on top of it | 0.06 | 35 | 0.2% |
| full production settings | 0.77 | 73 | 1.6% |
| frame-to-frame repeatability, dither off | 0.00 | 0 | 0.0% |

Tile means (6x6 grid, luminance/255): the sky reads 3.6-4.1 on the old path
and 3.2-4.1 on the new one, the difference being the vignette. The four tiles
holding the disc go 6.6 / 7.7 / 6.6 / 10.0 -> 10.3 / 11.8 / 10.4 / 15.6. Peak
luminance barely moves (212 -> 218), so this is the translucent mid-tones
lifting, not the cores blowing out.

Frame rate was 30.6 fps before and 30.8 fps after (high), 29.4 (medium) — no
measurable cost. CPU submission time per frame moved 0.56 ms -> 0.57 ms. Note
that `gl.finish()` is effectively a no-op in Chrome, so that second figure is
CPU-side only; a real GPU-time number needs
`EXT_disjoint_timer_query_webgl2`, which Phase 5 should add.

### Findings worth keeping

1. **No midtone-lifting tonemap.** ACES (Narkowicz) maps 0.3 to 0.44, and the
   first build of this layer turned the soft additive haze around the
   ergosphere into a solid violet blob. The palette was hand-tuned against a
   straight pass to the canvas, so the operator is now identity below a knee
   and only rolls off genuine overbright.
2. **`shoulder()` had to be made NaN-safe.** With the knee at 1.0 the span
   collapses, the exponent overflows to `Inf`, and `mix(c, -Inf, 0.0)` is NaN,
   not `c` — the whole frame went black. The `max()` now sits *before* the
   divide. Worth remembering for every later shader in this plan.
3. **A render target's declared colour space is ignored.** Three hard-codes
   material output to `LinearSRGBColorSpace` for any non-XR render target
   (`vendor/three.module.js:20725`), so setting `target.texture.colorSpace =
   SRGBColorSpace` does nothing at all. The first build of this layer declared
   it sRGB and dropped the encode from the composite to match; the two errors
   cancelled in the highlights and nowhere else. The sky, which reaches the
   composite as a linear value ~1/12.9 of its display code, went to pure
   black. **The rule for every later phase: the stack is linear end to end and
   the composite owns the one sRGB encode.**
4. **Only the dither belongs in display space.** Exposure, the bloom
   threshold, the knee and the vignette are all linear quantities. Dither is
   quantisation noise measured in display codes, so it is applied after the
   encode — before it, the same 0.007 became ~11 codes of visible static in
   the darks, because the encode multiplies small linear values by up to 12.92.
5. **A threshold is meaningless until something crosses it.** With the
   pipeline corrected, the disc core peaks near 0.67 linear, so the original
   threshold of 1.0 meant the bloom pyramid ran every frame for an exactly
   zero delta. It is now 0.35.
6. **Verify on a scene that exercises the code.** The `disc` / `cloud` / `fx`
   pools are all empty in the default scene, so the first round of sprite
   measurements compared two identical frames without either of us noticing.
   The disc has to be enabled and stepped (~3000 steps) before any particle
   number means anything.

### Deltas that remain, and why

With the pipeline corrected the sky matches the old path to within one code
(`[1,3,6]` vs `[1,4,7]`), and the residual is concentrated in the disc, which
is ~1.5x brighter in the mid-tones. That is compositing arithmetic, not a
tuning choice: for a translucent layer over a dark background,
`E(a*f + (1-a)*b) >= a*E(f) + (1-a)*E(b)` because the sRGB transfer is
concave. The old path blended encoded values, which is the wrong space; the
new one blends light and encodes once. The additive particle layers move the
other way for the same reason, which is why the peak hardly shifts.

`KNRender3D.gpu.set({ exposure: 0.9 })` trims the whole frame if the brighter
haze is unwanted. Phase 2 replaces the disc's appearance outright, so the
tuning question properly belongs there.

MSAA accounts for most of the 1.6% of channels that moved by more than 8:
`antialias: true` on the default framebuffer and `samples: 4` on a render
target do not resolve identically, so high-contrast edges differ by a few
codes.

## Phase 2 results (measured, not estimated)

The shader was checked against an **independent CPU implementation of the same
model** — redshift, temperature profile, LUT lookup, hot-end desaturation and
intensity, written separately in JS — sampled through `KNSim.worldToScreen` at
matching world points, with the frame read back by `gl.readPixels`, decoded
from sRGB and corrected for the composite's vignette. Turbulence off so the
comparison is deterministic; the sky floor (`[1,4,7]`) subtracted, since the
prediction is disc-only.

Camera tilted 1.15 rad, `a = 0.5` (so r_in = 4.233 M, the exact Kerr-Newman
ISCO), shipped defaults. Error is measured minus predicted, per channel:

| r / M | g approaching | g receding | approaching err | receding err |
|---|---|---|---|---|
| 6  | 1.1396 | 0.5358 | -0.4 / -0.6 / -0.5 % | +1.0 / -0.7 % |
| 9  | 1.1745 | 0.6342 | +2.3 / +0.7 / +0.7 % | -0.6 / -3.1 % |
| 14 | 1.1718 | 0.7157 | -3.1 / +1.8 / +7.0 % | -0.2 / -4.2 % |

(The receding blue channel is omitted where the predicted value is under
1/10 of a display code — the relative error there is meaningless.) The
residual few percent is LUT texel filtering, 8-bit quantisation and the 5x5
sample patch sitting on a gradient.

Two falsifiable limits, both clean:

- **Face-on is axisymmetric.** With `uObs = (0,0,1)` the impact parameter `b`
  is zero everywhere, and four azimuths at r = 9 agree to ~2%, i.e. to the
  sampling noise. No spurious asymmetry anywhere in the chain.
- **Schwarzschild limit.** At `a = 0` the inner edge lands on exactly 6 M and
  `1/u^t` matches `sqrt(1 - 3M/r)` to six decimals at r = 6.2, 8, 12, 20.

### Cost

GPU timings here need care. `EXT_disjoint_timer_query_webgl2` returned 22-39 ms
per frame and was **self-inconsistent** — it put the disc-off case *slower*
than disc-on — so those numbers were discarded. A `performance.now()` loop
around single frames is worse still: it quantises to 16.6 / 33.3 ms, i.e. it
measures vsync, not work. What does work is queueing N frames with no flush
and forcing one `readPixels` at the end, so the driver backpressures; with the
conditions interleaved to cancel the drift this environment clearly has:

| | ms / frame |
|---|---|
| fixed-function path, whole layer off | 0.63 |
| Phase 1 layer (post stack + sprites) | 1.87 |
| disc surface on vs off | 1.21 vs 1.30 |
| turbulence on vs off | 1.67 vs 1.66 |

So the disc surface is free to within the noise — it replaces a point pool
that cost about the same — and the 3-octave warped noise is free as well,
because the disc covers few pixels. Absolute levels drift between runs, which
is why only the interleaved differences are quoted.

### A Phase 1 fix this phase forced

The composite desaturated highlights keyed on **luminance**, which misses the
case this disc produces constantly: green and blue far over 1.0 while red is
still near zero, with luminance under 1.0 the whole time. The two channels pin
at 255 and the result reads as neon. The key is now the **max channel**, with
the ceiling raised from 0.45 to 0.75. It is still exactly zero below 1.0, so
every Phase 1 measurement in display range is unaffected.

That was not the whole story. The shared ramp in `render3d.mjs` ends at
`oklch(0.95 0.20 230)`, a saturated cyan the point pool never reached — its
index is `1 - r/22`, which tops out near 0.73. Driving the index from real
temperature does reach it. The fix is physical rather than a clamp: a
blackbody's chromaticity converges to blue-white as it heats instead of
saturating further, so chroma is bled toward a neutral of equal luminance past
the warm half of the ramp (`DISC.hotDesat`). Measured on the tilted production
frame, the fraction of bright strongly-coloured pixels fell from 1.12% to
0.08% — 14x — while the beaming stays plainly readable.

### Lifecycle

Checked explicitly, since this phase adds scene objects where Phase 1 added
none: `disc.enabled = false` hides the surface and hands the point pool back;
turning the whole layer off removes both meshes and restores the pool;
detach/attach re-creates them; and four detach/attach cycles still leave
exactly two meshes, so nothing accumulates. The `INVALID_OPERATION` after a
detach/attach cycle is pre-existing in `render3d.mjs` (it reproduces with the
GPU layer disabled) and is not touched here.

### Known approximations

- No light bending, as above — still open after Phase 3 (Observer View only).
- Only the primary and companion discs are surfaced; everything else the point
  pool draws is unchanged.
- A non-black-hole host (`type !== 'bh'`) gets the temperature profile with
  the redshift term switched off (`uRel = 0`), since the Kerr circular-orbit
  expressions do not describe a stellar surface.

## Phase 3 results (measured, not estimated)

Checked against the original CPU `shadeLUTImage` on the **same LUT object**,
pixel for pixel, in the running app: four LUTs traced at 76x42 with the
Observer View's trace settings (`a` = 0 / 0.5 / 1.4 at `M` = 1.5, inclination
40-80 deg, disc on and off, one with `Q` = 0.3), each shaded at 76x42,
180x100 and 540x300 and at camera azimuths 0, 1 and 3 rad — 36 frames.

| | result |
|---|---|
| max \|delta\| outside star flips | **1 code** in every frame |
| mean \|delta\| per channel | 0.003-0.066 codes |
| pixels differing by > 2 codes | 24 in 36 frames; at most 4 per 162k-pixel frame |
| what those 24 are | every one a single sky pixel flipping between `[3,4,8]` and a star |

The flips are the starfield's cell quantisation: `floor((phi/2pi + 4) * 220)`
lands on the other side of a cell boundary when the blended sky direction is
computed in float32 instead of float64. Same field, a star moved by one
pixel; there is no shading difference to chase. The 1-code residual is the
float32 pipeline plus `Uint8ClampedArray` round-half-even vs the GPU's
unorm rounding.

### Cost

Wall time per reshade, CPU `shadeLUTImage` vs GPU draw **including** the
`readPixels` stall, same LUTs:

| output | CPU | GPU |
|---|---|---|
| 76x42 | 1.0-10.9 ms | 0.7-3.8 ms |
| 180x100 (old desktop panel size) | 5.3-10.5 ms | 0.9-2.6 ms |
| 540x300 | 47-79 ms | 1.5-4.3 ms |

The high end of each range is the first call on a LUT: texture upload on the
GPU side, module import and warm-up on the CPU side. At device resolution the CPU
reshade would have been a visible hitch on every azimuth step; the GPU one is
not. In the app the panel now shades 371x354 device pixels (it was 230x220)
from the same 63x60 trace.

## Phase 4 results (measured, not estimated)

Measured in the running app at a 1167x1077 drawing buffer, `a` = 0.95,
`B` = 1.0 (`P` = 90.3, `Gamma` ~ 10, `theta` = 5.1 deg — the most luminous jet
the model produces, `lum` = 1), the disc enabled and stepped to ~660
particles, the sim paused so consecutive frames are bit-identical (checked:
frame-to-frame max delta 1 code) and the composite dither off.

Note that the app's RAF loop does not run while the Browser pane is hidden and
**overwrites `SIM.paused` on every iteration**, so every A/B below was taken
inside a single evaluation, driving `KNSim.step` + `KNRender3D.render` by hand.
Comparisons split across calls drift — the first round of brightness numbers
was taken that way and was wrong by 10%.

### Beaming, against the closed form

The counter-jet/jet ratio was read out of the frame: two boxes on the axis at
`z = +-(z0 + 0.55 len)`, each sized from its OWN lobe's pixel scale so both
hold the same physical slab, differenced against a null frame taken with
`jets.density = 0` (the layer installed and the cones still hidden, so the
difference is the volume alone and nothing else), decoded from sRGB to linear,
with `brightness` dropped to 0.05 so nothing reaches the composite's knee and
the chain is linear end to end.

Perspective makes the two boxes catch slightly different chord lengths, so
each tilt also gets a geometric null at `beaming = 0`, where the shader makes
the lobes identical by construction. Dividing it out leaves the beaming alone:

| tilt (rad) | cos(theta) | geometric null | raw ratio | corrected | predicted | err |
|---|---|---|---|---|---|---|
| 0.70 | 0.7648 | 1.1704 | 0.00530 | 0.00453 | 0.00453 | -0.1% |
| 1.00 | 0.5403 | 1.2121 | 0.04689 | 0.03868 | 0.03894 | -0.7% |
| 1.25 | 0.3153 | 1.1264 | 0.19517 | 0.17327 | 0.17307 | +0.1% |
| 1.42 | 0.1502 | 1.0616 | 0.47028 | 0.44300 | 0.44327 | -0.1% |
| pi/2 | 0.0000 | 1.0000 | 0.99996 | 1.00000 | 1.00000 | 0% |

`Gamma` = 10.42, `beta` = 0.99538. Sub-1% over a factor of 200 in the ratio.

Two further falsifiable limits, both clean:

- **Exactly edge-on is symmetric.** At `cos(theta) = 0` the measured ratio is
  0.99996 with beaming fully on, and the geometric null is 1.000 as well —
  which also confirms the correction above is perspective and not a shading
  difference, since the two lobes are then equidistant.
- **The exponent is what it says.** Halving `beamExp` to 1.35 should square the
  ratio. Measured at tilt 1.25: 0.4725 at 1.35 and 0.1969 at 2.7, and
  `0.4725^2 / 0.1969 = 1.134` — the same geometric null (1.1264) the
  `beaming = 0` run found independently at that tilt.

### Brightness, against the cones it replaces

Whole-frame statistics, same frozen scene, peak and clipped-channel count
against the fixed-function cones:

| | frame mean | peak | channels > 248 |
|---|---|---|---|
| old cones | 12.51 | 222 | 0.001% |
| `brightness` 0.55, `maxIntensity` 3.2 | 12.98 | 255 | 1.282% |
| `brightness` 0.35, `maxIntensity` 2.0 | 11.87 | 253 | 0.603% |
| `brightness` 0.25, `maxIntensity` 1.6 | 11.16 | 243 | 0.275% |
| **`brightness` 0.20, `maxIntensity` 1.2** | **10.77** | **223** | **0.073%** |
| `brightness` 0.15, `maxIntensity` 1.0 | 10.33 | 215 | 0.001% |

0.55 was the first guess and put 1.3% of the frame at 255 — glare, which the
project rule rules out. The shipped default lands the peak on the cones' own
peak. The frame mean comes out *below* the cones because the volume
concentrates its emission in the cone interior where they spread a flat
translucent haze over the whole silhouette.

### The LinePool filter, and the indicator it nearly ate

With the jets on, exactly **288** segments are dropped from the shared pool:
184 helix segments (2 phases x 2 directions x 46) plus 104 knot-circle
segments (2 knots x 2 directions x 26) — the entire set `drawJet` contributes
and nothing else.

The first build tested geometry only ("both endpoints inside an active jet
cone") and dropped **318**. The extra 30 were the spin-axis indicator: 5
dashes plus a 10-segment sense arc per direction, drawn straight up the same
+-z corridor and labelled in the UI. It is a readout this layer does not
replace. The filter now needs colour AND geometry, which fails safe the right
way round — if `drawJet`'s palette changes the filter stops matching and the
old helix draws under the ribbons, a visual nit, rather than silently removing
an indicator.

### Cost

Same protocol as Phase 2 (queue N frames with no flush, force one `readPixels`
so the driver backpressures, conditions interleaved to cancel drift), medians
of six interleaved rounds of 25 frames:

| | default framing | jet filling the viewport |
|---|---|---|
| cones (jets off) | 1.29 | 1.48 |
| volume only, 48 steps | 1.48 | 2.48 |
| volume only, 28 steps (`medium`) | 1.32 | 1.95 |
| volume + ribbons, 48 steps | 1.48 | 2.10 |

ms per frame. At the framing the app actually uses the layer costs ~0.2 ms, a
fifth of the frame's GPU submission. A raymarch is fill-bound, so the number
that matters is the zoomed-in case, where 48 steps cost ~0.6-1.0 ms and the
`medium` step count halves it. Run-to-run drift is a few tenths of a ms — the
ribbons measuring *cheaper* than the volume alone in one column is that noise,
not a real ordering — so only the interleaved differences mean anything. The
early-out on zero density is what keeps this affordable: most steps along a
ray through the bounding box are outside the cone and skip the noise entirely.

### Lifecycle

Checked explicitly, as in Phase 2:

| | volumes | ribbons | pool patched | cones |
|---|---|---|---|---|
| installed | 2 | 2 | yes | hidden |
| `jets.enabled = false` | 2 | 2 | yes | visible |
| `jets.enabled = true` | 2 | 2 | yes | hidden |
| `gpu.enabled = false` | 0 | 0 | no | visible |
| `gpu.enabled = true` | 2 | 2 | yes | hidden |
| after 4 detach/attach cycles | 2 | 2 | yes | hidden |

Two of each (primary + companion), never more. Binary mode drives both slots
and hides both cone sets; `P <= 0.3` (`a` = 0, `B` = 0) leaves no jet at all
and hands the cones straight back.

### Known approximations

- **No depth test on the volume.** A raymarch needs the scene depth buffer to
  clip against, and Phase 1's HDR target is multisampled, which rules out a
  depth texture in Three r169. The case it would matter for is the counter-jet
  seen through the hole — and a lobe is hidden behind the horizon exactly when
  it points away, where the beaming factor has already driven it to a few
  percent. Emission is faded to zero inside `r+` on top of that.
- The ribbons do not beam (a field diagnostic, like the lines they replace).
- Mini views keep the fixed-function cones (the Phase 1 closure-privacy gap).
- Light bending is not included here either — the jet is drawn with straight
  rays, like the Phase 2 disc.

## Phase 5 results (measured, not estimated)

Measured in the running app on an RTX 3060 (ANGLE / D3D11) at a 1920x1080
drawing buffer, `a` = 0.95, `B` = 1.0, disc on and stepped, jets on.

### Budget before any Phase 5 change

Same protocol as Phase 2 (N frames queued, one forcing `readPixels`,
conditions interleaved, medians):

| | ms / frame |
|---|---|
| layer off (fixed-function) | 0.49-0.85 |
| `quality: 'medium'` | 1.26-1.85 |
| `quality: 'high'` | 1.37-1.99 |
| `high` at 3840x2160 | 2.87 |

Under an eighth of the 16.6 ms budget. Going 1080p -> 4K adds only ~0.9 ms,
so most of the layer's cost is fixed per-pass overhead, not fill.
`LinePool` uploads its whole 42000-segment buffer (2 MB) every frame;
restricting the upload to the used prefix measured 0.694 vs 0.696 ms — no
gain on this hardware, so it was not done for its own sake (the line-quad
layer below uploads only the prefix anyway). The integrated-graphics
`medium` target is **unverified**: no such GPU was available.

### Instanced bodies

Pixel check, 63 bodies of all five kinds, dither off, read back with
`readPixels`: layer on vs off differs by at most **1 code** (170 channels in
6.2M), the same as off vs off frame-to-frame (151 channels, max 1). The
batches held 38 / 13 / 12 instances, matching the map exactly.

Interleaved, 12 rounds, medians. "Submit" is CPU time inside
`renderer.render`, where draw-call overhead lands; the frame column includes
the GPU wait and drifts by a few tenths of a ms run to run:

| bodies | draw calls off -> on | submit off -> on (ms) | frame off -> on (ms) |
|---|---|---|---|
| 3 | 41 -> 41 | 0.295 -> 0.305 | 1.85 -> 1.85 |
| 60 | 185 -> 132 | 0.552 -> 0.513 | 1.90 -> 1.88 |
| 200 | 372 -> 193 | 0.800 -> 0.597 | 1.39 -> 1.49 |
| 500 | 645 -> 198 | 1.295 -> 0.665 | 1.86 -> 1.53 |

A draw call is cheap on this GPU, so the win only becomes visible past a
couple of hundred bodies. What remains at 500 bodies is mostly the
`SpritePool` glows (cap 110) and `LabelPool` labels (cap 72), each still one
`Sprite` per item.

Lifecycle: `bodies.enabled = false` empties the batches and every body mesh
draws again; `gpu.enabled = false` removes all three batches; four
detach/attach cycles still leave exactly three; a removed body shrinks its
batch on the next frame; capacity grows by doubling from 64 (checked at 500).

### Line quads

A quad of width w cannot match a GL line pixel for pixel: a GL line covers
one pixel per step of its *major* axis, so diagonals and short trail segments
carry more than a 1 px-wide quad. The default width is therefore calibrated
on the one quantity that should match — the frame's integrated line energy,
read back, decoded to linear luminance and differenced against a no-lines
frame (`width = 0`):

| tilt (rad) | GL lines | quad, w = 1 | equivalent width |
|---|---|---|---|
| 0.25 | 175.6 | 127.5 | 1.377 |
| 0.90 | 170.4 | 124.1 | 1.373 |
| 1.35 | 155.4 | 112.6 | 1.380 |

Energy is linear in width (w = 1.5 and 2 gave 1.49x and 1.99x of w = 1), and
the ratio is flat across tilt, so `width` ships at **1.375**. Against the GL
lines the frame then differs by 0.0007 codes mean, 0.002% of channels by more
than 8, same peak (241).

Near-plane trim, checked where it matters — zoomed in near edge-on, with the
grid on: 79 and 103 segments straddling the near plane and 710 / 1899 fully
behind it. Against the GL lines no channel moves by more than 8 (max 18 and
4), i.e. no smear.

Lifecycle: `lines.enabled = false` hands the pool's `LineSegments` back;
`gpu.enabled = false` removes the quad mesh and the Phase 4 filter together;
`medium` resizes the target with the quads following; four detach/attach
cycles still leave exactly one quad mesh.

### Medium render scale

At a 1920x1080 buffer `medium` renders into 1440x810 with 2x MSAA. Against
`high` the frame's total linear luminance is **0.995x** — the size
compensation keeps points, stars and lines at the same energy — and the
per-pixel difference (0.12 codes mean, 0.25% of channels over 8, max 180) is
resampling on edges and single-pixel stars, as expected from an upsample.

Cost could **not** be measured cleanly in this round. The Browser pane was
hidden, so the page ran as a background page: the same condition scattered
1-6 ms run to run, and `EXT_disjoint_timer_query_webgl2` was as erratic as
Phase 2 found it. The only stable readings were timer queries at 3840x2160:
`high` ~1.5 ms, `medium` ~0.8-1.1 ms, and GL lines vs quads indistinguishable
(1.51 vs 1.51). Re-measure with the pane in view before quoting a `medium`
saving, and on an integrated GPU before claiming 60fps.

## Test posture

`test/render-smoke.test.mjs` covers the Canvas2D path only; the 3D renderer is
untestable headless (no WebGL in the vm harness). The gate for these files is
therefore `npm run check` plus in-browser confirmation per phase. No physics
threshold moves in any phase; if one would, the change belongs in
`full-physics/` behind `run-benchmarks.mjs` instead.
