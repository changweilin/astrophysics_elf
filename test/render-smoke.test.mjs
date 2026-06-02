/* Headless render smoke test for the browser-demo engine.
 *
 * node --check and the unit tests never execute render() — yet that is where the
 * bulk of sim.js lives and where a missing helper reference would surface. This
 * harness loads physics.js + sim.js + disc.js (and, once split out, render.js +
 * config.js) into a vm context with a recording Canvas2D stub, builds a populated
 * scene, and drives every major render branch (single BH, binary, placement,
 * aiming, naked singularity, stellar central). It asserts that nothing throws and
 * that the context actually received draw calls — so a refactor that drops a
 * reference fails here instead of silently in the browser.
 *
 * Run:  node test/render-smoke.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── vm context with browser globals stubbed ──────────────────────────────────
const store = new Map();
const sandbox = {
  window: {},
  console,
  tr: (en) => en,
  trp: (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) =>
    (vars && Object.prototype.hasOwnProperty.call(vars, k)) ? vars[k] : m),
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  performance: { now: () => Date.now() },
  devicePixelRatio: 1,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const ENGINE_FILES = ['physics.js', 'sim.js', 'render.js', 'config.js', 'disc.js'];
function load(file) {
  try {
    vm.runInContext(readFileSync(join(root, file), 'utf8'), sandbox, { filename: file });
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;   // file not split out yet — skip
    throw e;
  }
}
for (const f of ENGINE_FILES) load(f);

const KN = sandbox.window.KNSim;
const KD = sandbox.window.KNDisc;

// ── recording Canvas2D stub ──────────────────────────────────────────────────
function makeCtx() {
  const target = { calls: {}, canvas: { width: 1600, height: 1200 } };
  const grad = { addColorStop() {} };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      return (...args) => {
        t.calls[prop] = (t.calls[prop] || 0) + 1;
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return grad;
        if (prop === 'measureText') return { width: (String(args[0] || '')).length * 6 };
        return undefined;
      };
    },
    set(t, prop, val) { t[prop] = val; return true; },
  });
}

// ── tiny assert harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `\n        ${detail}` : ''}`); }
}

console.log('Render smoke test\n');
check('window.KNSim defined', !!KN);
check('window.KNDisc defined', !!KD);
check('KNSim.render is a function', typeof KN?.render === 'function');
check('KNSim.renderInteraction is a function', typeof KN?.renderInteraction === 'function');
check('KNSim.applyConfig is a function', typeof KN?.applyConfig === 'function');
check('KNSim.worldToScreen is a function', typeof KN?.worldToScreen === 'function');

// ── build a populated scene ──────────────────────────────────────────────────
const sim = KN.createSim();
KD.initDisc(sim);
KN.initBinary(sim);
for (const it of [
  { name: 'PL-01', kind: 'planet', radius: 0.30, binding: 2.5, x: 12, y: 0, vx: 0, vy: 0.35 },
  { name: 'GG-01', kind: 'gas', radius: 0.55, binding: 0.9, x: -16, y: 4, vx: -0.05, vy: -0.30 },
  { name: 'SS-01', kind: 'ship', radius: 0.02, binding: 8.0, x: 0, y: 9, vx: -0.40, vy: 0 },
]) KN.addBody(sim, it);
sim.selectedId = sim.bodies[2].id;
for (const k of Object.keys(sim.flags)) sim.flags[k] = true;   // every overlay on
if (sim.disc) sim.disc.enabled = true;

// advance a bit so trails / disc particles populate
for (let i = 0; i < 40; i++) KN.step(sim, 0.016);

const W = 1600, H = 1200;
function renderScene(label) {
  const ctx = makeCtx();
  try {
    KN.render(sim, ctx, W, H);
    KN.renderInteraction(sim, ctx, W, H);
    const n = Object.values(ctx.calls).reduce((a, b) => a + b, 0);
    check(`${label}: render+interaction without throwing`, true);
    check(`${label}: issued draw calls (${n})`, n > 20, `only ${n} ctx calls`);
    return ctx;
  } catch (e) {
    check(`${label}: render+interaction without throwing`, false, e.stack || String(e));
    return null;
  }
}

// 1) single BH, all overlays, populated trails
{
  const ctx = renderScene('single-BH');
  if (ctx) {
    check('single-BH: cleared the frame', !!ctx.calls.clearRect);
    check('single-BH: drew arcs (horizon/rings/bodies)', (ctx.calls.arc || 0) > 0);
    check('single-BH: stroked paths (trails/rings)', (ctx.calls.stroke || 0) > 0);
  }
}

// 2) binary: place a companion and let it co-orbit
KN.placeCompanion(sim, 9, 0);
sim.view.frame = 'com';
for (let i = 0; i < 40; i++) KN.step(sim, 0.016);
renderScene('binary');

// 3) placement ghost active
sim.placement = { item: { name: 'PR-Probe', kind: 'probe', radius: 0.02, binding: 1, charge: 0 }, wx: 5, wy: -5, inCanvas: true };
renderScene('placement-ghost');
sim.placement = null;

// 4) aiming slingshot active (drag from a body)
sim.aiming = { bodyId: sim.bodies[0].id, isAiming: true, pullSx: 1000, pullSy: 700 };
renderScene('aiming');
sim.aiming = null;

// 5) naked singularity (a^2 + Q^2 > M^2 — exercises the no-horizon branches)
{
  const a0 = sim.params.a, q0 = sim.params.Q;
  sim.params.a = 3.0; sim.params.Q = 1.0;
  renderScene('naked-singularity');
  sim.params.a = a0; sim.params.Q = q0;
}

// 6) stellar central (non-BH surface rendering)
{
  const t0 = sim.params.type;
  sim.params.type = 'ns'; sim.params.R_star = 3;
  renderScene('stellar-central');
  sim.params.type = t0;
}

// 7) config round-trip survives a render-built scene
{
  KN.saveConfig(sim);
  const fresh = KN.createSim();
  KD.initDisc(fresh);
  KN.initBinary(fresh);
  const applied = KN.applyConfig(fresh);
  check('config: applyConfig restored a saved scene', applied === true);
  check('config: restored body count matches', fresh.bodies.length === sim.bodies.filter((b) => b.state === 'orbit').length,
    `fresh=${fresh.bodies.length} live=${sim.bodies.filter((b) => b.state === 'orbit').length}`);
  renderScene('post-restore');
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
