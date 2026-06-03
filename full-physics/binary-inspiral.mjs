/*
 * Quasi-circular binary inspiral diagnostics (Peters 1964 + leading PN phasing).
 *
 * This is an additive, self-contained module: it answers "how many orbits does a
 * binary black hole really go through before merging, and how does that depend on
 * m1 / m2?". The two black holes are treated as point masses radiating
 * gravitational waves on a slowly shrinking circular orbit (the standard
 * adiabatic inspiral approximation).
 *
 * Physics summary (all SI internally):
 *   - Chirp mass            Mc   = (m1 m2)^(3/5) / (m1 + m2)^(1/5)
 *   - Symmetric mass ratio  eta  = m1 m2 / (m1 + m2)^2   (1/4 for equal mass)
 *   - Merge time            t    = (5/256) c^5 a^4 / (G^3 m1 m2 M)   [Peters]
 *   - Orbits a -> 0         N    = (1/64 pi) (a / r_g)^(5/2) / eta
 *   - GW cycles f -> merge  Ngw  = (1/32 pi) (pi G Mc f / c^3)^(-5/3)
 *
 * The separation-based orbit count and the frequency-based cycle count are the
 * same physics (N_orbit = Ngw / 2); the inspiral has no true beginning, so what
 * is physically fixed is the count between two separations / two frequencies.
 *
 * Key relationship to m1 / m2: at a fixed separation in gravitational radii,
 * the orbit count scales as 1 / eta = (m1 + m2)^2 / (m1 m2). Equal masses give
 * the minimum (eta = 1/4); extreme mass ratios (EMRIs) give enormous counts.
 *
 * Units note: the rest of full-physics uses G = c = 1, but a binary chirp is
 * naturally expressed in solar masses and Hz, so this module works in SI and
 * accepts masses in solar masses by default.
 */

const G = 6.67430e-11;
const C = 299792458;
const SOLAR_MASS_KG = 1.98847e30;

// Schwarzschild ISCO at 6 r_g is the conventional end of the slow inspiral.
const DEFAULT_ISCO_RG = 6;

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function toKg(mass, massUnit) {
  if (massUnit === "kg") return mass;
  return mass * SOLAR_MASS_KG;
}

/** Chirp mass in kg from component masses in kg. */
export function chirpMassKg(m1, m2) {
  return Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2);
}

/** Symmetric mass ratio eta = m1 m2 / (m1 + m2)^2 (dimensionless). */
export function symmetricMassRatio(m1, m2) {
  const M = m1 + m2;
  return (m1 * m2) / (M * M);
}

/** Gravitational radius r_g = G M / c^2 (meters) for total mass M (kg). */
export function gravitationalRadiusMeters(totalMassKg) {
  return (G * totalMassKg) / (C * C);
}

/** GW frequency (Hz) for a circular orbit at separation a (m); f_gw = 2 f_orb. */
export function gwFrequencyFromSeparation(totalMassKg, separationMeters) {
  const orbital = Math.sqrt((G * totalMassKg) / Math.pow(separationMeters, 3)) / (2 * Math.PI);
  return 2 * orbital;
}

/** Circular separation (m) that radiates at a given GW frequency (Hz). */
export function separationFromGwFrequency(totalMassKg, gwFrequencyHz) {
  const orbitalAngular = Math.PI * gwFrequencyHz; // omega_orb = pi * f_gw
  return Math.cbrt((G * totalMassKg) / (orbitalAngular * orbitalAngular));
}

/**
 * Peters (1964) time to coalescence from a circular separation a (m).
 * Returns seconds.
 */
export function timeToMergeFromSeparation(m1Kg, m2Kg, separationMeters) {
  const M = m1Kg + m2Kg;
  return (5 / 256) * Math.pow(C, 5) * Math.pow(separationMeters, 4) /
    (Math.pow(G, 3) * m1Kg * m2Kg * M);
}

/**
 * Number of orbital revolutions completed shrinking from separation a (m) all
 * the way to a = 0, under the leading quadrupole (Peters) decay. Finite because
 * the integral converges as a^(5/2).
 */
export function orbitsToZero(m1Kg, m2Kg, separationMeters) {
  const M = m1Kg + m2Kg;
  const rg = gravitationalRadiusMeters(M);
  const eta = symmetricMassRatio(m1Kg, m2Kg);
  return (1 / (64 * Math.PI)) * Math.pow(separationMeters / rg, 2.5) / eta;
}

/**
 * GW cycles accumulated from GW frequency f (Hz) until coalescence, leading PN.
 * Orbital revolutions are half this.
 */
export function gwCyclesToMerge(m1Kg, m2Kg, gwFrequencyHz) {
  const Mc = chirpMassKg(m1Kg, m2Kg);
  const x = (Math.PI * G * Mc * gwFrequencyHz) / Math.pow(C, 3);
  return (1 / (32 * Math.PI)) * Math.pow(x, -5 / 3);
}

/**
 * Full inspiral profile for a quasi-circular binary.
 *
 * Input:
 *   { m1, m2, massUnit?, separationRg?, bandLowHz?, bandHighHz?, iscoRg?,
 *     sweepSamples? }
 *
 * m1 / m2 default to solar masses. `separationRg` (a / r_g) requests a snapshot
 * at one separation. `bandLowHz` requests a detector-band orbit/cycle count.
 */
export function binaryInspiralProfile(input = {}) {
  const massUnit = input.massUnit === "kg" ? "kg" : "solar";
  const m1 = toKg(assertPositive(input.m1 ?? 1, "m1"), massUnit);
  const m2 = toKg(assertPositive(input.m2 ?? 1, "m2"), massUnit);
  const M = m1 + m2;
  const mu = (m1 * m2) / M;
  const Mc = chirpMassKg(m1, m2);
  const eta = symmetricMassRatio(m1, m2);
  const rg = gravitationalRadiusMeters(M);
  const iscoRg = assertPositive(input.iscoRg ?? DEFAULT_ISCO_RG, "iscoRg");
  const iscoMeters = iscoRg * rg;
  const iscoGwFreq = gwFrequencyFromSeparation(M, iscoMeters);

  const result = {
    input: { m1: input.m1 ?? 1, m2: input.m2 ?? 1, massUnit },
    masses: {
      m1Solar: m1 / SOLAR_MASS_KG,
      m2Solar: m2 / SOLAR_MASS_KG,
      totalSolar: M / SOLAR_MASS_KG,
      chirpSolar: Mc / SOLAR_MASS_KG,
      reducedSolar: mu / SOLAR_MASS_KG,
      massRatio: Math.max(m1, m2) / Math.min(m1, m2),
      symmetricMassRatio: eta,
      orbitCountFactor: 1 / eta, // (m1 + m2)^2 / (m1 m2)
    },
    scales: {
      gravRadiusMeters: rg,
      gravRadiusKm: rg / 1000,
      lightCrossingTimeSec: rg / C,
    },
    isco: {
      separationRg: iscoRg,
      separationMeters: iscoMeters,
      gwFrequencyHz: iscoGwFreq,
    },
  };

  if (Number.isFinite(input.separationRg)) {
    const aRg = assertPositive(input.separationRg, "separationRg");
    const a = aRg * rg;
    const orbitsFromHere = orbitsToZero(m1, m2, a) - orbitsToZero(m1, m2, iscoMeters);
    result.atSeparation = {
      separationRg: aRg,
      separationMeters: a,
      orbitFrequencyHz: gwFrequencyFromSeparation(M, a) / 2,
      gwFrequencyHz: gwFrequencyFromSeparation(M, a),
      orbitsToMerge: orbitsFromHere,
      gwCyclesToMerge: 2 * orbitsFromHere,
      timeToMergeSeconds: timeToMergeFromSeparation(m1, m2, a) -
        timeToMergeFromSeparation(m1, m2, iscoMeters),
    };
  }

  if (Number.isFinite(input.bandLowHz)) {
    const low = assertPositive(input.bandLowHz, "bandLowHz");
    const high = Number.isFinite(input.bandHighHz)
      ? assertPositive(input.bandHighHz, "bandHighHz")
      : iscoGwFreq;
    // Inspiral GW signal only exists below the ISCO frequency; the band is the
    // requested window intersected with [0, f_ISCO]. A supermassive / EMRI binary
    // merges at mHz, so a ground-detector band (>= tens of Hz) is empty for it.
    const effHigh = Math.min(high, iscoGwFreq);
    const effLow = Math.min(low, effHigh);
    if (low >= iscoGwFreq) {
      result.band = { lowHz: low, highHz: high, inBand: false, gwCycles: 0, orbits: 0, durationSeconds: 0 };
    } else {
      const cycles = gwCyclesToMerge(m1, m2, effLow) - gwCyclesToMerge(m1, m2, effHigh);
      const aLow = separationFromGwFrequency(M, effLow);
      const aHigh = separationFromGwFrequency(M, effHigh);
      result.band = {
        lowHz: low,
        highHz: high,
        inBand: true,
        gwCycles: cycles,
        orbits: cycles / 2,
        durationSeconds: timeToMergeFromSeparation(m1, m2, aLow) -
          timeToMergeFromSeparation(m1, m2, aHigh),
      };
    }
  }

  const sweepSamples = Number.isFinite(input.sweepSamples)
    ? Math.max(2, Math.floor(input.sweepSamples))
    : 0;
  if (sweepSamples > 0) {
    // Sample evenly in time-to-merge so the visible "chirp" speed-up is captured.
    const aStart = Number.isFinite(input.separationRg)
      ? input.separationRg * rg
      : 10 * rg;
    const tStart = timeToMergeFromSeparation(m1, m2, aStart) -
      timeToMergeFromSeparation(m1, m2, iscoMeters);
    const chirp = [];
    for (let i = 0; i < sweepSamples; i++) {
      const frac = i / (sweepSamples - 1); // 0 at start, 1 at ISCO
      const tRemaining = tStart * (1 - frac);
      // Invert Peters: a(t) = (a_start^4 - (256/5) G^3 m1 m2 M / c^5 * (t_elapsed))^(1/4)
      const elapsed = tStart - tRemaining;
      const aFourth = Math.pow(aStart, 4) -
        (256 / 5) * Math.pow(G, 3) * m1 * m2 * M / Math.pow(C, 5) * elapsed;
      const a = aFourth > 0 ? Math.pow(aFourth, 0.25) : iscoMeters;
      const aClamped = Math.max(a, iscoMeters);
      chirp.push({
        timeToMergeSec: tRemaining,
        separationRg: aClamped / rg,
        gwFrequencyHz: gwFrequencyFromSeparation(M, aClamped),
        cumulativeOrbits: orbitsToZero(m1, m2, aStart) - orbitsToZero(m1, m2, aClamped),
      });
    }
    result.chirp = chirp;
  }

  return result;
}
