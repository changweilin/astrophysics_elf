import {
  KerrNewmanSimulator,
  geometrySummary,
} from "./kn-full-physics.mjs";

const params = {
  M: 1.5,
  Q: 0.25,
  a: 1.05,
  B: 0.45,
};

const sim = new KerrNewmanSimulator(params, {
  stepSize: 0.015,
  escapeRadius: 90,
  disruptOnTidal: true,
  tidalDisruptionThreshold: 1.0,
});

sim.addCircularOrbit({
  name: "prograde-lab-ship",
  kind: "ship",
  r: 8.5,
  prograde: true,
  radius: 0.015,
  binding: 8.0,
});

sim.addMassiveParticle({
  name: "charged-probe",
  kind: "probe",
  r: 13,
  theta: Math.PI / 2,
  phi: 0.7,
  velocity: [-0.025, 0, 0.34],
  chargeToMass: 0.18,
  radius: 0.005,
  binding: 50,
});

sim.addPhoton({
  name: "grazing-photon",
  r: 18,
  theta: Math.PI / 2,
  phi: -0.4,
  direction: [-0.18, 0, 0.984],
  localEnergy: 1,
});

sim.addThinDisc(48, {
  namePrefix: "mhd-ring",
  innerR: 5.8,
  outerR: 18,
  inflowVelocity: 0.0015,
  jitter: 0.02,
});

const frames = sim.run({
  steps: 1800,
  stepSize: 0.015,
  recordEvery: 180,
});

const final = sim.snapshot();
const hamiltonianDrift = final.particles.map((particle) => ({
  id: particle.id,
  name: particle.name,
  status: particle.status,
  hamiltonianDrift: particle.hamiltonianDrift,
}));

console.log(JSON.stringify({
  model: "Kerr-Newman full physics sample",
  units: "G = c = 4 pi epsilon_0 = 1",
  geometry: geometrySummary(params),
  frameCount: frames.length,
  finalLambda: final.lambda,
  activeCount: final.activeCount,
  accretionRate: final.accretionRate,
  jet: final.jet,
  hamiltonianDrift,
  recentEvents: final.events,
}, null, 2));

