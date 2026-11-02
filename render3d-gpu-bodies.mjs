/**
 * Instanced N-body meshes — Phase 5 of GPU-RENDER-PLAN.md.
 *
 * render3d.mjs gives every orbiting body its own Mesh, with its own geometry
 * and material, so the scene pass costs one draw call per body. This layer
 * draws the same bodies as one InstancedMesh per shape (sphere, ship cone,
 * probe box) — three draw calls however many bodies there are.
 *
 * The per-body meshes stay the source of truth: drawBodies() still creates,
 * positions, scales, rotates and retires them every frame, and this layer only
 * copies each one's local matrix and colour into an instance slot and then
 * hides it for the frame. drawBodies() sets `visible = true` again on the next
 * frame, so turning the layer off needs no restore step and render3d.mjs keeps
 * a zero diff.
 *
 * Geometry and material match bodyMesh() in render3d.mjs exactly: the same
 * three primitives, an opaque MeshBasicMaterial and renderOrder 9. The colour
 * moves from the material's `color` uniform to `instanceColor`, which the
 * basic shader multiplies in the same linear space, so the frame is identical.
 */

import * as THREE from './vendor/three.module.js';

export const BODIES = {
  enabled: true,
};

const START_CAP = 64;

// Must match bodyMesh() in render3d.mjs; the kind -> shape rule is copied too.
const SHAPES = {
  sphere: () => new THREE.SphereGeometry(0.5, 20, 14),
  ship: () => new THREE.ConeGeometry(0.45, 1.3, 10),
  probe: () => new THREE.BoxGeometry(0.7, 0.7, 0.7),
};

function shapeOf(kind) {
  return kind === 'ship' || kind === 'probe' ? kind : 'sphere';
}

// ── One shape ────────────────────────────────────────────────────────────────
class BodyBatch {
  constructor(scene, shape) {
    this.scene = scene;
    this.geo = SHAPES[shape]();
    // White base colour: the basic shader computes color * instanceColor.
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = null;
    this.cap = 0;
    this._alloc(START_CAP);
  }

  _alloc(cap) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
    }
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    // Instances move every frame; Three would cache one bounding sphere for
    // the whole batch and cull it against stale positions.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.count = 0;
    this.scene.add(this.mesh);
  }

  fill(list) {
    const n = list.length;
    if (n > this.cap) {
      let cap = this.cap;
      while (cap < n) cap *= 2;
      this._alloc(cap);
    }
    const im = this.mesh;
    for (let i = 0; i < n; i++) {
      const m = list[i];
      m.updateMatrix();
      im.setMatrixAt(i, m.matrix);
      im.setColorAt(i, m.material.color);
    }
    im.count = n;
    im.visible = n > 0;
    if (n > 0) {
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
    }
  }

  hide() {
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ── Public surface ───────────────────────────────────────────────────────────
export class GpuBodyLayer {
  constructor(R) {
    this.batches = {};
    for (const shape in SHAPES) this.batches[shape] = new BodyBatch(R.scene, shape);
    this.lists = { sphere: [], ship: [], probe: [] };
  }

  // Called after drawBodies() and before the scene is traversed.
  update(R) {
    const map = R.bodyMeshes;
    if (!BODIES.enabled || !map) {
      for (const shape in this.batches) this.batches[shape].hide();
      return;
    }
    for (const shape in this.lists) this.lists[shape].length = 0;
    for (const e of map.values()) {
      const m = e.mesh;
      // Only bodies drawBodies() showed this frame; a mesh parented anywhere
      // but the scene root would need matrixWorld, which none is.
      if (!m || !m.visible || m.parent !== R.scene) continue;
      this.lists[shapeOf(e.kind)].push(m);
      m.visible = false;
    }
    for (const shape in this.batches) this.batches[shape].fill(this.lists[shape]);
  }

  dispose(R) {
    for (const shape in this.batches) this.batches[shape].dispose();
    if (R && R.bodyMeshes) for (const e of R.bodyMeshes.values()) if (e.mesh) e.mesh.visible = true;
  }
}
