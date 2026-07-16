/* Tests for demo pacing (10-30 s wall-clock completion) + view auto-fit.
 *
 * Loads the browser IIFE stack (physics, sim, disc, demo-presets, config) into
 * a vm context per demo, then RUNS the engine at 60 fps wall-frames and checks
 * that each flagship demo's showcased event actually completes inside its
 * 10-30 s window with the pace-chosen timescale — plus unit checks on the
 * physical-clock helpers and the scene-radius fit.
 *
 * Run:  node test/pace-fit.test.mjs   (or: npm test)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
function near(name, actual, expected, tol) {
  const err = Math.abs(actual - expected);
  check(name, err <= tol, `actual=${actual}, expected=${expected}, tol=${tol}`);
}

// Fresh lab sandbox with the given ?demo= id pre-resolved (urlDemoId memo).
// `stored` optionally pre-seeds localStorage (stale-config regression tests).
function loadLab(demoId, stored) {
  const store = new Map();
  if (stored) store.set('kn-lab-config-v1', JSON.stringify(stored));
  const sandbox = {
    window: {}, console,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    tr: (en) => en,
    trp: (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) =>
      (vars && Object.prototype.hasOwnProperty.call(vars, k)) ? vars[k] : m),
    Math, isFinite, isNaN, Number, Array, JSON, Object,
  };
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['physics.js', 'sim.js', 'disc.js', 'demo-presets.js', 'config.js']) {
    vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
  }
  const W = sandbox.window;
  W.__knDemoId = demoId === undefined ? null : demoId;
  const sim = W.KNSim.createSim();
  W.KNSim.initBinary(sim);
  W.KNDisc.initDisc(sim);
  if (demoId !== undefined) W.KNSim.applyConfig(sim);   // reads (seeded) storage, then applies the demo
  return { W, KN: W.KNSim, P: W.KNphysics, D: W.KNDisc, sim };
}

// Advance the sim exactly like the rAF loops do (60 fps) until `done(sim)`,
// returning the wall-clock seconds consumed; honours pacePoll slow-motion.
function runUntil(lab, done, maxWallSec) {
  const { KN, sim } = lab;
  const frames = Math.ceil(maxWallSec * 60);
  for (let i = 0; i < frames; i++) {
    KN.step(sim, 1 / 60);
    const post = KN.pacePoll(sim);
    if (post != null) sim.timescale = post;
    if (done(sim)) return (i + 1) / 60;
  }
  return Infinity;
}

// ── Physical clock helpers ────────────────────────────────────────────────────
console.log('physical clock helpers');
{
  const { P } = loadLab(undefined);
  near('geomSeconds(1 Msun) = GM/c^3 of the Sun', P.geomSeconds(1), 4.9255e-6, 1e-9);
  near('geomSeconds scales linearly', P.geomSeconds(4e6), 4.9255e-6 * 4e6, 1e-3);
  check('fmtDuration picks ms', P.fmtDuration(0.0032) === '3.2 ms', P.fmtDuration(0.0032));
  check('fmtDuration picks hr', P.fmtDuration(7200) === '2 hr', P.fmtDuration(7200));
  check('fmtDuration picks yr', /yr$/.test(P.fmtDuration(3.2e8)), P.fmtDuration(3.2e8));
  // petersWindow reproduces the closed form (5/256) d^4 / (M1 M2 Mt)
  const t34 = P.petersWindow(1, 0.8, 34, 0, 1);
  near('petersWindow(d→0) = Peters t_merge', t34, P.peters(1, 0.8, 34).t_merge, 1e-6);
  check('petersWindow honours inspiralRate', Math.abs(P.petersWindow(1, 0.8, 34, 0, 4) - t34 / 4) < 1e-9);
}

// ── Scene radius + auto-fit ───────────────────────────────────────────────────
console.log('sceneRadius / fitView');
{
  const lab = loadLab(undefined);
  const { KN, sim } = lab;
  const r0 = KN.sceneRadius(sim, { x: 0, y: 0 });
  sim.disc.enabled = true;
  const rDisc = KN.sceneRadius(sim, { x: 0, y: 0 });
  check('disc widens the scene to its outer radius', rDisc >= 26 && rDisc > r0,
    `r0=${r0}, rDisc=${rDisc}`);
  const sWide = KN.fitView(sim, 800, 600);
  check('fitView(disc) zooms out to fit 26 M', sWide <= (300 * 0.85) / 26 + 1e-9,
    `scale=${sWide}`);
  sim.disc.enabled = false;
  KN.addBody(sim, { name: 'far', kind: 'planet', radius: 0.3, binding: 1, x: 40, y: 0, vx: 0, vy: 0.1 });
  check('orbiting body widens the scene', KN.sceneRadius(sim, { x: 0, y: 0 }) >= 40);
  // Device adaptation: the same scene fits a phone-sized canvas at a smaller scale.
  sim.disc.enabled = true;
  const sPhone = KN.fitView(sim, 360, 640);
  check('smaller canvas → smaller scale (same real scene)', sPhone < sWide,
    `phone=${sPhone}, desktop=${sWide}`);
  check('fitView clears the manual-zoom latch', sim.view.userZoomed === false);
}

// ── gw-inspiral: stellar-mass merger completes in its ~25 s window ───────────
console.log('demo gw-inspiral (paced merger)');
{
  const lab = loadLab('gw-inspiral');
  const { sim } = lab;
  check('companion placed', !!sim.binary.enabled);
  check('pace armed for merger', sim._pace && sim._pace.watch === 'merger');
  check('timescale compressed beyond the scrubber', sim.timescale > 64,
    `timescale=${sim.timescale}`);
  const wall = runUntil(lab, (s) => s.binary.merged, 45);
  check('merger completes in 10-35 wall seconds', wall >= 10 && wall <= 35, `wall=${wall}s`);
  check('slow-motion engaged after merger', sim._pace.fired && sim.timescale === 1,
    `timescale=${sim.timescale}`);
}

// ── smbh-merger: supermassive pair completes in its ~22 s window ─────────────
console.log('demo smbh-merger (paced merger, supermassive)');
{
  const lab = loadLab('smbh-merger');
  const { sim } = lab;
  check('supermassive regime set', sim.bhRegime === 'supermassive');
  check('bare-SMBH structure set', sim.smbhStructure === 'smbh');
  check('clean stage (no leftover bodies)', sim.bodies.length === 0);
  const wall = runUntil(lab, (s) => s.binary.merged, 45);
  check('SMBH merger completes in 10-35 wall seconds', wall >= 10 && wall <= 35, `wall=${wall}s`);
}

// ── tidal-stress: auto-dropped star is shredded in its ~16 s window ──────────
console.log('demo tidal-stress (paced disruption)');
{
  const lab = loadLab('tidal-stress');
  const { sim } = lab;
  check('demo stage has exactly the dropped star',
    sim.bodies.length === 1 && sim.bodies[0].kind === 'star', `bodies=${sim.bodies.length}`);
  check('pace armed for disruption', sim._pace && sim._pace.watch === 'disrupt');
  const wall = runUntil(lab, (s) => s.bodies.some((b) => b.state === 'spaghettified'), 45);
  check('spaghettification completes in 8-35 wall seconds', wall >= 8 && wall <= 35, `wall=${wall}s`);
  check('slow-motion engaged after disruption', sim._pace.fired && sim.timescale === 1);
}

// ── ns-xray-binary: Roche overflow ignites in its ~16 s window ───────────────
console.log('demo ns-xray-binary (paced RLOF)');
{
  const lab = loadLab('ns-xray-binary');
  const { sim } = lab;
  check('NS primary + stellar donor', sim.params.type === 'ns' && sim.binary.type === 'ms');
  check('donor photosphere derived before placement', sim.binary.R_star2 > 5,
    `R_star2=${sim.binary.R_star2}`);
  check('pace armed for RLOF', sim._pace && sim._pace.watch === 'rlof');
  const wall = runUntil(lab, (s) => (s.binary.mt && s.binary.mt.active) || s.binary.ceActive, 45);
  check('Roche overflow ignites in 8-35 wall seconds', wall >= 8 && wall <= 35, `wall=${wall}s`);
  check('slow-motion ×2 engaged at overflow', sim._pace.fired && sim.timescale === 2,
    `timescale=${sim.timescale}`);
}

// ── stale stored config must not distort a paced demo ────────────────────────
console.log('stale-config regression (restored knobs vs demo defaults)');
{
  // A previous session left a ×60 inspiral boost, ×5 transfer rate and a huge
  // paced timescale in storage — the demo must reset all of them.
  const stale = {
    params: { Msun: 1.4, type: 'ns', Q: 0, a: 0 },
    binary: { type: 'ms', M2sun: 1.0, M2: 0.71, d: 56, inspiralRate: 60,
              mtEnabled: false, transferRate: 5 },
    disc: { enabled: true, alpha: 0.18, emissionRate: 6 },
    timescale: 260,
  };
  const lab = loadLab('gw-inspiral', stale);
  const { sim } = lab;
  check('demo resets inspiralRate to true GR', sim.binary.inspiralRate === 1,
    `inspiralRate=${sim.binary.inspiralRate}`);
  check('demo resets transferRate', sim.binary.transferRate === 1);
  check('demo restores mass transfer default', sim.binary.mtEnabled === true);
  check('demo without a disc field turns the stale disc off', sim.disc.enabled === false);
  check('pace compresses the clock (not the physics)', sim.timescale > 64,
    `timescale=${sim.timescale}`);
  const wall = runUntil(lab, (s) => s.binary.merged, 45);
  check('merger still completes in 10-35 wall seconds', wall >= 10 && wall <= 35, `wall=${wall}s`);
}

// ── demo re-application + stale-scene normalisation ──────────────────────────
console.log('demo lifecycle (once per load, stale scene cleanup, watcher disarm)');
{
  // 1) applyConfig re-runs on every mount / layout swap — the demo must apply
  //    exactly once per sim, and the re-run must neither restore stored state
  //    over the demo scene nor wipe edits the user made since. Mirrors the
  //    real boot: module-load applyConfig, autosave, mount applyConfig.
  const lab = loadLab('tidal-stress');
  const { W, KN, sim } = lab;
  check('demo stage applied once', sim.bodies.length === 1);
  KN.saveConfig(sim);   // autosave persisted something for the re-run to read
  KN.addBody(sim, { name: 'USR-1', kind: 'planet', radius: 0.3, binding: 1,
    x: 14, y: 0, vx: 0, vy: 0.27 });
  const tsDemo = sim.timescale;
  const logCount = sim.events.filter((e) => /library demo loaded/.test(e.msg)).length;
  W.KNSim.applyConfig(sim);   // simulates the mount effect / a layout swap
  check('re-applyConfig keeps the user body', sim.bodies.length === 2,
    `bodies=${sim.bodies.length}`);
  check('re-applyConfig keeps the paced timescale', sim.timescale === tsDemo,
    `timescale=${sim.timescale} vs ${tsDemo}`);
  check('no duplicate demo log on remount',
    sim.events.filter((e) => /library demo loaded/.test(e.msg)).length === logCount);

  // 2) A stale armed watcher must not outlive its scene: deleting the demo's
  //    companion / resetting disarms it (regression for the pacePoll leak).
  sim._pace = { watch: 'merger', post: 1, fired: false };
  KN.removeCompanion(sim);
  check('removeCompanion disarms the pace watcher', sim._pace === null);
  sim._pace = { watch: 'disrupt', post: 1, fired: false };
  KN.placeCompanion(sim, 20, 0);
  check('fresh companion placement disarms a stale watcher', sim._pace === null);
}
{
  // 3) A stored supermassive galaxy session must not leak its swarm/halo/regime
  //    into a stellar demo (a leftover cloud would reroute the paced merger
  //    onto the dynamical-friction branch and blow out the auto-fit).
  const stale = {
    params: { Msun: 4e6, type: 'bh', Q: 0, a: 0.6 },
    bhRegime: 'supermassive',
    smbhStructure: 'galaxy',
    binary: { type: 'bh', M2sun: 8, M2: 2e-6, d: 18, enabled: true,
              x1: 0, y1: 0, x2: 18, y2: 0, vx1: 0, vy1: 0, vx2: 0, vy2: 0.3,
              cx: 0, cy: 0, d0: 18 },
    timescale: 4,
  };
  const lab = loadLab('kn-full', stale);   // kn-full: single body, no binary
  const { sim } = lab;
  check('stale galaxy structure normalised to bare hole', sim.smbhStructure === 'smbh');
  check('no leftover cloud members', !sim.bodies.some((b) => b._cloud));
  check('no leftover DM halo', !sim._halo1);
  check('bhRegime follows the demo mass', sim.bhRegime === 'stellar',
    sim.bhRegime);
  check('restored companion retired for a single-body demo', !sim.binary.enabled);
}

// ── orbits pace: geometry demos land near their windows ───────────────────────
console.log('demo pace (orbits) sanity across the catalog');
{
  const lab = loadLab(undefined);
  const { W, KN, P, sim } = lab;
  for (const [id, demo] of Object.entries(W.KN_DEMOS)) {
    const pace = demo.config && demo.config.pace;
    check(`${id} declares a pace`, !!pace);
    if (pace && pace.event === 'orbits') {
      check(`${id} orbits pace is engine-safe`, pace.window >= 10 && pace.window <= 30);
    }
  }
  // applyDemoPace(orbits) sets timescale = t_char / window within the clamp.
  sim.params.Msun = 10; sim.params.type = 'bh';
  KN.applyDemoPace(sim, { event: 'orbits', orbits: 3, r: 12, window: 20 });
  const v = P.circularSpeed(12, 1, 0) || Math.sqrt(1 / 12);
  const tChar = 3 * 2 * Math.PI * 12 / v;
  near('orbits timescale = t_char / window', sim.timescale, Math.min(300, tChar / 20), 0.05);
  check('orbits pace arms no one-shot watcher', sim._pace === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
