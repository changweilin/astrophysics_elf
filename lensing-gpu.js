/* GPU shading of the deflection LUT (window.KNLensing.gpu).
 *
 * Phase 3 of GPU-RENDER-PLAN.md. The expensive part of the lensing view — the
 * per-pixel GR ray trace — stays in the benchmarked worker
 * (full-physics/lensing-worker.mjs, buildDeflectionLUT). What moves here is
 * the reshade: shadeLUTImage's per-pixel maths (boundary-aware bilinear LUT
 * sample, shadow mask, photon ring, g-weighted disc emission, lensed
 * starfield) ported to one WebGL2 fragment shader. The LUT is uploaded once
 * as two RGBA32F textures; the camera azimuth and the output size are
 * uniforms, so a reshade at any display resolution is one draw call.
 *
 * Attachment is a runtime patch of KNLensing.shadeLUT, the single choke point
 * that requestRenderLUT and reshadeLUT both go through, so lensing.js keeps a
 * zero diff and every consumer (observer-view.jsx, mobile-app.jsx) receives
 * the same { width, height, buffer, imageData, ... } result as before. With
 * gpu.enabled = false, no WebGL2, a lost context or a LUT the shader cannot
 * represent, the original main-thread shadeLUT runs unchanged.
 *
 * This is a port, not a model. Every constant below is the one in
 * lensing-worker.mjs / radiation-models.mjs, and the output is checked against
 * shadeLUTImage pixel-for-pixel (see GPU-RENDER-PLAN.md, Phase 3 results). Any
 * physics change belongs in those modules first and is mirrored here.
 *
 * Output is DISPLAY-encoded, like the CPU buffer: composeFalseColor already
 * applies its own 1/2.2 gamma and the result is written straight to 8 bits,
 * so unlike render3d-gpu.mjs there is no linear stage and no sRGB encode.
 */
(function () {
  if (typeof window === 'undefined') return;
  const bridge = window.KNLensing;
  if (!bridge || typeof bridge.shadeLUT !== 'function') return;

  const VS = `#version 300 es
    void main() {
      // Fullscreen triangle from the vertex id, so no buffer is bound.
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }
  `;

  const FS = `#version 300 es
    precision highp float;
    precision highp int;

    // tA = (capture, ringGlow, discHit, discG)
    // tB = (skyTheta, skyPhi, discR cos discPhi, discR sin discPhi)
    // Azimuths are relative to the build camera, exactly as the LUT stores them.
    uniform highp sampler2D tA;
    uniform highp sampler2D tB;
    uniform ivec2 uBase;
    uniform vec2 uOut;
    uniform float uCamPhi;
    uniform bool uHasDisc;
    // Disc model (diskSurfaceBrightness / renderDiscHit / composeFalseColor).
    uniform float uM;
    uniform float uSpin;          // |a / M|
    uniform float uMdot;
    uniform float uInnerR;
    uniform float uTorqueR;
    uniform float uTempScale;
    uniform float uThermalDen;    // frequency^spectralIndex + EPS
    uniform float uColorCorr;
    uniform float uOptDepth;      // < 0: use the 2.5 (r_in / r)^0.75 profile
    uniform float uBoostExp;      // 3 + spectralIndex
    uniform float uInclBoost;
    uniform float uExposure;
    out vec4 outColor;

    const float PI = 3.141592653589793;
    const float TAU = 6.283185307179586;
    const vec3 SHADOW = vec3(0.020, 0.022, 0.030);

    // hashAngle: the JS version multiplies in float64 and truncates with
    // ToInt32, which is the same bit pattern as wrapping uint32 arithmetic.
    float hashAngle(float theta, float phi, uint salt) {
      uint u = uint(int(floor((phi / TAU + 4.0) * 220.0)));
      uint v = uint(int(floor((theta / PI) * 140.0)));
      uint h = (u * 73856093u) ^ (v * 19349663u) ^ (salt * 83492791u);
      h = h ^ (h >> 13u);
      return float(h % 100000u) / 100000.0;
    }

    vec3 starfield(float theta, float phi) {
      float seed = hashAngle(theta, phi, 1u);
      float star = seed > 0.992 ? (seed - 0.992) / 0.008 : 0.0;
      float twinkle = 0.18 + 0.55 * star * star;
      float v = clamp(0.018 + twinkle * star, 0.0, 0.42);
      return vec3(v * 0.68, v * 0.78, clamp(v + 0.012, 0.0, 0.5));
    }

    // Returns (r, g, b, a) of composeFalseColor for a disc crossing at r with
    // redshift g. Zero inside the geometric inner edge, like the CPU flux.
    vec4 discColor(float r, float g) {
      if (!(r > uInnerR)) return vec4(0.0);
      float nt = max(0.0, 1.0 - sqrt(uTorqueR / max(r, 1e-12)));
      float dim = 1.0 / (1.0 + 0.35 * uSpin * pow(uTorqueR / r, 1.5));
      float flux = (3.0 * uM * uMdot / (8.0 * PI * r * r * r)) * nt * dim;
      float T = uTempScale * pow(max(flux, 0.0), 0.25);
      float tau = uOptDepth >= 0.0 ? uOptDepth : max(0.0, 2.5 * pow(uInnerR / max(r, 1e-12), 0.75));
      float thermal = (T * T) * (T * T) / uThermalDen;
      float cc2 = uColorCorr * uColorCorr;
      float spec = thermal * (1.0 - exp(-tau)) / (cc2 * cc2);
      float I = spec * pow(g, uBoostExp) * uInclBoost;
      float value = clamp(1.0 - exp(-max(0.0, I) * uExposure), 0.0, 1.0);
      float c = pow(value, 1.0 / 2.2);
      float t = clamp(0.35 + 0.5 * tanh(T * uColorCorr * 2.2), 0.0, 1.0);
      return vec4(
        clamp(c * (1.0 + 0.35 * t), 0.0, 1.0),
        clamp(c * (0.65 + 0.25 * t), 0.0, 1.0),
        clamp(c * (0.35 + 0.45 * (1.0 - t)), 0.0, 1.0),
        value);
    }

    void main() {
      // Row 0 of the output buffer is the TOP image row, and readPixels
      // returns bottom-up, so GL row y is image row y — the canvas itself is
      // upside down and never displayed.
      float ox = floor(gl_FragCoord.x);
      float oy = floor(gl_FragCoord.y);
      float bw = float(uBase.x);
      float bh = float(uBase.y);
      float fx = uOut.x > 1.0 ? (ox + 0.5) / uOut.x * bw - 0.5 : (bw - 1.0) * 0.5;
      float fy = uOut.y > 1.0 ? (oy + 0.5) / uOut.y * bh - 0.5 : (bh - 1.0) * 0.5;

      // sampleLUT
      int ix = int(floor(fx));
      int iy = int(floor(fy));
      int x0 = clamp(ix, 0, uBase.x - 1);
      int x1 = clamp(ix + 1, 0, uBase.x - 1);
      int y0 = clamp(iy, 0, uBase.y - 1);
      int y1 = clamp(iy + 1, 0, uBase.y - 1);
      float tx = clamp(fx - float(ix), 0.0, 1.0);
      float ty = clamp(fy - float(iy), 0.0, 1.0);
      vec4 w = vec4((1.0 - tx) * (1.0 - ty), tx * (1.0 - ty), (1.0 - tx) * ty, tx * ty);

      vec4 a0 = texelFetch(tA, ivec2(x0, y0), 0);
      vec4 a1 = texelFetch(tA, ivec2(x1, y0), 0);
      vec4 a2 = texelFetch(tA, ivec2(x0, y1), 0);
      vec4 a3 = texelFetch(tA, ivec2(x1, y1), 0);
      vec4 b0 = texelFetch(tB, ivec2(x0, y0), 0);
      vec4 b1 = texelFetch(tB, ivec2(x1, y0), 0);
      vec4 b2 = texelFetch(tB, ivec2(x0, y1), 0);
      vec4 b3 = texelFetch(tB, ivec2(x1, y1), 0);

      vec4 cap = vec4(a0.x, a1.x, a2.x, a3.x);
      float capFrac = dot(w, cap);

      // Escaped sky direction: unit vectors blended over the escaped
      // neighbours only, so azimuth wraparound cannot streak.
      vec4 ws = w * (1.0 - step(0.5, cap));
      float wsum = ws.x + ws.y + ws.z + ws.w;
      if (wsum <= 0.0) { outColor = vec4(SHADOW, 1.0); return; }
      vec4 th = vec4(b0.x, b1.x, b2.x, b3.x);
      vec4 ph = vec4(b0.y, b1.y, b2.y, b3.y) + uCamPhi;
      vec4 st = sin(th);
      vec3 sv = vec3(dot(ws, st * cos(ph)), dot(ws, st * sin(ph)), dot(ws, cos(th)));
      float nrm = length(sv);
      if (nrm == 0.0) nrm = 1.0;
      float skyTheta = acos(clamp(sv.z / nrm, -1.0, 1.0));
      float skyPhi = atan(sv.y, sv.x);

      float glow = dot(w, vec4(a0.y, a1.y, a2.y, a3.y));

      // shadeSample
      if (capFrac >= 1.0) { outColor = vec4(SHADOW, 1.0); return; }
      vec3 col = starfield(skyTheta, skyPhi);

      if (uHasDisc) {
        vec4 hit = vec4(a0.z, a1.z, a2.z, a3.z);
        if (dot(w, hit) >= 0.5) {
          // Only r and g are shaded, and |sum w r e^{i(phi + c)}| does not
          // depend on c, so the crossing point needs no rotation.
          vec4 wd = w * step(0.5, hit);
          float dw = wd.x + wd.y + wd.z + wd.w;
          if (dw > 0.0) {
            float dx = dot(wd, vec4(b0.z, b1.z, b2.z, b3.z)) / dw;
            float dy = dot(wd, vec4(b0.w, b1.w, b2.w, b3.w)) / dw;
            float g = dot(wd, vec4(a0.w, a1.w, a2.w, a3.w)) / dw;
            vec4 fc = discColor(length(vec2(dx, dy)), g);
            col = col * (1.0 - fc.a) + fc.rgb;
          }
        }
      }

      if (glow > 0.0) {
        float k = 0.55 * glow;
        col = clamp(col + k * vec3(1.0, 0.86, 0.52), 0.0, 1.0);
      }
      if (capFrac > 0.0) col += (SHADOW - col) * capFrac;
      outColor = vec4(col, 1.0);
    }
  `;

  const GPU = {
    available: null,   // null until the first probe, then true / false
    enabled: true,
    lastMs: 0,         // wall time of the last GPU reshade, readback included
    _gl: null,
    _canvas: null,
    _prog: null,
    _loc: null,
    _tex: null,
    _lut: null,        // LUT object whose textures are currently uploaded
    _cpuShade: null,
  };

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('KNLensing.gpu shader: ' + log);
    }
    return sh;
  }

  function init() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
    });
    if (!gl) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('KNLensing.gpu link: ' + gl.getProgramInfoLog(prog));
    }
    const loc = {};
    for (const name of ['tA', 'tB', 'uBase', 'uOut', 'uCamPhi', 'uHasDisc', 'uM', 'uSpin',
      'uMdot', 'uInnerR', 'uTorqueR', 'uTempScale', 'uThermalDen', 'uColorCorr',
      'uOptDepth', 'uBoostExp', 'uInclBoost', 'uExposure']) {
      loc[name] = gl.getUniformLocation(prog, name);
    }
    const tex = [gl.createTexture(), gl.createTexture()];
    for (const t of tex) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindVertexArray(gl.createVertexArray());
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      GPU._gl = null; GPU._lut = null; GPU.available = null; // re-probe on restore
    });
    GPU._canvas = canvas; GPU._gl = gl; GPU._prog = prog; GPU._loc = loc; GPU._tex = tex;
    return true;
  }

  // Lazy so the page does not spend a WebGL context until a lensing view asks.
  GPU.ready = function () {
    if (!GPU.enabled) return false;
    if (GPU.available === null || (GPU.available && !GPU._gl)) {
      try { GPU.available = init(); } catch (err) {
        console.warn('KNLensing.gpu: init failed, keeping the CPU reshade', err);
        GPU.available = false;
      }
    }
    return !!GPU.available;
  };

  // Returns false when the LUT holds something the shader would silently get
  // wrong — a non-finite discG on a hit cell, which the CPU path recovers from
  // with discShiftApprox (not ported). The caller then falls back to the CPU.
  function upload(gl, lut) {
    const b = lut.base;
    const n = lut.width * lut.height;
    const A = new Float32Array(n * 4);
    const B = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const hit = b.discHit[i];
      if (hit && !Number.isFinite(b.discG[i])) return false;
      A[i * 4] = b.capture[i];
      A[i * 4 + 1] = b.ringGlow[i];
      A[i * 4 + 2] = hit;
      A[i * 4 + 3] = hit ? b.discG[i] : 0;
      B[i * 4] = b.skyTheta[i];
      B[i * 4 + 1] = b.skyPhi[i];
      B[i * 4 + 2] = hit ? b.discR[i] * Math.cos(b.discPhi[i]) : 0;
      B[i * 4 + 3] = hit ? b.discR[i] * Math.sin(b.discPhi[i]) : 0;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.bindTexture(gl.TEXTURE_2D, GPU._tex[0]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, lut.width, lut.height, 0, gl.RGBA, gl.FLOAT, A);
    gl.bindTexture(gl.TEXTURE_2D, GPU._tex[1]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, lut.width, lut.height, 0, gl.RGBA, gl.FLOAT, B);
    return true;
  }

  // Same argument contract and return shape as shadeLUTImage. null = not
  // handled here; the caller must use the CPU path.
  GPU.shade = function (lut, options = {}) {
    if (!GPU.ready() || !lut || !lut.base) return null;
    const gl = GPU._gl;
    if (gl.isContextLost()) return null;
    const t0 = performance.now();
    if (GPU._lut !== lut) {
      if (!upload(gl, lut)) { GPU._lut = null; return null; }
      GPU._lut = lut;
    }

    const bw = lut.width, bh = lut.height;
    const outW = Math.max(1, Math.floor(options.width ?? bw));
    const outH = Math.max(1, Math.floor(options.height ?? bh));
    const p = lut.params || {};
    const geom = lut.geom || {};
    const disc = options.disc ?? (lut.hasDisc ? {} : null);
    const camPhi = Number.isFinite(options.cameraPhi) ? options.cameraPhi : (lut.camera?.phi ?? 0);
    const incl = lut.camera?.theta ?? Math.PI / 2;

    const canvas = GPU._canvas;
    if (canvas.width !== outW || canvas.height !== outH) { canvas.width = outW; canvas.height = outH; }
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(GPU._prog);
    const L = GPU._loc;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GPU._tex[0]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, GPU._tex[1]);
    gl.uniform1i(L.tA, 0);
    gl.uniform1i(L.tB, 1);
    gl.uniform2i(L.uBase, bw, bh);
    gl.uniform2f(L.uOut, outW, outH);
    gl.uniform1f(L.uCamPhi, camPhi);
    gl.uniform1i(L.uHasDisc, disc ? 1 : 0);
    if (disc) {
      // Option defaults exactly as diskInnerRadius / novikovThorneLikeFlux /
      // diskSurfaceBrightness / renderDiscHit / shadeSample resolve them.
      const innerR = Number.isFinite(disc.innerR) ? disc.innerR : geom.innerR;
      const rIsco = geom.iscoEL?.rIsco;
      const alpha = disc.spectralIndex ?? 0.7;
      const freq = Math.max(disc.frequency ?? 1, 1e-12);
      gl.uniform1f(L.uM, p.M);
      gl.uniform1f(L.uSpin, Math.abs(p.a / p.M));
      gl.uniform1f(L.uMdot, Math.max(0, disc.accretionRate ?? 0.05));
      gl.uniform1f(L.uInnerR, innerR);
      gl.uniform1f(L.uTorqueR, Number.isFinite(rIsco) ? rIsco : innerR);
      gl.uniform1f(L.uTempScale, disc.temperatureScale ?? 1);
      gl.uniform1f(L.uThermalDen, freq ** alpha + 1e-12);
      gl.uniform1f(L.uColorCorr, disc.colorCorrection ?? 1.7);
      gl.uniform1f(L.uOptDepth, disc.opticalDepth != null ? Math.max(0, disc.opticalDepth) : -1);
      gl.uniform1f(L.uBoostExp, 3 + alpha);
      gl.uniform1f(L.uInclBoost, Math.min(1, Math.max(0.15, Math.abs(Math.cos(incl)))));
      gl.uniform1f(L.uExposure, disc.exposure ?? 140);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const px = new Uint8Array(outW * outH * 4);
    gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    GPU.lastMs = performance.now() - t0;
    return {
      width: outW,
      height: outH,
      params: lut.params,
      camera: { ...lut.camera, phi: camPhi },
      counts: lut.counts,
      photonRing: lut.photonRing,
      buffer: new Uint8ClampedArray(px.buffer),
    };
  };

  // Runtime patch of the one reshade entry point; see the header.
  GPU._cpuShade = bridge.shadeLUT.bind(bridge);
  bridge.shadeLUT = async function (lut, options = {}) {
    let img = null;
    try { img = GPU.shade(lut, options); } catch (err) {
      console.warn('KNLensing.gpu: shade failed, using the CPU reshade', err);
      img = null;
    }
    if (!img) return GPU._cpuShade(lut, options);
    return this._packResult({
      width: img.width,
      height: img.height,
      camera: img.camera,
      counts: img.counts,
      photonRing: img.photonRing,
    }, img.buffer);
  };

  bridge.gpu = GPU;
})();
