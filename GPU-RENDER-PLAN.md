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
  set(partial),              // merge + re-apply without a reload
};
```

`set()` MERGES `bloom` and `disc` rather than replacing them —
`render3d-gpu-disc.mjs` holds the same `disc` object reference, so assigning a
fresh one would detach every uniform from the control surface.

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
the observer. That is what Phase 3 replaces, and it is why the far side is not
yet lifted into an arc over the shadow.

The point pool keeps running untouched: it still owns accretion, capture,
`mDot` and the reconnection flares. Only its *drawing* is suppressed while the
surface is up, because both represent the same gas and leaving both on doubles
the emission. `gpu.disc.showPoints = true` draws both.

### Phase 3 — Lensing and photon ring on the GPU

`buildDeflectionLUT` already returns, per pixel: `capture`, `skyTheta`,
`skyPhi`, `ringGlow`, `discHit`, `discR`, `discPhi` and the **exact** redshift
`discG`. The LUT is azimuth-invariant and already cached in `lensing.js`.

- Upload those arrays as `DataTexture`s once per LUT build.
- Port `shadeLUT`'s per-pixel maths into a fragment shader: shadow mask,
  photon ring, primary and secondary disc images, `g`-weighted beaming,
  starfield warp from `skyTheta/skyPhi`.
- Camera azimuth becomes a uniform, so orbiting is free and the display
  resolution decouples from the trace resolution entirely.

Physics stays in the benchmarked worker; only shading moves. No new threshold.

### Phase 4 — Volumetric jets and plasma

Replace the two unlit cones with a raymarched bipolar volume: helical B-field
advection, 3-octave noise density, Mach knots as density pulses driven by the
existing `KNDisc.jetMetrics` (`P`, `theta`, `gamma`), synchrotron-leaning
colour ramp keyed on `Γ`. Thick field lines become instanced quads so the
helix reads at any zoom.

### Phase 5 — Perf and consolidation

- `InstancedMesh` for N-body bodies (one draw call instead of one per body).
- Instanced line quads for the remaining `LinePool` work.
- Frame-time budget measured at 1080p/high; `quality: 'medium'` path tuned to
  hold 60fps on integrated graphics.
- `npm run verify`, rebuild `dist/`, update `README.md` and this file.

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

- No light bending, as above — Phase 3.
- Only the primary and companion discs are surfaced; everything else the point
  pool draws is unchanged.
- A non-black-hole host (`type !== 'bh'`) gets the temperature profile with
  the redshift term switched off (`uRel = 0`), since the Kerr circular-orbit
  expressions do not describe a stellar surface.

## Test posture

`test/render-smoke.test.mjs` covers the Canvas2D path only; the 3D renderer is
untestable headless (no WebGL in the vm harness). The gate for these files is
therefore `npm run check` plus in-browser confirmation per phase. No physics
threshold moves in any phase; if one would, the change belongs in
`full-physics/` behind `run-benchmarks.mjs` instead.
