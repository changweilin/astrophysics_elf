/*
 * Numerical orbit diagnostics for the standalone Kerr-Newman physics core.
 *
 * This module improves on the simple Kerr approximations by solving circular
 * orbit conditions directly against the Kerr-Newman metric/Hamiltonian.
 */

import {
  clamp,
  hamiltonian,
  horizons,
  localAzimuthalVelocityForOmega,
  makeMassiveState,
  metric,
  sanitizeParams,
  staticLimitRadius,
  wrapAngle,
} from "./kn-full-physics.mjs";

const EPS = 1e-10;

function radialFloor(params) {
  const h = horizons(params);
  return h.naked ? 1e-3 : h.rPlus + 1e-4;
}

function radialDerivativeOfMetric(params, r, theta, i, j) {
  const h = Math.max(1e-5, Math.abs(r) * 1e-5);
  const floor = radialFloor(params);
  const rp = r + h;
  const rm = Math.max(floor, r - h);
  const gp = metric(params, rp, theta).cov[i][j];
  const gm = metric(params, rm, theta).cov[i][j];
  return (gp - gm) / (rp - rm);
}

function radialHamiltonianGradient(params, state) {
  const h = Math.max(1e-5, Math.abs(state.r) * 1e-5);
  const floor = radialFloor(params);
  const rp = state.r + h;
  const rm = Math.max(floor, state.r - h);
  const hp = hamiltonian(params, { ...state, r: rp });
  const hm = hamiltonian(params, { ...state, r: rm });
  return (hp - hm) / (rp - rm);
}

function radialHamiltonianSecond(params, state) {
  const h = Math.max(2e-4, Math.abs(state.r) * 2e-4);
  const floor = radialFloor(params);
  const r0 = state.r;
  const rp = r0 + h;
  const rm = Math.max(floor, r0 - h);
  const h0 = hamiltonian(params, state);
  const hp = hamiltonian(params, { ...state, r: rp });
  const hm = hamiltonian(params, { ...state, r: rm });
  const hpStep = rp - r0;
  const hmStep = r0 - rm;
  if (Math.abs(hpStep - hmStep) < EPS) {
    return (hp - 2 * h0 + hm) / (h * h);
  }
  const gradP = (hp - h0) / hpStep;
  const gradM = (h0 - hm) / hmStep;
  return 2 * (gradP - gradM) / (hpStep + hmStep);
}

function bisectRoot(fn, lo, hi, iterations = 80) {
  let flo = fn(lo);
  let fhi = fn(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return NaN;
  if (Math.abs(flo) < EPS) return lo;
  if (Math.abs(fhi) < EPS) return hi;
  if (flo * fhi > 0) return NaN;
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = 0.5 * (a + b);
    const fmid = fn(mid);
    if (!Number.isFinite(fmid)) break;
    if (Math.abs(fmid) < EPS) return mid;
    if (flo * fmid <= 0) {
      b = mid;
      fhi = fmid;
    } else {
      a = mid;
      flo = fmid;
    }
  }
  void fhi;
  return 0.5 * (a + b);
}

function goldenMinimizeAbs(fn, lo, hi, iterations = 70) {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = Math.abs(fn(c));
  let fd = Math.abs(fn(d));
  for (let i = 0; i < iterations; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = Math.abs(fn(c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = Math.abs(fn(d));
    }
  }
  return fc < fd ? c : d;
}

export function neutralCircularOmega(params, r, prograde = true, theta = Math.PI / 2) {
  const dtt = radialDerivativeOfMetric(params, r, theta, 0, 0);
  const dtp = radialDerivativeOfMetric(params, r, theta, 0, 3);
  const dpp = radialDerivativeOfMetric(params, r, theta, 3, 3);
  const disc = dtp * dtp - dtt * dpp;
  if (disc < 0 || Math.abs(dpp) < EPS) return NaN;
  const root = Math.sqrt(disc);
  const omegaA = (-dtp + root) / dpp;
  const omegaB = (-dtp - root) / dpp;
  if (prograde) return omegaA >= omegaB ? omegaA : omegaB;
  return omegaA < omegaB ? omegaA : omegaB;
}

export function solveCircularMassiveOrbit(params, options = {}) {
  const p = sanitizeParams(params);
  const r = options.r ?? 10;
  const theta = options.theta ?? Math.PI / 2;
  const prograde = options.prograde ?? true;
  const chargeToMass = options.chargeToMass ?? 0;
  const vSign = prograde ? 1 : -1;

  function candidate(vPhi) {
    return makeMassiveState(p, {
      name: "circular-candidate",
      kind: "diagnostic",
      r,
      theta,
      velocity: [0, 0, vPhi],
      chargeToMass,
      radius: 0,
      binding: Infinity,
    });
  }

  function gradient(vPhi) {
    return radialHamiltonianGradient(p, candidate(vPhi));
  }

  const lo = prograde ? 0.001 : -0.985;
  const hi = prograde ? 0.985 : -0.001;
  const samples = 160;
  let bracket = null;
  let best = { v: lo, score: Infinity };
  let prevV = lo;
  let prevF = gradient(prevV);

  for (let i = 0; i <= samples; i++) {
    const v = lo + (hi - lo) * (i / samples);
    const f = gradient(v);
    if (Number.isFinite(f) && Math.abs(f) < best.score) best = { v, score: Math.abs(f) };
    if (Number.isFinite(prevF) && Number.isFinite(f) && prevF * f <= 0) {
      bracket = [prevV, v];
      break;
    }
    prevV = v;
    prevF = f;
  }

  const vPhi = bracket
    ? bisectRoot(gradient, bracket[0], bracket[1])
    : goldenMinimizeAbs(gradient, lo, hi);
  const state = candidate(Number.isFinite(vPhi) ? vPhi : best.v);
  const omega = state.Pphi ? neutralCircularOmega(p, r, prograde, theta) : NaN;
  const localOmegaVelocity = Number.isFinite(omega)
    ? localAzimuthalVelocityForOmega(p, r, theta, omega)
    : NaN;
  const stability = radialHamiltonianSecond(p, state);

  return {
    r,
    theta,
    prograde,
    chargeToMass,
    localAzimuthalVelocity: state.kind === "diagnostic" ? (Number.isFinite(vPhi) ? vPhi : best.v) : NaN,
    neutralOmega: omega,
    neutralLocalVelocity: localOmegaVelocity,
    energy: -state.Pt,
    angularMomentumZ: state.Pphi,
    hamiltonian: hamiltonian(p, state),
    radialGradient: radialHamiltonianGradient(p, state),
    radialSecondDerivative: stability,
    stable: stability > 0,
    state: {
      t: state.t,
      r: state.r,
      theta: state.theta,
      phi: wrapAngle(state.phi),
      Pt: state.Pt,
      Pr: state.Pr,
      Ptheta: state.Ptheta,
      Pphi: state.Pphi,
      chargeToMass: state.chargeToMass,
    },
  };
}

function stabilityIndicator(params, r, prograde, chargeToMass) {
  try {
    const orbit = solveCircularMassiveOrbit(params, { r, prograde, chargeToMass });
    if (Math.abs(orbit.radialGradient) > 1e-4) return NaN;
    return orbit.radialSecondDerivative;
  } catch {
    return NaN;
  }
}

export function findISCO(params, options = {}) {
  const p = sanitizeParams(params);
  const prograde = options.prograde ?? true;
  const chargeToMass = options.chargeToMass ?? 0;
  const floor = radialFloor(p) + 1e-3;
  const rMin = options.rMin ?? floor;
  const rMax = options.rMax ?? 40 * p.M;
  const samples = options.samples ?? 220;
  const values = [];

  for (let i = 0; i <= samples; i++) {
    const f = i / samples;
    const r = rMin * (rMax / rMin) ** f;
    const value = stabilityIndicator(p, r, prograde, chargeToMass);
    if (Number.isFinite(value)) values.push({ r, value });
  }

  if (values.length < 3) {
    return { rISCO: NaN, prograde, chargeToMass, found: false, reason: "No circular orbit samples converged." };
  }

  const highSign = Math.sign(values[values.length - 1].value) || 1;
  for (let i = values.length - 2; i >= 0; i--) {
    const a = values[i];
    const b = values[i + 1];
    if (Math.sign(a.value) !== highSign && Math.sign(b.value) === highSign) {
      const root = bisectRoot((r) => stabilityIndicator(p, r, prograde, chargeToMass), a.r, b.r, 60);
      return {
        rISCO: root,
        prograde,
        chargeToMass,
        found: Number.isFinite(root),
        stableOutsideSign: highSign,
        bracket: [a.r, b.r],
      };
    }
  }

  return {
    rISCO: NaN,
    prograde,
    chargeToMass,
    found: false,
    stableOutsideSign: highSign,
    reason: "No stability sign change found in scan range.",
  };
}

function nullImpactParameters(params, r, theta = Math.PI / 2) {
  const inv = metric(params, r, theta).inv;
  const a = inv[3][3];
  const b = -2 * inv[0][3];
  const c = inv[0][0];
  const disc = b * b - 4 * a * c;
  if (disc < 0 || Math.abs(a) < EPS) return [];
  const root = Math.sqrt(disc);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}

function nullRadialPotential(params, r, impact, theta = Math.PI / 2) {
  const inv = metric(params, r, theta).inv;
  return inv[0][0] - 2 * impact * inv[0][3] + impact * impact * inv[3][3];
}

function nullPotentialDerivative(params, r, impact) {
  const h = Math.max(1e-5, Math.abs(r) * 1e-5);
  const floor = radialFloor(params);
  const rp = r + h;
  const rm = Math.max(floor, r - h);
  const fp = nullRadialPotential(params, rp, impact);
  const fm = nullRadialPotential(params, rm, impact);
  return (fp - fm) / (rp - rm);
}

function branchImpact(params, r, prograde) {
  const impacts = nullImpactParameters(params, r);
  if (impacts.length === 0) return NaN;
  const sorted = impacts.sort((a, b) => a - b);
  return prograde ? sorted[sorted.length - 1] : sorted[0];
}

export function findPhotonCircularOrbit(params, options = {}) {
  const p = sanitizeParams(params);
  const prograde = options.prograde ?? true;
  const floor = radialFloor(p) + 1e-3;
  const rMin = options.rMin ?? floor;
  const rMax = options.rMax ?? 30 * p.M;
  const samples = options.samples ?? 260;
  let prev = null;

  function f(r) {
    const b = branchImpact(p, r, prograde);
    if (!Number.isFinite(b)) return NaN;
    return nullPotentialDerivative(p, r, b);
  }

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const r = rMin * (rMax / rMin) ** t;
    const value = f(r);
    if (!Number.isFinite(value)) continue;
    if (prev && prev.value * value <= 0) {
      const root = bisectRoot(f, prev.r, r, 70);
      const impact = branchImpact(p, root, prograde);
      return {
        rPhoton: root,
        impactParameter: impact,
        prograde,
        found: Number.isFinite(root),
        bracket: [prev.r, r],
      };
    }
    prev = { r, value };
  }

  return {
    rPhoton: NaN,
    impactParameter: NaN,
    prograde,
    found: false,
    reason: "No null circular orbit sign change found in scan range.",
  };
}

export function classifyOrbitRegion(params, r, theta = Math.PI / 2) {
  const h = horizons(params);
  const rStatic = staticLimitRadius(params, theta);
  const insideHorizon = !h.naked && r <= h.rPlus;
  const insideErgosphere = Number.isFinite(rStatic) && r <= rStatic && !insideHorizon;
  return {
    insideHorizon,
    insideErgosphere,
    horizonMargin: h.naked ? Infinity : r - h.rPlus,
    staticLimitMargin: Number.isFinite(rStatic) ? r - rStatic : Infinity,
  };
}

export function benchmarkSchwarzschild(M = 1) {
  const params = { M, Q: 0, a: 0 };
  const isco = findISCO(params, { prograde: true, rMax: 30 * M });
  const photon = findPhotonCircularOrbit(params, { prograde: true, rMax: 20 * M });
  return {
    params,
    expectedISCO: 6 * M,
    numericISCO: isco.rISCO,
    relativeISCOError: Math.abs(isco.rISCO - 6 * M) / (6 * M),
    expectedPhotonOrbit: 3 * M,
    numericPhotonOrbit: photon.rPhoton,
    relativePhotonError: Math.abs(photon.rPhoton - 3 * M) / (3 * M),
  };
}

