/* Kerr-Newman Lab Mobile — tab panel components
 * Tabs: BLACK HOLE · OBJECTS · SPAWN · DISC
 */

const { useState: useStateM, useEffect: useEffectM, useRef: useRefM } = React;

// ─── Click-to-type editor for a clamped numeric value ─────
function MValEditor({ val, min, max, step, fmt, onChange, disabled }) {
  const [editing, setEditing] = useStateM(false);
  const [draft, setDraft] = useStateM('');
  const [flash, setFlash] = useStateM(null);
  const inputRef = useRefM(null);

  useEffectM(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function start() {
    if (disabled) return;
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
    if (step && step > 0) {
      v = Math.round(v / step) * step;
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

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className="val val-edit"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
        }}
      />
    );
  }
  return (
    <span
      className={`val val-click ${flash ? 'flash-' + flash : ''} ${disabled ? 'disabled' : ''}`}
      onClick={start}
      title={disabled ? '' : tr(`tap to type · [${min}, ${max}]`, `點擊輸入 · [${min}, ${max}]`)}
    >
      {fmt ? fmt(val) : val.toFixed(2)}
    </span>
  );
}

// ─── Slider with header ────────────────────────────────────
function MParam({ sym, name, val, unit, min, max, step, onChange, fmt, color, scaleLabels, locked, lockHint }) {
  return (
    <div className={`m-param ${color || ''} ${locked ? 'locked' : ''}`}>
      <div className="row">
        <div className="lbl">
          <span className="sym">{sym}</span>
          <span className="name">{name}</span>
          {locked && <span className="lock-tag" title={lockHint || ''}>◆ {tr('LOCKED', '已鎖定')}</span>}
        </div>
        <div className="val-cell">
          <MValEditor val={val} min={min} max={max} step={step} fmt={fmt}
                      onChange={onChange} disabled={!!locked} />
          {unit && <span className="unit">{unit}</span>}
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
             disabled={!!locked}
             {...window.KNUI.rangeGuard(onChange)} />
      <div className="scale">
        {scaleLabels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

// ─── Body editor (mobile, shared by Central + Companion tabs) ──
function MBodyEditor({ sim, force, role }) {
  const phys = window.KNphysics;
  const bin = sim.binary;
  const isCentral = role === 'central';

  const A = isCentral ? {
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
  const isBH = A.type === 'bh';
  const collapseHint = !isBH && phys.wouldCollapse(A.M, A.Q, A.a, A.R_star);
  const bhLockReason = tr(
    `${isCentral ? 'Central body' : 'Companion'} is a black hole — no stellar surface parameters inside the horizon`,
    `${isCentral ? '主天體' : '伴星'}為黑洞 — 視界內無星體表面參數`);

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
    if (isCentral) {
      const oldType = sim.params.type || 'bh';
      sim.params.type = newType;
      if (newType !== 'bh') {
        const d = phys.STELLAR_DEFAULTS[newType];
        if (!sim.params._stellarTouched || oldType !== newType) {
          sim.params.R_star = d.R; sim.params.T_eff = d.T;
        }
        window.KNSim.logEv(sim, 'good', tr(`central → ${phys.STELLAR_INFO[newType].name}`,
                                           `主天體 → ${phys.STELLAR_INFO[newType].name}`));
      } else {
        window.KNSim.logEv(sim, 'warn', tr(`central → BLACK HOLE`, `主天體 → 黑洞`));
      }
    } else if (bin) {
      const oldType = bin.type || 'bh';
      bin.type = newType;
      if (newType !== 'bh') {
        const d = phys.STELLAR_DEFAULTS[newType];
        if (!bin._stellarTouched || oldType !== newType) {
          bin.R_star2 = d.R; bin.T_eff2 = d.T;
        }
        window.KNSim.logEv(sim, 'good', tr(`companion → ${phys.STELLAR_INFO[newType].name}`,
                                           `伴星 → ${phys.STELLAR_INFO[newType].name}`));
      } else {
        window.KNSim.logEv(sim, 'warn', tr(`companion → BLACK HOLE`, `伴星 → 黑洞`));
      }
    }
    force();
  }

  return (
    <>
      <div className="type-pick">
        {[
          { k: 'bh', label: 'BH',  glyph: '●' },
          { k: 'ns', label: 'NS',  glyph: '◉' },
          { k: 'wd', label: 'WD',  glyph: '◐' },
          { k: 'ms', label: '★',   glyph: '✱' },
        ].map((t) => (
          <button key={t.k}
            className={`type-tab ${A.type === t.k ? 'on' : ''}`}
            onClick={() => switchType(t.k)}>
            <span className="g">{t.glyph}</span>
            <span className="l">{t.label}</span>
          </button>
        ))}
      </div>
      <MParam sym={isCentral ? 'M' : 'M₂'} name={tr('Mass', '質量')} val={A.M} unit={A.massUnit}
              min={A.mMin} max={A.mMax} step={0.05}
              fmt={(v) => v.toFixed(2)} onChange={(v) => setField('M', v)}
              scaleLabels={[A.mMin.toString(), tr('stellar', '恆星'), A.mMax.toString()]} />
      <MParam sym={isCentral ? 'Q' : 'Q₂'} name={tr('Charge', '電荷')} val={A.Q} unit="√(M)"
              min={-1.5} max={1.5} step={0.01}
              color="magenta" fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)}
              onChange={(v) => setField('Q', v)}
              scaleLabels={['−|Q|', tr('neutral', '中性'), '+|Q|']} />
      <MParam sym={isCentral ? 'a' : 'a₂'} name={tr('Spin J/Mc', '自旋 J/Mc')} val={A.a} unit="M"
              min={-1.4} max={1.4} step={0.01}
              color="cyan" fmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)}
              onChange={(v) => setField('a', v)}
              scaleLabels={[tr('retro', '逆行'), tr('non-rot', '不轉'), tr('prograde', '順行')]} />
      {!isCentral && (
        <MParam sym="B₂" name={tr('Magnetic field', '磁場')} val={A.B} unit="B₀"
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
          <span className="hint">{isBH ? tr('sealed under r₊', '封閉於 r₊ 之內') : (collapseHint ? tr('◆ will collapse', '◆ 將塌縮') : tr('photosphere', '光球層'))}</span>
        </div>
        <MParam sym={isCentral ? 'R★' : 'R★₂'} name={tr('Surface radius', '表面半徑')} val={A.R_star} unit="M"
                min={1.5} max={32} step={0.1}
                fmt={(v) => v.toFixed(2)} onChange={(v) => setField('R_star', v)}
                locked={isBH} lockHint={bhLockReason}
                scaleLabels={[tr('compact', '緻密'), 'WD', tr('stellar', '恆星')]} />
        <MParam sym={isCentral ? 'T★' : 'T★₂'} name={tr('Photosphere T', '光球層溫度')} val={A.T_eff} unit="K"
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

// ─── BLACK HOLE tab ────────────────────────────────────────
function TabBlackHole({ sim, force }) {
  const [activeBody, setActiveBody] = useStateM('central');
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

  const companionPlacing = sim.placement && sim.placement.item && sim.placement.item.isCompanion;
  const companionAiming  = sim.aiming && sim.aiming.kind === 'companion';
  const companionArmed   = companionPlacing || companionAiming;

  function activateCompanionTab() {
    setActiveBody('companion');
    if (!bin || bin.enabled || companionArmed) return;
    const sType = bin.type || 'bh';
    sim.placement = null; sim.aiming = null;
    sim.placement = {
      item: { isCompanion: true, kind: 'companion', name: 'Companion ' + sType.toUpperCase(), radius: 0.4 },
      wx: 0, wy: 0, inCanvas: false,
    };
    window.KNSim.logEv(sim, 'amber', tr(`placing companion (${sType.toUpperCase()})… tap viewport`,
                                        `放置伴星 (${sType.toUpperCase()})… 點視圖`));
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
    <>
      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{activeBody === 'central'
            ? (isBH ? tr('Kerr-Newman Parameters', 'Kerr-Newman 參數') : phys.STELLAR_INFO[type].name)
            : (bin && bin.enabled
                ? tr(`Companion — ${(bin.type === 'bh') ? 'Kerr-Newman' : phys.STELLAR_INFO[bin.type].name}`,
                     `伴星 — ${(bin.type === 'bh') ? 'Kerr-Newman' : phys.STELLAR_INFO[bin.type].name}`)
                : tr('Companion — Not placed', '伴星 — 尚未放置'))}</h3>
          <span className="idx">§01</span>
        </div>

        <div className="body-tabs">
          <button className={`body-tab ${activeBody === 'central' ? 'on' : ''}`}
            onClick={() => setActiveBody('central')}>
            <span className="g">⦿</span><span className="l">{tr('Central', '主天體')}</span>
          </button>
          <button className={`body-tab companion ${activeBody === 'companion' ? 'on' : ''} ${companionArmed ? 'armed' : ''}`}
            onClick={activateCompanionTab}>
            <span className="g">{bin && bin.enabled ? '◐' : '+'}</span>
            <span className="l">{bin && bin.enabled ? `M₂=${bin.M2.toFixed(2)}` : (companionPlacing ? tr('Placing…', '放置中…') : tr('Companion', '伴星'))}</span>
            {bin && bin.enabled && activeBody === 'companion' && (
              <span className="companion-x" onClick={removeCompanion} title={tr('remove', '移除')}>×</span>
            )}
          </button>
        </div>

        <MBodyEditor sim={sim} force={force} role={activeBody} />

        {activeBody === 'companion' && !(bin && bin.enabled) && (
          <div className="lock-banner" style={{marginTop: 10}}>
            <span className="lock-glyph">◆</span>
            <span>{companionPlacing
              ? tr('Press and drag-release in the viewport → set the companion start position and v₀', '在視圖中按下並拖曳釋放 → 設定伴星初始位置與 v₀')
              : tr('Tap the Companion tab above to enter placement mode', '點上方伴星頁籤可進入放置模式')}</span>
          </div>
        )}

        {activeBody === 'companion' && bin && bin.enabled && (
          <div className="stellar-sub" style={{marginTop: 6}}>
            <div className="sub-head">
              <span>{tr('Dynamics', '動力學')}</span>
              <span className="hint">{tr('Hold and drag the companion in the viewport → reset v₀', '在視圖中按住伴星拖曳 → 重設 v₀')}</span>
            </div>
            <MParam sym="Ṙ" name={tr('GW dissipation rate', '重力波耗散率')} val={bin.inspiralRate} unit="×Peters"
                    min={1} max={300} step={1}
                    color="magenta"
                    fmt={(v) => '×' + v.toFixed(0)}
                    onChange={(v) => { bin.inspiralRate = v; force(); }}
                    scaleLabels={['×1', '×60', '×300']} />
          </div>
        )}
      </div>

      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Classification', '分類')}</h3>
          <span className="idx">§02</span>
        </div>
        <div className={`m-classify ${cls.warn ? 'warn' : ''}`}>
          <span className="pill">{cls.pill}</span>
          <div className="name">{cls.name}</div>
          <div className="desc">{cls.desc}</div>
          <div className="ratios">
            <div><span className="k">|a|/M</span><span className="v">{Math.abs(aN).toFixed(3)}</span></div>
            <div><span className="k">|Q|/M</span><span className="v">{Math.abs(qN).toFixed(3)}</span></div>
            <div><span className="k">a²+Q²</span><span className="v" style={{color: ext > 1 ? 'var(--warn)' : 'inherit'}}>{ext}</span></div>
            <div><span className="k">{tr('extrem.', '極端度')}</span><span className="v">{Math.min(1, Math.sqrt(parseFloat(ext))).toFixed(3)}</span></div>
          </div>
        </div>
      </div>

      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Derived Geometry', '導出幾何')}</h3>
          <span className="idx">§03</span>
        </div>
        <div className="m-derived">
          <div className="cell">
            <span className="k">{tr('r₊ outer horizon', 'r₊ 外視界')}</span>
            <span className="v">{naked ? '—' : rplus.toFixed(3)}<small>M</small></span>
          </div>
          <div className="cell">
            <span className="k">{tr('r₋ Cauchy', 'r₋ 柯西視界')}</span>
            <span className="v">{naked ? '—' : rminus.toFixed(3)}<small>M</small></span>
          </div>
          <div className="cell">
            <span className="k">{tr('r ergo (eq)', 'r 動圈（赤道）')}</span>
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
        </div>
      </div>

      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Preset Configurations', '預設組態')}</h3>
          <span className="idx">§04</span>
        </div>
        <div className="m-presets">
          {M_PRESETS.map((pr, i) => (
            <button key={i}
              onClick={() => {
                sim.params.M = pr.M; sim.params.Q = pr.Q; sim.params.a = pr.a;
                sim.params.type = pr.type || 'bh';
                if (pr.R_star != null) sim.params.R_star = pr.R_star;
                if (pr.T_eff != null) sim.params.T_eff = pr.T_eff;
                if (pr.B != null) sim.params.B = pr.B;
                if (pr.disc != null) sim.disc.enabled = pr.disc;
                if (pr.binary && sim.binary) {
                  sim.binary.enabled = pr.binary.enabled;
                  sim.binary.M2 = pr.binary.M2;
                  sim.binary.d  = pr.binary.d;
                  sim.binary.d0 = pr.binary.d;
                  sim.binary.theta = 0;
                  sim.binary.merged = false;
                  sim.binary.trail1.length = 0;
                  sim.binary.trail2.length = 0;
                  sim.binary.inspiralRate = pr.binary.inspiralRate || 1;
                } else if (!pr.binary && sim.binary) {
                  sim.binary.enabled = false;
                }
                force();
              }}>
              <span className="ico">{pr.glyph}</span>
              <span className="nm">{tr(pr.name, pr.name_zh)}</span>
              <span className="tg">{tr(pr.tag, pr.tag_zh)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Binary Companion', '雙星伴星')}</h3>
          <span className="idx">§05</span>
        </div>
        <TabBinary sim={sim} force={force} />
      </div>
    </>
  );
}

// ─── BINARY companion sub-panel ───────────────────────────
function TabBinary({ sim, force }) {
  const bin = sim.binary;
  if (!bin) return <div className="m-diag"><div className="line">{tr('Binary engine not initialised.', '雙星引擎尚未初始化。')}</div></div>;

  const pet    = bin.lastPeters || {};
  const fGW    = bin.enabled ? ((pet.omega || 0) / Math.PI).toFixed(3) : '—';
  const tMerge = bin.enabled
    ? (pet.t_merge / bin.inspiralRate < 1e5
        ? (pet.t_merge / bin.inspiralRate).toFixed(1) + ' M'
        : '>> M')
    : '—';
  const pctDone = bin.enabled && bin.d0 > 0
    ? Math.min(100, Math.round((1 - bin.d / bin.d0) * 100))
    : 0;

  return (
    <>
      <button
        className={`m-disc-toggle ${bin.enabled ? 'on' : ''}`}
        onClick={() => {
          if (!bin.enabled) {
            // If no companion was placed on the canvas yet, set up a stable
            // circular binary at the chosen separation along +x from the primary.
            const degenerate = Math.hypot(bin.x2 - bin.x1, bin.y2 - bin.y1) < 0.5;
            if (degenerate) {
              window.KNSim.placeCompanion(sim, sim.primary.x + bin.d, sim.primary.y);
              window.KNSim.circularizeBinary(sim);
            } else {
              bin.enabled = true;
            }
            bin.merged  = false;
            bin.mergerFlash = 0;
            bin.d0 = bin.d;
            bin.trail1 = []; bin.trail2 = [];
            window.KNSim.logEv(sim, 'amber', tr(
              `binary enabled · M₂=${bin.M2.toFixed(2)} M  d=${bin.d.toFixed(1)} M`,
              `雙星已啟用 · M₂=${bin.M2.toFixed(2)} M  d=${bin.d.toFixed(1)} M`));
          } else {
            bin.enabled = false;
            window.KNSim.logEv(sim, 'amber', tr('binary disabled', '雙星已停用'));
          }
          force();
        }}>
        <span className="dt-dot" />
        {bin.enabled ? tr('Binary · INSPIRAL ACTIVE', '雙星 · 旋近進行中') : tr('Activate binary companion', '啟用雙星伴星')}
      </button>

      <MParam sym="M₂" name={tr('Companion mass', '伴星質量')} val={bin.M2} unit="M"
              min={0.1} max={2.5} step={0.05}
              fmt={(v) => v.toFixed(2)}
              onChange={(v) => { bin.M2 = v; force(); }}
              scaleLabels={['0.1', tr('equal', '等質量'), '2.5']} />

      <MParam sym="d₀" name={tr('Separation', '間距')} val={bin.d} unit="M"
              min={3} max={30} step={0.5}
              fmt={(v) => v.toFixed(1)}
              onChange={(v) => { bin.d = v; bin.d0 = v; bin.trail1 = []; bin.trail2 = []; force(); }}
              scaleLabels={['3', tr('ISCO-prox', '近 ISCO'), '30']} />

      <MParam sym="Ṙ" name={tr('Chirp rate', '啁啾率')} val={bin.inspiralRate} unit="×Peters"
              min={1} max={300} step={1}
              fmt={(v) => v.toFixed(0)}
              onChange={(v) => { bin.inspiralRate = v; force(); }}
              scaleLabels={['×1', '×60', '×300']} />

      <div className="m-derived" style={{marginTop: '8px'}}>
        <div className="cell">
          <span className="k">M₁ + M₂</span>
          <span className="v">{(sim.params.M + bin.M2).toFixed(2)}<small>M</small></span>
        </div>
        <div className="cell">
          <span className="k">{tr('Chirp Mc', '啁啾質量 Mc')}</span>
          <span className="v">{bin.enabled ? (pet.Mc || 0).toFixed(3) : '—'}<small>M</small></span>
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
          <span className="k">ω_orb</span>
          <span className="v">{bin.enabled ? (pet.omega || 0).toFixed(3) : '—'}<small>c/M</small></span>
        </div>
        <div className="cell">
          <span className="k">t_merge*</span>
          <span className="v">{tMerge}</span>
        </div>
        <div className="cell">
          <span className="k">L_GW</span>
          <span className="v">{bin.enabled ? (bin.gwLum || 0).toExponential(2) : '—'}<small>c⁵/G</small></span>
        </div>
        <div className="cell">
          <span className="k">E_GW</span>
          <span className="v">{(bin.eGW || 0) > 1e-4 ? (bin.eGW || 0).toFixed(3) : '—'}<small>Mc²</small></span>
        </div>
      </div>

      {bin.enabled && (
        <div className="m-stress" style={{marginTop: '8px'}}>
          <div className="row">
            <span className="k">{tr('Inspiral progress', '旋近進度')}</span>
            <span className="v">{pctDone}%</span>
          </div>
          <div className="bar">
            <div className="fill" style={{
              width: pctDone + '%',
              background: 'linear-gradient(90deg, oklch(0.62 0.18 295), oklch(0.78 0.20 28))'
            }} />
          </div>
          <div className="note">{tr(`* ×${bin.inspiralRate} the physical Peters rate (1 = true GR)`, `* 物理 Peters 速率的 ×${bin.inspiralRate} 倍（1 = 真實 GR）`)}</div>
        </div>
      )}

      {bin.merged && !bin.enabled && (
        <div className="m-diag">
          <div className="line good">{tr('Merger complete', '合併完成')} · M_f = {sim.params.M.toFixed(2)} M · a_f/M = {(sim.params.a / sim.params.M).toFixed(2)} · E_GW = {(bin.eMergerGW || 0).toFixed(3)} Mc²</div>
        </div>
      )}
    </>
  );
}

const M_PRESETS = [
  { name: 'Schwarzschild',         name_zh: 'Schwarzschild',     M: 1.5, Q: 0,    a: 0,    B: 0,    disc: false, glyph: '○', tag: 'baseline',      tag_zh: '基準' },
  { name: 'Kerr (near-ext)',       name_zh: 'Kerr（近極端）',     M: 1.5, Q: 0,    a: 1.35, B: 0.2,  glyph: '◐', tag: 'a/M≈0.9',       tag_zh: 'a/M≈0.9' },
  { name: 'Reissner-Nordström',    name_zh: 'Reissner-Nordström', M: 1.5, Q: 1.2,  a: 0,    B: 0.1,  glyph: '◉', tag: 'charged',        tag_zh: '帶電' },
  { name: 'Kerr-Newman',           name_zh: 'Kerr-Newman',        M: 1.5, Q: 0.7,  a: 0.9,  B: 0.4,  glyph: '◑', tag: 'full',           tag_zh: '完整' },
  { name: 'AGN · disc + jet',      name_zh: 'AGN · 盤 + 噴流',    M: 2.5, Q: 0,    a: 2.0,  B: 0.75, disc: true,  glyph: '★', tag: 'MHD',           tag_zh: 'MHD' },
  { name: 'Magnetar regime',       name_zh: '磁星態',             M: 1.5, Q: 0,    a: 1.2,  B: 0.95, disc: true,  glyph: '⚡', tag: 'extreme B',     tag_zh: '極端 B' },
  { name: 'Naked singularity',     name_zh: '裸奇異點',           M: 1.0, Q: 1.0,  a: 0.8,  B: 0,    glyph: '✕', tag: 'unshielded',     tag_zh: '無遮蔽' },
  { name: 'GW150914-like',         name_zh: '類 GW150914',        M: 1.8, Q: 0,    a: 0.3,  B: 0,    disc: false,
    binary: { enabled: true, M2: 1.5, d: 14, inspiralRate: 1 },
    glyph: '◎', tag: 'BBH inspiral',   tag_zh: '雙黑洞旋近' },
  { name: 'Pulsar (NS)',           name_zh: '波霎（中子星）',     M: 1.4, Q: 0,    a: 0.5,  B: 0.4,  type: 'ns', R_star: 3.2, T_eff: 8e5, glyph: '◉', tag: 'neutron',  tag_zh: '中子星' },
  { name: 'White dwarf',           name_zh: '白矮星',             M: 1.0, Q: 0,    a: 0.1,  B: 0.05, type: 'wd', R_star: 7.0, T_eff: 2.5e4, glyph: '○', tag: 'compact',  tag_zh: '緻密' },
  { name: 'Sun-like star',         name_zh: '類太陽恆星',         M: 1.0, Q: 0,    a: 0.05, B: 0.02, type: 'ms', R_star: 20,  T_eff: 5800,  glyph: '✱', tag: 'main-seq', tag_zh: '主序' },
];

// ─── OBJECTS tab ───────────────────────────────────────────
function TabObjects({ sim, force }) {
  const phys = window.KNphysics;
  const sel = sim.bodies.find((b) => b.id === sim.selectedId);
  const { M, Q, a } = sim.params;
  const { rplus } = phys.horizons(M, Q, a);
  const fullReady = useMFullBridgeReady();

  return (
    <>
      {fullReady && <MSpacetimeDiagnostics sim={sim} />}

      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Object Roster', '天體清單')}</h3>
          <span className="idx">§05 · {sim.bodies.length}</span>
        </div>
        <div className="m-roster">
          {sim.bodies.length === 0 && (
            <div className="empty-msg">{tr('Spawn bodies from the SPAWN tab to begin.', '從「生成」頁籤建立天體開始。')}</div>
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
          <div className="m-sec">
            <div className="m-sec-head">
              <h3>{tr('Telemetry', '遙測')} — {sel.name}</h3>
              <span className="idx">§06</span>
            </div>
            <MTelemetry sim={sim} body={sel} />
          </div>

          <MObjectParams sim={sim} body={sel} force={force} />

          <div className="m-sec">
            <div className="m-sec-head">
              <h3>{tr('Tidal Field', '潮汐場')}</h3>
              <span className="idx">§07</span>
            </div>
            <MStressBar stress={sel.stress} peak={sel.stressPeak} />
          </div>

          <div className="m-sec">
            <div className="m-sec-head">
              <h3>{tr('Diagnosis', '診斷')}</h3>
              <span className="idx">§08</span>
            </div>
            <MDiagnosis sim={sim} body={sel} rplus={rplus} />
          </div>

          {fullReady && <MFullEngineDetail sim={sim} body={sel} />}

          {sel.kind === 'ship' && (
            <div className="m-sec">
              <div className="m-sec-head">
                <h3>{tr('Δv Burn — Prograde', 'Δv 點火 — 順行')}</h3>
                <span className="idx">§09</span>
              </div>
              <div className="m-burn">
                {[0.05, 0.1, 0.25].map((dv) => (
                  <button key={dv} onClick={() => burn(sel, dv, sim)}>+{dv}c</button>
                ))}
                {[-0.05, -0.1, -0.25].map((dv) => (
                  <button key={dv} className="retro" onClick={() => burn(sel, dv, sim)}>{dv}c</button>
                ))}
              </div>
              <div className="m-burn-note">
                {tr('Apply impulse along current velocity vector. Negative = retrograde.', '沿目前速度向量施加脈衝。負值 = 逆行。')}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="m-sec">
          <div className="m-empty">
            <div className="ic">— · —</div>
            <div className="ms">
              {tr('Tap a body in the roster or in the viewport to inspect its worldline.', '點選清單或視圖中的天體以檢視其世界線。')}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Per-body editable parameters (mobile) ────────────────
function MObjectParams({ sim, body, force }) {
  const locked = body.state !== 'orbit';
  const lockReason = {
    captured: tr('absorbed by black hole — register frozen', '已被黑洞吸收 — 紀錄凍結'),
    spaghettified: tr('tidally disrupted — worldline terminated', '已被潮汐撕裂 — 世界線終止'),
    escaped: tr('unbound — left detector envelope', '未束縛 — 已離開偵測範圍'),
  }[body.state];
  const set = (k) => (v) => { body[k] = v; force(); };
  return (
    <div className="m-sec">
      <div className="m-sec-head">
        <h3>{tr('Object Parameters', '天體參數')}</h3>
        <span className="idx">§06b{locked ? ' · ' + tr('LOCKED', '已鎖定') : ''}</span>
      </div>
      {locked && (
        <div className="lock-banner">
          <span className="lock-glyph">◆</span>
          <span>{lockReason}</span>
        </div>
      )}
      <MParam sym="R" name={tr('Body radius', '天體半徑')} val={body.radius || 0} unit="M"
              min={0.02} max={1.2} step={0.01}
              fmt={(v) => v.toFixed(2)} onChange={set('radius')}
              locked={locked} lockHint={lockReason}
              scaleLabels={[tr("probe", "探測器"), tr("planet", "行星"), tr("giant", "巨行星")]} />
      <MParam sym="E_b" name={tr('Binding strength', '束縛強度')} val={body.binding || 1} unit="τ"
              min={0.1} max={25} step={0.1}
              color="cyan"
              fmt={(v) => v.toFixed(2)} onChange={set('binding')}
              locked={locked} lockHint={lockReason}
              scaleLabels={[tr("fragile", "脆弱"), tr("rocky", "岩質"), tr("degenerate", "簡併")]} />
      <MParam sym="q" name={tr('Test charge', '測試電荷')} val={body.charge || 0} unit="e"
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

function MTelemetry({ sim, body }) {
  const phys = window.KNphysics;
  const r = Math.hypot(body.x, body.y);
  const v = Math.hypot(body.vx, body.vy);
  const { M, Q, a } = sim.params;
  const { rplus } = phys.horizons(M, Q, a);
  const rIsco = phys.isco(M, a);
  const rErg = phys.ergosphereEq(M, Q);
  const L = body.x * body.vy - body.y * body.vx;
  const E = 0.5 * v * v - M / Math.max(r, 0.1);
  const insideErgo = !isNaN(rErg) && r < rErg && r > rplus;
  return (
    <div className="m-telem">
      <div className="item"><span className="k">r</span><span className="v">{r.toFixed(3)}<small>M</small></span></div>
      <div className="item"><span className="k">r / r₊</span><span className="v">{(rplus > 0 ? r / rplus : 0).toFixed(2)}</span></div>
      <div className="item"><span className="k">|v|</span><span className="v">{v.toFixed(3)}<small>c</small></span></div>
      <div className={`item ${L > 0 ? 'good' : ''}`}><span className="k">L · M⁻¹</span><span className="v">{L.toFixed(3)}</span></div>
      <div className="item"><span className="k">{tr('E spec.', 'E 比能')}</span><span className="v">{E.toFixed(3)}</span></div>
      <div className={`item ${insideErgo ? 'warn' : ''}`}><span className="k">{tr('Region', '區域')}</span><span className="v">{regionLabel(r, rplus, rErg, rIsco)}</span></div>
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

function MStressBar({ stress, peak }) {
  const pct = Math.min(100, stress * 100);
  return (
    <div className="m-stress">
      <div className="row">
        <span className="k">{tr('Tidal / binding', '潮汐 / 束縛')}</span>
        <span className="v">{stress.toFixed(2)}× <span style={{color:'var(--fg-3)'}}>{tr('peak', '峰值')} {peak.toFixed(2)}×</span></span>
      </div>
      <div className="bar">
        <div className="fill" style={{ width: pct + '%' }} />
        <div className="mark y" />
        <div className="mark r" />
      </div>
      <div className="note">{tr('spaghettification at ≈ 1.15×', '≈ 1.15× 處發生拉麵化')}</div>
    </div>
  );
}

function MDiagnosis({ sim, body, rplus }) {
  const phys = window.KNphysics;
  const r = Math.hypot(body.x, body.y);
  const { M, Q, a } = sim.params;
  const rErg = phys.ergosphereEq(M, Q);
  const rIsco = phys.isco(M, a);
  const lines = [];
  if (body.state === 'captured') lines.push({ t: 'crit', m: tr('Crossed event horizon — added to BH mass register.', '越過事件視界 — 已計入黑洞質量。') });
  if (body.state === 'spaghettified') lines.push({ t: 'crit', m: tr('Disrupted by tidal field. Material dispersed.', '被潮汐場撕裂。物質散逸。') });
  if (body.state === 'escaped') lines.push({ t: 'note', m: tr('Worldline left detector envelope. Effectively unbound.', '世界線離開偵測範圍。實質上未束縛。') });
  if (body.state === 'orbit') {
    if (r < rplus * 1.2) lines.push({ t: 'crit', m: tr('Imminent horizon crossing. No stable orbits here.', '即將越過視界。此處無穩定軌道。') });
    else if (r < rIsco) lines.push({ t: 'warn', m: tr('Below ISCO — orbit unstable, infall expected.', '低於 ISCO — 軌道不穩定，預期墜落。') });
    else if (!isNaN(rErg) && r < rErg) lines.push({ t: 'warn', m: tr('Inside ergosphere. Observer forced to co-rotate (frame dragging).', '位於動圈內。觀者被迫共轉（參考系拖曳）。') });
    if (body.stress > 0.5) lines.push({ t: 'warn', m: tr('Tidal stress approaching binding threshold.', '潮汐應力逼近束縛閾值。') });
    if (body.kind === 'ship' && Math.abs(a) > 0.5 && r < rIsco * 1.4) {
      lines.push({ t: 'good', m: tr('Penrose process available — retrograde burn extracts rotational energy.', 'Penrose 過程可用 — 逆行點火可萃取自旋能。') });
    }
    if (body.charge && Math.abs(Q) > 0.05) {
      const sign = body.charge * Q > 0 ? tr('repulsive', '排斥') : tr('attractive', '吸引');
      lines.push({ t: 'note', m: tr(`Coulomb coupling is ${sign}. q·Q = ${(body.charge*Q).toFixed(2)}.`, `庫侖耦合為${sign}。q·Q = ${(body.charge*Q).toFixed(2)}。`) });
    }
    if (lines.length === 0) lines.push({ t: 'good', m: tr('Stable bound orbit. Geodesic outside critical surfaces.', '穩定束縛軌道。測地線在臨界面之外。') });
  }
  return (
    <div className="m-diag">
      {lines.map((l, i) => (
        <div key={i} className={`line ${l.t === 'crit' ? 'crit' : l.t === 'warn' ? 'warn' : l.t === 'good' ? 'good' : ''}`}>{l.m}</div>
      ))}
    </div>
  );
}

function burn(body, dv, sim) {
  const v = Math.hypot(body.vx, body.vy) || 1;
  body.vx += (body.vx / v) * dv;
  body.vy += (body.vy / v) * dv;
  window.KNSim.logEv(sim, 'amber', tr(`${body.name} — Δv ${(dv>=0?'+':'')+dv.toFixed(2)}c burn applied`,
                                      `${body.name} — 已施加 Δv ${(dv>=0?'+':'')+dv.toFixed(2)}c 點火`));
}

// ─── Full-physics-engine diagnostic blocks (mobile) ──────
function useMFullBridgeReady() {
  const [ready, setReady] = React.useState(() => !!window.KNFull);
  React.useEffect(() => {
    if (ready) return;
    function onReady() { setReady(true); }
    window.addEventListener('knfull-ready', onReady);
    if (window.KNFull) setReady(true);
    return () => window.removeEventListener('knfull-ready', onReady);
  }, [ready]);
  return ready;
}

function mFmt(v, d = 3) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)) return v.toExponential(2);
  return v.toFixed(d);
}

function MSpacetimeDiagnostics({ sim }) {
  const KNFull = window.KNFull;
  const { M, Q, a, B = 0 } = sim.params;
  const geom  = React.useMemo(() => KNFull.geometry(sim.params),
                              [KNFull, M, Q, a, B]);
  const orbit = React.useMemo(() => KNFull.orbitDiagnostics(sim.params),
                              [KNFull, M, Q, a, B]);
  const captures = sim.events ? sim.events.filter(
    (e) => e.type === 'warn' && /captured|crossed|impacted/i.test(e.msg)
  ).length : 0;
  const accProxy = Math.min(1.2, captures * 0.04);
  const jet = React.useMemo(() => KNFull.jetPower(sim.params, accProxy),
                            [KNFull, M, Q, a, B, accProxy]);
  const naked = geom.horizons.naked || (sim.params.type && sim.params.type !== 'bh');
  return (
    <div className="m-sec">
      <div className="m-sec-head">
        <h3>{tr('Spacetime · Full Engine', '時空 · 完整引擎')}</h3>
        <span className="idx">§04b</span>
      </div>
      <div className="m-telem">
        <div className="item"><span className="k">r₊ · r₋</span><span className="v">{naked ? '—' : `${mFmt(geom.horizons.rPlus, 2)} · ${mFmt(geom.horizons.rMinus, 2)}`}</span></div>
        <div className="item"><span className="k">Ω_H · κ</span><span className="v">{naked ? '—' : `${mFmt(geom.horizonAngularVelocity, 3)} · ${mFmt(geom.surfaceGravity, 3)}`}</span></div>
        <div className="item"><span className="k">A_H</span><span className="v">{naked ? '—' : mFmt(geom.horizonArea, 1)}</span></div>
        <div className="item"><span className="k">{tr('ISCO pro · retro', 'ISCO 順 · 逆')}</span><span className="v">{mFmt(orbit.isco?.prograde?.rISCO, 2)} · {mFmt(orbit.isco?.retrograde?.rISCO, 2)}</span></div>
        <div className="item"><span className="k">{tr('Photon pro · retro', '光子 順 · 逆')}</span><span className="v">{mFmt(orbit.photonOrbit?.prograde?.rPhoton, 2)} · {mFmt(orbit.photonOrbit?.retrograde?.rPhoton, 2)}</span></div>
        {jet?.valid && (
          <>
            <div className="item"><span className="k">{tr('BZ jet · Γ', 'BZ 噴流 · Γ')}</span><span className="v">{mFmt(jet.bzPower, 3)} · {mFmt(jet.lorentzFactor, 1)}</span></div>
            <div className="item"><span className="k">2θ_open</span><span className="v">{mFmt(jet.openingAngleDeg, 1)}°</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function MFullEngineDetail({ sim, body }) {
  if (body.state !== 'orbit') return null;
  const KNFull = window.KNFull;
  const r = Math.hypot(body.x, body.y);

  const region = React.useMemo(
    () => KNFull.regionAt(sim.params, body.x, body.y),
    [KNFull, sim.params.M, sim.params.Q, sim.params.a, body.x, body.y]
  );

  // Throttle tidal-tensor recomputation.
  const tidalRef = React.useRef({ at: 0, value: null });
  const tidal = React.useMemo(() => {
    const now = performance.now();
    if (now - tidalRef.current.at >= 240) {
      try {
        tidalRef.current.value = KNFull.tidalDiagnostics(sim.params, body.x, body.y, {
          radius: body.radius, binding: body.binding,
        });
      } catch { /* keep previous */ }
      tidalRef.current.at = now;
    }
    return tidalRef.current.value;
  }, [KNFull, sim.params.M, sim.params.Q, sim.params.a, body.x, body.y, body.radius, body.binding]);

  const survivalColor = tidal?.survival === 'disrupted' ? 'var(--warn)' :
                        tidal?.survival === 'stressed'  ? 'var(--amber)' :
                        'var(--cyan)';
  return (
    <div className="m-sec">
      <div className="m-sec-head">
        <h3>{tr('Full-Engine Detail', '完整引擎細節')}</h3>
        <span className="idx">§08b</span>
      </div>
      <div className="m-telem">
        <div className="item">
          <span className="k">{tr('Region (KN)', '區域 (KN)')}</span>
          <span className={`v ${region?.insideErgosphere || region?.insideHorizon ? 'warn' : ''}`}>
            {region?.insideHorizon ? tr('INSIDE r₊', 'r₊ 之內') :
             region?.insideErgosphere ? tr('ERGOSPHERE', '動圈') :
             region ? tr('EXTERIOR', '外部') : '—'}
          </span>
        </div>
        <div className="item"><span className="k">Δ r₊</span><span className="v">{mFmt(region?.horizonMargin, 3)}</span></div>
        {tidal && !tidal.error && (
          <>
            <div className="item"><span className="k">|E_tidal|</span><span className="v">{mFmt(tidal.spectralRadius, 4)}</span></div>
            <div className="item"><span className="k">{tr('Stress / E_b', '應力 / E_b')}</span><span className="v" style={{color: survivalColor}}>{mFmt(tidal.normalizedStress, 2)}×</span></div>
            <div className="item"><span className="k">{tr('Survival', '存續')}</span><span className="v" style={{color: survivalColor}}>{survivalLabel(tidal.survival)}</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function glyphFor(kind) {
  return { planet: '●', gas: '◉', star: '✱', ship: '▶', probe: '▪' }[kind] || '•';
}
function stateLabel(s) {
  return tr(
    { orbit: 'TRACK', captured: 'CONSUMED', spaghettified: 'DISRUPTED', escaped: 'UNBOUND' }[s],
    { orbit: '追蹤', captured: '已吞噬', spaghettified: '已撕裂', escaped: '未束縛' }[s]);
}

// ─── SPAWN tab ─────────────────────────────────────────────
const M_LIBRARY = [
  { name: 'Rocky planet',  name_zh: '岩質行星', kind: 'planet', radius: 0.30, binding: 2.5,  charge: 0,    spawnR: 12 },
  { name: 'Gas giant',     name_zh: '氣態巨行星', kind: 'gas',    radius: 0.55, binding: 0.9,  charge: 0,    spawnR: 14 },
  { name: 'Brown dwarf',   name_zh: '棕矮星', kind: 'star',   radius: 0.45, binding: 4.0,  charge: 0,    spawnR: 16 },
  { name: 'Comet',         name_zh: '彗星', kind: 'probe',  radius: 0.05, binding: 0.4,  charge: 0,    spawnR: 22 },
  { name: 'Crewed ship',   name_zh: '載人飛船', kind: 'ship',   radius: 0.02, binding: 8.0,  charge: 0,    spawnR: 9 },
  { name: 'Charged probe', name_zh: '帶電探測器', kind: 'probe',  radius: 0.05, binding: 5.0,  charge: 0.6,  spawnR: 11 },
  { name: 'Pulsar core',   name_zh: '波霎核心', kind: 'star',   radius: 0.10, binding: 20.0, charge: 0,    spawnR: 18 },
  { name: 'Dust cloud',    name_zh: '塵埃雲', kind: 'gas',    radius: 0.40, binding: 0.25, charge: 0,    spawnR: 25 },
];

function TabSpawn({ sim, force, onArm }) {
  return (
    <>
      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Object Library', '天體庫')}</h3>
          <span className="idx">{tr('tap → tap viewport', '點選 → 點視圖')}</span>
        </div>
        <div className="m-libgrid">
          {M_LIBRARY.map((it, i) => {
            const active = sim.placement && sim.placement.item.name === it.name;
            return (
              <button key={i} className={`m-libcard ${it.kind === 'gas' ? 'gasG' : it.kind} ${active ? 'active' : ''}`}
                onClick={() => onArm(it)}>
                <div className="glyph">
                  <span className="dot" />
                  <span className="nm">{tr(it.name, it.name_zh)}</span>
                </div>
                <div className="meta">
                  <div>R<sub>b</sub> <b>{it.radius.toFixed(2)} M</b></div>
                  <div>{tr('bind', '束縛')} <b>{it.binding.toFixed(2)}</b>{it.charge ? <> · q <b style={{color:'var(--magenta)'}}>{it.charge > 0 ? '+' : ''}{it.charge}</b></> : null}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Event Log', '事件記錄')}</h3>
          <span className="idx">§live</span>
        </div>
        <div className="m-eventlog">
          {sim.events.length === 0 && <div className="ev"><span className="t">[T+0.0]</span>{tr('Awaiting first event…', '等待第一個事件…')}</div>}
          {sim.events.slice(0, 14).map((e, i) => (
            <div key={i} className={`ev ${e.type}`}><span className="t">[T+{e.t}]</span>{e.msg}</div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── DISC tab ──────────────────────────────────────────────
function TabDisc({ sim, force }) {
  const p = sim.params;
  return (
    <>
      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Accretion Disc & MHD', '吸積盤與 MHD')}</h3>
          <span className="idx">§10</span>
        </div>
        <button className={`m-disc-toggle ${sim.disc.enabled ? 'on' : ''}`}
          onClick={() => { sim.disc.enabled = !sim.disc.enabled; force(); }}>
          <span className="dt-dot" />
          {sim.disc.enabled ? tr('Disc · active', '吸積盤 · 啟用') : tr('Spin up accretion disc', '啟動吸積盤')}
        </button>
        <MParam sym="B" name={tr('Magnetic field', '磁場')} val={p.B} unit="B₀" min={0} max={1} step={0.01}
               color="magenta" fmt={(v) => v.toFixed(2)}
               onChange={(v) => { sim.params.B = v; force(); }}
               scaleLabels={[tr("off", "關"), "0.5", tr("magnetar", "磁星")]} />
        <MParam sym="α" name={tr('Viscosity', '黏滯度')} val={sim.disc.alpha} unit="" min={0} max={0.5} step={0.01}
               color="cyan" fmt={(v) => v.toFixed(2)}
               onChange={(v) => { sim.disc.alpha = v; force(); }}
               scaleLabels={[tr("inviscid", "無黏滯"), "α=0.25", tr("thick", "厚盤")]} />
        <MParam sym="Ṅ" name={tr('Emission rate', '發射率')} val={sim.disc.emissionRate} unit="/M" min={0} max={20} step={0.5}
               fmt={(v) => v.toFixed(1)}
               onChange={(v) => { sim.disc.emissionRate = v; force(); }}
               scaleLabels={["—", "10/M", tr("dense", "密集")]} />
      </div>

      <div className="m-sec">
        <div className="m-sec-head">
          <h3>{tr('Disc State', '吸積盤狀態')}</h3>
          <span className="idx">§11</span>
        </div>
        <div className="m-derived">
          <div className="cell">
            <span className="k">{tr('Ṁ accretion', 'Ṁ 吸積率')}</span>
            <span className="v">{sim.disc.mDot.toFixed(2)}<small>/M</small></span>
          </div>
          <div className="cell">
            <span className="k">{tr('N particles', 'N 粒子數')}</span>
            <span className="v">{sim.disc.particles.length}<small>/{sim.disc.maxParticles}</small></span>
          </div>
          <div className="cell">
            <span className="k">MRI</span>
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
    </>
  );
}

Object.assign(window, {
  TabBlackHole, TabObjects, TabSpawn, TabDisc, TabBinary, MParam, MObjectParams, M_LIBRARY,
});
