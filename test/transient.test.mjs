/* Smoke test for the binary-event transients (Type Ia / X-ray burst / AIC and
 * the post-coalescence kilonova / short-GRB / r-process / luminous-red-nova /
 * debris-disc animation). Checks the channel classifier, drives a real NS-NS
 * coalescence, and renders every transient kind across its lifetime to assert
 * nothing throws.
 *
 * Run:  node test/transient.test.mjs */
import { loadEngine, newSim, makeCanvas, checker } from './harness.mjs';

const lab = loadEngine('render');
const { KN, P } = lab;
const { check, finish } = checker('Binary-transient smoke test');

// ── channel classifier sanity ──
check('nsns channel has grb+kilonova+rprocess', (() => { const c = P.compactMergerChannel('ns', 1.4, 'ns', 1.4); return c.grb && c.kilonova && c.rProcess; })());
check('nsbh light ratio -> disrupted EM', P.compactMergerChannel('bh', 4, 'ns', 1.4).kilonova === true);
check('nsbh heavy ratio -> clean plunge', P.compactMergerChannel('bh', 20, 'ns', 1.4).channel === 'nsbh-plunge');
check('bhbh -> pure gw', P.compactMergerChannel('bh', 10, 'bh', 10).channel === 'gw');
check('wdwd>Chandra -> ddIa', P.compactMergerChannel('wd', 0.8, 'wd', 0.9).ddIa === true);
check('ms+ms -> lrn', P.compactMergerChannel('ms', 1, 'ms', 1).lrn === true);
check('xrayBurstIgnitionMass positive', P.xrayBurstIgnitionMass(1.4) > 0);

// ── drive a real NS-NS coalescence and render through the transient ──
const sim = newSim(lab);
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
    KN.render(sim, makeCanvas({ width: W, height: H }), W, H);
    KN.step(sim, 0.016);
  }
} catch (e) { threw = e; }
check('NS-NS inspiral armed a transient', merged);
check('rendering the NS-NS transient never threw', !threw, threw && (threw.stack || String(threw)));

// ── directly render each transient kind (covers every drawTransient branch) ──
for (const kind of ['nsns', 'nsbh', 'lrn', 'ddIa', 'disc']) {
  const s2 = newSim(lab);
  let bad = null;
  try {
    for (let phase = 0; phase < 6; phase += 0.5) {
      s2.transient = { kind, t: phase, dur: 5, axis: 0.7,
        grb: kind === 'nsns' || kind === 'nsbh', kilonova: kind === 'nsns' || kind === 'nsbh',
        rProcess: kind === 'nsns' || kind === 'nsbh', ddIa: kind === 'ddIa', lrn: kind === 'lrn', ejecta: 0.6 };
      KN.render(s2, makeCanvas({ width: W, height: H }), W, H);
    }
  } catch (e) { bad = e; }
  check(`render transient kind=${kind} never threw`, !bad, bad && (bad.stack || String(bad)));
}

finish();
