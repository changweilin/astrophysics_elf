# Physics Engine Contract

This document describes the stable additive facade in `physics-engine.mjs`.
It is intended for future UI, worker, or sample code that should not import the
lower-level physics modules directly.

Units: `G = c = 4 pi epsilon_0 = 1`.

## Construction

```js
import { PhysicsEngine, createPhysicsEngine } from "./physics-engine.mjs";

const engine = new PhysicsEngine({ M: 1.5, Q: 0.25, a: 1.0, B: 0.4 });
const same = createPhysicsEngine({ M: 1.5, Q: 0.25, a: 1.0, B: 0.4 });
```

Constructor input:

```json
{
  "M": 1.5,
  "Q": 0.25,
  "a": 1.0,
  "B": 0.4
}
```

Optional constructor settings:

```json
{
  "simulatorOptions": {
    "stepSize": 0.02,
    "escapeRadius": 100
  },
  "jetOptions": {
    "zoneCount": 48,
    "dt": 0.03
  },
  "autoCreateJet": true
}
```

## Geometry

`engine.geometry(overrides)`

Returns Kerr-Newman geometry summaries. If `overrides.position` is provided,
the output also includes an orbit-region classification.

Input:

```json
{
  "params": { "M": 1.5, "Q": 0.2, "a": 0.8, "B": 0.35 },
  "position": { "r": 7.2, "theta": 1.5707963267948966 }
}
```

Output shape:

```json
{
  "params": {},
  "horizons": { "rPlus": 0, "rMinus": 0, "discriminant": 0, "naked": false },
  "staticLimitEquator": 0,
  "staticLimitPole": 0,
  "horizonAngularVelocity": 0,
  "horizonArea": 0,
  "surfaceGravity": 0,
  "horizonElectricPotential": 0,
  "iscoProgradeApprox": 0,
  "iscoRetrogradeApprox": 0,
  "photonOrbitProgradeApprox": 0,
  "photonOrbitRetrogradeApprox": 0,
  "region": {
    "insideHorizon": false,
    "insideErgosphere": false,
    "horizonMargin": 0,
    "staticLimitMargin": 0
  }
}
```

## Object Catalog And Spawning

`engine.objectCatalog(filter)`

Returns available object summaries, groups, and scenario summaries.

Filter shape:

```json
{ "family": "engineered", "kind": "probe" }
```

`engine.objectSpec(typeId)`

Returns the full catalog specification for a type such as `neutralProbe`.

`engine.createObject(typeId, placement)`

Builds a Boyer-Lindquist state without adding it to the simulator.

`engine.spawnObject(typeId, placement, options)`

Adds a catalog object to the simulator unless `options.addToSimulator` is
`false`.

Placement shape:

```json
{
  "name": "PR-geodesic",
  "mode": "eccentric",
  "r": 13,
  "theta": 1.5707963267948966,
  "phi": 0.65,
  "velocity": [-0.025, 0, 0.3],
  "chargeToMass": 0
}
```

Spawn output shape:

```json
{
  "id": 1,
  "typeId": "neutralProbe",
  "state": {
    "id": 1,
    "name": "PR-geodesic",
    "kind": "probe",
    "status": "active",
    "libraryType": "neutralProbe",
    "t": 0,
    "r": 13,
    "theta": 1.5707963267948966,
    "phi": 0.65,
    "energy": 0,
    "angularMomentumZ": 0,
    "hamiltonian": -0.5,
    "hamiltonianDrift": 0
  },
  "diagnostics": {
    "tidal": {},
    "rocheRadius": 0,
    "horizonMargin": 0,
    "survival": "comfortable"
  }
}
```

`engine.seedScenario(scenarioId, overrides)`

Adds a predefined object scenario and returns spawned ids.

`engine.addObjectRing(typeId, count, options)`

Adds many catalog objects in a radial ring and returns spawned ids.

## Generic Particles

`engine.spawnParticle(input, options)`

Creates or adds non-catalog particles. Supported modes:

- `mode: "circular"` creates a massive equatorial circular state.
- `kind: "photon"` or `mode: "photon"` creates a null state.
- Passing canonical momenta `Pt`, `Pr`, `Ptheta`, `Pphi` uses the state as-is.
- Otherwise a massive state is initialized from local ZAMO velocity.

Input:

```json
{
  "name": "charged-probe",
  "kind": "probe",
  "r": 13,
  "theta": 1.5707963267948966,
  "phi": 0.7,
  "velocity": [-0.025, 0, 0.34],
  "chargeToMass": 0.18
}
```

## Orbit Diagnostics

`engine.orbitDiagnostics(options)`

Runs numerical ISCO, photon-orbit, optional circular-orbit, and optional region
diagnostics.

Input:

```json
{
  "r": 8.2,
  "theta": 1.5707963267948966,
  "prograde": true,
  "chargeToMass": 0.12,
  "samples": 220,
  "rMax": 45
}
```

Output shape:

```json
{
  "params": {},
  "isco": {
    "prograde": { "rISCO": 0, "found": true },
    "retrograde": { "rISCO": 0, "found": true }
  },
  "photonOrbit": {
    "prograde": { "rPhoton": 0, "found": true },
    "retrograde": { "rPhoton": 0, "found": true }
  },
  "circularOrbit": {
    "r": 0,
    "energy": 0,
    "angularMomentumZ": 0,
    "radialGradient": 0,
    "radialSecondDerivative": 0,
    "stable": true
  },
  "region": {}
}
```

## Trajectory Integration

`engine.integrateTrajectory(input, options)`

The facade defaults to Boyer-Lindquist adaptive integration. It switches to
Kerr-Schild when:

- `options.coordinates` is `"kerr-schild"`;
- `options.horizonPenetrating` or `options.crossHorizon` is true;
- the input is already a Kerr-Schild state with `x`, `y`, `z`, `Pt`, `Px`,
  `Py`, and `Pz`;
- auto mode sees a starting `r` very close to `r+`.

Boyer-Lindquist input:

```json
{
  "name": "outer-probe",
  "kind": "probe",
  "r": 8,
  "theta": 1.5707963267948966,
  "phi": 0,
  "velocity": [-0.02, 0, 0.28],
  "chargeToMass": 0.04
}
```

Kerr-Schild horizon-penetrating input:

```json
{
  "name": "falling-probe",
  "kind": "probe",
  "r": 7.2,
  "theta": 1.5707963267948966,
  "phi": 0.35,
  "radialVelocity": -0.34,
  "azimuthalVelocity": 0.18,
  "chargeToMass": 0.04
}
```

Options:

```json
{
  "coordinates": "auto",
  "horizonPenetrating": true,
  "targetAffine": 10,
  "initialStep": 0.035,
  "minStep": 0.00002,
  "maxStep": 0.06,
  "absoluteTolerance": 1e-9,
  "relativeTolerance": 1e-8,
  "recordEvery": 60
}
```

Output shape:

```json
{
  "coordinates": "kerr-schild",
  "horizonPenetrating": true,
  "initialState": {},
  "finalState": {},
  "result": {
    "finalState": {},
    "affine": 0,
    "acceptedSteps": 0,
    "rejectedSteps": 0,
    "frames": [],
    "events": [],
    "hamiltonianDrift": 0
  }
}
```

## Tidal Diagnostics

`engine.tidalDiagnostics(position, body)`

Input:

```json
{
  "position": { "r": 6.4, "theta": 1.5707963267948966, "phi": 0 },
  "body": { "radius": 0.58, "binding": 0.85 }
}
```

Output includes the local tidal tensor, eigenvalues, spectral radius,
differential acceleration, normalized stress, and survival label.

## Binary Inspiral

`engine.binaryInspiral(input)`

Quasi-circular two-body inspiral diagnostics (Peters 1964 decay + leading
post-Newtonian phasing). Treats both bodies as point masses radiating
gravitational waves; independent of the engine's Kerr-Newman background. Works
in SI; masses default to solar masses. Also exported as
`binaryInspiralProfile` from `physics-engine.mjs`.

Input:

```json
{
  "m1": 36,
  "m2": 29,
  "massUnit": "solar",
  "separationRg": 10,
  "bandLowHz": 35,
  "bandHighHz": null,
  "iscoRg": 6,
  "sweepSamples": 6
}
```

`separationRg` is the orbital separation in total-mass gravitational radii
(`a / r_g`). `bandLowHz`/`bandHighHz` request a detector-band count (default
high cutoff is the ISCO GW frequency). `sweepSamples` returns a time-sampled
chirp track.

Output shape:

```json
{
  "input": {},
  "masses": {
    "m1Solar": 0,
    "m2Solar": 0,
    "totalSolar": 0,
    "chirpSolar": 0,
    "reducedSolar": 0,
    "massRatio": 0,
    "symmetricMassRatio": 0,
    "orbitCountFactor": 0
  },
  "scales": { "gravRadiusMeters": 0, "gravRadiusKm": 0, "lightCrossingTimeSec": 0 },
  "isco": { "separationRg": 6, "separationMeters": 0, "gwFrequencyHz": 0 },
  "atSeparation": {
    "separationRg": 0,
    "separationMeters": 0,
    "orbitFrequencyHz": 0,
    "gwFrequencyHz": 0,
    "orbitsToMerge": 0,
    "gwCyclesToMerge": 0,
    "timeToMergeSeconds": 0
  },
  "band": { "lowHz": 0, "highHz": 0, "gwCycles": 0, "orbits": 0, "durationSeconds": 0 },
  "chirp": [
    { "timeToMergeSec": 0, "separationRg": 0, "gwFrequencyHz": 0, "cumulativeOrbits": 0 }
  ]
}
```

`atSeparation`, `band`, and `chirp` appear only when the corresponding input is
provided. The orbit count obeys `orbitsToMerge = gwCyclesToMerge / 2` and scales
as `1 / symmetricMassRatio = (m1 + m2)^2 / (m1 m2)`, so equal masses give the
minimum count (`orbitCountFactor = 4`) and extreme ratios give very large
counts.

## Simulation And Jet Updates

`engine.stepSimulation(options)`

Steps the internal `KerrNewmanSimulator`. If `updateJet` is true, it also
updates the internal `MHDJetEngine` from simulator accretion diagnostics.

Input:

```json
{
  "steps": 10,
  "stepSize": 0.012,
  "updateJet": true,
  "jetDt": 0.04,
  "jetInput": { "magneticField": 0.62 }
}
```

`engine.updateJet(input, options)`

Updates the internal jet engine. Set `options.fromSimulator` to derive
accretion input from the current simulator.

Input:

```json
{
  "input": {
    "accretionRate": 0.1,
    "magneticField": 0.62,
    "massLoading": 0.008
  },
  "options": {
    "dt": 0.04,
    "fromSimulator": false
  }
}
```

Output is the `MHDJetEngine.snapshot()` shape:

```json
{
  "time": 0,
  "params": {},
  "input": {},
  "global": {},
  "zones": [],
  "recentEvents": []
}
```

## Snapshot

`engine.snapshot()`

Returns:

```json
{
  "params": {},
  "simulator": {},
  "jet": {}
}
```

## Stability Notes

- `physics-engine.mjs` is additive-only and does not modify browser demo files.
- Boyer-Lindquist integration is preferred for ordinary exterior trajectories.
- Kerr-Schild integration is preferred for horizon-penetrating timelike
  trajectories.
- Lower-level classes and selected diagnostics are re-exported for transitional
  code, but new callers should use `PhysicsEngine` methods first.
