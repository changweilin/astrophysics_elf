/* Right panel — Object inspector */
const { useState: useStateR, useEffect: useEffectR, useMemo: useMemoR, useRef: useRefR } = React;

// Re-render trigger when the ESM full-physics bridge finishes loading.
function useFullBridgeReady() {
  const [ready, setReady] = useStateR(() => !!window.KNFull);
  useEffectR(() => {
    if (ready) return;
    function onReady() { setReady(true); }
    window.addEventListener('knfull-ready', onReady);
    // Cover the race where the module loaded between render and effect.
    if (window.KNFull) setReady(true);
    return () => window.removeEventListener('knfull-ready', onReady);
  }, [ready]);
  return ready;
}

// Cheap throttle for the expensive tidal-tensor / orbit-diagnostic calls.
// Returns the cached value, re-evaluates at most every `intervalMs`.
function useThrottledFull(compute, deps, intervalMs = 240) {
  const ref = useRefR({ at: 0, value: null });
  return useMemoR(() => {
    const now = performance.now();
    if (now - ref.current.at >= intervalMs) {
      try { ref.current.value = compute(); }
      catch { /* keep previous */ }
      ref.current.at = now;
    }
    return ref.current.value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function StressBar({ stress, peak }) {
  const pct = Math.min(100, stress * 100);
  return (
    <div className="bar-wrap">
      <div className="bar-row">
        <span className="k">Tidal stress / binding</span>
        <span className="v">{stress.toFixed(2)}× <small style={{color:'var(--fg-3)', marginLeft:6}}>peak {peak.toFixed(2)}×</small></span>
      </div>
      <div className="bar">
        <div className="fill" style={{ width: pct + '%' }} />
        <div className="yellow-line" />
        <div className="red-line" />
      </div>
      <div className="note">spaghettification at ≈ 1.15×</div>
    </div>
  );
}

function RightPanel({ sim, force }) {
  const phys = window.KNphysics;
  const sel = sim.bodies.find((b) => b.id === sim.selectedId);
  const { M, Q, a } = sim.params;
  const { rplus } = phys.horizons(M, Q, a);
  const fullReady = useFullBridgeReady();

  return (
    <div className="panel right">
      {fullReady && (
        <SpacetimeDiagnostics sim={sim} />
      )}

      <div className="section">
        <div className="section-head">
          <h3>Object Roster</h3>
          <span className="idx">§05 · {sim.bodies.length}</span>
        </div>
        <div className="obj-pick">
          {sim.bodies.length === 0 && (
            <div style={{padding:'14px 12px', fontSize:11, color:'var(--fg-3)', fontFamily:'var(--mono)', letterSpacing:'0.06em'}}>
              Drop bodies from the library below to begin.
            </div>
          )}
          {sim.bodies.map((b) => (
            <button key={b.id} className={`opt ${b.state !== 'orbit' ? b.state : ''} ${sim.selectedId === b.id ? 'sel' : ''}`}
              onClick={() => { sim.selectedId = b.id; force(); }}>
              <span className="ico">{glyphFor(b.kind)}</span>
              <span className="nm">{b.name}</span>
              <span className="st">{stateLabel(b.state)}</span>
            </button>
          ))}
        </div>
      </div>

      {sel ? (
        <>
          <div className="section">
            <div className="section-head">
              <h3>Telemetry — {sel.name}</h3>
              <span className="idx">§06</span>
            </div>
            <Telemetry sim={sim} body={sel} />
          </div>

          <ObjectParams sim={sim} body={sel} force={force} />

          <div className="section">
            <div className="section-head">
              <h3>Tidal Field</h3>
              <span className="idx">§07</span>
            </div>
            <StressBar stress={sel.stress} peak={sel.stressPeak} />
          </div>

          <div className="section">
            <div className="section-head">
              <h3>Diagnosis</h3>
              <span className="idx">§08</span>
            </div>
            <Diagnosis sim={sim} body={sel} rplus={rplus} />
          </div>

          {fullReady && (
            <FullEngineDetail sim={sim} body={sel} />
          )}

          {sel.kind === 'ship' && (
            <div className="section">
              <div className="section-head">
                <h3>Δv Burn — Prograde</h3>
                <span className="idx">§09</span>
              </div>
              <div style={{display:'flex', gap:6}}>
                {[0.05, 0.1, 0.25].map((dv) => (
                  <button key={dv} onClick={() => burnProgrde(sel, dv, sim)}
                    style={btnStyle}>+{dv}c</button>
                ))}
                {[-0.05, -0.1, -0.25].map((dv) => (
                  <button key={dv} onClick={() => burnProgrde(sel, dv, sim)}
                    style={{...btnStyle, color:'var(--magenta)'}}>{dv}c</button>
                ))}
              </div>
              <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-3)', letterSpacing:'0.06em', marginTop:8, lineHeight:1.5}}>
                Apply impulse along current velocity vector. Negative = retrograde.
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="section">
          <div className="empty">
            <div className="ic">— · —</div>
            <div className="ms">
              Select an object from the roster, or click any body in the viewport to inspect its worldline.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Telemetry({ sim, body }) {
  const phys = window.KNphysics;
  const r = Math.hypot(body.x, body.y);
  const v = Math.hypot(body.vx, body.vy);
  const { M, Q, a } = sim.params;
  const { rplus } = phys.horizons(M, Q, a);
  const rIsco = phys.isco(M, a);
  const rErg = phys.ergosphereEq(M, Q);
  // Angular momentum per unit mass (approx)
  const L = body.x * body.vy - body.y * body.vx;
  // Specific orbital energy (Newtonian)
  const E = 0.5 * v * v - M / Math.max(r, 0.1);
  const insideErgo = !isNaN(rErg) && r < rErg && r > rplus;
  return (
    <div className="telem">
      <div className="item"><span className="k">Radial distance r</span>
        <span className="v">{r.toFixed(3)}<small>M</small></span></div>
      <div className="item"><span className="k">r / r₊</span>
        <span className={`v`}>{(rplus > 0 ? r / rplus : 0).toFixed(2)}</span></div>
      <div className="item"><span className="k">Speed |v|</span>
        <span className={`v`}>{v.toFixed(3)}<small>c</small></span></div>
      <div className={`item ${L > 0 ? 'good' : ''}`}><span className="k">L · M⁻¹</span>
        <span className="v">{L.toFixed(3)}</span></div>
      <div className="item"><span className="k">E spec.</span>
        <span className="v">{E.toFixed(3)}</span></div>
      <div className={`item ${insideErgo ? 'warn' : ''}`}><span className="k">Region</span>
        <span className="v">{regionLabel(r, rplus, rErg, rIsco)}</span></div>
      <div className="item"><span className="k">Worldline span</span>
        <span className="v">{(body.trail.length / 2).toFixed(0)}<small>samples</small></span></div>
    </div>
  );
}

function regionLabel(r, rplus, rErg, rIsco) {
  if (r < rplus) return 'INSIDE r₊';
  if (!isNaN(rErg) && r < rErg) return 'ERGOSPHERE';
  if (r < rIsco) return 'BELOW ISCO';
  if (r < rIsco * 2.5) return 'STRONG-FIELD';
  return 'WEAK-FIELD';
}

function Diagnosis({ sim, body, rplus }) {
  const phys = window.KNphysics;
  const r = Math.hypot(body.x, body.y);
  const { M, Q, a } = sim.params;
  const rErg = phys.ergosphereEq(M, Q);
  const rIsco = phys.isco(M, a);
  const lines = [];
  if (body.state === 'captured') lines.push({ t: 'critical', m: 'Crossed event horizon — added to BH mass register.' });
  if (body.state === 'spaghettified') lines.push({ t: 'critical', m: 'Disrupted by tidal field. Material dispersed into accretion stream.' });
  if (body.state === 'escaped') lines.push({ t: 'note', m: 'Worldline left detector envelope. Effectively unbound.' });
  if (body.state === 'orbit') {
    if (r < rplus * 1.2) lines.push({ t: 'critical', m: 'Imminent horizon crossing. No stable orbits exist here.' });
    else if (r < rIsco) lines.push({ t: 'warn', m: 'Below ISCO — orbit is unstable, infall expected.' });
    else if (!isNaN(rErg) && r < rErg) lines.push({ t: 'warn', m: 'Inside ergosphere. Any timelike observer is forced to co-rotate with the BH (frame dragging).' });
    if (body.stress > 0.5) lines.push({ t: 'warn', m: 'Tidal stress approaching binding threshold. Structural integrity dropping.' });
    if (body.kind === 'ship' && Math.abs(a) > 0.5 && r < rIsco * 1.4) {
      lines.push({ t: 'good', m: 'Conditions suitable for Penrose process — retrograde burn inside ergosphere extracts rotational energy.' });
    }
    if (body.charge && Math.abs(Q) > 0.05) {
      const sign = body.charge * Q > 0 ? 'repulsive' : 'attractive';
      lines.push({ t: 'note', m: `Coulomb coupling is ${sign}. q·Q = ${(body.charge*Q).toFixed(2)}.` });
    }
    if (lines.length === 0) lines.push({ t: 'good', m: 'Stable bound orbit. Geodesic remains well outside critical surfaces.' });
  }
  return (
    <div style={{display:'flex', flexDirection:'column', gap:7}}>
      {lines.map((l, i) => (
        <div key={i} style={{
          fontFamily: 'var(--sans)', fontSize: 11, lineHeight: 1.45,
          color: l.t === 'critical' ? 'var(--warn)' :
                 l.t === 'warn' ? 'var(--amber)' :
                 l.t === 'good' ? 'var(--cyan)' : 'var(--fg-1)',
          borderLeft: '2px solid',
          borderColor: l.t === 'critical' ? 'var(--warn)' :
                       l.t === 'warn' ? 'var(--amber-dim)' :
                       l.t === 'good' ? 'var(--cyan-dim)' : 'var(--line)',
          paddingLeft: 9,
        }}>{l.m}</div>
      ))}
    </div>
  );
}

// ---------- Editable per-body parameters ----------
function ObjectParams({ sim, body, force }) {
  const locked = body.state !== 'orbit';
  const lockReason = {
    captured: 'absorbed by black hole — register frozen',
    spaghettified: 'tidally disrupted — worldline terminated',
    escaped: 'unbound — left detector envelope',
  }[body.state];
  const set = (k) => (v) => { body[k] = v; force(); };

  return (
    <div className="section">
      <div className="section-head">
        <h3>Object Parameters</h3>
        <span className="idx">§06b{locked ? ' · LOCKED' : ''}</span>
      </div>
      {locked && (
        <div className="lock-banner">
          <span className="lock-glyph">◆</span>
          <span>{lockReason}</span>
        </div>
      )}
      <Param sym="R" name="Body radius" val={body.radius || 0} unit="M"
             min={0.02} max={1.2} step={0.01}
             fmt={(v) => v.toFixed(2)} onChange={set('radius')}
             locked={locked} lockHint={lockReason}
             scaleLabels={["probe", "planet", "giant"]} />
      <Param sym="E_b" name="Binding strength" val={body.binding || 1} unit="τ"
             min={0.1} max={25} step={0.1}
             color="cyan"
             fmt={(v) => v.toFixed(2)} onChange={set('binding')}
             locked={locked} lockHint={lockReason}
             scaleLabels={["fragile", "rocky", "degenerate"]} />
      <Param sym="q" name="Test charge" val={body.charge || 0} unit="e"
             min={-1.5} max={1.5} step={0.05}
             color="magenta"
             fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)} onChange={set('charge')}
             locked={locked} lockHint={lockReason}
             scaleLabels={["−", "neutral", "+"]} />
      <div className="obj-meta">
        <span>kind <b>{body.kind.toUpperCase()}</b></span>
        <span>state <b className={`st-tag ${body.state}`}>{stateLabel(body.state)}</b></span>
      </div>
    </div>
  );
}

// ---------- Full-physics-engine diagnostic panels ----------

function fmtNum(v, digits = 3) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)) return v.toExponential(2);
  return v.toFixed(digits);
}

function SpacetimeDiagnostics({ sim }) {
  const KNFull = window.KNFull;
  const { M, Q, a, B = 0 } = sim.params;
  const type = sim.params.type || 'bh';

  // Re-evaluate when (M,Q,a,B) change — values themselves are cached inside the bridge.
  const geom  = useMemoR(() => KNFull.geometry(sim.params),
                          [KNFull, M, Q, a, B]);
  const orbit = useMemoR(() => KNFull.orbitDiagnostics(sim.params),
                          [KNFull, M, Q, a, B]);

  // Reduced accretion-rate proxy: capture events per recent log window.
  const recentCaptures = sim.events ? sim.events.filter(
    (e) => e.type === 'warn' && /captured|crossed|impacted/i.test(e.msg)
  ).length : 0;
  const accProxy = Math.min(1.2, recentCaptures * 0.04);
  const jet = useMemoR(() => KNFull.jetPower(sim.params, accProxy),
                       [KNFull, M, Q, a, B, accProxy]);

  const horizons = geom.horizons;
  const naked = horizons.naked || type !== 'bh';

  return (
    <div className="section">
      <div className="section-head">
        <h3>Spacetime · Full Engine</h3>
        <span className="idx">§04b</span>
      </div>
      <div className="telem">
        <div className="item"><span className="k">r₊ · r₋</span>
          <span className="v">{naked ? '—' : `${fmtNum(horizons.rPlus, 3)} · ${fmtNum(horizons.rMinus, 3)}`}<small>M</small></span></div>
        <div className="item"><span className="k">Static limit (eq · pole)</span>
          <span className="v">{fmtNum(geom.staticLimitEquator, 3)} · {fmtNum(geom.staticLimitPole, 3)}<small>M</small></span></div>
        <div className="item"><span className="k">Ω_H · κ</span>
          <span className="v">{naked ? '—' : `${fmtNum(geom.horizonAngularVelocity, 4)} · ${fmtNum(geom.surfaceGravity, 4)}`}</span></div>
        <div className="item"><span className="k">A_H · Φ_H</span>
          <span className="v">{naked ? '—' : `${fmtNum(geom.horizonArea, 2)} · ${fmtNum(geom.horizonElectricPotential, 4)}`}</span></div>
        <div className="item"><span className="k">ISCO pro · retro</span>
          <span className="v">{fmtNum(orbit.isco?.prograde?.rISCO, 3)} · {fmtNum(orbit.isco?.retrograde?.rISCO, 3)}<small>M</small></span></div>
        <div className="item"><span className="k">Photon pro · retro</span>
          <span className="v">{fmtNum(orbit.photonOrbit?.prograde?.rPhoton, 3)} · {fmtNum(orbit.photonOrbit?.retrograde?.rPhoton, 3)}<small>M</small></span></div>
        {jet && jet.valid && (
          <>
            <div className="item"><span className="k">BZ jet power</span>
              <span className="v" style={{color:'var(--magenta)'}}>{fmtNum(jet.bzPower, 4)}</span></div>
            <div className="item"><span className="k">Γ · 2θ_open</span>
              <span className="v">{fmtNum(jet.lorentzFactor, 2)} · {fmtNum(jet.openingAngleDeg, 1)}<small>°</small></span></div>
          </>
        )}
      </div>
      <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-3)', letterSpacing:'0.06em', marginTop:6, lineHeight:1.5}}>
        Solved against the Kerr-Newman metric directly. ISCO/photon orbits use numerical root-finding on the Hamiltonian.
      </div>
    </div>
  );
}

function FullEngineDetail({ sim, body }) {
  const KNFull = window.KNFull;
  if (body.state !== 'orbit') return null;

  const r = Math.hypot(body.x, body.y);
  const region = useMemoR(
    () => KNFull.regionAt(sim.params, body.x, body.y),
    [KNFull, sim.params.M, sim.params.Q, sim.params.a, body.x, body.y]
  );

  // Tidal tensor is expensive (numerical Riemann tensor) — throttle to ~4 Hz.
  const tidal = useThrottledFull(
    () => KNFull.tidalDiagnostics(sim.params, body.x, body.y, {
      radius: body.radius, binding: body.binding,
    }),
    [KNFull, sim.params.M, sim.params.Q, sim.params.a, body.x, body.y, body.radius, body.binding],
    240
  );

  // Energy / L_z of the circular orbit *at this radius* — answers "what would
  // it cost to circularize here?" without integrating the body's actual orbit.
  const circ = useMemoR(
    () => r > 1 ? KNFull.circularOrbit(sim.params, r, {
      prograde: (body.x * body.vy - body.y * body.vx) > 0,
      chargeToMass: body.charge ?? 0,
    }) : null,
    [KNFull, sim.params.M, sim.params.Q, sim.params.a, r, body.vx, body.vy, body.charge]
  );

  const survivalColor = tidal?.survival === 'disrupted' ? 'var(--warn)' :
                        tidal?.survival === 'stressed'  ? 'var(--amber)' :
                        'var(--cyan)';

  return (
    <div className="section">
      <div className="section-head">
        <h3>Full-Engine Detail — {body.name}</h3>
        <span className="idx">§08b</span>
      </div>
      <div className="telem">
        <div className="item">
          <span className="k">Region (KN classifier)</span>
          <span className={`v ${region?.insideErgosphere || region?.insideHorizon ? 'warn' : ''}`}>
            {region?.insideHorizon ? 'INSIDE r₊' :
             region?.insideErgosphere ? 'ERGOSPHERE' :
             region ? 'EXTERIOR' : '—'}
          </span>
        </div>
        <div className="item"><span className="k">Δ to r₊ · static limit</span>
          <span className="v">{fmtNum(region?.horizonMargin, 3)} · {fmtNum(region?.staticLimitMargin, 3)}<small>M</small></span></div>
        {tidal && !tidal.error && (
          <>
            <div className="item">
              <span className="k">Tidal eigenvalues</span>
              <span className="v" style={{fontSize:9}}>
                {tidal.eigenvalues.map((e) => fmtNum(e, 4)).join(' · ')}
              </span>
            </div>
            <div className="item"><span className="k">Spectral radius |E|</span>
              <span className="v">{fmtNum(tidal.spectralRadius, 4)}</span></div>
            <div className="item"><span className="k">Δa across body</span>
              <span className="v">{fmtNum(tidal.differentialAcceleration, 4)}</span></div>
            <div className="item"><span className="k">Normalised stress</span>
              <span className="v" style={{color: survivalColor}}>{fmtNum(tidal.normalizedStress, 3)}×</span></div>
            <div className="item"><span className="k">Survival</span>
              <span className="v" style={{color: survivalColor}}>{tidal.survival.toUpperCase()}</span></div>
          </>
        )}
        {circ && !circ.error && Number.isFinite(circ.energy) && (
          <>
            <div className="item"><span className="k">Circ. E / m at r</span>
              <span className="v">{fmtNum(circ.energy, 4)}</span></div>
            <div className="item"><span className="k">Circ. L_z / m at r</span>
              <span className="v">{fmtNum(circ.angularMomentumZ, 4)}</span></div>
            <div className="item"><span className="k">Stability ∂²H/∂r²</span>
              <span className="v" style={{color: circ.stable ? 'var(--cyan)' : 'var(--warn)'}}>
                {fmtNum(circ.radialSecondDerivative, 4)} {circ.stable ? '✓' : '✗'}
              </span></div>
          </>
        )}
      </div>
      <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-3)', letterSpacing:'0.06em', marginTop:6, lineHeight:1.5}}>
        Electric Riemann projected into the local ZAMO tetrad. Survival labels: comfortable &lt; 0.5 ≤ stressed &lt; 1 ≤ disrupted.
      </div>
    </div>
  );
}

function burnProgrde(body, dv, sim) {
  const v = Math.hypot(body.vx, body.vy) || 1;
  body.vx += (body.vx / v) * dv;
  body.vy += (body.vy / v) * dv;
  window.KNSim.logEv(sim, 'amber', `${body.name} — Δv ${(dv>=0?'+':'')+dv.toFixed(2)}c burn applied`);
}

function glyphFor(kind) {
  return { planet: '●', gas: '◉', star: '✱', ship: '▶', probe: '▪' }[kind] || '•';
}
function stateLabel(s) {
  return { orbit: 'TRACK', captured: 'CONSUMED', spaghettified: 'DISRUPTED', escaped: 'UNBOUND' }[s];
}

const btnStyle = {
  background:'var(--bg-0)', border:'1px solid var(--line)', color:'var(--cyan)',
  fontFamily:'var(--mono)', fontSize:10, padding:'6px 8px', cursor:'pointer',
  letterSpacing:'0.06em', flex:1,
};

window.RightPanel = RightPanel;
