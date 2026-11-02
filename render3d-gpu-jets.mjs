/**
 * Volumetric Blandford-Znajek jets — Phase 4 of GPU-RENDER-PLAN.md.
 *
 * Replaces the *look* of the two unlit `CylinderGeometry` cones in
 * `render3d.mjs` with a raymarched bipolar volume plus instanced field-line
 * ribbons. `render3d.mjs` keeps its zero diff: the cones are hidden by
 * flipping `visible` on the meshes `jetSlot()` already parked in
 * `R.jetSlots[key]`, and everything comes straight back when the layer is
 * turned off.
 *
 * All geometry comes from `drawJet`'s own expressions, re-derived here from
 * the same `KNDisc.jetMetrics` fields, so the volume occupies exactly the
 * space the cones did:
 *
 *   lum  = min(1, P / 30)
 *   len  = 6 + 10 lum          baseR = 0.5 + 0.8 lum
 *   tipR = max(1.4 baseR, baseR + tan(theta) len 1.2)
 *
 * The one piece of physics this layer adds is relativistic beaming, which the
 * cones never had. For a *steady* jet the observed intensity goes as
 * D^(2+alpha) with the Doppler factor
 *
 *   beta = sqrt(1 - 1/Gamma^2)
 *   D    = 1 / (Gamma (1 - beta cos(theta_obs)))
 *
 * and alpha ~ 0.7 for optically thin synchrotron, hence `beamExp` 2.7. The
 * discrete-blob exponent 3+alpha would be the knob at 3.7. Gamma is
 * `jetMetrics().gamma`; nothing is invented in the shader.
 *
 * D itself is NOT used as an absolute scale. Looking down the barrel of a
 * Gamma = 10 jet gives D ~ 20 and D^2.7 ~ 3000, which would blow the frame
 * out for a reason that is an artefact of normalisation rather than physics.
 * The pair is normalised so the brighter lobe is 1 and the counter-jet carries
 * the physical RATIO (D_dn / D_up)^beamExp. That ratio is the falsifiable
 * content: edge-on it is 1, and it collapses toward zero as the axis swings
 * toward the camera.
 *
 * Depth: the volume draws with `depthTest: false`, so it is not occluded by
 * the central sphere. That is deliberate — a raymarch needs the scene depth
 * buffer to clip against, and Phase 1's HDR target is multisampled, which
 * rules out a depth texture in Three r169. The case it would matter for is
 * the counter-jet seen through the hole, and there the beaming factor has
 * already driven it to near zero, because a lobe is hidden behind the horizon
 * exactly when it points away. Emission is also faded out inside r+, where
 * there is none.
 */

import * as THREE from './vendor/three.module.js';
import { NOISE_GLSL } from './render3d-gpu-disc.mjs';

const TWO_PI = Math.PI * 2;
const STEPS_MAX = 64;                 // GLSL1 loop bound; uSteps breaks early
const RIBBON_SEG = 72;
const RIBBON_LINES = 4;               // phase 0/pi x dir +-1, same as drawJet

export const JETS = {
  enabled: true,
  // Volume brightness. The cones ran at opacity 0.05-0.12 (outer) and
  // 0.08-0.22 (spine); the march accumulates over the whole chord instead, so
  // this is not the same number. Measured on the most luminous jet the model
  // produces (lum = 1, P = 90): 0.20 lands the frame peak on 223 against the
  // cones' 222, with 0.07% of channels over 248 against their 0.001%. 0.55
  // was the first guess and put 1.3% of the frame at 255 — glare, which the
  // project rule rules out.
  brightness: 0.20,
  density: 1.0,
  turbulence: 0.8,
  // Helix winding over the jet length. 4 is drawJet's `turns`, kept so the
  // ribbons and the volume's advected noise agree on the pitch.
  turns: 4.0,
  // Outflow speed of the noise field along the axis, in noise units per unit
  // sim time. Purely visual: the plasma is relativistic, but matching that
  // literally just strobes.
  flow: 0.6,
  // Mach knot amplitude. The count is min(5, floor(gamma/4)), drawJet's own
  // rule, so knots appear exactly when the old renderer drew them.
  knots: 1.0,
  // 0 switches beaming off entirely (both lobes equal); 1 is the full ratio.
  beaming: 1.0,
  // Steady-jet D^(2+alpha), alpha = 0.7. See the file header.
  beamExp: 2.7,
  // Display clamp on accumulated emission, so a near-axis view cannot hand
  // the bloom pass an unbounded value. Physics is unclamped up to here.
  maxIntensity: 1.2,
  fieldLines: true,
  // Ribbon half-width as a fraction of baseR, so it scales with the jet and
  // reads at any zoom instead of pinning to one device pixel.
  lineWidth: 0.09,
  // Leave the fixed-function cones drawn underneath (A/B comparison).
  showCones: false,
  // 0 = auto from the layer quality setting.
  steps: 0,
};

// ── Colour ramp ──────────────────────────────────────────────────────────────
// Synchrotron-leaning: violet at the soft end, blue-white at the hard end, so
// it sits in the same family as the cone palette it replaces
// (oklch(0.80 0.17 285) outer, oklch(0.97 0.12 290) spine). Chroma falls at
// the hot end for the same reason the disc's does — a hard, bright source
// reads as neon if it also saturates.
let _lut = null;
function lutTexture() {
  if (_lut) return _lut;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 1;
  const g = c.getContext('2d');
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    const L = 0.55 + 0.40 * t;
    const C = 0.15 + 0.04 * Math.sin(Math.PI * t) - 0.08 * t;
    const H = 310 - 60 * t;
    g.fillStyle = `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
    g.fillRect(i, 0, 1, 1);
  }
  _lut = new THREE.CanvasTexture(c);
  // An ordinary texture's colorSpace IS honoured (a render target's is not),
  // so the sampler decodes to linear in hardware — the space this layer works
  // in. See GPU-RENDER-PLAN.md, Phase 1 finding 3.
  _lut.colorSpace = THREE.SRGBColorSpace;
  _lut.minFilter = _lut.magFilter = THREE.LinearFilter;
  _lut.wrapS = _lut.wrapT = THREE.ClampToEdgeWrapping;
  _lut.generateMipmaps = false;
  return _lut;
}

// render3d.mjs's cssRGB is module-private and this file may not import across
// the boundary, so the colours this layer needs are resolved the same way: a
// 1x1 canvas fill read back, which gives the same bytes for the same string.
let _cctx = null;
function cssBytes(css) {
  if (!_cctx) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    _cctx = c.getContext('2d', { willReadFrequently: true });
  }
  _cctx.clearRect(0, 0, 1, 1);
  _cctx.fillStyle = '#000';
  _cctx.fillStyle = css;
  _cctx.fillRect(0, 0, 1, 1);
  const d = _cctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
function cssLinear(css) {
  const d = cssBytes(css);
  // setRGB with SRGBColorSpace converts into the renderer's linear working
  // space, which is what every pass downstream expects.
  return new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
}

// The two colours drawJet gives the lines this layer replaces: the helix and
// the Mach-knot circles. Packed to one int so the per-segment test in the
// LinePool filter is a multiply and a shift, not a string build.
const packed = (r, g, b) => (r << 16) | (g << 8) | b;
let _dropRGB = null;
function dropRGB() {
  if (!_dropRGB) {
    _dropRGB = new Set(['oklch(0.75 0.15 250)', '#ffffff']
      .map((c) => packed.apply(null, cssBytes(c))));
  }
  return _dropRGB;
}

// ── Shared jet-space GLSL ────────────────────────────────────────────────────
// The jet box is never rotated, so modelMatrix is a pure translation to the
// host and local directions equal world directions. Both stages below rely on
// that: it is what lets the fragment shader march in local coordinates using
// `cameraPosition` without an inverse matrix.
const JET_GLSL = `
  uniform float uZ0, uLen, uBaseR, uTipR, uTurns, uSpin, uTime;
  // Axial fraction along a lobe, 0 at the launch point and 1 at the tip.
  float axialF(float za) { return clamp((za - uZ0) / max(uLen, 1e-3), 0.0, 1.0); }
`;

// ── Raymarched volume ────────────────────────────────────────────────────────
function volumeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBox: { value: new THREE.Vector3(2, 2, 8) },
      uZ0: { value: 0.5 },
      uLen: { value: 10 },
      uBaseR: { value: 1 },
      uTipR: { value: 2 },
      uTurns: { value: JETS.turns },
      uSpin: { value: 1 },
      uTime: { value: 0 },
      uSteps: { value: 48 },
      uGamma: { value: 1 },
      uKnotN: { value: 0 },
      uFlick: { value: 1 },
      uRh: { value: 1 },
      uBeamUp: { value: 1 },
      uBeamDn: { value: 1 },
      uDensity: { value: JETS.density },
      uTurb: { value: JETS.turbulence },
      uKnots: { value: JETS.knots },
      uFlow: { value: JETS.flow },
      uBright: { value: JETS.brightness },
      uMaxI: { value: JETS.maxIntensity },
      uLUT: { value: lutTexture() },
    },
    vertexShader: `
      uniform vec3 uBox;
      varying vec3 vLocal;
      varying vec3 vCamLocal;
      void main() {
        // BoxGeometry(1,1,1) spans -0.5..0.5, so this scales to +-uBox in the
        // shader and a change of jet power needs no geometry rebuild.
        vec3 p = position * 2.0 * uBox;
        vLocal = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vCamLocal = cameraPosition - modelMatrix[3].xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      ${NOISE_GLSL}
      ${JET_GLSL}
      uniform vec3 uBox;
      uniform float uSteps, uGamma, uKnotN, uFlick, uRh;
      uniform float uBeamUp, uBeamDn;
      uniform float uDensity, uTurb, uKnots, uFlow, uBright, uMaxI;
      uniform sampler2D uLUT;
      varying vec3 vLocal;
      varying vec3 vCamLocal;

      const int STEPS_MAX = ${STEPS_MAX};

      // Density of the bipolar outflow at a point in jet-local space.
      // Returns 0 outside the cone, which is most of the box and therefore
      // most of the march — the early-out on this is what keeps the cost down.
      float jetDensity(vec3 p, float za, float f, out float xn) {
        float rj = mix(uBaseR, uTipR, f);
        xn = length(p.xy) / max(rj, 1e-3);
        if (xn > 1.25) return 0.0;

        // Limb-brightened sheath over a bright spine: a synchrotron jet is
        // hollow, the emission riding the shear layer where the field is
        // ordered, with the Poynting-dominated core adding the axial streak.
        float sheath = exp(-pow((xn - 0.72) / 0.26, 2.0));
        float spine  = exp(-pow(xn / 0.22, 2.0));
        float shape  = sheath * 0.8 + spine * 1.5;

        // Launch ramp and tip fade, so the volume has no cut ends.
        shape *= smoothstep(uZ0 * 0.5, uZ0 * 1.9, za);
        shape *= 1.0 - smoothstep(uLen * 0.74, uLen * 1.02, za);
        if (shape <= 0.0) return 0.0;

        // Helical B-field advection: the noise frame is sheared by the wound
        // field and pushed outward with the flow, so filaments wind along the
        // helix rather than sitting still. Same pitch (uTurns) as the ribbons.
        float psi = atan(p.y, p.x) - uSpin * (f * uTurns * 6.283185307179586 - uTime * 2.2);
        vec3 q = vec3(cos(psi), sin(psi), 0.0) * 2.6
               + vec3(0.0, 0.0, f * 7.0 - uTime * uFlow);
        float n = fbm3(q);
        shape *= mix(1.0, 0.30 + 1.5 * n, uTurb);

        // Mach knots: internal-shock density pulses. Count and placement are
        // drawJet's (min(5, floor(gamma/4)), evenly spaced in f), so they turn
        // up exactly where the old knot circles did.
        if (uKnotN >= 1.0) {
          float k = 0.0;
          for (int i = 1; i <= 5; i++) {
            if (float(i) > uKnotN) break;
            float fk = float(i) / (uKnotN + 1.0);
            float dz = (za - (uZ0 + fk * uLen)) / (uLen * 0.045);
            k += exp(-dz * dz);
          }
          shape *= 1.0 + uKnots * k * 1.6 * uFlick;
        }

        // No emission inside the horizon.
        shape *= smoothstep(uRh * 0.9, uRh * 1.7, length(p));
        return shape * uDensity;
      }

      void main() {
        vec3 ro = vCamLocal;
        vec3 rd = normalize(vLocal - vCamLocal);
        // Slab intersection. A zero component gives +-Inf here, which min/max
        // resolve correctly as long as the origin is inside that slab.
        vec3 inv = 1.0 / rd;
        vec3 ta = (-uBox - ro) * inv;
        vec3 tb = ( uBox - ro) * inv;
        vec3 tlo = min(ta, tb), thi = max(ta, tb);
        float tn = max(max(tlo.x, tlo.y), max(tlo.z, 0.0));
        float tf = min(min(thi.x, thi.y), thi.z);
        if (tf <= tn) discard;

        float dt = (tf - tn) / uSteps;
        // Jittered start: 48 steps across a 20 M chord otherwise lays visible
        // shells across the cone. The dither trades them for noise the
        // composite's own grain hides.
        float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

        float gn = clamp((uGamma - 1.0) / 14.0, 0.0, 1.0);
        vec3 acc = vec3(0.0);
        for (int i = 0; i < STEPS_MAX; i++) {
          if (float(i) >= uSteps) break;
          vec3 p = ro + rd * (tn + (float(i) + j) * dt);
          float za = abs(p.z);
          float f = axialF(za);
          float xn;
          float d = jetDensity(p, za, f, xn);
          if (d <= 0.0) continue;
          // Hardness: the ramp index rises with Gamma globally and toward the
          // spine locally, so a fast jet reads blue-white down the middle and
          // violet at the shear layer.
          float ci = clamp(gn * 0.6 + (1.0 - clamp(xn, 0.0, 1.0)) * 0.4, 0.0, 1.0);
          vec3 col = texture2D(uLUT, vec2(ci, 0.5)).rgb;
          float beam = p.z > 0.0 ? uBeamUp : uBeamDn;
          acc += col * (d * beam * dt);
        }
        acc = min(acc * uBright, vec3(uMaxI));
        // Premultiplied: AdditiveBlending is SrcAlpha/One, so the intensity
        // lives in rgb and alpha stays 1.
        gl_FragColor = vec4(acc, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,          // see the file header
    side: THREE.BackSide,      // back faces, so a camera inside the box still draws
    blending: THREE.AdditiveBlending,
  });
}

// ── Instanced field-line ribbons ─────────────────────────────────────────────
// `position` carries (f, side) parameters rather than coordinates, and the
// instance attribute carries (phase, dir); every vertex is placed in the
// vertex shader from the same uniforms the volume uses, so nothing is rebuilt
// when the jet power changes.
function ribbonGeometry() {
  const geo = new THREE.InstancedBufferGeometry();
  const pos = new Float32Array((RIBBON_SEG + 1) * 2 * 3);
  let k = 0;
  for (let i = 0; i <= RIBBON_SEG; i++) {
    const f = i / RIBBON_SEG;
    pos[k++] = f; pos[k++] = -1; pos[k++] = 0;
    pos[k++] = f; pos[k++] = 1; pos[k++] = 0;
  }
  const idx = new Uint16Array(RIBBON_SEG * 6);
  let m = 0;
  for (let i = 0; i < RIBBON_SEG; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx[m++] = a; idx[m++] = c; idx[m++] = b;
    idx[m++] = b; idx[m++] = c; idx[m++] = d;
  }
  const inst = new Float32Array(RIBBON_LINES * 2);
  let n = 0;
  for (const phase of [0, Math.PI]) {
    for (const dir of [1, -1]) { inst[n++] = phase; inst[n++] = dir; }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('iLine', new THREE.InstancedBufferAttribute(inst, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.instanceCount = RIBBON_LINES;
  return geo;
}

function ribbonMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZ0: { value: 0.5 },
      uLen: { value: 10 },
      uBaseR: { value: 1 },
      uTipR: { value: 2 },
      uTurns: { value: JETS.turns },
      uSpin: { value: 1 },
      uTime: { value: 0 },
      uWidth: { value: 0.09 },
      uAlpha: { value: 0.3 },
      uColor: { value: cssLinear('oklch(0.75 0.15 250)') },
    },
    vertexShader: `
      ${JET_GLSL}
      attribute vec2 iLine;
      uniform float uWidth;
      varying float vF;
      varying float vSide;
      // Same helix drawJet traced with R.pools.line.seg, so the ribbons sit on
      // the field lines they replace rather than near them.
      vec3 helix(float f, float phase, float dir) {
        float rr = mix(uBaseR * 0.4, uTipR * 0.75, f);
        float ang = phase + uSpin * (f * uTurns * 6.283185307179586 - uTime * 2.2);
        return vec3(cos(ang) * rr, sin(ang) * rr, dir * (uZ0 + f * uLen));
      }
      void main() {
        float f = position.x;
        vF = f;
        vSide = position.y;
        vec3 p = helix(f, iLine.x, iLine.y);
        // Forward difference for the tangent: analytic would be four more
        // trig calls for a direction that only sets the ribbon's plane.
        vec3 tang = normalize(helix(min(f + 0.008, 1.0), iLine.x, iLine.y) - p + vec3(1e-7));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        // modelMatrix is a pure translation (see JET_GLSL), so a local tangent
        // and a world view direction live in the same frame.
        vec3 view = normalize(cameraPosition - wp.xyz);
        vec3 off = normalize(cross(tang, view) + vec3(1e-7));
        gl_Position = projectionMatrix * viewMatrix
          * vec4(wp.xyz + off * position.y * uWidth * (1.0 - f * 0.35), 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying float vF;
      varying float vSide;
      void main() {
        // Soft across the ribbon so a thick line still reads as a field line
        // and not as a flat strap.
        float a = uAlpha * (1.0 - vF * 0.6) * (1.0 - vSide * vSide);
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

// ── Geometry, re-derived from drawJet ────────────────────────────────────────
function jetShape(m) {
  const lum = Math.min(1, m.P / 30);
  const opening = m.theta * Math.PI / 180;
  const len = 6 + 10 * lum;
  const baseR = 0.5 + lum * 0.8;
  const tipR = Math.max(baseR * 1.4, baseR + Math.tan(opening) * len * 1.2);
  return { lum, len, baseR, tipR, z0: 0.5 };
}

// Steady-jet Doppler ratio between the two lobes (see the file header).
function beamPair(gamma, cosTh) {
  const g = Math.max(1.0000001, gamma);
  const beta = Math.sqrt(1 - 1 / (g * g));
  const up = 1 / (g * (1 - beta * cosTh));
  const dn = 1 / (g * (1 + beta * cosTh));
  const hi = Math.max(up, dn);
  const e = JETS.beamExp;
  const mix = Math.max(0, Math.min(1, JETS.beaming));
  return {
    up: 1 + mix * (Math.pow(up / hi, e) - 1),
    dn: 1 + mix * (Math.pow(dn / hi, e) - 1),
  };
}

// ── One jet (primary or companion) ───────────────────────────────────────────
class JetVolume {
  constructor(scene) {
    this.vol = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), volumeMaterial());
    this.ribbons = new THREE.Mesh(ribbonGeometry(), ribbonMaterial());
    for (const o of [this.vol, this.ribbons]) {
      // Every vertex is placed in the shader, so CPU-side bounds are
      // meaningless and Three would cull the jet from most angles.
      o.frustumCulled = false;
      o.renderOrder = 8;              // the renderOrder jetSlot gives its group
      o.visible = false;
      scene.add(o);
    }
  }

  hide() { this.vol.visible = false; this.ribbons.visible = false; }

  update(jet, steps, obs) {
    const s = jet.shape;
    const b = beamPair(jet.m.gamma, obs.z);
    const flick = 0.85 + 0.15 * Math.sin(jet.t * 9);

    const u = this.vol.material.uniforms;
    u.uBox.value.set(s.tipR * 1.2, s.tipR * 1.2, s.z0 + s.len * 1.05);
    u.uZ0.value = s.z0;
    u.uLen.value = s.len;
    u.uBaseR.value = s.baseR;
    u.uTipR.value = s.tipR;
    u.uTurns.value = JETS.turns;
    u.uSpin.value = jet.spinSign;
    u.uTime.value = jet.t;
    u.uSteps.value = steps;
    u.uGamma.value = jet.m.gamma;
    u.uKnotN.value = jet.m.gamma > 3 ? Math.min(5, Math.floor(jet.m.gamma / 4)) : 0;
    u.uFlick.value = flick;
    u.uRh.value = jet.rh;
    u.uBeamUp.value = b.up;
    u.uBeamDn.value = b.dn;
    u.uDensity.value = JETS.density;
    u.uTurb.value = JETS.turbulence;
    u.uKnots.value = JETS.knots;
    u.uFlow.value = JETS.flow;
    // lum carried into brightness the way the cones carried it into opacity.
    u.uBright.value = JETS.brightness * (0.35 + 0.65 * s.lum) * flick;
    u.uMaxI.value = JETS.maxIntensity;
    this.vol.position.set(jet.x, jet.y, 0);
    this.vol.visible = true;

    const r = this.ribbons.material.uniforms;
    r.uZ0.value = s.z0;
    r.uLen.value = s.len;
    r.uBaseR.value = s.baseR;
    r.uTipR.value = s.tipR;
    r.uTurns.value = JETS.turns;
    r.uSpin.value = jet.spinSign;
    r.uTime.value = jet.t;
    r.uWidth.value = s.baseR * JETS.lineWidth;
    // drawJet's own 0.28 * lum, with the per-f falloff moved into the shader.
    r.uAlpha.value = 0.28 * s.lum;
    this.ribbons.position.set(jet.x, jet.y, 0);
    this.ribbons.visible = !!JETS.fieldLines;
  }

  dispose() {
    for (const o of [this.vol, this.ribbons]) {
      if (o.parent) o.parent.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
  }
}

// ── Jet state, shared by the volume and the LinePool filter ──────────────────
function collectJets(R) {
  const sim = R.sim;
  const KD = window.KNDisc;
  const phys = window.KNphysics;
  if (!JETS.enabled || !sim || !KD || !phys || !sim.view || !sim.view.mode3d) return [];

  const bin = sim.binary;
  const binOn = !!(bin && bin.enabled);
  const out = [];
  const push = (key, x, y, m, spinSign, M, Q, a) => {
    if (!m || !(m.P > 0.3)) return;
    const h = phys.horizons(M, Q, a);
    if (h.naked) return;
    out.push({
      key, x, y, m, spinSign, t: sim.t, shape: jetShape(m),
      rh: Math.max(0.2, h.rplus || 1),
    });
  };

  const m1 = KD.jetMetrics(sim);
  const { M, Q, a } = sim.params;
  if (binOn) {
    push('j1', bin.x1, bin.y1, m1, Math.sign(a || 1), M, Q, a);
    push('j2', bin.x2, bin.y2, KD.companionJetMetrics(sim), Math.sign(bin.a2 || 1),
      bin.M2, bin.Q2 || 0, bin.a2 || 0);
  } else {
    push('j1', 0, 0, m1, Math.sign(a || 1), M, Q, a);
  }
  return out;
}

// True when a point sits inside a jet's envelope, generously enough to cover
// the helix and the knot circles drawJet traces (radius up to tipR * 0.75 on
// the helix, and the knots sit well inside).
function insideEnvelope(j, x, y, z) {
  const s = j.shape;
  const za = Math.abs(z);
  if (za < s.z0 * 0.5 || za > s.z0 + s.len * 1.08) return false;
  const f = Math.min(1, Math.max(0, (za - s.z0) / s.len));
  const rj = (s.baseR + (s.tipR - s.baseR) * f) * 1.3;
  const dx = x - j.x, dy = y - j.y;
  return dx * dx + dy * dy <= rj * rj;
}

// ── Public surface ───────────────────────────────────────────────────────────
const _obs = new THREE.Vector3();
const STEPS = { high: 48, medium: 28 };

export class GpuJetLayer {
  constructor(R) {
    this.primary = new JetVolume(R.scene);
    this.companion = new JetVolume(R.scene);
    this.jets = [];
    this._patchPool(R);
  }

  // drawJet fills the shared LinePool with the 1px helix and the knot circles
  // before renderer.render is ever called, and the pool has no per-caller
  // channel, so the only way to stop the old helix drawing underneath the
  // ribbons is to drop its segments as they arrive.
  //
  // The test is colour AND geometry, and it needs both. Geometry alone —
  // "both endpoints inside an active jet cone" — also ate the spin-axis
  // indicator, which draws 30 dashes and sense-arc segments straight up the
  // same ±z corridor; that is a user-facing readout, not something this layer
  // replaces. Colour alone would drop a same-coloured line anywhere in the
  // scene. Together they fail safe: if drawJet's palette ever changes, the
  // filter stops matching and the old helix draws underneath the ribbons,
  // which is a visual nit rather than a missing indicator.
  //
  // The envelopes are refreshed from the patched begin(), which the frame
  // calls before any drawing, so there is no one-frame lag.
  _patchPool(R) {
    const pool = R.pools && R.pools.line;
    if (!pool || pool._gpuJetSeg) return;
    const self = this;
    const origBegin = pool.begin;
    const origSeg = pool.seg;
    pool._gpuJetBegin = origBegin;
    pool._gpuJetSeg = origSeg;
    pool.begin = function () {
      self.jets = collectJets(R);
      return origBegin.apply(this, arguments);
    };
    pool.seg = function (x1, y1, z1, x2, y2, z2, rgb, a) {
      if (self.jets.length && dropRGB().has(
        packed(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)))) {
        for (let i = 0; i < self.jets.length; i++) {
          const j = self.jets[i];
          if (insideEnvelope(j, x1, y1, z1) && insideEnvelope(j, x2, y2, z2)) return;
        }
      }
      return origSeg.call(this, x1, y1, z1, x2, y2, z2, rgb, a);
    };
    this._pool = pool;
  }

  _restorePool() {
    const pool = this._pool;
    if (!pool || !pool._gpuJetSeg) return;
    pool.begin = pool._gpuJetBegin;
    pool.seg = pool._gpuJetSeg;
    pool._gpuJetBegin = null;
    pool._gpuJetSeg = null;
    this._pool = null;
  }

  // Hide or restore the two unlit cones jetSlot() parked in R.jetSlots. This
  // is the whole reason render3d.mjs needs no diff.
  _cones(R, visible) {
    const slots = R && R.jetSlots;
    if (!slots) return;
    for (const k in slots) {
      const js = slots[k];
      for (const g of [js.up, js.dn]) {
        if (!g || !g.userData) continue;
        if (g.userData.outer) g.userData.outer.visible = visible;
        if (g.userData.spine) g.userData.spine.visible = visible;
      }
    }
  }

  update(R, quality) {
    const sim = R.sim;
    // collectJets normally runs from the patched begin(); this covers the
    // first frame after an install mid-session, before begin() has fired.
    if (!this._pool) this._patchPool(R);
    const jets = this.jets.length ? this.jets : collectJets(R);
    if (!jets.length) {
      this.primary.hide(); this.companion.hide();
      this._cones(R, true);
      return;
    }
    this._cones(R, !!JETS.showCones);

    // Observer direction: the camera offset from the view target, i.e. the
    // pan-independent part of the rig (applyCamera in render3d.mjs).
    _obs.set(
      R.camera.position.x + sim.view.ox,
      R.camera.position.y + sim.view.oy,
      R.camera.position.z,
    );
    if (_obs.lengthSq() < 1e-12) _obs.set(0, 0, 1);
    _obs.normalize();

    const steps = JETS.steps > 0 ? JETS.steps : (STEPS[quality] || 28);
    const slots = [this.primary, this.companion];
    for (let i = 0; i < slots.length; i++) {
      if (jets[i]) slots[i].update(jets[i], steps, _obs);
      else slots[i].hide();
    }
  }

  dispose(R) {
    this._restorePool();
    this.jets = [];
    this.primary.dispose();
    this.companion.dispose();
    this._cones(R, true);
  }
}
