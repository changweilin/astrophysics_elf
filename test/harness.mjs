/* Shared bootstrap for the browser-demo tests.
 *
 * The root scripts (physics.js, sim.js, render.js, config.js, disc.js,
 * demo-presets.js, interaction-core.js) are browser IIFEs that assign
 * window.* globals and call the i18n globals tr()/trp(). They are not ES
 * modules, so every test loads them into a node:vm context with the browser
 * globals stubbed. That bootstrap, the recording Canvas2D stub and the
 * PASS/FAIL counter used to be copy-pasted into each test file; they live
 * here now so a stub fix lands once.
 *
 * Determinism: the swarm seeding, starburst and cloud-swallow paths in sim.js
 * call Math.random(). Tests get a seeded PRNG by default (see `seed`), so a
 * failure is reproducible and CI cannot go green by luck. Pass `seed: null`
 * to opt back into real randomness.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Named engine file sets — load order matters (render.js and config.js
 * augment the KNSim that sim.js defines). */
export const ENGINE = {
  physics: ['physics.js'],
  core: ['physics.js', 'sim.js', 'disc.js'],
  interaction: ['physics.js', 'sim.js', 'interaction-core.js'],
  render: ['physics.js', 'sim.js', 'render.js', 'config.js', 'disc.js'],
  demo: ['physics.js', 'sim.js', 'disc.js', 'demo-presets.js', 'config.js'],
};

// mulberry32 — 32-bit, no dependencies, good enough for seeding a swarm.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Load an engine file set into a fresh vm context.
 *
 *   files   array of root filenames, or an ENGINE key
 *   storage optional object pre-seeded into localStorage (stale-config tests)
 *   seed    PRNG seed for Math.random (default 1; null = real randomness)
 *
 * Returns the sandbox plus the window globals the tests actually reach for.
 */
export function loadEngine(files = 'core', { storage, seed = 1 } = {}) {
  const list = typeof files === 'string' ? ENGINE[files] : files;
  if (!list) throw new Error(`unknown engine file set: ${files}`);

  const store = new Map();
  for (const [k, v] of Object.entries(storage || {})) store.set(k, JSON.stringify(v));

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
    Math: seed == null ? Math : Object.assign(Object.create(Math), { random: mulberry32(seed) }),
    isFinite, isNaN, Number, Array, JSON, Object,
  };
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const f of list) {
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }

  const W = sandbox.window;
  return { sandbox, W, KN: W.KNSim, P: W.KNphysics, D: W.KNDisc, KI: W.KNInteract };
}

/* Fresh populated sim: disc + binary initialised the way the real boot does. */
export function newSim(lab, { disc = true, binary = true } = {}) {
  const sim = lab.KN.createSim();
  if (disc && lab.D) lab.D.initDisc(sim);
  if (binary) lab.KN.initBinary(sim);
  return sim;
}

/* Lab with a ?demo= id pre-resolved (config.js reads window.__knDemoId).
 * `storage` pre-seeds a previous session's saved config. */
export function loadLab(demoId, storage, opts = {}) {
  const lab = loadEngine('demo', { storage, ...opts });
  lab.W.__knDemoId = demoId === undefined ? null : demoId;
  const sim = lab.KN.createSim();
  lab.KN.initBinary(sim);
  lab.D.initDisc(sim);
  if (demoId !== undefined) lab.KN.applyConfig(sim);   // reads storage, then applies the demo
  lab.sim = sim;
  return lab;
}

/* Recording Canvas2D stub: every 2D-context method is a no-op that counts
 * itself, so a render pass can be asserted for "drew something, threw
 * nothing" without a real canvas. */
export function makeCanvas({ width = 1600, height = 1200 } = {}) {
  const target = { calls: {}, canvas: { width, height } };
  const grad = { addColorStop() {} };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      return (...args) => {
        t.calls[prop] = (t.calls[prop] || 0) + 1;
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return grad;
        if (prop === 'measureText') return { width: String(args[0] || '').length * 6 };
        return undefined;
      };
    },
    set(t, prop, val) { t[prop] = val; return true; },
  });
}

/* PASS/FAIL counter. `finish()` prints the summary and exits non-zero on any
 * failure, which is the contract test/run-all.mjs relies on. */
export function checker(title) {
  let passed = 0, failed = 0, known = 0, surprises = 0;
  if (title) console.log(`${title}\n`);

  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log(`  PASS ${name}`); }
    else { failed++; console.log(`  FAIL ${name}${detail ? `\n        ${detail}` : ''}`); }
    return !!cond;
  };
  const near = (name, actual, expected, tol = 1e-9) => {
    const err = Math.abs(actual - expected);
    return check(name, err <= tol, `actual=${actual}, expected=${expected}, err=${err}, tol=${tol}`);
  };
  /* Documented model gap: the check runs and reports, but does not fail the
   * suite, so the checks around it keep gating instead of the whole file
   * being switched off. `note` must say what has to be adjudicated and by
   * whom — an xfail with no owner is just a disabled test. An unexpected
   * pass is reported loudly (XPASS) so the marker gets removed. */
  const xfail = (name, cond, detail, note) => {
    if (cond) {
      surprises++;
      console.log(`  XPASS ${name} — now passing; drop the known-gap marker${detail ? `\n        ${detail}` : ''}`);
    } else {
      known++;
      console.log(`  XFAIL ${name} — known gap, not gating${detail ? `\n        ${detail}` : ''}${note ? `\n        ${note}` : ''}`);
    }
    return !!cond;
  };
  const finish = () => {
    const extra = [known ? `${known} known-gap` : '', surprises ? `${surprises} XPASS` : '']
      .filter(Boolean).join(', ');
    console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed}/${passed + failed} checks passed${extra ? ` (${extra})` : ''}`);
    process.exit(failed === 0 ? 0 : 1);
  };
  return { check, near, xfail, finish, counts: () => ({ passed, failed, known, surprises }) };
}
