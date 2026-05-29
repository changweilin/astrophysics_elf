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
      // pixels per geometric unit. `frame` locks the camera reference frame:
      // 'free' (manual pan) | 'm1' (primary) | 'm2' (companion) | 'com' (barycenter).
      view: { scale: 18, ox: 0, oy: 0, frame: 'free' },
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
      cx: 0, cy: 0,      // conserved barycentre (centre of mass) — both stars orbit this
      x1: 0, y1: 0,      // primary position (orbits the barycentre)
      y2: 0, x2: 0,      // secondary position
      vx1: 0, vy1: 0,    // primary velocity
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
  // Sets up a real two-body system: both stars orbit the conserved barycentre
  // that the two initial positions define. opts.vx/vy (if given) are the
  // companion's velocity in the lab frame; the primary recoil is derived.
  function placeCompanion(sim, wx, wy, opts = {}) {
    const bin = sim.binary;
    if (!bin) return;
    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;
    bin.x1 = sim.primary.x; bin.y1 = sim.primary.y;
    bin.x2 = wx; bin.y2 = wy;
    const dx0 = wx - bin.x1, dy0 = wy - bin.y1;
    const r = Math.hypot(dx0, dy0);
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

    // Peters readout (used for UI + the GW radiation drag below)
    const pet = phys.peters(M1, M2, r);
    bin.lastPeters = pet;

    // GW back-reaction for every binary (BH, NS, WD, star): a tangential drag on
    // the *relative* motion that bleeds orbital energy at the Peters rate
    // dE/dt = (32/5) M1² M2² (M1+M2) / r⁵ (reduced mass μ = M1 M2 / Mt). This turns
    // a classically stable circular orbit into a GR inspiral — the chirp steepens
    // as r shrinks (∝ r⁻⁵). A double-BH pair ends in merger below; other pairs
    // spiral in until their surfaces touch. Strength: bin.inspiralRate (×Peters).
    if (vrel > 1e-4) {
      const dEdt = (32 / 5) * M1 * M1 * M2 * M2 * Mt / Math.pow(r, 5);
      const mu = (M1 * M2) / Mt;
      let aDrag = (dEdt / (mu * vrel)) * bin.inspiralRate;
      // Cap the bleed so the inspiral stays quasi-static (≳ a few orbits) and the
      // integrator can't pump energy at extreme inspiralRate. The damping rate
      // aDrag/vrel is limited to a fraction of the orbital frequency ω = vrel/r;
      // low/moderate rates pass through unchanged (physically accurate), while
      // very high speedups saturate at the fastest *stable* inspiral.
      const aDragMax = 0.3 * vrel * vrel / r;
      if (aDrag > aDragMax) aDrag = aDragMax;
      arx -= aDrag * Vx / vrel;
      ary -= aDrag * Vy / vrel;
    }

    // Symplectic Euler on the relative coordinate (matches step() substep cadence)
    Vx += arx * dt; Vy += ary * dt;
    Dx += Vx * dt;  Dy += Vy * dt;

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
        bin.merged = true;
        bin.mergerFlash = 1.6;
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
  // local circular velocity v_circ = sqrt(M / r) about the primary (an at-rest
  // body gets a tangential kick). Returns the applied speed.
  function circularizeBody(sim, b) {
    if (!b) return 0;
    const p = sim.primary;
    const dx = b.x - p.x, dy = b.y - p.y;
    const r = Math.max(0.5, Math.hypot(dx, dy));
    const vc = Math.sqrt(sim.params.M / r);
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

  // Binary pair: put both stars onto a classical stable circular orbit about
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

  function render(sim, ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    applyFrameLock(sim); // re-centre camera before any worldToScreen calls
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
    // REPOSITION cue (long-press → drag to move)
    if (sim.moving) {
      let mx = null, my = null, label = '';
      if (sim.moving.kind === 'companion' && sim.binary && sim.binary.enabled) {
        [mx, my] = worldToScreen(sim, w, h, sim.binary.x2, sim.binary.y2);
        label = 'companion';
      } else {
        const b = sim.bodies.find((x) => x.id === sim.moving.bodyId);
        if (b) { [mx, my] = worldToScreen(sim, w, h, b.x, b.y); label = b.name; }
      }
      if (mx != null) {
        ctx.strokeStyle = 'oklch(0.85 0.16 130 / 0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(mx - 23, my); ctx.lineTo(mx - 12, my);
        ctx.moveTo(mx + 12, my); ctx.lineTo(mx + 23, my);
        ctx.moveTo(mx, my - 23); ctx.lineTo(mx, my - 12);
        ctx.moveTo(mx, my + 12); ctx.lineTo(mx, my + 23);
        ctx.stroke();
        ctx.fillStyle = 'oklch(0.85 0.16 130)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`moving · ${label}`, mx + 24, my - 8);
      }
    }

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

  // ── Config + scene persistence (localStorage) ──────────────────────
  // Stores the user-chosen configuration (BH/companion params, disc tuning,
  // overlay toggles, zoom, timescale) AND the live scene the user built up:
  // every orbiting body with its position/velocity, the selected body, and a
  // placed companion's orbital state. Transient/derived data (trails, tidal
  // stress, accretion particles, GW readouts) is left out and recomputed.
  const CONFIG_KEY = 'kn-lab-config-v1';
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const TYPES = { bh: 1, ns: 1, wd: 1, ms: 1 };

  function configSnapshot(sim) {
    const p = sim.params || {}, d = sim.disc, b = sim.binary, f = sim.flags || {}, v = sim.view || {};
    const binSnap = b ? {
      type: b.type, M2: b.M2, Q2: b.Q2, a2: b.a2,
      R_star2: b.R_star2, T_eff2: b.T_eff2, d: b.d,
      _stellarTouched: !!b._stellarTouched,
      enabled: !!b.enabled,
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
        M: p.M, Q: p.Q, a: p.a, type: p.type,
        R_star: p.R_star, T_eff: p.T_eff, B: p.B,
        _stellarTouched: !!p._stellarTouched,
      },
      disc: d ? { enabled: !!d.enabled, alpha: d.alpha, emissionRate: d.emissionRate } : null,
      binary: binSnap,
      flags: { ...f },
      view: { scale: v.scale },
      timescale: sim.timescale,
      t: sim.t,
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
      if (isNum(p.M)) sim.params.M = p.M;
      if (isNum(p.Q)) sim.params.Q = p.Q;
      if (isNum(p.a)) sim.params.a = p.a;
      if (TYPES[p.type]) sim.params.type = p.type;
      if (isNum(p.R_star)) sim.params.R_star = p.R_star;
      if (isNum(p.T_eff)) sim.params.T_eff = p.T_eff;
      if (isNum(p.B)) sim.params.B = p.B;
      sim.params._stellarTouched = !!p._stellarTouched;
    }
    if (cfg.disc && sim.disc) {
      sim.disc.enabled = !!cfg.disc.enabled;
      if (isNum(cfg.disc.alpha)) sim.disc.alpha = cfg.disc.alpha;
      if (isNum(cfg.disc.emissionRate)) sim.disc.emissionRate = cfg.disc.emissionRate;
    }
    if (cfg.binary && sim.binary) {
      const b = cfg.binary, B = sim.binary;
      if (TYPES[b.type]) B.type = b.type;
      if (isNum(b.M2)) B.M2 = b.M2;
      if (isNum(b.Q2)) B.Q2 = b.Q2;
      if (isNum(b.a2)) B.a2 = b.a2;
      if (isNum(b.R_star2)) B.R_star2 = b.R_star2;
      if (isNum(b.T_eff2)) B.T_eff2 = b.T_eff2;
      if (isNum(b.d)) { B.d = b.d; B.d0 = b.d; }
      B._stellarTouched = !!b._stellarTouched;
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
    if (cfg.view && isNum(cfg.view.scale)) {
      sim.view.scale = Math.min(80, Math.max(4, cfg.view.scale));
    }
    if (isNum(cfg.timescale)) sim.timescale = cfg.timescale;
    if (isNum(cfg.t)) sim.t = cfg.t;
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

  window.KNSim = { createSim, addBody, logEv, initBinary, placeCompanion, removeCompanion,
                   step, render, renderInteraction,
                   applyFrameLock, frameAnchor, circularizeBody, circularizeBinary, setBinaryVelocity,
                   worldToScreen, screenToWorld, colorOf, predictTrajectory,
                   saveConfig, readConfig, applyConfig, CONFIG_KEY };
})();
