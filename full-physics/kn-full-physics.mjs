/*
 * Full Kerr-Newman physics core.
 *
 * This file is intentionally standalone. It does not patch or import the
 * existing browser demo files. The current demo uses a Newtonian visual model;
 * this module provides a higher-fidelity backend built around the
 * Kerr-Newman metric, local ZAMO frames, Hamiltonian geodesic integration,
 * charged test particles, reduced tidal diagnostics, and jet estimates.
 *
 * Units: G = c = 4 pi epsilon_0 = 1.
 */

export const COORDS = Object.freeze(["t", "r", "theta", "phi"]);

const DYNAMIC_KEYS = ["t", "r", "theta", "phi", "Pt", "Pr", "Ptheta", "Pphi"];
const EPS = 1e-12;
const POLE_EPS = 1e-7;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function wrapAngle(phi) {
  const tau = Math.PI * 2;
  return ((phi + Math.PI) % tau + tau) % tau - Math.PI;
}

export function sanitizeParams(params = {}) {
  const M = Number.isFinite(params.M) ? params.M : 1.5;
  if (M <= 0) throw new Error("Mass M must be positive.");
  const Q = Number.isFinite(params.Q) ? params.Q : 0;
  const a = Number.isFinite(params.a) ? params.a : 0;
  const B = Number.isFinite(params.B) ? params.B : 0;
  return { M, Q, a, B };
}

export function sigma(params, r, theta) {
  const { a } = sanitizeParams(params);
  const c = Math.cos(theta);
  return r * r + a * a * c * c;
}

export function delta(params, r) {
  const { M, Q, a } = sanitizeParams(params);
  return r * r - 2 * M * r + a * a + Q * Q;
}

export function horizons(params) {
  const { M, Q, a } = sanitizeParams(params);
  const disc = M * M - a * a - Q * Q;
  if (disc < 0) {
    return { rPlus: NaN, rMinus: NaN, discriminant: disc, naked: true };
  }
  const root = Math.sqrt(disc);
  return {
    rPlus: M + root,
    rMinus: M - root,
    discriminant: disc,
    naked: false,
  };
}

export function staticLimitRadius(params, theta = Math.PI / 2) {
  const { M, Q, a } = sanitizeParams(params);
  const c = Math.cos(theta);
  const disc = M * M - Q * Q - a * a * c * c;
  return disc < 0 ? NaN : M + Math.sqrt(disc);
}

export function horizonAngularVelocity(params) {
  const { a } = sanitizeParams(params);
  const { rPlus, naked } = horizons(params);
  if (naked) return NaN;
  return a / (rPlus * rPlus + a * a);
}

export function horizonArea(params) {
  const { a } = sanitizeParams(params);
  const { rPlus, naked } = horizons(params);
  if (naked) return NaN;
  return 4 * Math.PI * (rPlus * rPlus + a * a);
}

export function surfaceGravity(params) {
  const { a } = sanitizeParams(params);
  const { rPlus, rMinus, naked } = horizons(params);
  if (naked) return NaN;
  return (rPlus - rMinus) / (2 * (rPlus * rPlus + a * a));
}

export function horizonElectricPotential(params) {
  const { Q, a } = sanitizeParams(params);
  const { rPlus, naked } = horizons(params);
  if (naked) return NaN;
  return (Q * rPlus) / (rPlus * rPlus + a * a);
}

export function metric(params, r, theta) {
  const p = sanitizeParams(params);
  const s2 = Math.sin(theta) ** 2;
  const sig = sigma(p, r, theta);
  const del = delta(p, r);
  if (sig <= 0) throw new Error("Invalid Kerr-Newman coordinate: Sigma <= 0.");
  if (Math.abs(del) < EPS) throw new Error("Coordinate is too close to a horizon for Boyer-Lindquist integration.");

  const common = 2 * p.M * r - p.Q * p.Q;
  const gtt = -(1 - common / sig);
  const gtphi = -p.a * s2 * common / sig;
  const grr = sig / del;
  const gtheta = sig;
  const gphiphi = s2 * (((r * r + p.a * p.a) ** 2 - del * p.a * p.a * s2) / sig);
  const detTphi = gtt * gphiphi - gtphi * gtphi;

  const cov = [
    [gtt, 0, 0, gtphi],
    [0, grr, 0, 0],
    [0, 0, gtheta, 0],
    [gtphi, 0, 0, gphiphi],
  ];
  const inv = [
    [gphiphi / detTphi, 0, 0, -gtphi / detTphi],
    [0, del / sig, 0, 0],
    [0, 0, 1 / sig, 0],
    [-gtphi / detTphi, 0, 0, gtt / detTphi],
  ];

  return { cov, inv, sigma: sig, delta: del, detTphi };
}

export function vectorPotential(params, r, theta) {
  const { Q, a } = sanitizeParams(params);
  const sig = sigma(params, r, theta);
  const s2 = Math.sin(theta) ** 2;
  return [
    -Q * r / sig,
    0,
    0,
    a * Q * r * s2 / sig,
  ];
}

export function zamoFrame(params, r, theta) {
  const g = metric(params, r, theta);
  const cov = g.cov;
  const inv = g.inv;
  const alphaSquared = -1 / inv[0][0];
  if (alphaSquared <= 0) {
    throw new Error("ZAMO frame is not timelike at this coordinate.");
  }
  const alpha = Math.sqrt(alphaSquared);
  const omega = -cov[0][3] / cov[3][3];
  return {
    alpha,
    omega,
    eT: [1 / alpha, 0, 0, omega / alpha],
    eR: [0, 1 / Math.sqrt(cov[1][1]), 0, 0],
    eTheta: [0, 0, 1 / Math.sqrt(cov[2][2]), 0],
    ePhi: [0, 0, 0, 1 / Math.sqrt(cov[3][3])],
  };
}

export function fourVelocityFromLocal(params, r, theta, velocity = [0, 0, 0]) {
  const [vR = 0, vTheta = 0, vPhi = 0] = velocity;
  const v2 = vR * vR + vTheta * vTheta + vPhi * vPhi;
  if (v2 >= 1) {
    throw new Error("Local velocity must have |v| < c for a massive particle.");
  }
  const gamma = 1 / Math.sqrt(1 - v2);
  const frame = zamoFrame(params, r, theta);
  return COORDS.map((_, i) => gamma * (
    frame.eT[i] + vR * frame.eR[i] + vTheta * frame.eTheta[i] + vPhi * frame.ePhi[i]
  ));
}

export function nullVectorFromLocal(params, r, theta, direction = [0, 0, 1], localEnergy = 1) {
  const [nR = 0, nTheta = 0, nPhi = 1] = direction;
  const norm = Math.hypot(nR, nTheta, nPhi);
  if (norm <= EPS) throw new Error("Photon direction cannot be zero.");
  const frame = zamoFrame(params, r, theta);
  const nr = nR / norm;
  const nt = nTheta / norm;
  const np = nPhi / norm;
  return COORDS.map((_, i) => localEnergy * (
    frame.eT[i] + nr * frame.eR[i] + nt * frame.eTheta[i] + np * frame.ePhi[i]
  ));
}

export function covariantMomentum(params, r, theta, contravariantVector) {
  const { cov } = metric(params, r, theta);
  return cov.map((row) => row.reduce((sum, gij, j) => sum + gij * contravariantVector[j], 0));
}

export function canonicalMomentum(params, r, theta, contravariantVector, chargeToMass = 0) {
  const kinetic = covariantMomentum(params, r, theta, contravariantVector);
  const potential = vectorPotential(params, r, theta);
  return kinetic.map((pi, i) => pi + chargeToMass * potential[i]);
}

export function kineticMomentum(params, state) {
  const potential = vectorPotential(params, state.r, state.theta);
  const q = state.chargeToMass || 0;
  return [
    state.Pt - q * potential[0],
    state.Pr - q * potential[1],
    state.Ptheta - q * potential[2],
    state.Pphi - q * potential[3],
  ];
}

export function hamiltonian(params, state) {
  const { inv } = metric(params, state.r, state.theta);
  const pi = kineticMomentum(params, state);
  let value = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      value += 0.5 * inv[i][j] * pi[i] * pi[j];
    }
  }
  return value;
}

export function contravariantVelocity(params, state) {
  const { inv } = metric(params, state.r, state.theta);
  const pi = kineticMomentum(params, state);
  return inv.map((row) => row.reduce((sum, gij, j) => sum + gij * pi[j], 0));
}

export function normOfFourVector(params, r, theta, vector) {
  const { cov } = metric(params, r, theta);
  let value = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) value += cov[i][j] * vector[i] * vector[j];
  }
  return value;
}

function radialFloor(params) {
  const { rPlus, naked } = horizons(params);
  return naked ? 1e-4 : Math.max(1e-4, rPlus + 1e-5);
}

function partialHamiltonian(params, state, key) {
  const base = state[key];
  const scale = Math.max(1, Math.abs(base));
  let h = 1e-5 * scale;

  if (key === "r") {
    const floor = radialFloor(params);
    const hi = base + h;
    const lo = Math.max(floor, base - h);
    if (hi === lo) return 0;
    const plus = { ...state, r: hi };
    const minus = { ...state, r: lo };
    return (hamiltonian(params, plus) - hamiltonian(params, minus)) / (hi - lo);
  }

  if (key === "theta") {
    const hi = clamp(base + h, POLE_EPS, Math.PI - POLE_EPS);
    const lo = clamp(base - h, POLE_EPS, Math.PI - POLE_EPS);
    if (hi === lo) return 0;
    const plus = { ...state, theta: hi };
    const minus = { ...state, theta: lo };
    return (hamiltonian(params, plus) - hamiltonian(params, minus)) / (hi - lo);
  }

  return 0;
}

export function derivatives(params, state) {
  const u = contravariantVelocity(params, state);
  return {
    t: u[0],
    r: u[1],
    theta: u[2],
    phi: u[3],
    Pt: 0,
    Pr: -partialHamiltonian(params, state, "r"),
    Ptheta: -partialHamiltonian(params, state, "theta"),
    Pphi: 0,
  };
}

function addScaledState(state, deriv, scale) {
  const next = { ...state };
  for (const key of DYNAMIC_KEYS) next[key] = state[key] + deriv[key] * scale;
  next.theta = clamp(next.theta, POLE_EPS, Math.PI - POLE_EPS);
  return next;
}

function combineRk4(state, k1, k2, k3, k4, h) {
  const next = { ...state };
  for (const key of DYNAMIC_KEYS) {
    next[key] = state[key] + (h / 6) * (
      k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]
    );
  }
  next.theta = clamp(next.theta, POLE_EPS, Math.PI - POLE_EPS);
  next.phi = wrapAngle(next.phi);
  return next;
}

export function rk4Step(params, state, h) {
  const k1 = derivatives(params, state);
  const k2 = derivatives(params, addScaledState(state, k1, h / 2));
  const k3 = derivatives(params, addScaledState(state, k2, h / 2));
  const k4 = derivatives(params, addScaledState(state, k3, h));
  return combineRk4(state, k1, k2, k3, k4, h);
}

export function makeMassiveState(params, options = {}) {
  const r = options.r ?? 10;
  const theta = clamp(options.theta ?? Math.PI / 2, POLE_EPS, Math.PI - POLE_EPS);
  const phi = options.phi ?? 0;
  const velocity = options.velocity ?? [0, 0, 0.25];
  const chargeToMass = options.chargeToMass ?? 0;
  const u = fourVelocityFromLocal(params, r, theta, velocity);
  const P = canonicalMomentum(params, r, theta, u, chargeToMass);
  const state = {
    id: options.id,
    name: options.name ?? "massive-particle",
    kind: options.kind ?? "massive",
    mass: options.mass ?? 1,
    radius: options.radius ?? 0,
    binding: options.binding ?? 1,
    chargeToMass,
    t: options.t ?? 0,
    r,
    theta,
    phi,
    Pt: P[0],
    Pr: P[1],
    Ptheta: P[2],
    Pphi: P[3],
    status: "active",
    events: [],
  };
  state.initialHamiltonian = hamiltonian(params, state);
  return state;
}

export function makePhotonState(params, options = {}) {
  const r = options.r ?? 10;
  const theta = clamp(options.theta ?? Math.PI / 2, POLE_EPS, Math.PI - POLE_EPS);
  const phi = options.phi ?? 0;
  const direction = options.direction ?? [0, 0, 1];
  const localEnergy = options.localEnergy ?? 1;
  const k = nullVectorFromLocal(params, r, theta, direction, localEnergy);
  const P = canonicalMomentum(params, r, theta, k, 0);
  const state = {
    id: options.id,
    name: options.name ?? "photon",
    kind: "photon",
    mass: 0,
    radius: 0,
    binding: Infinity,
    chargeToMass: 0,
    t: options.t ?? 0,
    r,
    theta,
    phi,
    Pt: P[0],
    Pr: P[1],
    Ptheta: P[2],
    Pphi: P[3],
    status: "active",
    events: [],
  };
  state.initialHamiltonian = hamiltonian(params, state);
  return state;
}

export function orbitalOmegaKerrNewman(params, r, prograde = true) {
  const { M, Q, a } = sanitizeParams(params);
  const rootArg = Math.max(M * r - Q * Q, 0);
  const root = Math.sqrt(rootArg);
  const sign = prograde ? 1 : -1;
  const denom = r * r + sign * a * root;
  if (Math.abs(denom) <= EPS) return NaN;
  return sign * root / denom;
}

export function localAzimuthalVelocityForOmega(params, r, theta, omegaCoordinate) {
  const frame = zamoFrame(params, r, theta);
  const { cov } = metric(params, r, theta);
  return Math.sqrt(cov[3][3]) * (omegaCoordinate - frame.omega) / frame.alpha;
}

export function makeEquatorialCircularState(params, options = {}) {
  const r = options.r ?? 10;
  const prograde = options.prograde ?? true;
  const omega = orbitalOmegaKerrNewman(params, r, prograde);
  let vPhi = localAzimuthalVelocityForOmega(params, r, Math.PI / 2, omega);
  if (!Number.isFinite(vPhi)) vPhi = prograde ? 0.25 : -0.25;
  vPhi = clamp(vPhi, -0.98, 0.98);
  const vR = options.radialVelocity ?? 0;
  return makeMassiveState(params, {
    ...options,
    r,
    theta: Math.PI / 2,
    velocity: [vR, 0, vPhi],
  });
}

export function iscoRadiusKerrApprox(params, prograde = true) {
  const { M, a } = sanitizeParams(params);
  const aNorm = clamp(Math.abs(a / M), 0, 0.999999);
  const signedA = prograde ? aNorm : -aNorm;
  const z1 = 1 + Math.cbrt(1 - signedA * signedA) *
    (Math.cbrt(1 + signedA) + Math.cbrt(1 - signedA));
  const z2 = Math.sqrt(3 * signedA * signedA + z1 * z1);
  const sign = prograde ? 1 : -1;
  return M * (3 + z2 - sign * Math.sqrt((3 - z1) * (3 + z1 + 2 * z2)));
}

export function photonOrbitRadiusKerrApprox(params, prograde = true) {
  const { M, a } = sanitizeParams(params);
  const aNorm = clamp(Math.abs(a / M), 0, 0.999999);
  const sign = prograde ? -1 : 1;
  return 2 * M * (1 + Math.cos((2 / 3) * Math.acos(sign * aNorm)));
}

export function tidalStressEstimate(params, state) {
  const { M, Q, a } = sanitizeParams(params);
  const r = Math.max(Math.abs(state.r), 1e-4);
  const theta = state.theta ?? Math.PI / 2;
  const bodyRadius = state.radius ?? 0;
  const binding = Math.max(state.binding ?? 1, 1e-9);
  const spinAnisotropy = 1 + 3 * (a * a / (r * r + a * a + EPS)) * Math.cos(theta) ** 2;
  const curvatureScale = Math.abs((2 * M) / (r ** 3) - (3 * Q * Q) / (r ** 4)) * spinAnisotropy;
  const differentialAcceleration = curvatureScale * bodyRadius;
  return {
    curvatureScale,
    differentialAcceleration,
    normalized: differentialAcceleration / binding,
  };
}

export function geometrySummary(params) {
  const p = sanitizeParams(params);
  return {
    params: p,
    horizons: horizons(p),
    staticLimitEquator: staticLimitRadius(p, Math.PI / 2),
    staticLimitPole: staticLimitRadius(p, 0),
    horizonAngularVelocity: horizonAngularVelocity(p),
    horizonArea: horizonArea(p),
    surfaceGravity: surfaceGravity(p),
    horizonElectricPotential: horizonElectricPotential(p),
    iscoProgradeApprox: iscoRadiusKerrApprox(p, true),
    iscoRetrogradeApprox: iscoRadiusKerrApprox(p, false),
    photonOrbitProgradeApprox: photonOrbitRadiusKerrApprox(p, true),
    photonOrbitRetrogradeApprox: photonOrbitRadiusKerrApprox(p, false),
  };
}

export function blandfordZnajekJet(params, options = {}) {
  const p = sanitizeParams(params);
  const h = horizons(p);
  if (h.naked) {
    return {
      valid: false,
      reason: "No event horizon; Blandford-Znajek extraction is undefined for a naked singularity.",
    };
  }
  const B = options.magneticField ?? p.B ?? 0;
  const mdot = Math.max(0, options.accretionRate ?? 0);
  const kappa = options.kappa ?? 0.044;
  const omegaH = horizonAngularVelocity(p);
  const magneticFlux = options.magneticFlux ?? (2 * Math.PI * h.rPlus * h.rPlus * B);
  const bzPower = (kappa / (4 * Math.PI)) * magneticFlux * magneticFlux * omegaH * omegaH;
  const diskEfficiency = 0.057 + 0.25 * clamp(Math.abs(p.a / p.M), 0, 1) ** 1.7;
  const accretionLuminosity = diskEfficiency * mdot;
  const lorentzFactor = 1 + 20 * clamp(Math.abs(p.a / p.M), 0, 1) * clamp(Math.abs(B), 0, 2) + 0.12 * mdot;
  const openingAngleDeg = clamp(28 - 22 * clamp(Math.abs(p.a / p.M) * Math.abs(B), 0, 1), 1.5, 35);
  return {
    valid: true,
    magneticFlux,
    omegaH,
    bzPower,
    accretionLuminosity,
    totalPower: bzPower + accretionLuminosity,
    diskEfficiency,
    lorentzFactor,
    openingAngleDeg,
  };
}

function copyDynamicFields(target, source) {
  for (const key of DYNAMIC_KEYS) target[key] = source[key];
}

function compactState(state) {
  return {
    id: state.id,
    name: state.name,
    kind: state.kind,
    status: state.status,
    t: state.t,
    r: state.r,
    theta: state.theta,
    phi: state.phi,
    energy: -state.Pt,
    angularMomentumZ: state.Pphi,
    hamiltonian: state.lastHamiltonian,
    hamiltonianDrift: state.hamiltonianDrift,
    insideErgosphere: state.insideErgosphere,
    tidal: state.tidal,
  };
}

export class KerrNewmanSimulator {
  constructor(params = {}, options = {}) {
    this.params = sanitizeParams(params);
    this.options = {
      stepSize: options.stepSize ?? 0.02,
      escapeRadius: options.escapeRadius ?? 80,
      maxTrail: options.maxTrail ?? 2048,
      disruptOnTidal: options.disruptOnTidal ?? true,
      tidalDisruptionThreshold: options.tidalDisruptionThreshold ?? 1,
      stopAtHorizon: options.stopAtHorizon ?? true,
      horizonBuffer: options.horizonBuffer ?? 1e-4,
    };
    this.lambda = 0;
    this.nextId = 1;
    this.particles = [];
    this.events = [];
    this.accretedCount = 0;
  }

  addParticle(state) {
    const particle = {
      ...state,
      id: state.id ?? this.nextId++,
      status: state.status ?? "active",
      initialHamiltonian: state.initialHamiltonian ?? hamiltonian(this.params, state),
      lastHamiltonian: state.initialHamiltonian ?? hamiltonian(this.params, state),
      hamiltonianDrift: 0,
      insideErgosphere: false,
      tidal: null,
      trail: [[state.t, state.r, state.theta, state.phi]],
      events: [...(state.events ?? [])],
    };
    this.particles.push(particle);
    return particle.id;
  }

  addMassiveParticle(options = {}) {
    return this.addParticle(makeMassiveState(this.params, options));
  }

  addPhoton(options = {}) {
    return this.addParticle(makePhotonState(this.params, options));
  }

  addCircularOrbit(options = {}) {
    return this.addParticle(makeEquatorialCircularState(this.params, options));
  }

  addThinDisc(count = 64, options = {}) {
    const ids = [];
    const innerR = options.innerR ?? Math.max(iscoRadiusKerrApprox(this.params, true) * 1.05, horizons(this.params).rPlus + 0.5);
    const outerR = options.outerR ?? innerR * 2.8;
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0 : i / (count - 1);
      const jitter = (options.jitter ?? 0.04) * (Math.random() - 0.5);
      const r = innerR + (outerR - innerR) * (f + jitter);
      const phi = (i / count) * Math.PI * 2 + (options.phaseJitter ?? 0.1) * (Math.random() - 0.5);
      const radialVelocity = -(options.inflowVelocity ?? 0.002) * (1 + 0.2 * Math.random());
      ids.push(this.addCircularOrbit({
        name: `${options.namePrefix ?? "disc"}-${String(i + 1).padStart(3, "0")}`,
        kind: "disc",
        r,
        phi,
        prograde: options.prograde ?? true,
        radialVelocity,
        radius: options.particleRadius ?? 0,
        binding: Infinity,
      }));
    }
    return ids;
  }

  pushEvent(particle, type, message) {
    const event = {
      lambda: this.lambda,
      particleId: particle.id,
      particle: particle.name,
      type,
      message,
    };
    this.events.push(event);
    particle.events.push(event);
    return event;
  }

  diagnose(particle) {
    const h = horizons(this.params);
    const rStatic = staticLimitRadius(this.params, particle.theta);
    particle.insideErgosphere = Number.isFinite(rStatic) && particle.r < rStatic && (h.naked || particle.r > h.rPlus);
    particle.lastHamiltonian = hamiltonian(this.params, particle);
    particle.hamiltonianDrift = particle.lastHamiltonian - particle.initialHamiltonian;
    particle.tidal = tidalStressEstimate(this.params, particle);

    if (particle.status !== "active") return;

    if (!h.naked && particle.r <= h.rPlus + this.options.horizonBuffer) {
      particle.status = "captured";
      this.accretedCount += 1;
      this.pushEvent(particle, "capture", "Crossed the outer event horizon.");
      return;
    }

    if (h.naked && particle.r <= 1e-3) {
      particle.status = "singularity";
      this.pushEvent(particle, "singularity", "Reached the naked singularity cutoff.");
      return;
    }

    if (
      this.options.disruptOnTidal &&
      particle.kind !== "photon" &&
      particle.kind !== "disc" &&
      particle.tidal.normalized >= this.options.tidalDisruptionThreshold
    ) {
      particle.status = "tidally-disrupted";
      this.pushEvent(particle, "tidal-disruption", "Tidal stress exceeded the configured binding threshold.");
      return;
    }

    if (particle.r >= this.options.escapeRadius) {
      particle.status = "escaped";
      this.pushEvent(particle, "escape", "Left the configured detector radius.");
    }
  }

  step(stepSize = this.options.stepSize) {
    for (const particle of this.particles) {
      if (particle.status !== "active") continue;
      const h = horizons(this.params);
      if (this.options.stopAtHorizon && !h.naked && particle.r <= h.rPlus + this.options.horizonBuffer) {
        this.diagnose(particle);
        continue;
      }
      const next = rk4Step(this.params, particle, stepSize);
      copyDynamicFields(particle, next);
      particle.trail.push([particle.t, particle.r, particle.theta, particle.phi]);
      if (particle.trail.length > this.options.maxTrail) {
        particle.trail.splice(0, particle.trail.length - this.options.maxTrail);
      }
      this.diagnose(particle);
    }
    this.lambda += stepSize;
    return this.snapshot();
  }

  run(options = {}) {
    const steps = options.steps ?? 1000;
    const stepSize = options.stepSize ?? this.options.stepSize;
    const recordEvery = Math.max(1, options.recordEvery ?? Math.ceil(steps / 100));
    const frames = [];
    for (let i = 0; i < steps; i++) {
      const snapshot = this.step(stepSize);
      if (i % recordEvery === 0 || i === steps - 1) frames.push(snapshot);
    }
    return frames;
  }

  accretionRateEstimate(windowLambda = 10) {
    const since = this.lambda - windowLambda;
    const recent = this.events.filter((event) => event.type === "capture" && event.lambda >= since).length;
    return recent / Math.max(windowLambda, EPS);
  }

  snapshot() {
    const accretionRate = this.accretionRateEstimate();
    return {
      lambda: this.lambda,
      geometry: geometrySummary(this.params),
      jet: blandfordZnajekJet(this.params, { accretionRate }),
      accretionRate,
      activeCount: this.particles.filter((p) => p.status === "active").length,
      particles: this.particles.map(compactState),
      events: this.events.slice(-20),
    };
  }
}

