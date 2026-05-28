# Conservation Ledger

This ledger defines the acceptance thresholds used by
`physics-benchmarks.mjs`. The values are intentionally stricter than visual
demo needs, but loose enough to avoid false failures from finite-difference
derivatives and adaptive step interpolation.

Units: `G = c = 4 pi epsilon_0 = 1`.

## Analytic Geometry Checks

- Schwarzschild ISCO: relative error <= `1e-5` against `6M`.
- Schwarzschild photon orbit: relative error <= `1e-6` against `3M`.
- Kerr ISCO sanity: relative error <= `5e-5` against the analytic Kerr limit.
- Kerr photon orbit sanity: relative error <= `5e-5` against the analytic Kerr
  limit.
- Reissner-Nordstrom horizons: absolute error <= `1e-12` for `r+` and `r-`.

## Canonical Particle Checks

- Massive-particle Hamiltonian normalization: absolute error <= `1e-10` against
  `H = -1/2`.
- Charged canonical momentum shift: absolute error <= `1e-10` against
  `Delta P_a = q A_a` for the same local four-velocity.
- Circular-orbit radial Hamiltonian gradient: absolute error <= `1e-6`.
- Circular-orbit Hamiltonian normalization: absolute error <= `1e-9`.

## Boyer-Lindquist Adaptive Integration

- Hamiltonian drift: absolute drift <= `1e-7`.
- Energy drift: absolute drift <= `1e-12`.
- Angular-momentum drift: absolute drift <= `1e-12`.
- Event-horizon guard: Boyer-Lindquist runs should stop or guard before the
  coordinate singularity at `r+`; horizon-penetrating tests belong in the
  Kerr-Schild benchmark.

## Kerr-Schild Horizon-Crossing Diagnostics

- The trajectory must cross `r+` without an integration-failure event.
- The final recorded Boyer-Lindquist-like radius must be inside `r+`.
- Kerr-Schild Hamiltonian drift: absolute drift <= `1e-6`.

## Failure Policy

`run-benchmarks.mjs` exits with a nonzero code when any threshold above is
exceeded. A future physics change should update this ledger only when the new
threshold is justified by a documented model change, not to hide a regression.
