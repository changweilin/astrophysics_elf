/* Unit tests for the shared pointer-interaction helpers (interaction-core.js),
 * which the desktop and mobile roots both call. Loads physics.js + sim.js +
 * interaction-core.js into a vm context (browser globals stubbed) and checks the
 * pure logic: star draw-radius, hit testing (with desktop vs mobile thresholds),
 * and grab-reposition. Guards against the desktop/mobile copies drifting apart.
 *
 * Run:  node test/interaction.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = {
  window: {}, console,
  tr: (en) => en,
  trp: (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) =>
    (vars && Object.prototype.hasOwnProperty.call(vars, k)) ? vars[k] : m),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['physics.js', 'sim.js', 'interaction-core.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
}
const KN = sandbox.window.KNSim;
const KI = sandbox.window.KNInteract;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('Interaction-core unit tests\n');
check('window.KNInteract defined', !!KI);
check('hitTestGrabbable is a function', typeof KI?.hitTestGrabbable === 'function');
check('starVisualR is a function', typeof KI?.starVisualR === 'function');
check('moveGrabTo is a function', typeof KI?.moveGrabTo === 'function');

const W = 800, H = 600;
const sim = KN.createSim();           // scale 18, ox/oy 0, frame free
KN.initBinary(sim);
const bid = KN.addBody(sim, { name: 'PL', kind: 'planet', radius: 0.3, binding: 1, x: 10, y: 0, vx: 0, vy: 0.3 });
const [bsx, bsy] = KN.worldToScreen(sim, W, H, 10, 0);   // body's screen position

// ── starVisualR ──────────────────────────────────────────────────────────────
{
  const hz = sandbox.window.KNphysics.horizons(1.5, 0, 0);   // r+ = 3
  check('starVisualR BH = max(4, r+ * scale)',
    KI.starVisualR(sim, 1.5, 0, 0, 'bh', 3) === Math.max(4, hz.rplus * sim.view.scale));
  check('starVisualR stellar = max(6, R_star * scale * 0.7)',
    KI.starVisualR(sim, 1.5, 0, 0, 'ns', 3) === Math.max(6, 3 * sim.view.scale * 0.7));
}

// ── hitTestGrabbable ─────────────────────────────────────────────────────────
{
  const hit = KI.hitTestGrabbable(sim, bsx, bsy, W, H);
  check('hits the body directly under the cursor', hit && hit.kind === 'body' && hit.bodyId === bid, JSON.stringify(hit));
  check('empty space returns null', KI.hitTestGrabbable(sim, 5, 5, W, H) === null);

  // Threshold: a cursor 25 px from the body misses the desktop radius (22) but
  // catches the larger mobile radius (28).
  const offX = bsx + 25;
  check('desktop threshold (22) misses at 25 px', KI.hitTestGrabbable(sim, offX, bsy, W, H) === null);
  check('mobile threshold (28) hits at 25 px',
    (KI.hitTestGrabbable(sim, offX, bsy, W, H, { bodyR: 28, compFloor: 18, compPad: 6 }) || {}).kind === 'body');
}

// ── companion hit + moveGrabTo ───────────────────────────────────────────────
{
  // Move the body well clear first — bodies take priority over the companion, so
  // an overlapping body would otherwise win the hit test (correctly).
  KI.moveGrabTo(sim, { kind: 'body', bodyId: bid }, -25, 18);
  KN.placeCompanion(sim, 9, 0);
  const [csx, csy] = KN.worldToScreen(sim, W, H, sim.binary.x2, sim.binary.y2);
  const chit = KI.hitTestGrabbable(sim, csx, csy, W, H);
  check('hits the companion at its screen position', chit && chit.kind === 'companion', JSON.stringify(chit));

  KI.moveGrabTo(sim, { kind: 'companion' }, 4, -4);
  check('moveGrabTo relocates the companion', sim.binary.x2 === 4 && sim.binary.y2 === -4);

  KI.moveGrabTo(sim, { kind: 'body', bodyId: bid }, -7, 3);
  const b = sim.bodies.find((x) => x.id === bid);
  check('moveGrabTo relocates a body', b.x === -7 && b.y === 3);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
