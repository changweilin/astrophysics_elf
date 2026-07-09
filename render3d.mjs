/* WebGL 3D renderer for the Kerr-Newman Lab browser demo (window.KNRender3D).
 *
 * Replaces the Canvas2D top-down projection (render.js) with a true 3D scene:
 * the simulation's equatorial plane is the z=0 plane, the spin axis is +z, and
 * every phenomenon is remodelled from its physical shape rather than a flat
 * projection —
 *   · Kerr-Newman horizon: oblate spheroid (equatorial radius √(r₊²+a²), polar r₊)
 *   · ergosphere: the true r_E(θ) = M + √(M²−Q²−a²cos²θ) shell of revolution
 *   · accretion disc: particles get a flared Gaussian scale height h ∝ r and
 *     Doppler beaming that only appears when the camera tilts off the pole
 *   · Blandford-Znajek jets: bipolar cones along ±z with helical field lines
 *   · frame dragging: Lense-Thirring streamline ticks on nested shells, not
 *     just an equatorial swirl
 *   · gravitational waves: an embedding-diagram sheet (Flamm-style funnel)
 *     whose surface really ripples with the outgoing quadrupole strain
 *   · spacetime interaction (placement ghost / aim / predicted trajectories)
 *     drawn as in-plane 3D objects so they stay correct from any camera angle.
 *
 * The default camera is the exact top-down frame of the 2D renderer (screen
 * x = world +x, screen y = world +y, sim.view.{ox,oy,scale} preserved), so the
 * app's pointer interaction keeps working; right-drag orbits to any angle and
 * worldToScreen / screenToWorld are re-derived from the live camera (sim.js
 * dispatches its coordinate transforms here while sim.view.mode3d is set).
 *
 * Muted visuals per the project rule: clearly visible, gentle, never neon.
 * Additive is a stable way to blend the particle systems on the near-black
 * background; every colour is premultiplied by its (already soft) alpha.
 */

import * as THREE from './vendor/three.module.js';

(function () {
  const FOV = 40;
  const FOV_TAN = Math.tan((FOV * Math.PI / 180) / 2);

  // ── CSS colour parsing (keeps the exact oklch palette of the 2D renderer) ──
  const _colorCanvas = document.createElement('canvas');
  _colorCanvas.width = _colorCanvas.height = 1;
  const _colorCtx = _colorCanvas.getContext('2d', { willReadFrequently: true });
  const _colorCache = new Map();
  // css string -> [r,g,b,a] in sRGB 0..1
  function cssRGB(css) {
    let v = _colorCache.get(css);
    if (v) return v;
    _colorCtx.clearRect(0, 0, 1, 1);
    _colorCtx.fillStyle = '#000';
    _colorCtx.fillStyle = css;
    _colorCtx.fillRect(0, 0, 1, 1);
    const d = _colorCtx.getImageData(0, 0, 1, 1).data;
    v = [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
    if (_colorCache.size > 4000) _colorCache.clear();
    _colorCache.set(css, v);
    return v;
  }
  const _c3 = new THREE.Color();
  function threeColor(css) {
    const v = cssRGB(css);
    return new THREE.Color().setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
  }
  // Blackbody colour via the shared physics helper (cached per ~100 K step).
  function tempRGB(T, g) {
    const phys = window.KNphysics;
    const key = `T${Math.round((T || 6000) / 100)}g${(g || 0).toFixed(2)}`;
    let v = _colorCache.get(key);
    if (v) return v;
    v = cssRGB(phys.tempToColor(T || 6000, 1, g));
    _colorCache.set(key, v);
    return v;
  }

  // Disc temperature ramp — 64-step LUT of the 2D formula
  // oklch(0.55+0.4t, 0.12+0.08t, 30+200t).
  let _discLUT = null;
  function discLUT() {
    if (_discLUT) return _discLUT;
    _discLUT = [];
    for (let i = 0; i < 64; i++) {
      const t = i / 63;
      _discLUT.push(cssRGB(`oklch(${0.55 + t * 0.4} ${0.12 + t * 0.08} ${30 + t * 200})`));
    }
    return _discLUT;
  }

  // ── Textures ───────────────────────────────────────────────────────────────
  let _glowTex = null;
  function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
  }

  const _labelTexCache = new Map();
  function labelTexture(text, css, px, bold) {
    const key = `${text}|${css}|${px}|${bold ? 1 : 0}`;
    let e = _labelTexCache.get(key);
    if (e) return e;
    const font = `${bold ? 'bold ' : ''}${px * 2}px "JetBrains Mono", monospace`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = font;
    const tw = Math.ceil(g.measureText(text).width) + 8;
    const th = px * 2 + 10;
    c.width = tw; c.height = th;
    g.font = font;
    g.textBaseline = 'middle';
    g.fillStyle = css;
    g.fillText(text, 4, th / 2);
    const tex = new THREE.CanvasTexture(c);
    e = { tex, w: tw, h: th };
    if (_labelTexCache.size > 300) {
      for (const it of _labelTexCache.values()) it.tex.dispose();
      _labelTexCache.clear();
    }
    _labelTexCache.set(key, e);
    return e;
  }

  // ── Pools ──────────────────────────────────────────────────────────────────
  // Additive points with premultiplied per-point colour (alpha baked into RGB).
  class PointsPool {
    constructor(scene, cap, sizePx, order) {
      this.cap = cap;
      this.geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(cap * 3);
      this.col = new Float32Array(cap * 3);
      this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      this.mat = new THREE.PointsMaterial({
        size: sizePx, sizeAttenuation: false, map: glowTexture(),
        vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.obj = new THREE.Points(this.geo, this.mat);
      this.obj.frustumCulled = false;
      this.obj.renderOrder = order || 10;
      this.n = 0;
      scene.add(this.obj);
    }
    begin() { this.n = 0; }
    add(x, y, z, rgb, a) {
      if (this.n >= this.cap) return;
      const i = this.n * 3;
      this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z;
      _c3.setRGB(rgb[0] * a, rgb[1] * a, rgb[2] * a, THREE.SRGBColorSpace);
      this.col[i] = _c3.r; this.col[i + 1] = _c3.g; this.col[i + 2] = _c3.b;
      this.n++;
    }
    end() {
      this.geo.setDrawRange(0, this.n);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }

  // Additive line segments with premultiplied per-vertex colour.
  class LinePool {
    constructor(scene, cap, order) {
      this.cap = cap;                 // max segments
      this.geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(cap * 6);
      this.col = new Float32Array(cap * 6);
      this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      this.mat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.obj = new THREE.LineSegments(this.geo, this.mat);
      this.obj.frustumCulled = false;
      this.obj.renderOrder = order || 5;
      this.n = 0;
      scene.add(this.obj);
    }
    begin() { this.n = 0; }
    seg(x1, y1, z1, x2, y2, z2, rgb, a) {
      if (this.n >= this.cap) return;
      const i = this.n * 6;
      this.pos[i] = x1; this.pos[i + 1] = y1; this.pos[i + 2] = z1;
      this.pos[i + 3] = x2; this.pos[i + 4] = y2; this.pos[i + 5] = z2;
      _c3.setRGB(rgb[0] * a, rgb[1] * a, rgb[2] * a, THREE.SRGBColorSpace);
      this.col[i] = _c3.r; this.col[i + 1] = _c3.g; this.col[i + 2] = _c3.b;
      this.col[i + 3] = _c3.r; this.col[i + 4] = _c3.g; this.col[i + 5] = _c3.b;
      this.n++;
    }
    // flat [x,y,...] world-plane polyline at height z; dash: draw every other segment
    polyline2(pts, z, rgb, a, dash) {
      for (let i = 2; i < pts.length; i += 2) {
        if (dash && ((i >> 1) % 2 === 0)) continue;
        this.seg(pts[i - 2], pts[i - 1], z, pts[i], pts[i + 1], z, rgb, a);
      }
    }
    circle(cx, cy, cz, r, rgb, a, dash, nSeg) {
      const N = nSeg || 72;
      for (let k = 0; k < N; k++) {
        if (dash && (k % 2 === 0)) continue;
        const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
        this.seg(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz,
                 cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz, rgb, a);
      }
    }
    end() {
      this.geo.setDrawRange(0, this.n * 2);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }

  // Billboard glow sprites (halos, flares, flashes). Size in world units.
  class SpritePool {
    constructor(scene, cap, order) {
      this.items = [];
      this.n = 0;
      this.scene = scene;
      this.cap = cap;
      this.order = order || 20;
    }
    begin() { this.n = 0; }
    add(x, y, z, size, rgb, a) {
      if (this.n >= this.cap) return;
      let s = this.items[this.n];
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(), transparent: true, depthWrite: false, depthTest: false,
          blending: THREE.AdditiveBlending,
        }));
        s.renderOrder = this.order;
        this.items.push(s);
        this.scene.add(s);
      }
      s.visible = true;
      s.position.set(x, y, z);
      s.scale.set(size, size, 1);
      s.material.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      s.material.opacity = Math.min(1, a);
      this.n++;
    }
    end() {
      for (let i = this.n; i < this.items.length; i++) this.items[i].visible = false;
    }
  }

  // Text label sprites, screen-constant size, cached canvas textures.
  class LabelPool {
    constructor(scene, cap) {
      this.items = [];
      this.n = 0;
      this.scene = scene;
      this.cap = cap;
    }
    begin(camera, viewH) { this.n = 0; this.camera = camera; this.viewH = viewH; }
    // offsetPx: [dx,dy] screen-space pixel offset from the anchor point
    add(text, css, px, x, y, z, offsetPx, bold) {
      if (this.n >= this.cap || !text) return;
      let s = this.items[this.n];
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({
          transparent: true, depthWrite: false, depthTest: false,
        }));
        s.renderOrder = 999;
        this.items.push(s);
        this.scene.add(s);
      }
      const e = labelTexture(text, css, px, bold);
      s.material.map = e.tex;
      s.material.needsUpdate = true;
      s.visible = true;
      // world size for a screen-constant label at this distance
      const dist = this.camera.position.distanceTo(new THREE.Vector3(x, y, z));
      const wpp = (2 * dist * FOV_TAN) / this.viewH;      // world units per px
      const wpx = e.w / 2, hpx = e.h / 2;                 // canvas is 2x supersampled
      s.scale.set(wpx * wpp, hpx * wpp, 1);
      // pixel offset applied in camera space (right/up axes)
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      const ox = (offsetPx ? offsetPx[0] : 0) + wpx / 2;  // anchor: left edge at point
      const oy = (offsetPx ? offsetPx[1] : 0);
      s.position.set(x, y, z)
        .addScaledVector(right, ox * wpp)
        .addScaledVector(up, -oy * wpp);
      this.n++;
    }
    end() {
      for (let i = this.n; i < this.items.length; i++) this.items[i].visible = false;
    }
  }

  // ── Small deterministic hash (matches render.js) ───────────────────────────
  function rand(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ── Camera rig ─────────────────────────────────────────────────────────────
  // tilt: 0 = straight down (matches the 2D frame exactly); yaw: azimuth.
  function applyCamera(camera, sim, w, h, tilt, yaw) {
    const s = Math.max(1e-6, sim.view.scale);
    const tx = -sim.view.ox, ty = -sim.view.oy;          // world point at screen centre
    const D = h / (2 * s * FOV_TAN);                     // px/M preserved at the target
    const st = Math.sin(tilt), ct = Math.cos(tilt);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const ox = st * sy, oy = st * cy, oz = ct;           // target -> camera direction
    camera.position.set(tx + ox * D, ty + oy * D, oz * D);
    camera.fov = FOV;
    camera.aspect = w / Math.max(1, h);
    camera.near = Math.max(0.05, D * 0.01);
    camera.far = D * 30 + 2000;
    // screen-right stays +x at yaw 0; up = forward × right so top-down matches 2D
    const f = new THREE.Vector3(-ox, -oy, -oz);
    const r = new THREE.Vector3(cy, -sy, 0);
    camera.up.copy(f.clone().cross(r));
    camera.lookAt(tx, ty, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Main view
  // ═══════════════════════════════════════════════════════════════════════════
  const R3D = {
    ready: true,
    active: false,
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    sim: null,
    view: { tilt: 0, yaw: 0, tiltT: 0, yawT: 0 },
    _w: 2, _h: 2,
  };

  R3D.attach = function (canvas) {
    if (this.renderer && this.canvas === canvas) return true;
    this.detach();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (err) {
      console.warn('KNRender3D: WebGL unavailable', err);
      this.renderer = null;
      return false;
    }
    this.canvas = canvas;
    this.renderer.setClearColor(threeColor('oklch(0.10 0.014 250)'), 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 4000);
    buildStatic(this);
    return true;
  };

  R3D.detach = function () {
    this.active = false;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.scene = null;
    this.canvas = null;
    this._built = false;
  };

  // orbit control (called by the app on right-drag)
  R3D.orbitBy = function (dxPx, dyPx) {
    this.view.yawT += dxPx * 0.006;
    this.view.tiltT = Math.max(0, Math.min(1.42, this.view.tiltT + dyPx * 0.005));
  };
  R3D.resetView = function () { this.view.tiltT = 0; this.view.yawT = 0; };
  R3D.isTilted = function () { return this.view.tiltT > 0.02 || Math.abs(this.view.yawT) > 0.02; };

  // ── Coordinate transforms (dispatched from sim.js while mode3d is on) ──────
  const _pv = new THREE.Vector3();
  const _w2s = [0, 0];
  R3D.worldToScreen = function (sim, w, h, x, y) {
    const r = this.worldToScreenInto(sim, w, h, x, y);
    return [r[0], r[1]];
  };
  R3D.worldToScreenInto = function (sim, w, h, x, y) {
    _pv.set(x, y, 0).project(this.camera);
    _w2s[0] = (_pv.x + 1) / 2 * w;
    _w2s[1] = (1 - _pv.y) / 2 * h;
    return _w2s;
  };
  R3D.screenToWorld = function (sim, w, h, sx, sy) {
    const cam = this.camera;
    _pv.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1, 0.5).unproject(cam);
    const dx = _pv.x - cam.position.x, dy = _pv.y - cam.position.y, dz = _pv.z - cam.position.z;
    if (Math.abs(dz) < 1e-9) return [cam.position.x, cam.position.y];
    const t = -cam.position.z / dz;
    return [cam.position.x + dx * t, cam.position.y + dy * t];
  };

  // ── Static scene pieces ─────────────────────────────────────────────────────
  function buildStatic(R) {
    const S = R.scene;
    R.pools = {
      line: new LinePool(S, 42000, 4),
      disc: new PointsPool(S, 2200, 4.0, 12),
      cloud: new PointsPool(S, 4500, 3.2, 11),
      fx: new PointsPool(S, 4500, 9.0, 13),
      sprite: new SpritePool(S, 110, 20),
      label: new LabelPool(S, 72),
    };
    // Starfield — a fixed far dome of faint stars (rebuilt never; scaled to far).
    const starGeo = new THREE.BufferGeometry();
    const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rand(i + 0.7) * 2 - 1, ph = rand(i + 9.1) * Math.PI * 2;
      const rr = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(ph) * rr; pos[i * 3 + 1] = Math.sin(ph) * rr; pos[i * 3 + 2] = u;
      const b = 0.25 + 0.5 * rand(i + 3.3);
      const tint = rand(i + 5.5);
      col[i * 3] = b * (0.9 + 0.1 * tint); col[i * 3 + 1] = b * 0.95; col[i * 3 + 2] = b * (1.05 - 0.1 * tint);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    R.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    R.stars.frustumCulled = false;
    R.stars.renderOrder = 0;
    S.add(R.stars);

    R.slots = {};      // central/companion cached meshes
    R.bodyMeshes = new Map();
    R.jetSlots = {};
    R.structSlots = {};
    R._built = true;
  }

  // ── Central compact objects (single + binary) ──────────────────────────────
  // Cached per slot; geometry rebuilt only when the driving params change.
  function slotFor(R, key) {
    let sl = R.slots[key];
    if (!sl) {
      sl = R.slots[key] = { group: new THREE.Group(), key: '' };
      R.scene.add(sl.group);
    }
    sl.used = true;
    return sl;
  }

  function rebuildBH(sl, M, Q, a, accent) {
    const phys = window.KNphysics;
    const { rplus, naked } = phys.horizons(M, Q, a);
    sl.group.clear();
    sl.naked = naked;
    sl.rplus = rplus;
    if (naked || !(rplus > 0)) return;
    // Horizon — Kerr-Schild embedding: equatorial radius √(r₊²+a²), polar r₊.
    const req = Math.sqrt(rplus * rplus + a * a);
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x020204 }));
    mesh.scale.set(req, req, rplus);
    mesh.renderOrder = 2;
    sl.group.add(mesh);
    // Equatorial horizon rim (the 2D renderer's amber circle).
    const rim = new THREE.LineLoop(circleGeo(req, 96), new THREE.LineBasicMaterial({
      color: threeColor(accent || 'oklch(0.78 0.16 75)'), transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    rim.renderOrder = 6;
    sl.group.add(rim);
    // Inner horizon r₋ (faint equatorial ring).
    const rmin = M - Math.sqrt(Math.max(0, M * M - a * a - Q * Q));
    if (rmin > 0.05) {
      const inner = new THREE.LineLoop(circleGeo(rmin, 64), new THREE.LineBasicMaterial({
        color: threeColor('oklch(0.50 0.10 75)'), transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      inner.renderOrder = 6;
      sl.group.add(inner);
    }
  }

  function rebuildErgo(sl, M, Q, a) {
    const phys = window.KNphysics;
    // Shell of revolution r_E(θ): flat at the poles (r_E→r₊), widest at the equator.
    const pts = [];
    const NP = 40;
    for (let i = 0; i <= NP; i++) {
      const th = (i / NP) * Math.PI;
      const cosT = Math.cos(th);
      const rE = M + Math.sqrt(Math.max(0, M * M - Q * Q - a * a * cosT * cosT));
      pts.push(new THREE.Vector2(Math.max(1e-3, rE * Math.sin(th)), rE * cosT));
    }
    const geo = new THREE.LatheGeometry(pts, 56);
    const mat = new THREE.MeshBasicMaterial({
      color: threeColor('oklch(0.60 0.11 210)'), transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;   // lathe axis (y) -> spin axis (z)
    mesh.renderOrder = 3;
    const eq = phys.ergosphereEq(M, Q);
    const rim = new THREE.LineLoop(circleGeo(eq, 96), new THREE.LineBasicMaterial({
      color: threeColor('oklch(0.65 0.12 210)'), transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    rim.renderOrder = 6;
    const g = new THREE.Group();
    g.add(mesh); g.add(rim);
    return g;
  }

  function rebuildStar(sl, Rs, T, g) {
    sl.group.clear();
    const col = tempRGB(T, g);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace),
    }));
    mesh.scale.setScalar(Math.max(0.05, Rs));
    mesh.renderOrder = 2;
    sl.group.add(mesh);
    // Differential-rotation latitude bands (replaces the 2D "rotation hatching").
    const bandMat = new THREE.LineBasicMaterial({
      color: new THREE.Color().setRGB(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55, THREE.SRGBColorSpace),
      transparent: true, opacity: 0.5, depthWrite: false,
    });
    sl.bands = new THREE.Group();
    for (const lat of [-0.55, 0, 0.55]) {
      const rr = Math.cos(lat) * Rs * 1.002, zz = Math.sin(lat) * Rs;
      const ring = new THREE.Line(arcGeo(rr, 0.0, Math.PI * 1.2, 40), bandMat);
      ring.position.z = zz;
      sl.bands.add(ring);
    }
    sl.bands.renderOrder = 3;
    sl.group.add(sl.bands);
  }

  function circleGeo(r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }
  function arcGeo(r, a0, a1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  // One central object (BH or star) at a world position; slotKey caches meshes.
  function updateCentral(R, sim, slotKey, x, y, opts) {
    const phys = window.KNphysics;
    const { M, Q, a, type, Rs, T, L, accent, showErgoShell, spinAxis } = opts;
    const sl = slotFor(R, slotKey);
    const isBH = (type || 'bh') === 'bh';
    const key = `${isBH ? 'bh' : type}|${M.toFixed(3)}|${Q.toFixed(3)}|${a.toFixed(3)}|${(Rs || 0).toFixed(2)}|${Math.round((T || 0) / 50)}|${(L || 0).toFixed(2)}|${showErgoShell ? 1 : 0}`;
    if (sl.key !== key) {
      sl.key = key;
      sl.ergo = null;
      if (isBH) {
        rebuildBH(sl, M, Q, a, accent);
        if (showErgoShell && !sl.naked) {
          const rErg = phys.ergosphereEq(M, Q);
          if (rErg && rErg > sl.rplus && Math.abs(a) > 0.01) {
            sl.ergo = rebuildErgo(sl, M, Q, a);
            sl.group.add(sl.ergo);
          }
        }
      } else {
        const g = phys.stellarGlow(L);
        rebuildStar(sl, Rs || 3, T || 1e6, g);
        sl.naked = false;
      }
      sl.isBH = isBH;
    }
    sl.group.position.set(x, y, 0);
    // Naked singularity — wild flicker (sprite only, no horizon to draw).
    if (isBH && sl.naked) {
      const flick = 0.5 + 0.5 * Math.sin(sim.t * 13);
      R.pools.sprite.add(x, y, 0, pxToWorld(R, 28 + flick * 12, x, y), cssRGB('oklch(0.72 0.20 28)'), 0.35 + flick * 0.35);
    }
    // Star halo + luminosity glow (billboard, tracks the 2D halo radius in px).
    if (!isBH) {
      const g = phys.stellarGlow(L);
      const s = sim.view.scale;
      const haloPx = Math.max((Rs || 3) * s * (1.4 + 0.8 * g), (Rs || 3) * s + 12 + 24 * g);
      R.pools.sprite.add(x, y, 0, pxToWorld(R, haloPx * 2, x, y), tempRGB(T, g), 0.16 + 0.3 * g);
      if (sl.bands) sl.bands.rotation.z = sim.t * 0.4 * Math.sign(a || 1);
    }
    // Spin axis — 3D-native indicator: dashed line along ±z with sense arrows.
    if (Math.abs(a) > 0.02 && (spinAxis !== false) && !sl.naked) {
      const base = sl.isBH ? Math.sqrt((sl.rplus || 1) ** 2 + a * a) : (Rs || 3);
      const L2 = base * 2.6;
      const rgb = cssRGB('oklch(0.78 0.13 210)');
      for (const dir of [1, -1]) {
        for (let k = 0; k < 5; k++) {
          const z0 = base * 1.05 + (k / 5) * (L2 - base * 1.05);
          const z1 = z0 + (L2 - base * 1.05) / 10;
          R.pools.line.seg(x, y, dir * z0, x, y, dir * z1, rgb, 0.5);
        }
        // rotation-sense arc at the axis tip
        const tipZ = dir * L2;
        const rA = base * 0.5;
        const sgn = Math.sign(a);
        const ph0 = sim.t * 0.8 * sgn;
        for (let k = 0; k < 10; k++) {
          const a0 = ph0 + (k / 10) * Math.PI * 1.2 * sgn;
          const a1 = ph0 + ((k + 1) / 10) * Math.PI * 1.2 * sgn;
          R.pools.line.seg(x + Math.cos(a0) * rA, y + Math.sin(a0) * rA, tipZ,
                           x + Math.cos(a1) * rA, y + Math.sin(a1) * rA, tipZ, rgb, 0.55);
        }
      }
    }
  }

  // world size for a screen size in px at a world position (screen-constant UI)
  function pxToWorld(R, px, x, y, z) {
    const dist = R.camera.position.distanceTo(_pv.set(x, y, z || 0));
    return px * (2 * dist * FOV_TAN) / R._h;
  }

  // ── Frame dragging (Lense-Thirring) — nested shells of streamline ticks ────
  function drawDragField(R, sim, cx, cy, spin, baseR) {
    if (Math.abs(spin) <= 0.02) return;
    const sgn = Math.sign(spin);
    const rgb = cssRGB('oklch(0.55 0.10 210)');
    // three latitude shells: equatorial + two mid-latitude (falls off with height)
    for (let shell = 0; shell < 3; shell++) {
      const lat = [0, 0.5, -0.5][shell];
      const alphaShell = shell === 0 ? 0.35 : 0.20;
      for (let i = 1; i <= 4; i++) {
        const rSph = baseR + i * 2.2;
        const r = rSph * Math.cos(lat);
        const z = rSph * Math.sin(lat);
        const N = 22;
        const phase = (sim.t * 0.05 * sgn) / i;
        for (let k = 0; k < N; k++) {
          const ang = (k / N) * Math.PI * 2 + phase;
          const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
          const tx = -Math.sin(ang) * sgn, ty = Math.cos(ang) * sgn;
          const len = 0.28 * r / (baseR + 2.2);
          R.pools.line.seg(x, y, z, x + tx * len * 2.2, y + ty * len * 2.2, z, rgb, alphaShell / Math.sqrt(i));
        }
      }
    }
  }

  // ── Rings (photon sphere / ISCO) + polar grid ───────────────────────────────
  function drawRingsAndGrid(R, sim, w, h) {
    const phys = window.KNphysics;
    const { M, Q, a } = sim.params;
    const isBH = (sim.params.type || 'bh') === 'bh';
    const binOn = !!(sim.binary && sim.binary.enabled);
    const line = R.pools.line;
    const gridRGB = cssRGB('oklch(0.30 0.022 255)');
    // distance rings 5..30 M
    for (const r of [5, 10, 15, 20, 25, 30]) line.circle(0, 0, 0, r, gridRGB, 0.30, true, 96);
    if (sim.flags.showGrid) {
      // 1M Cartesian lattice on the equatorial plane, clipped to ±34 M
      const rgb = cssRGB('oklch(0.24 0.022 255)');
      const EXT = 34;
      const step = Math.max(1, Math.round(40 / sim.view.scale)); // thin out when zoomed far
      for (let x = -EXT; x <= EXT; x += step) {
        line.seg(x, -EXT, 0, x, EXT, 0, rgb, 0.35);
        line.seg(-EXT, x, 0, EXT, x, 0, rgb, 0.35);
      }
    }
    if (isBH && !binOn) {
      const rPh = phys.photonSphereEq(M, a, Q);
      if (sim.flags.showPhoton && rPh > 0) {
        line.circle(0, 0, 0, rPh, cssRGB('oklch(0.90 0.10 60)'), 0.5, true, 120);
        R.pools.label.add('r_ph', 'oklch(0.90 0.10 60 / 0.85)', 9, rPh * 0.71, -rPh * 0.71, 0, [4, -4]);
      }
      const rIsco = phys.isco(M, a, Q);
      if (sim.flags.showISCO && rIsco > 0) {
        line.circle(0, 0, 0, rIsco, cssRGB('oklch(0.62 0.12 75)'), 0.65, true, 120);
        R.pools.label.add('ISCO', 'oklch(0.70 0.12 75 / 0.9)', 9, rIsco * 0.71, -rIsco * 0.71, 0, [4, -4]);
      }
      const { rplus, naked } = phys.horizons(M, Q, a);
      const rErg = phys.ergosphereEq(M, Q);
      if (sim.flags.showErgo && !naked && rErg && rErg > rplus) {
        R.pools.label.add(tr('ergosphere', '動圈'), 'oklch(0.65 0.12 210 / 0.85)', 9, rErg * 0.71, rErg * 0.71, 0, [4, 10]);
      }
    }
  }

  // ── Accretion disc (3D: flared scale height + Doppler beaming) ─────────────
  function drawDisc(R, sim, disc, host) {
    if (!disc) return;
    const pool = R.pools.disc;
    const LUT = discLUT();
    const cam = R.camera;
    // line-of-sight unit vector (from scene towards the camera) — uniform approx
    const losX = cam.position.x + sim.view.ox, losY = cam.position.y + sim.view.oy, losZ = cam.position.z;
    const losL = Math.hypot(losX, losY, losZ) || 1;
    const lx = losX / losL, ly = losY / losL;
    const sinTilt = Math.hypot(lx, ly);   // 0 when top-down -> no beaming asymmetry
    if (disc.enabled) {
      for (const p of disc.particles) {
        // flared Gaussian scale height: h(r) ∝ r, frozen per particle at birth
        if (p._z0 === undefined) {
          p._z0 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.66; // ~N(0,1)-ish
        }
        const dx = p.x - (host ? host.cx : 0), dy = p.y - (host ? host.cy : 0);
        const r = Math.hypot(dx, dy);
        const z = p._z0 * 0.055 * r;
        const t = p.t;
        const col = LUT[Math.min(63, Math.max(0, Math.round(t * 63)))];
        // relativistic beaming ~ (1 + 3 β cosθ): approaching side brightens as
        // the camera tilts toward the plane; exactly symmetric when top-down.
        let boost = 1;
        if (sinTilt > 0.03) {
          const beta = Math.min(0.7, Math.hypot(p.vx, p.vy));
          const cosTh = (p.vx * lx + p.vy * ly);
          boost = Math.max(0.35, Math.min(2.3, 1 + 2.6 * beta * cosTh));
        }
        pool.add(p.x, p.y, z, col, (0.34 + t * 0.3) * boost);
      }
    }
    // Reconnection flares — magenta magnetic-energy bursts above/below the sheet.
    for (const f of disc.reconnects) {
      const t = f.age / f.life;
      const alpha = (1 - t);
      const sz = f.size * (1 + t * 7);
      R.pools.sprite.add(f.x, f.y, 0.15, sz * 1.6, cssRGB('oklch(0.95 0.17 320)'), alpha * 0.5);
      R.pools.sprite.add(f.x, f.y, 0.15, sz * 0.5, cssRGB('oklch(0.97 0.18 320)'), alpha * 0.85);
    }
  }

  // ── Blandford-Znajek jets: bipolar cones + helical field lines ──────────────
  function jetSlot(R, key) {
    let js = R.jetSlots[key];
    if (!js) {
      js = R.jetSlots[key] = { group: new THREE.Group(), key: '' };
      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 0.25, 1, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: threeColor('oklch(0.80 0.17 285)'), transparent: true, opacity: 0.10,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
      const spine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.10, 1, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: threeColor('oklch(0.97 0.12 290)'), transparent: true, opacity: 0.22,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
      js.up = new THREE.Group(); js.dn = new THREE.Group();
      for (const [g, dir] of [[js.up, 1], [js.dn, -1]]) {
        const o = outer.clone(), s = spine.clone();
        o.rotation.x = dir > 0 ? Math.PI / 2 : -Math.PI / 2;   // cylinder y -> ±z
        s.rotation.x = o.rotation.x;
        g.add(o); g.add(s);
        g.userData.outer = o; g.userData.spine = s;
        js.group.add(g);
      }
      js.group.renderOrder = 8;
      R.scene.add(js.group);
    }
    js.used = true;
    return js;
  }

  function drawJet(R, sim, key, x, y, m, spinSign) {
    const js = jetSlot(R, key);
    const on = m && m.P > 0.3;
    js.group.visible = !!on;
    js.group.position.set(x, y, 0);
    if (!on) return;
    const lum = Math.min(1, m.P / 30);
    const opening = m.theta * Math.PI / 180;
    const len = 6 + 10 * lum;                        // world units (M)
    const baseR = 0.5 + lum * 0.8;
    const tipR = Math.max(baseR * 1.4, baseR + Math.tan(opening) * len * 1.2);
    const flick = 0.85 + 0.15 * Math.sin(sim.t * 9);
    for (const [g, dir] of [[js.up, 1], [js.dn, -1]]) {
      g.position.z = dir * (len / 2 + 0.5);
      // CylinderGeometry(top=1, bottom=0.25): top radius = far end
      g.userData.outer.scale.set(tipR, len, tipR);
      g.userData.outer.material.opacity = (0.05 + lum * 0.07) * flick;
      g.userData.spine.scale.set(tipR, len, tipR);
      g.userData.spine.material.opacity = (0.08 + lum * 0.14) * flick;
    }
    // Helical field lines — the wound-up B-field that collimates the jet.
    const rgb = cssRGB('oklch(0.75 0.15 250)');
    const turns = 4;
    const NHel = 46;
    for (const dir of [1, -1]) {
      for (const ph0 of [0, Math.PI]) {
        let px0 = x, py0 = y, pz0 = 0.5 * dir;
        for (let i = 1; i <= NHel; i++) {
          const f = i / NHel;
          const zz = dir * (0.5 + f * len);
          const rr = baseR * 0.4 + (tipR * 0.75 - baseR * 0.4) * f;
          const ang = ph0 + spinSign * (f * turns * Math.PI * 2 - sim.t * 2.2);
          const px1 = x + Math.cos(ang) * rr, py1 = y + Math.sin(ang) * rr;
          R.pools.line.seg(px0, py0, pz0, px1, py1, zz, rgb, 0.28 * lum * (1 - f * 0.6));
          px0 = px1; py0 = py1; pz0 = zz;
        }
      }
      // Mach knots — bright internal-shock bands when the flow is fast.
      if (m.gamma > 3) {
        const knots = Math.min(5, Math.floor(m.gamma / 4));
        for (let i = 1; i <= knots; i++) {
          const f = i / (knots + 1);
          const rr = (baseR + (tipR - baseR) * f) * 0.5;
          R.pools.line.circle(x, y, dir * (0.5 + f * len), rr, cssRGB('#ffffff'), 0.22 * lum * flick, false, 26);
        }
      }
    }
    // Central engine glow + readout (the 2D renderJetCenter).
    R.pools.sprite.add(x, y, 0, pxToWorld(R, (5 + lum * 18) * 3, x, y), cssRGB('oklch(0.92 0.17 290)'), lum * flick * 0.22);
    if (sim.flags.showLabels) {
      R.pools.label.add(trp('JET ⊙ {p}', { p: m.P.toFixed(1) }), 'oklch(0.92 0.05 290 / 0.8)', 9, x, y, 0, [14, -6]);
      R.pools.label.add(`Γ ≈ ${m.gamma.toFixed(1)}`, 'oklch(0.72 0.10 290 / 0.7)', 9, x, y, 0, [14, 6]);
    }
  }

  // ── Spacetime sheet (gravity funnel + GW quadrupole ripples) ───────────────
  // The 2D renderer could only *shade* the well and shear the lattice; in 3D the
  // embedding diagram is real: the sheet sags into each mass's funnel and the
  // outgoing strain crests physically ripple its surface.
  function drawGWSheet(R, sim, w, h) {
    const phys = window.KNphysics;
    const bin = sim.binary;
    const masses = [];
    if (bin && bin.enabled) {
      masses.push({ x: bin.x1, y: bin.y1, m: sim.params.M, a: sim.params.a || 0 });
      masses.push({ x: bin.x2, y: bin.y2, m: bin.M2, a: bin.a2 || 0 });
    } else {
      masses.push({ x: 0, y: 0, m: sim.params.M, a: sim.params.a || 0 });
    }
    let wave = false, omegaGW = 0, hAmp = 0, waveCx = 0, waveCy = 0;
    if (bin && bin.enabled) {
      const pet = bin.lastPeters;
      omegaGW = Math.max(0.15, pet.omega * 2);
      hAmp = Math.max(0.12, Math.min(1.2, pet.Mc * 0.9 / Math.max(0.5, bin.d)));
      waveCx = bin.cx; waveCy = bin.cy; wave = true;
    } else {
      const { rplus } = phys.horizons(sim.params.M, sim.params.Q, sim.params.a);
      let best = null, bestScore = 0;
      for (const b of sim.bodies) {
        if (b.state !== 'orbit' || b._cloud) continue;
        const r = Math.hypot(b.x, b.y);
        if (r < (rplus || 0.5) || r > 40) continue;
        const v = Math.hypot(b.vx, b.vy);
        const score = v / Math.max(0.5, r);
        if (score > bestScore) { bestScore = score; best = b; }
      }
      if (best) {
        const r = Math.hypot(best.x, best.y);
        const v = Math.hypot(best.vx, best.vy);
        omegaGW = Math.max(0.15, (v / Math.max(1, r)) * 2);
        hAmp = Math.min(1, 0.3 + 3.5 / Math.max(1.5, r));
        wave = true;
      }
    }
    const vwave = 4;
    const kGW = wave ? Math.max(0.45, Math.min(1.6, omegaGW * 3.3)) : 0;
    const omegaVis = kGW * vwave;
    const t = sim.t;

    // grid extent follows the visible frame (world units), step ≈ 26 px
    const s = sim.view.scale;
    const cx = -sim.view.ox, cy = -sim.view.oy;
    const stepW = Math.max(0.4, 26 / s);
    const halfX = Math.min(90, (w / s) * 0.62), halfY = Math.min(90, (h / s) * 0.62);
    const nx = Math.min(72, Math.ceil((halfX * 2) / stepW) + 1);
    const ny = Math.min(72, Math.ceil((halfY * 2) / stepW) + 1);

    if (!R._gwBuf || R._gwBuf.length < nx * ny * 4) R._gwBuf = new Float32Array(72 * 72 * 4);
    const buf = R._gwBuf;

    const zGain = 1.6;      // funnel depth gain (embedding, qualitative)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const wx = cx - halfX + (i / (nx - 1)) * halfX * 2;
        const wy = cy - halfY + (j / (ny - 1)) * halfY * 2;
        let dispx = 0, dispy = 0, well = 0;
        for (const src of masses) {
          const ex = wx - src.x, ey = wy - src.y;
          const r = Math.hypot(ex, ey);
          const ux = ex / (r + 1e-6), uy = ey / (r + 1e-6);
          const rs = Math.max(0.6, 2 * src.m);
          const rr = Math.max(r, rs * 0.55);
          let pull = 2.8 * src.m / rr;
          const cap = r * 0.78;
          if (pull > cap) pull = cap;
          dispx -= ux * pull; dispy -= uy * pull;
          if (src.a) {
            let drag = 3.0 * src.m * Math.abs(src.a) / (rr * rr);
            const dcap = r * 0.45;
            if (drag > dcap) drag = dcap;
            const sgn = Math.sign(src.a);
            dispx += -uy * drag * sgn; dispy += ux * drag * sgn;
          }
          well += src.m / (r + 0.6);
        }
        let hgt = 0;
        if (wave) {
          const ex = wx - waveCx, ey = wy - waveCy;
          const r = Math.hypot(ex, ey) + 0.6;
          const th = Math.atan2(ey, ex);
          const phase = 2 * th + kGW * r - omegaVis * t;
          const env = hAmp / Math.sqrt(r) * Math.exp(-r / 90);
          hgt = env * Math.cos(phase);
        }
        const k4 = (j * nx + i) * 4;
        buf[k4] = wx + dispx;
        buf[k4 + 1] = wy + dispy;
        buf[k4 + 2] = -Math.min(3.2, well * zGain) + hgt * 4.5;   // funnel + ripple
        buf[k4 + 3] = Math.min(1, well * 0.55) + Math.max(-1, Math.min(1, hgt * 4)) * 0.5;
      }
    }
    // shade: deep well = dim violet; GW crest brightens, trough dims
    const base = cssRGB('oklch(0.52 0.06 288)');
    const line = R.pools.line;
    const zOff = -0.35;   // sheet floats just under the equatorial plane
    const shade = (v) => {
      const a = Math.max(0.05, Math.min(0.55, 0.16 + 0.3 * Math.abs(v)));
      return a;
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const k = (j * nx + i) * 4, k2 = k + 4;
        line.seg(buf[k], buf[k + 1], buf[k + 2] + zOff, buf[k2], buf[k2 + 1], buf[k2 + 2] + zOff,
                 base, shade((buf[k + 3] + buf[k2 + 3]) * 0.5));
      }
    }
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny - 1; j++) {
        const k = (j * nx + i) * 4, k2 = ((j + 1) * nx + i) * 4;
        line.seg(buf[k], buf[k + 1], buf[k + 2] + zOff, buf[k2], buf[k2 + 1], buf[k2 + 2] + zOff,
                 base, shade((buf[k + 3] + buf[k2 + 3]) * 0.5));
      }
    }
    // chirp readout (binary) / single-source annotation
    if (bin && bin.enabled) {
      const pet = bin.lastPeters;
      const midX = (bin.x1 + bin.x2) / 2, midY = (bin.y1 + bin.y2) / 2;
      R.pools.label.add(`f_GW ${(pet.omega * 2 / (2 * Math.PI)).toFixed(3)} c/M  h ${Math.min(1.8, pet.Mc * 0.8 / Math.max(0.5, bin.d)).toFixed(2)}`,
        'oklch(0.82 0.12 295 / 0.85)', 9, midX, midY, 0, [12, 30]);
      R.pools.label.add(`Mc = ${(pet.Mc * (sim.params.Msun || 1)).toFixed(2)} M⊙  t_c = ${pet.t_merge < 1e5 ? pet.t_merge.toFixed(1) : '∞'} M`,
        'oklch(0.82 0.12 295 / 0.7)', 9, midX, midY, 0, [12, 42]);
    }
  }

  // ── Bodies, trails, tidal stretch, labels ───────────────────────────────────
  function bodyMesh(R, b) {
    let e = R.bodyMeshes.get(b.id);
    const kind = b.kind || 'planet';
    if (!e || e.kind !== kind) {
      if (e) R.scene.remove(e.mesh);
      let mesh;
      const col = threeColor(window.KNSim.colorOf ? window.KNSim.colorOf(b, 1) : 'oklch(0.8 0.005 80)');
      if (kind === 'ship') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 10), new THREE.MeshBasicMaterial({ color: col }));
      } else if (kind === 'probe') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshBasicMaterial({ color: col }));
      } else {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), new THREE.MeshBasicMaterial({ color: col }));
      }
      mesh.renderOrder = 9;
      R.scene.add(mesh);
      e = { mesh, kind };
      R.bodyMeshes.set(b.id, e);
    }
    e.used = true;
    return e;
  }

  function drawBodies(R, sim) {
    const KN = window.KNSim;
    const s = sim.view.scale;
    const line = R.pools.line;
    const cloud = R.pools.cloud;
    const bri = (frac) => Math.max(0.45, Math.min(1.2, 0.6 + 0.55 * Math.cbrt(Math.max(1e-3, frac || 0))));
    const briCentral = bri(sim._cloudFrac1), briCompanion = bri(sim._cloudFrac2);
    for (const e of R.bodyMeshes.values()) e.used = false;

    for (const b of sim.bodies) {
      if (b._cloud) {
        if (b.state !== 'orbit') continue;
        if (b._stream && b.trail && b.trail.length > 4 && sim.flags.showOrbits) {
          const rgb = b._hvs ? cssRGB('oklch(0.86 0.05 250)') : cssRGB('oklch(0.78 0.05 70)');
          for (let i = 2; i < b.trail.length; i += 2) {
            line.seg(b.trail[i - 2], b.trail[i - 1], 0, b.trail[i], b.trail[i + 1], 0, rgb, 0.25);
          }
        }
        const bf = b._cloudRole === 'companion' ? briCompanion : b._cloudRole === 'central' ? briCentral : 0.85;
        const a = Math.min(1, (b.kind === 'gas' ? 0.45 : 0.7) * bf);
        const young = b._bornAt != null ? Math.max(0, 1 - (sim.t - b._bornAt) / 4) : 0;
        const rgb = young > 0 ? cssRGB(`oklch(${(0.84 + 0.06 * young).toFixed(2)} ${(0.06 + 0.05 * young).toFixed(2)} 235)`)
          : b._hvs ? cssRGB('oklch(0.92 0.05 250)')
          : b._stream ? cssRGB('oklch(0.84 0.07 70)')
          : cssRGB(KN.colorOf(b, 1));
        // member stars get a tiny persistent vertical thickness so a galaxy /
        // cluster reads as a 3D structure, not a paper cut-out
        if (b._z3 === undefined) b._z3 = (rand(b.id * 1.37) - 0.5) * (b._cloudRole ? 1.6 : 0.4);
        cloud.add(b.x, b.y, b._z3, rgb, a + 0.12 * young);
        continue;
      }
      // trail
      if (sim.flags.showOrbits && b.trail && b.trail.length > 4) {
        const rgb = b.state === 'captured' ? cssRGB('oklch(0.40 0.05 30)') :
          b.state === 'spaghettified' ? cssRGB('oklch(0.70 0.18 28)') : cssRGB(KN.colorOf(b, 1));
        const aTr = b.state === 'orbit' ? 0.4 : 0.4;
        for (let i = 2; i < b.trail.length; i += 2) {
          line.seg(b.trail[i - 2], b.trail[i - 1], 0, b.trail[i], b.trail[i + 1], 0, rgb, aTr);
        }
      }
      if (b.state === 'orbit') {
        const e = bodyMesh(R, b);
        const pxR = Math.max(2, (b.radius || 0.4) * 4);      // 2D pixel radius
        const wr = Math.max(0.08, (pxR * 2) / s);            // screen-constant world size
        e.mesh.visible = true;
        e.mesh.position.set(b.x, b.y, 0);
        if (b.kind === 'ship') {
          e.mesh.scale.setScalar(Math.max(0.1, 14 / s));
          const ang = Math.atan2(b.vy, b.vx);
          e.mesh.rotation.set(0, 0, ang - Math.PI / 2);      // cone +y -> velocity
        } else if (b.kind === 'probe') {
          e.mesh.scale.setScalar(Math.max(0.06, 7 / s));
        } else {
          // tidal stretch — prolate along the radial direction (volume-preserving)
          let stretch = 1;
          if (sim.flags.showTidal && b.stress > 0.15) stretch = 1 + Math.min(2.2, b.stress * 1.6);
          const squish = 1 / Math.sqrt(stretch);
          e.mesh.scale.set(wr * stretch, wr * squish, wr * squish);
          const r = Math.hypot(b.x, b.y) || 1;
          e.mesh.rotation.set(0, 0, Math.atan2(b.y / r, b.x / r));
          // soft glow
          R.pools.sprite.add(b.x, b.y, 0, wr * 4.4, cssRGB(KN.colorOf(b, 1)), 0.22);
        }
        if (sim.selectedId === b.id) {
          line.circle(b.x, b.y, 0, pxToWorld(R, 11, b.x, b.y), cssRGB('oklch(0.80 0.16 75)'), 0.8, true, 36);
        }
        if (sim.flags.showTidal && b.stress > 0.15) {
          const r = Math.hypot(b.x, b.y) || 1;
          const ux = b.x / r, uy = b.y / r;
          const st = pxToWorld(R, Math.min(20, 4 + b.stress * 14), b.x, b.y);
          line.seg(b.x - ux * st, b.y - uy * st, 0, b.x + ux * st, b.y + uy * st, 0,
                   cssRGB('oklch(0.72 0.20 28)'), Math.min(0.9, b.stress));
        }
        if (sim.flags.showLabels) {
          R.pools.label.add(b.name, 'oklch(0.78 0.008 80 / 0.85)', 10, b.x, b.y, 0, [10, -8]);
        }
      } else if (b.state === 'spaghettified') {
        const age = sim.t - (b.consumedAt || sim.t);
        if (age < 4) {
          const r = Math.hypot(b.x, b.y) || 1;
          const ux = b.x / r, uy = b.y / r;
          const rgb = cssRGB('oklch(0.72 0.20 28)');
          for (let i = 0; i < 8; i++) {
            const d = (i / 8) * 1.6;
            R.pools.fx.add(b.x + ux * d, b.y + uy * d, 0, rgb, (0.5 - age * 0.11) * (1 - i / 9));
            R.pools.fx.add(b.x - ux * d, b.y - uy * d, 0, rgb, (0.5 - age * 0.11) * (1 - i / 9));
          }
        }
      }
    }
    for (const [id, e] of R.bodyMeshes) {
      if (!e.used) { R.scene.remove(e.mesh); R.bodyMeshes.delete(id); }
    }
  }

  // ── Binary extras: trails, axis, Roche lobes, mass-transfer stream ─────────
  function drawBinary(R, sim) {
    const bin = sim.binary;
    if (!bin || !bin.enabled) return;
    const phys = window.KNphysics;
    const line = R.pools.line;
    // inspiral trails
    if (bin.trail1 && bin.trail1.length > 4) {
      const rgb = cssRGB('oklch(0.78 0.16 75)');
      for (let i = 2; i < bin.trail1.length; i += 2) {
        line.seg(bin.trail1[i - 2], bin.trail1[i - 1], 0, bin.trail1[i], bin.trail1[i + 1], 0, rgb, 0.16);
      }
    }
    if (bin.trail2 && bin.trail2.length > 4) {
      const rgb = cssRGB('oklch(0.72 0.18 295)');
      for (let i = 2; i < bin.trail2.length; i += 2) {
        line.seg(bin.trail2[i - 2], bin.trail2[i - 1], 0, bin.trail2[i], bin.trail2[i + 1], 0, rgb, 0.16);
      }
    }
    // axis
    {
      const rgb = cssRGB('oklch(0.58 0.08 75)');
      const N = 16;
      for (let k = 0; k < N; k += 2) {
        const f0 = k / N, f1 = (k + 1) / N;
        line.seg(bin.x1 + (bin.x2 - bin.x1) * f0, bin.y1 + (bin.y2 - bin.y1) * f0, 0,
                 bin.x1 + (bin.x2 - bin.x1) * f1, bin.y1 + (bin.y2 - bin.y1) * f1, 0, rgb, 0.32);
      }
    }
    // separation + Peters readouts
    const midX = (bin.x1 + bin.x2) / 2, midY = (bin.y1 + bin.y2) / 2;
    R.pools.label.add(`d = ${bin.d.toFixed(2)} M`, 'oklch(0.65 0.06 75 / 0.7)', 9, midX, midY, 0, [6, -6]);
    const pet = bin.lastPeters;
    if (pet) {
      R.pools.label.add(`f_GW ${(pet.omega / Math.PI).toFixed(3)} c/M`, 'oklch(0.62 0.10 295 / 0.75)', 9, midX, midY, 0, [6, 7]);
      R.pools.label.add(`Mc ${(pet.Mc * (sim.params.Msun || 1)).toFixed(2)} M⊙`, 'oklch(0.62 0.10 295 / 0.75)', 9, midX, midY, 0, [6, 19]);
    }
    // Common-envelope haze
    if (bin.ceFlash > 0) {
      const k = Math.max(0, Math.min(1, bin.ceFlash / 1.6));
      const er = bin.d * 0.75 + 3;
      R.pools.sprite.add(midX, midY, 0, er * 2, cssRGB('oklch(0.70 0.10 60)'), 0.22 * k);
    }
    // Roche lobes — teardrop equipotentials meeting at L1 (in the orbital plane)
    if (sim.flags.showRoche) {
      const M1s = sim.params.Msun || 1;
      const M2s = (bin.M2sun != null ? bin.M2sun : bin.M2 * M1s);
      const RL1 = phys.rocheLobeEggleton(M1s, M2s, bin.d);
      const RL2 = phys.rocheLobeEggleton(M2s, M1s, bin.d);
      const cT = sim.params.type || 'bh', sT = bin.type || 'bh';
      const R1 = cT === 'bh' ? 0 : (sim.params.R_star || 0);
      const R2 = sT === 'bh' ? 0 : (bin.R_star2 || 0);
      const ang = Math.atan2(bin.y2 - bin.y1, bin.x2 - bin.x1);
      const lobe = (sx, sy, RL, dir, overflow, baseT) => {
        if (!(RL > 0)) return;
        const dNose = RL * 1.30, dBack = RL * 0.74, W = RL * 0.82;
        const ca = Math.cos(dir), sa = Math.sin(dir);
        const rgb = overflow ? tempRGB(baseT || 6000, 0) : cssRGB('oklch(0.62 0.07 75)');
        const alpha = overflow ? 0.55 : 0.32;
        let lx0 = 0, ly0 = 0;
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2;
          const nx = Math.cos(t), ny = Math.sin(t) * Math.sin(t / 2);
          const lx = ((dNose + dBack) / 2) * nx + (dNose - dBack) / 2;
          const ly = W * ny;
          const px = sx + lx * ca - ly * sa, py = sy + lx * sa + ly * ca;
          if (i > 0 && (overflow || i % 2 === 0)) line.seg(lx0, ly0, 0, px, py, 0, rgb, alpha);
          lx0 = px; ly0 = py;
        }
      };
      lobe(bin.x1, bin.y1, RL1, ang, R1 > RL1, sim.params.T_eff);
      lobe(bin.x2, bin.y2, RL2, ang + Math.PI, R2 > RL2, bin.T_eff2);
    }
    // Mass-transfer stream — ballistic parcel fan through L1 (restricted 3-body),
    // rendered as soft hot parcels in the orbital plane (z≈0, thin by physics).
    const mt = bin.mt;
    if (mt && mt.active && mt.donor) {
      const dn = mt.donor === 1 ? [bin.x1, bin.y1] : [bin.x2, bin.y2];
      const ac = mt.donor === 1 ? [bin.x2, bin.y2] : [bin.x1, bin.y1];
      const Tdn = mt.donor === 1 ? (sim.params.T_eff || 6000) : (bin.T_eff2 || 6000);
      const Mdon = mt.donor === 1 ? (sim.params.Msun || 1) : (bin.M2sun || 1);
      const Macc = mt.accretor === 1 ? (sim.params.Msun || 1) : (bin.M2sun || 1);
      const accType = mt.accretor === 1 ? (sim.params.type || 'bh') : (bin.type || 'bh');
      const accRgeo = accType === 'bh'
        ? (mt.accretor === 1 ? sim.params.M : bin.M2) * 1.5
        : ((mt.accretor === 1 ? sim.params.R_star : bin.R_star2) || 3);
      const orbitSign = Math.sign(sim.params.a || 1) || 1;
      const accFrac = Math.max(0.02, Math.min(0.4, accRgeo / Math.max(0.1, bin.d)));
      const key = `${(Mdon / Math.max(0.05, Macc)).toFixed(2)}|${accFrac.toFixed(2)}|${orbitSign}`;
      if (bin._streamKey !== key || !bin._stream) {
        bin._stream = phys.gasStreamPaths(Mdon, Macc, accFrac, orbitSign, 7);
        bin._streamKey = key;
      }
      const stream = bin._stream, paths = stream.paths;
      const axx = ac[0] - dn[0], axy = ac[1] - dn[1];
      const pxx = -axy, pxy = axx;
      const toWorld = (px, py) => [dn[0] + px * axx + py * pxx, dn[1] + px * axy + py * pxy];
      const accT = mt.accretor === 1 ? (sim.params.T_eff || 6000) : (bin.T_eff2 || 6000);
      const Tpeak = (accType === 'bh' || accType === 'ns') ? 40000
        : accType === 'wd' ? 30000
        : Math.max(accT || 6000, Tdn * 1.6, 9000);
      const rampT = (u) => Tdn + (Tpeak - Tdn) * Math.pow(u, 1.6);
      const t = sim.t || 0;
      const fx = R.pools.fx;
      const dnR = ((mt.donor === 1 ? sim.params.R_star : bin.R_star2) || 3);
      const L1 = toWorld(stream.xL1 != null ? stream.xL1 : 0.5, 0);
      const axisAngle = Math.atan2(axy, axx);
      // (A) donor -> L1 feeder
      for (let i = 0; i < 56; i++) {
        const r1 = rand(i + 101.1), r2 = rand(i + 203.7), r3 = rand(i + 307.3);
        const phi = axisAngle + (r1 - 0.5) * 1.7;
        const sx0 = dn[0] + Math.cos(phi) * dnR, sy0 = dn[1] + Math.sin(phi) * dnR;
        const uf = ((t * (0.45 + 0.3 * r2)) + r3) % 1;
        const px = sx0 + (L1[0] - sx0) * uf, py = sy0 + (L1[1] - sy0) * uf;
        fx.add(px, py, (r1 - 0.5) * 0.2, tempRGB(Tdn, 0), 0.05 + 0.13 * uf);
      }
      // (B) L1 -> accretor ballistic fan
      const center = (paths.length - 1) / 2;
      for (let i = 0; i < 240; i++) {
        const gpick = (rand(i + 0.1) + rand(i + 2.3) + rand(i + 5.7)) / 3 - 0.5;
        const si = Math.max(0, Math.min(paths.length - 1, Math.round(center + gpick * (paths.length - 1) * 1.6)));
        const path = paths[si]; const n = path.length; if (n < 3) continue;
        const r1 = rand(i + 1), r2 = rand(i + 7.3), r3 = rand(i + 19.7);
        const speed = 0.32 + 0.30 * r1;
        const u = ((t * speed) + r2) % 1;
        const idx = Math.min(n - 2, Math.max(0, Math.floor(u * (n - 1))));
        const p0 = path[idx], p1 = path[idx + 1], fr = u * (n - 1) - idx;
        let px = p0[0] + (p1[0] - p0[0]) * fr, py = p0[1] + (p1[1] - p0[1]) * fr;
        const tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tx, ty) || 1;
        const spread = (0.010 + 0.06 * Math.sqrt(u)) * (r3 - 0.5) * 2;
        px += (-ty / tl) * spread; py += (tx / tl) * spread;
        const wpt = toWorld(px, py);
        const offaxis = center > 0 ? Math.abs(si - center) / center : 0;
        const dens = (1 - 0.5 * u) * (1 - 0.4 * offaxis);
        fx.add(wpt[0], wpt[1], (r3 - 0.5) * 0.16, tempRGB(rampT(u), 0), 0.06 + 0.16 * Math.max(0, dens));
      }
      // (C) circularised mini-disc around a compact accretor
      const accCompact = (accType === 'bh' || accType === 'ns' || accType === 'wd');
      if (accCompact) {
        const rIn = Math.max(0.8, accRgeo * 1.1);
        const rOut = Math.max(rIn * 2.6, Math.min(0.22 * bin.d, 14));
        for (let i = 0; i < 110; i++) {
          const r1 = rand(i + 501.1), r2 = rand(i + 613.3), r3 = rand(i + 727.7);
          const rr = rIn + (rOut - rIn) * Math.sqrt(r1);
          const om = orbitSign * 1.3 * Math.pow(rIn / rr, 1.5);
          const th = r2 * Math.PI * 2 + om * t + (r3 - 0.5) * 0.25;
          const rnorm = (rr - rIn) / Math.max(1e-3, rOut - rIn);
          fx.add(ac[0] + Math.cos(th) * rr, ac[1] + Math.sin(th) * rr, (r3 - 0.5) * 0.1 * rr,
                 tempRGB(rampT(1 - rnorm), 0), 0.05 + 0.13 * (1 - rnorm));
        }
      }
      // impact hot spot
      const pulse = 0.30 + 0.12 * Math.sin(t * 4);
      R.pools.sprite.add(ac[0], ac[1], 0, pxToWorld(R, 40, ac[0], ac[1]), tempRGB(Tpeak, 0), pulse);
    }
    // nova / X-ray burst / AIC flashes on the accretor
    const flash = (val, dur, at, mk) => {
      if (!(val > 0) || !at) return;
      const tt = Math.max(0, Math.min(1, val / dur));
      mk(tt, at);
    };
    const accAt = bin.mt && bin.mt.accretor ? (bin.mt.accretor === 1 ? [bin.x1, bin.y1] : [bin.x2, bin.y2]) : null;
    flash(bin.novaFlash, 1.2, accAt, (t2, at) => {
      const nr = Math.max(2, (1 - t2) * 48 + 8);
      R.pools.sprite.add(at[0], at[1], 0, pxToWorld(R, nr * 2, at[0], at[1]), cssRGB('oklch(0.96 0.12 80)'), t2 * 0.6);
    });
    flash(bin.xrayFlash, 0.9, accAt, (t2, at) => {
      const xr = Math.max(2, (1 - t2) * 30 + 5);
      R.pools.sprite.add(at[0], at[1], 0, pxToWorld(R, xr * 2, at[0], at[1]), cssRGB('oklch(0.97 0.06 235)'), t2 * 0.7);
      R.pools.line.circle(at[0], at[1], 0, pxToWorld(R, Math.max(2, (1 - t2) * 34 + 4), at[0], at[1]),
        cssRGB('oklch(0.92 0.07 240)'), t2 * 0.5, false, 40);
    });
    flash(bin.aicFlash, 1.4, bin.aicAt ? (bin.aicAt === 1 ? [bin.x1, bin.y1] : [bin.x2, bin.y2]) : null, (t2, at) => {
      R.pools.sprite.add(at[0], at[1], 0, pxToWorld(R, Math.max(2, t2 * 40 + 4) * 2, at[0], at[1]), cssRGB('oklch(0.90 0.09 245)'), (1 - t2) * 0.6 + t2 * 0.25);
      R.pools.line.circle(at[0], at[1], 0, pxToWorld(R, Math.max(2, t2 * 30 + 3), at[0], at[1]),
        cssRGB('oklch(0.88 0.09 250)'), (1 - t2) * 0.5, false, 40);
    });
  }

  // ── Merger / supernova flashes + multi-phase transient ──────────────────────
  function drawFlashes(R, sim, w, h) {
    const bin = sim.binary;
    const spanW = Math.min(w, h) / sim.view.scale;      // 2D "span" in world units
    if (bin && bin.mergerFlash > 0) {
      const t = Math.max(0, Math.min(1, bin.mergerFlash / 1.6));
      const alpha = Math.min(1, t * 2);
      const radius = Math.max(0.5, (1 - t) * spanW * 0.7);
      R.pools.sprite.add(0, 0, 0, radius * 2, cssRGB('oklch(0.95 0.18 75)'), alpha * 0.55);
      R.pools.sprite.add(0, 0, 0, radius * 0.9, cssRGB('oklch(0.85 0.16 295)'), alpha * 0.3);
      if (t > 0.6) {
        R.pools.label.add(tr('GW MERGER · RINGDOWN', '重力波合併 · 衰盪'), `oklch(0.96 0.10 75 / ${((t - 0.6) * 2.5 * alpha).toFixed(2)})`, 11, 0, 0, 0, [-60, -16], true);
        R.pools.label.add(`M_f = ${(sim.params.Msun || 0).toFixed(1)} M⊙ · a/M → ${(sim.params.a / sim.params.M).toFixed(2)}`,
          `oklch(0.75 0.10 295 / ${((t - 0.6) * 2.5 * alpha).toFixed(2)})`, 9, 0, 0, 0, [-60, 2]);
      }
    }
    if (bin && bin.snFlash > 0) {
      const t = Math.max(0, Math.min(1, bin.snFlash / 1.8));
      const alpha = Math.min(1, t * 2);
      const radius = Math.max(0.5, (1 - t) * spanW * 0.85);
      R.pools.sprite.add(0, 0, 0, radius * 2, cssRGB('oklch(0.96 0.10 90)'), alpha * 0.5);
      if (t > 0.55) {
        R.pools.label.add(tr('TYPE Ia SUPERNOVA', 'Ia 型超新星'), `oklch(0.97 0.10 80 / ${((t - 0.55) * 2.2 * alpha).toFixed(2)})`, 11, 0, 0, 0, [-55, -8], true);
        R.pools.label.add(tr('WD → Chandrasekhar · detonation', '白矮星 → 錢德拉塞卡極限 · 爆轟'),
          `oklch(0.85 0.10 55 / ${((t - 0.55) * 2.2 * alpha).toFixed(2)})`, 9, 0, 0, 0, [-55, 8]);
      }
    }
    drawTransient3D(R, sim, spanW);
  }

  // Post-coalescence transient — remodelled for 3D: the short-GRB jet fires along
  // the ORBITAL ANGULAR MOMENTUM axis (±z, it was flattened into the plane in 2D),
  // the kilonova/r-process ejecta expand as true shells, the LRN envelope is a
  // sphere, and the WD debris disc settles into the orbital plane.
  function drawTransient3D(R, sim, spanW) {
    const tx = sim.transient;
    if (!tx) return;
    const T = tx.t;
    const ax = tx.axis || 0;
    const ej = Math.max(0.2, tx.ejecta || 0.5);
    const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    const bell = (t, a, b) => (t <= a || t >= b) ? 0 : Math.sin(Math.PI * (t - a) / (b - a));
    const fx = R.pools.fx;

    // (1) tidal-tail ejecta — two spiral arms in the orbital plane
    if (tx.kind !== 'gw') {
      const tailDur = tx.lrn ? 2.6 : 1.7;
      const p = ramp(T, 0, tailDur);
      if (p < 1) {
        const grow = 1 - Math.pow(1 - p, 2);
        const fade = (1 - p) * Math.min(1, T / 0.15);
        const hue = (tx.kind === 'nsns' || tx.kind === 'nsbh') ? 32 : tx.lrn ? 40 : 55;
        const chroma = tx.lrn ? 0.12 : 0.13;
        const orbDir = Math.sign(Math.sin(ax)) || 1;
        for (let arm = 0; arm < 2; arm++) {
          const base = ax + Math.PI / 2 + arm * Math.PI;
          for (let i = 0; i < 26; i++) {
            const f = i / 25;
            const swirl = orbDir * (0.9 + 1.4 * ej) * f;
            const ang = base + swirl;
            const rr = (0.03 + (0.34 + 0.18 * ej) * f) * spanW * grow;
            const a0 = fade * (0.20 * (1 - f));
            if (a0 <= 0.004) continue;
            const rgb = cssRGB(`oklch(${(0.78 - 0.16 * f).toFixed(2)} ${chroma} ${hue})`);
            fx.add(Math.cos(ang) * rr, Math.sin(ang) * rr, (rand(i + arm * 31.7) - 0.5) * rr * 0.14, rgb, a0);
          }
        }
      }
    }
    // (2) short GRB — relativistic bipolar jet along ±z
    if (tx.grb) {
      const k = bell(T, 0.10, 1.5);
      if (k > 0.01) {
        const L = spanW * (0.26 + 0.30 * ramp(T, 0.10, 0.8));
        const rgb = cssRGB('oklch(0.93 0.10 248)');
        for (const dir of [1, -1]) {
          const beam = dir === 1 ? 1 : 0.6;
          for (let i = 0; i < 16; i++) {
            const f = (i + 0.5) / 16;
            const rr = 0.3 + f * L * 0.11;
            fx.add((rand(i + 61.3) - 0.5) * rr, (rand(i + 77.9) - 0.5) * rr, dir * f * L, rgb, 0.30 * k * beam * (1 - f * 0.5));
          }
          R.pools.line.seg(0, 0, 0, 0, 0, dir * L, rgb, 0.4 * k * beam);
        }
      }
    }
    // (3) kilonova — blue then red quasi-thermal shells
    if (tx.kilonova) {
      const blueA = (1 - ramp(T, 0.5, 2.6)) * Math.min(1, T / 0.4) * 0.42;
      if (blueA > 0.01) {
        const rb = spanW * (0.05 + 0.20 * ramp(T, 0.4, 3.0)) * (0.7 + 0.6 * ej);
        R.pools.sprite.add(0, 0, 0, rb * 2, cssRGB('oklch(0.88 0.09 240)'), blueA);
      }
      const redA = bell(T, 0.9, tx.dur) * 0.5;
      if (redA > 0.01) {
        const rr = spanW * (0.06 + 0.27 * ramp(T, 1.0, tx.dur)) * (0.7 + 0.6 * ej);
        R.pools.sprite.add(0, 0, 0, rr * 2, cssRGB('oklch(0.70 0.14 34)'), redA);
      }
    }
    // (4) r-process cloud — a true spherical clumpy shell
    if (tx.rProcess) {
      const p = ramp(T, 1.1, tx.dur);
      const shell = spanW * (0.10 + 0.30 * p) * (0.7 + 0.6 * ej);
      const fade = bell(T, 1.0, tx.dur);
      if (fade > 0.01) {
        for (let i = 0; i < 70; i++) {
          const a1 = rand(i + 11.3) * Math.PI * 2;
          const u = rand(i + 23.9) * 2 - 1;
          const rr = shell * (0.55 + 0.45 * rand(i + 47.1));
          const rxy = Math.sqrt(Math.max(0, 1 - u * u)) * rr;
          const shimmer = 0.5 + 0.5 * Math.sin(T * 3 + i);
          const a0 = fade * (0.04 + 0.10 * rand(i + 91.7)) * shimmer;
          if (a0 <= 0.004) continue;
          const rgb = cssRGB(`oklch(${(0.52 + 0.14 * rand(i + 3.1)).toFixed(2)} 0.11 ${(30 + 18 * rand(i + 7.7)).toFixed(0)})`);
          fx.add(Math.cos(a1) * rxy, Math.sin(a1) * rxy, u * rr, rgb, a0);
        }
      }
    }
    // (5) luminous red nova — swelling cool envelope + dust wisps
    if (tx.lrn) {
      const rr = spanW * (0.06 + 0.22 * ramp(T, 0.3, tx.dur)) * (0.8 + 0.5 * ej);
      const env = bell(T, 0.2, tx.dur);
      if (env > 0.01) {
        R.pools.sprite.add(0, 0, 0, rr * 2, cssRGB('oklch(0.74 0.12 48)'), env * 0.4);
        for (let i = 0; i < 30; i++) {
          const a1 = rand(i + 2.7) * Math.PI * 2;
          const u = rand(i + 8.3) * 2 - 1;
          const dr = rr * (0.5 + 0.5 * rand(i + 13.1));
          const rxy = Math.sqrt(Math.max(0, 1 - u * u)) * dr;
          const a0 = env * 0.09 * rand(i + 31.7);
          if (a0 <= 0.004) continue;
          fx.add(Math.cos(a1) * rxy, Math.sin(a1) * rxy, u * dr * 0.6, cssRGB('oklch(0.46 0.10 30)'), a0);
        }
      }
    }
    // (6) WD debris disc — settles into the orbital plane (true z=0 annulus)
    if (tx.kind === 'disc') {
      const fade = bell(T, 0.1, tx.dur);
      if (fade > 0.01) {
        const rOut = spanW * (0.06 + 0.10 * ramp(T, 0.1, tx.dur));
        for (let i = 0; i < 90; i++) {
          const r1 = rand(i + 101.1), r2 = rand(i + 211.3);
          const rr = rOut * (0.35 + 0.65 * Math.sqrt(r1));
          const om = 1.4 * Math.pow((rOut * 0.35) / Math.max(1, rr), 1.5);
          const th = r2 * Math.PI * 2 + om * T;
          const a0 = fade * (0.05 + 0.10 * (1 - rr / rOut));
          if (a0 <= 0.004) continue;
          const rgb = cssRGB(`oklch(${(0.62 - 0.1 * (rr / rOut)).toFixed(2)} 0.10 45)`);
          fx.add(Math.cos(th) * rr, Math.sin(th) * rr, (rand(i + 3.3) - 0.5) * 0.2, rgb, a0);
        }
      }
    }
    // headline
    if (!tx.ddIa) {
      const la = bell(T, 0.2, 2.4);
      if (la > 0.02) {
        const head = {
          nsns: tr('NS-NS MERGER · KILONOVA', '中子星雙星合併 · 千新星'),
          nsbh: tr('NS-BH MERGER · KILONOVA', '中子星-黑洞合併 · 千新星'),
          lrn: tr('LUMINOUS RED NOVA', '紅色高光度新星'),
          disc: tr('TIDAL DISRUPTION · DEBRIS DISC', '潮汐瓦解 · 碎屑盤'),
        }[tx.kind] || '';
        const sub = tx.grb
          ? tr('short GRB · r-process ejecta', '短伽瑪射線暴 · r-過程拋射物')
          : tx.lrn ? tr('stellar coalescence', '恆星合併')
          : tx.kind === 'disc' ? tr('white dwarf shredded', '白矮星被瓦解') : '';
        R.pools.label.add(head, `oklch(0.86 0.10 ${tx.lrn ? 40 : 250} / ${la.toFixed(2)})`, 11, 0, 0, 0, [-60, 0.20 * spanW * sim.view.scale], true);
        if (sub) R.pools.label.add(sub, `oklch(0.72 0.08 ${tx.lrn ? 36 : 240} / ${(la * 0.9).toFixed(2)})`, 9, 0, 0, 0, [-60, 0.20 * spanW * sim.view.scale + 14]);
      }
    }
  }

  // ── Galaxy / cluster structure glow + DM halo (3D-native) ───────────────────
  function structSlot(R, key) {
    let st = R.structSlots[key];
    if (!st) {
      st = R.structSlots[key] = { group: new THREE.Group(), key: '' };
      R.scene.add(st.group);
    }
    st.used = true;
    return st;
  }

  function drawStructures(R, sim) {
    const bin = sim.binary;
    const binOn = !!(bin && bin.enabled);
    const isCloud = (k) => k === 'galaxy' || k === 'cluster' || k === 'opencluster';
    const one = (slotKey, kind, Rvis, frac, wx, wy, halo) => {
      if (!(Rvis > 0) || !(frac > 0)) return;
      const isGalaxy = kind === 'galaxy';
      const op = Math.max(0.04, Math.min(0.20, 0.06 + 0.16 * Math.min(1.4, frac)));
      const st = structSlot(R, slotKey);
      const key = `${kind}`;
      if (st.key !== key) {
        st.key = key;
        st.group.clear();
        if (isGalaxy) {
          // flattened luminous disc in the orbital plane + a central bulge glow
          const discM = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({
            color: threeColor('oklch(0.80 0.07 255)'), transparent: true, opacity: 0.10,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
          }));
          st.disc = discM;
          st.group.add(discM);
        }
        // DM halo — the invisible mass made just visible: a faint wire sphere
        const wire = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({
          color: threeColor('oklch(0.75 0.04 290)'), transparent: true, opacity: 0.045,
          wireframe: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        st.halo = wire;
        st.group.add(wire);
      }
      st.group.position.set(wx, wy, 0);
      if (st.disc) { st.disc.scale.setScalar(Rvis); st.disc.material.opacity = op * 0.7; }
      const hueRGB = isGalaxy ? cssRGB('oklch(0.85 0.07 255)') : cssRGB('oklch(0.85 0.07 80)');
      R.pools.sprite.add(wx, wy, 0, Rvis * (isGalaxy ? 1.1 : 2.0), hueRGB, op * (isGalaxy ? 1.0 : 0.9));
      if (st.halo) {
        const on = isGalaxy && halo && halo.R > 0 && halo.M > 0;
        st.halo.visible = !!on;
        if (on) st.halo.scale.setScalar(halo.R);
      }
    };
    if (isCloud(sim.smbhStructure)) {
      const cx = binOn ? bin.x1 : 0, cy = binOn ? bin.y1 : 0;
      one('s1', sim.smbhStructure, sim._Rvis1, sim._cloudFrac1, cx, cy, sim._halo1);
    }
    if (binOn && isCloud(bin.smbhStructure)) {
      one('s2', bin.smbhStructure, sim._Rvis2, sim._cloudFrac2, bin.x2, bin.y2, sim._halo2);
    }
    // TDE flares
    const list = sim._tdeFlares;
    if (list && list.length) {
      for (const f of list) {
        const age = sim.t - f.t0;
        if (age < 0 || age >= 2.5) continue;
        if (f.role === 'companion' && !binOn) continue;
        const wx = f.role === 'companion' ? bin.x2 : (binOn ? bin.x1 : 0);
        const wy = f.role === 'companion' ? bin.y2 : (binOn ? bin.y1 : 0);
        const u = age / 2.5;
        const Rw = (3 + 9 * u);
        const a = 0.30 * (1 - u) * (1 - u);
        R.pools.sprite.add(wx, wy, 0, Rw * 2, cssRGB('oklch(0.90 0.09 70)'), a);
      }
    }
  }

  // ── Interaction overlay in 3D (ghost / aim / trajectories) ───────────────────
  function drawInteraction(R, sim, w, h) {
    const KN = window.KNSim;
    const line = R.pools.line;
    // REPOSITION cue
    if (sim.moving) {
      let mx = null, my = null, label = '';
      if (sim.moving.kind === 'companion' && sim.binary && sim.binary.enabled) {
        mx = sim.binary.x2; my = sim.binary.y2; label = tr('companion', '伴星');
      } else {
        const b = sim.bodies.find((x) => x.id === sim.moving.bodyId);
        if (b) { mx = b.x; my = b.y; label = b.name; }
      }
      if (mx != null) {
        const rgb = cssRGB('oklch(0.85 0.16 130)');
        const rr = pxToWorld(R, 16, mx, my);
        line.circle(mx, my, 0, rr, rgb, 0.85, true, 40);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          line.seg(mx + dx * rr * 0.75, my + dy * rr * 0.75, 0, mx + dx * rr * 1.45, my + dy * rr * 1.45, 0, rgb, 0.85);
        }
        R.pools.label.add(trp('moving · {label}', { label }), 'oklch(0.85 0.16 130)', 10, mx, my, 0, [26, -10]);
      }
    }
    // PLACEMENT ghost
    if (sim.placement && sim.placement.inCanvas) {
      const p = sim.placement;
      const isCompanion = !!p.item.isCompanion;
      const rgbRing = isCompanion ? cssRGB('oklch(0.72 0.18 295)') : cssRGB('oklch(0.80 0.16 75)');
      line.circle(p.wx, p.wy, 0, pxToWorld(R, 18, p.wx, p.wy), rgbRing, 0.7, true, 40);
      const ghostR = isCompanion
        ? Math.max(pxToWorld(R, 6, p.wx, p.wy), (sim.binary && (sim.binary.R_star2 || 1)) * 0.5)
        : pxToWorld(R, Math.max(4, (p.item.radius || 0.4) * 8), p.wx, p.wy);
      R.pools.sprite.add(p.wx, p.wy, 0, ghostR * 3, rgbRing, 0.35);
      R.pools.label.add(isCompanion ? tr('release → place companion', '放開 → 放置伴星') : tr('release → place', '放開 → 放置'),
        isCompanion ? 'oklch(0.82 0.14 295)' : 'oklch(0.80 0.16 75)', 10, p.wx, p.wy, 0, [24, -6]);
      const r = Math.hypot(p.wx, p.wy);
      const vc = Math.sqrt(sim.params.M / Math.max(0.5, r));
      R.pools.label.add(`r = ${r.toFixed(2)} M${isCompanion ? `  ·  v_circ ≈ ${vc.toFixed(3)} c` : ''}`,
        'oklch(0.58 0.012 255)', 9, p.wx, p.wy, 0, [24, 8]);
    }
    // AIM mode
    if (sim.aiming) {
      const isCompanion = sim.aiming.kind === 'companion';
      let bodyRef = null;
      if (isCompanion) {
        if (!sim.binary || !sim.binary.enabled) return;
        bodyRef = { x: sim.binary.x2, y: sim.binary.y2, vx: sim.binary.vx2, vy: sim.binary.vy2 };
      } else {
        bodyRef = sim.bodies.find((b) => b.id === sim.aiming.bodyId);
        if (!bodyRef) return;
      }
      const accent = isCompanion ? 'oklch(0.78 0.18 295)' : 'oklch(0.80 0.16 75)';
      if (!sim.aiming.isAiming) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
        line.circle(bodyRef.x, bodyRef.y, 0, pxToWorld(R, 16 + pulse * 8, bodyRef.x, bodyRef.y), cssRGB(accent), 0.35 + pulse * 0.4, false, 44);
        R.pools.label.add(isCompanion ? tr('drag from companion → custom v₀', '從伴星拖曳 → 自訂 v₀') : tr('drag from body → launch', '從天體拖曳 → 發射'),
          accent, 10, bodyRef.x, bodyRef.y, 0, [24, -8]);
        return;
      }
      // active pull: unproject the cursor onto the plane
      const pull = R.screenToWorld(sim, w, h, sim.aiming.pullSx, sim.aiming.pullSy);
      line.polyline2([bodyRef.x, bodyRef.y, pull[0], pull[1]], 0, cssRGB('oklch(0.72 0.20 28)'), 0.6, false);
      // launch arrow: mirror of the pull
      const lx = bodyRef.x * 2 - pull[0], ly = bodyRef.y * 2 - pull[1];
      line.seg(bodyRef.x, bodyRef.y, 0, lx, ly, 0, cssRGB(accent), 0.9);
      const adx = lx - bodyRef.x, ady = ly - bodyRef.y;
      const al = Math.hypot(adx, ady) || 1;
      const hx = adx / al, hy = ady / al;
      const hs = Math.min(al * 0.25, pxToWorld(R, 10, lx, ly));
      line.seg(lx, ly, 0, lx - hx * hs - hy * hs * 0.5, ly - hy * hs + hx * hs * 0.5, 0, cssRGB(accent), 0.9);
      line.seg(lx, ly, 0, lx - hx * hs + hy * hs * 0.5, ly - hy * hs - hx * hs * 0.5, 0, cssRGB(accent), 0.9);
      // velocity from the same mapping the app commit uses
      const bScr = R.worldToScreen(sim, w, h, bodyRef.x, bodyRef.y);
      const vScale = 0.08;
      const vx = -(sim.aiming.pullSx - bScr[0]) / sim.view.scale * vScale;
      const vy = -(sim.aiming.pullSy - bScr[1]) / sim.view.scale * vScale;
      const { pts, fate } = isCompanion
        ? KN.predictBinaryTrajectory(sim, vx, vy)
        : KN.predictTrajectory(sim, bodyRef.x, bodyRef.y, vx, vy);
      const fateCSS = fate === 'capture' ? 'oklch(0.72 0.20 28)' :
        fate === 'escape' ? 'oklch(0.85 0.10 130)' : (isCompanion ? 'oklch(0.78 0.18 295)' : 'oklch(0.78 0.13 210)');
      line.polyline2(pts, 0, cssRGB(fateCSS), 0.7, true);
      if (pts.length >= 4) {
        const ex = pts[pts.length - 2], ey = pts[pts.length - 1];
        R.pools.sprite.add(ex, ey, 0, pxToWorld(R, 8, ex, ey), cssRGB(fateCSS), 0.8);
      }
      if (!isCompanion && KN.predictGeodesicTrajectory) {
        const gr = KN.predictGeodesicTrajectory(sim, bodyRef.x, bodyRef.y, vx, vy);
        if (gr && gr.pts && gr.pts.length >= 4) {
          line.polyline2(gr.pts, 0.02, cssRGB('oklch(0.80 0.12 300)'), 0.5, true);
          R.pools.label.add('GR', 'oklch(0.80 0.12 300 / 0.85)', 8, gr.pts[gr.pts.length - 2], gr.pts[gr.pts.length - 1], 0, [5, -4]);
        }
      }
      const v = Math.hypot(vx, vy);
      R.pools.label.add(`v0 = ${v.toFixed(3)} c`, isCompanion ? 'oklch(0.82 0.14 295)' : 'oklch(0.80 0.16 75)', 11, pull[0], pull[1], 0, [12, -6]);
      const fateWord = tr(fate.toUpperCase(), { capture: '落入', escape: '逃逸', bound: '束縛' }[fate] || fate);
      R.pools.label.add(trp('fate: {fate}', { fate: fateWord }), fateCSS, 9, pull[0], pull[1], 0, [12, 9]);
    }
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  R3D.render = function (sim, w, h) {
    if (!this.renderer || !this._built) return;
    const KN = window.KNSim, phys = window.KNphysics;
    if (KN.syncStellar) KN.syncStellar(sim);
    sim._vw = w; sim._vh = h;
    KN.applyFrameLock(sim);
    this.sim = sim;
    this._w = w; this._h = h;

    // smooth camera easing toward the orbit targets
    const V = this.view;
    V.tilt += (V.tiltT - V.tilt) * 0.18;
    V.yaw += (V.yawT - V.yaw) * 0.18;
    applyCamera(this.camera, sim, w, h, V.tilt, V.yaw);
    this.active = true;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    const cw = Math.max(2, Math.round(w)), ch = Math.max(2, Math.round(h));
    const sz = this.renderer.getSize(new THREE.Vector2());
    if (sz.x !== cw || sz.y !== ch) this.renderer.setSize(cw, ch, false);

    // starfield tracks the camera target so it never clips out
    this.stars.position.set(-sim.view.ox, -sim.view.oy, 0);
    this.stars.scale.setScalar(this.camera.far * 0.55);

    // begin pools
    const P = this.pools;
    P.line.begin(); P.disc.begin(); P.cloud.begin(); P.fx.begin(); P.sprite.begin();
    P.label.begin(this.camera, h);
    for (const k in this.slots) this.slots[k].used = false;
    for (const k in this.jetSlots) this.jetSlots[k].used = false;
    for (const k in this.structSlots) this.structSlots[k].used = false;

    const { M, Q, a } = sim.params;
    const type = sim.params.type || 'bh';
    const bin = sim.binary;
    const binOn = !!(bin && bin.enabled);

    drawRingsAndGrid(this, sim, w, h);
    if (sim.flags.showGW) drawGWSheet(this, sim, w, h);

    // frame dragging
    if (sim.flags.showDragField) {
      const { rplus } = phys.horizons(M, Q, a);
      const isBH = type === 'bh';
      if (binOn) {
        const baseR1 = isBH ? (rplus || 1) : Math.max(rplus || 0, sim.params.R_star || 3);
        drawDragField(this, sim, bin.x1, bin.y1, a, baseR1);
        const compBH = (bin.type || 'bh') === 'bh';
        const h2 = phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
        const baseR2 = compBH ? (h2.rplus || 1) : Math.max(h2.rplus || 0, bin.R_star2 || 3);
        drawDragField(this, sim, bin.x2, bin.y2, bin.a2 || 0, baseR2);
      } else {
        const baseR = isBH ? (rplus || 1) : Math.max(rplus || 0, sim.params.R_star || 3);
        drawDragField(this, sim, 0, 0, a, baseR);
      }
    }

    // central bodies
    if (binOn) {
      updateCentral(this, sim, 'primary', bin.x1, bin.y1, {
        M, Q, a, type, Rs: sim.params.R_star, T: sim.params.T_eff, L: sim.params._L,
        accent: 'oklch(0.78 0.16 75)', showErgoShell: sim.flags.showErgo,
      });
      updateCentral(this, sim, 'companion', bin.x2, bin.y2, {
        M: bin.M2, Q: bin.Q2 || 0, a: bin.a2 || 0, type: bin.type || 'bh',
        Rs: bin.R_star2, T: bin.T_eff2, L: bin._L2,
        accent: 'oklch(0.72 0.18 295)', showErgoShell: sim.flags.showErgo,
      });
      if (sim.flags.showLabels) {
        P.label.add(`M₁ ${(sim.params.Msun || 0).toFixed(1)} M⊙${type !== 'bh' ? ' ' + type.toUpperCase() : ''}`,
          type !== 'bh' ? window.KNphysics.tempToColor(sim.params.T_eff || 6000, 0.85) : 'oklch(0.78 0.16 75 / 0.8)', 9, bin.x1, bin.y1, 0, [14, -8]);
        const sT = bin.type || 'bh';
        P.label.add(`M₂ ${(bin.M2sun || 0).toFixed(1)} M⊙${sT !== 'bh' ? ' ' + sT.toUpperCase() : ''}`,
          'oklch(0.72 0.18 295 / 0.8)', 9, bin.x2, bin.y2, 0, [14, -8]);
      }
    } else {
      updateCentral(this, sim, 'primary', 0, 0, {
        M, Q, a, type, Rs: sim.params.R_star, T: sim.params.T_eff, L: sim.params._L,
        accent: 'oklch(0.78 0.16 75)', showErgoShell: sim.flags.showErgo,
      });
      if (type !== 'bh' && sim.flags.showLabels) {
        const info = phys.STELLAR_INFO && phys.STELLAR_INFO[type];
        P.label.add(info && info.pill ? info.pill : type.toUpperCase(),
          phys.tempToColor(sim.params.T_eff || 6000, 0.85), 10, sim.params.R_star || 3, 0, 0, [8, -6]);
        P.label.add(`R★ = ${(sim.params.R_star || 3).toFixed(2)} M`, 'oklch(0.58 0.012 255 / 0.85)', 9, sim.params.R_star || 3, 0, 0, [8, 7]);
      }
    }
    // hide unused slots
    for (const k in this.slots) {
      const sl = this.slots[k];
      sl.group.visible = !!sl.used;
    }

    // discs + jets
    if (window.KNDisc) {
      const host1 = { cx: binOn ? bin.x1 : sim.primary.x, cy: binOn ? bin.y1 : sim.primary.y };
      drawDisc(this, sim, sim.disc, host1);
      if (sim.disc2 && binOn) drawDisc(this, sim, sim.disc2, { cx: bin.x2, cy: bin.y2 });
      const m1 = window.KNDisc.jetMetrics(sim);
      if (binOn) {
        drawJet(this, sim, 'j1', bin.x1, bin.y1, m1, Math.sign(a || 1));
        drawJet(this, sim, 'j2', bin.x2, bin.y2, window.KNDisc.companionJetMetrics(sim), Math.sign(bin.a2 || 1));
      } else {
        drawJet(this, sim, 'j1', 0, 0, m1, Math.sign(a || 1));
        const j2 = this.jetSlots.j2;
        if (j2) j2.group.visible = false;
      }
    }

    drawStructures(this, sim);
    drawBinary(this, sim);
    drawBodies(this, sim);
    drawFlashes(this, sim, w, h);
    drawInteraction(this, sim, w, h);

    for (const k in this.jetSlots) { if (!this.jetSlots[k].used) this.jetSlots[k].group.visible = false; }
    for (const k in this.structSlots) { if (!this.structSlots[k].used) this.structSlots[k].group.visible = false; }

    P.line.end(); P.disc.end(); P.cloud.end(); P.fx.end(); P.sprite.end(); P.label.end();
    this.renderer.render(this.scene, this.camera);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Mini views (small windows) — each gets its own tiny scene + renderer with a
  // slowly orbiting camera and optional drag-to-orbit.
  // ═══════════════════════════════════════════════════════════════════════════
  function makeMini(canvas, opts) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (err) {
      return null;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 4000);
    renderer.setClearColor(threeColor(opts.bg || 'oklch(0.09 0.018 255)'), 1);
    const mini = {
      renderer, scene, camera,
      yaw: opts.yaw || 0, tilt: opts.tilt != null ? opts.tilt : 1.0,
      dist: opts.dist || 10, autoSpin: opts.autoSpin != null ? opts.autoSpin : 0.12,
      _drag: null,
      dispose() {
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        renderer.dispose();
      },
      frame(dtWallSec) {
        if (!this._drag) this.yaw += this.autoSpin * (dtWallSec || 0.016);
        const w = canvas.clientWidth || 2, hh = canvas.clientHeight || 2;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        renderer.setPixelRatio(dpr);
        const sz = renderer.getSize(new THREE.Vector2());
        if (sz.x !== w || sz.y !== hh) renderer.setSize(w, hh, false);
        const st = Math.sin(this.tilt), ct = Math.cos(this.tilt);
        camera.position.set(
          Math.sin(this.yaw) * st * this.dist,
          Math.cos(this.yaw) * st * this.dist,
          ct * this.dist);
        camera.aspect = w / Math.max(1, hh);
        camera.up.set(0, 0, 1);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      },
    };
    function onDown(e) {
      mini._drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      e.stopPropagation();
    }
    function onMove(e) {
      if (!mini._drag) return;
      mini.yaw += (e.clientX - mini._drag.x) * 0.008;
      mini.tilt = Math.max(0.05, Math.min(1.5, mini.tilt + (e.clientY - mini._drag.y) * 0.006));
      mini._drag = { x: e.clientX, y: e.clientY };
    }
    function onUp() { mini._drag = null; }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return mini;
  }

  function miniGridFloor(scene, ext, step, css) {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({
      color: threeColor(css || 'oklch(0.24 0.022 255)'), transparent: true, opacity: 0.5,
      depthWrite: false,
    });
    const pts = [];
    for (let x = -ext; x <= ext + 1e-6; x += step) {
      pts.push(new THREE.Vector3(x, -ext, 0), new THREE.Vector3(x, ext, 0));
      pts.push(new THREE.Vector3(-ext, x, 0), new THREE.Vector3(ext, x, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    g.add(new THREE.LineSegments(geo, mat));
    scene.add(g);
    return g;
  }

  // ── Tidal Microscope: test sphere deformed by the live tidal tensor ─────────
  // The BH direction is pinned to −x (Roche co-rotating frame). Radial stretch
  // λ_r and tangential compression are the real volume-preserving deformation.
  R3D.createTidalView = function (canvas) {
    const mini = makeMini(canvas, { dist: 5.2, tilt: 1.05, autoSpin: 0.10 });
    if (!mini) return null;
    const S = mini.scene;
    miniGridFloor(S, 3.6, 0.9, 'oklch(0.20 0.022 255)');
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 26), new THREE.MeshBasicMaterial({ color: 0x888888 }));
    S.add(body);
    // wire overlay so the ellipsoid deformation reads from every angle
    const wire = new THREE.Mesh(new THREE.SphereGeometry(1.002, 18, 12), new THREE.MeshBasicMaterial({
      color: 0xffffff, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false,
    }));
    body.add(wire);
    const line = new LinePool(S, 600, 5);
    const sprite = new SpritePool(S, 24, 20);
    const label = new LabelPool(S, 10);
    let lastT = performance.now();

    mini.update = function (sim, target) {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      line.begin(); sprite.begin(); label.begin(mini.camera, canvas.clientHeight || 120);
      const phys = window.KNphysics;
      body.visible = false;
      if (target && target.state === 'orbit') {
        const r = Math.hypot(target.x, target.y);
        const srcM = (target.tidalM != null) ? target.tidalM : sim.params.M;
        const tidal = phys.tidalStress(r, srcM, target.radius || 0.4, target.binding || 1);
        const stretch = 1 + Math.min(3.5, tidal * 2.5);
        const squish = 1 / Math.sqrt(stretch);
        body.visible = true;
        body.scale.set(stretch, squish, squish);       // radial axis = x (BH at −x)
        const kind = target.kind || 'planet';
        const baseHue = { planet: 210, gas: 75, star: 60, ship: 350, probe: 130 }[kind] || 220;
        const blend = Math.min(1, Math.max(0, (tidal - 0.4) / 0.7));
        const hue = baseHue * (1 - blend) + 28 * blend;
        body.material.color.copy(threeColor(`oklch(${(0.78 - blend * 0.05).toFixed(2)} ${(0.13 + blend * 0.05).toFixed(2)} ${hue.toFixed(0)})`));
        // tidal arrows: red radial stretch (both ends), blue tangential squeeze
        if (tidal > 0.05) {
          const sl = Math.min(1.7, 0.5 + tidal * 0.9);
          const cl = Math.min(1.0, 0.2 + tidal * 0.6);
          const red = cssRGB('oklch(0.72 0.20 28)'), blue = cssRGB('oklch(0.78 0.13 210)');
          const ia = Math.min(1, tidal * 0.6 + 0.4);
          line.seg(stretch, 0, 0, stretch + sl, 0, 0, red, ia);
          line.seg(-stretch, 0, 0, -stretch - sl, 0, 0, red, ia);
          line.seg(0, squish + cl, 0, 0, squish, 0, blue, ia);
          line.seg(0, -squish - cl, 0, 0, -squish, 0, blue, ia);
          line.seg(0, 0, squish + cl, 0, 0, squish, blue, ia);
          line.seg(0, 0, -squish - cl, 0, 0, -squish, blue, ia);
        }
        // BH direction marker (fixed −x in this co-rotating frame)
        const amber = cssRGB('oklch(0.78 0.16 75)');
        for (let k = 0; k < 6; k += 2) {
          line.seg(-2.2 - k * 0.3, 0, 0, -2.35 - k * 0.3, 0, 0, amber, 0.6);
        }
        sprite.add(-3.4, 0, 0, 0.35, amber, 0.8);
        label.add('→ r₊', 'oklch(0.78 0.16 75)', 8, -3.4, 0, 0, [6, -6]);
      } else if (target && target.state === 'spaghettified') {
        // debris filament along the (former) orbit direction
        const age = sim.t - (target.consumedAt || sim.t);
        const red = cssRGB('oklch(0.72 0.20 28)');
        for (let i = 0; i < 28; i++) {
          const tt = (i + 0.5) / 28 - 0.5;
          const along = tt * 5.4;
          const radial = -(tt * 2.8 + Math.sign(tt) * age * 0.5);
          const alpha = Math.max(0, (1 - age / 7)) * (1 - Math.abs(tt) * 0.6);
          sprite.add(radial, along, Math.sin(i * 1.7 + age) * 0.1, 0.35 + Math.abs(tt), red, alpha * 0.6);
        }
        label.add(tr('SPAGHETTIFIED', '已拉麵化'), 'oklch(0.72 0.20 28)', 10, 0, 0, -2.4, [-40, 0], true);
      } else if (target && target.state === 'captured') {
        body.visible = true;
        body.scale.setScalar(1.2);
        body.material.color.setRGB(0.01, 0.01, 0.012);
        line.circle(0, 0, 0, 1.5, cssRGB('oklch(0.78 0.16 75)'), 0.5, true, 40);
        label.add(tr('PAST r₊ · INACCESSIBLE', '越過 r₊ · 不可及'), 'oklch(0.62 0.12 75)', 9, 0, 0, -2.2, [-55, 0]);
      } else if (target) {
        label.add(tr('TRACKED OUT OF FRAME', '已追蹤至畫面外'), 'oklch(0.42 0.014 255)', 9, 0, 0, 0, [-50, 0]);
      } else {
        label.add(tr('NO TARGET ACQUIRED', '尚未取得目標'), 'oklch(0.42 0.014 255)', 10, 0, 0, 0, [-55, 0]);
      }
      line.end(); sprite.end(); label.end();
      mini.frame(dt);
    };
    return mini;
  };

  // ── MHD Jet Monitor: true 3D engine — disc, poloidal field, bipolar jets ────
  R3D.createMHDView = function (canvas) {
    const mini = makeMini(canvas, { dist: 62, tilt: 1.25, autoSpin: 0.08, bg: 'oklch(0.08 0.018 255)' });
    if (!mini) return null;
    const S = mini.scene;
    const line = new LinePool(S, 6000, 5);
    const disc = new PointsPool(S, 900, 3.6, 12);
    const sprite = new SpritePool(S, 24, 20);
    const label = new LabelPool(S, 8);
    const bh = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), new THREE.MeshBasicMaterial({ color: 0x020204 }));
    S.add(bh);
    const ergo = { mesh: null, key: '' };
    const jets = [];
    for (const dir of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.2, 1, 20, 1, true), new THREE.MeshBasicMaterial({
        color: threeColor('oklch(0.80 0.17 285)'), transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      cone.rotation.x = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.08, 1, 14, 1, true), new THREE.MeshBasicMaterial({
        color: threeColor('oklch(0.97 0.12 290)'), transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      spine.rotation.x = cone.rotation.x;
      const g = new THREE.Group();
      g.add(cone); g.add(spine);
      g.userData = { cone, spine, dir };
      S.add(g);
      jets.push(g);
    }
    let lastT = performance.now();

    mini.update = function (sim, view) {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const phys = window.KNphysics;
      const { M, Q, a, B } = view.params;
      const m = view.m;
      const dsc = view.disc;
      const { rplus, naked } = phys.horizons(M, Q, a);
      line.begin(); disc.begin(); sprite.begin(); label.begin(mini.camera, canvas.clientHeight || 160);
      // horizon (Kerr-Schild oblate)
      bh.visible = !naked && rplus > 0;
      if (bh.visible) {
        const req = Math.sqrt(rplus * rplus + a * a);
        bh.scale.set(req, req, rplus);
        line.circle(0, 0, 0, req, cssRGB('oklch(0.78 0.16 75)'), 0.7, false, 64);
      }
      // ergosphere shell (rebuilt on param change)
      const ekey = `${M.toFixed(2)}|${Q.toFixed(2)}|${a.toFixed(2)}`;
      if (ergo.key !== ekey) {
        ergo.key = ekey;
        if (ergo.mesh) { S.remove(ergo.mesh); ergo.mesh = null; }
        const rErg = phys.ergosphereEq(M, Q);
        if (!naked && rErg && rErg > rplus && Math.abs(a) > 0.01) {
          const sl = {};
          ergo.mesh = rebuildErgo(sl, M, Q, a);
          S.add(ergo.mesh);
        }
      }
      // disc particles at their TRUE positions around the host (z = flared height)
      const oc = view.center || { x: 0, y: 0 };
      if (dsc && dsc.enabled) {
        const LUT = discLUT();
        for (const p of dsc.particles) {
          const dx = p.x - oc.x, dy = p.y - oc.y;
          const r = Math.hypot(dx, dy);
          if (p._z0 === undefined) p._z0 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.66;
          disc.add(dx, dy, p._z0 * 0.055 * r, LUT[Math.min(63, Math.round(p.t * 63))], 0.35 + p.t * 0.3);
        }
      }
      // poloidal field lines revolved around the spin axis
      const Bvis = (dsc && dsc.enabled) ? Math.max(B, 0.18) : B;
      if (Bvis > 0.02) {
        const alpha = 0.20 + Bvis * 0.35;
        const rgb = cssRGB('oklch(0.70 0.13 200)');
        for (const r0 of [2.5, 5.5, 9, 13, 17.5]) {
          for (let az = 0; az < 8; az++) {
            const ca = Math.cos(az / 8 * Math.PI * 2), sa = Math.sin(az / 8 * Math.PI * 2);
            let px0 = 0, py0 = 0, pz0 = 0, started = false;
            for (let t = 0; t <= 1.0001; t += 0.06) {
              const zFrac = (t - 0.5) * 2;
              const zz = zFrac * 24;
              const compress = 1 - Math.exp(-(zFrac * zFrac) * 3) * 0.55;
              const rr = r0 * compress;
              const px = ca * rr, py = sa * rr;
              if (started) line.seg(px0, py0, pz0, px, py, zz, rgb, alpha * 0.5);
              px0 = px; py0 = py; pz0 = zz; started = true;
            }
          }
        }
        // helical twist (frame dragging × B): rotating tick ring
        if (Math.abs(a) > 0.1) {
          const rgb2 = cssRGB('oklch(0.75 0.15 250)');
          const dirSign = Math.sign(a);
          for (let k = 0; k < 10; k++) {
            const phase = (sim.t * dirSign * 0.6 + k * Math.PI / 5);
            const zz = Math.sin(phase) * 20;
            const rr = 4.5 + Math.cos(phase) * 1.2;
            const aa = phase * 1.7;
            line.seg(Math.cos(aa) * rr, Math.sin(aa) * rr, zz, Math.cos(aa + 0.5) * rr, Math.sin(aa + 0.5) * rr, zz, rgb2, alpha * 0.6);
          }
        }
      }
      // bipolar jets
      const on = m && m.P > 0.3;
      const lum = on ? Math.min(1, m.P / 30) : 0;
      for (const g of jets) {
        g.visible = !!on;
        if (!on) continue;
        const opening = m.theta * Math.PI / 180;
        const len = 22;
        const baseR = 1 + lum * 0.8;
        const tipR = Math.max(baseR * 1.3, baseR + Math.tan(opening) * len * 1.2);
        const flick = 0.85 + 0.15 * Math.sin(sim.t * 9);
        g.position.z = g.userData.dir * (len / 2 + 1);
        g.userData.cone.scale.set(tipR, len, tipR);
        g.userData.cone.material.opacity = (0.07 + lum * 0.12) * flick;
        g.userData.spine.scale.set(tipR, len, tipR);
        g.userData.spine.material.opacity = (0.14 + lum * 0.22) * flick;
        // Mach knots
        if (m.gamma > 3) {
          const knots = Math.min(5, Math.floor(m.gamma / 4));
          for (let i = 1; i <= knots; i++) {
            const f = i / (knots + 1);
            line.circle(0, 0, g.userData.dir * (1 + f * len), (baseR + (tipR - baseR) * f) * 0.5, cssRGB('#ffffff'), 0.5 * lum * flick, false, 22);
          }
        }
      }
      // spin axis
      if (Math.abs(a) > 0.05) {
        const rgb = cssRGB('oklch(0.78 0.13 210)');
        for (let k = -12; k < 12; k += 2) line.seg(0, 0, k * 2, 0, 0, k * 2 + 1.2, rgb, 0.35);
        label.add('Ω', 'oklch(0.78 0.13 210)', 8, 0, 0, 25, [4, 0]);
      }
      // reconnection sparkles at their true 3D positions
      if (dsc) {
        for (const f of dsc.reconnects) {
          const t = f.age / f.life;
          sprite.add(f.x - oc.x, f.y - oc.y, Math.sin(f.ang * 2) * 0.5, 1.2 + (1 - t) * 2, cssRGB('oklch(0.96 0.18 320)'), (1 - t) * 0.8);
        }
      }
      line.end(); disc.end(); sprite.end(); label.end();
      mini.frame(dt);
    };
    return mini;
  };

  // ── Gravitational field scope: embedding funnel / GW strain sheet ──────────
  // kind 'field' → the gravity well as a REAL funnel surface (what the 2D view
  // could only shade as a heatmap); kind 'gw' → the strain as a rippling sheet.
  R3D.createFieldView = function (canvas, kind) {
    const mini = makeMini(canvas, { dist: 62, tilt: 1.02, autoSpin: 0.10, bg: 'oklch(0.10 0.018 255)' });
    if (!mini) return null;
    const S = mini.scene;
    const line = new LinePool(S, 14000, 5);
    const label = new LabelPool(S, 4);
    const N = 40;                       // grid nodes per side
    let lastT = performance.now();

    mini.update = function (sim, opts) {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      line.begin(); label.begin(mini.camera, canvas.clientHeight || 160);
      const span = (opts && opts.span) || 22;
      const center = (opts && opts.center) || { x: 0, y: 0 };
      mini.dist = span * 2.9;
      const bin = sim.binary;
      const masses = [];
      if (bin && bin.enabled) {
        masses.push({ x: bin.x1, y: bin.y1, m: sim.params.M });
        masses.push({ x: bin.x2, y: bin.y2, m: bin.M2 });
      } else {
        masses.push({ x: 0, y: 0, m: sim.params.M });
      }
      let gw = null;
      if (kind === 'gw') {
        // mirror knGwParams (field-profile.jsx)
        if (bin && bin.enabled) {
          const pet = bin.lastPeters || { omega: 0, Mc: 0 };
          gw = { ok: true, cx: bin.cx || 0, cy: bin.cy || 0,
                 omegaGW: Math.max(0.15, (pet.omega || 0) * 2),
                 hAmp: Math.max(0.12, Math.min(1.2, (pet.Mc || 0) * 0.9 / Math.max(0.5, bin.d || 1))) };
        } else {
          let best = null, bestScore = 0;
          for (const b of sim.bodies) {
            if (b.state !== 'orbit' || b._cloud) continue;
            const r = Math.hypot(b.x, b.y);
            if (r < 0.5 || r > 40) continue;
            const v = Math.hypot(b.vx, b.vy);
            const score = v / Math.max(0.5, r);
            if (score > bestScore) { bestScore = score; best = b; }
          }
          if (best) {
            const r = Math.hypot(best.x, best.y);
            const v = Math.hypot(best.vx, best.vy);
            gw = { ok: true, cx: 0, cy: 0, omegaGW: Math.max(0.15, (v / Math.max(1, r)) * 2), hAmp: Math.min(1, 0.3 + 3.5 / Math.max(1.5, r)) };
          } else gw = { ok: false };
        }
        if (!gw.ok) {
          label.add(tr('NO GW SOURCE', '無重力波源'), 'oklch(0.46 0.014 255)', 10, 0, 0, 0, [-45, 0]);
          line.end(); label.end();
          mini.frame(dt);
          return;
        }
      }
      const t = sim.t || 0;
      const vwave = 4;
      const kGW = gw ? Math.max(0.45, Math.min(1.6, gw.omegaGW * 3.3)) : 0;
      const omegaVis = kGW * vwave;
      // sample the surface: z = −funnel (field) or GW ripple (gw)
      const zOf = (wx, wy, out) => {
        if (kind === 'gw') {
          const ex = wx - gw.cx, ey = wy - gw.cy;
          const r = Math.hypot(ex, ey) + 0.6;
          const th = Math.atan2(ey, ex);
          const env = gw.hAmp / Math.sqrt(r) * Math.exp(-r / 90);
          const val = env * Math.cos(2 * th + kGW * r - omegaVis * t);
          out.z = val * 10;
          out.v = Math.max(-1, Math.min(1, val * 4));
          return;
        }
        let well = 0;
        for (const s of masses) well += s.m / (Math.hypot(wx - s.x, wy - s.y) + 0.5);
        out.z = -Math.min(span * 0.6, well * 6);
        out.v = Math.min(1, well * 0.55);
      };
      const crest = cssRGB('oklch(0.62 0.07 70)');
      const trough = cssRGB('oklch(0.55 0.07 262)');
      const wellRGB = cssRGB('oklch(0.60 0.06 255)');
      const o1 = { z: 0, v: 0 }, o2 = { z: 0, v: 0 };
      const smp = (i, j, o) => {
        const wx = center.x + ((i / (N - 1)) - 0.5) * 2 * span;
        const wy = center.y + ((j / (N - 1)) - 0.5) * 2 * span;
        zOf(wx, wy, o);
        o.x = ((i / (N - 1)) - 0.5) * 2 * span;
        o.y = ((j / (N - 1)) - 0.5) * 2 * span;
      };
      const segCol = (v) => {
        if (kind === 'gw') return v >= 0 ? crest : trough;
        return wellRGB;
      };
      const segA = (v) => kind === 'gw'
        ? Math.max(0.10, Math.min(0.6, 0.16 + 0.45 * Math.abs(v)))
        : Math.max(0.10, Math.min(0.62, 0.14 + 0.5 * v));
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N - 1; i++) {
          smp(i, j, o1); smp(i + 1, j, o2);
          const v = (o1.v + o2.v) / 2;
          line.seg(o1.x, o1.y, o1.z, o2.x, o2.y, o2.z, segCol(v), segA(v));
        }
      }
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N - 1; j++) {
          smp(i, j, o1); smp(i, j + 1, o2);
          const v = (o1.v + o2.v) / 2;
          line.seg(o1.x, o1.y, o1.z, o2.x, o2.y, o2.z, segCol(v), segA(v));
        }
      }
      label.add('±' + span.toFixed(0) + ' M', 'oklch(0.58 0.012 255)', 8, -span, -span, 0, [0, 12]);
      line.end(); label.end();
      mini.frame(dt);
    };
    return mini;
  };

  window.KNRender3D = R3D;
  window.dispatchEvent(new CustomEvent('kn3d-ready'));
})();
