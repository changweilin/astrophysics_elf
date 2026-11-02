/* GPU shader layer for the Kerr-Newman Lab 3D renderer (window.KNRender3D.gpu).
 *
 * Phase 1 of GPU-RENDER-PLAN.md. render3d.mjs draws the whole scene with the
 * fixed-function materials that shipped with WebGL-1-era Three (no
 * ShaderMaterial anywhere) straight into an 8-bit default framebuffer. This
 * module adds, without editing a line of render3d.mjs:
 *
 *   1. an HDR path — the scene renders into a half-float multisampled target,
 *      so highlights carry real energy instead of clipping at 1.0;
 *   2. a hand-written bloom chain (soft-knee bright pass, mip pyramid,
 *      separable Gaussian, additive upsample) — vendor/ has no examples/jsm,
 *      and the zero-dependency rule says keep it that way;
 *   3. a composite pass: exposure, highlight desaturation, a highlight-only
 *      shoulder, vignette and a hash dither that kills the 8-bit banding the
 *      near-black sky used to show;
 *   4. GPU point sprites — the three particle pools swap their PointsMaterial
 *      for a ShaderMaterial with an analytic halo+core falloff and
 *      per-particle twinkle hashed from world position, so PointsPool.add()
 *      keeps its exact signature and every draw* function is untouched.
 *
 * The attachment is a runtime patch of R3D.attach / R3D.detach and of
 * renderer.render, so KNRender3D's public surface is unchanged and turning the
 * layer off restores the original path byte-for-byte.
 *
 * Colour pipeline, which every pass here depends on: the scene and the bloom
 * pyramid hold LINEAR light, and the single sRGB encode happens at the end of
 * the composite. Three forces linear output into any non-XR render target
 * (vendor/three.module.js:20725), so this is not a choice — declaring the
 * target sRGB is silently ignored. Thresholds, the knee and the vignette are
 * therefore linear quantities; only the dither is in display codes, applied
 * after the encode.
 *
 * Muted visuals per the project rule: the bloom threshold sits high, its
 * intensity low, and bright cores desaturate toward white rather than
 * saturating — the look is film, never neon.
 */

import * as THREE from './vendor/three.module.js';

(function () {
  const LEVELS = { high: 4, medium: 3 };

  const GPU = {
    available: false,
    enabled: true,
    quality: 'high',
    exposure: 1.0,
    knee: 0.80,
    vignette: 0.12,
    grain: 0.007,
    // Threshold is a LINEAR luminance, not a display code. Measured: the disc
    // core peaks near 0.67 linear (display 214/255), so a threshold of 1.0
    // means the pass never fires at all — it was costing a pyramid of blurs
    // per frame for a zero-delta result. 0.35 lets the hottest cores glow and
    // nothing else: ~0.04% of channels move, by at most 23 codes.
    bloom: { threshold: 0.35, intensity: 0.16, radius: 1.0 },
    _stack: null,
    _points: [],
  };

  const _v2 = new THREE.Vector2();

  // ── Fullscreen pass plumbing ────────────────────────────────────────────────
  // PlaneGeometry(2,2) already spans clip space, so the vertex stage is a
  // passthrough and no camera matrices are needed.
  const QUAD_VS = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  class FullScreen {
    constructor() {
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.geo = new THREE.PlaneGeometry(2, 2);
      this.mesh = new THREE.Mesh(this.geo, null);
      this.mesh.frustumCulled = false;
      this.scene.add(this.mesh);
    }
    // raw: the unpatched renderer.render, or this recurses into the post stack.
    run(renderer, raw, mat, target) {
      this.mesh.material = mat;
      renderer.setRenderTarget(target || null);
      raw(this.scene, this.camera);
    }
    dispose() { this.geo.dispose(); }
  }

  function rt(w, h, opts) {
    return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), Object.assign({
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    }, opts || {}));
  }

  // ── Pass shaders ────────────────────────────────────────────────────────────
  function brightMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uThreshold: { value: GPU.bloom.threshold },
        uKnee: { value: 0.55 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: `
        uniform sampler2D tSrc;
        uniform float uThreshold;
        uniform float uKnee;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // Soft knee: fades the bright pass in around the threshold instead of
          // snapping, which is what stops small moving particles flickering.
          float knee = uThreshold * uKnee + 1e-5;
          float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee);
          float w = max(soft, l - uThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(c * w, 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });
  }

  function blurMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uDir: { value: new THREE.Vector2(1, 0) },
        uRadius: { value: GPU.bloom.radius },
      },
      vertexShader: QUAD_VS,
      // 9-tap Gaussian folded into 5 bilinear samples.
      fragmentShader: `
        uniform sampler2D tSrc;
        uniform vec2 uTexel;
        uniform vec2 uDir;
        uniform float uRadius;
        varying vec2 vUv;
        void main() {
          vec2 o = uTexel * uDir * uRadius;
          vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
          s += (texture2D(tSrc, vUv + o * 1.3846153846).rgb
              + texture2D(tSrc, vUv - o * 1.3846153846).rgb) * 0.3162162162;
          s += (texture2D(tSrc, vUv + o * 3.2307692308).rgb
              + texture2D(tSrc, vUv - o * 3.2307692308).rgb) * 0.0702702703;
          gl_FragColor = vec4(s, 1.0);
        }
      `,
      depthTest: false, depthWrite: false,
    });
  }

  function copyMaterial(additive) {
    return new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uScale: { value: 1.0 } },
      vertexShader: QUAD_VS,
      fragmentShader: `
        uniform sampler2D tSrc;
        uniform float uScale;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uScale, 1.0); }
      `,
      depthTest: false, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NoBlending,
    });
  }

  function compositeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uExposure: { value: GPU.exposure },
        uBloom: { value: GPU.bloom.intensity },
        uKnee: { value: GPU.knee },
        uVignette: { value: GPU.vignette },
        uGrain: { value: GPU.grain },
        uTime: { value: 0 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tBloom;
        uniform float uExposure;
        uniform float uBloom;
        uniform float uKnee;
        uniform float uVignette;
        uniform float uGrain;
        uniform float uTime;
        varying vec2 vUv;

        // Deliberately NOT an ACES/Reinhard fit. Both lift midtones hard — ACES
        // Narkowicz takes 0.3 to 0.44 — and this palette was hand-tuned against
        // a straight pass to the canvas, so any midtone lift turns the soft
        // additive haze around the ergosphere into a solid violet blob (it did,
        // the first time). Identity below the knee keeps every tuned colour
        // exactly as it was; only genuine overbright rolls off, C1-continuous,
        // asymptotic to 1.0 instead of clipping.
        // max() before the divide, not after: with uKnee near 1 the exponent
        // blows up for c < uKnee, exp() returns Inf, and mix(c, -Inf, 0.0) is
        // NaN rather than c — which blanks the frame instead of degrading.
        vec3 shoulder(vec3 c) {
          float span = max(1.0 - uKnee, 1e-3);
          vec3 over = uKnee + span * (1.0 - exp(-max(c - uKnee, 0.0) / span));
          return mix(c, over, step(uKnee, c));
        }

        void main() {
          // tScene / tBloom hold LINEAR light (see PostStack.resize), so every
          // operator below is applied in linear space and the sRGB encode is
          // deferred to the colorspace_fragment chunk at the end. Skipping that
          // encode is what blanked the sky: the clear colour reaches this pass
          // as its linear value, which is ~1/12.9 of the display code it has to
          // end up as.
          vec3 c = texture2D(tScene, vUv).rgb;
          c += texture2D(tBloom, vUv).rgb * uBloom;
          c *= uExposure;
          // Hot cores drift toward white rather than toward a saturated hue —
          // this is what keeps a bright disc from reading as neon. Keyed above
          // 1.0 so nothing already in display range is touched.
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(c, vec3(l), clamp((l - 1.0) * 0.35, 0.0, 0.45));
          c = shoulder(c);
          vec2 q = vUv - 0.5;
          c *= 1.0 - uVignette * dot(q, q) * 2.4;
          gl_FragColor = vec4(c, 1.0);
          // The one encode in the whole stack. Three fills linearToOutputTexel
          // from the bound target, so this is the canvas sRGB transfer here and
          // the identity if this pass is ever retargeted off-screen.
          #include <colorspace_fragment>
          // Dither: the sky sits a few 8-bit codes above black, where banding is
          // plainly visible without it. It has to come *after* the encode — it
          // is quantisation noise, measured in display codes. Applied before,
          // the same 0.007 is ~11 codes of visible static in the darks, because
          // the encode multiplies small linear values by up to 12.92.
          float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453);
          gl_FragColor.rgb += (n - 0.5) * uGrain;
        }
      `,
      depthTest: false, depthWrite: false,
    });
  }

  // ── Post stack ──────────────────────────────────────────────────────────────
  class PostStack {
    constructor(renderer) {
      this.renderer = renderer;
      this.raw = renderer.render.bind(renderer);
      this.fs = new FullScreen();
      this.hdr = null;
      this.mips = [];
      this.w = 0; this.h = 0; this.levels = 0;
      this.mat = {
        bright: brightMaterial(),
        blur: blurMaterial(),
        copy: copyMaterial(false),
        add: copyMaterial(true),
        comp: compositeMaterial(),
      };
    }

    resize(w, h, levels) {
      if (this.w === w && this.h === h && this.levels === levels) return;
      this.w = w; this.h = h; this.levels = levels;
      if (this.hdr) this.hdr.dispose();
      // samples: 4 restores the MSAA that `antialias: true` stops providing the
      // moment a render target is bound.
      this.hdr = rt(w, h, { depthBuffer: true, samples: 4 });
      // The scene target stays LINEAR, and that is not a choice: for any
      // non-XR render target Three hard-codes the material output space to
      // LinearSRGBColorSpace (vendor/three.module.js:20725), so a
      // `texture.colorSpace = SRGBColorSpace` declaration here is silently
      // ignored. Everything downstream therefore works in linear light, and
      // the single sRGB encode happens in the composite pass, which is the
      // only pass that targets the canvas. Half-float carries the values past
      // 1.0 that bloom needs.
      for (const m of this.mips) { m.a.dispose(); m.b.dispose(); }
      this.mips = [];
      let mw = Math.max(2, w >> 1), mh = Math.max(2, h >> 1);
      for (let i = 0; i < levels; i++) {
        this.mips.push({ a: rt(mw, mh), b: rt(mw, mh), w: mw, h: mh });
        mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      }
    }

    render(scene, camera) {
      const r = this.renderer, fs = this.fs, M = this.mat;
      const size = r.getDrawingBufferSize(_v2);
      this.resize(Math.max(2, size.x | 0), Math.max(2, size.y | 0), LEVELS[GPU.quality] || 3);

      const prevAutoClear = r.autoClear;

      // 1. scene -> HDR
      r.autoClear = true;
      r.setRenderTarget(this.hdr);
      this.raw(scene, camera);

      // 2. bright pass -> top mip
      M.bright.uniforms.tSrc.value = this.hdr.texture;
      M.bright.uniforms.uThreshold.value = GPU.bloom.threshold;
      fs.run(r, this.raw, M.bright, this.mips[0].a);

      // 3. blur each level, then feed the next one down the pyramid
      M.blur.uniforms.uRadius.value = GPU.bloom.radius;
      for (let i = 0; i < this.mips.length; i++) {
        const m = this.mips[i];
        M.blur.uniforms.uTexel.value.set(1 / m.w, 1 / m.h);
        M.blur.uniforms.tSrc.value = m.a.texture;
        M.blur.uniforms.uDir.value.set(1, 0);
        fs.run(r, this.raw, M.blur, m.b);
        M.blur.uniforms.tSrc.value = m.b.texture;
        M.blur.uniforms.uDir.value.set(0, 1);
        fs.run(r, this.raw, M.blur, m.a);
        const next = this.mips[i + 1];
        if (next) {
          M.copy.uniforms.tSrc.value = m.a.texture;
          M.copy.uniforms.uScale.value = 1.0;
          fs.run(r, this.raw, M.copy, next.a);
        }
      }

      // 4. additive upsample walk back to the top mip
      r.autoClear = false;
      M.add.uniforms.uScale.value = 0.8;
      for (let i = this.mips.length - 1; i > 0; i--) {
        M.add.uniforms.tSrc.value = this.mips[i].a.texture;
        fs.run(r, this.raw, M.add, this.mips[i - 1].a);
      }
      r.autoClear = true;

      // 5. composite to the canvas
      const u = M.comp.uniforms;
      u.tScene.value = this.hdr.texture;
      u.tBloom.value = this.mips[0].a.texture;
      u.uExposure.value = GPU.exposure;
      u.uBloom.value = GPU.bloom.intensity;
      u.uKnee.value = GPU.knee;
      u.uVignette.value = GPU.vignette;
      u.uGrain.value = GPU.grain;
      u.uTime.value = (performance.now() % 10000) * 0.001;
      fs.run(r, this.raw, M.comp, null);

      r.autoClear = prevAutoClear;
      r.setRenderTarget(null);
    }

    dispose() {
      if (this.hdr) this.hdr.dispose();
      for (const m of this.mips) { m.a.dispose(); m.b.dispose(); }
      this.mips = [];
      for (const k in this.mat) this.mat[k].dispose();
      this.fs.dispose();
    }
  }

  // ── GPU point sprites ───────────────────────────────────────────────────────
  // Same two attributes PointsPool already writes (position, premultiplied
  // colour), so nothing upstream changes. The per-particle variation is hashed
  // from world position rather than stored, because a pool slot holds a
  // different particle every frame — a stored seed would make the shimmer sit
  // still in screen space instead of travelling with the particle.
  function pointMaterial(sizePx) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: sizePx },
        uDpr: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute vec3 color;
        uniform float uSize;
        uniform float uDpr;
        uniform float uTime;
        varying vec3 vColor;
        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          float seed = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
          float tw = 0.88 + 0.12 * sin(uTime * 1.7 + seed * 6.2831853);
          gl_PointSize = uSize * uDpr * (0.78 + seed * 0.5) * tw;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          if (d > 1.0) discard;
          // Calibrated against the old 64px canvas gradient at d=0.4, with a
          // tighter core so the bloom pass has something to catch.
          float halo = exp(-d * d * 2.9) * 0.72;
          float core = exp(-d * d * 16.0) * 0.45;
          gl_FragColor = vec4(vColor, (halo + core) * smoothstep(1.0, 0.72, d));
          // Identity while the stack is installed, because these points only
          // ever render into the linear HDR target. Kept so the material also
          // behaves if it is ever drawn straight to the canvas; Three injects
          // the chunk only into its own materials, so a custom shader has to
          // ask for it.
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  function upgradePoints(R) {
    for (const key of ['disc', 'cloud', 'fx']) {
      const pool = R.pools && R.pools[key];
      if (!pool || pool._gpuOld) continue;
      const mat = pointMaterial(pool.mat.size);
      pool._gpuOld = pool.mat;
      pool.mat = mat;
      pool.obj.material = mat;
      GPU._points.push(pool);
    }
  }

  function restorePoints() {
    for (const pool of GPU._points) {
      if (!pool._gpuOld) continue;
      pool.mat.dispose();
      pool.mat = pool._gpuOld;
      pool.obj.material = pool._gpuOld;
      pool._gpuOld = null;
    }
    GPU._points.length = 0;
  }

  function updatePointUniforms(R) {
    const dpr = R.renderer ? R.renderer.getPixelRatio() : 1;
    const t = R.sim && Number.isFinite(R.sim.t) ? R.sim.t : performance.now() * 0.001;
    for (const pool of GPU._points) {
      pool.mat.uniforms.uDpr.value = dpr;
      pool.mat.uniforms.uTime.value = t;
    }
  }

  // ── Install / uninstall ─────────────────────────────────────────────────────
  function detect(renderer) {
    try {
      return !!(renderer && renderer.capabilities && renderer.capabilities.isWebGL2);
    } catch (err) {
      console.warn('KNRender3D.gpu: feature detection failed', err);
      return false;
    }
  }

  function install(R) {
    if (!R || !R.renderer || GPU._stack) return;
    if (!GPU.enabled || GPU.quality === 'off') return;
    GPU.available = detect(R.renderer);
    if (!GPU.available) return;
    try {
      const stack = new PostStack(R.renderer);
      GPU._stack = stack;
      R.renderer.render = function (scene, camera) {
        updatePointUniforms(R);
        stack.render(scene, camera);
      };
      upgradePoints(R);
    } catch (err) {
      console.warn('KNRender3D.gpu: install failed, keeping the fixed-function path', err);
      uninstall(R);
    }
  }

  function uninstall(R) {
    restorePoints();
    if (GPU._stack) {
      if (R && R.renderer) R.renderer.render = GPU._stack.raw;
      GPU._stack.dispose();
      GPU._stack = null;
    }
  }

  function attachTo(R3D) {
    if (!R3D || R3D.gpu) return;
    R3D.gpu = GPU;

    const origAttach = R3D.attach;
    R3D.attach = function (canvas) {
      const ok = origAttach.call(this, canvas);
      if (ok) install(this);
      return ok;
    };

    const origDetach = R3D.detach;
    R3D.detach = function () {
      uninstall(this);
      return origDetach.call(this);
    };

    GPU.set = function (partial) {
      if (partial && typeof partial === 'object') {
        for (const k in partial) {
          if (k === 'bloom' && partial.bloom) Object.assign(GPU.bloom, partial.bloom);
          else if (k in GPU && typeof GPU[k] !== 'function') GPU[k] = partial[k];
        }
      }
      const R = window.KNRender3D;
      if (!R || !R.renderer) return GPU;
      if (!GPU.enabled || GPU.quality === 'off') uninstall(R);
      else if (!GPU._stack) install(R);
      return GPU;
    };

    // The renderer may already be attached when this module finishes loading.
    if (R3D.renderer) install(R3D);
  }

  if (window.KNRender3D) attachTo(window.KNRender3D);
  else window.addEventListener('kn3d-ready', () => attachTo(window.KNRender3D), { once: true });
})();
