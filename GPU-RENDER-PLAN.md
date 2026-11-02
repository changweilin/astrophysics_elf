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
  set(partial),              // merge + re-apply without a reload
};
```

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

### Phase 2 — Relativistic accretion disc

A shader-driven annulus (high radial tessellation, inner edge at the ISCO from
`KNphysics`) rendered alongside the point pool:

- Keplerian shear advected in the vertex stage; flared scale height `h ∝ r`.
- Doppler factor `g = 1 / (γ (1 - β·n))`, specific intensity `I ∝ g^(3+α)`.
- Gravitational redshift folded in from the same `√(1 - 2M/r)` the demo uses.
- Blackbody colour from `T(r) ∝ r^(-3/4)` through the existing `discLUT` as a
  1D texture.
- 3-octave domain-warped noise for turbulence and reconnection sheets.

The point pool stays as the fallback and keeps driving particle *events*; only
the appearance moves to the surface shader.

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

## Test posture

`test/render-smoke.test.mjs` covers the Canvas2D path only; the 3D renderer is
untestable headless (no WebGL in the vm harness). The gate for these files is
therefore `npm run check` plus in-browser confirmation per phase. No physics
threshold moves in any phase; if one would, the change belongs in
`full-physics/` behind `run-benchmarks.mjs` instead.
