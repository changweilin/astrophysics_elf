/* Smoke test for the binary-event transients (Type Ia / X-ray burst / AIC and
 * the post-coalescence kilonova / short-GRB / r-process / luminous-red-nova /
 * debris-disc animation). Loads the engine in a vm with a recording Canvas2D
 * stub (same approach as render-smoke.test.mjs), checks the channel classifier,
 * drives a real NS-NS coalescence, and renders every transient kind across its
 * lifetime to assert nothing throws.
 *
 * Run:  node test/transient.test.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = new Map();
const sandbox = {
  window: {}, console,
  tr: (en) => en,
  trp: (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars) ? vars[k] : m),
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  performance: { now: () => Date.now() }, devicePixelRatio: 1,
};
sandbox.globalThis = sandbox; vm.createContext(sandbox);
for (const f of ['physics.js', 'sim.js', 'render.js', 'config.js', 'disc.js'])
  vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
const KN = sandbox.window.KNSim, KD = sandbox.window.KNDisc, P = sandbox.window.KNphysics;

function makeCtx() {
  const target = { calls: {}, canvas: { width: 1600, height: 1200 } };
  const grad = { addColorStop() {} };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      return (...a) => { t.calls[prop] = (t.calls[prop] || 0) + 1;
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return grad;
        if (prop === 'measureText') return { width: String(a[0] || '').length * 6 };
        return undefined; };
    }, set(t, p, v) { t[p] = v; return true; },
  });
}
let pass = 0, fail = 0;
const ck = (n, c, d) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '\n    ' + d : '')); } };

// ── channel classifier sanity ──
ck('nsns channel has grb+kilonova+rprocess', (() => { const c = P.compactMergerChannel('ns', 1.4, 'ns', 1.4); return c.grb && c.kilonova && c.rProcess; })());
ck('nsbh light ratio -> disrupted EM', P.compactMergerChannel('bh', 4, 'ns', 1.4).kilonova === true);
ck('nsbh heavy ratio -> clean plunge', P.compactMergerChannel('bh', 20, 'ns', 1.4).channel === 'nsbh-plunge');
ck('bhbh -> pure gw', P.compactMergerChannel('bh', 10, 'bh', 10).channel === 'gw');
ck('wdwd>Chandra -> ddIa', P.compactMergerChannel('wd', 0.8, 'wd', 0.9).ddIa === true);
ck('ms+ms -> lrn', P.compactMergerChannel('ms', 1, 'ms', 1).lrn === true);
ck('xrayBurstIgnitionMass positive', P.xrayBurstIgnitionMass(1.4) > 0);

// ── drive a real NS-NS coalescence and render through the transient ──
const sim = KN.createSim(); KD.initDisc(sim); KN.initBinary(sim);
sim.params.type = 'ns'; sim.params.Msun = 1.5; sim.params.a = 0.1;
sim.params.R_star = 3; sim.params.Q = 0;
KN.placeCompanion(sim, 7, 0);
sim.binary.type = 'ns'; sim.binary.M2sun = 1.4; sim.binary.R_star2 = 3; sim.binary.a2 = 0;
sim.binary.inspiralRate = 40;   // speed the inspiral so it merges within the test
let merged = false, threw = null;
const W = 1600, H = 1200;
try {
  for (let i = 0; i < 4000 && !sim.transient; i++) KN.step(sim, 0.016);
  merged = !!sim.transient;
  // render across the whole transient lifetime
  for (let i = 0; i < 400 && sim.transient; i++) {
    KN.render(sim, makeCtx(), W, H);
    KN.step(sim, 0.016);
  }
} catch (e) { threw = e; }
ck('NS-NS inspiral armed a transient', merged);
ck('rendering the NS-NS transient never threw', !threw, threw && (threw.stack || String(threw)));

// ── directly render each transient kind (covers every drawTransient branch) ──
for (const kind of ['nsns', 'nsbh', 'lrn', 'ddIa', 'disc']) {
  const s2 = KN.createSim(); KD.initDisc(s2); KN.initBinary(s2);
  let bad = null;
  try {
    for (let phase = 0; phase < 6; phase += 0.5) {
      s2.transient = { kind, t: phase, dur: 5, axis: 0.7,
        grb: kind === 'nsns' || kind === 'nsbh', kilonova: kind === 'nsns' || kind === 'nsbh',
        rProcess: kind === 'nsns' || kind === 'nsbh', ddIa: kind === 'ddIa', lrn: kind === 'lrn', ejecta: 0.6 };
      KN.render(s2, makeCtx(), W, H);
    }
  } catch (e) { bad = e; }
  ck(`render transient kind=${kind} never threw`, !bad, bad && (bad.stack || String(bad)));
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
