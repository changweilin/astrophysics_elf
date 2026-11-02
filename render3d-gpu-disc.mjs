/**
 * Relativistic accretion disc — Phase 2 of GPU-RENDER-PLAN.md.
 *
 * A shader-driven annulus that takes over the *look* of the `disc` point pool
 * while the GPU layer is installed. The pool itself keeps running untouched:
 * it still owns accretion, capture, mDot and the reconnection flares, and it
 * comes straight back the moment the layer is turned off. Only the appearance
 * moves here, which is why `render3d.mjs` still has a zero diff.
 *
 * Redshift is the standard no-bending disc model, exact for equatorial
 * circular geodesics in Kerr:
 *
 *   Omega = s sqrt(M) / (r^3/2 + |a| sqrt(M))            prograde w.r.t. spin
 *   u^t   = (r^3/2 + |a| sqrt(M))
 *           / sqrt(r^3 - 3 M r^2 + 2 |a| sqrt(M) r^3/2)
 *   b     = x n_y - y n_x                   photon impact parameter L/E
 *   g     = 1 / (u^t (1 - Omega b))         nu_obs / nu_em
 *
 * Face-on (b = 0, a = 0) this collapses to g = sqrt(1 - 3M/r), the textbook
 * circular-orbit redshift, and edge-on it produces the one-sided Doppler
 * beaming. The u^t denominator vanishes at the *photon* orbit, which is always
 * inside the prograde ISCO, so the expression stays finite everywhere the disc
 * actually exists.
 *
 * Light bending is NOT included — rays run straight from the emitting ring to
 * the observer. That is exactly what Phase 3 replaces, and it is why the far
 * side of the disc is not yet lifted into an arc over the shadow.
 *
 * Emission is Novikov-Thorne: T(r) ~ r^-3/4 (1 - sqrt(r_in/r))^1/4, which
 * vanishes at the inner edge and peaks at (49/36) r_in. Colour and brightness
 * are both driven by the *observed* temperature g*T, so the approaching side
 * runs blue and bright and the receding side red and dim out of one quantity
 * rather than two tuned ones.
 */

import * as THREE from './vendor/three.module.js';

const RADIAL = 160;
const ANGULAR = 256;
const TWO_PI = Math.PI * 2;

export const DISC = {
  enabled: true,
  // I_obs = g^gExp I_em. 4 is the bolometric Liouville result and the right
  // default for a blackbody disc; the monochromatic power-law form in the plan
  // doc, g^(3+alpha), is this knob set to 3 + alpha.
  gExp: 4.0,
  brightness: 0.45,
  turbulence: 0.55,
  // Scale height h = flare * r. Same constant the point pool uses for its own
  // flaring, so the two agree if both are drawn.
  flare: 0.055,
  // Palette mapping only, NOT physics: the LUT is indexed by
  // (T_obs/T_peak)^colorGamma. At 1.0 the whole surface collapses into the
  // blue end of the ramp, because a Novikov-Thorne disc really is near its
  // peak temperature over most of its area. 2.5 spreads the existing ramp
  // across the visible annulus instead.
  colorGamma: 2.5,
  // Display clamp on the final intensity, so a near-edge-on blueshift cannot
  // hand the bloom pass an arbitrarily large value. Physics is unclamped up
  // to here.
  maxIntensity: 6.0,
  // How fast the ramp gives up its chroma at the hot end. The shared ramp in
  // render3d.mjs runs to oklch(0.95 0.20 230) — a saturated cyan that the
  // point pool never actually reached, because its index is 1 - r/22 and tops
  // out near 0.73. Driving the index from real temperature does reach it, and
  // it reads as neon. A blackbody's chromaticity converges to blue-white as it
  // heats rather than saturating further, so the excess is carried as
  // desaturation. 0 keeps the raw ramp.
  hotDesat: 1.1,
  // Leave the point pool drawing on top of the surface.
  showPoints: false,
};

// ── Shared GLSL ──────────────────────────────────────────────────────────────
// 3D value noise: the disc has to tile seamlessly in azimuth, so the field is
// sampled on a cylinder — (cos psi, sin psi) around, log r along — which a 2D
// noise cannot do without a visible seam at phi = 0.
const NOISE_GLSL = `
  float hash13(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i),                  n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0,1.0,0.0)), n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0,0.0,1.0)), n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0,1.0,1.0)), n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }
  float fbm3(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
    return s;
  }
  // Domain warp: sampling the field at a position pushed around by a lower
  // frequency copy of itself is what turns bland fbm into filaments and
  // reconnection sheets. One octave for the warp keeps this at six noise
  // lookups per fragment instead of twenty-four.
  float turb(vec3 p) {
    vec3 w = vec3(vnoise(p * 0.7 + 11.3),
                  vnoise(p * 0.7 + 47.9),
                  vnoise(p * 0.7 + 93.1)) - 0.5;
    return fbm3(p + w * 1.5);
  }
`;

// Keplerian geometry, shared by both stages so the vertex displacement and the
// fragment shading agree on where a given patch of gas is.
const ORBIT_GLSL = `
  uniform float uRin, uRout, uM, uAabs, uSpin, uTime;
  float omegaAt(float r) {
    return uSpin * sqrt(uM) / (pow(r, 1.5) + uAabs * sqrt(uM));
  }
  // Noise sample point for radius r and azimuth phi, sheared by the orbit.
  // Because Omega falls with r, the same pattern winds itself into trailing
  // spirals with no explicit spiral term anywhere.
  vec3 gasPoint(float r, float phi) {
    float psi = phi - omegaAt(r) * uTime;
    return vec3(cos(psi), sin(psi), 0.0) * 2.4
         + vec3(0.0, 0.0, log(r / uRin) * 3.1);
  }
`;

// ── Geometry ─────────────────────────────────────────────────────────────────
// `position` carries (u, v) parameters, not coordinates: the vertex shader
// places every vertex from uRin/uRout, so the mesh survives any change of
// mass, spin or charge without a rebuild.
function annulusGeometry(radial, angular) {
  const rows = radial + 1, cols = angular + 1;
  const pos = new Float32Array(rows * cols * 3);
  let k = 0;
  for (let i = 0; i < rows; i++) {
    const u = i / radial;
    for (let j = 0; j < cols; j++) { pos[k++] = u; pos[k++] = j / angular; pos[k++] = 0; }
  }
  const idx = new Uint32Array(radial * angular * 6);
  let m = 0;
  for (let i = 0; i < radial; i++) {
    for (let j = 0; j < angular; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx[m++] = a; idx[m++] = c; idx[m++] = b;
      idx[m++] = b; idx[m++] = c; idx[m++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// ── Colour ramp ──────────────────────────────────────────────────────────────
let _lut = null;
function lutTexture() {
  if (_lut) return _lut;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 1;
  const g = c.getContext('2d');
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    // Same ramp as discLUT() in render3d.mjs, so the surface and the point
    // pool agree on what a given temperature looks like.
    g.fillStyle = `oklch(${0.55 + t * 0.4} ${0.12 + t * 0.08} ${30 + t * 200})`;
    g.fillRect(i, 0, 1, 1);
  }
  _lut = new THREE.CanvasTexture(c);
  // 8-bit RGBA plus SRGBColorSpace gets an SRGB8_ALPHA8 internal format, so the
  // sampler decodes to linear in hardware — which is the space this whole layer
  // works in. A render *target*'s colorSpace is ignored in r169; an ordinary
  // texture's is honoured. See GPU-RENDER-PLAN.md.
  _lut.colorSpace = THREE.SRGBColorSpace;
  _lut.minFilter = _lut.magFilter = THREE.LinearFilter;
  _lut.wrapS = _lut.wrapT = THREE.ClampToEdgeWrapping;
  _lut.generateMipmaps = false;
  return _lut;
}

// ── Material ─────────────────────────────────────────────────────────────────
function discMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRin: { value: 6 }, uRout: { value: 26 },
      uM: { value: 1 }, uAabs: { value: 0 }, uSpin: { value: 1 },
      uTime: { value: 0 },
      uObs: { value: new THREE.Vector3(0, 0, 1) },
      uTnorm: { value: 1 },
      uRel: { value: 1 },
      uGExp: { value: DISC.gExp },
      uBright: { value: DISC.brightness },
      uTurb: { value: DISC.turbulence },
      uFlare: { value: DISC.flare },
      uGamma: { value: DISC.colorGamma },
      uMaxI: { value: DISC.maxIntensity },
      uDesat: { value: DISC.hotDesat },
      uLUT: { value: lutTexture() },
    },
    vertexShader: `
      ${NOISE_GLSL}
      ${ORBIT_GLSL}
      uniform float uFlare, uTurb;
      varying float vU;
      varying float vR;
      varying vec2 vXY;
      void main() {
        vU = position.x;
        float phi = position.y * 6.283185307179586;
        // Logarithmic radial spacing: constant resolution per e-fold, which
        // puts the tessellation where the gradients are — the inner edge.
        float r = uRin * pow(uRout / uRin, vU);
        vR = r;
        vXY = vec2(cos(phi), sin(phi)) * r;
        // Flared scale height h = uFlare * r, corrugated by the same field the
        // fragment stage shades with so the warp and the filaments line up.
        float z = uFlare * r * (turb(gasPoint(r, phi) * 0.6) - 0.5) * 2.0 * uTurb;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vXY, z, 1.0);
      }
    `,
    fragmentShader: `
      ${NOISE_GLSL}
      ${ORBIT_GLSL}
      uniform vec3 uObs;
      uniform float uTnorm, uRel, uGExp, uBright, uTurb, uGamma, uMaxI, uDesat;
      uniform sampler2D uLUT;
      varying float vU;
      varying float vR;
      varying vec2 vXY;

      void main() {
        float r = vR;

        // Novikov-Thorne temperature, normalised by its own peak on the CPU.
        // The (1 - sqrt(rin/r))^1/4 factor is the zero-torque inner boundary:
        // it is why a real disc has a dark rim rather than a bright one.
        float Tem = pow(r, -0.75) * pow(max(1.0 - sqrt(uRin / r), 0.0), 0.25) / uTnorm;

        // Exact Kerr equatorial circular geodesic (see the file header).
        float sqM = sqrt(uM);
        float r15 = pow(r, 1.5);
        float den = r * r * r - 3.0 * uM * r * r + 2.0 * uAabs * sqM * r15;
        float ut = (r15 + uAabs * sqM) / sqrt(max(den, 1e-5));
        float om = omegaAt(r);
        // b = (x n_y - y n_x) is the photon's L/E for a straight ray to the
        // observer. Omega*b stays below 1 for any r > M, but the max() keeps a
        // degenerate camera from producing a divide by zero.
        float b = vXY.x * uObs.y - vXY.y * uObs.x;
        float g = 1.0 / max(ut * (1.0 - om * b), 1e-3);
        g = mix(1.0, g, uRel);

        float Tobs = g * Tem;

        // Turbulence, advected with the orbit.
        float n = turb(gasPoint(r, atan(vXY.y, vXY.x)));
        float dens = mix(1.0, 0.35 + 1.3 * n, uTurb);

        // Stefan-Boltzmann in the observed frame: one quantity sets both how
        // bright and how blue a patch is.
        float I = pow(max(Tobs, 0.0), uGExp) * dens * uBright;
        // Fade both rims so the annulus has no cut edge.
        I *= smoothstep(0.0, 0.05, vU) * (1.0 - smoothstep(0.88, 1.0, vU));
        I = min(I, uMaxI);

        float ci = pow(max(Tobs, 0.0), uGamma);
        vec3 col = texture2D(uLUT, vec2(clamp(ci, 0.0, 1.0), 0.5)).rgb;
        // Past the warm half of the ramp, bleed chroma out toward a neutral of
        // the same luminance (see DISC.hotDesat). This is the only reason the
        // approaching side reads as hot blue-white instead of neon cyan.
        float desat = clamp((ci - 0.55) * uDesat, 0.0, 0.75);
        col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), desat);
        gl_FragColor = vec4(col, I);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ── One disc (primary or companion) ──────────────────────────────────────────
class DiscSurface {
  constructor(scene) {
    this.mat = discMaterial();
    this.mesh = new THREE.Mesh(annulusGeometry(RADIAL, ANGULAR), this.mat);
    // Every vertex is placed in the shader, so the CPU-side bounds are
    // meaningless and Three would cull the disc from most camera angles.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  hide() { this.mesh.visible = false; }

  update(sim, host, disc, obs) {
    const phys = window.KNphysics;
    if (!phys || !disc || !disc.enabled || !host) { this.hide(); return false; }

    const isBH = host.type === 'bh';
    let rIn;
    if (isBH) {
      const h = phys.horizons(host.M, host.Q, host.a);
      if (h.naked) { this.hide(); return false; }
      // The emitting surface ends at the ISCO; the point pool keeps plunging
      // inside it, which is where the capture radius (0.85 * ISCO) applies.
      rIn = Math.max(h.rplus * 1.05, phys.isco(host.M, host.a, host.Q));
    } else {
      rIn = Math.max(0.4, host.R_star || 3);
    }
    const rOut = disc.outerR;
    if (!(rOut > rIn * 1.08)) { this.hide(); return false; }

    const u = this.mat.uniforms;
    u.uRin.value = rIn;
    u.uRout.value = rOut;
    u.uM.value = Math.max(1e-6, host.M);
    u.uAabs.value = Math.abs(host.a || 0);
    u.uSpin.value = (host.a || 0) >= 0 ? 1 : -1;   // matches spawnParticle()
    u.uRel.value = isBH ? 1 : 0;
    u.uTime.value = sim.t;
    u.uObs.value.copy(obs);
    u.uTnorm.value = ntPeak(rIn);
    u.uGExp.value = DISC.gExp;
    u.uBright.value = DISC.brightness;
    u.uTurb.value = DISC.turbulence;
    u.uFlare.value = DISC.flare;
    u.uGamma.value = DISC.colorGamma;
    u.uMaxI.value = DISC.maxIntensity;
    u.uDesat.value = DISC.hotDesat;

    this.mesh.position.set(host.cx, host.cy, 0);
    this.mesh.visible = true;
    return true;
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// Peak of r^-3/4 (1 - sqrt(rin/r))^1/4, which sits at (49/36) rin.
function ntPeak(rIn) {
  const rp = rIn * 49 / 36;
  return Math.pow(rp, -0.75) * Math.pow(Math.max(1 - Math.sqrt(rIn / rp), 0), 0.25) || 1;
}

// ── Host description (mirrors primaryHost / companionHost in disc.js) ────────
function primaryHost(sim) {
  const bin = sim.binary, useBin = !!(bin && bin.enabled);
  const p = sim.primary;
  return {
    cx: useBin ? bin.x1 : p.x, cy: useBin ? bin.y1 : p.y,
    M: sim.params.M, Q: sim.params.Q, a: sim.params.a,
    type: sim.params.type || 'bh', R_star: sim.params.R_star || 3,
  };
}
function companionHost(sim) {
  const bin = sim.binary;
  if (!bin || !bin.enabled) return null;
  return {
    cx: bin.x2, cy: bin.y2,
    M: bin.M2, Q: bin.Q2 || 0, a: bin.a2 || 0,
    type: bin.type || 'bh', R_star: bin.R_star2 || 3,
  };
}

// ── Public surface ───────────────────────────────────────────────────────────
const _obs = new THREE.Vector3();

export class GpuDiscLayer {
  constructor(R) {
    this.primary = new DiscSurface(R.scene);
    this.companion = new DiscSurface(R.scene);
  }

  update(R) {
    const sim = R.sim;
    const pool = R.pools && R.pools.disc;
    const on = DISC.enabled && sim && sim.view && sim.view.mode3d && window.KNDisc;
    if (!on) {
      this.primary.hide(); this.companion.hide();
      if (pool && pool.obj) pool.obj.visible = true;
      return;
    }
    // The observer direction is the camera offset from the view target, which
    // is the pan-independent part of the rig (see applyCamera in render3d.mjs).
    _obs.set(
      R.camera.position.x + sim.view.ox,
      R.camera.position.y + sim.view.oy,
      R.camera.position.z,
    );
    if (_obs.lengthSq() < 1e-12) _obs.set(0, 0, 1);
    _obs.normalize();

    const a = this.primary.update(sim, primaryHost(sim), sim.disc, _obs);
    const b = this.companion.update(sim, companionHost(sim), sim.disc2, _obs);
    // The pool draws the same gas; leaving both on doubles the emission.
    if (pool && pool.obj) pool.obj.visible = DISC.showPoints || !(a || b);
  }

  dispose(R) {
    this.primary.dispose();
    this.companion.dispose();
    const pool = R && R.pools && R.pools.disc;
    if (pool && pool.obj) pool.obj.visible = true;
  }
}
