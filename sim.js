/* Canvas renderer + integrator for the Kerr-Newman simulation.
 * Exports window.KNSim with: createSim, step, render
 */
(function () {
  const phys = window.KNphysics;

  function createSim(opts) {
    return {
      t: 0,
      params: {
        // Geometric mass is FROZEN at 1: all geometry is drawn in units of M
        // (gravitational radius), so the horizon is always ~1-2 units regardless
        // of the body's physical mass. Spin a and charge Q are therefore the
        // dimensionless ratios a/M and Q/M.
        M: 1.0, Q: 0.0, a: 0.5,
        // Physical mass in solar masses — a *label* that drives classification
        // (collapsed remnant -> WD/NS/BH by mass) and physical read-outs. It does
        // NOT change the rendered geometry. See KNphysics.MASS_RANGES / remnantType.
        Msun: 10.0,
        // central-body type: 'ms' | 'giant' | 'wd' | 'ns' | 'bh'
        // (wd/ns/bh are the collapsed-remnant flavours, auto-picked from Msun)
        type: 'bh',
        // physical surface radius (geometric units, M). Only used when type !== 'bh'.
        R_star: 3.0,
        // effective surface temperature (Kelvin) — colours the rendered sphere.
        T_eff: 1e6,
        // surface magnetic field strength (decorative; main MHD field is sim.params.B added below as needed)
      },
      // Central body kinematic state (world frame). All scene rendering pivots on this.
      primary: { x: 0, y: 0, vx: 0, vy: 0 },
      bodies: [],
      events: [],
      // pixels per geometric unit. `frame` locks the camera reference frame:
      // 'free' (manual pan) | 'm1' (primary) | 'm2' (companion) | 'com' (barycenter).
      view: { scale: 18, ox: 0, oy: 0, frame: 'free' },
      flags: {
        showErgo: true, showHorizon: true, showISCO: true, showPhoton: false,
        showDragField: true, showOrbits: true, showTidal: true, showLabels: true,
        showGrid: false, showGW: false, showLensing: false
      },
      paused: false,
      timescale: 1.0,
      selectedId: null,
      seq: 1,
    };
  }

  function addBody(sim, b) {
    const id = sim.seq++;
    sim.bodies.push({
      id, ...b,
      trail: [],
      state: 'orbit', // orbit | captured | spaghettified | escaped
      stress: 0,
      stressPeak: 0,
      consumedAt: null,
    });
    return id;
  }

  function logEv(sim, type, msg) {
    sim.events.unshift({ t: sim.t.toFixed(1), type, msg });
    if (sim.events.length > 30) sim.events.pop();
  }

  // Localized name for the surface a body impacts on a non-BH central/companion.
  // Returns both branches so callers can slot them into bilingual templates.
  function surfaceLabel(type) {
    return {
      ns: { en: 'neutron crust', zh: '中子星地殼' },
      wd: { en: 'WD surface',    zh: '白矮星表面' },
      ms: { en: 'photosphere',   zh: '光球層' },
      giant: { en: 'giant envelope', zh: '巨星外殼' },
    }[type] || { en: 'surface', zh: '表面' };
  }

  // ── Binary companion (placed by user; 2-body integration) ──
  function initBinary(sim) {
    sim.binary = {
      enabled: false,
      // Companion has its own full parameter set — same shape as central body.
      type: 'bh',        // 'ms' | 'giant' | 'wd' | 'ns' | 'bh' (remnant by M2sun)
      M2sun: 8.0,        // companion physical mass (solar masses) — classification + label
      M2: 0.8,           // companion geometric mass = M2sun / Msun (relative size + dynamics)
      Q2: 0,             // companion charge (|Q2| <= M2 for sub-extremal)
      a2: 0,             // companion spin (J2 / M2 c)
      R_star2: 3.0,      // companion surface radius (used when type !== 'bh')
      T_eff2: 1e6,       // companion photosphere temperature
      B2: 0.30,          // companion magnetic field (matches the primary's default
                         // so a placed companion is magnetised symmetrically — drives
                         // its own Blandford-Znajek jet and shows poloidal field lines)
      d:  18,            // current separation
      d0: 18,            // initial separation (for inspiral progress bar)
      theta: 0,          // orbital phase
      omega: 0,          // current angular velocity
      cx: 0, cy: 0,      // conserved barycentre (centre of mass) — both stars orbit this
      x1: 0, y1: 0,      // primary position (orbits the barycentre)
      y2: 0, x2: 0,      // secondary position
      vx1: 0, vy1: 0,    // primary velocity
      vx2: 0, vy2: 0,    // secondary velocity
      inspiralRate: 1,   // ×Peters GW back-reaction (1 = true GR rate; ~4 visible orbits)
      classical: false,  // true = GW inspiral paused (stable circle); set only by
                         // circularizeBinary (double-click). Default: free-inspiral.
      merged: false,
      mergerFlash: 0,
      ringdownPhase: 0,
      trail1: [], trail2: [],
      // GW energy readouts (set by stepBinary): instantaneous luminosity,
      // cumulative energy radiated during inspiral, and the merger-burst energy.
      gwLum: 0, eGW: 0, eMergerGW: 0,
      // last computed metrics (for UI readout)
      lastPeters: { omega: 0, ddot: 0, t_merge: Infinity, Mc: 0, Mt: 0, mu: 0, Lgw: 0 },
    };
  }

  // Place / arm the companion. Called from UI tab + canvas placement.
  // Sets up a real two-body system: both stars orbit the conserved barycentre
  // that the two initial positions define. opts.vx/vy (if given) are the
  // companion's velocity in the lab frame; the primary recoil is derived.
  function placeCompanion(sim, wx, wy, opts = {}) {
    const bin = sim.binary;
    if (!bin) return;
    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;
    bin.x1 = sim.primary.x; bin.y1 = sim.primary.y;
    // Keep the companion clear of the contact radius. The photospheres of large
    // stars (main sequence R ~ 18, giant R ~ 24) easily exceed the requested
    // separation, so a freshly placed/enabled pair would merge or vanish on the
    // very next step (worst for two same-category stars). Push the point radially
    // outward to ~1.25x the summed surfaces. Compact bodies are unaffected.
    const surfaceOf = (type, M, Q, a, Rs) => (type || 'bh') === 'bh'
      ? (() => { const h = phys.horizons(M, Q || 0, a || 0); return (isFinite(h.rplus) && !h.naked) ? h.rplus : 2 * M; })()
      : (Rs || 3);
    const rMin = 1.25 * (
      surfaceOf(sim.params.type, M1, sim.params.Q, sim.params.a, sim.params.R_star) +
      surfaceOf(bin.type, M2, bin.Q2, bin.a2, bin.R_star2));
    let dx0 = wx - bin.x1, dy0 = wy - bin.y1;
    let r = Math.hypot(dx0, dy0);
    if (r < 1e-6) { dx0 = 1; dy0 = 0; r = 1; }          // degenerate → +x axis
    if (r < rMin) {
      const f = rMin / r;
      wx = bin.x1 + dx0 * f; wy = bin.y1 + dy0 * f;
      dx0 *= f; dy0 *= f; r = rMin;
      logEv(sim, 'amber', trp('separation raised to {r} M to clear stellar contact', { r: r.toFixed(1) }));
    }
    // Fit the camera so a widely separated (large-star) pair stays on screen.
    // Only ever zoom out, so a deliberately close placement is left framed.
    if (sim._vw && sim._vh) {
      const fit = (Math.min(sim._vw, sim._vh) / 2) * 0.6 / Math.max(r, 1);
      if (fit < sim.view.scale) sim.view.scale = Math.max(4, Math.min(80, fit));
    }
    bin.x2 = wx; bin.y2 = wy;
    bin.d = r; bin.d0 = r;
    bin.theta = Math.atan2(dy0, dx0);
    // Barycentre from the two initial positions — conserved from here on.
    bin.cx = (M1 * bin.x1 + M2 * bin.x2) / Mt;
    bin.cy = (M1 * bin.y1 + M2 * bin.y2) / Mt;
    // Relative (separation) velocity V = ẋ₂ − ẋ₁.
    let Vx, Vy;
    if (opts.vx != null && opts.vy != null) {
      // opts are the companion's lab velocity v₂ = (M1/Mt)·V  ⇒  V = v₂·Mt/M1
      Vx = opts.vx * Mt / M1; Vy = opts.vy * Mt / M1;
    } else {
      // Stable two-body circular orbit: relative speed √(Mt / r), tangential.
      const vrel = Math.sqrt(Mt / Math.max(0.5, r));
      const dir = Math.sign(sim.params.a || 1);
      Vx = -dy0 / r * vrel * dir;
      Vy =  dx0 / r * vrel * dir;
    }
    splitTwoBody(bin, M1, M2, Vx, Vy);
    bin.enabled = true;
    // A freshly placed companion always free-inspirals; never inherit a stale
    // classical-freeze left by a previous double-click circularisation. The
    // stable-circle mode is only ever entered explicitly via circularizeBinary.
    bin.classical = false;
    bin.merged = false;
    bin.mergerFlash = 0;
    bin.trail1.length = 0;
    bin.trail2.length = 0;
  }

  // Split a relative velocity V (= v₂ − v₁) onto the two stars about the
  // conserved barycentre. Positions are left as-is; velocities are set so the
  // barycentre stays fixed (total momentum zero in the COM frame).
  function splitTwoBody(bin, M1, M2, Vx, Vy) {
    const Mt = M1 + M2;
    const f1 = M2 / Mt, f2 = M1 / Mt;
    bin.vx1 = -f1 * Vx; bin.vy1 = -f1 * Vy;
    bin.vx2 =  f2 * Vx; bin.vy2 =  f2 * Vy;
    bin.omega = Math.hypot(Vx, Vy) / Math.max(0.1, bin.d || 1);
  }

  function removeCompanion(sim) {
    const bin = sim.binary;
    if (!bin) return;
    bin.enabled = false;
    bin.merged = false;
    bin.mergerFlash = 0;
    bin.x2 = 0; bin.y2 = 0;
    bin.vx2 = 0; bin.vy2 = 0;
    bin.trail1.length = 0;
    bin.trail2.length = 0;
  }

  function stepBinary(sim, dt) {
    const bin = sim.binary;
    if (!bin) return;
    if (!bin.enabled) {
      bin.x1 = sim.primary.x; bin.y1 = sim.primary.y;
      if (bin.mergerFlash > 0) bin.mergerFlash = Math.max(0, bin.mergerFlash - dt);
      return;
    }

    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;

    if (bin.held) {
      // User is repositioning the companion — freeze the orbit and re-derive the
      // barycentre from the two current positions so motion resumes smoothly.
      bin.d = Math.hypot(bin.x2 - bin.x1, bin.y2 - bin.y1);
      bin.theta = Math.atan2(bin.y2 - bin.y1, bin.x2 - bin.x1);
      bin.cx = (M1 * bin.x1 + M2 * bin.x2) / Mt;
      bin.cy = (M1 * bin.y1 + M2 * bin.y2) / Mt;
      bin.trail1.length = 0; bin.trail2.length = 0;
      return;
    }

    // ── True two-body motion about the conserved barycentre ──
    // Evolve the relative (separation) coordinate D = x₂ − x₁ under the two-body
    // equation D̈ = −(M₁+M₂)/r³ · D, then split D and V back onto both stars.
    // Recomputing D and V from the absolute state each step absorbs any external
    // edits (placement, drag-launch, reposition).
    let Dx = bin.x2 - bin.x1, Dy = bin.y2 - bin.y1;
    const r2 = Dx * Dx + Dy * Dy;
    const r  = Math.sqrt(r2);
    if (r < 1e-3) return;
    let Vx = bin.vx2 - bin.vx1, Vy = bin.vy2 - bin.vy1;

    const inv = 1 / (r * r2);
    let arx = -Mt * Dx * inv;
    let ary = -Mt * Dy * inv;

    const vrel = Math.hypot(Vx, Vy);

    // Peters readout (used for UI + the GW radiation reaction below)
    const pet = phys.peters(M1, M2, r);
    bin.lastPeters = pet;

    // ── Conservative (classical) two-body step ──
    // The orbital *curvature* is purely Newtonian/Keplerian — same equations the
    // trajectory preview uses — so the path stays a clean ellipse/circle between
    // GW losses. Radiation reaction is layered on top as an adiabatic contraction.
    Vx += arx * dt; Vy += ary * dt;
    Dx += Vx * dt;  Dy += Vy * dt;

    // ── GW radiation reaction: Peters (1964), adiabatic ──
    // A radiating binary follows the orbit-averaged inspiral law
    //   da/dt = −(64/5) M1 M2 (M1+M2) / a³        (= pet.ddot, geometric units),
    // visually accelerated ×inspiralRate. Rather than a hand-tuned tangential
    // drag (which had to be capped, losing both the chirp and the slider), shrink
    // the separation directly at this rate and keep the pair quasi-circular
    // (v_circ ∝ 1/√r, so the orbit speeds up — the chirp — as it tightens). Energy
    // and angular momentum then bleed off at the true GR rate: the spiral steepens
    // as a⁻³ and the time to merger is (5/256) d⁴ / (M1 M2 (M1+M2)) / inspiralRate.
    // Loss is set by BOTH masses (the binary radiates as one quadrupole), and the
    // contraction is split back onto both stars about the conserved barycentre.
    if (!bin.classical) {
      const rNow = Math.hypot(Dx, Dy);
      let scale = 1 + (pet.ddot * bin.inspiralRate * dt) / Math.max(0.05, rNow);
      if (scale < 0.5) scale = 0.5;   // per-step clamp — never plunge in one step
      if (scale < 1) {
        Dx *= scale; Dy *= scale;
        const vboost = 1 / Math.sqrt(scale);   // v_circ ∝ 1/√r → chirp
        Vx *= vboost; Vy *= vboost;
      }
    }

    // Split back onto the two stars about the conserved barycentre.
    const f1 = M2 / Mt, f2 = M1 / Mt;
    bin.x1 = bin.cx - f1 * Dx; bin.y1 = bin.cy - f1 * Dy;
    bin.x2 = bin.cx + f2 * Dx; bin.y2 = bin.cy + f2 * Dy;
    bin.vx1 = -f1 * Vx; bin.vy1 = -f1 * Vy;
    bin.vx2 =  f2 * Vx; bin.vy2 =  f2 * Vy;

    // Bookkeeping
    bin.d     = Math.hypot(Dx, Dy);
    bin.theta = Math.atan2(Dy, Dx);
    bin.omega = vrel / Math.max(0.1, bin.d);

    // GW energy bookkeeping. Instantaneous luminosity is the Peters rate; the
    // cumulative energy radiated equals the orbital binding energy bled away
    // since placement (energy conservation): ΔE = (M1 M2 / 2)(1/d − 1/d₀).
    bin.gwLum = pet.Lgw;
    bin.eGW = bin.d0 > 0
      ? Math.max(0, (M1 * M2 / 2) * (1 / Math.max(0.05, bin.d) - 1 / bin.d0))
      : 0;

    // Trails for BOTH stars (they now mutually orbit)
    bin.trail1.push(bin.x1, bin.y1);
    if (bin.trail1.length > 1200) bin.trail1.splice(0, bin.trail1.length - 1200);
    bin.trail2.push(bin.x2, bin.y2);
    if (bin.trail2.length > 1200) bin.trail2.splice(0, bin.trail2.length - 1200);

    // Merger / impact / escape
    const cType = sim.params.type || 'bh';
    const sType = bin.type || 'bh';
    const { rplus: r1plus, naked: n1 } = phys.horizons(M1, sim.params.Q, sim.params.a);
    const { rplus: r2plus, naked: n2 } = phys.horizons(M2, bin.Q2 || 0, bin.a2 || 0);
    const surface1 = cType === 'bh'
      ? (isFinite(r1plus) && !n1 ? r1plus : M1)
      : (sim.params.R_star || 3);
    const surface2 = sType === 'bh'
      ? (isFinite(r2plus) && !n2 ? r2plus : M2)
      : (bin.R_star2 || 3);
    if (cType === 'bh' && sType === 'bh') {
      const rmerge = surface1 + surface2 * 1.05;
      if (bin.d <= rmerge && !bin.merged) {
        // Coalescence: the final plunge + ringdown radiates a GW burst whose
        // energy and the remnant spin depend on the mass ratio and BOTH
        // progenitor spins (see phys.mergerRemnant). Equal-mass non-spinning →
        // ~5.5% of Mt radiated and a_f/M_f ≈ 0.69; extreme ratios radiate little.
        const chi1 = sim.params.a / Math.max(0.05, M1);   // dimensionless spins a/M
        const chi2 = (bin.a2 || 0) / Math.max(0.05, M2);
        const orbitSign = Math.sign(sim.params.a || 1);
        const rem = phys.mergerRemnant(M1, M2, chi1, chi2, orbitSign);
        bin.merged = true;
        bin.mergerFlash = 1.6;
        bin.eMergerGW = rem.eRad;     // GW energy in the merger/ringdown burst
        bin.eGW = (bin.eGW || 0) + rem.eRad;
        // Combined physical mass (solar). rem.Mf is geometric (units of the old
        // primary M=1), and Msun is the solar-mass-per-unit factor, so the final
        // solar mass is rem.Mf · Msun. Geometry stays in units of M, so the
        // geometric mass is reset to 1 and the spin becomes the dimensionless a/M.
        const MsunFinal = rem.Mf * (sim.params.Msun || 1);
        sim.params.M = 1;
        sim.params.Msun = MsunFinal;
        sim.params.type = 'bh';           // BH + BH coalescence -> black hole
        sim.params.Q = sim.params.Q + (bin.Q2 || 0);
        sim.params.a = rem.af;            // a/M (geometric M = 1)
        bin.enabled = false;
        logEv(sim, 'warn', trp(
          'MERGER · η={eta} · M_f={mf} M⊙ · E_GW={egw} c² ({pct}%)',
          { eta: rem.eta.toFixed(3), mf: MsunFinal.toFixed(1), egw: rem.eRad.toFixed(3), pct: (rem.eRad / Mt * 100).toFixed(1) }));
        logEv(sim, 'amber', trp('ringdown · a_f/M_f → {af}', { af: rem.af.toFixed(3) }));
        return;
      }
    } else {
      // At least one non-BH — collision when surfaces touch.
      if (bin.d < surface1 + surface2) {
        bin.enabled = false;
        logEv(sim, 'warn', trp('companion contact at r={r} M', { r: bin.d.toFixed(2) }));
        return;
      }
    }
    if (bin.d > 80) {
      bin.enabled = false;
      logEv(sim, 'amber', tr('companion escaped binary system', '伴星逃離雙星系統'));
    }
  }

  // RK2 midpoint step
  function integrate(sim, dt) {
    const { M, Q, a } = sim.params;
    const bin = sim.binary || null;
    // Frame-invariant geometry — identical for every body this frame, so resolve
    // it once here instead of recomputing inside the per-body loop.
    const cType = sim.params.type || 'bh';
    const { rplus, naked } = phys.horizons(M, Q, a);
    const binOn = !!(bin && bin.enabled);
    const sType = binOn ? (bin.type || 'bh') : 'bh';
    const compH = binOn ? phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0) : null;
    for (const b of sim.bodies) {
      if (b.state !== 'orbit') continue;
      if (b.held) { b.trail.length = 0; continue; } // frozen while user repositions
      const a1 = phys.acceleration(b.x, b.y, b.vx, b.vy, M, Q, a, b.charge || 0, bin);
      const mx = b.x + b.vx * dt * 0.5;
      const my = b.y + b.vy * dt * 0.5;
      const mvx = b.vx + a1.ax * dt * 0.5;
      const mvy = b.vy + a1.ay * dt * 0.5;
      const a2 = phys.acceleration(mx, my, mvx, mvy, M, Q, a, b.charge || 0, bin);
      b.vx += a2.ax * dt;
      b.vy += a2.ay * dt;
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;

      // trail
      b.trail.push(b.x, b.y);
      if (b.trail.length > 1200) b.trail.splice(0, b.trail.length - 1200);

      const r = Math.hypot(b.x, b.y);

      // ── Binary-mode capture & tidal checks ──────────────
      if (bin && bin.enabled) {
        const r1 = Math.hypot(b.x - bin.x1, b.y - bin.y1);
        const r2 = Math.hypot(b.x - bin.x2, b.y - bin.y2);
        // tidal stress: take worst of two bodies
        const t1 = phys.tidalStress(r1, M, b.radius || 0.4, b.binding || 1);
        const t2 = phys.tidalStress(r2, bin.M2, b.radius || 0.4, b.binding || 1);
        b.stress = Math.max(t1, t2);
        if (b.stress > b.stressPeak) b.stressPeak = b.stress;
        if (b.kind !== 'probe' && b.kind !== 'ship' && b.stress > 1.15) {
          b.state = 'spaghettified'; b.consumedAt = sim.t;
          logEv(sim, 'warn', trp('{name} — spaghettified between binary pair', { name: b.name }));
          continue;
        }
        // Primary capture / surface impact
        if (cType === 'bh') {
          if (!naked && r1 < (isFinite(rplus) ? rplus : M)) {
            b.state = 'captured'; b.consumedAt = sim.t;
            logEv(sim, 'warn', trp('{name} — captured by primary BH', { name: b.name }));
            continue;
          }
        } else {
          const Rs1 = sim.params.R_star || 3;
          if (r1 < Rs1) {
            b.state = 'captured'; b.consumedAt = sim.t;
            const label = surfaceLabel(cType);
            logEv(sim, 'warn', trp('{name} — impacted primary {surface}', { name: b.name, surface: tr(label.en, label.zh) }));
            continue;
          }
        }
        // Companion capture / surface impact
        if (sType === 'bh') {
          if (!compH.naked && r2 < (isFinite(compH.rplus) ? compH.rplus : bin.M2)) {
            b.state = 'captured'; b.consumedAt = sim.t;
            logEv(sim, 'warn', trp('{name} — captured by companion BH', { name: b.name }));
            continue;
          }
        } else {
          const Rs2 = bin.R_star2 || 3;
          if (r2 < Rs2) {
            b.state = 'captured'; b.consumedAt = sim.t;
            const label = surfaceLabel(sType);
            logEv(sim, 'warn', trp('{name} — impacted companion {surface}', { name: b.name, surface: tr(label.en, label.zh) }));
            continue;
          }
        }
        if (r > 50) {
          b.state = 'escaped'; b.consumedAt = sim.t;
          logEv(sim, 'amber', trp('{name} — ejected by binary', { name: b.name }));
        }
        continue;  // skip single-BH checks below
      }

      // ── Single-BH checks (original) ─────────────────────
      const tidal = phys.tidalStress(r, M, b.radius || 0.4, b.binding || 1);
      b.stress = tidal;
      if (tidal > b.stressPeak) b.stressPeak = tidal;
      if (b.kind !== 'probe' && b.kind !== 'ship' && tidal > 1.15) {
        b.state = 'spaghettified'; b.consumedAt = sim.t;
        logEv(sim, 'warn', trp('{name} — spaghettified at r = {r} M', { name: b.name, r: r.toFixed(2) }));
        continue;
      }
      // Surface impact for stellar centrals
      if (cType !== 'bh') {
        const Rs = sim.params.R_star || 3;
        if (r < Rs) {
          b.state = 'captured'; b.consumedAt = sim.t;
          const label = surfaceLabel(cType);
          logEv(sim, 'warn', trp('{name} — impacted {surface} at r = {r} M', { name: b.name, surface: tr(label.en, label.zh), r: r.toFixed(2) }));
          continue;
        }
      } else {
        if (!naked && r < rplus) {
          b.state = 'captured'; b.consumedAt = sim.t;
          logEv(sim, 'warn', trp('{name} — crossed r₊, mass added to BH', { name: b.name }));
          continue;
        }
        if (naked && r < 0.4) {
          b.state = 'captured'; b.consumedAt = sim.t;
          logEv(sim, 'warn', trp('{name} — annihilated at naked singularity', { name: b.name }));
          continue;
        }
      }
      if (r > 50) {
        b.state = 'escaped'; b.consumedAt = sim.t;
        logEv(sim, 'amber', trp('{name} — escaped beyond detector range', { name: b.name }));
      }
    }
  }

  // Forward-integrate a hypothetical body for trajectory preview.
  function predictTrajectory(sim, x0, y0, vx0, vy0, steps = 240, dt = 0.05) {
    const { M, Q, a } = sim.params;
    const { rplus, naked } = phys.horizons(M, Q, a);
    const bin = sim.binary || null;
    // Capture surfaces for binary mode — same convention as predictBinaryTrajectory
    // and the live integrator (BH → outer horizon, stellar → R_star), so the
    // previewed fate matches what actually happens on release.
    let s1 = 0, s2 = 0;
    if (bin && bin.enabled) {
      const { rplus: rp2, naked: n2 } = phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
      s1 = (sim.params.type || 'bh') === 'bh' ? (isFinite(rplus) && !naked ? rplus : M) : (sim.params.R_star || 3);
      s2 = (bin.type || 'bh') === 'bh' ? (isFinite(rp2) && !n2 ? rp2 : bin.M2) : (bin.R_star2 || 3);
    }
    let x = x0, y = y0, vx = vx0, vy = vy0;
    const pts = [x, y];
    for (let i = 0; i < steps; i++) {
      const a1 = phys.acceleration(x, y, vx, vy, M, Q, a, 0, bin);
      const mx = x + vx * dt * 0.5;
      const my = y + vy * dt * 0.5;
      const mvx = vx + a1.ax * dt * 0.5;
      const mvy = vy + a1.ay * dt * 0.5;
      const a2 = phys.acceleration(mx, my, mvx, mvy, M, Q, a, 0, bin);
      vx += a2.ax * dt; vy += a2.ay * dt;
      x  += vx * dt;    y  += vy * dt;
      pts.push(x, y);
      if (bin && bin.enabled) {
        const r1 = Math.hypot(x - bin.x1, y - bin.y1);
        const r2 = Math.hypot(x - bin.x2, y - bin.y2);
        if (r1 < s1) return { pts, fate: 'capture' };
        if (r2 < s2) return { pts, fate: 'capture' };
        if (Math.hypot(x, y) > 60) return { pts, fate: 'escape' };
      } else {
        const r = Math.hypot(x, y);
        if (r > 60) return { pts, fate: 'escape' };
        if (!naked && r < rplus) return { pts, fate: 'capture' };
        if (naked && r < 0.4) return { pts, fate: 'capture' };
      }
    }
    return { pts, fate: 'bound' };
  }

  // Classical two-body prediction for a companion drag-launch — NO GW reaction,
  // so the previewed curvature is pure Newtonian (same convention as the single
  // body preview). Forward-integrates the separation D = x2 - x1 under the
  // two-body law D̈ = -(M1+M2)/r³ · D and returns the companion's path about the
  // conserved barycentre, plus its fate (contact / escape / bound).
  function predictBinaryTrajectory(sim, vx2, vy2, steps = 240, dt = 0.05) {
    const bin = sim.binary;
    if (!bin || !bin.enabled) return { pts: [], fate: 'bound' };
    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;
    const f2 = M1 / Mt;
    const cx = (M1 * bin.x1 + M2 * bin.x2) / Mt;
    const cy = (M1 * bin.y1 + M2 * bin.y2) / Mt;
    const { rplus: rp1, naked: n1 } = phys.horizons(M1, sim.params.Q, sim.params.a);
    const { rplus: rp2, naked: n2 } = phys.horizons(M2, bin.Q2 || 0, bin.a2 || 0);
    const s1 = (sim.params.type || 'bh') === 'bh' ? (isFinite(rp1) && !n1 ? rp1 : M1) : (sim.params.R_star || 3);
    const s2 = (bin.type || 'bh') === 'bh' ? (isFinite(rp2) && !n2 ? rp2 : M2) : (bin.R_star2 || 3);
    const rContact = s1 + s2;
    let Dx = bin.x2 - bin.x1, Dy = bin.y2 - bin.y1;
    let Vx = vx2 * Mt / M1, Vy = vy2 * Mt / M1;   // lab v2 -> relative V (barycentre fixed)
    const pts = [cx + f2 * Dx, cy + f2 * Dy];
    for (let i = 0; i < steps; i++) {
      const r2 = Dx * Dx + Dy * Dy, r = Math.sqrt(r2);
      if (r < 1e-3) break;
      const inv = 1 / (r * r2);
      const mx = Dx + Vx * dt * 0.5, my = Dy + Vy * dt * 0.5;   // midpoint position
      const mr2 = mx * mx + my * my, mr = Math.sqrt(mr2), minv = 1 / (mr * mr2);
      Vx += -Mt * mx * minv * dt; Vy += -Mt * my * minv * dt;
      Dx += Vx * dt; Dy += Vy * dt;
      pts.push(cx + f2 * Dx, cy + f2 * Dy);
      const rr = Math.hypot(Dx, Dy);
      if (rr < rContact) return { pts, fate: 'capture' };
      if (rr > 80) return { pts, fate: 'escape' };
    }
    return { pts, fate: 'bound' };
  }

  // Exact-GR companion to predictTrajectory: the full-physics geodesic for the same
  // launch, drawn as a second reference line so the GR-vs-Newtonian difference is
  // visible. It does NOT replace predictTrajectory (that one must match the live
  // pseudo-Newtonian bodies). The bridge (window.KNFull) runs the adaptive
  // integrator off the legacy engine; this is throttled and the last result is
  // reused between recomputes so the per-frame aim loop stays smooth. Returns null
  // when the bridge is unavailable (e.g. not yet loaded) so the caller can skip it.
  let _g6 = { t: -1e9, x: NaN, y: NaN, vx: NaN, vy: NaN, key: '', value: null };
  function predictGeodesicTrajectory(sim, x0, y0, vx0, vy0) {
    const KNFull = window.KNFull;
    if (!KNFull || typeof KNFull.previewGeodesic !== 'function') return null;
    // Binary mode is a moving two-body field the single-particle geodesic can't
    // represent, so only offer the GR line for the isolated central body.
    if (sim.binary && sim.binary.enabled) return null;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const key = `${sim.params.M}|${sim.params.Q}|${sim.params.a}`;
    const moved = Math.abs(x0 - _g6.x) + Math.abs(y0 - _g6.y) +
                  20 * (Math.abs(vx0 - _g6.vx) + Math.abs(vy0 - _g6.vy));
    // Recompute at most ~15x/s, or sooner if the aim changed appreciably.
    if (_g6.value && key === _g6.key && now - _g6.t < 70 && moved < 0.15) return _g6.value;
    const value = KNFull.previewGeodesic(sim.params, x0, y0, vx0, vy0);
    _g6 = { t: now, x: x0, y: y0, vx: vx0, vy: vy0, key, value };
    return value;
  }

  function step(sim, realDt) {
    if (sim.paused) return;
    // Total sim-time to advance this frame. The per-macro-step dt is capped at
    // `maxStep` for integrator stability, so a large timescale advances by
    // running MORE macro-steps rather than one huge (unstable, and previously
    // clamped-to-no-effect) step. A guard caps the work per frame so very high
    // multipliers can't spiral the loop.
    const maxStep = 0.05, sub = 4, guardMax = 256;
    let remaining = Math.min(0.05, realDt) * sim.timescale;
    let guard = 0;
    while (remaining > 1e-6 && guard < guardMax) {
      const dt = Math.min(maxStep, remaining);
      for (let i = 0; i < sub; i++) {
        stepBinary(sim, dt / sub);
        integrate(sim, dt / sub);
      }
      if (window.KNDisc) window.KNDisc.step(sim, dt);
      sim.t += dt;
      remaining -= dt;
      guard++;
    }
  }

  // ── Camera reference-frame lock ───────────────────────────
  // Returns the world point the camera should pin to screen centre for the
  // active frame, or null in 'free' mode (manual pan). m2/com need the binary.
  function frameAnchor(sim) {
    const mode = (sim.view && sim.view.frame) || 'free';
    if (mode === 'free') return null;
    const bin = sim.binary;
    const p = sim.primary;
    if (bin && bin.enabled) {
      if (mode === 'm1') return { x: bin.x1, y: bin.y1 };   // moving primary
      if (mode === 'm2') return { x: bin.x2, y: bin.y2 };   // moving companion
      if (mode === 'com') return { x: bin.cx, y: bin.cy };  // conserved barycentre
    }
    // m1/m2/com requested without an active binary — centre the static primary.
    return { x: p.x, y: p.y };
  }

  // Drive view.ox/oy so the frame anchor stays centred. worldToScreen maps
  // (x + ox) about the centre, so pinning anchor.x means ox = -anchor.x.
  function applyFrameLock(sim) {
    const anchor = frameAnchor(sim);
    if (!anchor) return;
    sim.view.ox = -anchor.x;
    sim.view.oy = -anchor.y;
  }

  // ── Double-click → classical stable periodic orbit ────────
  // Regular body: keep the current direction of motion, rescale speed to the
  // local circular velocity of the demo's GR-augmented potential about the
  // primary (an at-rest body gets a tangential kick → circle; a moving one keeps
  // its heading → circle or ellipse). The pure-Newtonian sqrt(M/r) is too slow
  // for the well and makes the body spiral in and merge. Returns the speed.
  function circularizeBody(sim, b) {
    if (!b) return 0;
    const p = sim.primary;
    const dx = b.x - p.x, dy = b.y - p.y;
    const r = Math.max(0.5, Math.hypot(dx, dy));
    const vc = window.KNphysics.circularSpeed(r, sim.params.M) || Math.sqrt(sim.params.M / r);
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 1e-6) {
      b.vx = b.vx / sp * vc;
      b.vy = b.vy / sp * vc;
    } else {
      const dir = Math.sign(sim.params.a || 1);
      b.vx = -dy / r * vc * dir;
      b.vy =  dx / r * vc * dir;
    }
    if (b.trail) b.trail.length = 0;
    return vc;
  }

  // Binary pair: seed both stars with the classical stable circular orbit about
  // their common barycentre. The relative (separation) speed is the two-body
  // circular value √((M1+M2) / d), tangential; splitTwoBody shares it between the
  // stars by mass fraction so the barycentre stays fixed. Returns the companion's
  // resulting lab speed.
  function circularizeBinary(sim) {
    const bin = sim.binary;
    if (!bin || !bin.enabled) return 0;
    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;
    const dx = bin.x2 - bin.x1, dy = bin.y2 - bin.y1;
    const d = Math.max(0.5, Math.hypot(dx, dy));
    bin.d = d;
    // The circular speed is only the INITIAL condition: a real binary is a GR
    // source, so once time flows it must inspiral. Keep classical = false so the
    // Peters radiation reaction acts from this clean circular start (it does not
    // hold a perpetual Newtonian circle).
    bin.classical = false;
    const vrel = Math.sqrt(Mt / d);
    const dir = Math.sign(sim.params.a || 1);
    const Vx = -dy / d * vrel * dir;
    const Vy =  dx / d * vrel * dir;
    splitTwoBody(bin, M1, M2, Vx, Vy);
    bin.trail1.length = 0;
    bin.trail2.length = 0;
    return Math.hypot(bin.vx2, bin.vy2);
  }

  // Launch the companion with a user-chosen lab velocity (vx2,vy2). The relative
  // velocity and the primary's recoil are derived so the barycentre stays fixed.
  function setBinaryVelocity(sim, vx2, vy2) {
    const bin = sim.binary;
    if (!bin || !bin.enabled) return;
    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;
    bin.classical = false;   // a freshly thrown pair free-inspirals again
    // v₂ = (M1/Mt)·V  ⇒  relative velocity V = v₂·Mt/M1
    splitTwoBody(bin, M1, M2, vx2 * Mt / M1, vy2 * Mt / M1);
    bin.trail1.length = 0;
    bin.trail2.length = 0;
  }

  // --- renderer ---
  function worldToScreen(sim, w, h, x, y) {
    return [w / 2 + (x + sim.view.ox) * sim.view.scale,
            h / 2 + (y + sim.view.oy) * sim.view.scale];
  }
  // Allocation-free variant for hot per-point loops (trails, disc particles, GW
  // grid): returns a single reused scratch array, so the `const [x,y] = …`
  // call sites cost no garbage. Safe ONLY when the result is read immediately
  // and never held across the next call — never keep two results live at once.
  const _w2s = [0, 0];
  function worldToScreenInto(sim, w, h, x, y) {
    _w2s[0] = w / 2 + (x + sim.view.ox) * sim.view.scale;
    _w2s[1] = h / 2 + (y + sim.view.oy) * sim.view.scale;
    return _w2s;
  }


  function screenToWorld(sim, w, h, sx, sy) {
    const wx = (sx - w / 2) / sim.view.scale - sim.view.ox;
    const wy = (sy - h / 2) / sim.view.scale - sim.view.oy;
    return [wx, wy];
  }

  window.KNSim = { createSim, addBody, logEv, initBinary, placeCompanion, removeCompanion,
                   step, frameAnchor, applyFrameLock, circularizeBody, circularizeBinary, setBinaryVelocity,
                   worldToScreen, worldToScreenInto, screenToWorld,
                   predictTrajectory, predictBinaryTrajectory, predictGeodesicTrajectory };
})();
