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
// `scale="log"` maps the native (linear) range thumb onto a base-10 logarithmic
// value axis — essential when a parameter spans several decades (e.g. masses for
// large/extreme mass ratios), so the low end is not crushed into a few pixels.
// The thumb operates in log10 space; the typed editor + scale labels stay in the
// real value space. Requires min > 0.
function Param({ sym, name, val, unit, min, max, step, onChange, fmt, color, scaleLabels, locked, lockHint, scale }) {
  const isLog = scale === 'log' && min > 0 && max > 0;
  const lo = isLog ? Math.log10(min) : min;
  const hi = isLog ? Math.log10(max) : max;
  const sStep = isLog ? (hi - lo) / 240 : step;
  const sVal = isLog ? Math.min(hi, Math.max(lo, Math.log10(Math.max(min, val || min)))) : val;
  // rangeGuard hands back the raw thumb value; in log mode convert it to the real
  // value (clamped) before the caller's onChange sees it.
  const sChange = isLog ? (s) => onChange(Math.min(max, Math.max(min, Math.pow(10, s)))) : onChange;
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
        <input type="range" min={lo} max={hi} step={sStep} value={sVal}
               disabled={!!locked}
               {...window.KNUI.rangeGuard(sChange)} />
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

  // The mass slider shows a *physical* solar mass (Msun); geometry uses the frozen
  // geometric mass (Mgeo = 1 for the primary, the mass ratio for the companion).
  // Spin a and charge Q are the dimensionless a/M, Q/M (primary) — no scale factor.
  const type = isCentral ? (sim.params.type || 'bh') : ((bin && bin.type) || 'bh');
  const category = phys.uiCategory(type);
  const range = phys.MASS_RANGES[category];
  // The mass scale (regime) governs every stage: the slider band is the overlap of
  // this stage's real mass range with the active scale (stellar / intermediate /
  // supermassive). A stage with no overlap at this scale doesn't exist in reality
  // and is locked out of the tab row below.
  const regime = sim.bhRegime || 'stellar';
  const sr = phys.stageRegimeRange(category, regime);
  // The intermediate scale replaces the Giant stage with an Open cluster *structure* (a
  // live star swarm, like the supermassive galaxy/cluster). Track whether this role is in
  // that structure mode so the tab row, the stage switch and the N read-out branch on it.
  const structRole = isCentral ? 'central' : 'companion';
  const activeStructKey = isCentral ? sim.smbhStructure : (bin && bin.smbhStructure);
  const inOpenCluster = regime === 'intermediate' && activeStructKey === 'opencluster';
  const mMin = sr ? sr.min : range.min;
  const mMax = sr ? sr.max : range.max;
  const accessors = isCentral ? {
    type, category,
    Mgeo: sim.params.M,
    Msun: sim.params.Msun != null ? sim.params.Msun : range.def,
    Q: sim.params.Q, a: sim.params.a,
    R_star: sim.params.R_star || 3.0, T_eff: sim.params.T_eff || 1e6,
    age: sim.params.age || 0, Z: sim.params.Z != null ? sim.params.Z : 0.5,
    cepheid: !!sim.params.cepheid,
    cepheidAmp: sim.params.cepheidAmp != null ? sim.params.cepheidAmp : 0.07,
    B: sim.params.B || 0,
    massUnit: 'M⊙', mMin, mMax,
  } : {
    type, category,
    Mgeo: (bin && bin.M2) || 0.8,
    Msun: (bin && bin.M2sun) || 8,
    Q: (bin && bin.Q2) || 0, a: (bin && bin.a2) || 0,
    R_star: (bin && bin.R_star2) || 3.0, T_eff: (bin && bin.T_eff2) || 1e6,
    age: (bin && bin.age2) || 0, Z: (bin && bin.Z2 != null) ? bin.Z2 : 0.5,
    cepheid: !!(bin && bin.cepheid),
    cepheidAmp: (bin && bin.cepheidAmp != null) ? bin.cepheidAmp : 0.07,
    B: (bin && bin.B2) || 0,
    massUnit: 'M⊙', mMin, mMax,
  };

  const isBH = accessors.type === 'bh';
  // No stellar body's surface is a free variable: R★, T★, colour and L are all
  // physical consequences of the mass plus stage-specific drivers — age (ms),
  // metallicity (giant), or spin + magnetic field (wd/ns). The engine derives
  // them every frame (KNSim.syncStellar → KNphysics.deriveStellar); the panel
  // only exposes those drivers and shows R★/T★ as read-outs, never sliders.
  const isDerived = !isBH;
  const stellarState = isDerived
    ? phys.deriveStellar(accessors.type, accessors.Msun,
        { age: accessors.age, Z: accessors.Z, B: accessors.B || 0, a: accessors.a,
          cepheid: accessors.type === 'giant' && accessors.cepheid })
    : null;
  // Cepheid read-out (mean period + instability-strip driving efficiency). The
  // live pulsation phase is tracked by the engine on sim.params / sim.binary.
  const cep = (accessors.type === 'giant' && accessors.cepheid && stellarState) ? {
    P: phys.cepheidPeriodDays(stellarState.R_solar, accessors.Msun),
    q: phys.instabilityStrip(stellarState.T_eff, stellarState.L),
  } : null;
  // Live derived geometric radius — the collapse check must use it, not the
  // possibly one-frame-stale stored R_star.
  const liveR = stellarState ? stellarState.R_star : accessors.R_star;
  const collapseHint = !isBH && phys.wouldCollapse(accessors.Mgeo, accessors.Q, accessors.a, liveR);
  const surfaceDriver = {
    ms:    tr('derived from mass + age', '由質量＋年齡推導'),
    giant: tr('derived from mass + metallicity', '由質量＋金屬量推導'),
    wd:    tr('derived from mass + spin', '由質量＋自旋推導'),
    ns:    tr('derived from mass + field + spin', '由質量＋磁場＋自旋推導'),
  }[accessors.type] || tr('visible photosphere', '可見光球層');
  const fmtYears = (yr) => yr >= 1e9 ? (yr / 1e9).toFixed(yr < 1e10 ? 2 : 0) + ' Gyr'
    : yr >= 1e6 ? (yr / 1e6).toFixed(0) + ' Myr'
    : Math.round(yr).toLocaleString() + ' yr';
  const fmtLum = (L) => L >= 1e4 ? (L / 1e3).toFixed(0) + 'k' : L >= 100 ? Math.round(L).toString()
    : L >= 1 ? L.toFixed(1) : L.toFixed(3);
  const fmtTemp = (T) => T >= 1e5 ? (T / 1e6).toFixed(2) + '×10⁶' : Math.round(T).toLocaleString();

  function setField(k, v) {
    if (isCentral) {
      if (k === 'Q' || k === 'a') sim.params[k] = v;
    } else if (bin) {
      const m = { Q: 'Q2', a: 'a2', B: 'B2' };
      bin[m[k]] = v;
    }
    force();
  }

  // Stage drivers. R★/T★ are not set here — KNSim.syncStellar re-derives them
  // from these inputs every frame, so just record the knob and re-render.
  function setAge(v) {
    if (isCentral) sim.params.age = v;
    else if (bin) bin.age2 = v;
    force();
  }
  function setMetallicity(v) {
    if (isCentral) sim.params.Z = v;
    else if (bin) bin.Z2 = v;
    force();
  }
  function setCepheid(on) {
    if (isCentral) sim.params.cepheid = on;
    else if (bin) bin.cepheid = on;
    window.KNSim.logEv(sim, on ? 'good' : 'warn', on
      ? tr('Cepheid pulsation engaged — κ-mechanism', '造父變星脈動啟動 — κ 機制')
      : tr('Cepheid pulsation off', '造父變星脈動關閉'));
    force();
  }
  function setCepheidAmp(v) {
    if (isCentral) sim.params.cepheidAmp = v;
    else if (bin) bin.cepheidAmp = v;
    force();
  }

  // Mass slider — sets the physical solar mass. For the collapsed-remnant stage
  // the concrete flavour (WD/NS/BH) follows the mass automatically.
  function setMass(v) {
    if (isCentral) {
      sim.params.Msun = v;
      if (accessors.category === 'remnant') {
        const nt = phys.remnantType(v);
        if (nt !== sim.params.type) {
          const wasBH = sim.params.type === 'bh';
          sim.params.type = nt;
          if (nt !== 'bh') {
            const d = phys.STELLAR_DEFAULTS[nt];
            if (d && (!sim.params._stellarTouched || wasBH)) { sim.params.R_star = d.R; sim.params.T_eff = d.T; }
            if (Math.abs(sim.params.a) > sim.params.M) sim.params.a = Math.sign(sim.params.a || 1) * sim.params.M * 0.9;
            if (Math.abs(sim.params.Q) > sim.params.M) sim.params.Q = Math.sign(sim.params.Q || 1) * sim.params.M * 0.9;
          }
          window.KNSim.logEv(sim, nt === 'bh' ? 'warn' : 'good',
            trp('remnant → {type}', { type: nt === 'bh' ? tr('BLACK HOLE', '黑洞') : phys.STELLAR_INFO[nt].name }));
        }
      }
      // Keep the companion's geometric mass tied to the live mass ratio.
      if (bin) bin.M2 = Math.max(0.01, (bin.M2sun || 8) / Math.max(0.01, v));
    } else if (bin) {
      bin.M2sun = v;
      if (phys.uiCategory(bin.type) === 'remnant') {
        const nt = phys.remnantType(v);
        if (nt !== bin.type) {
          const wasBH = bin.type === 'bh';
          bin.type = nt;
          if (nt !== 'bh') {
            const d = phys.STELLAR_DEFAULTS[nt];
            if (d && (!bin._stellarTouched || wasBH)) { bin.R_star2 = d.R; bin.T_eff2 = d.T; }
          }
        }
      }
      bin.M2 = Math.max(0.01, v / Math.max(0.01, sim.params.Msun || 1));
      if (bin.type !== 'bh') {
        if (Math.abs(bin.a2) > bin.M2) bin.a2 = Math.sign(bin.a2 || 1) * bin.M2 * 0.9;
        if (Math.abs(bin.Q2) > bin.M2) bin.Q2 = Math.sign(bin.Q2 || 1) * bin.M2 * 0.9;
      }
    }
    // A galaxy/cluster's mass sets its star count: grow/shrink the swarm (and so its
    // radius + brightness) toward the new mass. Central tracks sim.smbhStructure;
    // companion tracks the binary's structure.
    const role = isCentral ? 'central' : 'companion';
    const struct = isCentral ? sim.smbhStructure : (bin && bin.smbhStructure);
    if ((struct === 'galaxy' || struct === 'cluster' || struct === 'opencluster') && window.KNSim.rescaleStructureCloud) {
      window.KNSim.rescaleStructureCloud(sim, role);
    }
    force();   // R★/T★ re-derived from the new mass by KNSim.syncStellar
  }

  // Picker — selects an evolutionary stage (main sequence / giant / remnant).
  // Because the stages differ so much in size, each remembers its own settings
  // and camera zoom: leaving a stage stashes it, returning restores it verbatim.
  // A never-visited stage falls back to defaults + that stage's framing zoom.
  function switchCategory(cat) {
    // Leaving the intermediate open-cluster structure for a stellar stage: tear the swarm
    // down first (a structure is not an evolutionary stage). Fall through even when the
    // chosen stage's category matches the current (bh) type, since we are exiting a
    // structure, not switching between stages.
    if (inOpenCluster) {
      window.KNSim.clearStructure(sim, structRole);
    } else if (cat === accessors.category) {
      return;
    }
    // No real body of this stage exists at the current mass scale → tab is locked.
    if (phys.stageLockedAtRegime(cat, regime)) return;
    const band = phys.stageRegimeRange(cat, regime) || phys.MASS_RANGES[cat];
    const clampMass = (m) => Math.min(band.max, Math.max(band.min, (m >= band.min && m <= band.max) ? m : band.def));
    const stash = (sim._stageStash = sim._stageStash || { central: {}, companion: {} });
    const slot = isCentral ? stash.central : stash.companion;
    const stageName = (t) => t === 'bh' ? tr('BLACK HOLE', '黑洞') : phys.STELLAR_INFO[t].name;

    if (isCentral) {
      slot[accessors.category] = {
        Msun: sim.params.Msun, Q: sim.params.Q, a: sim.params.a, type: sim.params.type,
        R_star: sim.params.R_star, T_eff: sim.params.T_eff,
        age: sim.params.age, Z: sim.params.Z,
        _stellarTouched: sim.params._stellarTouched, viewScale: sim.view.scale,
      };
      const saved = slot[cat];
      if (saved) {
        sim.params.Msun = clampMass(saved.Msun);   // keep the restored mass within the current scale's band
        sim.params.Q = saved.Q; sim.params.a = saved.a;
        sim.params.type = phys.typeForStage(cat, sim.params.Msun);
        sim.params.R_star = saved.R_star; sim.params.T_eff = saved.T_eff;
        sim.params.age = saved.age != null ? saved.age : 0;
        sim.params.Z = saved.Z != null ? saved.Z : 0.5;
        sim.params._stellarTouched = saved._stellarTouched;
        sim.view.scale = saved.viewScale || phys.VIEW_SCALES[cat];
        window.KNSim.logEv(sim, sim.params.type === 'bh' ? 'warn' : 'good',
          trp('central → {type}', { type: stageName(sim.params.type) }));
      } else {
        const Msun = clampMass(accessors.Msun);
        const newType = phys.typeForStage(cat, Msun);
        sim.params.Msun = Msun;
        sim.params.type = newType;
        sim.params.age = 0;       // fresh stage starts at ZAMS / solar metallicity
        sim.params.Z = 0.5;
        if (newType !== 'bh') {
          const d = phys.STELLAR_DEFAULTS[newType];
          if (d) { sim.params.R_star = d.R; sim.params.T_eff = d.T; }
          sim.params._stellarTouched = false;
          if (Math.abs(sim.params.a) > sim.params.M) sim.params.a = Math.sign(sim.params.a || 1) * sim.params.M * 0.9;
          if (Math.abs(sim.params.Q) > sim.params.M) sim.params.Q = Math.sign(sim.params.Q || 1) * sim.params.M * 0.9;
          window.KNSim.logEv(sim, 'good', trp('central → {type}', { type: phys.STELLAR_INFO[newType].name }));
        } else {
          window.KNSim.logEv(sim, 'warn', tr('central → BLACK HOLE · stellar params locked', '主天體 → 黑洞 · 星體參數已鎖定'));
        }
        sim.view.scale = phys.VIEW_SCALES[cat];
      }
      if (bin) bin.M2 = Math.max(0.01, (bin.M2sun || 8) / Math.max(0.01, sim.params.Msun || 1));
    } else if (bin) {
      slot[accessors.category] = {
        M2sun: bin.M2sun, Q2: bin.Q2, a2: bin.a2, type: bin.type,
        R_star2: bin.R_star2, T_eff2: bin.T_eff2,
        age2: bin.age2, Z2: bin.Z2, _stellarTouched: bin._stellarTouched,
      };
      const saved = slot[cat];
      if (saved) {
        bin.M2sun = clampMass(saved.M2sun); bin.Q2 = saved.Q2; bin.a2 = saved.a2;
        bin.type = phys.typeForStage(cat, bin.M2sun);
        bin.R_star2 = saved.R_star2; bin.T_eff2 = saved.T_eff2; bin._stellarTouched = saved._stellarTouched;
        bin.age2 = saved.age2 != null ? saved.age2 : 0;
        bin.Z2 = saved.Z2 != null ? saved.Z2 : 0.5;
        window.KNSim.logEv(sim, bin.type === 'bh' ? 'warn' : 'good',
          trp('companion → {type}', { type: stageName(bin.type) }));
      } else {
        const Msun = clampMass(accessors.Msun);
        const newType = phys.typeForStage(cat, Msun);
        bin.M2sun = Msun;
        bin.type = newType;
        bin.age2 = 0;       // fresh stage starts at ZAMS / solar metallicity
        bin.Z2 = 0.5;
        if (newType !== 'bh') {
          const d = phys.STELLAR_DEFAULTS[newType];
          if (d) { bin.R_star2 = d.R; bin.T_eff2 = d.T; }
          bin._stellarTouched = false;
          window.KNSim.logEv(sim, 'good', trp('companion → {type}', { type: phys.STELLAR_INFO[newType].name }));
        } else {
          window.KNSim.logEv(sim, 'warn', tr('companion → BLACK HOLE', '伴星 → 黑洞'));
        }
      }
      bin.M2 = Math.max(0.01, (bin.M2sun || 8) / Math.max(0.01, sim.params.Msun || 1));
      if (bin.type !== 'bh') {
        if (Math.abs(bin.a2) > bin.M2) bin.a2 = Math.sign(bin.a2 || 1) * bin.M2 * 0.9;
        if (Math.abs(bin.Q2) > bin.M2) bin.Q2 = Math.sign(bin.Q2 || 1) * bin.M2 * 0.9;
      }
    }
    force();   // R★/T★ re-derived for the new stage by KNSim.syncStellar
  }

  // At the supermassive scale stars cannot exist, so the body tabs offer the
  // galactic-scale structures instead of the dead, locked stellar stages. Both the
  // central and the companion offer the full set (galaxy / star cluster / bare hole).
  const smbhStructures = isCentral && regime === 'supermassive';
  const companionStructures = !isCentral && regime === 'supermassive';
  // The companion's active structure: its stored choice, else inferred from disc
  // state (an accreting companion is an active galaxy; otherwise a quiescent hole).
  const companionStructure = (bin && bin.smbhStructure)
    || ((sim.disc2 && sim.disc2.enabled) ? 'galaxy' : 'smbh');

  return (
    <>
      {smbhStructures ? (
        <div className="type-pick" role="tablist">
          {phys.SMBH_STRUCTURES.map((s) => (
            <button key={s.key}
              className={`type-tab ${(sim.smbhStructure || 'smbh') === s.key ? 'on' : ''}`}
              title={tr(s.desc_en, s.desc_zh)}
              onClick={() => { window.KNSim.applySMBHStructure(sim, s.key); force(); }}>
              <span className="g">{s.glyph}</span>
              <span className="l">{tr(s.label_en, s.label_zh)}</span>
            </button>
          ))}
        </div>
      ) : companionStructures ? (
        <div className="type-pick" role="tablist">
          {phys.SMBH_STRUCTURES.map((s) => (
            <button key={s.key}
              className={`type-tab ${companionStructure === s.key ? 'on' : ''}`}
              title={tr(s.desc_en, s.desc_zh)}
              onClick={() => { window.KNSim.applySMBHStructure(sim, s.key, 'companion'); force(); }}>
              <span className="g">{s.glyph}</span>
              <span className="l">{tr(s.label_en, s.label_zh)}</span>
            </button>
          ))}
        </div>
      ) : (
      <div className="type-pick" role="tablist">
        {[
          { k: 'star',    label: tr('Main sequence', '主序星'), glyph: '✱' },
          // Intermediate scale swaps the Giant stage for an Open cluster structure.
          regime === 'intermediate'
            ? { k: 'opencluster', label: tr('Open cluster', '疏散星團'), glyph: '✸', structure: true }
            : { k: 'giant', label: tr('Giant', '巨星'), glyph: '✸' },
          { k: 'remnant', label: tr('Compact object', '緻密天體'), glyph: '●' },
        ].map((t) => {
          if (t.structure) {
            // Open cluster is a live star-swarm structure, not a stellar stage — selecting
            // it seeds the swarm (central or companion) via applySMBHStructure.
            return (
            <button key={t.k}
              className={`type-tab ${inOpenCluster ? 'on' : ''}`}
              title={tr('Open cluster — a loose, self-bound swarm of N stars; merges by dynamical friction',
                        '疏散星團 — 鬆散自束縛的 N 顆恆星群;靠動力摩擦合併')}
              onClick={() => { window.KNSim.applySMBHStructure(sim, 'opencluster', structRole); force(); }}>
              <span className="g">{t.glyph}</span>
              <span className="l">{t.label}</span>
            </button>
            );
          }
          const locked = phys.stageLockedAtRegime(t.k, regime);
          const regLabel = tr(phys.BH_REGIMES[regime].label_en, phys.BH_REGIMES[regime].label_zh);
          return (
          <button key={t.k} disabled={locked}
            className={`type-tab ${(!inOpenCluster && accessors.category === t.k) ? 'on' : ''} ${locked ? 'locked' : ''}`}
            title={locked ? trp('no {label}-scale {stage} exists in the real universe', { label: regLabel, stage: t.label }) : undefined}
            onClick={() => switchCategory(t.k)}>
            <span className="g">{locked ? '⊘' : t.glyph}</span>
            <span className="l">{t.label}</span>
          </button>
          );
        })}
      </div>
      )}

      {/* Live in-range star count for the active structure cloud (shrinks as a
          galaxy/cluster loses stars to stripping / ejection / the central BH). */}
      {((smbhStructures && (sim.smbhStructure === 'galaxy' || sim.smbhStructure === 'cluster')) || (isCentral && inOpenCluster)) && (
        <React.Fragment>
        <div className="struct-n" role="status">
          <span className="sn-l">{tr('stars in range', '範圍內恆星')}</span>
          <span className="sn-v">N = {sim._cloudN1 || 0}</span>
        </div>
        {/* The structure's SIMULATED binding core — the softened point mass its swarm
            actually orbits (frozen unit + banked merger cores), in solar units. For a
            cluster this is purely a binding mass, NOT a black hole. */}
        <div className="struct-n" role="status">
          <span className="sn-l">{tr('core binding mass (sim)', '模擬核心質量')}</span>
          <span className="sn-v">
            {phys.fmtSolarMass((sim.params.M + ((sim._struct1 && sim._struct1.coreBoost) || 0)) * (sim.params.Msun || 1))} M⊙
          </span>
        </div>
        {/* Only a GALAXY hosts a real central SMBH (a cluster core is a simulated
            binding mass with no hole): its physical mass grows by the members it has
            swallowed (struct.accreted, conserved bookkeeping), counted below. */}
        {sim.smbhStructure === 'galaxy' && smbhStructures && (
          <React.Fragment>
          <div className="struct-n" role="status">
            <span className="sn-l">{tr('central BH mass (real)', '實質核心黑洞質量')}</span>
            <span className="sn-v">
              {phys.fmtSolarMass((1 + ((sim._struct1 && sim._struct1.accreted) || 0)) * (sim.params.Msun || 1))} M⊙
            </span>
          </div>
          <div className="struct-n" role="status">
            <span className="sn-l">{tr('stars swallowed', '吞噬恆星數')}</span>
            <span className="sn-v">N = {(sim._struct1 && sim._struct1.accretedN) || 0}</span>
          </div>
          </React.Fragment>
        )}
        </React.Fragment>
      )}
      {((companionStructures && (companionStructure === 'galaxy' || companionStructure === 'cluster')) || (!isCentral && inOpenCluster)) && (
        <React.Fragment>
        <div className="struct-n" role="status">
          <span className="sn-l">{tr('stars in range', '範圍內恆星')}</span>
          <span className="sn-v">N = {sim._cloudN2 || 0}</span>
        </div>
        <div className="struct-n" role="status">
          <span className="sn-l">{tr('core binding mass (sim)', '模擬核心質量')}</span>
          <span className="sn-v">
            {phys.fmtSolarMass((sim.binary && sim.binary.M2 || 0) * (sim.params.Msun || 1))} M⊙
          </span>
        </div>
        {companionStructure === 'galaxy' && companionStructures && (
          <React.Fragment>
          <div className="struct-n" role="status">
            <span className="sn-l">{tr('central BH mass (real)', '實質核心黑洞質量')}</span>
            <span className="sn-v">
              {phys.fmtSolarMass(((sim.binary && sim.binary.M2 || 0) + ((sim._struct2 && sim._struct2.accreted) || 0)) * (sim.params.Msun || 1))} M⊙
            </span>
          </div>
          <div className="struct-n" role="status">
            <span className="sn-l">{tr('stars swallowed', '吞噬恆星數')}</span>
            <span className="sn-v">N = {(sim._struct2 && sim._struct2.accretedN) || 0}</span>
          </div>
          </React.Fragment>
        )}
        </React.Fragment>
      )}
      {/* Tidal-stream census + conservation ledger: stripped stars tracing tails /
          streams, and the live total-mass / momentum drift against the seed baseline
          (sim._conserve vs _conserve0) — shows the merger CONSERVING M and p. */}
      {(sim._streamN || 0) > 0 && (
        <div className="struct-n" role="status">
          <span className="sn-l">{tr('tidal stream stars', '潮汐流恆星')}</span>
          <span className="sn-v">N = {sim._streamN}</span>
        </div>
      )}
      {sim._conserve && sim._conserve0 && (sim._cloudN1 > 0 || sim._cloudN2 > 0) && (
        <div className="struct-n" role="status">
          <span className="sn-l">{tr('ΣM · Δp (conserved)', '總質量 · 動量漂移')}</span>
          <span className="sn-v">
            {(sim._conserve.M / Math.max(1e-9, sim._conserve0.M) * 100).toFixed(1)}%
            {/* Δp is meaningful while the pair interacts; a lone central is the frame
                anchor (its rest frame), where swarm momentum is not a conserved charge. */}
            {sim.binary && sim.binary.enabled
              ? ` · ${(Math.hypot(sim._conserve.px - sim._conserve0.px, sim._conserve.py - sim._conserve0.py)
                  / sim._conserve0.pref * 100).toFixed(1)}%`
              : ''}
          </span>
        </div>
      )}

      {accessors.category === 'remnant' && !smbhStructures && !companionStructures && !inOpenCluster && (
        <div className="remnant-stage" role="status">
          <span className="rs-head">{tr('mass selects remnant', '質量決定緻密天體')}</span>
          {[
            { k: 'wd', g: '◐', label: tr('WD', '白矮星'),  band: '<1.4' },
            { k: 'ns', g: '◉', label: tr('NS', '中子星'),  band: '1.4–3' },
            { k: 'bh', g: '●', label: tr('BH', '黑洞'),    band: '>3' },
          ].map((s) => (
            <span key={s.k} className={`rs-chip ${accessors.type === s.k ? 'on' : ''}`}>
              <span className="g">{s.g}</span>{s.label}<small>{s.band}</small>
            </span>
          ))}
        </div>
      )}

      <Param sym={isCentral ? 'M' : 'M₂'} name={tr('Mass', '質量')} val={accessors.Msun} unit={accessors.massUnit}
             min={accessors.mMin} max={accessors.mMax} step={0.01} scale="log"
             fmt={(v) => phys.fmtSolarMass(v)} onChange={setMass}
             scaleLabels={[phys.fmtSolarMass(accessors.mMin), 'log', phys.fmtSolarMass(accessors.mMax)]} />
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

      {/* Magnetic field B and the accretion-disc toggle live in the §05 Disc & MHD
          panel, which follows the active body — so the companion shares the same single
          set of controls as the central body (no duplicate B / disc toggle here). */}

      <div className="stellar-sub">
        <div className="sub-head">
          <span>{tr('Surface state', '表面狀態')}</span>
          <span className="hint">{isBH ? tr('sealed under r₊', '封閉於 r₊ 之內') : (collapseHint ? tr('◆ R★ ≤ r₊ · will collapse', '◆ R★ ≤ r₊ · 將塌縮') : surfaceDriver)}</span>
        </div>

        {/* Stage drivers — the only knobs; R★/T★/colour are derived from them. */}
        {accessors.type === 'ms' && (
          <Param sym={isCentral ? 'τ' : 'τ₂'} name={tr('Age (of main-seq. life)', '年齡（佔主序壽命）')}
                 val={accessors.age} unit=""
                 min={0} max={1} step={0.01}
                 color="amber" fmt={(v) => (v * 100).toFixed(0) + '%'}
                 onChange={setAge}
                 scaleLabels={[tr('ZAMS', '零齡'), tr('mid-life', '中年'), tr('turnoff', '末端')]} />
        )}
        {accessors.type === 'giant' && (
          <Param sym={isCentral ? 'Z' : 'Z₂'} name={tr('Metallicity (heavy elements)', '金屬量（重元素）')}
                 val={accessors.Z} unit=""
                 min={0} max={1} step={0.01}
                 color="amber" fmt={(v) => v === 0.5 ? tr('solar', '太陽') : (v < 0.5 ? '−' : '+') + Math.abs(v - 0.5).toFixed(2)}
                 onChange={setMetallicity}
                 scaleLabels={[tr('metal-poor', '貧金屬'), tr('solar', '太陽'), tr('metal-rich', '富金屬')]} />
        )}
        {accessors.type === 'giant' && (
          <div className="cepheid-block" style={{ margin: '4px 0 8px' }}>
            <button className={`disc-toggle ${accessors.cepheid ? 'on' : ''}`}
              onClick={() => setCepheid(!accessors.cepheid)}
              title={tr('κ-mechanism radial pulsation in the instability strip',
                       'κ 機制：不穩定帶內的徑向脈動')}>
              {accessors.cepheid
                ? tr('CEPHEID · κ-mechanism pulsation', '造父變星 · κ 機制脈動')
                : tr('Make it a Cepheid (κ-mechanism)', '設為造父變星（κ 機制）')}
            </button>
            {accessors.cepheid && (
              <Param sym={isCentral ? 'ΔR' : 'ΔR₂'} name={tr('Pulsation amplitude', '脈動振幅')}
                     val={accessors.cepheidAmp} unit=""
                     min={0.01} max={0.2} step={0.005}
                     color="amber" fmt={(v) => '±' + (v * 100).toFixed(0) + '%'}
                     onChange={setCepheidAmp}
                     scaleLabels={[tr('subtle', '輕微'), tr('δ Cep', 'δ Cep'), tr('strong', '強烈')]} />
            )}
            {accessors.cepheid && cep && (
              <div className="cep-readout" style={{ fontSize: '0.78em', opacity: 0.82, lineHeight: 1.5 }}>
                <div>{tr('Period', '週期')} P ≈ <b>{cep.P < 10 ? cep.P.toFixed(1) : Math.round(cep.P)}</b> {tr('d', '天')}
                  <small style={{ opacity: 0.6 }}> · P ∝ √(R³/M)</small></div>
                <div style={{ color: cep.q > 0 ? 'var(--good, #8fd6a0)' : 'var(--warn, #e0a458)' }}>
                  {cep.q > 0
                    ? tr('● inside instability strip', '● 位於不穩定帶內') + ` · ${tr('drive', '驅動')} ${(cep.q * 100).toFixed(0)}%`
                    : tr('○ outside strip — κ-valve damped (no pulsation)', '○ 超出不穩定帶 — κ 閥阻尼（不脈動）')}
                </div>
                <div style={{ opacity: 0.6 }}>
                  {tr('light max leads radius max (phase lag)', '光度極大領先半徑極大（相位差）')}
                </div>
              </div>
            )}
          </div>
        )}
        {(accessors.type === 'wd' || accessors.type === 'ns') && (
          <div className="sub-note" style={{ fontSize: '0.78em', opacity: 0.7, margin: '2px 0 8px' }}>
            {accessors.type === 'wd'
              ? tr('R★ shrinks with mass (degeneracy); spin enlarges it, mass + field heat it.',
                   'R★ 隨質量縮小（簡併壓）；自旋使其變大，質量與磁場使其變熱。')
              : tr('R★ ≈ const; spin flattens it; magnetic field (magnetar) sets the temperature.',
                   'R★ ≈ 定值；自旋使其變扁；磁場（磁星）決定溫度。')}
          </div>
        )}

        {/* Derived read-outs — R★ and T★ are values here, never sliders. */}
        {stellarState && (
          <div className="derived" style={{ marginTop: 6 }}>
            <div className="cell">
              <span className="k">{(isCentral ? 'R★' : 'R★₂') + ' ' + tr('radius', '半徑')}</span>
              <span className="v" style={{ color: collapseHint ? 'var(--warn)' : 'inherit' }}>
                {stellarState.R_star.toFixed(2)}<small>M</small>
              </span>
            </div>
            <div className="cell">
              <span className="k">{(isCentral ? 'T★' : 'T★₂') + ' ' + tr('photosphere', '光球')}</span>
              <span className="v">
                <i style={{ display: 'inline-block', width: '0.7em', height: '0.7em', borderRadius: '50%',
                            marginRight: 5, verticalAlign: 'middle',
                            background: phys.tempToColor(stellarState.T_eff, 1, phys.stellarGlow(stellarState.L)) }} />
                {fmtTemp(stellarState.T_eff)}<small>K</small>
              </span>
            </div>
            <div className="cell">
              <span className="k">{tr('L luminosity', 'L 光度')}</span>
              <span className="v">{fmtLum(stellarState.L)}<small>L⊙</small></span>
            </div>
            {accessors.type === 'ns' ? (
              <div className="cell">
                <span className="k">{tr('R radius', 'R 半徑')}</span>
                <span className="v">{stellarState.Rkm.toFixed(1)}<small>km</small></span>
              </div>
            ) : (
              <div className="cell">
                <span className="k">{tr('R photosphere', 'R 光球')}</span>
                <span className="v">{stellarState.R_solar < 0.1 ? stellarState.R_solar.toFixed(3) : stellarState.R_solar.toFixed(stellarState.R_solar < 10 ? 2 : 0)}<small>R⊙</small></span>
              </div>
            )}
            {accessors.type === 'wd' && (
              <div className="cell">
                <span className="k">M / M_Ch</span>
                <span className="v" style={{ color: stellarState.MoverMch > 0.9 ? 'var(--warn)' : 'inherit' }}>
                  {stellarState.MoverMch.toFixed(2)}
                </span>
              </div>
            )}
            {accessors.type === 'ms' && (
              <div className="cell" style={{ gridColumn: 'span 2' }}>
                <span className="k">{tr('t main-sequence (max life ∝ mass)', 't 主序壽命（上限 ∝ 質量）')}</span>
                <span className="v">{fmtYears(stellarState.lifetime)}</span>
              </div>
            )}
          </div>
        )}
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

  // The §05 Disc & MHD panel follows the active body, so each body has exactly ONE disc
  // toggle and ONE magnetic-field slider (central → sim.disc / params.B; companion →
  // sim.disc2 / bin.B2). This keeps the central and companion controls identical and
  // fully swappable rather than duplicated across panels.
  const onComp = activeBody === 'companion';
  const aDisc = (onComp ? sim.disc2 : sim.disc) || sim.disc;
  const aB = onComp ? ((bin && bin.B2) || 0) : (p.B || 0);
  const setAB = (v) => { if (onComp && bin) bin.B2 = v; else sim.params.B = v; force(); };

  const companionPlacing = sim.placement && sim.placement.item && sim.placement.item.isCompanion;
  const companionAiming  = sim.aiming && sim.aiming.kind === 'companion';
  const companionArmed   = companionPlacing || companionAiming;

  // Clear a pending (not-yet-dropped) companion placement / aiming.
  function cancelCompanionPlacement() {
    if (!companionArmed) return false;
    sim.placement = null; sim.aiming = null;
    window.KNSim.logEv(sim, 'amber', tr('companion placement cancelled', '已取消伴星放置'));
    return true;
  }

  function activateCompanionTab(e) {
    if (e && e.preventDefault) e.preventDefault();   // press-drag like body cards
    setActiveBody('companion');
    if (!bin) return;
    if (bin.enabled) return;
    // Already waiting to place → a second tap on the tab cancels the wait.
    if (companionArmed) { cancelCompanionPlacement(); force(); return; }
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
          {(() => {
            const reg = phys.BH_REGIMES[sim.bhRegime || 'stellar'];
            return (
              <button className="body-tab scale-cycle"
                onClick={() => { window.KNSim.cycleBHRegime(sim, 1); force(); }}
                title={tr('Black-hole mass scale — click to cycle (stellar → intermediate → supermassive); rescales both bodies and the object library. Key: B',
                          '黑洞質量尺度 — 點擊循環（恆星級 → 中等 → 超大）；同時調整主天體/伴星與天體庫。按鍵：B')}>
                <span className="g">◍</span>
                <span className="l">{tr(reg.label_en, reg.label_zh)}</span>
              </button>
            );
          })()}
          <button className={`body-tab ${activeBody === 'central' ? 'on' : ''}`}
            onClick={() => { cancelCompanionPlacement(); setActiveBody('central'); }}>
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

        {bin && bin.enabled && (
          <button className="swap-bodies"
            onClick={() => { window.KNSim.swapCentralCompanion(sim); force(); }}
            title={tr('Exchange the central body and companion (roles + motion); doing it twice restores the original.',
                      '互換主天體與伴星(角色＋運動);再按一次即還原。')}>
            ⇄ {tr('Swap central ⇄ companion', '主天體 ⇄ 伴星 互換')}
          </button>
        )}

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
            <button className={`disc-toggle ${bin.mtEnabled ? 'on' : ''}`} style={{marginTop: 8}}
              onClick={() => { bin.mtEnabled = !bin.mtEnabled; force(); }}>
              <span className="dt-dot" />
              {bin.mtEnabled ? tr('MASS TRANSFER · active', '質量轉移 · 啟用') : tr('Enable Roche-lobe transfer', '啟用洛希瓣質量轉移')}
            </button>
            {bin.mtEnabled && (
              <Param sym="Ṁ" name={tr('Transfer rate', '質量轉移率')} val={bin.transferRate} unit="×Roche"
                     min={0} max={50} step={1}
                     color="amber"
                     fmt={(v) => '×' + v.toFixed(0)}
                     onChange={(v) => { bin.transferRate = v; force(); }}
                     scaleLabels={['×0', '×25', '×50']} />
            )}
            <button className={`disc-toggle ${sim.flags.showRoche ? 'on' : ''}`} style={{marginTop: 6}}
              onClick={() => { sim.flags.showRoche = !sim.flags.showRoche; force(); }}>
              <span className="dt-dot" />
              {sim.flags.showRoche ? tr('Roche lobes · shown', '洛希瓣 · 顯示') : tr('Show Roche lobes', '顯示洛希瓣')}
            </button>
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
            <div><span className="k">{tr('mass', '質量')}</span><span className="v">{phys.fmtSolarMass(p.Msun || 0)}<small> M⊙</small></span></div>
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
          <h3>{onComp ? tr('Disc & MHD · companion', '吸積盤與 MHD · 伴星') : tr('Disc & MHD · central', '吸積盤與 MHD · 主天體')}</h3>
          <span className="idx">§05</span>
        </div>
        <button className={`disc-toggle ${aDisc.enabled ? 'on' : ''}`}
          onClick={() => { aDisc.enabled = !aDisc.enabled; force(); }}>
          <span className="dt-dot" />
          {aDisc.enabled ? tr('ACCRETION DISC · active', '吸積盤 · 啟用') : tr('Spin up accretion disc', '啟動吸積盤')}
        </button>
        <Param sym={onComp ? 'B₂' : 'B'} name={tr('Magnetic field', '磁場')} val={aB} unit="B₀" min={0} max={1} step={0.01}
               color="magenta" fmt={(v) => v.toFixed(2)} onChange={setAB}
               scaleLabels={[tr("off", "關"), "0.5", tr("magnetar", "磁星")]} />
        <Param sym="α" name={tr('Viscosity', '黏滯度')} val={aDisc.alpha} unit="" min={0} max={0.5} step={0.01}
               color="cyan" fmt={(v) => v.toFixed(2)}
               onChange={(v) => { aDisc.alpha = v; force(); }}
               scaleLabels={[tr("inviscid", "無黏滯"), "α=0.25", tr("thick", "厚盤")]} />
        <Param sym="Ṅ" name={tr('Emission rate', '發射率')} val={aDisc.emissionRate} unit="/M" min={0} max={20} step={0.5}
               fmt={(v) => v.toFixed(1)}
               onChange={(v) => { aDisc.emissionRate = v; force(); }}
               scaleLabels={["—", "10/M", tr("dense", "密集")]} />
        <div className="derived" style={{marginTop: 12}}>
          <div className="cell">
            <span className="k">{tr('Ṁ accretion', 'Ṁ 吸積率')}</span>
            <span className="v">{(aDisc.mDot || 0).toFixed(2)}<small>/M</small></span>
          </div>
          <div className="cell">
            <span className="k">{tr('N particles', 'N 粒子數')}</span>
            <span className="v">{aDisc.particles.length}<small>/{aDisc.maxParticles}</small></span>
          </div>
          <div className="cell">
            <span className="k">{tr('MRI active', 'MRI 啟用')}</span>
            <span className="v" style={{color: (aB > 0.05 && aDisc.enabled) ? 'var(--cyan)' : 'var(--fg-3)'}}>
              {(aB > 0.05 && aDisc.enabled) ? tr('✓ ON', '✓ 開') : '—'}
            </span>
          </div>
          <div className="cell">
            <span className="k">{tr('Σ swallowed', 'Σ 吞噬量')}</span>
            <span className="v">{aDisc.totalAccreted}</span>
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
              onClick={() => { sim.params.M = 1;                 // geometry stays in units of M
                               sim.params.Msun = pr.Msun;        // physical mass (solar) — drives class
                               sim.params.Q = pr.Q; sim.params.a = pr.a;  // dimensionless Q/M, a/M
                               sim.params.type = pr.type || 'bh';
                               sim.params.age = 0; sim.params.Z = 0.5;     // ms/giant: start at ZAMS / solar
                               // ms & giant surfaces are derived from mass; wd/ns honour the preset's value.
                               const ds = phys.deriveStellar(sim.params.type, pr.Msun, { age: 0, Z: 0.5 });
                               if (ds) { sim.params.R_star = ds.R_star; sim.params.T_eff = ds.T_eff; sim.params._stellarTouched = false; }
                               else {
                                 sim.params._stellarTouched = (pr.R_star != null || pr.T_eff != null);
                                 if (pr.R_star != null) sim.params.R_star = pr.R_star;
                                 if (pr.T_eff != null) sim.params.T_eff = pr.T_eff;
                               }
                               if (pr.B != null) sim.params.B = pr.B;
                               if (pr.disc != null) sim.disc.enabled = pr.disc;
                               if (sim.binary) sim.binary.M2 = Math.max(0.01, (sim.binary.M2sun || 8) / Math.max(0.01, pr.Msun));
                               sim.view.scale = phys.VIEW_SCALES[phys.uiCategory(pr.type || 'bh')];
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

// Presets store the physical mass Msun (solar) and the dimensionless spin/charge
// a/M, Q/M (geometric M = 1). Black-hole presets sit above the 3 M⊙ collapse
// threshold; the stellar presets carry their own type + surface state.
const PRESETS = [
  { name: 'Schwarzschild',          name_zh: 'Schwarzschild',     Msun: 10,  Q: 0,     a: 0,    B: 0,    disc: false, glyph: '○', tag: 'baseline',       tag_zh: '基準' },
  { name: 'Kerr (near-extremal)',   name_zh: 'Kerr（近極端）',     Msun: 10,  Q: 0,     a: 0.9,  B: 0.2,  glyph: '◐', tag: 'a/M ≈ 0.9',     tag_zh: 'a/M ≈ 0.9' },
  { name: 'Reissner-Nordström',     name_zh: 'Reissner-Nordström', Msun: 10,  Q: 0.8,   a: 0,    B: 0.1,  glyph: '◉', tag: 'charged',        tag_zh: '帶電' },
  { name: 'Kerr-Newman',            name_zh: 'Kerr-Newman',        Msun: 10,  Q: 0.47,  a: 0.6,  B: 0.4,  glyph: '◑', tag: 'full',           tag_zh: '完整' },
  { name: 'AGN · disc + jet',       name_zh: 'AGN · 盤 + 噴流',    Msun: 150, Q: 0,     a: 0.8,  B: 0.75, disc: true, glyph: '★', tag: 'MHD active',     tag_zh: 'MHD 啟用' },
  { name: 'Magnetar regime',        name_zh: '磁星態',             Msun: 1.5, Q: 0,     a: 0.8,  B: 0.95, disc: true, type: 'ns', R_star: 2.8, T_eff: 1.2e6, glyph: '⚡', tag: 'neutron · B↑↑', tag_zh: '中子星 · B↑↑' },
  { name: 'Naked singularity',      name_zh: '裸奇異點',           Msun: 5,   Q: 1.0,   a: 0.8,  B: 0,    glyph: '✕', tag: 'unshielded',     tag_zh: '無遮蔽' },
  { name: 'Pulsar (spinning NS)',   name_zh: '波霎（自旋中子星）', Msun: 1.4, Q: 0,     a: 0.36, B: 0.4,  type: 'ns', R_star: 3.2, T_eff: 8e5, glyph: '◉', tag: 'neutron star',  tag_zh: '中子星' },
  { name: 'Sirius B (WD)',          name_zh: '天狼星 B（白矮星）', Msun: 1.0, Q: 0,     a: 0.1,  B: 0.05, type: 'wd', R_star: 7.0, T_eff: 2.5e4, glyph: '○', tag: 'white dwarf',   tag_zh: '白矮星' },
  { name: 'Sun-like star',          name_zh: '類太陽恆星',         Msun: 1.0, Q: 0,     a: 0.05, B: 0.02, type: 'ms', R_star: 20,  T_eff: 5800, glyph: '✱', tag: 'main-seq.',     tag_zh: '主序' },
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
  // Physical (solar) masses for display: the geometric unit equals the primary's
  // solar mass, so totals/chirp scale linearly by sim.params.Msun.
  const Msun1 = sim.params.Msun || 1;
  const MtSun = Msun1 + (bin.M2sun || 0);
  const McSun = Mc * Msun1;
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
          <span className="v">{MtSun.toFixed(1)}<small>M⊙</small></span>
        </div>
        <div className="cell">
          <span className="k">{tr('chirp Mc', '啁啾質量 Mc')}</span>
          <span className="v">{McSun.toFixed(2)}<small>M⊙</small></span>
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

      {bin.enabled && bin.mt && (bin.mt.active || (bin.mt.novaCount || 0) > 0) && (() => {
        const mt = bin.mt;
        const donorL = mt.donor === 1 ? 'M₁' : 'M₂';
        const accL = mt.accretor === 1 ? 'M₁' : 'M₂';
        const Rd = mt.donor === 1 ? (sim.params.R_star || 0) : (bin.R_star2 || 0);
        const RLd = mt.donor === 1 ? (mt.RL1 || 0) : (mt.RL2 || 0);
        const modeL = mt.mode === 'ce' ? tr('common envelope', '共有包層')
          : mt.mode === 'unstable' ? tr('unstable', '不穩定')
          : mt.mode === 'stable' ? tr('stable', '穩定')
          : tr('none', '無');
        return (
          <div className="stellar-sub" style={{marginTop: 10}}>
            <div className="sub-head"><span>{tr('Mass transfer', '質量轉移')}</span><span className="hint">{modeL}</span></div>
            <div className="derived">
              <div className="cell"><span className="k">{tr('donor → accretor', '施體 → 受體')}</span><span className="v">{donorL} → {accL}</span></div>
              <div className="cell"><span className="k">q = M_d/M_a</span><span className="v">{(mt.q || 0).toFixed(2)}</span></div>
              <div className="cell"><span className="k">R★ / R_L {tr('(donor)', '（施體）')}</span><span className="v">{Rd.toFixed(1)} / {RLd.toFixed(1)}<small>M</small></span></div>
              <div className="cell"><span className="k">Ṁ</span><span className="v">{(mt.mdot || 0) > 1e-5 ? (mt.mdot || 0).toExponential(2) : '—'}<small>M⊙/M</small></span></div>
              <div className="cell"><span className="k">{tr('transferred', '已轉移')}</span><span className="v">{(mt.transferred || 0).toFixed(3)}<small>M⊙</small></span></div>
              <div className="cell"><span className="k">{tr('novae', '新星次數')}</span><span className="v">{mt.novaCount || 0}</span></div>
            </div>
          </div>
        );
      })()}

      {bin.novaFlash > 0 && (
        <div className="lock-banner" style={{marginTop: 10, borderColor: 'oklch(0.80 0.14 80)'}}>
          <span className="lock-glyph" style={{color: 'oklch(0.86 0.14 80)'}}>✸</span>
          <span>{trp('NOVA · #{n} — accreted H shell ignites', { n: (bin.mt && bin.mt.novaCount) || 0 })}</span>
        </div>
      )}
      {bin.snFlash > 0 && (
        <div className="lock-banner" style={{marginTop: 10, borderColor: 'oklch(0.78 0.18 55)'}}>
          <span className="lock-glyph" style={{color: 'oklch(0.84 0.16 55)'}}>✦</span>
          <span>{tr('TYPE Ia SUPERNOVA · white dwarf reached Chandrasekhar mass and detonated', 'Ia 型超新星 · 白矮星達錢德拉塞卡極限並爆轟')}</span>
        </div>
      )}
      {bin.ceFlash > 0 && (
        <div className="lock-banner" style={{marginTop: 10, borderColor: 'oklch(0.72 0.10 60)'}}>
          <span className="lock-glyph" style={{color: 'oklch(0.80 0.10 60)'}}>◍</span>
          <span>{tr('COMMON ENVELOPE · unstable overflow engulfs the pair — cores spiral in', '共有包層 · 不穩定溢流吞沒雙星 — 核心向內旋進')}</span>
        </div>
      )}

      {bin.merged && !bin.enabled && (
        <div className="lock-banner" style={{marginTop: 10, borderColor: 'oklch(0.72 0.14 150)'}}>
          <span className="lock-glyph" style={{color: 'oklch(0.78 0.14 150)'}}>✓</span>
          <span>{tr('MERGER COMPLETE', '合併完成')} · M_f = {(sim.params.Msun || 0).toFixed(1)} M⊙ · a_f/M = {(sim.params.a / sim.params.M).toFixed(2)} · E_GW = {(bin.eMergerGW || 0).toFixed(3)} Mc²</span>
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
