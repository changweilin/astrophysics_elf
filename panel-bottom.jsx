/* Bottom strip — Spawner library + time controls + event log */

function BottomStrip({ sim, force, playing, setPlaying, timescale, setTimescale }) {
  // Galaxy/cluster cloud particles are a population, not user objects — exclude them
  // from the body counter.
  const realBodies = sim.bodies.filter((b) => !b._cloud);
  // Source the spawn catalog from the full-physics bridge once it has loaded
  // (window.KNFull.objectCatalog); fall back to the inline LIBRARY otherwise so
  // the picker works even if the module bridge is unavailable.
  const [knReady, setKnReady] = React.useState(() => !!window.KNFull);
  React.useEffect(() => {
    const onReady = () => setKnReady(true);
    window.addEventListener('knfull-ready', onReady);
    if (window.KNFull) setKnReady(true);
    return () => window.removeEventListener('knfull-ready', onReady);
  }, []);
  // The interactive bodies follow the black-hole mass regime: a stellar BH offers
  // planets/comets, an IMBH offers cluster stars + remnants, an SMBH offers whole
  // stars/clouds/clusters (see KNphysics.BH_REGIMES). The regime catalog wins when
  // present; otherwise fall back to the full-physics catalog, then the inline list.
  const phys = window.KNphysics;
  const regime = (phys && phys.BH_REGIMES) ? phys.BH_REGIMES[sim.bhRegime || 'stellar'] : null;
  const regimeObjects = regime && regime.objects;
  const library = (regimeObjects && regimeObjects.length)
    ? regimeObjects
    : ((knReady && window.KNFull && window.KNFull.objectCatalog && window.KNFull.objectCatalog.length)
        ? window.KNFull.objectCatalog : LIBRARY);
  return (
    <div className="bottom">
      <div className="pane">
        <div className="spawner-head">
          <h3>{tr('Object Library — Drag into viewport', '天體庫 — 拖入視圖')}</h3>
          <span className="hint">{tr('drag card → release to place · then drag from body to aim launch vector', '拖曳卡片 → 放開以放置 · 再從天體拖曳以瞄準發射向量')}</span>
        </div>
        <div className="spawner">
          {library.map((it, i) => {
            const active = sim.placement && sim.placement.item.name === it.name;
            return (
            <button key={i} className={`spawn-card ${it.kind === 'gas' ? 'gasG' : it.kind} ${active ? 'active' : ''}`}
              onMouseDown={(e) => beginPlacement(sim, it, e, force)}>
              <div className="glyph">
                <span className="dot" />
                <span className="nm">{tr(it.name, it.name_zh)}</span>
              </div>
              <div className="meta">
                <div>R<sub>b</sub> <b>{it.radius.toFixed(2)} M</b></div>
                <div>{tr('bind', '束縛')} <b>{it.binding.toFixed(2)}</b>{it.charge ? <> · q <b style={{color:'var(--magenta)'}}>{it.charge > 0 ? '+' : ''}{it.charge}</b></> : null}</div>
                <div>{tr('spawn r', '生成 r')} <b>{it.spawnR} M</b></div>
              </div>
            </button>
          );
          })}
        </div>
        <div className="eventlog">
          {sim.events.length === 0 && <div className="ev"><span className="t">[T+0.0]</span>{tr('Awaiting first event…', '等待第一個事件…')}</div>}
          {sim.events.slice(0, 6).map((e, i) => (
            <div key={i} className={`ev ${e.type}`}><span className="t">[T+{e.t}]</span>{e.msg}</div>
          ))}
        </div>
      </div>

      <div className="pane">
        <div className="time">
          <div>
            <div className="ctrls">
              <button className="play" onClick={() => setPlaying(!playing)}>
                {playing ? '❚❚' : '▶'}
              </button>
              <button onClick={() => { sim.bodies.forEach(b => b.trail.length = 0); force(); }}>{tr('CLR TRAILS', '清軌跡')}</button>
              <button onClick={() => { sim.bodies = []; sim._halo1 = null; sim._halo2 = null; sim.selectedId = null; sim.events = []; sim.t = 0; sim.moving = null; if (sim.binary) sim.binary.held = false; force(); }}>{tr('RESET', '重置')}</button>
            </div>
            <div className="meta-row">
              <span>T <b>{sim.t.toFixed(1)} M</b></span>
              <span>×<b>{timescale.toFixed(2)}</b></span>
              <span>{tr('BODIES', '天體')} <b>{realBodies.filter(b => b.state === 'orbit').length}/{realBodies.length}</b></span>
            </div>
            <SpeedScrubber timescale={timescale} setTimescale={setTimescale} />
          </div>
          <div className="meta-row">
            <span style={{color:'var(--fg-3)'}}>{tr('Keyboard', '鍵盤')} <span className="kbd">space</span> {tr('play', '播放')} · <span className="kbd">R</span> {tr('reset', '重置')} · <span className="kbd">B</span> {tr('BH scale', '黑洞尺度')}</span>
          </div>
        </div>
      </div>

      <AboutMe />
    </div>
  );
}

// Author card pinned to the bottom strip. Favicons are pulled from Google's
// favicon service so the links carry their site marks without bundling assets.
function AboutMe() {
  const links = [
    { href: 'https://github.com/changweilin', domain: 'github.com', label: 'GitHub' },
    { href: 'https://www.linkedin.com/in/wei-lin-chang-ba38049a/', domain: 'linkedin.com', label: 'LinkedIn' },
    { href: 'https://changweilin.github.io/demo_link/', domain: 'changweilin.github.io', label: 'Portfolio' },
  ];
  return (
    <div className="pane about-me">
      <div className="spawner-head">
        <h3>{tr('About Me', '關於我')}</h3>
      </div>
      <div className="about-name">Chang Wei Lin</div>
      <div className="about-quote">
        <div className="zh">我愛星空至深，無懼黑夜。</div>
        <div className="en">We have loved the stars too fondly to fear the dark.</div>
        <div className="src">— <i>The Old Astronomer</i>, Sarah Williams</div>
      </div>
      <div className="about-links">
        {links.map((l) => (
          <a key={l.domain} href={l.href} target="_blank" rel="noopener noreferrer" title={l.label}>
            <img src={`https://www.google.com/s2/favicons?domain=${l.domain}&sz=32`}
                 alt={l.label} width="16" height="16" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}
window.AboutMe = AboutMe;

// Discrete simulation-speed multipliers. Wider range + finer steps than before;
// step() now advances multiple macro-steps per frame so the high end is real
// (the old dt clamp made anything past ~×3 a no-op).
const SPEED_STEPS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
window.SPEED_STEPS = SPEED_STEPS;

function speedFmt(s) { return s < 1 ? `×${s}` : `×${s % 1 === 0 ? s : s.toFixed(2)}`; }
function nearestSpeedIdx(s) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < SPEED_STEPS.length; i++) {
    const d = Math.abs(SPEED_STEPS[i] - s);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Horizontal speed scrubber: tap a tick or drag left/right to scrub through the
// discrete multipliers. Pointer events so it works with mouse and touch alike.
function SpeedScrubber({ timescale, setTimescale }) {
  const ref = React.useRef(null);
  const dragging = React.useRef(false);
  const idx = nearestSpeedIdx(timescale);
  const n = SPEED_STEPS.length;
  const frac = n > 1 ? idx / (n - 1) : 0;

  function setFromClientX(clientX) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    setTimescale(SPEED_STEPS[Math.round(f * (n - 1))]);
  }

  return (
    <div className="speed-scrub" ref={ref}
      onPointerDown={(e) => { dragging.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} setFromClientX(e.clientX); }}
      onPointerMove={(e) => { if (dragging.current) setFromClientX(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      title={tr('drag left/right to change the simulation speed multiplier', '拖曳左右切換模擬速度倍率')}>
      <div className="track">
        <div className="fill" style={{ width: `${frac * 100}%` }} />
        {SPEED_STEPS.map((s, i) => (
          <span key={s} className={`tick ${i === idx ? 'on' : ''}`}
            style={{ left: `${(n > 1 ? i / (n - 1) : 0) * 100}%` }} />
        ))}
        <div className="knob" style={{ left: `${frac * 100}%` }} />
      </div>
      <div className="val">{speedFmt(SPEED_STEPS[idx])}</div>
    </div>
  );
}
window.SpeedScrubber = SpeedScrubber;

// Fallback catalog used only when the full-physics bridge (window.KNFull.objectCatalog)
// has not loaded; the richer mapped library replaces this at runtime.
const LIBRARY = [
  { name: 'Rocky planet',  name_zh: '岩質行星', kind: 'planet', radius: 0.30, binding: 2.5, charge: 0,    spawnR: 12 },
  { name: 'Gas giant',     name_zh: '氣態巨行星', kind: 'gas',    radius: 0.55, binding: 0.9, charge: 0,    spawnR: 14 },
  { name: 'Brown dwarf',   name_zh: '棕矮星', kind: 'star',   radius: 0.45, binding: 4.0, charge: 0,    spawnR: 16 },
  { name: 'Comet',         name_zh: '彗星', kind: 'probe',  radius: 0.05, binding: 0.4, charge: 0,    spawnR: 22 },
  { name: 'Crewed ship',   name_zh: '載人飛船', kind: 'ship',   radius: 0.02, binding: 8.0, charge: 0,    spawnR: 9 },
  { name: 'Charged probe', name_zh: '帶電探測器', kind: 'probe',  radius: 0.05, binding: 5.0, charge: 0.6,  spawnR: 11 },
  { name: 'Pulsar core',   name_zh: '波霎核心', kind: 'star',   radius: 0.10, binding: 20.0, charge: 0,   spawnR: 18 },
  { name: 'Dust cloud',    name_zh: '塵埃雲', kind: 'gas',    radius: 0.40, binding: 0.25, charge: 0,   spawnR: 25 },
];

let nameCounters = {};
function beginPlacement(sim, it, e, force) {
  e.preventDefault();
  sim.placement = {
    item: it,
    wx: 0, wy: 0,
    inCanvas: false,
  };
  window.KNSim.logEv(sim, 'amber', trp('placing {name}… drop into viewport', { name: tr(it.name, it.name_zh) }));
  force();
}
window.__bumpName = function (kind) {
  nameCounters[kind] = (nameCounters[kind] || 0) + 1;
  return String(nameCounters[kind]).padStart(2, '0');
};

window.BottomStrip = BottomStrip;
