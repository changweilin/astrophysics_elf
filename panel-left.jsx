/* Left & right side panels + bottom strip components. */

const { useState, useEffect, useRef, useMemo } = React;

// Touch gesture guard for <input type=range>. A native range slider jumps its
// value to wherever a finger lands and tracks any drag — so scrolling the panel
// (a vertical swipe) or a stray tap silently changes a parameter. This guard
// commits a value change only during a deliberate horizontal drag; vertical
// swipes scroll the page and plain taps are ignored. Gesture state lives on the
// DOM node (no hooks), so the same helper works from any component/file.
// Mouse and keyboard input are untouched (no touch events fire for them).
window.KNUI = window.KNUI || {
  rangeGuard(onChange) {
    return {
      onTouchStart(e) {
        const el = e.currentTarget, t = e.touches[0];
        el._kn = { mode: 'undecided', x0: t.clientX, y0: t.clientY, startVal: el.value };
      },
      onTouchMove(e) {
        const st = e.currentTarget._kn;
        if (!st || st.mode === 'slide') return;
        const t = e.touches[0], dx = t.clientX - st.x0, dy = t.clientY - st.y0;
        if (st.mode === 'undecided') {
          if (Math.abs(dx) > 6 && Math.abs(dx) >= Math.abs(dy)) st.mode = 'slide';
          else if (Math.abs(dy) > 6) st.mode = 'scroll';
        }
      },
      onTouchEnd(e) { if (e.currentTarget._kn) e.currentTarget._kn.mode = 'idle'; },
      onChange(e) {
        const st = e.target._kn;
        // Mid-touch, suppress everything except a committed horizontal slide.
        if (st && (st.mode === 'undecided' || st.mode === 'scroll')) {
          e.target.value = st.startVal; // snap the thumb back; drop the change
          return;
        }
        onChange(parseFloat(e.target.value));
      },
    };
  },
};

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
      title={disabled ? '' : trp('click to type · range [{min}, {max}]', { min, max })}
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
          {locked && <span className="lock-tag" title={lockHint || ''}>◆ {tr('LOCKED', '已鎖定')}</span>}
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
               {...window.KNUI.rangeGuard(onChange)} />
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
    B: (bin && bin.B2) || 0,
    massUnit: 'M', mMin: 0.1, mMax: 3.5,
  };

  const isBH = accessors.type === 'bh';
  const collapseHint = !isBH && phys.wouldCollapse(accessors.M, accessors.Q, accessors.a, accessors.R_star);
  const bhLockReason = isCentral
    ? tr('Central body is a black hole — no stellar surface parameters inside the horizon', '主天體為黑洞 — 視界內無星體表面參數')
    : tr('Companion is a black hole — no stellar surface parameters inside the horizon', '伴星為黑洞 — 視界內無星體表面參數');

  function setField(k, v) {
    if (isCentral) {
      if (k === 'M' || k === 'Q' || k === 'a') sim.params[k] = v;
      else if (k === 'R_star') { sim.params.R_star = v; sim.params._stellarTouched = true; }
      else if (k === 'T_eff') { sim.params.T_eff = v; sim.params._stellarTouched = true; }
    } else if (bin) {
      const m = { M: 'M2', Q: 'Q2', a: 'a2', R_star: 'R_star2', T_eff: 'T_eff2', B: 'B2' };
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
        window.KNSim.logEv(sim, 'good', trp('central → {type}', { type: phys.STELLAR_INFO[newType].name }));
      } else {
        window.KNSim.logEv(sim, 'warn', tr('central → BLACK HOLE · stellar params locked', '主天體 → 黑洞 · 星體參數已鎖定'));
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
        window.KNSim.logEv(sim, 'good', trp('companion → {type}', { type: phys.STELLAR_INFO[newType].name }));
      } else {
        window.KNSim.logEv(sim, 'warn', tr('companion → BLACK HOLE', '伴星 → 黑洞'));
      }
    }
    force();
  }

  return (
    <>
      <div className="type-pick" role="tablist">
        {[
          { k: 'bh', label: tr('Black Hole', '黑洞'), glyph: '●' },
          { k: 'ns', label: tr('Neutron', '中子星'),  glyph: '◉' },
          { k: 'wd', label: tr('White Dwarf', '白矮星'), glyph: '◐' },
          { k: 'ms', label: tr('Star', '恆星'),       glyph: '✱' },
        ].map((t) => (
          <button key={t.k}
            className={`type-tab ${accessors.type === t.k ? 'on' : ''}`}
            onClick={() => switchType(t.k)}>
            <span className="g">{t.glyph}</span>
            <span className="l">{t.label}</span>
          </button>
        ))}
      </div>

      <Param sym={isCentral ? 'M' : 'M₂'} name={tr('Mass', '質量')} val={accessors.M} unit={accessors.massUnit}
             min={accessors.mMin} max={accessors.mMax} step={0.05}
             fmt={(v) => v.toFixed(2)} onChange={(v) => setField('M', v)}
             scaleLabels={[accessors.mMin.toString(), tr('stellar', '恆星'), accessors.mMax.toString()]} />
      <Param sym={isCentral ? 'Q' : 'Q₂'} name={tr('Charge', '電荷')} unit="√(M)" val={accessors.Q}
             min={-1.5} max={1.5} step={0.01}
             color="magenta" fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)}
             onChange={(v) => setField('Q', v)}
             scaleLabels={['−|Q|', tr('neutral', '中性'), '+|Q|']} />
      <Param sym={isCentral ? 'a' : 'a₂'} name={tr('Spin (J/Mc)', '自旋 (J/Mc)')} val={accessors.a} unit="M"
             min={-1.4} max={1.4} step={0.01}
             color="cyan" fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)}
             onChange={(v) => setField('a', v)}
             scaleLabels={[tr('retro', '逆行'), tr('non-rot', '不轉'), tr('prograde', '順行')]} />

      {!isCentral && (
        <Param sym="B₂" name={tr('Magnetic field', '磁場')} val={accessors.B} unit="B₀"
               min={0} max={1} step={0.01}
               color="magenta" fmt={(v) => v.toFixed(2)}
               onChange={(v) => setField('B', v)}
               scaleLabels={[tr('off', '關'), tr('BZ jet', 'BZ 噴流'), tr('magnetar', '磁星')]} />
      )}
      {!isCentral && sim.disc2 && (
        <button className={`disc-toggle ${sim.disc2.enabled ? 'on' : ''}`}
          onClick={() => { sim.disc2.enabled = !sim.disc2.enabled; force(); }}>
          {sim.disc2.enabled ? tr('COMPANION DISC · active', '伴星吸積盤 · 啟用') : tr('Spin up companion disc', '啟動伴星吸積盤')}
        </button>
      )}

      <div className="stellar-sub">
        <div className="sub-head">
          <span>{tr('Surface state', '表面狀態')}</span>
          <span className="hint">{isBH ? tr('sealed under r₊', '封閉於 r₊ 之內') : (collapseHint ? tr('◆ R★ ≤ r₊ · will collapse', '◆ R★ ≤ r₊ · 將塌縮') : tr('visible photosphere', '可見光球層'))}</span>
        </div>
        <Param sym={isCentral ? 'R★' : 'R★₂'} name={tr('Surface radius', '表面半徑')} val={accessors.R_star} unit="M"
               min={1.5} max={32} step={0.1}
               fmt={(v) => v.toFixed(2)} onChange={(v) => setField('R_star', v)}
               locked={isBH} lockHint={bhLockReason}
               scaleLabels={[tr('compact', '緻密'), 'WD', tr('stellar', '恆星')]} />
        <Param sym={isCentral ? 'T★' : 'T★₂'} name={tr('Photosphere T', '光球層溫度')} val={accessors.T_eff} unit="K"
               min={2500} max={5e6} step={50}
               color="cyan"
               fmt={(v) => v >= 1e5 ? (v/1e6).toFixed(2) + '×10⁶' : Math.round(v).toLocaleString()}
               onChange={(v) => setField('T_eff', v)}
               locked={isBH} lockHint={bhLockReason}
               scaleLabels={[tr('red', '紅'), tr('G/sun', 'G/太陽'), tr('X-ray', 'X 射線')]} />
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
  const rIsco = naked ? NaN : phys.isco(p.M, p.a, p.Q);
  const rPh = phys.photonSphereEq(p.M, p.a, p.Q);
  const aN = p.a / p.M;
  const qN = p.Q / p.M;
  const ext = (aN * aN + qN * qN).toFixed(3);
  const collapseHint = !isBH && phys.wouldCollapse(p.M, p.Q, p.a, p.R_star);

  const companionPlacing = sim.placement && sim.placement.item && sim.placement.item.isCompanion;
  const companionAiming  = sim.aiming && sim.aiming.kind === 'companion';
  const companionArmed   = companionPlacing || companionAiming;

  function activateCompanionTab(e) {
    if (e && e.preventDefault) e.preventDefault();   // press-drag like body cards
    setActiveBody('companion');
    if (!bin) return;
    if (bin.enabled) return;
    if (companionArmed) return;
    const sType = bin.type || 'bh';
    sim.placement = null; sim.aiming = null;
    sim.placement = {
      item: { isCompanion: true, kind: 'companion', name: tr('Companion ', '伴星 ') + sType.toUpperCase(), radius: 0.4 },
      wx: 0, wy: 0, inCanvas: false,
    };
    window.KNSim.logEv(sim, 'amber', trp('placing companion ({type})… drop into viewport', { type: sType.toUpperCase() }));
    force();
  }

  function removeCompanion(e) {
    if (e) e.stopPropagation();
    window.KNSim.removeCompanion(sim);
    sim.aiming = null;
    window.KNSim.logEv(sim, 'amber', tr('companion removed', '已移除伴星'));
    force();
  }

  return (
    <div className="panel left">
      <div className="section">
        <div className="section-head">
          <h3>{activeBody === 'central'
            ? trp('Central Body — {sol}', { sol: isBH ? tr('Kerr-Newman Solution', 'Kerr-Newman 解') : phys.STELLAR_INFO[type].name })
            : (bin && bin.enabled
                ? trp('Binary Companion — {sol}', { sol: (bin.type === 'bh') ? 'Kerr-Newman' : phys.STELLAR_INFO[bin.type].name })
                : tr('Binary Companion — Not placed', '雙星伴星 — 尚未放置'))}</h3>
          <span className="idx">§01</span>
        </div>

        <div className="body-tabs" role="tablist">
          <button className={`body-tab ${activeBody === 'central' ? 'on' : ''}`}
            onClick={() => setActiveBody('central')}>
            <span className="g">⦿</span><span className="l">{tr('Central Body', '主天體')}</span>
          </button>
          <button className={`body-tab companion ${activeBody === 'companion' ? 'on' : ''} ${companionArmed ? 'armed' : ''}`}
            onMouseDown={activateCompanionTab}
            title={tr('Same parameters as the central body; drag into the viewport to place and drag to set v₀', '同主天體的參數，可拖入視圖放置並拖曳設定 v₀')}>
            <span className="g">{bin && bin.enabled ? '◐' : '+'}</span>
            <span className="l">{bin && bin.enabled ? `${tr('Binary Companion', '雙星伴星')} · M₂=${bin.M2.toFixed(2)}` : (companionPlacing ? tr('Placing…', '放置中…') : tr('Binary Companion', '雙星伴星'))}</span>
            {bin && bin.enabled && activeBody === 'companion' && (
              <span className="companion-x" onMouseDown={(e) => e.stopPropagation()} onClick={removeCompanion} title={tr('remove companion', '移除伴星')}>×</span>
            )}
          </button>
        </div>

        <BodyEditor sim={sim} force={force} role={activeBody} />

        {activeBody === 'companion' && !(bin && bin.enabled) && (
          <div className="lock-banner" style={{marginTop: 10}}>
            <span className="lock-glyph">◆</span>
            <span>{companionPlacing
              ? tr('Press and drag-release in the viewport → set the companion start position and v₀', '在視圖中按下並拖曳釋放 → 設定伴星初始位置與 v₀')
              : tr('Tap the Binary Companion tab above to enter placement mode', '點上方雙星伴星頁籤可進入放置模式')}</span>
          </div>
        )}

        {activeBody === 'companion' && bin && bin.enabled && (
          <div className="stellar-sub" style={{marginTop: 6}}>
            <div className="sub-head">
              <span>{tr('Dynamics', '動力學')}</span>
              <span className="hint">{tr('Hold and drag the companion in the viewport → reset v₀', '在視圖中按住伴星拖曳 → 重設 v₀')}</span>
            </div>
            <Param sym="Ṙ" name={tr('GW dissipation rate', '重力波耗散率')} val={bin.inspiralRate} unit="×Peters"
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
          <h3>{tr('Classification', '分類')}</h3>
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
            <div><span className="k">{isBH ? tr('extremality', '極端度') : 'r★/r_s'}</span>
              <span className="v">{isBH ? Math.min(1, Math.sqrt(parseFloat(ext))).toFixed(3) : ((p.R_star || 3) / (2 * p.M)).toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>{isBH ? tr('Derived Geometry', '導出幾何') : tr('Stellar Geometry', '星體幾何')}</h3>
          <span className="idx">§04</span>
        </div>
        <div className="derived">
          {isBH ? (<>
            <div className="cell">
              <span className="k">{tr('r₊ outer horizon', 'r₊ 外視界')}</span>
              <span className="v">{naked ? '—' : rplus.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">{tr('r₋ Cauchy', 'r₋ 柯西視界')}</span>
              <span className="v">{naked ? '—' : rminus.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">{tr('r ergo (eq.)', 'r 動圈（赤道）')}</span>
              <span className="v">{isNaN(rErg) ? '—' : rErg.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">{tr('r photon', 'r 光子球')}</span>
              <span className="v">{rPh.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">r ISCO</span>
              <span className="v">{isNaN(rIsco) ? '—' : rIsco.toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">{tr('drag Ω(r₊)', '拖曳 Ω(r₊)')}</span>
              <span className="v">{naked ? '—' : (p.a / (rplus * rplus + p.a * p.a)).toFixed(3)}<small>c/M</small></span>
            </div>
          </>) : (<>
            <div className="cell">
              <span className="k">{tr('R★ surface', 'R★ 表面')}</span>
              <span className="v">{(p.R_star || 3).toFixed(3)}<small>M</small></span>
            </div>
            <div className="cell">
              <span className="k">{tr('r_s (would-be)', 'r_s（假想）')}</span>
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
              <span className="k">{tr('Ω_eq surface', 'Ω_eq 表面')}</span>
              <span className="v">{(p.a / ((p.R_star || 3) * (p.R_star || 3) + p.a * p.a)).toFixed(3)}<small>c/M</small></span>
            </div>
            <div className="cell">
              <span className="k">{tr('T★ photosphere', 'T★ 光球層')}</span>
              <span className="v">{(p.T_eff || 1e6) >= 1e5 ? ((p.T_eff || 1e6)/1e6).toFixed(2) + '×10⁶' : Math.round(p.T_eff || 1e6).toLocaleString()}<small>K</small></span>
            </div>
          </>)}
        </div>
        {collapseHint && (
          <div className="lock-banner" style={{marginTop: 10}}>
            <span className="lock-glyph">◆</span>
            <span>{tr('R★ ≤ r₊ · will collapse into a black hole — switch to the BH tab to lock', 'R★ ≤ r₊ · 將塌縮為黑洞 — 切換 BH 頁面以鎖定')}</span>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>{tr('Disc & MHD', '吸積盤與 MHD')}</h3>
          <span className="idx">§05</span>
        </div>
        <button className={`disc-toggle ${sim.disc.enabled ? 'on' : ''}`}
          onClick={() => { sim.disc.enabled = !sim.disc.enabled; force(); }}>
          <span className="dt-dot" />
          {sim.disc.enabled ? tr('ACCRETION DISC · active', '吸積盤 · 啟用') : tr('Spin up accretion disc', '啟動吸積盤')}
        </button>
        <Param sym="B" name={tr('Magnetic field', '磁場')} val={p.B} unit="B₀" min={0} max={1} step={0.01}
               color="magenta" fmt={(v) => v.toFixed(2)} onChange={(v) => { sim.params.B = v; force(); }}
               scaleLabels={[tr("off", "關"), "0.5", tr("magnetar", "磁星")]} />
        <Param sym="α" name={tr('Viscosity', '黏滯度')} val={sim.disc.alpha} unit="" min={0} max={0.5} step={0.01}
               color="cyan" fmt={(v) => v.toFixed(2)}
               onChange={(v) => { sim.disc.alpha = v; force(); }}
               scaleLabels={[tr("inviscid", "無黏滯"), "α=0.25", tr("thick", "厚盤")]} />
        <Param sym="Ṅ" name={tr('Emission rate', '發射率')} val={sim.disc.emissionRate} unit="/M" min={0} max={20} step={0.5}
               fmt={(v) => v.toFixed(1)}
               onChange={(v) => { sim.disc.emissionRate = v; force(); }}
               scaleLabels={["—", "10/M", tr("dense", "密集")]} />
        <div className="derived" style={{marginTop: 12}}>
          <div className="cell">
            <span className="k">{tr('Ṁ accretion', 'Ṁ 吸積率')}</span>
            <span className="v">{sim.disc.mDot.toFixed(2)}<small>/M</small></span>
          </div>
          <div className="cell">
            <span className="k">{tr('N particles', 'N 粒子數')}</span>
            <span className="v">{sim.disc.particles.length}<small>/{sim.disc.maxParticles}</small></span>
          </div>
          <div className="cell">
            <span className="k">{tr('MRI active', 'MRI 啟用')}</span>
            <span className="v" style={{color: (p.B > 0.05 && sim.disc.enabled) ? 'var(--cyan)' : 'var(--fg-3)'}}>
              {(p.B > 0.05 && sim.disc.enabled) ? tr('✓ ON', '✓ 開') : '—'}
            </span>
          </div>
          <div className="cell">
            <span className="k">{tr('Σ swallowed', 'Σ 吞噬量')}</span>
            <span className="v">{sim.disc.totalAccreted}</span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>{tr('Preset Configurations', '預設組態')}</h3>
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
              <span className="nm">{tr(pr.name, pr.name_zh)}</span>
              <span className="st">{tr(pr.tag, pr.tag_zh)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const PRESETS = [
  { name: 'Schwarzschild',          name_zh: 'Schwarzschild',     M: 1.5, Q: 0,    a: 0,    B: 0,    disc: false, glyph: '○', tag: 'baseline',       tag_zh: '基準' },
  { name: 'Kerr (near-extremal)',   name_zh: 'Kerr（近極端）',     M: 1.5, Q: 0,    a: 1.35, B: 0.2,  glyph: '◐', tag: 'a/M ≈ 0.9',     tag_zh: 'a/M ≈ 0.9' },
  { name: 'Reissner-Nordström',     name_zh: 'Reissner-Nordström', M: 1.5, Q: 1.2,  a: 0,    B: 0.1,  glyph: '◉', tag: 'charged',        tag_zh: '帶電' },
  { name: 'Kerr-Newman',            name_zh: 'Kerr-Newman',        M: 1.5, Q: 0.7,  a: 0.9,  B: 0.4,  glyph: '◑', tag: 'full',           tag_zh: '完整' },
  { name: 'AGN · disc + jet',       name_zh: 'AGN · 盤 + 噴流',    M: 2.5, Q: 0,    a: 2.0,  B: 0.75, disc: true, glyph: '★', tag: 'MHD active',     tag_zh: 'MHD 啟用' },
  { name: 'Magnetar regime',        name_zh: '磁星態',             M: 1.5, Q: 0,    a: 1.2,  B: 0.95, disc: true, type: 'ns', R_star: 2.8, T_eff: 1.2e6, glyph: '⚡', tag: 'neutron · B↑↑', tag_zh: '中子星 · B↑↑' },
  { name: 'Naked singularity',      name_zh: '裸奇異點',           M: 1.0, Q: 1.0,  a: 0.8,  B: 0,    glyph: '✕', tag: 'unshielded',     tag_zh: '無遮蔽' },
  { name: 'Pulsar (spinning NS)',   name_zh: '波霎（自旋中子星）', M: 1.4, Q: 0,    a: 0.5,  B: 0.4,  type: 'ns', R_star: 3.2, T_eff: 8e5, glyph: '◉', tag: 'neutron star',  tag_zh: '中子星' },
  { name: 'Sirius B (WD)',          name_zh: '天狼星 B（白矮星）', M: 1.0, Q: 0,    a: 0.1,  B: 0.05, type: 'wd', R_star: 7.0, T_eff: 2.5e4, glyph: '○', tag: 'white dwarf',   tag_zh: '白矮星' },
  { name: 'Sun-like star',          name_zh: '類太陽恆星',         M: 1.0, Q: 0,    a: 0.05, B: 0.02, type: 'ms', R_star: 20,  T_eff: 5800, glyph: '✱', tag: 'main-seq.',     tag_zh: '主序' },
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
        <h3>{tr('Binary Dynamics', '雙星動力學')}</h3>
        <span className="idx">§02</span>
      </div>

      {!bin.enabled && !bin.merged && (
        <div className="lock-banner">
          <span className="lock-glyph">◆</span>
          <span>{tr('No companion configured — ', '未配置伴星 — ')}{tr('switch to the ', '切換 §01 上方 ')}<b>{tr('Binary Companion', 'Binary Companion')}</b>{tr(' tab in §01 above to build a binary system', ' 頁籤建立雙星系統')}</span>
        </div>
      )}

      <div className="derived">
        <div className="cell">
          <span className="k">M₁ + M₂</span>
          <span className="v">{Mt.toFixed(2)}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">{tr('chirp Mc', '啁啾質量 Mc')}</span>
          <span className="v">{Mc.toFixed(3)}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">f_GW</span>
          <span className="v">{fGW}<small>c/M</small></span>
        </div>
        <div className="cell">
          <span className="k">{tr('d current', 'd 目前')}</span>
          <span className="v">{bin.enabled ? bin.d.toFixed(2) : '—'}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">|v₂|</span>
          <span className="v">{bin.enabled ? Math.hypot(bin.vx2, bin.vy2).toFixed(3) : '—'}<small>c</small></span>
        </div>
        <div className="cell">
          <span className="k">{tr('ω orbital', 'ω 軌道')}</span>
          <span className="v">{bin.enabled ? (bin.omega || 0).toFixed(3) : '—'}<small>c/M</small></span>
        </div>
        <div className="cell">
          <span className="k">L_GW dE/dt</span>
          <span className="v">{bin.enabled ? (bin.gwLum || 0).toExponential(2) : '—'}<small>c⁵/G</small></span>
        </div>
        <div className="cell">
          <span className="k">{tr('E_GW radiated', 'E_GW 已輻射')}</span>
          <span className="v">{(bin.eGW || 0) > 1e-4 ? (bin.eGW || 0).toFixed(3) : '—'}<small>Mc²</small></span>
        </div>
        <div className="cell">
          <span className="k">surf₁ + surf₂</span>
          <span className="v">{rMerge.toFixed(2)}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">{tr('contact in', '接觸剩餘')}</span>
          <span className="v">{bin.enabled ? Math.max(0, bin.d - rMerge).toFixed(2) : '—'}<small>M</small></span>
        </div>
      </div>

      {bin.enabled && (
        <div className="inspiral-track">
          <div className="row">
            <span className="k">{tr('Inspiral progress · d/d₀', '旋近進度 · d/d₀')}</span>
            <span className="v">{pctDone}%</span>
          </div>
          <div className="bar">
            <div className="fill" style={{ width: pctDone + '%' }} />
          </div>
          <div className="note">
            {trp(
              '* Per Peters (1964), the orbital radius shrinks at the GW radiation rate da/dt = −(64/5)M₁M₂(M₁+M₂)/d³ (classical orbit curvature unchanged), visually sped up ×{rate} (1 = true GR rate).',
              { rate: bin.inspiralRate })}
            {isBHBin
              ? tr(' Double black hole → inspirals until the horizons touch and merge.', ' 雙黑洞 → 旋近至視界相觸合併。')
              : tr(' Includes a non-BH member → inspirals until the surfaces make contact.', ' 含非黑洞成員 → 旋近至表面相觸（contact）。')}
          </div>
        </div>
      )}

      {bin.merged && !bin.enabled && (
        <div className="lock-banner" style={{marginTop: 10, borderColor: 'oklch(0.72 0.14 150)'}}>
          <span className="lock-glyph" style={{color: 'oklch(0.78 0.14 150)'}}>✓</span>
          <span>{tr('MERGER COMPLETE', '合併完成')} · M_f = {sim.params.M.toFixed(2)} M · a_f/M = {(sim.params.a / sim.params.M).toFixed(2)} · E_GW = {(bin.eMergerGW || 0).toFixed(3)} Mc²</span>
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
