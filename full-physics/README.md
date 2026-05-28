# Full Kerr-Newman Physics Core

This folder is additive-only. It does not modify or wire into the existing
`Kerr-Newman Lab.html` browser demo.

## What It Simulates

`kn-full-physics.mjs` provides a higher-fidelity physics backend for the same
phenomena shown by the current project:

- Kerr-Newman geometry in Boyer-Lindquist coordinates.
- Outer/inner horizons, static limit, horizon angular velocity, area, surface
  gravity, and electric potential.
- Timelike and null motion initialized from a local ZAMO orthonormal frame.
- Charged test-particle dynamics through the Hamiltonian
  `H = 1/2 g^ab (P_a - q A_a)(P_b - q A_b)`.
- RK4 integration of canonical coordinates and momenta.
- Approximate ISCO/photon-orbit diagnostics for Kerr-like circular orbits.
- Reduced tidal-stress estimates for extended objects.
- Thin-disc particle initialization using local circular geodesic estimates.
- Blandford-Znajek-style jet power diagnostics from spin, horizon size,
  magnetic flux, and recent accretion.

## Files

- `kn-full-physics.mjs`: reusable ES module physics engine.
- `run-sample.mjs`: standalone sample run that prints JSON diagnostics.

## Run

```powershell
node .\full-physics\run-sample.mjs
```

## Minimal API

```js
import { KerrNewmanSimulator } from "./full-physics/kn-full-physics.mjs";

const sim = new KerrNewmanSimulator({ M: 1.5, Q: 0.2, a: 1.0, B: 0.4 });

sim.addCircularOrbit({
  name: "ship",
  kind: "ship",
  r: 8,
  prograde: true,
  radius: 0.02,
  binding: 8,
});

sim.addPhoton({
  name: "photon",
  r: 15,
  direction: [-0.2, 0, 0.98],
});

const frames = sim.run({ steps: 1000, stepSize: 0.02, recordEvery: 100 });
console.log(frames.at(-1));
```

## Model Boundaries

This is a full test-particle spacetime simulator, not a full numerical-relativity
or GRMHD solver. It treats the black hole as a fixed Kerr-Newman background and
does not evolve Einstein-Maxwell fields, fluid pressure, radiation transport, or
magnetic turbulence self-consistently. The thin-disc and jet APIs are reduced
diagnostics intended to be physically grounded enough for upgrade planning and
future visualization.

