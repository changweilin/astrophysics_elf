/* Canvas renderer + integrator for the Kerr-Newman simulation.
 * Exports window.KNSim with: createSim, step, render
 */
(function () {
  const phys = window.KNphysics;

  function createSim(opts) {
    return {
      t: 0,
      params: {
        M: 1.5, Q: 0.0, a: 0.5,
        // central-body type: 'bh' | 'ns' | 'wd' | 'ms'
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
      view: { scale: 18, ox: 0, oy: 0 }, // pixels per geometric unit
      flags: {
        showErgo: true, showHorizon: true, showISCO: true, showPhoton: false,
        showDragField: true, showOrbits: true, showTidal: true, showLabels: true,
        showGrid: false, showGW: false
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

  // ── Binary companion (placed by user; 2-body integration) ──
  function initBinary(sim) {
    sim.binary = {
      enabled: false,
      // Companion has its own full parameter set — same shape as central body.
      type: 'bh',        // 'bh' | 'ns' | 'wd' | 'ms'
      M2: 0.8,           // companion mass (geometric units)
      Q2: 0,             // companion charge (|Q2| <= M2 for sub-extremal)
      a2: 0,             // companion spin (J2 / M2 c)
      R_star2: 3.0,      // companion surface radius (used when type !== 'bh')
      T_eff2: 1e6,       // companion photosphere temperature
      d:  18,            // current separation
      d0: 18,            // initial separation (for inspiral progress bar)
      theta: 0,          // orbital phase
      omega: 0,          // current angular velocity
      x1: 0, y1: 0,      // primary position (mirrors sim.primary)
      x2: 0, y2: 0,      // secondary position
      vx2: 0, vy2: 0,    // secondary velocity
      inspiralRate: 60,  // visual speedup of Peters GW back-reaction
      merged: false,
      mergerFlash: 0,
      ringdownPhase: 0,
      trail1: [], trail2: [],
      // last computed metrics (for UI readout)
      lastPeters: { omega: 0, ddot: 0, t_merge: Infinity, Mc: 0, Mt: 0, mu: 0 },
    };
  }

  // Place / arm the companion. Called from UI tab + canvas placement.
  function placeCompanion(sim, wx, wy, opts = {}) {
    const bin = sim.binary;
    if (!bin) return;
    bin.x1 = sim.primary.x; bin.y1 = sim.primary.y;
    bin.x2 = wx; bin.y2 = wy;
    const dx0 = wx - bin.x1, dy0 = wy - bin.y1;
    const r = Math.hypot(dx0, dy0);
    bin.d = r; bin.d0 = r;
    bin.theta = Math.atan2(dy0, dx0);
    // Default stable circular orbit velocity, tangential (counter-clockwise)
    if (opts.vx != null && opts.vy != null) {
      bin.vx2 = opts.vx; bin.vy2 = opts.vy;
    } else {
      const vc = Math.sqrt(sim.params.M / Math.max(0.5, r));
      const dir = Math.sign(sim.params.a || 1);
      bin.vx2 = -dy0 / r * vc * dir;
      bin.vy2 =  dx0 / r * vc * dir;
    }
    bin.omega = Math.hypot(bin.vx2, bin.vy2) / r;
    bin.enabled = true;
    bin.merged = false;
    bin.mergerFlash = 0;
    bin.trail1.length = 0;
    bin.trail2.length = 0;
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
    bin.x1 = sim.primary.x; bin.y1 = sim.primary.y; // primary follows pan handle

    const M1 = sim.params.M, M2 = bin.M2;
    const isBH = (sim.params.type || 'bh') === 'bh';

    // Newtonian gravity from primary on secondary (test-particle approx —
    // primary stays anchored so the rest of the lab frame is consistent).
    const dx = bin.x2 - bin.x1, dy = bin.y2 - bin.y1;
    const r2 = dx * dx + dy * dy;
    const r  = Math.sqrt(r2);
    if (r < 1e-3) return;

    const inv = 1 / (r * r2);
    let ax = -M1 * dx * inv;
    let ay = -M1 * dy * inv;

    const v = Math.hypot(bin.vx2, bin.vy2);

    // Peters readout (used for UI + the GW radiation drag below)
    const pet = phys.peters(M1, M2, r);
    bin.lastPeters = pet;

    // GW back-reaction for BH binaries: tangential drag that bleeds energy at
    // the Peters rate dE/dt = (32/5) M1² M2² (M1+M2) / r⁵
    if (isBH && v > 1e-4) {
      const dEdt = (32 / 5) * M1 * M1 * M2 * M2 * (M1 + M2) / Math.pow(r, 5);
      const aDrag = (dEdt / (M2 * v)) * bin.inspiralRate;
      ax -= aDrag * bin.vx2 / v;
      ay -= aDrag * bin.vy2 / v;
    }

    // Symplectic Euler step (matches the substep cadence in step())
    bin.vx2 += ax * dt;
    bin.vy2 += ay * dt;
    bin.x2  += bin.vx2 * dt;
    bin.y2  += bin.vy2 * dt;

    // Bookkeeping
    bin.d     = Math.hypot(bin.x2, bin.y2);
    bin.theta = Math.atan2(bin.y2, bin.x2);
    bin.omega = Math.hypot(bin.vx2, bin.vy2) / Math.max(0.1, bin.d);

    // Trail
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
        bin.merged = true;
        bin.mergerFlash = 1.6;
        const Mt = M1 + M2;
        const radiated = Mt * 0.05;
        sim.params.M = Mt - radiated;
        sim.params.Q = sim.params.Q + (bin.Q2 || 0);
        const aFinal = Math.min(0.998 * sim.params.M,
          Math.abs(sim.params.a) + 0.4 * Math.min(M1, M2));
        sim.params.a = Math.sign(sim.params.a || 1) * aFinal;
        bin.enabled = false;
        logEv(sim, 'warn', `MERGER · M_f=${sim.params.M.toFixed(2)}M · ΔE_GW=${radiated.toFixed(2)} c²`);
        logEv(sim, 'amber', `ringdown · a/M → ${(sim.params.a / sim.params.M).toFixed(2)}`);
        return;
      }
    } else {
      // At least one non-BH — collision when surfaces touch.
      if (bin.d < surface1 + surface2) {
        bin.enabled = false;
        logEv(sim, 'warn', `companion contact at r=${bin.d.toFixed(2)} M`);
        return;
      }
    }
    if (bin.d > 80) {
      bin.enabled = false;
      logEv(sim, 'amber', `companion escaped binary system`);
    }
  }

  // RK2 midpoint step
  function integrate(sim, dt) {
    const { M, Q, a } = sim.params;
    const bin = sim.binary || null;
    for (const b of sim.bodies) {
      if (b.state !== 'orbit') continue;
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
        const cType = sim.params.type || 'bh';
        const sType = bin.type || 'bh';
        const { rplus: r1plus, naked: n1 } = phys.horizons(M, Q, a);
        const { rplus: r2plus, naked: n2 } = phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
        // tidal stress: take worst of two bodies
        const t1 = phys.tidalStress(r1, M, b.radius || 0.4, b.binding || 1);
        const t2 = phys.tidalStress(r2, bin.M2, b.radius || 0.4, b.binding || 1);
        b.stress = Math.max(t1, t2);
        if (b.stress > b.stressPeak) b.stressPeak = b.stress;
        if (b.kind !== 'probe' && b.kind !== 'ship' && b.stress > 1.15) {
          b.state = 'spaghettified'; b.consumedAt = sim.t;
          logEv(sim, 'warn', `${b.name} — spaghettified between binary pair`);
          continue;
        }
        // Primary capture / surface impact
        if (cType === 'bh') {
          if (!n1 && r1 < (isFinite(r1plus) ? r1plus : M)) {
            b.state = 'captured'; b.consumedAt = sim.t;
            logEv(sim, 'warn', `${b.name} — captured by primary BH`);
            continue;
          }
        } else {
          const Rs1 = sim.params.R_star || 3;
          if (r1 < Rs1) {
            b.state = 'captured'; b.consumedAt = sim.t;
            const label = { ns: 'neutron crust', wd: 'WD surface', ms: 'photosphere' }[cType] || 'surface';
            logEv(sim, 'warn', `${b.name} — impacted primary ${label}`);
            continue;
          }
        }
        // Companion capture / surface impact
        if (sType === 'bh') {
          if (!n2 && r2 < (isFinite(r2plus) ? r2plus : bin.M2)) {
            b.state = 'captured'; b.consumedAt = sim.t;
            logEv(sim, 'warn', `${b.name} — captured by companion BH`);
            continue;
          }
        } else {
          const Rs2 = bin.R_star2 || 3;
          if (r2 < Rs2) {
            b.state = 'captured'; b.consumedAt = sim.t;
            const label = { ns: 'neutron crust', wd: 'WD surface', ms: 'photosphere' }[sType] || 'surface';
            logEv(sim, 'warn', `${b.name} — impacted companion ${label}`);
            continue;
          }
        }
        if (r > 50) {
          b.state = 'escaped'; b.consumedAt = sim.t;
          logEv(sim, 'amber', `${b.name} — ejected by binary`);
        }
        continue;  // skip single-BH checks below
      }

      // ── Single-BH checks (original) ─────────────────────
      const { rplus, naked } = phys.horizons(M, Q, a);
      const type = sim.params.type || 'bh';
      const tidal = phys.tidalStress(r, M, b.radius || 0.4, b.binding || 1);
      b.stress = tidal;
      if (tidal > b.stressPeak) b.stressPeak = tidal;
      if (b.kind !== 'probe' && b.kind !== 'ship' && tidal > 1.15) {
        b.state = 'spaghettified'; b.consumedAt = sim.t;
        logEv(sim, 'warn', `${b.name} — spaghettified at r = ${r.toFixed(2)} M`);
        continue;
      }
      // Surface impact for stellar centrals
      if (type !== 'bh') {
        const Rs = sim.params.R_star || 3;
        if (r < Rs) {
          b.state = 'captured'; b.consumedAt = sim.t;
          const label = { ns: 'neutron crust', wd: 'WD surface', ms: 'photosphere' }[type] || 'surface';
          logEv(sim, 'warn', `${b.name} — impacted ${label} at r = ${r.toFixed(2)} M`);
          continue;
        }
      } else {
        if (!naked && r < rplus) {
          b.state = 'captured'; b.consumedAt = sim.t;
          logEv(sim, 'warn', `${b.name} — crossed r₊, mass added to BH`);
          continue;
        }
        if (naked && r < 0.4) {
          b.state = 'captured'; b.consumedAt = sim.t;
          logEv(sim, 'warn', `${b.name} — annihilated at naked singularity`);
          continue;
        }
      }
      if (r > 50) {
        b.state = 'escaped'; b.consumedAt = sim.t;
        logEv(sim, 'amber', `${b.name} — escaped beyond detector range`);
      }
    }
  }

  // Forward-integrate a hypothetical body for trajectory preview.
  function predictTrajectory(sim, x0, y0, vx0, vy0, steps = 240, dt = 0.05) {
    const { M, Q, a } = sim.params;
    const { rplus, naked } = phys.horizons(M, Q, a);
    const bin = sim.binary || null;
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
        const { rplus: rp1 } = phys.horizons(M, Q, a);
        if (r1 < (isFinite(rp1) ? rp1 : M)) return { pts, fate: 'capture' };
        if (r2 < 2 * bin.M2) return { pts, fate: 'capture' };
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

  function step(sim, realDt) {
    if (sim.paused) return;
    const dt = Math.min(0.05, realDt * sim.timescale);
    // sub-step for stability
    const sub = 4;
    for (let i = 0; i < sub; i++) {
      stepBinary(sim, dt / sub);
      integrate(sim, dt / sub);
    }
    if (window.KNDisc) window.KNDisc.step(sim, dt);
    sim.t += dt;
  }

  // --- renderer ---
  function worldToScreen(sim, w, h, x, y) {
    return [w / 2 + (x + sim.view.ox) * sim.view.scale,
            h / 2 + (y + sim.view.oy) * sim.view.scale];
  }

  function render(sim, ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const { M, Q, a } = sim.params;
    const type = sim.params.type || 'bh';
    const isBH = type === 'bh';
    const { rplus, naked } = phys.horizons(M, Q, a);
    const rErg = phys.ergosphereEq(M, Q);
    const rIsco = phys.isco(M, a);
    const rPh = phys.photonSphereEq(M, a);
    const s = sim.view.scale;
    const [cx, cy] = worldToScreen(sim, w, h, 0, 0);

    // grid
    if (sim.flags.showGrid) {
      ctx.strokeStyle = 'oklch(0.22 0.022 255)';
      ctx.lineWidth = 1;
      const step = s; // every 1 M
      for (let x = (cx % step); x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = (cy % step); y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }

    // distance rings (faint)
    ctx.strokeStyle = 'oklch(0.28 0.022 255 / 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (const r of [5, 10, 15, 20, 25, 30]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // frame dragging field
    if (sim.flags.showDragField && Math.abs(a) > 0.02) {
      const ringCount = 4;
      ctx.strokeStyle = 'oklch(0.55 0.10 210 / 0.35)';
      ctx.lineWidth = 1;
      // center on primary position (offset in binary mode)
      const bin = sim.binary;
      const dragCx = (bin && bin.enabled) ? cx + bin.x1 * s : cx;
      const dragCy = (bin && bin.enabled) ? cy + bin.y1 * s : cy;
      for (let i = 1; i <= ringCount; i++) {
        const baseR = isBH ? (rplus || 1) : Math.max(rplus || 0, sim.params.R_star || 3);
        const r = baseR + i * 2.2;
        const N = 28;
        for (let k = 0; k < N; k++) {
          const ang = (k / N) * Math.PI * 2 + (sim.t * 0.05 * Math.sign(a)) / (i);
          const x = dragCx + Math.cos(ang) * r * s;
          const y = dragCy + Math.sin(ang) * r * s;
          const tx = -Math.sin(ang) * Math.sign(a);
          const ty =  Math.cos(ang) * Math.sign(a);
          const len = 6;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + tx * len, y + ty * len);
          ctx.stroke();
        }
      }
    }

    // Gravitational-wave ripples (under disc particles, over distance rings)
    if (sim.flags.showGW) renderGW(sim, ctx, w, h);

    // Disc particles (under frame dragging arrows, over distance rings)
    if (window.KNDisc) window.KNDisc.renderDisc(sim, ctx, w, h, worldToScreen);

    // Photon sphere
    if (isBH && sim.flags.showPhoton && rPh > 0 && !(sim.binary && sim.binary.enabled)) {
      ctx.strokeStyle = 'oklch(0.90 0.10 60 / 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, rPh * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      labelRing(ctx, cx, cy, rPh * s, 'r_ph');
    }

    // ISCO
    if (isBH && sim.flags.showISCO && rIsco > 0 && !(sim.binary && sim.binary.enabled)) {
      ctx.strokeStyle = 'oklch(0.62 0.12 75 / 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, rIsco * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      labelRing(ctx, cx, cy, rIsco * s, 'ISCO');
    }

    // Ergosphere (oblate; equator radius rErg, polar = rplus)
    if (isBH && sim.flags.showErgo && !naked && rErg && rErg > rplus && !(sim.binary && sim.binary.enabled)) {
      const polar = phys.ergospherePole(M, Q, a) || rplus;
      ctx.fillStyle = 'oklch(0.55 0.10 210 / 0.10)';
      ctx.strokeStyle = 'oklch(0.65 0.12 210 / 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rErg * s, polar * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      labelRing(ctx, cx, cy, rErg * s, 'ergosphere');
    }

    // Event horizon (and binary companion if active)
    if (sim.binary && sim.binary.enabled) {
      // ── Binary mode: draw both BHs ────────────────────
      const bin = sim.binary;
      const M1 = M, M2 = bin.M2;

      // Inspiral trails
      if (bin.trail1.length > 4) {
        ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        const [ts, ty_] = worldToScreen(sim, w, h, bin.trail1[0], bin.trail1[1]);
        ctx.moveTo(ts, ty_);
        for (let i = 2; i < bin.trail1.length; i += 2) {
          const [tx, ty] = worldToScreen(sim, w, h, bin.trail1[i], bin.trail1[i+1]);
          ctx.lineTo(tx, ty);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (bin.trail2.length > 4) {
        ctx.strokeStyle = 'oklch(0.72 0.18 295 / 0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        const [ts2, ty2_] = worldToScreen(sim, w, h, bin.trail2[0], bin.trail2[1]);
        ctx.moveTo(ts2, ty2_);
        for (let i = 2; i < bin.trail2.length; i += 2) {
          const [tx2, ty2] = worldToScreen(sim, w, h, bin.trail2[i], bin.trail2[i+1]);
          ctx.lineTo(tx2, ty2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Binary axis
      const [bx1, by1] = worldToScreen(sim, w, h, bin.x1, bin.y1);
      const [bx2, by2] = worldToScreen(sim, w, h, bin.x2, bin.y2);
      ctx.strokeStyle = 'oklch(0.58 0.08 75 / 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
      ctx.setLineDash([]);

      // Primary BH (with normal horizon + ergosphere)
      const { rplus: rp1, naked: n1 } = phys.horizons(M1, Q, a);
      if (!n1 && rp1 > 0) {
        const grd1 = ctx.createRadialGradient(bx1, by1, rp1*s*0.3, bx1, by1, rp1*s*1.05);
        grd1.addColorStop(0, 'oklch(0.04 0 0)');
        grd1.addColorStop(0.9, 'oklch(0.06 0.005 255)');
        grd1.addColorStop(1, 'oklch(0.20 0.04 30 / 0)');
        ctx.fillStyle = grd1;
        ctx.beginPath(); ctx.arc(bx1, by1, rp1*s, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx1, by1, rp1*s, 0, Math.PI*2); ctx.stroke();
        if (sim.flags.showLabels) {
          ctx.fillStyle = 'oklch(0.78 0.16 75 / 0.8)';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(`M₁ ${M1.toFixed(2)}`, bx1 + rp1*s + 4, by1 - 4);
        }
        // ergosphere around primary
        if (sim.flags.showErgo) {
          const rErg1 = phys.ergosphereEq(M1, Q);
          if (rErg1 && rErg1 > rp1) {
            ctx.fillStyle = 'oklch(0.55 0.10 210 / 0.08)';
            ctx.strokeStyle = 'oklch(0.65 0.12 210 / 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(bx1, by1, rErg1*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          }
        }
      }

      // Secondary body — full Kerr-Newman or stellar depending on type
      const sType = bin.type || 'bh';
      const { rplus: rp2bh, naked: n2 } = phys.horizons(M2, bin.Q2 || 0, bin.a2 || 0);
      if (sType === 'bh' && !n2 && rp2bh > 0) {
        const rp2 = rp2bh;
        const grd2 = ctx.createRadialGradient(bx2, by2, rp2*s*0.3, bx2, by2, rp2*s*1.05);
        grd2.addColorStop(0, 'oklch(0.04 0 0)');
        grd2.addColorStop(0.9, 'oklch(0.06 0.005 295)');
        grd2.addColorStop(1, 'oklch(0.20 0.05 295 / 0)');
        ctx.fillStyle = grd2;
        ctx.beginPath(); ctx.arc(bx2, by2, Math.max(2, rp2*s), 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'oklch(0.72 0.18 295 / 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx2, by2, Math.max(2, rp2*s), 0, Math.PI*2); ctx.stroke();
        // ergosphere around companion (if charge/spin produce one)
        if (sim.flags.showErgo) {
          const rErg2 = phys.ergosphereEq(M2, bin.Q2 || 0);
          if (rErg2 && rErg2 > rp2) {
            ctx.fillStyle = 'oklch(0.55 0.10 295 / 0.07)';
            ctx.strokeStyle = 'oklch(0.65 0.12 295 / 0.30)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(bx2, by2, rErg2*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          }
        }
      } else if (sType !== 'bh') {
        // Stellar companion — NS / WD / MS render
        const Rs2 = bin.R_star2 || 3;
        const T2 = bin.T_eff2 || 1e6;
        const col = phys.tempToColor(T2, 1);
        const colHalo = phys.tempToColor(T2, 0.30);
        const haloR2 = Math.max(Rs2 * s * 1.5, Rs2 * s + 10);
        const grdH2 = ctx.createRadialGradient(bx2, by2, Rs2 * s * 0.8, bx2, by2, haloR2);
        grdH2.addColorStop(0, colHalo);
        grdH2.addColorStop(1, 'oklch(0.06 0 0 / 0)');
        ctx.fillStyle = grdH2;
        ctx.beginPath(); ctx.arc(bx2, by2, haloR2, 0, Math.PI*2); ctx.fill();
        const grdS2 = ctx.createRadialGradient(bx2, by2, 0, bx2, by2, Rs2 * s);
        grdS2.addColorStop(0, col);
        grdS2.addColorStop(0.7, col);
        grdS2.addColorStop(1, phys.tempToColor(T2, 0.10));
        ctx.fillStyle = grdS2;
        ctx.beginPath(); ctx.arc(bx2, by2, Math.max(2, Rs2 * s), 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = phys.tempToColor(T2, 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(bx2, by2, Math.max(2, Rs2 * s), 0, Math.PI*2); ctx.stroke();
      } else {
        // naked / degenerate fallback
        ctx.fillStyle = 'oklch(0.72 0.20 28 / 0.7)';
        ctx.beginPath(); ctx.arc(bx2, by2, 6, 0, Math.PI*2); ctx.fill();
      }
      if (sim.flags.showLabels) {
        ctx.fillStyle = 'oklch(0.72 0.18 295 / 0.8)';
        ctx.font = '9px JetBrains Mono, monospace';
        const typeTag = sType === 'bh' ? '' : ' ' + sType.toUpperCase();
        const visualR = sType === 'bh' ? (isFinite(rp2bh) ? rp2bh : M2) : (bin.R_star2 || 3);
        ctx.fillText(`M₂ ${M2.toFixed(2)}${typeTag}`, bx2 + Math.max(2, visualR * s) + 4, by2 - 4);
      }

      // Separation label
      ctx.fillStyle = 'oklch(0.65 0.06 75 / 0.7)';
      ctx.font = '9px JetBrains Mono, monospace';
      const midX = (bx1 + bx2) / 2, midY = (by1 + by2) / 2;
      ctx.fillText(`d = ${bin.d.toFixed(2)} M`, midX + 4, midY - 5);

      // Peters readout
      const pet = bin.lastPeters;
      ctx.fillStyle = 'oklch(0.62 0.10 295 / 0.75)';
      ctx.fillText(`f_GW ${(pet.omega / Math.PI).toFixed(3)} c/M`, midX + 4, midY + 7);
      ctx.fillText(`Mc ${pet.Mc.toFixed(2)} M`, midX + 4, midY + 18);

    } else if (!isBH) {
      // ── Stellar central (NS / WD / MS) ────────────────
      const Rs = sim.params.R_star || 3;
      const T = sim.params.T_eff || 1e6;
      const col = phys.tempToColor(T, 1);
      const colHalo = phys.tempToColor(T, 0.35);
      const colCorona = phys.tempToColor(T, 0.10);
      // outer corona / glow
      const haloR = Math.max(Rs * s * 1.6, Rs * s + 14);
      const grdH = ctx.createRadialGradient(cx, cy, Rs * s * 0.8, cx, cy, haloR);
      grdH.addColorStop(0, colHalo);
      grdH.addColorStop(1, 'oklch(0.06 0 0 / 0)');
      ctx.fillStyle = grdH;
      ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill();
      // photosphere
      const grdS = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rs * s);
      grdS.addColorStop(0, col);
      grdS.addColorStop(0.7, col);
      grdS.addColorStop(1, colCorona);
      ctx.fillStyle = grdS;
      ctx.beginPath(); ctx.arc(cx, cy, Rs * s, 0, Math.PI * 2); ctx.fill();
      // limb darkening edge
      ctx.strokeStyle = phys.tempToColor(T, 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, Rs * s, 0, Math.PI * 2); ctx.stroke();
      // surface "rotation hatching" if spinning
      if (Math.abs(a) > 0.02) {
        ctx.strokeStyle = phys.tempToColor(T, 0.45);
        ctx.lineWidth = 1;
        const dir = Math.sign(a);
        const phase = sim.t * 0.4 * dir;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, Rs * s, 0, Math.PI * 2);
        ctx.clip();
        for (let k = -3; k <= 3; k++) {
          const y = cy + (k / 3) * Rs * s * 0.9;
          const off = (Math.sin(phase + k * 0.7) * 6);
          ctx.beginPath();
          ctx.moveTo(cx - Rs * s, y + off);
          ctx.lineTo(cx + Rs * s, y - off);
          ctx.stroke();
        }
        ctx.restore();
      }
      // type label
      if (sim.flags.showLabels) {
        const phys2 = window.KNphysics;
        const info = phys2.STELLAR_INFO[type];
        ctx.fillStyle = phys.tempToColor(T, 0.85);
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(info?.pill || type.toUpperCase(), cx + Rs * s + 6, cy - 4);
        ctx.fillStyle = 'oklch(0.58 0.012 255 / 0.85)';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillText(`R★ = ${Rs.toFixed(2)} M`, cx + Rs * s + 6, cy + 8);
      }
    } else if (!naked && rplus > 0) {
      // ── Single-BH original path ──────────────────────
      const grd = ctx.createRadialGradient(cx, cy, rplus * s * 0.3,
                                           cx, cy, rplus * s * 1.05);
      grd.addColorStop(0, 'oklch(0.04 0 0)');
      grd.addColorStop(0.9, 'oklch(0.06 0.005 255)');
      grd.addColorStop(1, 'oklch(0.20 0.04 30 / 0.0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, rplus * s, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, rplus * s, 0, Math.PI * 2);
      ctx.stroke();
      // inner horizon
      const rmin = M - Math.sqrt(Math.max(0, M*M - a*a - Q*Q));
      if (rmin > 0.05) {
        ctx.strokeStyle = 'oklch(0.50 0.10 75 / 0.5)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, rmin * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (naked) {
      // naked singularity — wild flicker
      const flick = 0.5 + 0.5 * Math.sin(sim.t * 13);
      ctx.fillStyle = `oklch(0.72 0.20 28 / ${0.25 + flick * 0.4})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + flick * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'oklch(0.85 0.18 28 / 0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, 14 + flick * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Spin indicator (arrow at center)
    if (isBH && Math.abs(a) > 0.02 && !naked && !(sim.binary && sim.binary.enabled)) {
      ctx.strokeStyle = 'oklch(0.78 0.13 210)';
      ctx.lineWidth = 1.2;
      const r0 = rplus * s * 0.55;
      const dir = Math.sign(a);
      ctx.beginPath();
      ctx.arc(cx, cy, r0, -Math.PI * 0.7 * dir, Math.PI * 0.7 * dir);
      ctx.stroke();
      // arrowhead
      const ang = Math.PI * 0.7 * dir;
      const ax_ = cx + Math.cos(ang) * r0;
      const ay_ = cy + Math.sin(ang) * r0;
      const perp = ang + Math.PI / 2 * dir;
      ctx.beginPath();
      ctx.moveTo(ax_, ay_);
      ctx.lineTo(ax_ + Math.cos(perp) * 4 - Math.cos(ang) * 4 * dir,
                 ay_ + Math.sin(perp) * 4 - Math.sin(ang) * 4 * dir);
      ctx.moveTo(ax_, ay_);
      ctx.lineTo(ax_ - Math.cos(perp) * 4 - Math.cos(ang) * 4 * dir,
                 ay_ - Math.sin(perp) * 4 - Math.sin(ang) * 4 * dir);
      ctx.stroke();
    }

    // Merger flash
    if (sim.binary && sim.binary.mergerFlash > 0) {
      const t = sim.binary.mergerFlash / 1.6;
      const alpha = Math.min(1, t * 2);
      const radius = (1 - t) * Math.min(w, h) * 0.7;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grd.addColorStop(0, `oklch(0.98 0.20 75 / ${alpha * 0.9})`);
      grd.addColorStop(0.4, `oklch(0.85 0.16 295 / ${alpha * 0.4})`);
      grd.addColorStop(1, 'oklch(0.1 0 0 / 0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
      if (t > 0.6) {
        ctx.fillStyle = `oklch(0.96 0.10 75 / ${(t - 0.6) * 2.5 * alpha})`;
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GW MERGER · RINGDOWN', cx, cy - 14);
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = `oklch(0.75 0.10 295 / ${(t - 0.6) * 2.5 * alpha})`;
        ctx.fillText(`M_f = ${sim.params.M.toFixed(2)} M`, cx, cy);
        ctx.fillText(`a/M → ${(sim.params.a / sim.params.M).toFixed(2)}`, cx, cy + 12);
        ctx.textAlign = 'left';
      }
    }

    // ---- Bodies & trails ----
    for (const b of sim.bodies) {
      // trail
      if (sim.flags.showOrbits && b.trail.length > 4) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = b.state === 'captured' ? 'oklch(0.40 0.05 30 / 0.5)' :
                          b.state === 'spaghettified' ? 'oklch(0.70 0.18 28 / 0.5)' :
                          colorOf(b, 0.55);
        ctx.beginPath();
        const [sx, sy] = worldToScreen(sim, w, h, b.trail[0], b.trail[1]);
        ctx.moveTo(sx, sy);
        for (let i = 2; i < b.trail.length; i += 2) {
          const [tx, ty] = worldToScreen(sim, w, h, b.trail[i], b.trail[i + 1]);
          ctx.lineTo(tx, ty);
        }
        ctx.stroke();
      }

      // body
      if (b.state === 'orbit') {
        const [px, py] = worldToScreen(sim, w, h, b.x, b.y);
        drawBody(ctx, b, px, py, sim);
        if (sim.selectedId === b.id) {
          ctx.strokeStyle = 'oklch(0.80 0.16 75)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        // tidal stretch visualisation
        if (sim.flags.showTidal && b.stress > 0.15) {
          const r = Math.hypot(b.x, b.y);
          const ux = b.x / r, uy = b.y / r;
          const stretch = Math.min(20, 4 + b.stress * 14);
          ctx.strokeStyle = `oklch(0.72 0.20 28 / ${Math.min(0.9, b.stress)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - ux * stretch, py - uy * stretch);
          ctx.lineTo(px + ux * stretch, py + uy * stretch);
          ctx.stroke();
        }
        // label
        if (sim.flags.showLabels) {
          ctx.fillStyle = 'oklch(0.78 0.008 80 / 0.85)';
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillText(b.name, px + 9, py - 6);
        }
      } else if (b.state === 'spaghettified') {
        // debris stream that fades
        const age = sim.t - (b.consumedAt || sim.t);
        if (age < 4) {
          const [px, py] = worldToScreen(sim, w, h, b.x, b.y);
          ctx.fillStyle = `oklch(0.72 0.20 28 / ${0.7 - age * 0.15})`;
          for (let i = 0; i < 6; i++) {
            const r = i * 2;
            ctx.fillRect(px + r, py + r * 0.3, 2, 2);
            ctx.fillRect(px - r, py - r * 0.3, 2, 2);
          }
        }
      }
    }

    // Jet central luminosity (above bodies)
    if (window.KNDisc) window.KNDisc.renderJetCenter(sim, ctx, w, h, worldToScreen);
  }

  function colorOf(b, alpha = 1) {
    const map = {
      planet: `oklch(0.78 0.13 210 / ${alpha})`,
      gas:    `oklch(0.80 0.16 75 / ${alpha})`,
      star:   `oklch(0.92 0.10 60 / ${alpha})`,
      ship:   `oklch(0.70 0.18 350 / ${alpha})`,
      probe:  `oklch(0.85 0.10 130 / ${alpha})`,
    };
    return map[b.kind] || `oklch(0.85 0.005 80 / ${alpha})`;
  }

  function drawBody(ctx, b, px, py, sim) {
    const c = colorOf(b, 1);
    if (b.kind === 'ship') {
      ctx.fillStyle = c;
      ctx.save();
      ctx.translate(px, py);
      const ang = Math.atan2(b.vy, b.vx);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(6, 0); ctx.lineTo(-4, 3); ctx.lineTo(-4, -3); ctx.closePath();
      ctx.fill();
      // thrust trail
      ctx.fillStyle = 'oklch(0.78 0.13 210 / 0.6)';
      ctx.fillRect(-6, -0.5, 3, 1);
      ctx.restore();
      return;
    }
    if (b.kind === 'probe') {
      ctx.fillStyle = c;
      ctx.fillRect(px - 2, py - 2, 4, 4);
      return;
    }
    // planets / gas / stars: filled disc + soft glow
    const r = Math.max(2, (b.radius || 0.4) * 4);
    const grd = ctx.createRadialGradient(px, py, 0, px, py, r * 2.5);
    grd.addColorStop(0, c);
    grd.addColorStop(0.4, c);
    grd.addColorStop(1, 'oklch(0.1 0 0 / 0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(px, py, r * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  }

  function drawArrow(ctx, x0, y0, x1, y1, color) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (L < 2) return;
    const ux = dx / L, uy = dy / L;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.stroke();
    const head = Math.min(10, L * 0.25);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
    ctx.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // --- Overlay: placement ghost + aim arrow + predicted trajectory ---
  function renderInteraction(sim, ctx, w, h) {
    // PLACEMENT ghost
    if (sim.placement && sim.placement.inCanvas) {
      const p = sim.placement;
      const [px, py] = worldToScreen(sim, w, h, p.wx, p.wy);
      const isCompanion = !!p.item.isCompanion;
      ctx.save();
      ctx.globalAlpha = 0.65;
      if (isCompanion) {
        const bin = sim.binary || {};
        const M2 = bin.M2 || 0.8;
        const sType = bin.type || 'bh';
        const { rplus: rp2 } = phys.horizons(M2, bin.Q2 || 0, bin.a2 || 0);
        const rGhost = sType === 'bh'
          ? Math.max(4, (isFinite(rp2) ? rp2 : M2) * sim.view.scale)
          : Math.max(6, (bin.R_star2 || 3) * sim.view.scale * 0.7);
        if (sType === 'bh') {
          ctx.fillStyle = 'oklch(0.05 0.005 295)';
        } else {
          ctx.fillStyle = phys.tempToColor(bin.T_eff2 || 1e6, 0.6);
        }
        ctx.beginPath(); ctx.arc(px, py, rGhost, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'oklch(0.72 0.18 295 / 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, rGhost, 0, Math.PI * 2); ctx.stroke();
      } else {
        drawBody(ctx, { kind: p.item.kind, radius: p.item.radius, vx: 1, vy: 0 }, px, py, sim);
      }
      ctx.restore();
      ctx.strokeStyle = isCompanion ? 'oklch(0.72 0.18 295 / 0.7)' : 'oklch(0.80 0.16 75 / 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isCompanion ? 'oklch(0.82 0.14 295)' : 'oklch(0.80 0.16 75)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(isCompanion ? 'release → place companion' : 'release → place', px + 22, py - 4);
      ctx.fillStyle = 'oklch(0.58 0.012 255)';
      ctx.font = '9px JetBrains Mono, monospace';
      const r = Math.hypot(p.wx, p.wy);
      const vc = Math.sqrt(sim.params.M / Math.max(0.5, r));
      ctx.fillText(`r = ${r.toFixed(2)} M${isCompanion ? `  ·  v_circ ≈ ${vc.toFixed(3)} c` : ''}`, px + 22, py + 8);
    }

    // AIM mode
    if (sim.aiming) {
      const isCompanion = sim.aiming.kind === 'companion';
      let bx, by, bodyRef;
      if (isCompanion) {
        if (!sim.binary || !sim.binary.enabled) return;
        bodyRef = { x: sim.binary.x2, y: sim.binary.y2, vx: sim.binary.vx2, vy: sim.binary.vy2 };
        [bx, by] = worldToScreen(sim, w, h, bodyRef.x, bodyRef.y);
      } else {
        const body = sim.bodies.find((b) => b.id === sim.aiming.bodyId);
        if (!body) return;
        bodyRef = body;
        [bx, by] = worldToScreen(sim, w, h, body.x, body.y);
      }
      if (!sim.aiming.isAiming) {
        // armed indicator
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
        ctx.strokeStyle = isCompanion
          ? `oklch(0.78 0.18 295 / ${0.35 + pulse * 0.4})`
          : `oklch(0.80 0.16 75 / ${0.35 + pulse * 0.4})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(bx, by, 16 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = isCompanion ? 'oklch(0.82 0.14 295)' : 'oklch(0.80 0.16 75)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(isCompanion ? 'drag from companion → custom v₀' : 'drag from body → launch', bx + 22, by - 6);
        ctx.fillStyle = 'oklch(0.58 0.012 255)';
        ctx.fillText(isCompanion ? 'release at body → keep stable v_circ' : 'release at body for v = 0', bx + 22, by + 8);
        return;
      }
      // Active pull
      const px = sim.aiming.pullSx;
      const py = sim.aiming.pullSy;
      const dx = px - bx;
      const dy = py - by;
      // pull line (red)
      ctx.strokeStyle = 'oklch(0.72 0.20 28 / 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([]);
      // launch arrow (amber, forward)
      const launchX = bx - dx;
      const launchY = by - dy;
      drawArrow(ctx, bx, by, launchX, launchY,
        isCompanion ? 'oklch(0.78 0.18 295)' : 'oklch(0.80 0.16 75)');
      // Trajectory preview
      const vScale = 0.08;
      const vx = -dx / sim.view.scale * vScale;
      const vy = -dy / sim.view.scale * vScale;
      const { pts, fate } = predictTrajectory(sim, bodyRef.x, bodyRef.y, vx, vy);
      const fateColor = fate === 'capture' ? 'oklch(0.72 0.20 28 / 0.85)' :
                        fate === 'escape'  ? 'oklch(0.85 0.10 130 / 0.8)' :
                                             (isCompanion ? 'oklch(0.78 0.18 295 / 0.8)' : 'oklch(0.78 0.13 210 / 0.8)');
      ctx.strokeStyle = fateColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const [sx0, sy0] = worldToScreen(sim, w, h, pts[0], pts[1]);
      ctx.moveTo(sx0, sy0);
      for (let i = 2; i < pts.length; i += 2) {
        const [tx, ty] = worldToScreen(sim, w, h, pts[i], pts[i + 1]);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // endpoint marker
      if (pts.length >= 4) {
        const [ex, ey] = worldToScreen(sim, w, h, pts[pts.length - 2], pts[pts.length - 1]);
        ctx.fillStyle = fateColor;
        ctx.fillRect(ex - 2.5, ey - 2.5, 5, 5);
      }
      // readout
      const v = Math.hypot(vx, vy);
      ctx.fillStyle = isCompanion ? 'oklch(0.82 0.14 295)' : 'oklch(0.80 0.16 75)';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`v0 = ${v.toFixed(3)} c`, px + 10, py - 4);
      ctx.fillStyle = fateColor;
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(`fate: ${fate.toUpperCase()}`, px + 10, py + 9);
    }
  }

  function renderGW(sim, ctx, w, h) {
    const { M, Q, a } = sim.params;
    const { rplus, naked } = phys.horizons(M, Q, a);
    const [cx, cy] = worldToScreen(sim, w, h, 0, 0);
    const s = sim.view.scale;

    // ── Binary inspiral GW source ────────────────────────
    const bin = sim.binary;
    if (bin && bin.enabled) {
      const pet = bin.lastPeters;
      const omegaGW = pet.omega * 2;  // quadrupole: f_GW = 2 f_orb
      // strain grows as chirp: h ∝ Mc^(5/3) / d
      const h0 = Math.min(1.8, pet.Mc * 0.8 / Math.max(0.5, bin.d));
      const [bx1, by1] = worldToScreen(sim, w, h, bin.x1, bin.y1);
      const [bx2, by2] = worldToScreen(sim, w, h, bin.x2, bin.y2);
      const rSource = bin.d * 0.5 * s;
      const maxR = Math.hypot(w, h) * 0.65;
      const r0 = Math.max(8, rSource * 0.5);
      const ringCount = 8;
      ctx.save();
      ctx.lineWidth = 1.2;
      for (let i = 0; i < ringCount; i++) {
        const phase = ((sim.t * omegaGW * 0.3) + i / ringCount) % 1;
        const r = r0 + phase * (maxR - r0);
        const fade = Math.sin(phase * Math.PI);
        const alpha = 0.38 * fade * Math.min(1, h0);
        if (alpha < 0.01) continue;
        const strain = 0.07 * h0 * fade;
        // h_+ polarisation — quadrupolar (2θ symmetry)
        ctx.strokeStyle = `oklch(0.74 0.15 295 / ${alpha.toFixed(3)})`;
        ctx.beginPath();
        const segs = 120;
        for (let k = 0; k <= segs; k++) {
          const ang = (k / segs) * Math.PI * 2;
          const rr = r * (1 + strain * Math.cos(2 * ang - sim.t * omegaGW));
          ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
        }
        ctx.closePath(); ctx.stroke();
      }
      // h_× cross-polarisation
      {
        const phase = (sim.t * omegaGW * 0.3 + 0.5) % 1;
        const r = r0 + phase * (maxR - r0);
        const fade = Math.sin(phase * Math.PI);
        const alpha = 0.20 * fade * Math.min(1, h0);
        if (alpha > 0.01) {
          ctx.strokeStyle = `oklch(0.82 0.12 320 / ${alpha.toFixed(3)})`;
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          const segs = 120;
          for (let k = 0; k <= segs; k++) {
            const ang = (k / segs) * Math.PI * 2;
            const rr = r * (1 + 0.07 * h0 * fade * Math.cos(2 * ang - sim.t * omegaGW + Math.PI / 2));
            ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
          }
          ctx.closePath(); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // Binary axis line (GW quadrupole axis indicator)
      ctx.strokeStyle = 'oklch(0.78 0.16 295 / 0.5)';
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
      ctx.setLineDash([]);
      // Chirp readouts near midpoint
      const midX = (bx1 + bx2) / 2, midY = (by1 + by2) / 2;
      ctx.fillStyle = 'oklch(0.82 0.12 295 / 0.88)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(`f_GW ${(omegaGW / (2 * Math.PI)).toFixed(3)} c/M  h ${h0.toFixed(2)}`, midX + 10, midY + 28);
      ctx.fillText(`Mc = ${pet.Mc.toFixed(2)} M  t_c = ${pet.t_merge < 1e5 ? pet.t_merge.toFixed(1) : '∞'} M`, midX + 10, midY + 40);
      ctx.restore();
      return; // skip single-body GW below
    }

    // ── Original single-body GW path ─────────────────────
    // Pick the most relativistic orbiter as the dominant GW source.
    let primary = null, bestScore = 0;
    for (const b of sim.bodies) {
      if (b.state !== 'orbit') continue;
      const r = Math.hypot(b.x, b.y);
      if (r < (rplus || 0.5) || r > 35) continue;
      const v = Math.hypot(b.vx, b.vy);
      const score = v / Math.max(0.5, r);   // ~ orbital ω
      if (score > bestScore) { bestScore = score; primary = b; }
    }

    // Base ω from BH spin so the visual still pulses with no orbiters.
    let omegaOrb = 0.18 + Math.abs(a) * 0.20;
    let amp = 0.25;
    let rSource = (rplus || 1) * 1.5;
    if (primary) {
      const r = Math.hypot(primary.x, primary.y);
      const v = Math.hypot(primary.vx, primary.vy);
      omegaOrb = Math.max(0.08, v / Math.max(1, r));
      const compact = Math.min(1, 4 / Math.max(1.5, r));
      const mass = Math.min(1, (primary.binding || 1) / 6);
      amp = 0.25 + 0.85 * compact * (0.3 + mass);
      rSource = r;
    }
    const omegaGW = omegaOrb * 2;

    ctx.save();
    const ringCount = 7;
    const maxR = Math.hypot(w, h) * 0.6;
    const r0 = Math.max(8, rSource * s * 0.4);
    ctx.lineWidth = 1;
    for (let i = 0; i < ringCount; i++) {
      const phase = ((sim.t * omegaGW * 0.35) + i / ringCount) % 1;
      const r = r0 + phase * (maxR - r0);
      if (r < r0) continue;
      const fade = Math.sin(phase * Math.PI);
      const alpha = 0.32 * fade * Math.min(1, amp);
      if (alpha < 0.015) continue;
      const strain = 0.06 * amp * fade;
      ctx.strokeStyle = `oklch(0.74 0.14 295 / ${alpha.toFixed(3)})`;
      ctx.beginPath();
      const segs = 96;
      for (let k = 0; k <= segs; k++) {
        const ang = (k / segs) * Math.PI * 2;
        const rr = r * (1 + strain * Math.cos(2 * ang - sim.t * omegaGW));
        const rx = cx + Math.cos(ang) * rr;
        const ry = cy + Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // h_× ghost ring
    {
      const phase = (sim.t * omegaGW * 0.35 + 0.5) % 1;
      const r = r0 + phase * (maxR - r0);
      const fade = Math.sin(phase * Math.PI);
      const alpha = 0.18 * fade * Math.min(1, amp);
      if (alpha > 0.015) {
        ctx.strokeStyle = `oklch(0.82 0.11 320 / ${alpha.toFixed(3)})`;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        const segs = 96;
        for (let k = 0; k <= segs; k++) {
          const ang = (k / segs) * Math.PI * 2;
          const rr = r * (1 + 0.06 * amp * fade * Math.cos(2 * ang - sim.t * omegaGW + Math.PI / 2));
          const rx = cx + Math.cos(ang) * rr;
          const ry = cy + Math.sin(ang) * rr;
          if (k === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Inner quadrupole "pinwheel"
    if (primary) {
      const [bx, by] = worldToScreen(sim, w, h, primary.x, primary.y);
      ctx.strokeStyle = 'oklch(0.78 0.16 295 / 0.45)';
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'oklch(0.82 0.12 295 / 0.85)';
      ctx.font = '9px JetBrains Mono, monospace';
      const fGW = (omegaGW / (2 * Math.PI)).toFixed(3);
      ctx.fillText(`f_GW ${fGW} c/M  h ${amp.toFixed(2)}`, bx + 10, by + 18);
    } else {
      ctx.fillStyle = 'oklch(0.74 0.10 295 / 0.7)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(`f_GW ${(omegaGW / (2 * Math.PI)).toFixed(3)} c/M`, cx + 14, cy + 26);
    }

    ctx.restore();
  }

  function labelRing(ctx, cx, cy, r, text) {
    ctx.fillStyle = 'oklch(0.58 0.012 255 / 0.9)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(text, cx + r * 0.71, cy - r * 0.71);
  }

  function screenToWorld(sim, w, h, sx, sy) {
    const wx = (sx - w / 2) / sim.view.scale - sim.view.ox;
    const wy = (sy - h / 2) / sim.view.scale - sim.view.oy;
    return [wx, wy];
  }

  window.KNSim = { createSim, addBody, logEv, initBinary, placeCompanion, removeCompanion,
                   step, render, renderInteraction,
                   worldToScreen, screenToWorld, colorOf, predictTrajectory };
})();
