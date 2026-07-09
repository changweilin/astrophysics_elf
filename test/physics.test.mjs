/* Unit tests for the browser-demo physics core (physics.js).
 *
 * physics.js is a browser IIFE that assigns window.KNphysics and references the
 * i18n globals tr()/trp(). It is not an ES module, so we load it into a vm
 * context with those globals stubbed, then assert the *pure numeric* functions
 * (horizons, isco, photon sphere, ergosphere, circular speed, Peters inspiral,
 * merger remnant, tidal stress) against closed-form / analytic values.
 *
 * Run:  node test/physics.test.mjs   (or: npm test)
 *
 * This complements full-physics/run-benchmarks.mjs, which covers the
 * high-fidelity ESM core but never touches the demo's KNphysics.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Load physics.js into a sandbox with browser globals stubbed ──────────────
const sandbox = {
  window: {},
  tr: (en) => en,
  trp: (t, vars) => t.replace(/\{(\w+)\}/g, (m, k) =>
    (vars && Object.prototype.hasOwnProperty.call(vars, k)) ? vars[k] : m),
  Math, isFinite, isNaN, Number, console,
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, 'physics.js'), 'utf8'), sandbox, { filename: 'physics.js' });
const P = sandbox.window.KNphysics;
if (!P) { console.error('FAIL: physics.js did not define window.KNphysics'); process.exit(1); }

// ── Tiny assert harness (mirrors full-physics benchmark output style) ────────
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
function near(name, actual, expected, tol = 1e-9) {
  const err = Math.abs(actual - expected);
  check(name, err <= tol, `actual=${actual}, expected=${expected}, err=${err}, tol=${tol}`);
}

console.log('KNphysics demo unit tests\n');

// ── horizons ─────────────────────────────────────────────────────────────────
console.log('horizons(M,Q,a)');
{
  const sch = P.horizons(1, 0, 0);
  near('Schwarzschild r+ = 2M', sch.rplus, 2, 1e-12);
  near('Schwarzschild r- = 0', sch.rminus, 0, 1e-12);
  check('Schwarzschild not naked', sch.naked === false);

  const rn = P.horizons(1, 0.6, 0);   // r± = 1 ± sqrt(1-0.36) = 1 ± 0.8
  near('RN outer horizon = 1.8', rn.rplus, 1.8, 1e-12);
  near('RN inner horizon = 0.2', rn.rminus, 0.2, 1e-12);

  const naked = P.horizons(1, 0, 1.2);   // a²+Q² = 1.44 > 1
  check('over-extremal flagged naked', naked.naked === true);
  check('naked has NaN horizon', Number.isNaN(naked.rplus));
}

// ── isco ─────────────────────────────────────────────────────────────────────
console.log('isco(M,a)');
{
  near('Schwarzschild ISCO = 6M', P.isco(1, 0), 6, 1e-6);
  const pro = P.isco(1, 0.9), retro = P.isco(1, -0.9);
  check('prograde ISCO < 6M', pro < 6, `pro=${pro}`);
  check('retrograde ISCO > 6M', retro > 6, `retro=${retro}`);
  near('extremal prograde ISCO -> M', P.isco(1, 0.999999), 1, 3e-2);
}

// ── photon sphere ──────────────────────────────────────────────────────────────
console.log('photonSphereEq(M,a)');
{
  near('Schwarzschild photon sphere = 3M', P.photonSphereEq(1, 0), 3, 1e-9);
  check('prograde photon orbit < 3M', P.photonSphereEq(1, 0.9) < 3);
  // photonSphereEq clamps |a|/M to 0.99999, so a=1 lands just above M, not on it.
  near('extremal prograde photon orbit -> M', P.photonSphereEq(1, 1), 1, 1e-2);
}

// ── ergosphere ─────────────────────────────────────────────────────────────────
console.log('ergosphereEq / ergospherePole');
{
  near('Schwarzschild ergo equator = 2M', P.ergosphereEq(1, 0), 2, 1e-12);
  near('RN ergo equator = 1.8', P.ergosphereEq(1, 0.6), 1.8, 1e-12);
  // Pole static limit equals the outer horizon for any spin/charge.
  const M = 1, Q = 0.3, a = 0.5;
  near('pole static limit = r+', P.ergospherePole(M, Q, a), P.horizons(M, Q, a).rplus, 1e-12);
}

// ── circular speed ─────────────────────────────────────────────────────────────
console.log('circularSpeed(r,M)');
{
  const v = P.circularSpeed(10, 1);          // sqrt((M/r)/(1 - 3M/r))
  near('v_circ at r=10,M=1', v, Math.sqrt((1 / 10) / (1 - 3 / 10)), 1e-12);
  check('v_circ exceeds Newtonian sqrt(M/r)', v > Math.sqrt(1 / 10));
  check('no circular orbit at/inside photon sphere (r <= 3M) -> 0', P.circularSpeed(1, 1) === 0);
  // Reissner-Nordström: v_circ² = (M/r − Q²/r²) / (1 − 3M/r + 2Q²/r²)
  const vq = P.circularSpeed(10, 1, 0.6);
  near('RN v_circ at r=10,M=1,Q=0.6', vq,
    Math.sqrt((1 / 10 - 0.36 / 100) / (1 - 3 / 10 + 2 * 0.36 / 100)), 1e-12);
  check('charge is mildly repulsive: v_circ(Q) < v_circ(0)', vq < v);
}

// ── Peters inspiral ────────────────────────────────────────────────────────────
console.log('peters(M1,M2,d)');
{
  const p = P.peters(1, 1, 10);
  near('Kepler omega = sqrt(Mt/d^3)', p.omega, Math.sqrt(2 / 1000), 1e-12);
  near('reduced mass mu = 0.5', p.mu, 0.5, 1e-12);
  near('chirp mass Mc', p.Mc, Math.pow(1, 0.6) / Math.pow(2, 0.2), 1e-12);
  check('separation decays (ddot < 0)', p.ddot < 0);
  check('time-to-merger positive', p.t_merge > 0);
  check('GW luminosity positive', p.Lgw > 0);
}

// ── merger remnant ─────────────────────────────────────────────────────────────
console.log('mergerRemnant(M1,M2,chi1,chi2)');
{
  const r = P.mergerRemnant(1, 1, 0, 0, 1);   // equal mass, non-spinning
  near('symmetric mass ratio eta = 0.25', r.eta, 0.25, 1e-12);
  check('radiated mass ~5.5% of total', r.eRad > 0.10 && r.eRad < 0.12, `eRad=${r.eRad}`);
  check('remnant lighter than progenitors', r.Mf < 2 && r.Mf > 1.8, `Mf=${r.Mf}`);
  check('remnant spin near 0.69 (orbital)', r.af > 0.6 && r.af < 0.72, `af=${r.af}`);
  check('remnant spin sub-extremal', Math.abs(r.af) < 0.998);
  // Aligned progenitor spins push final spin higher than the orbital-only value.
  const spun = P.mergerRemnant(1, 1, 0.8, 0.8, 1);
  check('aligned spins raise final spin', spun.af > r.af, `spun=${spun.af} vs ${r.af}`);
}

// ── tidal stress ───────────────────────────────────────────────────────────────
console.log('tidalStress(r,M,R,thr)');
{
  const far = P.tidalStress(20, 1, 0.4, 1), near_ = P.tidalStress(5, 1, 0.4, 1);
  check('tidal stress falls with distance', near_ > far, `near=${near_}, far=${far}`);
  check('tidal stress ~ 1/r^3', Math.abs(near_ / far - Math.pow(20 / 5, 3)) < 1e-6);
  check('singular radius saturates', P.tidalStress(1e-9, 1, 0.4, 1) === 5);
  check('higher binding -> lower normalised stress',
    P.tidalStress(5, 1, 0.4, 10) < P.tidalStress(5, 1, 0.4, 1));
}

// ── wouldCollapse ──────────────────────────────────────────────────────────────
console.log('wouldCollapse(M,Q,a,R_star)');
{
  check('star inside r+ collapses', P.wouldCollapse(1, 0, 0, 1.5) === true);   // r+ = 2
  check('star well outside survives', P.wouldCollapse(1, 0, 0, 10) === false);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
