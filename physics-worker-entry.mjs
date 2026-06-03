/* Off-thread physics worker for the browser demo.
 *
 * Moves the heaviest synchronous bridge compute — the numeric Kerr-Newman ISCO /
 * photon-orbit root-finding (findISCO is a nested solve, ~20 ms for the full
 * prograde+retrograde set) — off the main thread so dragging M/Q/a never hitches
 * the UI. It returns EXACTLY the shape window.KNFull.orbitDiagnostics produces, so
 * the bridge can drop the result straight into its cache. The main thread keeps a
 * synchronous fallback (full-physics-bridge.mjs) for when a worker is unavailable.
 *
 * Module worker: imports the add-only ESM core directly. No DOM access.
 */

import {
  findISCO,
  findPhotonCircularOrbit,
} from "./full-physics/orbit-diagnostics.mjs";

function orbitDiagnostics(params) {
  const samples = 180;
  return {
    params,
    isco: {
      prograde: findISCO(params, { samples, prograde: true }),
      retrograde: findISCO(params, { samples, prograde: false }),
    },
    photonOrbit: {
      prograde: findPhotonCircularOrbit(params, { samples, prograde: true }),
      retrograde: findPhotonCircularOrbit(params, { samples, prograde: false }),
    },
  };
}

self.onmessage = (event) => {
  const { id, type, payload } = event.data || {};
  if (id == null) return;
  try {
    let result;
    switch (type) {
      case "orbit-diagnostics":
        result = orbitDiagnostics(payload.params);
        break;
      default:
        throw new Error(`Unknown physics-worker message: ${type}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
