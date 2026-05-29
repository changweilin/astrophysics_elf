/* Left & right side panels + bottom strip components. */

const { useState, useEffect, useRef, useMemo } = React;

// ---------- Click-to-type editor for a clamped numeric value ----------
function ValEditor({ val, min, max, step, fmt, onChange, disabled, klass }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [flash, setFlash] = useState(null); // 'clamp' | 'bad' | null
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function start() {
    if (disabled) return;
    // Show a raw, edit-friendly number (avoid scientific noise where possible)
    const raw = Math.abs(val) >= 1000 || (Math.abs(val) > 0 && Math.abs(val) < 0.001)
      ? val.toString()
      : (+val.toFixed(6)).toString();
    setDraft(raw);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === '' || isNaN(parseFloat(trimmed))) {
      setFlash('bad');
      setTimeout(() => setFlash(null), 700);
      setEditing(false);
      return;
    }
    let v = parseFloat(trimmed);
    let didClamp = false;
    if (v < min) { v = min; didClamp = true; }
    if (v > max) { v = max; didClamp = true; }
    // Snap to step grid for cleaner state
    if (step && step > 0) {
      v = Math.round(v / step) * step;
      // fix fp dust
      const digits = Math.max(0, -Math.floor(Math.log10(step)));
      v = +v.toFixed(Math.min(10, digits + 2));
    }
    onChange(v);
    if (didClamp) {
      setFlash('clamp');
      setTimeout(() => setFlash(null), 900);
    }
    setEditing(false);
  }

  function cancel() { setEditing(false); }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={`val val-edit ${klass || ''}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
      />
    );
  }
  return (
    <span
      className={`val val-click ${flash ? 'flash-' + flash : ''} ${disabled ? 'disabled' : ''} ${klass || ''}`}
      onClick={start}
      title={disabled ? '' : `click to type · range [${min}, ${max}]`}
    >
      {fmt ? fmt(val) : val.toFixed(2)}
    </span>
  );
}

// ---------- Slider with header ----------
function Param({ sym, name, val, unit, min, max, step, onChange, fmt, color, scaleLabels, locked, lockHint }) {
  return (
    <div className={`param ${color || ''} ${locked ? 'locked' : ''}`}>
      <div className="row">
        <div className="lbl">
          <span className="sym">{sym}</span>
          <span className="name">{name}</span>
          {locked && <span className="lock-tag" title={lockHint || ''}>◆ LOCKED</span>}
        </div>
        <div className="val-cell">
          <ValEditor val={val} min={min} max={max} step={step} fmt={fmt}
                     onChange={onChange} disabled={!!locked} />
          {unit && <span className="unit">{unit}</span>}
        </div>
      </div>
      <div className="slider">
        <input type="range" min={min} max={max} step={step} value={val}
               disabled={!!locked}
               onChange={(e) => onChange(parseFloat(e.target.value))} />
      </div>
      <div className="scale">
        {scaleLabels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

// ---------- Body editor (shared by Central Body and Binary Companion tabs) ----------
function BodyEditor({ sim, force, role }) {
  // role: 'central' | 'companion'
  const phys = window.KNphysics;
  const bin = sim.binary;
  const isCentral = role === 'central';

  const accessors = isCentral ? {
    type: sim.params.type || 'bh',
    M: sim.params.M, Q: sim.params.Q, a: sim.params.a,
    R_star: sim.params.R_star || 3.0, T_eff: sim.params.T_eff || 1e6,
    massUnit: 'M⊙×10⁶', mMin: 0.3, mMax: 3.5,
  } : {
    type: (bin && bin.type) || 'bh',
    M: (bin && bin.M2) || 0.8, Q: (bin && bin.Q2) || 0, a: (bin && bin.a2) || 0,
    R_star: (bin && bin.R_star2) || 3.0, T_eff: (bin && bin.T_eff2) || 1e6,
    massUnit: 'M', mMin: 0.1, mMax: 3.5,
  };

  const isBH = accessors.type === 'bh';
  const collapseHint = !isBH && phys.wouldCollapse(accessors.M, accessors.Q, accessors.a, accessors.R_star);
  const bhLockReason = `${isCentral ? '主天體' : '伴星'}為黑洞 — 視界內無星體表面參數`;

  function setField(k, v) {
    if (isCentral) {
      if (k === 'M' || k === 'Q' || k === 'a') sim.params[k] = v;
      else if (k === 'R_star') { sim.params.R_star = v; sim.params._stellarTouched = true; }
      else if (k === 'T_eff') { sim.params.T_eff = v; sim.params._stellarTouched = true; }
    } else if (bin) {
      const m = { M: 'M2', Q: 'Q2', a: 'a2', R_star: 'R_star2', T_eff: 'T_eff2' };
      bin[m[k]] = v;
      if (k === 'R_star' || k === 'T_eff') bin._stellarTouched = true;
    }
    force();
  }

  function switchType(newType) {
    const oldType = accessors.type;
    if (isCentral) {
      sim.params.type = newType;
      if (newType !== 'bh') {
        const d = phys.STELLAR_DEFAULTS[newType];
        if (!sim.params._stellarTouched || oldType !== newType) {
          sim.params.R_star = d.R; sim.params.T_eff = d.T;
        }
        if (Math.abs(sim.params.a) > sim.params.M) sim.params.a = Math.sign(sim.params.a) * sim.params.M * 0.5;
        if (Math.abs(sim.params.Q) > sim.params.M) sim.params.Q = Math.sign(sim.params.Q) * sim.params.M * 0.5;
        window.KNSim.logEv(sim, 'good', `central → ${phys.STELLAR_INFO[newType].name}`);
      } else {
        window.KNSim.logEv(sim, 'warn', `central → BLACK HOLE · stellar params locked`);
      }
    } else if (bin) {
      bin.type = newType;
      if (newType !== 'bh') {
        const d = phys.STELLAR_DEFAULTS[newType];
        if (!bin._stellarTouched || oldType !== newType) {
          bin.R_star2 = d.R; bin.T_eff2 = d.T;
        }
        if (Math.abs(bin.a2) > bin.M2) bin.a2 = Math.sign(bin.a2 || 1) * bin.M2 * 0.5;
        if (Math.abs(bin.Q2) > bin.M2) bin.Q2 = Math.sign(bin.Q2 || 1) * bin.M2 * 0.5;
        window.KNSim.logEv(sim, 'good', `companion → ${phys.STELLAR_INFO[newType].name}`);
      } else {
        window.KNSim.logEv(sim, 'warn', `companion → BLACK HOLE`);
      }
    }
    force();
  }

  return (
    <>
      <div className="type-pick" role="tablist">
        {[
          { k: 'bh', label: 'Black Hole', glyph: '●' },
          { k: 'ns', label: 'Neutron',    glyph: '◉' },
          { k: 'wd', label: 'White Dwarf',glyph: '◐' },
          { k: 'ms', label: 'Star',       glyph: '✱' },
        ].map((t) => (
          <button key={t.k}
            className={`type-tab ${accessors.type === t.k ? 'on' : ''}`}
            onClick={() => switchType(t.k)}>
            <span className="g">{t.glyph}</span>
            <span className="l">{t.label}</span>
          </button>
        ))}
      </div>

      <Param sym={isCentral ? 'M' : 'M₂'} name="Mass" val={accessors.M} unit={accessors.massUnit}
             min={accessors.mMin} max={accessors.mMax} step={0.05}
             fmt={(v) => v.toFixed(2)} onChange={(v) => setField('M', v)}
             scaleLabels={[accessors.mMin.toString(), 'stellar', accessors.mMax.toString()]} />
      <Param sym={isCentral ? 'Q' : 'Q₂'} name="Charge" val={accessors.Q} unit="√(M)"
             min={-1.5} max={1.5} step={0.01}
             color="magenta" fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)}
             onChange={(v) => setField('Q', v)}
             scaleLabels={['−|Q|', 'neutral', '+|Q|']} />
      <Param sym={isCentral ? 'a' : 'a₂'} name="Spin (J/Mc)" val={accessors.a} unit="M"
             min={-1.4} max={1.4} step={0.01}
             color="cyan" fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)}
             onChange={(v) => setField('a', v)}
             scaleLabels={['retro', 'non-rot', 'prograde']} />

      <div className="stellar-sub">
        <div className="sub-head">
          <span>Surface state</span>
          <span className="hint">{isBH ? 'sealed under r₊' : (collapseHint ? '◆ R★ ≤ r₊ · will collapse' : 'visible photosphere')}</span>
        </div>
        <Param sym={isCentral ? 'R★' : 'R★₂'} name="Surface radius" val={accessors.R_star} unit="M"
               min={1.5} max={32} step={0.1}
               fmt={(v) => v.toFixed(2)} onChange={(v) => setField('R_star', v)}
               locked={isBH} lockHint={bhLockReason}
               scaleLabels={['compact', 'WD', 'stellar']} />
        <Param sym={isCentral ? 'T★' : 'T★₂'} name="Photosphere T" val={accessors.T_eff} unit="K"
               min={2500} max={5e6} step={50}
               color="cyan"
               fmt={(v) => v >= 1e5 ? (v/1e6).toFixed(2) + '×10⁶' : Math.round(v).toLocaleString()}
               onChange={(v) => setField('T_eff', v)}
               locked={isBH} lockHint={bhLockReason}
               scaleLabels={['red', 'G/sun', 'X-ray']} />
      </div>
    </>
  );
}

// ---------- Left panel ----------
function LeftPanel({ sim, force }) {
  const [activeBody, setActiveBody] = useState('central');
  const p = sim.params;
  const phys = window.KNphysics;
  const bin = sim.binary;
  const type = p.type || 'bh';
  const isBH = type === 'bh';
  const cls = phys.classify(p.M, p.Q, p.a, type);
  const { rplus, rminus, naked } = phys.horizons(p.M, p.Q, p.a);
  const rErg = phys.ergosphereEq(p.M, p.Q);
  const rIsco = naked ? NaN : phys.isco(p.M, p.a);
  const rPh = phys.photonSphereEq(p.M, p.a);
  const aN = p.a / p.M;
  const qN = p.Q / p.M;
  const ext = (aN * aN + qN * qN).toFixed(3);
  const collapseHint = !isBH && phys.wouldCollapse(p.M, p.Q, p.a, p.R_star);

  const companionPlacing = sim.placement && sim.placement.item && sim.placement.item.isCompanion;
  const companionAiming  = sim.aiming && sim.aiming.kind === 'companion';
  const companionArmed   = companionPlacing || companionAiming;

  function activateCompanionTab() {
    setActiveBody('companion');
    if (!bin) return;
    if (bin.enabled) return;
    if (companionArmed) return;
    const sType = bin.type || 'bh';
    sim.placement = null; sim.aiming = null;
    sim.placement = {
      item: { isCompanion: true, kind: 'companion', name: 'Companion ' + sType.toUpperCase(), radius: 0.4 },
      wx: 0, wy: 0, inCanvas: false,
    };
    window.KNSim.logEv(sim, 'amber', `placing companion (${sType.toUpperCase()})… drop into viewport`);
    force();
  }

  function removeCompanion(e) {
    if (e) e.stopPropagation();
    window.KNSim.removeCompanion(sim);
    sim.aiming = null;
    window.KNSim.logEv(sim, 'amber', 'companion removed');
    force();
  }

  return (
    <div className="panel left">
      <div className="section">
        <div className="section-head">
          <h3>{activeBody === 'central'
            ? `Central Body — ${isBH ? 'Kerr-Newman Solution' : phys.STELLAR_INFO[type].name}`
            : `Binary Companion${bin && bin.enabled ? ` — ${(bin.type === 'bh') ? 'Kerr-Newman' : phys.STELLAR_INFO[bin.type].name}` : ' — Not placed'}`}</h3>
          <span className="idx">§01</span>
        </div>

        <div className="body-tabs" role="tablist">
          <button className={`body-tab ${activeBody === 'central' ? 'on' : ''}`}
            onClick={() => setActiveBody('central')}>
            <span className="g">⦿</span><span className="l">Central Body</span>
          </button>
          <button className={`body-tab companion ${activeBody === 'companion' ? 'on' : ''} ${companionArmed ? 'armed' : ''}`}
            onClick={activateCompanionTab}
            title="同 Central Body 的參數，可拖入視圖放置並拖曳設定 v₀">
            <span className="g">{bin && bin.enabled ? '◐' : '+'}</span>
            <span className="l">{bin && bin.enabled ? `Binary Companion · M₂=${bin.M2.toFixed(2)}` : (companionPlacing ? 'Placing…' : 'Binary Companion')}</span>
            {bin && bin.enabled && activeBody === 'companion' && (
              <span className="companion-x" onClick={removeCompanion} title="remove companion">×</span>
            )}
          </button>
        </div>

        <BodyEditor sim={sim} force={force} role={activeBody} />

        {activeBody === 'companion' && !(bin && bin.enabled) && (
          <div className="lock-banner" style={{marginTop: 10}}>
            <span className="lock-glyph">◆</span>
            <span>{companionPlacing
              ? '在視圖中按下並拖曳釋放 → 設定伴星初始位置與 v₀'
              : '點上方 Binary Companion 頁籤可進入放置模式'}</span>
          </div>
        )}

        {activeBody === 'companion' && bin && bin.enabled && (
          <div className="stellar-sub" style={{marginTop: 6}}>
            <div className="sub-head">
              <span>Dynamics</span>
              <span className="hint">在視圖中按住伴星拖曳 → 重設 v₀</span>
            </div>
            <Param sym="Ṙ" name="GW dissipation rate" val={bin.inspiralRate} unit="×Peters"
                   min={1} max={300} step={1}
                   color="magenta"
                   fmt={(v) => '×' + v.toFixed(0)}
                   onChange={(v) => { bin.inspiralRate = v; force(); }}
                   scaleLabels={['×1', '×60', '×300']} />
          </div>
        )}
      </div>

      <BinaryReadout sim={sim} force={force} />

      <div className="section">
        <div className="section-head">
          <h3>Classification</h3>
          <span className="idx">§03</span>
        </div>
        <div className={`classify ${cls.warn ? 'warn' : ''}`}>
          <span className="pill">{cls.pill}</span>
          <div className="name">{cls.name}</div>
          <div className="desc">{cls.desc}</div>
          <div className="ratios">
            <div><span className="k">|a|/M</span><span className="v">{Math.abs(aN).toFixed(3)}</span></div>
            <div><span className="k">|Q|/M</span><span className="v">{Math.abs(qN).toFixed(3)}</span></div>
            <div><span className="k">a² + Q² (M²)</span><span className="v" style={{ color: ext > 1 ? 'var(--warn)' : 'inherit' }}>{ext}</span></div>
            <div><span className="k">{isBH ? 'extremality' : 'r★/r_s'}</span>
              <span className="v">{isBH ? Math.min(1, Math.sqrt(parseFloat(ext))).toFixed(3) : ((p.R_star || 3) / (2 * p.M)).toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>{isBH ? 'Derived Geometry' : 'Stellar Geometry'}</h3>
          <span className="idx">§04</span>
        </div>
        <div className="derived">
          {isBH ? (<>
            <div className="cell">
              <span className="k">r₊ outer horizon</span>
              <span className="v">{naked ? '—' : rplus.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">r₋ Cauchy</span>
              <span className="v">{naked ? '—' : rminus.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">r ergo (eq.)</span>
              <span className="v">{isNaN(rErg) ? '—' : rErg.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">r photon</span>
              <span className="v">{rPh.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">r ISCO</span>
              <span className="v">{isNaN(rIsco) ? '—' : rIsco.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">drag Ω(r₊)</span>
              <span className="v">{naked ? '—' : (p.a / (rplus * rplus + p.a * p.a)).toFixed(3)}<small>c/M</small></span>
            </div>
          </>) : (<>
            <div className="cell">
              <span className="k">R★ surface</span>
              <span className="v">{(p.R_star || 3).toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">r_s (would-be)</span>
              <span className="v">{(2 * p.M).toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">R★ / r_s</span>
              <span className="v" style={{color: collapseHint ? 'var(--warn)' : 'inherit'}}>
                {((p.R_star || 3) / (2 * p.M)).toFixed(2)}
              </span>
            </div>
            <div className="cell">
              <span className="k">v_esc · c⁻¹</span>
              <span className="v">{Math.min(0.999, Math.sqrt(2 * p.M / Math.max(0.1, p.R_star || 3))).toFixed(3)}</span>
            </div>
            <div className="cell">
              <span className="k">Ω_eq surface</span>
              <span className="v">{(p.a / ((p.R_star || 3) * (p.R_star || 3) + p.a * p.a)).toFixed(3)}<small>c/M</small></span>
            </div>
            <div className="cell">
              <span className="k">T★ photosphere</span>
              <span className="v">{(p.T_eff || 1e6) >= 1e5 ? ((p.T_eff || 1e6)/1e6).toFixed(2) + '×10⁶' : Math.round(p.T_eff || 1e6).toLocaleString()}<small>K</small></span>
            </div>
          </>)}
        </div>
        {collapseHint && (
          <div className="lock-banner" style={{marginTop: 10}}>
            <span className="lock-glyph">◆</span>
            <span>R★ ≤ r₊ · 將塌縮為黑洞 — 切換 BH 頁面以鎖定</span>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Disc & MHD</h3>
          <span className="idx">§05</span>
        </div>
        <button className={`disc-toggle ${sim.disc.enabled ? 'on' : ''}`}
          onClick={() => { sim.disc.enabled = !sim.disc.enabled; force(); }}>
          <span className="dt-dot" />
          {sim.disc.enabled ? 'ACCRETION DISC · active' : 'Spin up accretion disc'}
        </button>
        <Param sym="B" name="Magnetic field" val={p.B} unit="B₀" min={0} max={1} step={0.01}
               color="magenta" fmt={(v) => v.toFixed(2)} onChange={set('B')}
               scaleLabels={["off", "0.5", "magnetar"]} />
        <Param sym="α" name="Viscosity" val={sim.disc.alpha} unit="" min={0} max={0.5} step={0.01}
               color="cyan" fmt={(v) => v.toFixed(2)}
               onChange={(v) => { sim.disc.alpha = v; force(); }}
               scaleLabels={["inviscid", "α=0.25", "thick"]} />
        <Param sym="Ṅ" name="Emission rate" val={sim.disc.emissionRate} unit="/M" min={0} max={20} step={0.5}
               fmt={(v) => v.toFixed(1)}
               onChange={(v) => { sim.disc.emissionRate = v; force(); }}
               scaleLabels={["—", "10/M", "dense"]} />
        <div className="derived" style={{marginTop: 12}}>
          <div className="cell">
            <span className="k">Ṁ accretion</span>
            <span className="v">{sim.disc.mDot.toFixed(2)}<small>/M</small></span>
          </div>
          <div className="cell">
            <span className="k">N particles</span>
            <span className="v">{sim.disc.particles.length}<small>/{sim.disc.maxParticles}</small></span>
          </div>
          <div className="cell">
            <span className="k">MRI active</span>
            <span className="v" style={{color: (p.B > 0.05 && sim.disc.enabled) ? 'var(--cyan)' : 'var(--fg-3)'}}>
              {(p.B > 0.05 && sim.disc.enabled) ? '✓ ON' : '—'}
            </span>
          </div>
          <div className="cell">
            <span className="k">Σ swallowed</span>
            <span className="v">{sim.disc.totalAccreted}</span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Preset Configurations</h3>
          <span className="idx">§06</span>
        </div>
        <div className="obj-pick">
          {PRESETS.map((pr, i) => (
            <button key={i} className="opt"
              onClick={() => { sim.params.M = pr.M; sim.params.Q = pr.Q; sim.params.a = pr.a;
                               sim.params.type = pr.type || 'bh';
                               if (pr.R_star != null) sim.params.R_star = pr.R_star;
                               if (pr.T_eff != null) sim.params.T_eff = pr.T_eff;
                               if (pr.B != null) sim.params.B = pr.B;
                               if (pr.disc != null) sim.disc.enabled = pr.disc;
                               force(); }}>
              <span className="ico">{pr.glyph}</span>
              <span className="nm">{pr.name}</span>
              <span className="st">{pr.tag}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const PRESETS = [
  { name: 'Schwarzschild',          M: 1.5, Q: 0,    a: 0,    B: 0,    disc: false, glyph: '○', tag: 'baseline' },
  { name: 'Kerr (near-extremal)',   M: 1.5, Q: 0,    a: 1.35, B: 0.2,  glyph: '◐', tag: 'a/M ≈ 0.9' },
  { name: 'Reissner-Nordström',     M: 1.5, Q: 1.2,  a: 0,    B: 0.1,  glyph: '◉', tag: 'charged' },
  { name: 'Kerr-Newman',            M: 1.5, Q: 0.7,  a: 0.9,  B: 0.4,  glyph: '◑', tag: 'full' },
  { name: 'AGN · disc + jet',       M: 2.5, Q: 0,    a: 2.0,  B: 0.75, disc: true, glyph: '★', tag: 'MHD active' },
  { name: 'Magnetar regime',        M: 1.5, Q: 0,    a: 1.2,  B: 0.95, disc: true, type: 'ns', R_star: 2.8, T_eff: 1.2e6, glyph: '⚡', tag: 'neutron · B↑↑' },
  { name: 'Naked singularity',      M: 1.0, Q: 1.0,  a: 0.8,  B: 0,    glyph: '✕', tag: 'unshielded' },
  { name: 'Pulsar (spinning NS)',   M: 1.4, Q: 0,    a: 0.5,  B: 0.4,  type: 'ns', R_star: 3.2, T_eff: 8e5, glyph: '◉', tag: 'neutron star' },
  { name: 'Sirius B (WD)',          M: 1.0, Q: 0,    a: 0.1,  B: 0.05, type: 'wd', R_star: 7.0, T_eff: 2.5e4, glyph: '○', tag: 'white dwarf' },
  { name: 'Sun-like star',          M: 1.0, Q: 0,    a: 0.05, B: 0.02, type: 'ms', R_star: 20,  T_eff: 5800, glyph: '✱', tag: 'main-seq.' },
];

// ---------- Binary readout (§02) — dynamics summary only; params live in §01 tabs ----------
function BinaryReadout({ sim, force }) {
  const bin = sim.binary;
  const phys = window.KNphysics;
  if (!bin) return null;

  const isBHBin = (sim.params.type || 'bh') === 'bh' && (bin.type || 'bh') === 'bh';

  const pet = bin.lastPeters || {};
  const M1 = sim.params.M;
  const Mt = M1 + bin.M2;
  const Mc = (pet.Mc != null) ? pet.Mc : (Math.pow(M1 * bin.M2, 0.6) / Math.pow(Mt, 0.2));
  const fGW = bin.enabled ? ((pet.omega || 0) / Math.PI).toFixed(3) : '—';
  const pctDone = bin.enabled && bin.d0 > 0
    ? Math.min(100, Math.max(0, Math.round((1 - bin.d / bin.d0) * 100)))
    : 0;

  const { rplus: r1plus, naked: n1 } = phys.horizons(M1, sim.params.Q, sim.params.a);
  const { rplus: r2plus, naked: n2 } = phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
  const surf1 = (sim.params.type || 'bh') === 'bh'
    ? ((isFinite(r1plus) && !n1) ? r1plus : M1)
    : (sim.params.R_star || 3);
  const surf2 = (bin.type || 'bh') === 'bh'
    ? ((isFinite(r2plus) && !n2) ? r2plus : bin.M2)
    : (bin.R_star2 || 3);
  const rMerge = surf1 + surf2;

  return (
    <div className="section">
      <div className="section-head">
        <h3>Binary Dynamics</h3>
        <span className="idx">§02</span>
      </div>

      {!bin.enabled && !bin.merged && (
        <div className="lock-banner">
          <span className="lock-glyph">◆</span>
          <span>未配置伴星 — 切換 §01 上方 <b>Binary Companion</b> 頁籤建立雙星系統</span>
        </div>
      )}

      <div className="derived">
        <div className="cell">
          <span className="k">M₁ + M₂</span>
          <span className="v">{Mt.toFixed(2)}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">chirp Mc</span>
          <span className="v">{Mc.toFixed(3)}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">f_GW</span>
          <span className="v">{fGW}<small>c/M</small></span>
        </div>
        <div className="cell">
          <span className="k">d current</span>
          <span className="v">{bin.enabled ? bin.d.toFixed(2) : '—'}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">|v₂|</span>
          <span className="v">{bin.enabled ? Math.hypot(bin.vx2, bin.vy2).toFixed(3) : '—'}<small>c</small></span>
        </div>
        <div className="cell">
          <span className="k">ω orbital</span>
          <span className="v">{bin.enabled ? (bin.omega || 0).toFixed(3) : '—'}<small>c/M</small></span>
        </div>
        <div className="cell">
          <span className="k">surf₁ + surf₂</span>
          <span className="v">{rMerge.toFixed(2)}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">contact in</span>
          <span className="v">{bin.enabled ? Math.max(0, bin.d - rMerge).toFixed(2) : '—'}<small>M</small></span>
        </div>
      </div>

      {bin.enabled && (
        <div className="inspiral-track">
          <div className="row">
            <span className="k">Inspiral progress · d/d₀</span>
            <span className="v">{pctDone}%</span>
          </div>
          <div className="bar">
            <div className="fill" style={{ width: pctDone + '%' }} />
          </div>
          <div className="note">
            * 依 Peters (1964) 對所有雙星加入切向 GW 阻力 — dE/dt ∝ M₁²M₂²(M₁+M₂)/d⁵，視覺加速 ×{bin.inspiralRate}.
            {isBHBin
              ? ' 雙黑洞 → 旋近至視界相觸合併。'
              : ' 含非黑洞成員 → 旋近至表面相觸（contact）。'}
          </div>
        </div>
      )}

      {bin.merged && !bin.enabled && (
        <div className="lock-banner" style={{marginTop: 10, borderColor: 'oklch(0.72 0.14 150)'}}>
          <span className="lock-glyph" style={{color: 'oklch(0.78 0.14 150)'}}>✓</span>
          <span>MERGER COMPLETE · M_f = {sim.params.M.toFixed(2)} M · a_f/M = {(sim.params.a / sim.params.M).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

window.LeftPanel = LeftPanel;
window.BinaryReadout = BinaryReadout;
window.BodyEditor = BodyEditor;
window.Param = Param;
window.ValEditor = ValEditor;
