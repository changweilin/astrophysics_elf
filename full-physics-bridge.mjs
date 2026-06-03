/* Bridge: full Kerr-Newman physics (ESM) → window.KNFull for the browser demo.
 *
 * The legacy Newtonian-ish KNphysics integrator continues to drive sim.js. This
 * bridge exposes the higher-fidelity engine purely as a *diagnostic backend*:
 * geometry, numerical ISCO/photon-orbit, tidal tensor, region classification,
 * and Blandford-Znajek jet power are recomputed against the live (M, Q, a, B)
 * parameters so the UI can show calibrated numbers next to the visual loop.
 */

import { PhysicsEngine } from "./full-physics/physics-engine.mjs";
import {
  findISCO,
  findPhotonCircularOrbit,
  classifyOrbitRegion,
  solveCircularMassiveOrbit,
} from "./full-physics/orbit-diagnostics.mjs";
import { tidalTensorDiagnostics } from "./full-physics/tidal-tensor.mjs";
import { OBJECT_LIBRARY } from "./full-physics/object-library.mjs";
import {
  blandfordZnajekJet,
  horizons,
  staticLimitRadius,
  horizonAngularVelocity,
  horizonArea,
  surfaceGravity,
  horizonElectricPotential,
} from "./full-physics/kn-full-physics.mjs";

const PI_2 = Math.PI / 2;
const POLE_EPS = 1e-7;

/* ---- object library -> demo spawn catalog ------------------------------- *
 * The demo's picker (panel-bottom.jsx / mobile-panels.jsx) spawns bodies with the
 * schema { name, name_zh, kind, radius, binding, charge, spawnR }, where kind is
 * one of the five the drop flow understands (name prefix + CSS + glyph). This maps
 * the richer full-physics OBJECT_LIBRARY onto that schema so the picker can source
 * a single, physically-grounded catalog instead of a hardcoded list. The pickers
 * keep their inline list as a fallback when this bridge has not loaded.           */
const DEMO_KIND = {
  planet: "planet", gas: "gas", star: "star", "compact-star": "star",
  ship: "ship", probe: "probe", plasma: "probe", disc: "gas",
};
// Traditional-Chinese labels for the demo's bilingual tr(en, zh) cards, keyed by
// the (ASCII) library id. Other locales fall back to the English label via tr().
const ZH_LABEL = {
  rockyPlanet: "岩質行星", gasGiant: "氣態巨行星", mainSequenceStar: "主序星",
  whiteDwarf: "白矮星", neutronStar: "中子星", crewedShip: "載人飛船",
  neutralProbe: "中性探測器", chargedProbePositive: "帶正電探測器",
  chargedProbeNegative: "帶負電探測器", magnetizedPlasmaBlob: "磁化電漿團",
};

function buildDemoObjectCatalog() {
  const out = [];
  for (const spec of Object.values(OBJECT_LIBRARY)) {
    // Only massive, destructible bodies the spawner can place: skip null geodesics
    // (photon) and indestructible parcels (binding = Infinity, e.g. dust).
    if (spec.kind === "photon" || !Number.isFinite(spec.binding)) continue;
    const kind = DEMO_KIND[spec.kind];
    if (!kind) continue;
    out.push({
      id: spec.id,
      name: spec.label,
      name_zh: ZH_LABEL[spec.id] ?? spec.label,
      kind,
      radius: spec.radius,
      binding: spec.binding,
      charge: spec.chargeToMass ?? 0,
      spawnR: Math.round(spec.defaultOrbit?.r ?? 12),
      description: spec.description,
    });
  }
  return out;
}

function sanitize(params) {
  const M = Math.max(1e-4, Number(params?.M) || 1.5);
  const Q = Number(params?.Q) || 0;
  const a = Number(params?.a) || 0;
  const B = Math.max(0, Number(params?.B) || 0);
  return { M, Q, a, B };
}

function paramsKey(p) {
  return `${p.M.toFixed(6)}|${p.Q.toFixed(6)}|${p.a.toFixed(6)}|${p.B.toFixed(6)}`;
}

function cartesianToPolarEquatorial(x, y) {
  const r = Math.hypot(x, y);
  const phi = Math.atan2(y, x);
  return { r: Math.max(r, 1e-3), theta: PI_2, phi };
}

class FullPhysicsBridge {
  constructor() {
    this.engine = new PhysicsEngine({ M: 1.5, Q: 0, a: 0.5, B: 0.3 });
    this._geometryCache = { key: null, value: null };
    this._orbitCache    = { key: null, value: null };
    this._jetCache      = { key: null, accretion: -1, value: null };
    // Static spawn catalog derived from the full-physics object library.
    this.objectCatalog = buildDemoObjectCatalog();
  }

  syncParams(params) {
    const p = sanitize(params);
    const cur = this.engine.params;
    if (cur.M !== p.M || cur.Q !== p.Q || cur.a !== p.a || cur.B !== p.B) {
      this.engine.params = p;
      if (this.engine.simulator) this.engine.simulator.params = p;
      if (this.engine.jet)       this.engine.jet.params = p;
    }
    return p;
  }

  /* Rich geometry summary with derived horizon quantities. Cached per (M,Q,a,B). */
  geometry(params) {
    const p = this.syncParams(params);
    const key = paramsKey(p);
    if (this._geometryCache.key === key) return this._geometryCache.value;
    const h = horizons(p);
    const value = {
      params: p,
      horizons: h,
      staticLimitEquator: staticLimitRadius(p, PI_2),
      staticLimitPole:    staticLimitRadius(p, POLE_EPS),
      horizonAngularVelocity: horizonAngularVelocity(p),
      horizonArea:            horizonArea(p),
      surfaceGravity:         surfaceGravity(p),
      horizonElectricPotential: horizonElectricPotential(p),
    };
    this._geometryCache = { key, value };
    return value;
  }

  /* Numerical ISCO and photon-circular-orbit radii (prograde & retrograde). */
  orbitDiagnostics(params, options = {}) {
    const p = this.syncParams(params);
    const key = paramsKey(p);
    if (this._orbitCache.key === key && !options.force) return this._orbitCache.value;
    let value;
    try {
      value = {
        params: p,
        isco: {
          prograde:   findISCO(p, { samples: 180, prograde: true }),
          retrograde: findISCO(p, { samples: 180, prograde: false }),
        },
        photonOrbit: {
          prograde:   findPhotonCircularOrbit(p, { samples: 180, prograde: true }),
          retrograde: findPhotonCircularOrbit(p, { samples: 180, prograde: false }),
        },
      };
    } catch (err) {
      value = { params: p, error: err.message };
    }
    this._orbitCache = { key, value };
    return value;
  }

  /* Region classification at a Cartesian equatorial point. */
  regionAt(params, x, y) {
    const p = this.syncParams(params);
    const pol = cartesianToPolarEquatorial(x, y);
    try {
      return classifyOrbitRegion(p, pol.r, pol.theta);
    } catch {
      return null;
    }
  }

  /* Circular orbit energy / L_z at a given radius, using the full Hamiltonian. */
  circularOrbit(params, r, opts = {}) {
    const p = this.syncParams(params);
    try {
      return solveCircularMassiveOrbit(p, {
        r,
        theta: PI_2,
        prograde: opts.prograde ?? true,
        chargeToMass: opts.chargeToMass ?? 0,
      });
    } catch (err) {
      return { error: err.message };
    }
  }

  /* Tidal tensor + survival label for a body at (x, y) with radius/binding. */
  tidalDiagnostics(params, x, y, body = {}) {
    const p = this.syncParams(params);
    const pol = cartesianToPolarEquatorial(x, y);
    try {
      return tidalTensorDiagnostics(p, {
        r: pol.r, theta: pol.theta, phi: pol.phi,
      }, {
        radius:  body.radius  ?? 0.4,
        binding: body.binding ?? 1,
      });
    } catch (err) {
      return { error: err.message };
    }
  }

  /* Blandford-Znajek jet power + opening angle from spin, B, and accretion rate. */
  jetPower(params, accretionRate = 0) {
    const p = this.syncParams(params);
    const key = paramsKey(p);
    if (this._jetCache.key === key && this._jetCache.accretion === accretionRate) {
      return this._jetCache.value;
    }
    const value = blandfordZnajekJet(p, { accretionRate, magneticField: p.B });
    this._jetCache = { key, accretion: accretionRate, value };
    return value;
  }
}

const bridge = new FullPhysicsBridge();
window.KNFull = bridge;
window.dispatchEvent(new CustomEvent('knfull-ready', { detail: { bridge } }));
