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
  function discKey(disc) {
    if (!disc) return "nodisc";
    return `d${num(disc.accretionRate)}_${num(disc.innerR)}_${num(disc.outerR)}_${num(disc.exposure)}`;
  }
  function renderKey(p, c, o = {}) {
    const w = o.width ?? DEFAULT_SIZE;
    const h = o.height ?? DEFAULT_SIZE;
    return `${paramsKey(p)}#${cameraKey(c)}#${w}x${h}#${discKey(o.disc)}`;
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
      this._fallbackModule = null;
      this._debounceTimer = null;
      this._renderToken = 0;

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
      pend.resolve(this._packResult(data.payload, data.buffer));
    }

    /* A module-worker load failure surfaces async via onerror. Disable the
       worker and re-route any in-flight requests to the main-thread fallback so
       no request is lost. */
    _onWorkerFailure() {
      this._workerOk = false;
      const inflight = [...this._pending.values()];
      this._pending.clear();
      for (const pend of inflight) {
        this._renderViaFallback(pend.params, pend.camera, pend.options)
          .then(pend.resolve, pend.reject);
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
    }

    /* ---- render paths ---- */

    _renderViaWorker(params, camera, options) {
      return new Promise((resolve, reject) => {
        const id = ++this._seq;
        this._pending.set(id, { resolve, reject, params, camera, options });
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
