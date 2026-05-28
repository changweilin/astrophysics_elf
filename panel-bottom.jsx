/* Bottom strip — Spawner library + time controls + event log */

function BottomStrip({ sim, force, playing, setPlaying, timescale, setTimescale }) {
  return (
    <div className="bottom">
      <div className="pane">
        <div className="spawner-head">
          <h3>Object Library — Drag into viewport</h3>
          <span className="hint">drag card → release to place · then drag from body to aim launch vector</span>
        </div>
        <div className="spawner">
          {LIBRARY.map((it, i) => {
            const active = sim.placement && sim.placement.item.name === it.name;
            return (
            <button key={i} className={`spawn-card ${it.kind === 'gas' ? 'gasG' : it.kind} ${active ? 'active' : ''}`}
              onMouseDown={(e) => beginPlacement(sim, it, e, force)}>
              <div className="glyph">
                <span className="dot" />
                <span className="nm">{it.name}</span>
              </div>
              <div className="meta">
                <div>R<sub>b</sub> <b>{it.radius.toFixed(2)} M</b></div>
                <div>bind <b>{it.binding.toFixed(2)}</b>{it.charge ? <> · q <b style={{color:'var(--magenta)'}}>{it.charge > 0 ? '+' : ''}{it.charge}</b></> : null}</div>
                <div>spawn r <b>{it.spawnR} M</b></div>
              </div>
            </button>
          );
          })}
        </div>
        <div className="eventlog">
          {sim.events.length === 0 && <div className="ev"><span className="t">[T+0.0]</span>Awaiting first event…</div>}
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
              <button onClick={() => { sim.bodies.forEach(b => b.trail.length = 0); force(); }}>CLR TRAILS</button>
              <button onClick={() => { sim.bodies = []; sim.selectedId = null; sim.events = []; sim.t = 0; sim.moving = null; if (sim.binary) sim.binary.held = false; force(); }}>RESET</button>
            </div>
            <div className="meta-row">
              <span>T <b>{sim.t.toFixed(1)} M</b></span>
              <span>×<b>{timescale.toFixed(2)}</b></span>
              <span>BODIES <b>{sim.bodies.filter(b => b.state === 'orbit').length}/{sim.bodies.length}</b></span>
            </div>
            <div className="speed-bar">
              {[0.25, 0.5, 1, 2, 4, 8].map((s) => (
                <button key={s} className={Math.abs(timescale - s) < 0.01 ? 'on' : ''}
                  onClick={() => setTimescale(s)}>×{s}</button>
              ))}
            </div>
          </div>
          <div className="meta-row">
            <span style={{color:'var(--fg-3)'}}>Keyboard <span className="kbd">space</span> play · <span className="kbd">R</span> reset · <span className="kbd">·</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

const LIBRARY = [
  { name: 'Rocky planet',  kind: 'planet', radius: 0.30, binding: 2.5, charge: 0,    spawnR: 12 },
  { name: 'Gas giant',     kind: 'gas',    radius: 0.55, binding: 0.9, charge: 0,    spawnR: 14 },
  { name: 'Brown dwarf',   kind: 'star',   radius: 0.45, binding: 4.0, charge: 0,    spawnR: 16 },
  { name: 'Comet',         kind: 'probe',  radius: 0.05, binding: 0.4, charge: 0,    spawnR: 22 },
  { name: 'Crewed ship',   kind: 'ship',   radius: 0.02, binding: 8.0, charge: 0,    spawnR: 9 },
  { name: 'Charged probe', kind: 'probe',  radius: 0.05, binding: 5.0, charge: 0.6,  spawnR: 11 },
  { name: 'Pulsar core',   kind: 'star',   radius: 0.10, binding: 20.0, charge: 0,   spawnR: 18 },
  { name: 'Dust cloud',    kind: 'gas',    radius: 0.40, binding: 0.25, charge: 0,   spawnR: 25 },
];

let nameCounters = {};
function beginPlacement(sim, it, e, force) {
  e.preventDefault();
  sim.placement = {
    item: it,
    wx: 0, wy: 0,
    inCanvas: false,
  };
  window.KNSim.logEv(sim, 'amber', `placing ${it.name}… drop into viewport`);
  force();
}
window.__bumpName = function (kind) {
  nameCounters[kind] = (nameCounters[kind] || 0) + 1;
  return String(nameCounters[kind]).padStart(2, '0');
};

window.BottomStrip = BottomStrip;
