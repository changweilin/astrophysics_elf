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
        // For ms/giant this is DERIVED from Msun (+ age/Z) via KNphysics.deriveStellar,
        // not a free knob; for wd/ns it is the degenerate-surface default.
        R_star: 3.0,
        // effective surface temperature (Kelvin) — colours the rendered sphere.
        // Derived alongside R_star for ms/giant.
        T_eff: 1e6,
        // Main-sequence age as a fraction of the hydrogen-burning lifetime
        // (0 = ZAMS / birth, 1 = turnoff). Drives ms R★/T★/L evolution.
        age: 0,
        // Heavy-element (metallicity) fraction, 0..1 with 0.5 ≈ solar. Drives
        // giant R★/T★ (metal-rich → cooler, more swollen, redder). For a Cepheid
        // it also slides the mean photosphere across the instability strip.
        Z: 0.5,
        // Cepheid pulsation (giant only): the κ-mechanism drives radial pulsation
        // when the giant sits in the instability strip. cepheidAmp is the fractional
        // radius amplitude (0..0.2); the period is derived (P ∝ √(R³/M)), not a knob.
        cepheid: false,
        cepheidAmp: 0.07,
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
        showGrid: false, showGW: false, showLensing: false, showRoche: true
      },
      paused: false,
      timescale: 1.0,
      selectedId: null,
      seq: 1,
      // Black-hole mass regime: 'stellar' | 'intermediate' | 'supermassive'.
      // Sets the BH mass band and which scale of interactive bodies the Object
      // Library offers (see KNphysics.BH_REGIMES; toggled with the B key).
      bhRegime: 'stellar',
      // Supermassive-scale central structure: 'quasar' | 'cluster' | 'smbh'
      // (only meaningful at the supermassive scale; see KNphysics.SMBH_STRUCTURES).
      smbhStructure: 'smbh',
      // Post-event transient animation (set by coalesce / a Type Ia detonation;
      // advanced by stepTransient, drawn by render.js). null when idle. Drives the
      // multi-phase merger choreography — tidal-tail ejecta, short-GRB jet,
      // blue/red kilonova, r-process cloud, luminous red nova — so a coalescence
      // unfolds over several seconds rather than two bodies snapping into one.
      transient: null,
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
      age2: 0,           // companion main-sequence age fraction (ms evolution)
      Z2: 0.5,           // companion metallicity fraction (giant envelope tuning)
      cepheid: false,    // companion Cepheid pulsation (giant only; κ-mechanism)
      cepheidAmp: 0.07,  // companion fractional radius amplitude
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
      // ── Mass transfer (Roche-lobe overflow) ──
      mtEnabled: true,     // master toggle for the mass-transfer layer
      transferRate: 1,     // ×Roche overflow rate (user-tunable, like inspiralRate)
      // Live mass-transfer state (set by stepMassTransfer). donor/accretor are
      // 1 (primary) or 2 (companion); mode classifies the transfer regime.
      mt: { active: false, donor: 0, accretor: 0, mode: 'none',
            mdot: 0, transferred: 0, q: 0, RL1: 0, RL2: 0,
            mAccH: 0, novaCount: 0, mAccHe: 0, xrayCount: 0 },
      // Surface-flash timers (seconds) and the common-envelope glow flag — these
      // drive the render-side nova/Ia/CE visuals, mirroring mergerFlash.
      // xrayFlash = Type I X-ray burst (NS accretor); aicFlash = accretion-induced
      // collapse implosion (NS → BH); aicAt holds the collapsing star's index.
      novaFlash: 0, snFlash: 0, ceFlash: 0, ceActive: false,
      xrayFlash: 0, aicFlash: 0, aicAt: 0,
      // Common-envelope spiral-in bookkeeping (set when CE is triggered; the orbit
      // then shrinks over several steps so the pair visibly spirals in rather than
      // teleporting into a merger). ceSurvive/ceTargetA decide the close-binary vs
      // merger end state; ceCore/ceCoreType/ceDonor describe the stripped core.
      ceSurvive: false, ceTargetA: 0, ceCore: 0, ceCoreType: null, ceDonor: 0,
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
    // Keep the companion just clear of surface CONTACT (1.25x the summed
    // photospheres/horizons) so a freshly placed pair doesn't merge on touch — but
    // do NOT push it out past its Roche lobe: a star placed near contact fills its
    // lobe and transfers mass, which is exactly the Roche-lobe overflow we want to
    // show. The transfer / common envelope it triggers evolves gradually (see
    // stepCommonEnvelope), so the pair does not snap into a compact remnant.
    const surfaceOf = (type, M, Q, a, Rs) => (type || 'bh') === 'bh'
      ? (() => { const h = phys.horizons(M, Q || 0, a || 0); return (isFinite(h.rplus) && !h.naked) ? h.rplus : 2 * M; })()
      : (Rs || 3);
    const surf1 = surfaceOf(sim.params.type, M1, sim.params.Q, sim.params.a, sim.params.R_star);
    const surf2 = surfaceOf(bin.type, M2, bin.Q2, bin.a2, bin.R_star2);
    const rMin = 1.25 * (surf1 + surf2);
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
      if (fit < sim.view.scale) sim.view.scale = Math.max(phys.VIEW_SCALE_MIN, Math.min(phys.VIEW_SCALE_MAX, fit));
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
    sim.transient = null;
    resetMassTransfer(bin);
  }

  // Clear the mass-transfer state + flash timers for a fresh / removed companion.
  function resetMassTransfer(bin) {
    bin.mt = { active: false, donor: 0, accretor: 0, mode: 'none',
               mdot: 0, transferred: 0, q: 0, RL1: 0, RL2: 0,
               mAccH: 0, novaCount: 0, mAccHe: 0, xrayCount: 0 };
    bin.novaFlash = 0; bin.snFlash = 0; bin.ceFlash = 0; bin.ceActive = false;
    bin.xrayFlash = 0; bin.aicFlash = 0; bin.aicAt = 0;
    bin.ceSurvive = false; bin.ceTargetA = 0; bin.ceCore = 0; bin.ceCoreType = null; bin.ceDonor = 0;
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
    sim.transient = null;
    resetMassTransfer(bin);
  }

  function stepBinary(sim, dt) {
    const bin = sim.binary;
    if (!bin) return;
    // The post-event transient outlives the binary (a merger ends it), so advance
    // it every step regardless of whether the pair is still evolving.
    if (sim.transient) stepTransient(sim, dt);
    if (!bin.enabled) {
      bin.x1 = sim.primary.x; bin.y1 = sim.primary.y;
      if (bin.mergerFlash > 0) bin.mergerFlash = Math.max(0, bin.mergerFlash - dt);
      // Keep terminal-event flashes (Type Ia, last nova) fading after the binary
      // ends, so the burst is visible even though the pair is no longer evolving.
      if (bin.novaFlash > 0) bin.novaFlash = Math.max(0, bin.novaFlash - dt);
      if (bin.snFlash > 0)   bin.snFlash   = Math.max(0, bin.snFlash - dt);
      if (bin.ceFlash > 0)   bin.ceFlash   = Math.max(0, bin.ceFlash - dt);
      if (bin.xrayFlash > 0) bin.xrayFlash = Math.max(0, bin.xrayFlash - dt);
      if (bin.aicFlash > 0)  bin.aicFlash  = Math.max(0, bin.aicFlash - dt);
      return;
    }

    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;

    // Decay the surface-event flashes while the pair keeps evolving (recurrent
    // novae and the common-envelope glow happen on a still-enabled binary).
    if (bin.novaFlash > 0) bin.novaFlash = Math.max(0, bin.novaFlash - dt);
    if (bin.snFlash > 0)   bin.snFlash   = Math.max(0, bin.snFlash - dt);
    if (bin.ceFlash > 0)   bin.ceFlash   = Math.max(0, bin.ceFlash - dt);
    if (bin.xrayFlash > 0) bin.xrayFlash = Math.max(0, bin.xrayFlash - dt);
    if (bin.aicFlash > 0)  bin.aicFlash  = Math.max(0, bin.aicFlash - dt);

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
    // Skip GW radiation reaction while mass transfer / a common envelope is active:
    // for an interacting binary the mass-transfer-driven orbital evolution (handled
    // in stepMassTransfer, in role-independent solar masses) dominates over GW, and
    // mixing in the primary-normalised geometric GW rate would make the same
    // physical pair evolve differently depending on which star is the central body.
    const mtActive = !!(bin.mt && bin.mt.active);
    if (!bin.classical && !mtActive) {
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

    // ── Mass transfer (Roche-lobe overflow) ──────────────────
    // Evolve any donor that fills its Roche lobe: move mass, react the orbit, and
    // resolve the nova / Type Ia / common-envelope branches. It may end or
    // transform the binary, in which case it signals that this step is done.
    if (stepMassTransfer(sim, dt)) return;

    // ── Merger / coalescence ──────────────────────────────────
    // ANY pair coalesces when their surfaces touch.
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
    const bothBH = cType === 'bh' && sType === 'bh';
    // BH pairs coalesce just before the horizons touch (final plunge); bodies
    // with a real surface coalesce on contact.
    const rmerge = bothBH ? surface1 + surface2 * 1.05 : surface1 + surface2;
    if (bin.d <= rmerge && !bin.merged) {
      const isCompact = (t) => t === 'bh' || t === 'ns' || t === 'wd';
      if (bin.ceActive) {
        // A common envelope is spiralling in. Only the MERGER branch coalesces at
        // contact; a SURVIVOR's inflated envelope overlapping the companion IS the
        // shared envelope, not a core collision — let it finish ejecting (handled
        // by stepCommonEnvelope), so it is not wrongly merged on the way in.
        if (!bin.ceSurvive) coalesce(sim, bin, M1, M2, 'ce');
        return;
      }
      if (isCompact(cType) && isCompact(sType)) {
        // Two compact bodies touching → classify the multi-messenger channel
        // (GW only, NS-NS/NS-BH kilonova + short GRB, or a double-degenerate
        // Type Ia) and coalesce accordingly.
        const ch = phys.compactMergerChannel(cType, starMsun(sim, bin, 1), sType, starMsun(sim, bin, 2));
        if (ch.ddIa) {
          // WD-WD over Chandrasekhar → double-degenerate Type Ia detonation: the
          // central white dwarf detonates and the companion is unbound, mirroring
          // the single-degenerate path, with a dedicated transient overlay.
          armTransient(sim, bin, ch);
          typeIaSupernova(sim, bin, 1, 2);
        } else {
          coalesce(sim, bin, M1, M2, 'gw', ch);
        }
      } else {
        // At least one EXTENDED star (MS/giant) makes contact → the envelope
        // engulfs the companion and a common envelope forms; the cores spiral in
        // rather than the stars cleanly merging on touch. Donor = more extended.
        const r1 = isCompact(cType) ? 0 : (sim.params.R_star || 0);
        const r2 = isCompact(sType) ? 0 : (bin.R_star2 || 0);
        beginCommonEnvelope(sim, bin, r1 >= r2 ? 1 : 2);
      }
      return;
    }

    // A bound pair's separation stays near its placement value; only a genuinely
    // unbound companion runs away without limit. Scale the escape cutoff to the
    // initial separation so a widely-placed (large-star) binary — which must start
    // far apart just to clear its Roche lobe — is not mistaken for an escape.
    if (bin.d > Math.max(200, 3 * (bin.d0 || 20))) {
      bin.enabled = false;
      logEv(sim, 'amber', tr('companion escaped binary system', '伴星逃離雙星系統'));
    }
  }

  // Coalesce the binary into a single remnant. The remnant carries the COMBINED
  // mass of both progenitors MINUS the energy radiated away as gravitational
  // waves in the final plunge + ringdown, is reclassified by the resulting solar
  // mass, and has its surface re-derived. The GW burst is a strong-field effect,
  // so it is scaled by how compact the progenitors are: two black holes radiate
  // the full NR-fit (~5.5% at equal mass), while two diffuse stars merge with
  // negligible GW loss. Used by both the contact path and the common-envelope
  // spiral-in. `reason` tags the event log ('gw' merger vs 'ce' common envelope).
  function coalesce(sim, bin, M1, M2, reason = 'gw', channel = null) {
    const cType = sim.params.type || 'bh';
    const sType = bin.type || 'bh';
    const bothBH = cType === 'bh' && sType === 'bh';

    // Arm the multi-phase EM/GW transient for this coalescence (tidal-tail
    // ejecta, short-GRB jet, kilonova, r-process cloud, or a luminous red nova).
    // A clean black-hole pair / clean NS-BH plunge has no rich transient — the
    // existing merger flash + ringdown stand in. Computed from the progenitor
    // types unless a channel was already classified by the caller.
    const ch = channel || phys.compactMergerChannel(
      cType, starMsun(sim, bin, 1), sType, starMsun(sim, bin, 2));
    armTransient(sim, bin, ch);

    // Remnant mass, spin and radiated energy from the NR-fit (mass ratio +
    // both progenitor spins). Equal-mass non-spinning → ~5.5% of Mt radiated
    // and a_f/M_f ≈ 0.69; extreme mass ratios radiate little.
    const chi1 = sim.params.a / Math.max(0.05, M1);   // dimensionless spins a/M
    const chi2 = (bin.a2 || 0) / Math.max(0.05, M2);
    const orbitSign = Math.sign(sim.params.a || 1);
    const rem = phys.mergerRemnant(M1, M2, chi1, chi2, orbitSign);

    // Compactness factor per progenitor TYPE (not its inflated display radius), so
    // the GW burst is role-independent: two black holes radiate the full NR-fit,
    // while a diffuse star radiates almost nothing. Two BHs → 1·1 = 1 (preserves
    // the GW150914-style result); anything extended → negligible loss.
    const compOf = (t) => t === 'bh' ? 1 : t === 'ns' ? 0.7 : t === 'wd' ? 0.4 : t === 'giant' ? 0.04 : 0.1;
    const eMergerGW = rem.eRad * compOf(cType) * compOf(sType);   // geometric GW energy radiated

    // Combined physical (solar) mass: the total mass MINUS the GW energy that
    // escaped. Mt and eMergerGW are geometric (units of the old primary M=1),
    // so the final geometric mass is (M1+M2) − eMergerGW and the solar mass is
    // that × Msun (the solar-mass-per-unit factor). Geometry stays in units of
    // M, so the geometric mass resets to 1 and a/Q become dimensionless a/M, Q/M.
    const MfGeo = (M1 + M2) - eMergerGW;
    const MsunFinal = MfGeo * (sim.params.Msun || 1);

    // Reclassify the remnant. A black-hole progenitor always wins; two compact
    // remnants (WD/NS) collapse by the combined solar mass (WD→NS→BH); a merger
    // that still involves a star keeps the more evolved stellar stage (two MS
    // stars → a heavier MS star; anything with a giant → a giant).
    let newType;
    if (bothBH || cType === 'bh' || sType === 'bh') {
      newType = 'bh';
    } else if ((cType === 'wd' || cType === 'ns') && (sType === 'wd' || sType === 'ns')) {
      newType = phys.remnantType(MsunFinal);
    } else if (cType === 'giant' || sType === 'giant') {
      newType = 'giant';
    } else {
      newType = 'ms';
    }

    // Charge and spin combine about the orbital axis, then clamp sub-extremal
    // (Q² + a² < M², geometric M = 1) so a chance sum never exposes a naked
    // singularity. The NR-fit a_f already folds in orbital + progenitor spin.
    let Qf = sim.params.Q + (bin.Q2 || 0);
    let af = rem.af;
    const cap = 0.998;
    if (Math.abs(Qf) > cap) Qf = Math.sign(Qf) * cap;
    const room = Math.sqrt(Math.max(0, cap * cap - Qf * Qf));
    if (Math.abs(af) > room) af = Math.sign(af || 1) * room;

    bin.merged = true;
    bin.mergerFlash = 1.6;
    bin.eMergerGW = eMergerGW;     // GW energy in the merger/ringdown burst
    bin.eGW = (bin.eGW || 0) + eMergerGW;
    sim.params.M = 1;
    sim.params.Msun = MsunFinal;
    sim.params.type = newType;
    sim.params.Q = Qf;
    sim.params.a = af;            // a/M (geometric M = 1)

    // Re-derive the remnant's surface (R★, T★) for its new stellar stage; a BH
    // has none. A fresh remnant starts at ZAMS age, with its metallicity kept.
    if (newType !== 'bh') {
      sim.params.age = 0;
      if (sim.params.Z == null) sim.params.Z = 0.5;
      const ds = phys.deriveStellar(newType, MsunFinal,
        { age: 0, Z: sim.params.Z, a: sim.params.a, B: sim.params.B || 0 });
      if (ds) { sim.params.R_star = ds.R_star; sim.params.T_eff = ds.T_eff; }
      sim.params._stellarTouched = false;
    }
    // Reframe the camera when the body changed size stage (e.g. two giants →
    // a compact remnant); leave a BH+BH coalescence framed as it was.
    if (!bothBH) sim.view.scale = phys.VIEW_SCALES[phys.uiCategory(newType)];

    bin.enabled = false;
    if (reason === 'ce') {
      logEv(sim, 'warn', trp('COMMON ENVELOPE → merger · M_f={mf} M⊙', { mf: MsunFinal.toFixed(1) }));
    } else {
      logEv(sim, 'warn', trp(
        'MERGER · η={eta} · M_f={mf} M⊙ · E_GW={egw} c² ({pct}%)',
        { eta: rem.eta.toFixed(3), mf: MsunFinal.toFixed(1),
          egw: eMergerGW.toFixed(3), pct: (eMergerGW / (M1 + M2) * 100).toFixed(1) }));
    }
    if (newType === 'bh') {
      logEv(sim, 'amber', trp('ringdown · a_f/M_f → {af}', { af: af.toFixed(3) }));
    } else {
      logEv(sim, 'amber', trp('remnant → {type}', { type: newType.toUpperCase() }));
    }
  }

  // ── Post-coalescence transient sequencer ──────────────────
  // Arm (or skip) the multi-phase animation that plays out AFTER a coalescence
  // from its classified channel. It stores only the flags + jet axis the
  // renderer needs; the burst is anchored at the scene centre (where the remnant
  // is drawn), like the existing merger / SN flashes. Channels with no
  // electromagnetic counterpart (a clean black-hole pair, or a neutron star
  // swallowed whole by a heavy black hole) arm nothing — the merger flash and
  // ringdown already stand in for them. Also writes the multi-messenger log so
  // each physically-triggered channel is recorded as it fires.
  function armTransient(sim, bin, ch) {
    if (!ch) { return; }
    // Jet / ejecta axis: perpendicular to the final separation vector (the orbital
    // angular-momentum direction projected into the equatorial view plane).
    const sepAng = Math.atan2((bin.y2 - bin.y1) || 0, (bin.x2 - bin.x1) || 1);
    const axis = sepAng + Math.PI / 2;
    if (ch.grb || ch.kilonova) {
      logEv(sim, 'warn', tr('compact merger -> kilonova + short GRB', '密緻天體合併 → 千新星 + 短伽瑪射線暴'));
      logEv(sim, 'amber', tr('relativistic jet + accretion disc formed', '相對論性噴流 + 吸積盤形成'));
      if (ch.rProcess) logEv(sim, 'amber', tr('r-process nucleosynthesis · heavy elements forged', 'r-過程核合成 · 鍛造重元素'));
    } else if (ch.lrn) {
      logEv(sim, 'warn', tr('stellar merger -> luminous red nova', '恆星合併 → 紅色高光度新星'));
    } else if (ch.ddIa) {
      logEv(sim, 'warn', tr('double-degenerate WD merger -> Type Ia', '雙簡併白矮星合併 → Ia 型'));
    } else if (ch.channel === 'disc') {
      logEv(sim, 'amber', tr('white dwarf shredded -> debris disc', '白矮星被瓦解 → 碎屑吸積盤'));
    }
    const RICH = { nsns: 1, nsbh: 1, lrn: 1, ddIa: 1, disc: 1 };
    if (!RICH[ch.channel]) { sim.transient = null; return; }
    sim.transient = {
      kind: ch.channel, t: 0,
      dur: ch.lrn ? 6.0 : ch.channel === 'disc' ? 3.5 : 5.0,
      axis,
      grb: !!ch.grb, kilonova: !!ch.kilonova, rProcess: !!ch.rProcess,
      ddIa: !!ch.ddIa, lrn: !!ch.lrn, ejecta: ch.ejecta || 0.5,
    };
  }

  // Advance the active transient; clear it when its timeline completes.
  function stepTransient(sim, dt) {
    const tx = sim.transient;
    if (!tx) return;
    tx.t += dt;
    if (tx.t >= tx.dur) sim.transient = null;
  }

  // ── Mass-transfer helpers ─────────────────────────────────
  // Read / write a star's physical (solar) mass by index (1 = central primary,
  // 2 = companion). The primary's solar mass IS the geometric unit, so whenever
  // either mass changes the companion's geometric mass bin.M2 is re-synced from
  // bin.M2sun / sim.params.Msun (the demo keeps geometry frozen in units of M).
  function starMsun(sim, bin, idx) {
    if (idx === 1) return sim.params.Msun || 1;
    return bin.M2sun != null ? bin.M2sun : (bin.M2 || 0.8) * (sim.params.Msun || 1);
  }
  function setStarMsun(sim, bin, idx, m) {
    const mv = Math.max(0.05, m);
    if (idx === 1) sim.params.Msun = mv;
    else           bin.M2sun = mv;
    bin.M2 = Math.max(0.001, (bin.M2sun != null ? bin.M2sun : 8) / Math.max(0.05, sim.params.Msun || 1));
  }
  function starType(sim, bin, idx) { return idx === 1 ? (sim.params.type || 'bh') : (bin.type || 'bh'); }
  function setStarType(sim, bin, idx, t) { if (idx === 1) sim.params.type = t; else bin.type = t; }

  // A star's contact surface (geometric units): the outer horizon for a black
  // hole, otherwise its photosphere R★. Mirrors the surface logic in coalesce.
  function starSurface(sim, bin, idx) {
    const t = starType(sim, bin, idx);
    if (t === 'bh') {
      const M = idx === 1 ? sim.params.M : bin.M2;
      const Q = idx === 1 ? sim.params.Q : (bin.Q2 || 0);
      const a = idx === 1 ? sim.params.a : (bin.a2 || 0);
      const h = phys.horizons(M, Q, a);
      return (isFinite(h.rplus) && !h.naked) ? h.rplus : M;
    }
    return idx === 1 ? (sim.params.R_star || 3) : (bin.R_star2 || 3);
  }

  // Re-derive a star's photosphere (R★, T★, L) from its current mass + stage so
  // the surface tracks mass changes (a donor shrinks and self-regulates overflow,
  // an accretor swells). A black hole has no surface.
  function deriveStarSurface(sim, bin, idx) {
    if (idx === 1) {
      if ((sim.params.type || 'bh') === 'bh') return;
      const ds = phys.deriveStellar(sim.params.type, sim.params.Msun,
        { age: sim.params.age || 0, Z: sim.params.Z != null ? sim.params.Z : 0.5, a: sim.params.a, B: sim.params.B || 0 });
      if (ds) { sim.params.R_star = ds.R_star; sim.params.T_eff = ds.T_eff; sim.params._L = ds.L; }
    } else {
      if ((bin.type || 'bh') === 'bh') return;
      const ds = phys.deriveStellar(bin.type, bin.M2sun,
        { age: bin.age2 || 0, Z: bin.Z2 != null ? bin.Z2 : 0.5, a: bin.a2, B: bin.B2 || 0 });
      if (ds) { bin.R_star2 = ds.R_star; bin.T_eff2 = ds.T_eff; bin._L2 = ds.L; }
    }
  }

  // Rescale the orbital separation by factor s about the conserved barycentre,
  // keeping the orbit quasi-circular (v ∝ 1/√r). Both stars move proportionally
  // about (cx,cy) so the separation scales by s and the barycentre is preserved.
  function applySeparationScale(bin, s) {
    if (!(s > 0) || Math.abs(s - 1) < 1e-9) return;
    bin.x1 = bin.cx + (bin.x1 - bin.cx) * s; bin.y1 = bin.cy + (bin.y1 - bin.cy) * s;
    bin.x2 = bin.cx + (bin.x2 - bin.cx) * s; bin.y2 = bin.cy + (bin.y2 - bin.cy) * s;
    const vb = 1 / Math.sqrt(s);
    bin.vx1 *= vb; bin.vy1 *= vb; bin.vx2 *= vb; bin.vy2 *= vb;
    bin.d = Math.hypot(bin.x2 - bin.x1, bin.y2 - bin.y1);
  }

  // Re-seat the pair on a CLEAN circular orbit at separation aTarget about the
  // barycentre, along the current orbital phase, with the exact circular relative
  // speed √(Mt/a). Used after a discrete orbit change (e.g. common-envelope
  // ejection) so the system lands on a proper bound orbit instead of an eccentric
  // state that would spuriously pump energy and drift the cores apart.
  function setCircularOrbit(sim, bin, aTarget) {
    const M1 = sim.params.M, M2 = bin.M2, Mt = M1 + M2;
    const th = bin.theta, c = Math.cos(th), s = Math.sin(th);
    const dir = Math.sign(bin.omega || sim.params.a || 1) || 1;
    const f1 = M2 / Mt, f2 = M1 / Mt;
    bin.x1 = bin.cx - f1 * aTarget * c; bin.y1 = bin.cy - f1 * aTarget * s;
    bin.x2 = bin.cx + f2 * aTarget * c; bin.y2 = bin.cy + f2 * aTarget * s;
    const vrel = Math.sqrt(Mt / Math.max(0.5, aTarget));
    const vx = -s * vrel * dir, vy = c * vrel * dir;       // perpendicular to the axis
    bin.vx1 = -f1 * vx; bin.vy1 = -f1 * vy;
    bin.vx2 =  f2 * vx; bin.vy2 =  f2 * vy;
    bin.d = aTarget; bin.omega = vrel / aTarget;
  }

  const CE_DRAG = 0.5;     // common-envelope orbital-decay rate (slow, watchable spiral-in)
  const CE_STRIP = 0.6;    // rate the donor sheds its envelope toward the bare core

  // Begin a common envelope: decide the end state once (α-λ energy balance) and
  // arm the spiral-in. The cores then come together over several steps via
  // stepCommonEnvelope rather than snapping together. donorIdx is the engulfing
  // (more extended) star whose envelope is shared/ejected.
  function beginCommonEnvelope(sim, bin, donorIdx) {
    const accIdx = donorIdx === 1 ? 2 : 1;
    const Md = starMsun(sim, bin, donorIdx), Ma = starMsun(sim, bin, accIdx);
    const Rd = starSurface(sim, bin, donorIdx);
    const donorType = starType(sim, bin, donorIdx);
    const out = phys.ceOutcome({ Md, Ma, Rd, a: bin.d, donorType }, phys.CE_ALPHA, phys.CE_LAMBDA);
    // Survival is an energy decision: enough orbital energy must remain to eject the
    // envelope and leave the cores bound above a small floor (gravitational radii — a
    // bare giant core is a compact WD/NS/BH, not its inflated display surface).
    const CE_AF_FLOOR = 2.5;
    bin.ceCore = out.M_core;
    bin.ceCoreType = donorType === 'giant' ? phys.remnantType(out.M_core) : donorType;
    bin.ceDonor = donorIdx;
    bin.ceSurvive = out.survive && out.a_f > CE_AF_FLOOR;
    if (bin.ceSurvive) {
      const coreDs = phys.deriveStellar(bin.ceCoreType, out.M_core, { age: 0, Z: 0.5 });
      const coreR = coreDs ? coreDs.R_star : 2;
      bin.ceTargetA = Math.max(out.a_f, 1.2 * (coreR + starSurface(sim, bin, accIdx)));
    } else bin.ceTargetA = 0;
    bin.ceActive = true; bin.ceFlash = 1.6;
    bin.mt.mode = 'ce'; bin.mt.active = true; bin.mt.donor = donorIdx; bin.mt.accretor = accIdx;
    logEv(sim, 'warn', bin.ceSurvive
      ? trp('common envelope · spiral-in → close binary (core {mc} M⊙)', { mc: out.M_core.toFixed(2) })
      : tr('common envelope · spiral-in → merger', '共有包層 · 旋進 → 合併'));
  }

  // Evolve Roche-lobe overflow + mass transfer one step. Returns true if the
  // binary was ended/transformed (Type Ia detonation or common-envelope merger),
  // signalling the caller to stop this step. Masses are solar; lengths geometric.
  function stepMassTransfer(sim, dt) {
    const bin = sim.binary;
    if (!bin || !bin.enabled || bin.merged || !bin.mtEnabled || bin.held) return false;
    const mt = bin.mt;
    const a = bin.d;
    if (!(a > 0)) return false;

    // A common envelope already underway drives a rapid orbital spiral-in (handled
    // separately so the pair visibly comes together before it merges or ejects the
    // envelope) — skip the normal overflow bookkeeping while it runs.
    if (bin.ceActive) return stepCommonEnvelope(sim, bin, dt);

    const M1sun = starMsun(sim, bin, 1);
    let   M2sun = starMsun(sim, bin, 2);
    if (bin.M2sun == null) bin.M2sun = M2sun;     // ensure the solar mass is materialised
    const cType = sim.params.type || 'bh';
    const sType = bin.type || 'bh';
    const R1 = cType === 'bh' ? 0 : (sim.params.R_star || 3);
    const R2 = sType === 'bh' ? 0 : (bin.R_star2 || 3);

    // Eggleton Roche-lobe radii and the fractional overflow of each surface. Only
    // EXTENDED stars (main-sequence, giant) can fill a Roche lobe — a compact
    // remnant (WD/NS/BH) is physically tiny (its drawn disk is inflated for
    // visibility) and acts only as an accretor, so it never overflows here.
    const extended1 = cType === 'ms' || cType === 'giant';
    const extended2 = sType === 'ms' || sType === 'giant';
    const RL1 = phys.rocheLobeEggleton(M1sun, M2sun, a);
    const RL2 = phys.rocheLobeEggleton(M2sun, M1sun, a);
    mt.RL1 = RL1; mt.RL2 = RL2;
    const over1 = (extended1 && R1 > RL1) ? (R1 - RL1) / RL1 : 0;
    const over2 = (extended2 && R2 > RL2) ? (R2 - RL2) / RL2 : 0;

    if (over1 <= 0 && over2 <= 0) {
      if (mt.active) { mt.active = false; mt.mode = 'none'; mt.mdot = 0; }
      return false;
    }

    // BOTH stars fill their lobes → a contact binary sharing a common envelope.
    // Resolve it as CE with the more extended star as the donor. This decision is
    // role-independent (it uses only the display radii and the lobe geometry, not
    // which star is the geometric primary), so the same physical pair behaves the
    // same whichever one the user designated as the central body.
    if (over1 > 0 && over2 > 0) {
      beginCommonEnvelope(sim, bin, R1 >= R2 ? 1 : 2);
      return stepCommonEnvelope(sim, bin, dt);
    }

    // Single overflower = the donor; the other star is the accretor.
    const dPrim = over1 > 0;
    const donorIdx = dPrim ? 1 : 2;
    const accIdx   = dPrim ? 2 : 1;
    const Md = dPrim ? M1sun : M2sun;
    const Ma = dPrim ? M2sun : M1sun;
    const Rd = dPrim ? R1 : R2;
    const RLd = dPrim ? RL1 : RL2;
    const donorType = dPrim ? cType : sType;
    const accType   = dPrim ? sType : cType;
    const q = Md / Math.max(0.05, Ma);

    const K = phys.MT_K * Math.max(0, bin.transferRate || 1);
    const mdot = phys.massTransferRate(Rd, RLd, K);
    // Move at most a small fraction of the donor per step (keeps the orbit and
    // surfaces smooth — only surface gas streams across L1), and never drain the
    // donor below a token mass.
    let dm = Math.min(mdot * dt, 0.008 * Md, Math.max(0, Md - 0.08));

    mt.active = true;
    mt.donor = donorIdx; mt.accretor = accIdx;
    mt.mdot = mdot; mt.q = q;

    // ── Dynamically-unstable overflow → common envelope ──
    // Above the critical mass ratio the donor's envelope cannot be stabilised
    // (its radius response outruns the shrinking lobe), so the accretor is engulfed
    // and a common envelope forms. The cores then spiral in over several steps
    // (stepCommonEnvelope), shedding the envelope gradually — the donor does NOT
    // teleport into a bare compact core.
    if (q > phys.ceCriticalQ(donorType)) {
      beginCommonEnvelope(sim, bin, donorIdx);
      return stepCommonEnvelope(sim, bin, dt);
    }

    // ── Stable conservative transfer ──
    mt.mode = 'stable';
    if (dm <= 0) return false;

    // If this step would drain the donor to a token mass (an extreme mass ratio
    // keeps it overflowing until it is gone), the donor is tidally disrupted and
    // wholly absorbed by the accretor; the binary ends with the accretor alone.
    if (Md - dm <= 0.12) {
      setStarMsun(sim, bin, accIdx, Ma + Md);     // accretor takes the entire donor
      mt.transferred = (mt.transferred || 0) + Md;
      consumeDonor(sim, bin, accIdx);
      return true;
    }

    // Donor loses dm.
    setStarMsun(sim, bin, donorIdx, Md - dm);
    mt.transferred = (mt.transferred || 0) + dm;

    // Accretor gains dm — with the white-dwarf nova / Type Ia branches.
    const MaNew = Ma + dm;
    if (accType === 'wd') {
      setStarMsun(sim, bin, accIdx, MaNew);
      mt.mAccH = (mt.mAccH || 0) + dm;
      if (MaNew >= phys.M_CHANDRASEKHAR) {
        // Type Ia supernova: the WD reaches the Chandrasekhar mass and detonates,
        // unbound entirely. The donor survives (kicked free).
        typeIaSupernova(sim, bin, accIdx, donorIdx);
        return true;
      }
      if (mt.mAccH >= phys.novaIgnitionMass(MaNew)) {
        // Recurrent nova: the accreted hydrogen shell ignites and flashes off.
        mt.mAccH = 0;
        mt.novaCount = (mt.novaCount || 0) + 1;
        bin.novaFlash = 1.2;
        logEv(sim, 'amber', trp('NOVA · #{n} · M_WD={m} M⊙', { n: mt.novaCount, m: MaNew.toFixed(3) }));
      }
    } else if (accType === 'ns') {
      setStarMsun(sim, bin, accIdx, MaNew);
      if (MaNew >= phys.M_TOV) {
        // Accretion-induced collapse: the neutron star is pushed past the TOV
        // ceiling and implodes to a black hole (a brief implosion + neutrino
        // flash, then a tiny new horizon). The binary continues as BH + donor.
        setStarType(sim, bin, accIdx, 'bh');
        bin.aicFlash = 1.4; bin.aicAt = accIdx;
        deriveStarSurface(sim, bin, accIdx);
        logEv(sim, 'warn', trp('accretion-induced collapse → BH · M={m} M⊙', { m: MaNew.toFixed(2) }));
      } else {
        // Type I X-ray burst: accreted H/He builds an unstable shell on the
        // neutron-star crust that ignites in a thermonuclear flash, far more
        // frequently than a white-dwarf nova (the NS surface gravity is ~1e5×).
        mt.mAccHe = (mt.mAccHe || 0) + dm;
        if (mt.mAccHe >= phys.xrayBurstIgnitionMass(MaNew)) {
          mt.mAccHe = 0;
          mt.xrayCount = (mt.xrayCount || 0) + 1;
          bin.xrayFlash = 0.9;
          logEv(sim, 'amber', trp('X-RAY BURST · #{n} · M_NS={m} M⊙', { n: mt.xrayCount, m: MaNew.toFixed(2) }));
        }
      }
    } else {
      // Black-hole accretor (or any other): simply grows.
      setStarMsun(sim, bin, accIdx, MaNew);
    }

    // Orbital reaction to the transfer (J-conserving): shrinks if the donor is
    // heavier (runaway), widens if lighter (self-regulating). Applied ADIABATICALLY
    // — a tiny change per step — so the orbit drifts gently as real RLOF does
    // rather than flinging the stars apart; as it widens the lobe grows and the
    // overflow self-limits. A hard cap keeps a widening binary on-screen and bound
    // (it must not run past the d>80 escape cut: the drift is internal, not a kick).
    const rate = phys.orbitalResponseRate(Md, Ma, mdot);     // (da/dt)/a
    let scaleA = 1 + rate * dt;
    scaleA = Math.max(0.99, Math.min(1.01, scaleA));
    const dCap = Math.min(Math.max(2 * (bin.d0 || a), a), 72);
    if (scaleA > 1 && bin.d * scaleA > dCap) scaleA = Math.max(1, dCap / bin.d);
    applySeparationScale(bin, scaleA);

    // Keep the mass-transferring orbit circular (tides circularise an interacting
    // binary). This also makes the evolution depend only on role-independent
    // quantities — separation, masses, overflow — so the same physical pair evolves
    // the same regardless of which star the user designated as the central body
    // (otherwise the orbital period, which is set by the primary-normalised
    // geometric mass, would sample an eccentric orbit differently for each role).
    setCircularOrbit(sim, bin, bin.d);

    // Re-derive both surfaces so the donor self-regulates and the accretor swells.
    deriveStarSurface(sim, bin, donorIdx);
    deriveStarSurface(sim, bin, accIdx);
    return false;
  }

  // Drive a common envelope already in progress. The orbit decays through drag in
  // the shared envelope (the orbital angular momentum is carried off by the gas
  // being ejected — that loss IS what powers the in-spiral), and a survivor sheds
  // its envelope GRADUALLY so the donor visibly shrinks toward its bare core rather
  // than snapping compact. A survivor settles on a clean circular orbit once the
  // envelope is gone; a merger spirals to contact and the normal check coalesces it
  // (so the merge is always drawn at contact).
  function stepCommonEnvelope(sim, bin, dt) {
    const mt = bin.mt;
    const donorIdx = bin.ceDonor || 1, accIdx = donorIdx === 1 ? 2 : 1;
    bin.ceFlash = 1.6;                 // keep the envelope haze lit while spiralling
    mt.mode = 'ce'; mt.active = true; mt.donor = donorIdx; mt.accretor = accIdx;

    if (bin.ceSurvive) {
      const target = bin.ceTargetA || 0;
      const Md = starMsun(sim, bin, donorIdx);
      const env = Md - bin.ceCore;
      if (env > 1e-3) {
        // Shed the envelope toward the bare core (mass leaves the system, carrying
        // angular momentum); the donor shrinks as it loses its loose outer layers.
        const dEj = Math.min(env, env * (1 - Math.exp(-CE_STRIP * dt)) + 1e-3);
        setStarMsun(sim, bin, donorIdx, Md - dEj);
        deriveStarSurface(sim, bin, donorIdx);
        mt.mdot = dEj / Math.max(1e-6, dt);     // drives the visible stream/glow
      }
      if (bin.d > target) {
        applySeparationScale(bin, Math.max(0.9, Math.exp(-CE_DRAG * dt)));
        setCircularOrbit(sim, bin, bin.d);   // keep the in-spiral clean & role-independent
      }
      // Finalize once the envelope is gone: bare core on a clean circular orbit.
      if (starMsun(sim, bin, donorIdx) <= bin.ceCore * 1.02 && bin.d <= target * 1.06) {
        setStarMsun(sim, bin, donorIdx, bin.ceCore);
        setStarType(sim, bin, donorIdx, bin.ceCoreType);
        deriveStarSurface(sim, bin, donorIdx);
        setCircularOrbit(sim, bin, target);
        bin.ceActive = false;
        mt.mode = 'stable';
        logEv(sim, 'warn', trp('COMMON ENVELOPE → close binary · a_f={af} M · core={mc} M⊙',
          { af: target.toFixed(2), mc: bin.ceCore.toFixed(2) }));
      }
      return false;
    }

    // Merger outcome: keep spiralling in (clean circular, role-independent); the
    // contact check coalesces at contact.
    mt.mdot = 0.02;                    // nominal flux so the stream/glow stays lit
    applySeparationScale(bin, Math.max(0.9, Math.exp(-CE_DRAG * dt)));
    setCircularOrbit(sim, bin, bin.d);
    return false;
  }

  // Promote the companion to the central body (copy its full parameter set into
  // sim.params) so the scene always has a primary after the original central body
  // is removed. Used when the central body is destroyed (Type Ia) or consumed.
  function promoteCompanionToCentral(sim, bin) {
    sim.params.Msun = bin.M2sun;
    sim.params.type = bin.type;
    sim.params.Q = bin.Q2 || 0;
    sim.params.a = bin.a2 || 0;
    sim.params.Z = bin.Z2 != null ? bin.Z2 : 0.5;
    sim.params.age = bin.age2 || 0;
    sim.params.B = bin.B2 != null ? bin.B2 : (sim.params.B || 0);
    deriveStarSurface(sim, bin, 1);
    sim.view.scale = phys.VIEW_SCALES[phys.uiCategory(sim.params.type)];
  }

  // The donor has been drained to a token mass — tidally disrupted and absorbed by
  // the accretor (its remaining gas already added to the accretor by the caller).
  // The binary ends with the accretor as the lone body; if the consumed donor was
  // the central primary, the accretor (companion) is promoted to centre. This is
  // role-symmetric: the same physical pair ends the same way whichever was central.
  function consumeDonor(sim, bin, accIdx) {
    if (accIdx === 2) promoteCompanionToCentral(sim, bin);   // primary donor consumed
    bin.enabled = false;
    logEv(sim, 'amber', tr('donor tidally disrupted · absorbed by accretor', '施體被潮汐瓦解 · 併入吸積天體'));
  }

  // Type Ia supernova: a white-dwarf accretor reaches Chandrasekhar and is fully
  // disrupted. The binary ends; the surviving donor becomes the lone body. If the
  // destroyed WD was the central primary, the donor (companion) is promoted to the
  // central body so the scene always has a primary.
  function typeIaSupernova(sim, bin, accIdx, donorIdx) {
    const Mwd = starMsun(sim, bin, accIdx);
    bin.snFlash = 1.8;
    bin.enabled = false;
    bin.merged = false;
    if (accIdx === 1) promoteCompanionToCentral(sim, bin);   // central WD destroyed
    logEv(sim, 'warn', trp('TYPE Ia SUPERNOVA · WD M={m} M⊙ detonates', { m: Mwd.toFixed(2) }));
    logEv(sim, 'amber', tr('white dwarf disrupted · donor unbound', '白矮星瓦解 · 伴星脫離束縛'));
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

  // Keep the derived stellar surfaces (R_star / T_eff) in lock-step with the
  // physical inputs. For ms/giant/wd/ns the photosphere is NOT a free variable —
  // it follows the mass and the stage's drivers (age, metallicity, spin, magnetic
  // field) through KNphysics.deriveStellar. A black hole has no surface. Called
  // every frame (step + render) so the canvas, the collision surfaces and the
  // panel read-outs can never drift apart.
  // Sim-time units per physical day for the Cepheid clock. The pulsation period is
  // physical (P ∝ √(R³/M), reported in days), but real Cepheid periods (days–months)
  // are vastly longer than the demo's orbital timescales, so the visible cadence is
  // compressed by this factor — the √(R³/M) scaling (and hence the P-L relation) is
  // preserved exactly; only the absolute clock is rescaled for the eye.
  const CEP_SIM_PER_DAY = 0.26;

  // Apply κ-mechanism pulsation to an equilibrium giant photosphere and stash the
  // period / phase / strip efficiency for the panel read-out. `tgt` is sim.params
  // (central) or sim.binary (companion, keyed by the `2` suffix). Uses sim.t so the
  // pulse freezes while paused and speeds up with the timescale, in step with orbits.
  function applyCepheid(sim, tgt, base, Msun, ampRaw, companion) {
    const amp = Math.max(0, Math.min(0.2, ampRaw != null ? ampRaw : 0.07));
    const q = phys.instabilityStrip(base.T_eff, base.L);
    const P_days = phys.cepheidPeriodDays(base.R_solar, Msun);
    const P_sim = Math.max(0.5, P_days * CEP_SIM_PER_DAY);
    const phase = (sim.t / P_sim) % 1;                 // 0..1 cycle fraction
    const out = phys.cepheidModulate(base, 2 * Math.PI * phase, amp, q);
    const k = companion
      ? { P: '_cepPeriod2', ph: '_cepPhase2', dr: '_cepDrive2', ac: '_cepActive2' }
      : { P: '_cepPeriod',  ph: '_cepPhase',  dr: '_cepDrive',  ac: '_cepActive'  };
    tgt[k.P] = P_days; tgt[k.ph] = phase; tgt[k.dr] = q; tgt[k.ac] = q > 0;
    return out;
  }

  function syncStellar(sim) {
    const p = sim.params;
    if (p) {
      const cep = p.type === 'giant' && !!p.cepheid;
      const d = phys.deriveStellar(p.type, p.Msun,
        { age: p.age || 0, Z: p.Z != null ? p.Z : 0.5, B: p.B || 0, a: p.a || 0, cepheid: cep });
      // _L (solar luminosity) is stashed for the renderer's brightness/glow.
      if (d) {
        const s = cep ? applyCepheid(sim, p, d, p.Msun, p.cepheidAmp, false) : d;
        p.R_star = s.R_star; p.T_eff = s.T_eff; p._L = s.L;
      } else p._L = null;
      if (!cep) p._cepActive = false;
    }
    const b = sim.binary;
    if (b) {
      const cep2 = b.type === 'giant' && !!b.cepheid;
      const d2 = phys.deriveStellar(b.type, b.M2sun,
        { age: b.age2 || 0, Z: b.Z2 != null ? b.Z2 : 0.5, B: b.B2 || 0, a: b.a2 || 0, cepheid: cep2 });
      if (d2) {
        const s2 = cep2 ? applyCepheid(sim, b, d2, b.M2sun, b.cepheidAmp, true) : d2;
        b.R_star2 = s2.R_star; b.T_eff2 = s2.T_eff; b._L2 = s2.L;
      } else b._L2 = null;
      if (!cep2) b._cepActive2 = false;
    }
  }

  function step(sim, realDt) {
    syncStellar(sim);            // R★/T★ track M + age/Z/B/spin before integrating
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

  // ── Per-scale scene memory ────────────────────────────────
  // Each mass scale is an independent sandbox: it keeps its own central body,
  // companion, spawned objects (count / type / live motion), accretion discs and
  // camera zoom. Leaving a scale snapshots its scene; returning restores it
  // verbatim. structuredClone preserves Infinity/NaN (e.g. a binary's t_merge);
  // the JSON path is a fallback for very old engines.
  function cloneState(v) {
    if (v == null) return v;
    try { return structuredClone(v); }
    catch (e) { return JSON.parse(JSON.stringify(v)); }
  }
  function captureScene(sim) {
    return {
      params: cloneState(sim.params),
      primary: cloneState(sim.primary),
      binary: cloneState(sim.binary),
      bodies: cloneState(sim.bodies),
      disc: cloneState(sim.disc),
      disc2: cloneState(sim.disc2),
      selectedId: sim.selectedId,
      viewScale: sim.view.scale,
      stageStash: cloneState(sim._stageStash),
      smbhStructure: sim.smbhStructure,
      seq: sim.seq,
    };
  }
  function restoreScene(sim, s) {
    sim.params = cloneState(s.params);
    sim.primary = cloneState(s.primary) || sim.primary;
    if (s.binary) sim.binary = cloneState(s.binary);
    sim.bodies = cloneState(s.bodies) || [];
    if (s.disc) sim.disc = cloneState(s.disc);
    if (s.disc2) sim.disc2 = cloneState(s.disc2);
    sim.selectedId = s.selectedId != null ? s.selectedId : null;
    if (s.viewScale) sim.view.scale = s.viewScale;
    sim._stageStash = cloneState(s.stageStash) || { central: {}, companion: {} };
    sim.smbhStructure = s.smbhStructure || 'smbh';
    // Never reuse an id the restored scene already holds (the seq counter is global).
    if (s.seq) sim.seq = Math.max(sim.seq || 1, s.seq);
  }

  // Build a fresh scene at `regime` from the *current* central/companion: keep the
  // stage if real bodies of it exist at the new scale, else drop to the compact
  // (black-hole) stage (there is no supermassive main-sequence star). The mass
  // snaps into the (stage × scale) band, a/Q stay sub-extremal, the surface
  // re-derives, the camera reframes and the companion follows by mass ratio. The
  // spawned objects start empty — each scale collects its own bodies. Geometry
  // stays frozen in units of M; this is a physical *scale* change, not a geometric.
  function buildFreshScene(sim, reg, regime) {
    const cap = 0.998;
    sim.bodies = [];
    sim.selectedId = null;
    sim._stageStash = { central: {}, companion: {} };
    sim.smbhStructure = 'smbh';     // a fresh supermassive scene starts as a bare hole
    // A fresh scene is its own sandbox — start with discs off (a quasar/AGN turns
    // them back on); the previous scale's disc state is kept in its own snapshot.
    if (sim.disc)  { sim.disc.enabled = false;  sim.disc.particles.length = 0; }
    if (sim.disc2) { sim.disc2.enabled = false; sim.disc2.particles.length = 0; }

    let cat = phys.uiCategory(sim.params.type || 'bh');
    if (phys.stageLockedAtRegime(cat, regime)) cat = 'remnant';
    const rng = phys.stageRegimeRange(cat, regime);            // remnant is never null
    const cur = sim.params.Msun || 0;
    const Msun = (cur >= rng.min && cur <= rng.max)
      ? cur : (cat === 'remnant' ? reg.def : rng.def);         // compact → BH default
    sim.params.Msun = Msun;
    sim.params.type = phys.typeForStage(cat, Msun);
    if (Math.abs(sim.params.Q) > cap) sim.params.Q = Math.sign(sim.params.Q || 1) * cap;
    const room = Math.sqrt(Math.max(0, cap * cap - sim.params.Q * sim.params.Q));
    if (Math.abs(sim.params.a) > room) sim.params.a = Math.sign(sim.params.a || 1) * room;
    if (sim.params.type !== 'bh') {
      sim.params.age = sim.params.age || 0;
      if (sim.params.Z == null) sim.params.Z = 0.5;
      const ds = phys.deriveStellar(sim.params.type, Msun,
        { age: sim.params.age, Z: sim.params.Z, a: sim.params.a, B: sim.params.B || 0 });
      if (ds) { sim.params.R_star = ds.R_star; sim.params.T_eff = ds.T_eff; }
      sim.params._stellarTouched = false;
    }
    sim.view.scale = phys.VIEW_SCALES[cat];

    const bin = sim.binary;
    if (bin) {
      const ratio = bin.M2 > 0 ? bin.M2 : 0.8;        // companion geom mass / primary
      bin.M2sun = Math.max(0.05, ratio * Msun);
      bin.M2 = Math.max(0.01, bin.M2sun / Math.max(0.01, Msun));   // == ratio
      let cCat = phys.uiCategory(bin.type || 'bh');
      if (phys.stageLockedAtRegime(cCat, regime)) cCat = 'remnant';
      const nt = (cCat === 'remnant') ? phys.remnantType(bin.M2sun) : bin.type;
      if (nt !== bin.type) {
        bin.type = nt;
        if (nt !== 'bh') {
          const d = phys.STELLAR_DEFAULTS[nt];
          if (d) { bin.R_star2 = d.R; bin.T_eff2 = d.T; }
          bin._stellarTouched = false;
        }
      }
      if (bin.type === 'bh') {
        if (Math.abs(bin.Q2 || 0) > bin.M2 * cap) bin.Q2 = Math.sign(bin.Q2 || 1) * bin.M2 * cap;
        const room2 = Math.sqrt(Math.max(0, (bin.M2 * cap) ** 2 - (bin.Q2 || 0) ** 2));
        if (Math.abs(bin.a2 || 0) > room2) bin.a2 = Math.sign(bin.a2 || 1) * room2;
      }
    }
    const tlabel = sim.params.type === 'bh' ? 'BH'
      : (phys.STELLAR_INFO[sim.params.type] ? phys.STELLAR_INFO[sim.params.type].name : sim.params.type.toUpperCase());
    logEv(sim, 'warn', trp('central → {label} {type} · M = {m} M⊙', {
      label: tr(reg.label_en, reg.label_zh), type: tlabel, m: phys.fmtSolarMass(Msun) }));
  }

  // ── Mass-scale regime switching ───────────────────────────
  // Switch the system to a mass scale (stellar / intermediate / supermassive),
  // stashing the scene we leave and restoring the target scale's saved scene if it
  // has one (so every scale keeps its own independent set of bodies + central +
  // companion + discs). A never-visited scale gets a fresh scene built for it.
  function setBHRegime(sim, regime) {
    const reg = phys.BH_REGIMES[regime];
    if (!reg) return;
    const prev = sim.bhRegime || 'stellar';
    if (regime === prev) return regime;             // already here — keep the live scene

    sim._regimeStash = sim._regimeStash || {};
    sim._regimeStash[prev] = captureScene(sim);     // snapshot the scale we are leaving
    sim.bhRegime = regime;
    // Drop transient interaction state that pointed at the old scene.
    sim.placement = null; sim.aiming = null; sim.moving = null;

    const saved = sim._regimeStash[regime];
    if (saved) {
      restoreScene(sim, saved);
      logEv(sim, 'good', trp('scale → {label} · scene restored', { label: tr(reg.label_en, reg.label_zh) }));
    } else {
      buildFreshScene(sim, reg, regime);
    }
    return regime;
  }

  // Advance the regime by dir (+1 next, -1 previous), wrapping through the order.
  function cycleBHRegime(sim, dir = 1) {
    const order = phys.BH_REGIME_ORDER;
    const i = Math.max(0, order.indexOf(sim.bhRegime || 'stellar'));
    const n = order.length;
    const next = order[((i + dir) % n + n) % n];
    return setBHRegime(sim, next);
  }

  // Seed a nuclear star cluster: a swarm of stars on tight prograde orbits about the
  // central SMBH — the S-star-like population that orbits and is tidally fed to a
  // galactic-nucleus hole. Idempotent: a previous cluster (tagged _seed) is cleared
  // first so re-selecting the structure re-seeds rather than piling up.
  function seedNuclearCluster(sim, n = 10) {
    sim.bodies = sim.bodies.filter((b) => b._seed !== 'cluster');
    const dir = Math.sign(sim.params.a || 1) || 1;
    for (let i = 0; i < n; i++) {
      const r = 12 + Math.random() * 30;
      const th = Math.random() * Math.PI * 2;
      const x = r * Math.cos(th), y = r * Math.sin(th);
      const vc = phys.circularSpeed(r, sim.params.M) || Math.sqrt(sim.params.M / r);
      addBody(sim, {
        name: 'S-' + String(i + 1).padStart(2, '0'),
        kind: 'star', radius: 0.5, binding: 6, charge: 0,
        x, y, vx: -Math.sin(th) * vc * dir, vy: Math.cos(th) * vc * dir,
        _seed: 'cluster',
      });
    }
  }

  // Apply a supermassive-scale structure (see KNphysics.SMBH_STRUCTURES). All keep
  // the body an SMBH; they differ in how the hole interacts with its surroundings —
  // an accreting quasar (disc + jet), a tidally-fed nuclear star cluster, or a
  // quiescent bare hole. role 'companion' targets the binary secondary (its own
  // disc/jet on sim.disc2); a nuclear cluster is a scene-wide population, so the
  // companion's cluster seeds the same swarm around the nucleus.
  function applySMBHStructure(sim, key, role = 'central') {
    if (role === 'companion') {
      const bin = sim.binary;
      if (!bin) return key;
      bin.type = 'bh';
      bin.smbhStructure = key;
      if (key === 'quasar') {
        if (sim.disc2) sim.disc2.enabled = true;
        if (!(bin.B2 > 0.4)) bin.B2 = 0.6;                          // power a BZ jet
        if (Math.abs(bin.a2) < 0.5 * bin.M2) bin.a2 = 0.9 * bin.M2 * (Math.sign(bin.a2) || 1);
        logEv(sim, 'warn', tr('Companion quasar (AGN) — accretion disc + jet active',
                              '伴星類星體(活躍星系核)— 吸積盤 + 噴流啟動'));
      } else if (key === 'cluster') {
        if (sim.disc2) sim.disc2.enabled = false;
        seedNuclearCluster(sim);
        logEv(sim, 'good', tr('Nuclear star cluster seeded around the nucleus',
                              '已在星系核周圍佈署核星團'));
      } else {
        if (sim.disc2) sim.disc2.enabled = false;
        logEv(sim, 'good', tr('Quiescent supermassive companion', '寧靜的超大質量伴星'));
      }
      return key;
    }
    sim.params.type = 'bh';
    sim.smbhStructure = key;
    if (key === 'quasar') {
      if (sim.disc) sim.disc.enabled = true;
      if (!(sim.params.B > 0.4)) sim.params.B = 0.6;                 // power a BZ jet
      if (Math.abs(sim.params.a) < 0.5) sim.params.a = 0.9 * (Math.sign(sim.params.a) || 1);
      logEv(sim, 'warn', tr('Quasar (AGN) — accretion disc + jet active',
                            '類星體(活躍星系核)— 吸積盤 + 噴流啟動'));
    } else if (key === 'cluster') {
      seedNuclearCluster(sim);
      logEv(sim, 'good', tr('Nuclear star cluster seeded around the SMBH',
                            '已在超大質量黑洞周圍佈署核星團'));
    } else {
      if (sim.disc) sim.disc.enabled = false;
      logEv(sim, 'good', tr('Quiescent supermassive black hole', '寧靜的超大質量黑洞'));
    }
    return key;
  }

  // ── Swap central ⇄ companion ──────────────────────────────
  // Exchange the two stars' identities AND their motion so the system is the same
  // physical binary with the labels swapped. Each body keeps its intrinsic physical
  // mass and DIMENSIONLESS spin/charge (a/M, Q/M) — only the geometric normalization
  // (primary frozen at M = 1) is re-applied — so swapping is a clean involution:
  // doing it twice restores the original state exactly. Positions, velocities and
  // trails are exchanged in place, so the conserved barycentre and its velocity are
  // preserved and the orbit continues without a jump; the accretion discs follow
  // their bodies. (For unequal masses the geometric Mt — hence the orbital rate in
  // units of the new primary's M — changes, which is inherent to the mass-decoupled
  // unit convention, not a discontinuity in the state.)
  function swapCentralCompanion(sim) {
    const bin = sim.binary;
    if (!bin || !bin.enabled) {
      logEv(sim, 'warn', tr('place a companion first to swap roles', '請先放置伴星才能互換角色'));
      return false;
    }
    const p = sim.params;
    // Each body's intrinsic dimensionless spin/charge (a/M, Q/M), preserved on swap.
    const chi1 = p.a / p.M, q1 = p.Q / p.M;
    const chi2 = bin.M2 > 0 ? bin.a2 / bin.M2 : 0;
    const qq2  = bin.M2 > 0 ? bin.Q2 / bin.M2 : 0;
    const MtOld = p.M + bin.M2;                  // geometric total before the swap

    // Exchange physical mass + evolutionary stage + surface/driver fields.
    const t = {
      Msun: p.Msun, type: p.type, R_star: p.R_star, T_eff: p.T_eff,
      age: p.age, Z: p.Z, cepheid: p.cepheid, cepheidAmp: p.cepheidAmp,
      B: p.B, _stellarTouched: p._stellarTouched,
    };
    p.Msun = bin.M2sun; p.type = bin.type; p.R_star = bin.R_star2; p.T_eff = bin.T_eff2;
    p.age = bin.age2; p.Z = bin.Z2; p.cepheid = bin.cepheid; p.cepheidAmp = bin.cepheidAmp;
    p.B = bin.B2; p._stellarTouched = bin._stellarTouched;
    bin.M2sun = t.Msun; bin.type = t.type; bin.R_star2 = t.R_star; bin.T_eff2 = t.T_eff;
    bin.age2 = t.age; bin.Z2 = t.Z; bin.cepheid = t.cepheid; bin.cepheidAmp = t.cepheidAmp;
    bin.B2 = t.B; bin._stellarTouched = t._stellarTouched;

    // Primary stays geometric M = 1; companion geometric mass is the new ratio.
    bin.M2 = Math.max(0.001, p.Msun > 0 ? bin.M2sun / p.Msun : 1);
    // Re-apply each body's intrinsic spin/charge in the new normalization.
    p.a = chi2 * p.M; p.Q = qq2 * p.M;          // new central ← old companion's a/M, Q/M
    bin.a2 = chi1 * bin.M2; bin.Q2 = q1 * bin.M2; // new companion ← old central's a/M, Q/M
    // Sub-extremal safety for the central (companion stays sub-extremal by construction).
    const cap = 0.998, ext = Math.hypot(p.Q, p.a);
    if (ext > cap * p.M) { const s = cap * p.M / ext; p.Q *= s; p.a *= s; }

    // Exchange the live motion state (positions / velocities / trails) in place.
    const sw = (o, k1, k2) => { const v = o[k1]; o[k1] = o[k2]; o[k2] = v; };
    sw(bin, 'x1', 'x2'); sw(bin, 'y1', 'y2'); sw(bin, 'vx1', 'vx2'); sw(bin, 'vy1', 'vy2');
    const tr1 = bin.trail1; bin.trail1 = bin.trail2; bin.trail2 = tr1;

    // The geometric total mass is in units of the (now different) primary mass, so it
    // changes with the swap. Rescale ONLY the relative velocity by √(Mt'/Mt) so the
    // orbit keeps its shape (a circular orbit stays circular at the same separation,
    // an ellipse keeps its eccentricity) — the barycentre velocity is left untouched,
    // so momentum is conserved. √ on both legs makes the swap a clean involution.
    const Mt = p.M + bin.M2;
    const f1 = bin.M2 / Mt, f2 = p.M / Mt;
    const vcx = (p.M * bin.vx1 + bin.M2 * bin.vx2) / Mt;   // conserved barycentre velocity
    const vcy = (p.M * bin.vy1 + bin.M2 * bin.vy2) / Mt;
    const s = Math.sqrt(Mt / Math.max(1e-9, MtOld));
    const Vx = (bin.vx2 - bin.vx1) * s, Vy = (bin.vy2 - bin.vy1) * s;
    bin.vx1 = vcx - f1 * Vx; bin.vy1 = vcy - f1 * Vy;
    bin.vx2 = vcx + f2 * Vx; bin.vy2 = vcy + f2 * Vy;

    sim.primary.x = bin.x1; sim.primary.y = bin.y1; sim.primary.vx = bin.vx1; sim.primary.vy = bin.vy1;
    // Conserved barycentre (analytically unchanged; recompute from the new state).
    bin.cx = (p.M * bin.x1 + bin.M2 * bin.x2) / Mt;
    bin.cy = (p.M * bin.y1 + bin.M2 * bin.y2) / Mt;
    bin.d = Math.hypot(bin.x2 - bin.x1, bin.y2 - bin.y1);
    bin.theta = Math.atan2(bin.y2 - bin.y1, bin.x2 - bin.x1);

    // Each accretion disc follows its body, so a quasar that becomes the companion
    // keeps its disc/jet (sim.disc is the primary's, sim.disc2 the companion's).
    if (sim.disc && sim.disc2) { const d = sim.disc; sim.disc = sim.disc2; sim.disc2 = d; }
    sim.smbhStructure = (sim.disc && sim.disc.enabled) ? 'quasar' : 'smbh';

    // The donor/accretor indices are now inverted — re-evaluate transfer cleanly.
    resetMassTransfer(bin);
    if (sim.selectedId != null) sim.selectedId = null;

    logEv(sim, 'good', tr('central ⇄ companion roles swapped', '主天體 ⇄ 伴星 角色已互換'));
    return true;
  }

  // Frame the central body (and the companion, if placed) so the whole system
  // fits the viewport. A stellar photosphere draws at R_star·scale and carries a
  // ~2× corona, so a swollen giant needs the camera pulled back well past its
  // per-stage default; this picks the largest scale that still keeps both
  // surfaces on screen, but never zooms IN past the default. Centres on the
  // single body, or on a binary's midpoint.
  function fitView(sim) {
    const p = sim.params, bin = sim.binary;
    const fitScale = phys.VIEW_SCALES[phys.uiCategory(p.type || 'bh')];
    // Visible half-extent of a body about its own centre (world units of M).
    const surf = (type, M, Q, a, R) => {
      if ((type || 'bh') === 'bh') {
        const h = phys.horizons(M, Q || 0, a || 0);
        return (isFinite(h.rplus) && !h.naked) ? h.rplus : 2 * M;
      }
      return (R || 3) * 1.4;            // photosphere + a margin for the corona
    };
    const binOn = bin && bin.enabled && isFinite(bin.x2) && isFinite(bin.y2);
    let cx = 0, cy = 0;
    if (binOn) { cx = (bin.x1 + bin.x2) / 2; cy = (bin.y1 + bin.y2) / 2; }
    const x1 = binOn ? bin.x1 : 0, y1 = binOn ? bin.y1 : 0;
    let half = Math.hypot(x1 - cx, y1 - cy) + surf(p.type, p.M, p.Q, p.a, p.R_star);
    if (binOn) {
      half = Math.max(half, Math.hypot(bin.x2 - cx, bin.y2 - cy)
        + surf(bin.type, bin.M2, bin.Q2, bin.a2, bin.R_star2));
    }
    half = Math.max(half, 1);
    let s = fitScale;
    if (sim._vw && sim._vh) s = Math.min(fitScale, (Math.min(sim._vw, sim._vh) / 2) * 0.85 / half);
    sim.view.scale = Math.max(phys.VIEW_SCALE_MIN, Math.min(phys.VIEW_SCALE_MAX, s));
    sim.view.ox = -cx; sim.view.oy = -cy;
    return sim.view.scale;
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
                   step, syncStellar, frameAnchor, applyFrameLock, circularizeBody, circularizeBinary, setBinaryVelocity,
                   setBHRegime, cycleBHRegime, applySMBHStructure, swapCentralCompanion,
                   fitView, worldToScreen, worldToScreenInto, screenToWorld,
                   predictTrajectory, predictBinaryTrajectory, predictGeodesicTrajectory };
})();
