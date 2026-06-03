/*
 * Standalone sample: how many orbits does a binary black hole really inspiral
 * through before merging, and how does that depend on m1 / m2?
 *
 * Run: node .\full-physics\run-binary-inspiral-sample.mjs
 */

import {
  binaryInspiralProfile,
} from "./binary-inspiral.mjs";

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// 1) GW150914-like stellar binary: what LIGO actually "sees" in band vs the
//    full inspiral from 10 r_g.
const gw150914 = binaryInspiralProfile({
  m1: 36,
  m2: 29,
  separationRg: 10,
  bandLowHz: 35,
  sweepSamples: 6,
});

// 2) Mass-ratio sweep at a fixed separation (10 r_g): orbit count tracks 1/eta.
const ratios = [
  { label: "equal 30+30", m1: 30, m2: 30 },
  { label: "2:1  40+20", m1: 40, m2: 20 },
  { label: "10:1 55+5.5", m1: 55, m2: 5.5 },
  { label: "100:1 60+0.6", m1: 60, m2: 0.6 },
];
const ratioSweep = ratios.map(({ label, m1, m2 }) => {
  const p = binaryInspiralProfile({ m1, m2, separationRg: 10 });
  return {
    label,
    massRatio: round(p.masses.massRatio, 2),
    symmetricMassRatio: round(p.masses.symmetricMassRatio, 4),
    orbitCountFactor_inv_eta: round(p.masses.orbitCountFactor, 3),
    orbitsToMergeFrom10rg: round(p.atSeparation.orbitsToMerge, 2),
  };
});

console.log(JSON.stringify({
  model: "Quasi-circular binary inspiral (Peters 1964 + leading PN phasing)",
  units: "SI; masses in solar masses; frequencies in Hz",
  gw150914: {
    masses: {
      totalSolar: round(gw150914.masses.totalSolar, 2),
      chirpSolar: round(gw150914.masses.chirpSolar, 2),
      symmetricMassRatio: round(gw150914.masses.symmetricMassRatio, 4),
    },
    iscoGwFrequencyHz: round(gw150914.isco.gwFrequencyHz, 1),
    from10rg: {
      gwFrequencyHz: round(gw150914.atSeparation.gwFrequencyHz, 2),
      orbitsToMerge: round(gw150914.atSeparation.orbitsToMerge, 2),
      timeToMergeSeconds: round(gw150914.atSeparation.timeToMergeSeconds, 4),
    },
    inBandFrom35Hz: {
      orbits: round(gw150914.band.orbits, 2),
      gwCycles: round(gw150914.band.gwCycles, 2),
      durationSeconds: round(gw150914.band.durationSeconds, 4),
    },
    chirp: gw150914.chirp.map((s) => ({
      timeToMergeSec: round(s.timeToMergeSec, 4),
      separationRg: round(s.separationRg, 2),
      gwFrequencyHz: round(s.gwFrequencyHz, 1),
      cumulativeOrbits: round(s.cumulativeOrbits, 2),
    })),
  },
  massRatioSweepAt10rg: ratioSweep,
}, null, 2));
