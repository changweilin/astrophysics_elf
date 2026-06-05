/* Config + scene persistence for the Kerr-Newman Lab browser demo — split out of
 * sim.js. Augments window.KNSim with saveConfig / readConfig / applyConfig.
 * Loads AFTER sim.js (see index.html). Storage is wrapped so private mode or a
 * corrupt payload can never throw into the running simulation.
 */
(function () {
  const KN = window.KNSim;

  // ── Config + scene persistence (localStorage) ──────────────────────
  // Stores the user-chosen configuration (BH/companion params, disc tuning,
  // overlay toggles, zoom, timescale) AND the live scene the user built up:
  // every orbiting body with its position/velocity, the selected body, and a
  // placed companion's orbital state. Transient/derived data (trails, tidal
  // stress, accretion particles, GW readouts) is left out and recomputed.
  const CONFIG_KEY = 'kn-lab-config-v1';
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const TYPES = { bh: 1, ns: 1, wd: 1, ms: 1, giant: 1 };

  function configSnapshot(sim) {
    const p = sim.params || {}, d = sim.disc, b = sim.binary, f = sim.flags || {}, v = sim.view || {};
    const binSnap = b ? {
      type: b.type, M2: b.M2, M2sun: b.M2sun, Q2: b.Q2, a2: b.a2,
      R_star2: b.R_star2, T_eff2: b.T_eff2, B2: b.B2, d: b.d,
      age2: b.age2, Z2: b.Z2, smbhStructure: b.smbhStructure,
      cepheid: !!b.cepheid, cepheidAmp: b.cepheidAmp,
      _stellarTouched: !!b._stellarTouched,
      enabled: !!b.enabled,
      merged: !!b.merged, eMergerGW: b.eMergerGW || 0,
    } : null;
    // A placed companion also stores its live orbital state so it resumes mid-orbit.
    if (binSnap && b.enabled) {
      binSnap.merged = !!b.merged;
      binSnap.cx = b.cx; binSnap.cy = b.cy; binSnap.d0 = b.d0;
      binSnap.x1 = b.x1; binSnap.y1 = b.y1; binSnap.x2 = b.x2; binSnap.y2 = b.y2;
      binSnap.vx1 = b.vx1; binSnap.vy1 = b.vy1; binSnap.vx2 = b.vx2; binSnap.vy2 = b.vy2;
    }
    return {
      params: {
        Msun: p.Msun, Q: p.Q, a: p.a, type: p.type,
        R_star: p.R_star, T_eff: p.T_eff, B: p.B,
        age: p.age, Z: p.Z,
        cepheid: !!p.cepheid, cepheidAmp: p.cepheidAmp,
        _stellarTouched: !!p._stellarTouched,
      },
      disc: d ? { enabled: !!d.enabled, alpha: d.alpha, emissionRate: d.emissionRate } : null,
      disc2: sim.disc2 ? { enabled: !!sim.disc2.enabled, alpha: sim.disc2.alpha, emissionRate: sim.disc2.emissionRate } : null,
      binary: binSnap,
      flags: { ...f },
      // Mass scale (stellar / intermediate / supermassive) + the supermassive
      // central structure, so a reload returns to the scale the user left.
      bhRegime: sim.bhRegime,
      smbhStructure: sim.smbhStructure,
      view: { scale: v.scale },
      timescale: sim.timescale,
      t: sim.t,
      // Mobile layout: remembered universe/settings splitter height (px).
      mDrawerH: isNum(sim.mDrawerH) ? sim.mDrawerH : undefined,
      // Live bodies the user spawned/launched — only the ones still orbiting.
      bodies: (sim.bodies || []).filter((bd) => bd.state === 'orbit').map((bd) => ({
        id: bd.id, name: bd.name, kind: bd.kind,
        radius: bd.radius, binding: bd.binding, charge: bd.charge || 0,
        x: bd.x, y: bd.y, vx: bd.vx, vy: bd.vy,
      })),
      selectedId: sim.selectedId,
      seq: sim.seq,
    };
  }

  // Write current config to storage, but only when it actually changed since
  // the last write (cheap string diff) — safe to call on a timer / every frame.
  function saveConfig(sim) {
    try {
      const json = JSON.stringify(configSnapshot(sim));
      if (json === sim._cfgJson) return;
      sim._cfgJson = json;
      localStorage.setItem(CONFIG_KEY, json);
    } catch (e) { /* storage blocked (private mode / quota) — skip silently */ }
  }

  function readConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      return (cfg && typeof cfg === 'object') ? cfg : null;
    } catch (e) { return null; }
  }

  // Merge a stored config onto a freshly created sim. Every field is validated
  // so a corrupt/old payload can never throw or poison the running simulation.
  function applyConfig(sim, cfg) {
    if (cfg === undefined) cfg = readConfig();
    if (!cfg) return false;
    const p = cfg.params;
    if (p && sim.params) {
      // Geometric mass is always 1 (geometry in units of M). The physical solar
      // mass is the persisted label; old configs (pre-Msun) fall back to a
      // sensible default for the restored type.
      sim.params.M = 1;
      if (isNum(p.Msun)) sim.params.Msun = p.Msun;
      else if (TYPES[p.type]) {
        const cat = window.KNphysics.uiCategory(p.type);
        sim.params.Msun = window.KNphysics.MASS_RANGES[cat].def;
      }
      if (isNum(p.Q)) sim.params.Q = p.Q;
      if (isNum(p.a)) sim.params.a = p.a;
      if (TYPES[p.type]) sim.params.type = p.type;
      if (isNum(p.R_star)) sim.params.R_star = p.R_star;
      if (isNum(p.T_eff)) sim.params.T_eff = p.T_eff;
      if (isNum(p.B)) sim.params.B = p.B;
      sim.params.age = isNum(p.age) ? p.age : 0;
      sim.params.Z = isNum(p.Z) ? p.Z : 0.5;
      sim.params._stellarTouched = !!p._stellarTouched;
      sim.params.cepheid = !!p.cepheid;
      sim.params.cepheidAmp = isNum(p.cepheidAmp) ? p.cepheidAmp : 0.07;
      // Stellar photosphere is derived — re-derive so restored R★/T★/colour always
      // match the persisted mass + drivers (and fix any legacy stored values).
      const ds = window.KNphysics.deriveStellar(sim.params.type, sim.params.Msun,
        { age: sim.params.age, Z: sim.params.Z, B: sim.params.B || 0, a: sim.params.a || 0,
          cepheid: sim.params.type === 'giant' && sim.params.cepheid });
      if (ds) { sim.params.R_star = ds.R_star; sim.params.T_eff = ds.T_eff; }
    }
    if (cfg.disc && sim.disc) {
      sim.disc.enabled = !!cfg.disc.enabled;
      if (isNum(cfg.disc.alpha)) sim.disc.alpha = cfg.disc.alpha;
      if (isNum(cfg.disc.emissionRate)) sim.disc.emissionRate = cfg.disc.emissionRate;
    }
    if (cfg.disc2 && sim.disc2) {
      sim.disc2.enabled = !!cfg.disc2.enabled;
      if (isNum(cfg.disc2.alpha)) sim.disc2.alpha = cfg.disc2.alpha;
      if (isNum(cfg.disc2.emissionRate)) sim.disc2.emissionRate = cfg.disc2.emissionRate;
    }
    if (cfg.binary && sim.binary) {
      const b = cfg.binary, B = sim.binary;
      if (TYPES[b.type]) B.type = b.type;
      if (isNum(b.M2sun)) B.M2sun = b.M2sun;
      else if (isNum(b.M2)) B.M2sun = b.M2 * (sim.params.Msun || 1);  // legacy: M2 was geometric
      // Geometric companion mass = solar-mass ratio to the primary (relative size + dynamics).
      B.M2 = Math.max(0.01, (B.M2sun || 1) / (sim.params.Msun || 1));
      if (isNum(b.Q2)) B.Q2 = b.Q2;
      if (isNum(b.a2)) B.a2 = b.a2;
      if (isNum(b.R_star2)) B.R_star2 = b.R_star2;
      if (isNum(b.T_eff2)) B.T_eff2 = b.T_eff2;
      if (isNum(b.B2)) B.B2 = b.B2;
      if (isNum(b.d)) { B.d = b.d; B.d0 = b.d; }
      B.age2 = isNum(b.age2) ? b.age2 : 0;
      B.Z2 = isNum(b.Z2) ? b.Z2 : 0.5;
      if (typeof b.smbhStructure === 'string') B.smbhStructure = b.smbhStructure;
      B.cepheid = !!b.cepheid;
      B.cepheidAmp = isNum(b.cepheidAmp) ? b.cepheidAmp : 0.07;
      B._stellarTouched = !!b._stellarTouched;
      // Companion photosphere is derived from its mass + drivers (age/Z/B/spin).
      const ds2 = window.KNphysics.deriveStellar(B.type, B.M2sun,
        { age: B.age2, Z: B.Z2, B: B.B2 || 0, a: B.a2 || 0,
          cepheid: B.type === 'giant' && B.cepheid });
      if (ds2) { B.R_star2 = ds2.R_star; B.T_eff2 = ds2.T_eff; }
      B.merged = !!b.merged;
      if (isNum(b.eMergerGW)) B.eMergerGW = b.eMergerGW;
      // Restore a placed companion's live orbit (positions/velocities/barycentre).
      if (b.enabled && isNum(b.x2) && isNum(b.y2) && isNum(b.vx2) && isNum(b.vy2)) {
        B.enabled = true;
        B.merged = !!b.merged;
        if (isNum(b.cx)) B.cx = b.cx;
        if (isNum(b.cy)) B.cy = b.cy;
        if (isNum(b.d0)) B.d0 = b.d0;
        if (isNum(b.x1)) B.x1 = b.x1;
        if (isNum(b.y1)) B.y1 = b.y1;
        B.x2 = b.x2; B.y2 = b.y2;
        if (isNum(b.vx1)) B.vx1 = b.vx1;
        if (isNum(b.vy1)) B.vy1 = b.vy1;
        B.vx2 = b.vx2; B.vy2 = b.vy2;
        B.held = false;
        B.trail1.length = 0; B.trail2.length = 0;
      }
    }
    if (cfg.flags && sim.flags) {
      for (const k of Object.keys(sim.flags)) {
        if (typeof cfg.flags[k] === 'boolean') sim.flags[k] = cfg.flags[k];
      }
    }
    // Restore the mass scale + supermassive structure (validated against the
    // known regimes). The restored params already match this scale, so we set
    // it directly rather than re-running setBHRegime (which would rebuild/stash).
    if (typeof cfg.bhRegime === 'string' && window.KNphysics.BH_REGIMES[cfg.bhRegime]) {
      sim.bhRegime = cfg.bhRegime;
    }
    if (typeof cfg.smbhStructure === 'string') sim.smbhStructure = cfg.smbhStructure;
    if (cfg.view && isNum(cfg.view.scale)) {
      sim.view.scale = Math.min(80, Math.max(4, cfg.view.scale));
    }
    if (isNum(cfg.timescale)) sim.timescale = cfg.timescale;
    if (isNum(cfg.t)) sim.t = cfg.t;
    if (isNum(cfg.mDrawerH)) sim.mDrawerH = cfg.mDrawerH;
    // Restore the live bodies the user built up (replacing the default seed).
    // A present-but-empty array means "the user cleared the scene" — honour it.
    if (Array.isArray(cfg.bodies)) {
      sim.bodies = cfg.bodies
        .filter((bd) => bd && isNum(bd.x) && isNum(bd.y) && isNum(bd.vx) && isNum(bd.vy))
        .map((bd) => ({
          id: Number.isInteger(bd.id) ? bd.id : sim.seq++,
          name: typeof bd.name === 'string' ? bd.name : 'body',
          kind: typeof bd.kind === 'string' ? bd.kind : 'planet',
          radius: isNum(bd.radius) ? bd.radius : 0.3,
          binding: isNum(bd.binding) ? bd.binding : 1,
          charge: isNum(bd.charge) ? bd.charge : 0,
          x: bd.x, y: bd.y, vx: bd.vx, vy: bd.vy,
          trail: [], state: 'orbit', stress: 0, stressPeak: 0, consumedAt: null,
        }));
      // Keep the id sequence ahead of every restored body.
      let maxId = 0;
      for (const bd of sim.bodies) if (bd.id > maxId) maxId = bd.id;
      sim.seq = Math.max(isNum(cfg.seq) ? cfg.seq : 0, maxId + 1);
      // Restore selection if it still points at a live body, else pick the last.
      if (Number.isInteger(cfg.selectedId) && sim.bodies.some((bd) => bd.id === cfg.selectedId)) {
        sim.selectedId = cfg.selectedId;
      } else {
        sim.selectedId = sim.bodies.length ? sim.bodies[sim.bodies.length - 1].id : null;
      }
    }
    // Record the resulting state as "already saved" so the first autosave no-ops.
    sim._cfgJson = JSON.stringify(configSnapshot(sim));
    return true;
  }

  Object.assign(KN, { saveConfig, readConfig, applyConfig, CONFIG_KEY });
})();
