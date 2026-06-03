/* Bridge: off-thread gravitational-lensing renderer -> window.KNLensing.
 *
 * Phase 6, P6.2. Mirrors the full-physics-bridge.mjs pattern: a thin browser
 * global that owns a Web Worker running the add-only renderer
 * (full-physics/lensing-worker.mjs via lensing-worker-entry.mjs), debounces
 * requests, caches results per (params, camera, size), and renders progressively
 * (coarse then full). If a module worker cannot be created (older browser,
 * file:// context), it transparently falls back to rendering on the main thread.
 *
 * This file is add-only and is NOT yet referenced by index.html — wiring the
 * <script> tag and mounting the panel is P6.3 (needs explicit approval).
 *
 * Result shape handed to callers / events:
 *   { width, height, camera, counts, photonRing, buffer:Uint8ClampedArray,
 *     imageData:ImageData|null }
 *
 * Units: G = c = 4 pi epsilon_0 = 1.
 */
(function () {
  if (typeof window === "undefined") return; // browser-only glue

  const WORKER_ENTRY = "lensing-worker-entry.mjs";
  const FALLBACK_MODULE = "./full-physics/lensing-worker.mjs";
  const DEFAULT_DEBOUNCE = 220;
  const DEFAULT_SIZE = 192;
  const CACHE_LIMIT = 10;

  const num = (x) => (Number(x) || 0).toFixed(4);

  function paramsKey(p = {}) {
    return `${num(p.M)}|${num(p.Q)}|${num(p.a)}|${num(p.B)}`;
  }
  function cameraKey(c = {}) {
    return `${num(c.r)}|${num(c.theta)}|${num(c.phi)}|${num(c.fovY)}`;
  }
  // The deflection LUT is invariant under camera azimuth (Kerr-Newman is
  // axisymmetric), so its cache key deliberately omits phi: one LUT serves every
  // azimuth via a cheap reshade. Inclination (theta), distance, and FOV do change
  // the geodesics, so they stay in the key.
  function cameraKeyNoPhi(c = {}) {
    return `${num(c.r)}|${num(c.theta)}|${num(c.fovY)}`;
  }
  function discKey(disc) {
    if (!disc) return "nodisc";
    return `d${num(disc.accretionRate)}_${num(disc.innerR)}_${num(disc.outerR)}_${num(disc.exposure)}`;
  }
  function renderKey(p, c, o = {}) {
    const w = o.width ?? DEFAULT_SIZE;
    const h = o.height ?? DEFAULT_SIZE;
    return `${paramsKey(p)}#${cameraKey(c)}#${w}x${h}#${discKey(o.disc)}`;
  }
  function lutKey(p, c, o = {}) {
    const w = o.lutWidth ?? o.width ?? DEFAULT_SIZE;
    const h = o.lutHeight ?? o.height ?? DEFAULT_SIZE;
    return `${paramsKey(p)}#${cameraKeyNoPhi(c)}#lut${w}x${h}#${discKey(o.disc)}`;
  }

  class LensingBridge {
    constructor() {
      this.params = { M: 1.5, Q: 0, a: 0.5, B: 0.3 };
      this.camera = { r: 26, theta: Math.PI / 2 + 0.3, phi: 0, fovY: Math.PI / 2.5 };
      this.options = {};
      this.onFrame = null;

      this._worker = null;
      this._workerOk = false;
      this._pending = new Map(); // id -> { resolve, reject, params, camera, options }
      this._seq = 0;
      this._cache = new Map(); // renderKey -> result (LRU by insertion order)
      this._lutCache = new Map(); // lutKey -> deflection LUT (LRU)
      this._lastLUT = null; // { key, lut, width, height, disc } for cheap azimuth reshade
      this._eqCache = new Map(); // params -> equatorial bent-ray polylines
      this._module = null; // lazy import() of the worker module for main-thread shading
      this._fallbackModule = null;
      this._debounceTimer = null;
      this._renderToken = 0;
      this._overlay = { key: null, data: null, requesting: false }; // top-down overlay state

      this._initWorker();
    }

    /* ---- worker lifecycle ---- */

    _initWorker() {
      if (typeof Worker === "undefined") return; // -> main-thread fallback
      try {
        this._worker = new Worker(WORKER_ENTRY, { type: "module" });
        this._worker.onmessage = (event) => this._onWorkerMessage(event.data);
        this._worker.onerror = () => this._onWorkerFailure();
        this._workerOk = true;
      } catch (err) {
        this._worker = null;
        this._workerOk = false;
      }
    }

    _onWorkerMessage(data) {
      if (!data || data.id == null) return;
      const pend = this._pending.get(data.id);
      if (!pend) return;
      this._pending.delete(data.id);
      if (!data.ok) {
        pend.reject(new Error(data.error?.message || "lensing render failed"));
        return;
      }
      if (pend.kind === "equatorial" || pend.kind === "lut") pend.resolve(data.payload);
      else pend.resolve(this._packResult(data.payload, data.buffer));
    }

    /* A module-worker load failure surfaces async via onerror. Disable the
       worker and re-route any in-flight requests to the main-thread fallback so
       no request is lost. */
    _onWorkerFailure() {
      this._workerOk = false;
      const inflight = [...this._pending.values()];
      this._pending.clear();
      for (const pend of inflight) {
        let retry;
        if (pend.kind === "equatorial") retry = this._eqViaFallback(pend.params, pend.options);
        else if (pend.kind === "lut") retry = this._buildLUTViaFallback(pend.params, pend.camera, pend.options);
        else retry = this._renderViaFallback(pend.params, pend.camera, pend.options);
        retry.then(pend.resolve, pend.reject);
      }
    }

    /* ---- result packing ---- */

    _packResult(meta = {}, buffer) {
      const u8 = buffer instanceof Uint8ClampedArray
        ? buffer
        : new Uint8ClampedArray(buffer ?? 0);
      let imageData = null;
      try {
        if (typeof ImageData !== "undefined" && meta.width && meta.height) {
          imageData = new ImageData(u8, meta.width, meta.height);
        }
      } catch (err) {
        imageData = null;
      }
      return {
        width: meta.width,
        height: meta.height,
        camera: meta.camera,
        counts: meta.counts,
        photonRing: meta.photonRing,
        buffer: u8,
        imageData,
      };
    }

    /* ---- caching ---- */

    _cacheGet(key) {
      if (!this._cache.has(key)) return null;
      const value = this._cache.get(key);
      this._cache.delete(key); // refresh LRU order
      this._cache.set(key, value);
      return value;
    }
    _cachePut(key, value) {
      this._cache.set(key, value);
      while (this._cache.size > CACHE_LIMIT) {
        this._cache.delete(this._cache.keys().next().value);
      }
    }
    clearCache() {
      this._cache.clear();
      this._lutCache.clear();
      this._lastLUT = null;
    }

    /* ---- render paths ---- */

    _renderViaWorker(params, camera, options) {
      return new Promise((resolve, reject) => {
        const id = ++this._seq;
        this._pending.set(id, { resolve, reject, params, camera, options, kind: "render" });
        try {
          this._worker.postMessage({
            id,
            type: "render-lensing",
            payload: { params, camera, options },
          });
        } catch (err) {
          this._pending.delete(id);
          reject(err);
        }
      });
    }

    _eqViaWorker(params, options) {
      return new Promise((resolve, reject) => {
        const id = ++this._seq;
        this._pending.set(id, { resolve, reject, params, options, kind: "equatorial" });
        try {
          this._worker.postMessage({ id, type: "equatorial-rays", payload: { params, options } });
        } catch (err) {
          this._pending.delete(id);
          reject(err);
        }
      });
    }

    async _eqViaFallback(params, options) {
      if (!this._fallbackModule) this._fallbackModule = import(FALLBACK_MODULE);
      const mod = await this._fallbackModule;
      return mod.traceEquatorialRays(params, options);
    }

    /* Equatorial bent-ray polylines for the top-down overlay. Cached per params. */
    equatorialRays(params = this.params, options = {}) {
      const key = paramsKey(params) + "#eq" + (options.count ?? 13) + "_" + (options.cameraR ?? 40) +
        (options.parallel ? "p" : "");
      const cached = this._eqCache.get(key);
      if (cached) return Promise.resolve(cached);
      const exec = this._workerOk && this._worker
        ? this._eqViaWorker(params, options)
        : this._eqViaFallback(params, options);
      return exec.then((data) => {
        this._eqCache.set(key, data);
        while (this._eqCache.size > CACHE_LIMIT) this._eqCache.delete(this._eqCache.keys().next().value);
        return data;
      });
    }

    async _renderViaFallback(params, camera, options) {
      if (!this._fallbackModule) this._fallbackModule = import(FALLBACK_MODULE);
      const mod = await this._fallbackModule;
      const img = mod.renderLensingImage(params, camera, options);
      return this._packResult({
        width: img.width,
        height: img.height,
        camera: img.camera,
        counts: img.counts,
        photonRing: img.photonRing,
      }, img.buffer);
    }

    /* Immediate render Promise (no debounce). Cached per (params, camera, size). */
    render(params = this.params, camera = this.camera, options = this.options) {
      const key = renderKey(params, camera, options);
      const cached = this._cacheGet(key);
      if (cached) return Promise.resolve(cached);
      const exec = this._workerOk && this._worker
        ? this._renderViaWorker(params, camera, options)
        : this._renderViaFallback(params, camera, options);
      return exec.then((result) => {
        this._cachePut(key, result);
        return result;
      });
    }

    /* ---- deflection-LUT fast path (PHASE6-LENSING-PLAN.md sec 4.5) ---- *
     * The expensive GR ray trace is run once per (params, inclination, base size,
     * disc) into a LUT; the LUT is then shaded cheaply on the main thread at any
     * display resolution and any camera azimuth. This decouples display
     * resolution from trace cost (fixing the blocky upscale) and makes azimuth
     * rotation a pure reshade (no integration). */

    _buildLUTViaWorker(params, camera, options) {
      return new Promise((resolve, reject) => {
        const id = ++this._seq;
        this._pending.set(id, { resolve, reject, params, camera, options, kind: "lut" });
        try {
          this._worker.postMessage({ id, type: "build-lut", payload: { params, camera, options } });
        } catch (err) {
          this._pending.delete(id);
          reject(err);
        }
      });
    }

    async _buildLUTViaFallback(params, camera, options) {
      const mod = await this._ensureModule();
      return mod.buildDeflectionLUT(params, camera, options);
    }

    _ensureModule() {
      if (!this._module) this._module = import(FALLBACK_MODULE);
      return this._module;
    }

    /* Build (or reuse) the deflection LUT for these params/camera/base-size. The
       base trace size comes from options.lutWidth/lutHeight (falling back to
       width/height). Cached by a key that omits azimuth. */
    buildLUT(params = this.params, camera = this.camera, options = this.options) {
      const baseOpts = {
        ...options,
        width: options.lutWidth ?? options.width ?? DEFAULT_SIZE,
        height: options.lutHeight ?? options.height ?? DEFAULT_SIZE,
      };
      const key = lutKey(params, camera, options);
      const cached = this._lutCache.get(key);
      if (cached) {
        this._lutCache.delete(key); this._lutCache.set(key, cached); // refresh LRU
        return Promise.resolve(cached);
      }
      const exec = this._workerOk && this._worker
        ? this._buildLUTViaWorker(params, camera, baseOpts)
        : this._buildLUTViaFallback(params, camera, baseOpts);
      return exec.then((lut) => {
        this._lutCache.set(key, lut);
        while (this._lutCache.size > CACHE_LIMIT) this._lutCache.delete(this._lutCache.keys().next().value);
        return lut;
      });
    }

    /* Shade a LUT to an RGBA frame on the main thread (cheap; no integration). */
    async shadeLUT(lut, options = {}) {
      const mod = await this._ensureModule();
      const img = mod.shadeLUTImage(lut, options);
      return this._packResult({
        width: img.width,
        height: img.height,
        camera: img.camera,
        counts: img.counts,
        photonRing: img.photonRing,
      }, img.buffer);
    }

    /* Debounced, progressive LUT render used by the panels. Builds a coarse LUT
       first (fast first paint), then the full-resolution LUT, shading each to the
       display size. Stores the full LUT so a later azimuth-only change can
       reshade without rebuilding (see reshadeLUT). Stale work is token-cancelled. */
    requestRenderLUT(req = {}) {
      const params = req.params ?? this.params;
      const camera = req.camera ?? this.camera;
      const options = req.options ?? this.options;
      const debounce = req.debounce ?? DEFAULT_DEBOUNCE;
      if (req.params) this.params = params;
      if (req.camera) this.camera = camera;
      if (req.options) this.options = options;

      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._runProgressiveLUT(params, camera, options, !!req.progressive);
      }, debounce);
    }

    async _runProgressiveLUT(params, camera, options, progressive) {
      const token = ++this._renderToken;
      const disc = options.disc ?? null;
      const dispW = options.width ?? DEFAULT_SIZE;
      const dispH = options.height ?? DEFAULT_SIZE;
      const baseW = options.lutWidth ?? options.width ?? DEFAULT_SIZE;
      const baseH = options.lutHeight ?? options.height ?? DEFAULT_SIZE;
      const cameraPhi = camera.phi ?? 0;
      const fullKey = lutKey(params, camera, options);

      if (progressive && !this._lutCache.has(fullKey)) {
        const cw = Math.max(20, Math.round(baseW / 2));
        const ch = Math.max(12, Math.round(baseH / 2));
        try {
          const coarse = await this.buildLUT(params, camera, { ...options, lutWidth: cw, lutHeight: ch });
          if (token !== this._renderToken) return;
          const frame = await this.shadeLUT(coarse, { width: dispW, height: dispH, disc, cameraPhi });
          if (token !== this._renderToken) return;
          this._emit(frame, false);
        } catch (err) {
          /* coarse failure is non-fatal; the full pass below still runs */
        }
      }

      try {
        const lut = await this.buildLUT(params, camera, options);
        if (token !== this._renderToken) return;
        this._lastLUT = { key: fullKey, lut, width: dispW, height: dispH, disc };
        const frame = await this.shadeLUT(lut, { width: dispW, height: dispH, disc, cameraPhi });
        if (token !== this._renderToken) return;
        this._emit(frame, true);
      } catch (err) {
        if (token === this._renderToken) this._emitError(err);
      }
    }

    /* Cheap azimuth reshade of the last full LUT: no rebuild, no integration.
       Returns false if no compatible LUT is cached (caller should requestRenderLUT
       instead). Used for smooth camera-azimuth rotation. */
    reshadeLUT(cameraPhi) {
      const last = this._lastLUT;
      if (!last || !last.lut) return false;
      this.camera = { ...this.camera, phi: cameraPhi };
      const token = ++this._renderToken;
      this.shadeLUT(last.lut, { width: last.width, height: last.height, disc: last.disc, cameraPhi })
        .then((frame) => { if (token === this._renderToken) this._emit(frame, true); })
        .catch((err) => { if (token === this._renderToken) this._emitError(err); });
      return true;
    }

    /* Top-down main-canvas overlay: draws cached equatorial bent geodesics and
       the critical-impact-parameter circle. Called per frame from render.js, but
       only recomputes the geodesics (off-thread) when (M, Q, a) changes. */
    renderOverlay(sim, ctx, w, h, worldToScreen) {
      if (!sim || !ctx || typeof worldToScreen !== "function") return;
      const p = sim.params || {};
      const key = paramsKey(p);
      if (key !== this._overlay.key) {
        this._overlay.key = key;
        const snapshot = { M: p.M, Q: p.Q, a: p.a, B: p.B };
        clearTimeout(this._overlay.timer);
        this._overlay.timer = setTimeout(() => {
          this.equatorialRays(snapshot, { count: 13, cameraR: 40 })
            .then((data) => { this._overlay.data = data; })
            .catch(() => { /* leave previous overlay in place */ });
        }, 200);
      }
      const data = this._overlay.data;
      if (!data || !data.rays) return;

      // Anchor the lensing geometry on the system's gravitating centre. The
      // bent-ray geodesics are computed about a single mass at the origin, so we
      // offset them to that centre. With a binary that centre is the conserved
      // barycentre (centre of mass) — a fixed point in the COM frame — so the
      // rings/geodesics stay put instead of swinging with the orbiting primary
      // or companion. A lone primary sits at the world origin.
      const bin = sim.binary;
      const ox = (bin && bin.enabled) ? (bin.cx || 0) : 0;
      const oy = (bin && bin.enabled) ? (bin.cy || 0) : 0;

      ctx.save();
      ctx.lineWidth = 1;
      for (const ray of data.rays) {
        const pts = ray.points;
        if (!pts || pts.length < 4) continue;
        ctx.strokeStyle = ray.captured
          ? "oklch(0.62 0.13 28 / 0.30)"   // faint red — light that falls in
          : "oklch(0.72 0.09 210 / 0.26)"; // faint cyan — light that bends past
        ctx.beginPath();
        let s = worldToScreen(sim, w, h, ox + pts[0], oy + pts[1]);
        ctx.moveTo(s[0], s[1]);
        for (let i = 2; i < pts.length; i += 2) {
          s = worldToScreen(sim, w, h, ox + pts[i], oy + pts[i + 1]);
          ctx.lineTo(s[0], s[1]);
        }
        ctx.stroke();
      }
      // Critical impact parameter: rays aimed within b_crit of the centre are
      // captured. Drawn as a faint dashed circle for orientation.
      if (data.bCrit > 0 && sim.view && sim.view.scale) {
        const c = worldToScreen(sim, w, h, ox, oy);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = "oklch(0.78 0.10 60 / 0.26)";
        ctx.beginPath();
        ctx.arc(c[0], c[1], data.bCrit * sim.view.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    /* ---- debounced, progressive request used by the UI ---- */

    setOnFrame(fn) {
      this.onFrame = typeof fn === "function" ? fn : null;
      return this;
    }

    syncParams(params = {}) {
      this.params = {
        M: Number(params.M) || this.params.M,
        Q: Number(params.Q) || 0,
        a: Number(params.a) || 0,
        B: Math.max(0, Number(params.B) || 0),
      };
      return this.params;
    }

    setCamera(camera = {}) {
      this.camera = { ...this.camera, ...camera };
      return this.camera;
    }

    _emit(result, final) {
      const detail = { result, final };
      if (this.onFrame) {
        try { this.onFrame(result, final); } catch (err) { /* swallow UI errors */ }
      }
      window.dispatchEvent(new CustomEvent("knlensing-frame", { detail }));
    }
    _emitError(error) {
      window.dispatchEvent(new CustomEvent("knlensing-error", { detail: { error } }));
    }

    /* Debounced render. With { progressive: true } it emits a coarse frame
       first (downscaled), then the full-resolution frame, so the panel updates
       immediately and sharpens. Stale requests are cancelled by token. */
    requestRender(req = {}) {
      const params = req.params ?? this.params;
      const camera = req.camera ?? this.camera;
      const options = req.options ?? this.options;
      const debounce = req.debounce ?? DEFAULT_DEBOUNCE;
      if (req.params) this.params = params;
      if (req.camera) this.camera = camera;
      if (req.options) this.options = options;

      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._runProgressive(params, camera, options, !!req.progressive);
      }, debounce);
    }

    async _runProgressive(params, camera, options, progressive) {
      const token = ++this._renderToken;
      const fullW = options.width ?? DEFAULT_SIZE;
      const fullH = options.height ?? DEFAULT_SIZE;

      if (progressive) {
        const cw = Math.max(24, Math.round(fullW / 3));
        const ch = Math.max(24, Math.round(fullH / 3));
        try {
          const coarse = await this.render(params, camera, { ...options, width: cw, height: ch });
          if (token !== this._renderToken) return; // superseded
          this._emit(coarse, false);
        } catch (err) {
          /* coarse failure is non-fatal; try the full render below */
        }
      }

      try {
        const full = await this.render(params, camera, { ...options, width: fullW, height: fullH });
        if (token !== this._renderToken) return; // superseded
        this._emit(full, true);
      } catch (err) {
        if (token === this._renderToken) this._emitError(err);
      }
    }

    dispose() {
      clearTimeout(this._debounceTimer);
      this._renderToken++;
      this._pending.clear();
      this._lastLUT = null;
      if (this._worker) {
        try { this._worker.terminate(); } catch (err) { /* ignore */ }
        this._worker = null;
      }
      this._workerOk = false;
    }
  }

  const bridge = new LensingBridge();
  window.KNLensing = bridge;
  window.dispatchEvent(new CustomEvent("knlensing-ready", { detail: { bridge } }));
})();
