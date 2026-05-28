/*
 * Local tidal tensor diagnostics for Kerr-Newman spacetime.
 *
 * Computes a numerical Riemann tensor from the metric, projects the electric
 * part R_{a b c d} e_i^a u^b e_j^c u^d into a local tetrad, and reports the
 * principal tidal stretching/compression axes.
 */

import {
  clamp,
  fourVelocityFromLocal,
  horizons,
  metric,
  sanitizeParams,
  zamoFrame,
} from "./kn-full-physics.mjs";

const DIM = 4;

function zeros4() {
  return Array.from({ length: DIM }, () => 0);
}

function zeros44() {
  return Array.from({ length: DIM }, () => zeros4());
}

function zeros444() {
  return Array.from({ length: DIM }, () => zeros44());
}

function zeros4444() {
  return Array.from({ length: DIM }, () => zeros444());
}

function radialFloor(params) {
  const h = horizons(params);
  return h.naked ? 1e-3 : h.rPlus + 1e-4;
}

function shifted(params, x, coord, amount) {
  const out = [...x];
  if (coord === 1) {
    out[1] = Math.max(radialFloor(params), out[1] + amount);
  } else if (coord === 2) {
    out[2] = clamp(out[2] + amount, 1e-6, Math.PI - 1e-6);
  } else {
    out[coord] += amount;
  }
  return out;
}

function diffStep(x, coord) {
  if (coord === 1) return Math.max(1e-4, Math.abs(x[1]) * 1e-4);
  if (coord === 2) return 1e-5;
  return 1e-5;
}

function covMetric(params, x) {
  return metric(params, x[1], x[2]).cov;
}

function inverseMetric(params, x) {
  return metric(params, x[1], x[2]).inv;
}

function metricDerivatives(params, x) {
  const dg = zeros444();
  for (const coord of [1, 2]) {
    const h = diffStep(x, coord);
    const xp = shifted(params, x, coord, h);
    const xm = shifted(params, x, coord, -h);
    const gp = covMetric(params, xp);
    const gm = covMetric(params, xm);
    const denom = xp[coord] - xm[coord];
    for (let a = 0; a < DIM; a++) {
      for (let b = 0; b < DIM; b++) {
        dg[coord][a][b] = (gp[a][b] - gm[a][b]) / denom;
      }
    }
  }
  return dg;
}

export function christoffelSymbols(params, position) {
  const p = sanitizeParams(params);
  const x = [
    position.t ?? 0,
    position.r,
    clamp(position.theta ?? Math.PI / 2, 1e-6, Math.PI - 1e-6),
    position.phi ?? 0,
  ];
  const inv = inverseMetric(p, x);
  const dg = metricDerivatives(p, x);
  const gamma = zeros444();

  for (let rho = 0; rho < DIM; rho++) {
    for (let mu = 0; mu < DIM; mu++) {
      for (let nu = 0; nu < DIM; nu++) {
        let sum = 0;
        for (let sigma = 0; sigma < DIM; sigma++) {
          sum += inv[rho][sigma] * (
            dg[mu][nu][sigma] +
            dg[nu][mu][sigma] -
            dg[sigma][mu][nu]
          );
        }
        gamma[rho][mu][nu] = 0.5 * sum;
      }
    }
  }
  return gamma;
}

function christoffelDerivatives(params, x) {
  const dGamma = zeros4444();
  for (const coord of [1, 2]) {
    const h = diffStep(x, coord);
    const xp = shifted(params, x, coord, h);
    const xm = shifted(params, x, coord, -h);
    const gp = christoffelSymbols(params, {
      t: xp[0],
      r: xp[1],
      theta: xp[2],
      phi: xp[3],
    });
    const gm = christoffelSymbols(params, {
      t: xm[0],
      r: xm[1],
      theta: xm[2],
      phi: xm[3],
    });
    const denom = xp[coord] - xm[coord];
    for (let rho = 0; rho < DIM; rho++) {
      for (let mu = 0; mu < DIM; mu++) {
        for (let nu = 0; nu < DIM; nu++) {
          dGamma[coord][rho][mu][nu] = (gp[rho][mu][nu] - gm[rho][mu][nu]) / denom;
        }
      }
    }
  }
  return dGamma;
}

export function riemannTensor(params, position) {
  const p = sanitizeParams(params);
  const x = [
    position.t ?? 0,
    position.r,
    clamp(position.theta ?? Math.PI / 2, 1e-6, Math.PI - 1e-6),
    position.phi ?? 0,
  ];
  const gamma = christoffelSymbols(p, position);
  const dGamma = christoffelDerivatives(p, x);
  const mixed = zeros4444();

  for (let rho = 0; rho < DIM; rho++) {
    for (let sigma = 0; sigma < DIM; sigma++) {
      for (let mu = 0; mu < DIM; mu++) {
        for (let nu = 0; nu < DIM; nu++) {
          let value = dGamma[mu][rho][nu][sigma] - dGamma[nu][rho][mu][sigma];
          for (let lambda = 0; lambda < DIM; lambda++) {
            value += gamma[rho][mu][lambda] * gamma[lambda][nu][sigma] -
              gamma[rho][nu][lambda] * gamma[lambda][mu][sigma];
          }
          mixed[rho][sigma][mu][nu] = value;
        }
      }
    }
  }

  const g = covMetric(p, x);
  const lower = zeros4444();
  for (let alpha = 0; alpha < DIM; alpha++) {
    for (let beta = 0; beta < DIM; beta++) {
      for (let gammaIndex = 0; gammaIndex < DIM; gammaIndex++) {
        for (let delta = 0; delta < DIM; delta++) {
          let value = 0;
          for (let rho = 0; rho < DIM; rho++) value += g[alpha][rho] * mixed[rho][beta][gammaIndex][delta];
          lower[alpha][beta][gammaIndex][delta] = value;
        }
      }
    }
  }

  return { mixed, lower, position: { t: x[0], r: x[1], theta: x[2], phi: x[3] } };
}

function projectElectricPart(riemannLower, spatialBasis, observerU) {
  const tensor = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let value = 0;
      for (let a = 0; a < DIM; a++) {
        for (let b = 0; b < DIM; b++) {
          for (let c = 0; c < DIM; c++) {
            for (let d = 0; d < DIM; d++) {
              value += riemannLower[a][b][c][d] *
                spatialBasis[i][a] * observerU[b] *
                spatialBasis[j][c] * observerU[d];
            }
          }
        }
      }
      tensor[i][j] = value;
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const s = 0.5 * (tensor[i][j] + tensor[j][i]);
      tensor[i][j] = s;
      tensor[j][i] = s;
    }
  }
  return tensor;
}

function identity3() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

function jacobiEigenSymmetric3(input) {
  const a = input.map((row) => [...row]);
  const v = identity3();
  for (let iter = 0; iter < 60; iter++) {
    let p = 0;
    let q = 1;
    let max = Math.abs(a[0][1]);
    for (const [i, j] of [[0, 2], [1, 2]]) {
      const value = Math.abs(a[i][j]);
      if (value > max) {
        max = value;
        p = i;
        q = j;
      }
    }
    if (max < 1e-14) break;

    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    for (let k = 0; k < 3; k++) {
      const apk = a[p][k];
      const aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }

  const pairs = [0, 1, 2].map((i) => ({
    value: a[i][i],
    vector: [v[0][i], v[1][i], v[2][i]],
  })).sort((left, right) => right.value - left.value);

  return {
    values: pairs.map((pair) => pair.value),
    vectors: pairs.map((pair) => pair.vector),
  };
}

export function localTidalTensor(params, position, options = {}) {
  const p = sanitizeParams(params);
  const theta = clamp(position.theta ?? Math.PI / 2, 1e-6, Math.PI - 1e-6);
  const frame = zamoFrame(p, position.r, theta);
  const observerU = options.localVelocity
    ? fourVelocityFromLocal(p, position.r, theta, options.localVelocity)
    : frame.eT;
  const spatialBasis = [frame.eR, frame.eTheta, frame.ePhi];
  const curvature = riemannTensor(p, { ...position, theta });
  const electric = projectElectricPart(curvature.lower, spatialBasis, observerU);
  const eigen = jacobiEigenSymmetric3(electric);
  const trace = electric[0][0] + electric[1][1] + electric[2][2];
  const spectralRadius = Math.max(...eigen.values.map((value) => Math.abs(value)));

  return {
    position: curvature.position,
    observer: options.localVelocity ? "local-moving" : "zamo",
    tensor: electric,
    eigenvalues: eigen.values,
    eigenvectorsLocal: eigen.vectors,
    trace,
    spectralRadius,
    maxStretch: Math.max(...eigen.values),
    maxCompression: Math.min(...eigen.values),
  };
}

export function tidalTensorDiagnostics(params, position, body = {}) {
  const tensor = localTidalTensor(params, position, body);
  const radius = body.radius ?? position.radius ?? 0;
  const binding = Math.max(body.binding ?? position.binding ?? 1, 1e-12);
  const normalizedStress = tensor.spectralRadius * radius / binding;
  return {
    ...tensor,
    body: {
      radius,
      binding,
    },
    differentialAcceleration: tensor.spectralRadius * radius,
    normalizedStress,
    survival: normalizedStress < 0.5 ? "comfortable" :
      normalizedStress < 1 ? "stressed" : "disrupted",
  };
}

