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
        <span className="k">{tr('Tidal stress / binding', '潮汐應力 / 束縛')}</span>
        <span className="v">{stress.toFixed(2)}× <small style={{color:'var(--fg-3)', marginLeft:6}}>{tr('peak', '峰值')} {peak.toFixed(2)}×</small></span>
      </div>
      <div className="bar">
        <div className="fill" style={{ width: pct + '%' }} />
        <div className="yellow-line" />
        <div className="red-line" />
      </div>
      <div className="note">{tr('spaghettification at ≈ 1.15×', '≈ 1.15× 處發生拉麵化')}</div>
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
          <h3>{tr('Object Roster', '天體清單')}</h3>
          <span className="idx">§05 · {sim.bodies.length}</span>
        </div>
        <div className="obj-pick">
          {sim.bodies.length === 0 && (
            <div style={{padding:'14px 12px', fontSize:11, color:'var(--fg-3)', fontFamily:'var(--mono)', letterSpacing:'0.06em'}}>
              {tr('Drop bodies from the library below to begin.', '從下方天體庫拖入天體開始。')}
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
              <h3>{tr('Telemetry', '遙測')} — {sel.name}</h3>
              <span className="idx">§06</span>
            </div>
            <Telemetry sim={sim} body={sel} />
          </div>

          <ObjectParams sim={sim} body={sel} force={force} />

          <div className="section">
            <div className="section-head">
              <h3>{tr('Tidal Field', '潮汐場')}</h3>
              <span className="idx">§07</span>
            </div>
            <StressBar stress={sel.stress} peak={sel.stressPeak} />
          </div>

          <div className="section">
            <div className="section-head">
              <h3>{tr('Diagnosis', '診斷')}</h3>
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
                <h3>{tr('Δv Burn — Prograde', 'Δv 點火 — 順行')}</h3>
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
                {tr('Apply impulse along current velocity vector. Negative = retrograde.', '沿目前速度向量施加脈衝。負值 = 逆行。')}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="section">
          <div className="empty">
            <div className="ic">— · —</div>
            <div className="ms">
              {tr('Select an object from the roster, or click any body in the viewport to inspect its worldline.', '從清單選取天體，或點擊視圖中任一天體以檢視其世界線。')}
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
      <div className="item"><span className="k">{tr('Radial distance r', '徑向距離 r')}</span>
        <span className="v">{r.toFixed(3)}<small>M</small></span></div>
      <div className="item"><span className="k">r / r₊</span>
        <span className={`v`}>{(rplus > 0 ? r / rplus : 0).toFixed(2)}</span></div>
      <div className="item"><span className="k">{tr('Speed |v|', '速率 |v|')}</span>
        <span className={`v`}>{v.toFixed(3)}<small>c</small></span></div>
      <div className={`item ${L > 0 ? 'good' : ''}`}><span className="k">L · M⁻¹</span>
        <span className="v">{L.toFixed(3)}</span></div>
      <div className="item"><span className="k">{tr('E spec.', 'E 比能')}</span>
        <span className="v">{E.toFixed(3)}</span></div>
      <div className={`item ${insideErgo ? 'warn' : ''}`}><span className="k">{tr('Region', '區域')}</span>
        <span className="v">{regionLabel(r, rplus, rErg, rIsco)}</span></div>
      <div className="item"><span className="k">{tr('Worldline span', '世界線長度')}</span>
        <span className="v">{(body.trail.length / 2).toFixed(0)}<small>{tr('samples', '取樣')}</small></span></div>
    </div>
  );
}

function regionLabel(r, rplus, rErg, rIsco) {
  if (r < rplus) return tr('INSIDE r₊', 'r₊ 之內');
  if (!isNaN(rErg) && r < rErg) return tr('ERGOSPHERE', '動圈');
  if (r < rIsco) return tr('BELOW ISCO', 'ISCO 以下');
  if (r < rIsco * 2.5) return tr('STRONG-FIELD', '強場');
  return tr('WEAK-FIELD', '弱場');
}

function Diagnosis({ sim, body, rplus }) {
  const phys = window.KNphysics;
  const r = Math.hypot(body.x, body.y);
  const { M, Q, a } = sim.params;
  const rErg = phys.ergosphereEq(M, Q);
  const rIsco = phys.isco(M, a);
  const lines = [];
  if (body.state === 'captured') lines.push({ t: 'critical', m: tr('Crossed event horizon — added to BH mass register.', '越過事件視界 — 已計入黑洞質量。') });
  if (body.state === 'spaghettified') lines.push({ t: 'critical', m: tr('Disrupted by tidal field. Material dispersed into accretion stream.', '被潮汐場撕裂。物質散入吸積流。') });
  if (body.state === 'escaped') lines.push({ t: 'note', m: tr('Worldline left detector envelope. Effectively unbound.', '世界線離開偵測範圍。實質上未束縛。') });
  if (body.state === 'orbit') {
    if (r < rplus * 1.2) lines.push({ t: 'critical', m: tr('Imminent horizon crossing. No stable orbits exist here.', '即將越過視界。此處不存在穩定軌道。') });
    else if (r < rIsco) lines.push({ t: 'warn', m: tr('Below ISCO — orbit is unstable, infall expected.', '低於 ISCO — 軌道不穩定，預期墜落。') });
    else if (!isNaN(rErg) && r < rErg) lines.push({ t: 'warn', m: tr('Inside ergosphere. Any timelike observer is forced to co-rotate with the BH (frame dragging).', '位於動圈內。任何類時觀者都被迫與黑洞共轉（參考系拖曳）。') });
    if (body.stress > 0.5) lines.push({ t: 'warn', m: tr('Tidal stress approaching binding threshold. Structural integrity dropping.', '潮汐應力逼近束縛閾值。結構完整性下降中。') });
    if (body.kind === 'ship' && Math.abs(a) > 0.5 && r < rIsco * 1.4) {
      lines.push({ t: 'good', m: tr('Conditions suitable for Penrose process — retrograde burn inside ergosphere extracts rotational energy.', '條件適合 Penrose 過程 — 在動圈內逆行點火可萃取自旋能。') });
    }
    if (body.charge && Math.abs(Q) > 0.05) {
      const sign = body.charge * Q > 0 ? tr('repulsive', '排斥') : tr('attractive', '吸引');
      lines.push({ t: 'note', m: trp('Coulomb coupling is {sign}. q·Q = {qQ}.', { sign, qQ: (body.charge*Q).toFixed(2) }) });
    }
    if (lines.length === 0) lines.push({ t: 'good', m: tr('Stable bound orbit. Geodesic remains well outside critical surfaces.', '穩定束縛軌道。測地線遠在臨界面之外。') });
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
    captured: tr('absorbed by black hole — register frozen', '已被黑洞吸收 — 紀錄凍結'),
    spaghettified: tr('tidally disrupted — worldline terminated', '已被潮汐撕裂 — 世界線終止'),
    escaped: tr('unbound — left detector envelope', '未束縛 — 已離開偵測範圍'),
  }[body.state];
  const set = (k) => (v) => { body[k] = v; force(); };

  return (
    <div className="section">
      <div className="section-head">
        <h3>{tr('Object Parameters', '天體參數')}</h3>
        <span className="idx">§06b{locked ? ' · ' + tr('LOCKED', '已鎖定') : ''}</span>
      </div>
      {locked && (
        <div className="lock-banner">
          <span className="lock-glyph">◆</span>
          <span>{lockReason}</span>
        </div>
      )}
      <Param sym="R" name={tr('Body radius', '天體半徑')} val={body.radius || 0} unit="M"
             min={0.02} max={1.2} step={0.01}
             fmt={(v) => v.toFixed(2)} onChange={set('radius')}
             locked={locked} lockHint={lockReason}
             scaleLabels={[tr("probe", "探測器"), tr("planet", "行星"), tr("giant", "巨行星")]} />
      <Param sym="E_b" name={tr('Binding strength', '束縛強度')} val={body.binding || 1} unit="τ"
             min={0.1} max={25} step={0.1}
             color="cyan"
             fmt={(v) => v.toFixed(2)} onChange={set('binding')}
             locked={locked} lockHint={lockReason}
             scaleLabels={[tr("fragile", "脆弱"), tr("rocky", "岩質"), tr("degenerate", "簡併")]} />
      <Param sym="q" name={tr('Test charge', '測試電荷')} val={body.charge || 0} unit="e"
             min={-1.5} max={1.5} step={0.05}
             color="magenta"
             fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)} onChange={set('charge')}
             locked={locked} lockHint={lockReason}
             scaleLabels={["−", tr("neutral", "中性"), "+"]} />
      <div className="obj-meta">
        <span>{tr('kind', '種類')} <b>{body.kind.toUpperCase()}</b></span>
        <span>{tr('state', '狀態')} <b className={`st-tag ${body.state}`}>{stateLabel(body.state)}</b></span>
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
        <h3>{tr('Spacetime · Full Engine', '時空 · 完整引擎')}</h3>
        <span className="idx">§04b</span>
      </div>
      <div className="telem">
        <div className="item"><span className="k">r₊ · r₋</span>
          <span className="v">{naked ? '—' : `${fmtNum(horizons.rPlus, 3)} · ${fmtNum(horizons.rMinus, 3)}`}<small>M</small></span></div>
        <div className="item"><span className="k">{tr('Static limit (eq · pole)', '靜止極限（赤道 · 極）')}</span>
          <span className="v">{fmtNum(geom.staticLimitEquator, 3)} · {fmtNum(geom.staticLimitPole, 3)}<small>M</small></span></div>
        <div className="item"><span className="k">Ω_H · κ</span>
          <span className="v">{naked ? '—' : `${fmtNum(geom.horizonAngularVelocity, 4)} · ${fmtNum(geom.surfaceGravity, 4)}`}</span></div>
        <div className="item"><span className="k">A_H · Φ_H</span>
          <span className="v">{naked ? '—' : `${fmtNum(geom.horizonArea, 2)} · ${fmtNum(geom.horizonElectricPotential, 4)}`}</span></div>
        <div className="item"><span className="k">{tr('ISCO pro · retro', 'ISCO 順 · 逆')}</span>
          <span className="v">{fmtNum(orbit.isco?.prograde?.rISCO, 3)} · {fmtNum(orbit.isco?.retrograde?.rISCO, 3)}<small>M</small></span></div>
        <div className="item"><span className="k">{tr('Photon pro · retro', '光子 順 · 逆')}</span>
          <span className="v">{fmtNum(orbit.photonOrbit?.prograde?.rPhoton, 3)} · {fmtNum(orbit.photonOrbit?.retrograde?.rPhoton, 3)}<small>M</small></span></div>
        {jet && jet.valid && (
          <>
            <div className="item"><span className="k">{tr('BZ jet power', 'BZ 噴流功率')}</span>
              <span className="v" style={{color:'var(--magenta)'}}>{fmtNum(jet.bzPower, 4)}</span></div>
            <div className="item"><span className="k">Γ · 2θ_open</span>
              <span className="v">{fmtNum(jet.lorentzFactor, 2)} · {fmtNum(jet.openingAngleDeg, 1)}<small>°</small></span></div>
          </>
        )}
      </div>
      <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-3)', letterSpacing:'0.06em', marginTop:6, lineHeight:1.5}}>
        {tr('Solved against the Kerr-Newman metric directly. ISCO/photon orbits use numerical root-finding on the Hamiltonian.', '直接對 Kerr-Newman 度規求解。ISCO／光子軌道以 Hamiltonian 數值求根計算。')}
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
        <h3>{tr('Full-Engine Detail', '完整引擎細節')} — {body.name}</h3>
        <span className="idx">§08b</span>
      </div>
      <div className="telem">
        <div className="item">
          <span className="k">{tr('Region (KN classifier)', '區域（KN 分類器）')}</span>
          <span className={`v ${region?.insideErgosphere || region?.insideHorizon ? 'warn' : ''}`}>
            {region?.insideHorizon ? tr('INSIDE r₊', 'r₊ 之內') :
             region?.insideErgosphere ? tr('ERGOSPHERE', '動圈') :
             region ? tr('EXTERIOR', '外部') : '—'}
          </span>
        </div>
        <div className="item"><span className="k">{tr('Δ to r₊ · static limit', '至 r₊ · 靜止極限的 Δ')}</span>
          <span className="v">{fmtNum(region?.horizonMargin, 3)} · {fmtNum(region?.staticLimitMargin, 3)}<small>M</small></span></div>
        {tidal && !tidal.error && (
          <>
            <div className="item">
              <span className="k">{tr('Tidal eigenvalues', '潮汐本徵值')}</span>
              <span className="v" style={{fontSize:9}}>
                {tidal.eigenvalues.map((e) => fmtNum(e, 4)).join(' · ')}
              </span>
            </div>
            <div className="item"><span className="k">{tr('Spectral radius |E|', '譜半徑 |E|')}</span>
              <span className="v">{fmtNum(tidal.spectralRadius, 4)}</span></div>
            <div className="item"><span className="k">{tr('Δa across body', '橫跨天體的 Δa')}</span>
              <span className="v">{fmtNum(tidal.differentialAcceleration, 4)}</span></div>
            <div className="item"><span className="k">{tr('Normalised stress', '正規化應力')}</span>
              <span className="v" style={{color: survivalColor}}>{fmtNum(tidal.normalizedStress, 3)}×</span></div>
            <div className="item"><span className="k">{tr('Survival', '存續')}</span>
              <span className="v" style={{color: survivalColor}}>{survivalLabel(tidal.survival)}</span></div>
          </>
        )}
        {circ && !circ.error && Number.isFinite(circ.energy) && (
          <>
            <div className="item"><span className="k">{tr('Circ. E / m at r', 'r 處圓軌 E / m')}</span>
              <span className="v">{fmtNum(circ.energy, 4)}</span></div>
            <div className="item"><span className="k">{tr('Circ. L_z / m at r', 'r 處圓軌 L_z / m')}</span>
              <span className="v">{fmtNum(circ.angularMomentumZ, 4)}</span></div>
            <div className="item"><span className="k">{tr('Stability ∂²H/∂r²', '穩定性 ∂²H/∂r²')}</span>
              <span className="v" style={{color: circ.stable ? 'var(--cyan)' : 'var(--warn)'}}>
                {fmtNum(circ.radialSecondDerivative, 4)} {circ.stable ? '✓' : '✗'}
              </span></div>
          </>
        )}
      </div>
      <div style={{fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-3)', letterSpacing:'0.06em', marginTop:6, lineHeight:1.5}}>
        {tr('Electric Riemann projected into the local ZAMO tetrad. Survival labels: comfortable < 0.5 ≤ stressed < 1 ≤ disrupted.', '電性 Riemann 投影至局部 ZAMO 標架。存續標籤：comfortable < 0.5 ≤ stressed < 1 ≤ disrupted。')}
      </div>
    </div>
  );
}

function burnProgrde(body, dv, sim) {
  const v = Math.hypot(body.vx, body.vy) || 1;
  body.vx += (body.vx / v) * dv;
  body.vy += (body.vy / v) * dv;
  window.KNSim.logEv(sim, 'amber', trp('{name} — Δv {dv}c burn applied', { name: body.name, dv: (dv>=0?'+':'')+dv.toFixed(2) }));
}

function glyphFor(kind) {
  return { planet: '●', gas: '◉', star: '✱', ship: '▶', probe: '▪' }[kind] || '•';
}
function stateLabel(s) {
  return tr(
    { orbit: 'TRACK', captured: 'CONSUMED', spaghettified: 'DISRUPTED', escaped: 'UNBOUND' }[s],
    { orbit: '追蹤', captured: '已吞噬', spaghettified: '已撕裂', escaped: '未束縛' }[s]);
}
function survivalLabel(s) {
  return tr(
    (s || '').toUpperCase(),
    { comfortable: '安全', stressed: '受壓', disrupted: '撕裂' }[s] || (s || '').toUpperCase());
}

const btnStyle = {
  background:'var(--bg-0)', border:'1px solid var(--line)', color:'var(--cyan)',
  fontFamily:'var(--mono)', fontSize:10, padding:'6px 8px', cursor:'pointer',
  letterSpacing:'0.06em', flex:1,
};

window.RightPanel = RightPanel;
