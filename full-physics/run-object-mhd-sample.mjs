import { KerrNewmanSimulator } from "./kn-full-physics.mjs";
import {
  OBJECT_GROUPS,
  OBJECT_SCENARIOS,
  addObjectRing,
  listObjectTypes,
  objectDiagnostics,
  seedObjectScenario,
} from "./object-library.mjs";
import { MHDJetEngine } from "./mhd-jet-engine.mjs";

const params = {
  M: 1.5,
  Q: 0.30,
  a: 1.10,
  B: 0.62,
};

const sim = new KerrNewmanSimulator(params, {
  stepSize: 0.012,
  escapeRadius: 95,
  disruptOnTidal: true,
  tidalDisruptionThreshold: 1.0,
});

seedObjectScenario(sim, "baselineLab");
seedObjectScenario(sim, "chargeCoupling");
addObjectRing(sim, "dustParcel", 32, {
  namePrefix: "feed-dust",
  innerR: 5.4,
  outerR: 17,
  radialVelocity: -0.0025,
});
addObjectRing(sim, "magnetizedPlasmaBlob", 10, {
  namePrefix: "hot-blob",
  innerR: 6.2,
  outerR: 11,
  mode: "eccentric",
  radialVelocity: -0.004,
});

const jet = new MHDJetEngine(params, {
  zoneCount: 40,
  zMax: 140,
  dt: 0.04,
  seed: 424242,
  reconnectionRate: 0.16,
});

const frames = [];
const steps = 1600;
for (let i = 0; i < steps; i++) {
  sim.step(0.012);
  const pulse = i > 260 && i < 760 ? 0.20 : 0.04;
  const measuredAccretion = sim.accretionRateEstimate(18);
  const accretionRate = Math.max(measuredAccretion, pulse);
  const jetFrame = jet.step({
    accretionRate,
    magneticField: params.B * (1 + 0.08 * Math.sin(i * 0.025)),
    massLoading: 0.006 + 0.028 * accretionRate,
  }, 0.04);
  if (i % 160 === 0 || i === steps - 1) {
    frames.push({
      step: i,
      lambda: sim.lambda,
      activeObjects: sim.snapshot().activeCount,
      jetGamma: jetFrame.global.lorentzFactor,
      jetOpeningAngleDeg: jetFrame.global.openingAngleDeg,
      flareCount: jetFrame.recentEvents.length,
    });
  }
}

const final = sim.snapshot();
const jetFinal = jet.snapshot();

const particleSummary = sim.particles
  .filter((particle) => !particle.name.startsWith("feed-dust") && !particle.name.startsWith("hot-blob"))
  .map((particle) => ({
    id: particle.id,
    name: particle.name,
    kind: particle.kind,
    status: particle.status,
    r: particle.r,
    energy: -particle.Pt,
    angularMomentumZ: particle.Pphi,
    hamiltonianDrift: particle.hamiltonianDrift,
    diagnostics: objectDiagnostics(params, particle, particle.libraryType),
  }));

const objectCounts = Object.fromEntries(
  Object.entries(OBJECT_GROUPS).map(([group, ids]) => [group, ids.length]),
);

console.log(JSON.stringify({
  model: "Object library + dynamic MHD jet sample",
  units: "G = c = 4 pi epsilon_0 = 1",
  availableObjectCount: listObjectTypes().length,
  objectCounts,
  scenarios: Object.keys(OBJECT_SCENARIOS),
  frameCount: frames.length,
  frames,
  finalObjects: particleSummary,
  simulatorEvents: final.events,
  jet: {
    time: jetFinal.time,
    global: jetFinal.global,
    baseZone: jetFinal.zones[0],
    midZone: jetFinal.zones[Math.floor(jetFinal.zones.length / 2)],
    headZone: jetFinal.zones[jetFinal.zones.length - 1],
    recentEvents: jetFinal.recentEvents,
  },
}, null, 2));
