/**
 * Instanced line quads for the shared LinePool — Phase 5 of GPU-RENDER-PLAN.md.
 *
 * render3d.mjs draws every orbit trail, grid ring, field line and indicator
 * through one LinePool: a THREE.LineSegments with LineBasicMaterial, i.e. GL
 * lines, which are always one target pixel wide whatever is asked of them.
 * This layer draws the same segments as screen-space quads, one instance per
 * segment, so the width becomes a real control and stays one *device* pixel
 * when the post stack renders below canvas resolution (quality 'medium').
 *
 * Zero copy: the instance attributes are interleaved views straight onto the
 * pool's own `pos` / `col` Float32Arrays, whose per-segment layout
 * [x1 y1 z1 x2 y2 z2] / [r g b r g b] is exactly two vec3 per instance. Only
 * the used prefix is uploaded each frame. LinePool.seg() keeps its signature,
 * so every draw* function — and the Phase 4 filter on seg() — is untouched;
 * only the pool's LineSegments is hidden while this layer is up.
 *
 * Colours arrive premultiplied and linear, exactly as LineBasicMaterial got
 * them, and blend additively the same way.
 */

import * as THREE from './vendor/three.module.js';

export const LINES = {
  enabled: true,
  // Device pixels at full resolution. Calibrated, not guessed: the integrated
  // line energy of the frame matches the GL lines this replaces at 1.373-1.380
  // over camera tilts 0.25-1.35 rad. A GL line covers one pixel per step of
  // its MAJOR axis, so diagonals and short trail segments carry more than a
  // 1 px-wide quad does.
  width: 1.375,
};

function quadGeometry(pool) {
  const geo = new THREE.InstancedBufferGeometry();
  // x: 0 at the segment start, 1 at its end; y: -1 / +1 across it.
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0,
  ], 3));
  geo.setIndex([0, 2, 1, 2, 3, 1]);
  const pos = new THREE.InstancedInterleavedBuffer(pool.pos, 6, 1).setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.InstancedInterleavedBuffer(pool.col, 6, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', new THREE.InterleavedBufferAttribute(pos, 3, 0));
  geo.setAttribute('iB', new THREE.InterleavedBufferAttribute(pos, 3, 3));
  geo.setAttribute('iColor', new THREE.InterleavedBufferAttribute(col, 3, 0));
  geo.instanceCount = 0;
  return { geo, pos, col };
}

function lineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uViewport: { value: new THREE.Vector2(1, 1) },
      uWidth: { value: 1.0 },
      uNear: { value: 0.1 },
    },
    vertexShader: `
      attribute vec3 iA;
      attribute vec3 iB;
      attribute vec3 iColor;
      uniform vec2 uViewport;
      uniform float uWidth;
      uniform float uNear;
      varying vec3 vColor;
      void main() {
        vColor = iColor;
        vec4 a = modelViewMatrix * vec4(iA, 1.0);
        vec4 b = modelViewMatrix * vec4(iB, 1.0);
        // Trim against the near plane in view space first: with an endpoint
        // behind the camera the projected direction flips, and the quad would
        // smear across the whole screen. GL lines get this from clipping.
        float zn = -uNear;
        if (a.z > zn && b.z > zn) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        if (a.z > zn) a = mix(a, b, (zn - a.z) / (b.z - a.z));
        else if (b.z > zn) b = mix(b, a, (zn - b.z) / (a.z - b.z));
        vec4 ca = projectionMatrix * a;
        vec4 cb = projectionMatrix * b;
        // ('half' is a reserved word in GLSL ES 3.0.)
        vec2 hv = 0.5 * uViewport;
        vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * hv;
        float len = length(d);
        vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        vec4 c = position.x < 0.5 ? ca : cb;
        c.xy += nrm * (position.y * 0.5 * uWidth) / hv * c.w;
        gl_Position = c;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(vColor, 1.0);
        // Identity into the linear HDR target, as for the point sprites.
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const _size = new THREE.Vector2();

// ── Public surface ───────────────────────────────────────────────────────────
export class GpuLineLayer {
  constructor(R) {
    this.pool = R.pools && R.pools.line;
    this.mesh = null;
    if (!this.pool) return;
    const q = quadGeometry(this.pool);
    this.geo = q.geo;
    this.posBuf = q.pos;
    this.colBuf = q.col;
    this.mat = lineMaterial();
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    // Positions come from instance attributes; the base quad's bounds mean
    // nothing, so Three would cull the batch from most camera angles.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = this.pool.obj.renderOrder;
    this.mesh.visible = false;
    R.scene.add(this.mesh);
  }

  // Called after LinePool.end() and before the scene is traversed. `scale`
  // is the post stack's render scale, so the width stays in device pixels.
  update(R, scale) {
    const pool = this.pool;
    if (!this.mesh) return;
    const n = pool.n;
    if (!LINES.enabled) {
      this.mesh.visible = false;
      pool.obj.visible = true;
      return;
    }
    pool.obj.visible = false;
    this.mesh.visible = n > 0;
    this.geo.instanceCount = n;
    if (n === 0) return;
    for (const buf of [this.posBuf, this.colBuf]) {
      buf.clearUpdateRanges();
      buf.addUpdateRange(0, n * 6);
      buf.needsUpdate = true;
    }
    const s = scale > 0 ? scale : 1;
    R.renderer.getDrawingBufferSize(_size);
    const u = this.mat.uniforms;
    u.uViewport.value.set(Math.max(2, Math.round(_size.x * s)), Math.max(2, Math.round(_size.y * s)));
    u.uWidth.value = Math.max(0, LINES.width) * s;
    u.uNear.value = R.camera.near;
  }

  dispose(R) {
    if (!this.mesh) return;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
    if (this.pool && this.pool.obj) this.pool.obj.visible = true;
    this.mesh = null;
  }
}
