/* Acceptance tests for the self-consistent structure N-body engine.
 *
 * 1. Isolated galaxy stability: a seeded swarm must hold its size — RMS radius
 *    drift bounded, no inward collapse, no inner pile-up, (almost) no escapers.
 * 2. Galaxy x galaxy merger: must COMPLETE (emergent dynamical friction sinks
 *    the cores to coalescence), retain most stars (real mergers eject a few
 *    percent, not most), leave a LARGER remnant, and conserve total mass.
 *
 * Run:  node test/structure-nbody.test.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeSim() {
  const store = new Map();
  const sandbox = {
    window: {}, console,
    tr: (en) => en,
    trp: (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars) ? vars[k] : m),
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    performance: { now: () => Date.now() }, devicePixelRatio: 1,
  };
  sandbox.globalThis = sandbox; vm.createContext(sandbox);
  for (const f of ['physics.js', 'sim.js', 'disc.js'])
    vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
  const KN = sandbox.window.KNSim, KD = sandbox.window.KNDisc;
  const sim = KN.createSim(); KD.initDisc(sim); KN.initBinary(sim);
  return { KN, sim };
}

let pass = 0, fail = 0;
const ck = (n, c, d) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '  [' + d + ']' : '')); } };

// Swarm census about the live core(s). `med` (median radius) is the robust
// size measure — RMS is dominated by a handful of wide bound loops.
function census(sim) {
  const bin = sim.binary, binOn = !!(bin && bin.enabled);
  let n = 0, inner = 0, stream = 0;
  const rs = [];
  for (const b of sim.bodies) {
    if (!b._cloud || b.state !== 'orbit') continue;
    if (b._stream) { stream++; continue; }
    const hx = (b._cloudRole === 'companion' && binOn) ? bin.x2 : (binOn ? bin.x1 : 0);
    const hy = (b._cloudRole === 'companion' && binOn) ? bin.y2 : (binOn ? bin.y1 : 0);
    const r = Math.hypot(b.x - hx, b.y - hy);
    n++; rs.push(r); if (r < 4) inner++;
  }
  rs.sort((a, b) => a - b);
  const med = n ? rs[n >> 1] : 0;
  return { n, med, inner, stream };
}

// ── 1. Isolated galaxy stability ────────────────────────────
console.log('Isolated galaxy stability (t = 0..600)');
{
  const { KN, sim } = makeSim();
  KN.setBHRegime(sim, 'supermassive');
  KN.applySMBHStructure(sim, 'galaxy');
  sim.timescale = 4;
  const c0 = census(sim);
  let minMed = c0.med, maxMed = c0.med;
  while (sim.t < 600) {
    KN.step(sim, 0.05);
    const c = census(sim);
    if (c.med < minMed) minMed = c.med;
    if (c.med > maxMed) maxMed = c.med;
  }
  const cE = census(sim);
  ck('swarm survives (N within 5% of seed)', cE.n >= 0.95 * c0.n, `N ${c0.n} -> ${cE.n}`);
  ck('median radius drift < 15%', Math.abs(cE.med - c0.med) / c0.med < 0.15, `med ${c0.med.toFixed(1)} -> ${cE.med.toFixed(1)}`);
  ck('no transient collapse/explosion (min/max within 25%)',
     minMed > 0.75 * c0.med && maxMed < 1.25 * c0.med, `min ${minMed.toFixed(1)} max ${maxMed.toFixed(1)}`);
  ck('no inner pile-up (< 3% of stars at r < 4)', cE.inner <= Math.max(1, 0.03 * cE.n), `inner ${cE.inner}/${cE.n}`);
  ck('no streams from a quiet galaxy', cE.stream <= Math.max(1, 0.02 * c0.n), `stream ${cE.stream}`);
}

// ── 2. Galaxy x galaxy merger ───────────────────────────────
console.log('Galaxy x galaxy merger (equal mass, d0 = 45)');
{
  const { KN, sim } = makeSim();
  KN.setBHRegime(sim, 'supermassive');
  KN.applySMBHStructure(sim, 'galaxy');
  KN.placeCompanion(sim, 45, 0);
  sim.binary.enabled = true;
  sim.binary.M2sun = sim.params.Msun;
  sim.binary.M2 = 1;
  KN.applySMBHStructure(sim, 'galaxy', 'companion');
  KN.circularizeBinary(sim);
  sim.timescale = 4;
  const c0 = census(sim);
  const seedN = c0.n;
  let mergedAt = null, mergeC = null;
  const wall0 = Date.now();
  while (sim.t < 4000 && Date.now() - wall0 < 240000) {
    KN.step(sim, 0.05);
    if (sim.binary && sim.binary.merged && mergedAt == null) { mergedAt = sim.t; mergeC = census(sim); }
    if (mergedAt != null && sim.t >= mergedAt + 300) break;
  }
  const cE = census(sim);
  ck('merger completes', mergedAt != null, `t=${sim.t.toFixed(0)} d=${sim.binary && sim.binary.enabled ? sim.binary.d.toFixed(1) : '-'}`);
  ck('merger completes in reasonable time (t < 2500)', mergedAt != null && mergedAt < 2500, `mergedAt ${mergedAt && mergedAt.toFixed(0)}`);
  // Retention: bound members vs everything that ever existed (starburst adds stars,
  // swallows remove a few — both fine; what must NOT happen is mass boiling off).
  // Real major mergers eject a few-to-ten percent. This configuration is maximally
  // violent BY CONSTRUCTION — equal masses, swarms fully overlapping from t=0, and
  // two cores each carrying the default 15% mass share plunging to contact release
  // ~20% of the swarm's binding energy — so the honest physical outcome here is
  // ~20% ejecta (gentler setups: lower BH share / wider separation eject far less).
  const totalNow = cE.n + cE.stream;
  ck('most stars stay bound (ejecta < 25%)', mergedAt != null && cE.stream <= 0.25 * totalNow, `stream ${cE.stream}/${totalNow}`);
  // Energy-conservation expectation for an equal-mass merger: remnant size ≈ 2x
  // a progenitor (Cole-style virial argument) plus the deposited orbital energy.
  ck('remnant is LARGER than a progenitor (median up)', mergedAt != null && cE.med > c0.med * 1.05, `med ${c0.med.toFixed(1)} -> ${cE.med.toFixed(1)}`);
  ck('remnant does not collapse or blow apart (median in 1.05..3x seed)', cE.med < c0.med * 3, `med ${cE.med.toFixed(1)}`);
  ck('no inner pile-up post-merger (< 8%)', cE.inner <= Math.max(2, 0.08 * cE.n), `inner ${cE.inner}/${cE.n}`);
  ck('mass ledger conserved (|dM| < 0.5%)', (() => {
    const c = sim._conserve, c00 = sim._conserve0;
    if (!c || !c00 || !(c00.M > 0)) return false;
    return Math.abs(c.M - c00.M) / c00.M < 0.005;
  })(), sim._conserve && sim._conserve0 ? `dM ${(100 * (sim._conserve.M - sim._conserve0.M) / sim._conserve0.M).toFixed(2)}%` : 'no ledger');
  console.log(`  (info) seed N=${seedN}, merged t=${mergedAt && mergedAt.toFixed(0)}, at-merge bound=${mergeC && mergeC.n}, end bound=${cE.n} stream=${cE.stream} med=${cE.med.toFixed(1)}`);
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} — ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
