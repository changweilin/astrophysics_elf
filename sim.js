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
      // Supermassive-scale structure: 'galaxy' | 'cluster' | 'smbh'
      // (only meaningful at the supermassive scale; see KNphysics.SMBH_STRUCTURES).
      // A galaxy's active nucleus (AGN/quasar) is tracked by its disc being enabled.
      smbhStructure: 'smbh',
      // Dark-matter halo descriptors {M,R} for a central / companion galaxy structure
      // (null = no halo). Consumed by the integrator's smooth field. See seedStructureCloud.
      _halo1: null,
      _halo2: null,
      // Per-structure metadata {Nbase, massBase, haloBase, reach} for the M<->N coupling
      // and membership reach (null = no structure for that role). See seedStructureCloud.
      _struct1: null,
      _struct2: null,
      // Live in-range star counts for the central / companion structure cloud (N1 / N2),
      // refreshed each step + on seeding. Shrinks as a galaxy/cluster loses stars.
      _cloudN1: 0,
      _cloudN2: 0,
      // Live bound-mass of each structure = Σ of its current members' fixed mass quanta
      // (b._m). This is the structure's gravitating "core mass" the user model demands:
      // it tracks the member stars exactly, so a star re-tagged from one structure to the
      // other moves its mass with it (mass-energy conserved — one side +, the other −).
      // Drives the binding halo's mass each step (updateStructureMass). See recordCloudCounts.
      _cloudM1: 0,
      _cloudM2: 0,
      // Derived per-structure scale, refreshed each step from the live member count
      // (frac = N / Nbase). Consumed by render.js for swarm/halo brightness and by the
      // panels. _Rvis = visible structure radius (R ~ N^(1/3)); _density = member
      // surface density N / (pi R^2). See updateStructureMass.
      _cloudFrac1: 1, _cloudFrac2: 1,
      _Rvis1: 0, _Rvis2: 0,
      _density1: 0, _density2: 0,
      // Live mass-weighted centre of each structure (its core point mass + member stars).
      // The binding halo is centred HERE, not on the bare core, so that when the companion
      // tugs a structure's swarm off-centre the binding field follows the stars (they keep
      // orbiting their own centroid) instead of a stale core position. See recordCloudCounts.
      _com1: { x: 0, y: 0 }, _com2: null,
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
    bin._coreMerge = false;   // fresh pair — never inherit a stale common-field phase
    bin.trail1.length = 0;
    bin.trail2.length = 0;
    sim.transient = null;
    resetMassTransfer(bin);
    // If this companion is a galaxy/cluster/open cluster, (re)seed its star cloud around
    // the freshly placed position — N2 stars, scaled by its mass. The structure may have
    // been chosen BEFORE placement (when the binary wasn't enabled yet, so the earlier
    // seed bailed), so seeding here guarantees the swarm appears wherever the companion lands.
    resetConservationBaseline(sim);   // a fresh placement is a new initial condition
    if (isCloudStruct(bin.smbhStructure)) {
      seedStructureCloud(sim, bin.smbhStructure, 'companion');
      recordCloudCounts(sim);
      updateStructureMass(sim);   // populate Rvis/density/frac so the glow shows pre-step
    }
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
    bin._coreMerge = false;
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

    // ── Structure back-reaction on the cores (momentum conservation) ──
    // The swarm feels the cores + binding halos, so by Newton's third law the cores must
    // feel the swarm. The integrator accumulates the EXACT per-member reaction forces
    // (sim._react1/_react2: −Σ m·a for each member's core + halo terms, the halo's
    // reaction anchored to its host core) — so the books balance star-for-star rather
    // than approximately via the halo field sampled at the cores. We apply the net force
    // to the pair's BARYCENTRE only: it translates the binary's centre of mass toward a
    // tugged swarm, so the (cores + cloud) momentum is conserved instead of the
    // barycentre staying artificially pinned. The RELATIVE (inspiral) coordinate is
    // left to the dynamical-friction model below, which already represents the extended
    // mass's drag — adding the conservative pull there too would double-drive the merger.
    // Gated to scenes that actually carry a halo (normal stellar binaries are untouched).
    let vcx = 0, vcy = 0, AcomX = 0, AcomY = 0;
    const haloBR = !!(sim._halo1 || sim._halo2);
    if (haloBR) {
      const rf1 = sim._react1, rf2 = sim._react2;
      const Fx = (rf1 ? rf1.fx : 0) + (rf2 ? rf2.fx : 0);
      const Fy = (rf1 ? rf1.fy : 0) + (rf2 ? rf2.fy : 0);
      AcomX = Fx / Mt; AcomY = Fy / Mt;
      // Re-derive the live barycentre position + velocity from the absolute core state so
      // the COM motion accumulates (the pinned-COM split-back below would otherwise reset it).
      bin.cx = (M1 * bin.x1 + M2 * bin.x2) / Mt; bin.cy = (M1 * bin.y1 + M2 * bin.y2) / Mt;
      vcx = (M1 * bin.vx1 + M2 * bin.vx2) / Mt;   vcy = (M1 * bin.vy1 + M2 * bin.vy2) / Mt;
    }

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
    // Extended galactic structures (galaxy / cluster) merge by DYNAMICAL FRICTION,
    // not by point-mass GW radiation — so the GW reaction is skipped for them and
    // replaced by the Chandrasekhar drag block below. (At the stellar scale, where
    // smbhStructure is just 'smbh', dfMerger is false and GW behaves exactly as before.)
    const dfMerger = isCloudStruct(sim.smbhStructure) || isCloudStruct(bin.smbhStructure);

    const mtActive = !!(bin.mt && bin.mt.active);
    if (!bin.classical && !mtActive && !dfMerger) {
      const rNow = Math.hypot(Dx, Dy);
      let scale = 1 + (pet.ddot * bin.inspiralRate * dt) / Math.max(0.05, rNow);
      if (scale < 0.5) scale = 0.5;   // per-step clamp — never plunge in one step
      if (scale < 1) {
        Dx *= scale; Dy *= scale;
        const vboost = 1 / Math.sqrt(scale);   // v_circ ∝ 1/√r → chirp
        Vx *= vboost; Vy *= vboost;
      }
    }

    // ── Dynamical-friction inspiral (galaxy / cluster mergers) ──
    // A galaxy or cluster is an extended system; it spirals in because its core plows
    // through the other system's dark-matter halo + star sea, raising a gravitational
    // wake that drags it (Chandrasekhar). Like the GW reaction above this is applied
    // ADIABATICALLY — the per-step Chandrasekhar deceleration sets a fractional orbital
    // decay rate, the separation contracts at that rate, and the pair is kept quasi-
    // circular (v_circ ∝ 1/√r). Applying the drag directly to the velocity instead
    // would overdamp the orbit into a slow terminal-velocity creep, not an inspiral.
    // The real timescale is 1e8-1e10 yr, so it is accelerated by a per-structure boost
    // (DF_RATE) chosen to show the dynamics clearly — cluster pairs (smaller, shorter
    // relaxation) sink a touch faster than galaxy pairs.
    if (dfMerger && !bin.classical && !mtActive) {
      const rNow = Math.max(1e-3, Math.hypot(Dx, Dy));
      const sigma = Math.max(0.05, phys.circularSpeed(rNow, Mt) || Math.sqrt(Mt / rNow));
      // Background density at the separation: uniform dark-matter halos (if any) plus
      // a core stellar term (mass enclosed within rNow, rough).
      let rho = 0;
      const h1 = sim._halo1, h2 = sim._halo2;
      const sphere = (R) => (4 / 3) * Math.PI * R * R * R;
      if (h1 && rNow < h1.R) rho += h1.M / sphere(h1.R);
      if (h2 && rNow < h2.R) rho += h2.M / sphere(h2.R);
      rho += 0.12 * Mt / sphere(Math.max(2, rNow));
      const Mdf = Math.max(M1, M2);                       // dominant perturber
      const bothCluster = isStarSwarm(sim.smbhStructure) && isStarSwarm(bin.smbhStructure);
      // Per-structure time boost, calibrated so the pair spirals through several
      // orbits (preserving the orbital angular momentum visually, like the stellar GW
      // inspiral) rather than plunging radially. Cluster pairs sink a touch faster.
      // bin.dfRate (default unset) is a user-tunable override, analogous to inspiralRate.
      const DF_RATE = (bin.dfRate != null ? bin.dfRate : (bothCluster ? 0.65 : 0.5));
      const aDF = phys.dynamicalFriction(Vx, Vy, Mdf, rho, sigma, 4);
      const vrelNow = Math.max(1e-4, Math.hypot(Vx, Vy));
      // Fractional decay rate = |a_DF| / v  (the drag-timescale inverse).
      let decay = (Math.hypot(aDF.ax, aDF.ay) / vrelNow) * DF_RATE * dt;

      // ── Common-field acceleration of the friction inspiral ──
      // Chandrasekhar friction alone weakens once the cores orbit INSIDE a shared
      // stellar envelope: the wake integral saturates and the pair can circle for
      // a long time. Physically the late stage is dominated by the common
      // background — when the structures' spheres of influence overlap AND most
      // member stars are pulled toward both cores in nearly the same direction
      // (sim._coreAlign, tallied per frame in recordCloudCounts), the swarm sees
      // ONE well, not two. Model this by smoothly AMPLIFYING the same DF decay
      // (up to ×(1+CORE_MERGE_BOOST)) — the inspiral keeps its quasi-circular
      // Chandrasekhar character, just on a faster clock. Both ramps are
      // smoothstepped (C¹), so the drive varies continuously and differentiably
      // with the orbital state — no engagement threshold ever snaps the orbit.
      const reach1 = (sim._struct1 && sim._struct1.rOut) || (h1 && h1.R) || 30;
      const reach2 = (sim._struct2 && sim._struct2.rOut) || (h2 && h2.R) || 30;
      const sstep = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
      const reach = reach1 + reach2;
      const overlap = sstep((reach - rNow) / (0.25 * reach));   // fades in past first contact
      const common = sstep(((sim._coreAlign || 0) - CORE_ALIGN_LO) / (CORE_ALIGN_HI - CORE_ALIGN_LO));
      const boost = common * overlap;                            // 0 → 1, C¹ everywhere
      decay *= 1 + CORE_MERGE_BOOST * boost;
      // One-time event-log marker (display only — the dynamics never switch).
      if (!bin._coreMerge && boost > 0.5) {
        bin._coreMerge = true;
        logEv(sim, 'amber', tr('core influence spheres overlap — fields merging progressively',
                               '雙核心勢力範圍重疊 — 引力場漸進融合中'));
      } else if (bin._coreMerge && boost < 0.2) {
        bin._coreMerge = false;
      }
      let scale = 1 - decay;
      if (scale < 0.5) scale = 0.5;                       // per-step clamp — no plunge
      Dx *= scale; Dy *= scale;
      Vx *= 1 / Math.sqrt(scale); Vy *= 1 / Math.sqrt(scale);   // stay quasi-circular
    }

    // Advance the barycentre under the swarm back-reaction (no-op when haloBR is false, so
    // an ordinary binary keeps its pinned, momentum-conserving COM exactly as before).
    if (haloBR) {
      vcx += AcomX * dt; vcy += AcomY * dt;
      bin.cx += vcx * dt; bin.cy += vcy * dt;
    }

    // Split back onto the two stars about the barycentre (now translating if the swarm
    // pulls on the pair). The COM velocity vcx/vcy rides on top of the relative split.
    const f1 = M2 / Mt, f2 = M1 / Mt;
    bin.x1 = bin.cx - f1 * Dx; bin.y1 = bin.cy - f1 * Dy;
    bin.x2 = bin.cx + f2 * Dx; bin.y2 = bin.cy + f2 * Dy;
    bin.vx1 = vcx - f1 * Vx; bin.vy1 = vcy - f1 * Vy;
    bin.vx2 = vcx + f2 * Vx; bin.vy2 = vcy + f2 * Vy;

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
      // Structure scenes: shift into the surviving primary core's rest frame before the
      // binary turns off, so its swarm does not snap away from the re-centred primary
      // (same jump-prevention as the coalescence / member-depletion merge paths).
      if (sim.bodies.some((b) => b._cloud && b.state === 'orbit')) {
        recenterSceneToCore(sim, bin.x1, bin.y1, bin.vx1 || 0, bin.vy1 || 0);
      }
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

    // Structure (galaxy/cluster) mergers are quiet, extended events: the visible
    // outcome is the survivor GROWING as it absorbs the companion's stars
    // (structureScale's R ∝ M^(1/3)), not a point-like burst — so they get no
    // merger flash and no EM transient overlay (user preference: muted, no glare).
    const structMerge = isCloudStruct(sim.smbhStructure) || isCloudStruct(bin.smbhStructure);

    // Arm the multi-phase EM/GW transient for this coalescence (tidal-tail
    // ejecta, short-GRB jet, kilonova, r-process cloud, or a luminous red nova).
    // A clean black-hole pair / clean NS-BH plunge has no rich transient — the
    // existing merger flash + ringdown stand in. Computed from the progenitor
    // types unless a channel was already classified by the caller.
    const ch = channel || phys.compactMergerChannel(
      cType, starMsun(sim, bin, 1), sType, starMsun(sim, bin, 2));
    if (!structMerge) armTransient(sim, bin, ch);

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
    bin.mergerFlash = structMerge ? 0 : 1.6;
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

    // ── Structure scenes: keep the swarm centred on the remnant ──
    // A core-contact coalescence can end a galaxy/cluster merger while member stars are
    // still orbiting. Once the binary turns off the integrator re-centres the lone
    // primary at the ORIGIN — but the swarm keeps its absolute positions around the old
    // merger point, so its orbital centre would visibly snap away from the drawn remnant.
    // Shift the whole scene into the remnant's rest frame FIRST (Galilean translation +
    // boost — exact physics; every star's position/motion relative to the remnant is
    // unchanged), and fold the absorbed companion structure's bookkeeping into the
    // survivor, exactly as the member-depletion path (structureMergeComplete) does.
    if (sim.bodies.some((b) => b._cloud && b.state === 'orbit')) {
      const Mt = M1 + M2;
      const ccx = (M1 * bin.x1 + M2 * bin.x2) / Mt, ccy = (M1 * bin.y1 + M2 * bin.y2) / Mt;
      const cvx = (M1 * (bin.vx1 || 0) + M2 * (bin.vx2 || 0)) / Mt;
      const cvy = (M1 * (bin.vy1 || 0) + M2 * (bin.vy2 || 0)) / Mt;
      // ── Post-coalescence field morph (C¹ handover) ──
      // Capture the swarm-felt source configuration AT contact, in remnant-relative
      // coordinates (the remnant is recentred to the origin below): the central
      // source M1+coreBoost at its offset from the barycentre, the companion M2 at
      // its own. integrate() keeps feeding the swarm these TWO softened points for
      // CORE_MORPH_T, shrinking the offsets with a smoothstep (zero end slopes) while
      // rotating them at the signed contact angular rate — so the dominant tangential
      // source motion is also continuous — and bleeding the radiated E_GW out of the
      // companion's share along the same ramp. At the window's end both points sit at
      // the origin and their masses sum to exactly Mc1 = M + coreBoost, so the switch
      // back to the single-point field is identically zero — the member field is C¹
      // through the whole merger, not just mass-conserving.
      const preBoost = (sim._struct1 && sim._struct1.coreBoost) || 0;
      const relx = bin.x2 - bin.x1, rely = bin.y2 - bin.y1;
      const relvx = (bin.vx2 || 0) - (bin.vx1 || 0), relvy = (bin.vy2 || 0) - (bin.vy1 || 0);
      sim._coreMorph = {
        t: 0, T: CORE_MORPH_T,
        om: (relx * relvy - rely * relvx) / Math.max(1e-6, relx * relx + rely * rely),
        ax0: bin.x1 - ccx, ay0: bin.y1 - ccy,
        bx0: bin.x2 - ccx, by0: bin.y2 - ccy,
        mA: M1 + preBoost, mB: M2, eGW: eMergerGW,
      };
      const product = mergedStructureType(sim.smbhStructure, bin.smbhStructure);
      // Two galaxies merging is the elliptical-forming channel (checked on the
      // PROGENITOR keys, before the survivor is re-typed below).
      const galaxyPair = sim.smbhStructure === 'galaxy' && bin.smbhStructure === 'galaxy';
      if (!sim._struct1 && sim._struct2) {
        // Bare-hole central swallowed a structure companion: the survivor inherits the
        // companion's structure record + swarm wholesale (re-homed to the central role).
        sim._struct1 = sim._struct2; sim._halo1 = sim._halo2;
        for (const b of sim.bodies) {
          if (b._cloud && (b._cloudRole === 'companion' || b._cloudOrigin === 'companion')) {
            b._cloudRole = 'central'; b._cloudOrigin = 'central';
          }
        }
      } else if (sim._struct1 && sim._struct2) {
        sim._struct1.accreted = (sim._struct1.accreted || 0) + (sim._struct2.accreted || 0);
        sim._struct1.accretedN = (sim._struct1.accretedN || 0) + (sim._struct2.accretedN || 0);
      }
      sim._halo2 = null; sim._struct2 = null; sim._cloudN2 = 0; sim._cloudM2 = 0;
      // ── Gravitational-field continuity (no instant "weightlessness") ──
      // The remnant's true geometric mass is MfGeo = M1+M2−E_GW, but the demo's frozen
      // unit resets params.M to 1, which would VANISH the companion core's gravity from
      // the swarm's field in one frame — the stars would suddenly find themselves
      // half-unbound and puff apart, a potential discontinuity that never happens in
      // nature (a structure's core is bound mass, not a removable point). Bank the
      // excess (MfGeo − 1) on the surviving structure as coreBoost: the member field,
      // membership pull and conservation ledger all add it to the central core, so two
      // touching softened points smoothly become ONE softened point of the same total
      // mass at their barycentre. Only the genuinely radiated E_GW leaves the books.
      // (User-placed bodies keep the unit-M convention exactly as before.)
      if (sim._struct1) sim._struct1.coreBoost = (sim._struct1.coreBoost || 0) + Math.max(0, MfGeo - 1);
      if (product !== sim.smbhStructure) applyMergedCentralType(sim, product);
      recenterSceneToCore(sim, ccx, ccy, cvx, cvy);
      if (galaxyPair) beginEllipticalRelaxation(sim);
    }

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
    // The promoted body keeps its own user preferences (disc toggle memory,
    // user-touched B/a flags, gas fraction) in the central slot.
    sim.params.discPref = bin.discPref2 != null ? bin.discPref2 : sim.params.discPref;
    if (bin._B2User) sim.params._BUser = true;
    if (bin._a2User) sim.params._aUser = true;
    if (bin.gasFrac2 != null) sim.params.gasFrac = bin.gasFrac2;
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

  // ── Member-star capture: only a real (and tiny) central BH swallows ──
  // Galaxies and clusters are COLLISIONLESS: their stars are so sparsely spaced that in a
  // merger the overwhelming majority simply graze straight through the cores on their
  // gravitational trajectories. Crucially, the demo's "core" is a binding point mass, NOT
  // necessarily a black hole:
  //   · cluster / open cluster — the core is purely a simulated binding mass. There is no
  //     central black hole, so it NEVER swallows or tidally shreds a member. Stars pass
  //     clean through (they are merely deflected by its gravity).
  //   · galaxy — has a real central SMBH, but in nature it is minuscule next to the galaxy
  //     (horizon ~ AU vs a stellar swarm ~ kpc). So only a galaxy swallows, and only the
  //     vanishingly few stars whose orbit threads the tiny loss cone of the true horizon.
  // The old code spaghettified EVERY member that crossed the ~2.6 M single-star tidal radius,
  // so a cluster sinking toward a hole was shredded almost whole — physically wrong on both
  // counts. We now drop the tidal channel for members entirely and capture only at a real
  // BH core, at its true (tiny) horizon, gated by the loss cone. Non-cloud (user-placed)
  // bodies are exempt: their tidal/capture fate stays deterministic (the single-body demo).
  function coreCanSwallow(key) { return !isStarSwarm(key); }   // a star swarm has no BH

  // Cloud-member swallow radius, DECOUPLED from the core's geometric mass. A real
  // SMBH horizon is ~9 orders of magnitude smaller than its galaxy, but the demo's
  // geometric horizon (r+ ≈ 2·Mcore, and Mcore = the structures' mass RATIO for a
  // companion) is only ~10× smaller than the swarm — capturing at r+ would let a
  // core sweep up members wholesale as it ploughs through (worse for a heavy
  // companion, whose r+ ≈ 2·M2 can exceed its own swarm's inner radius). Members
  // are swallowed only inside this small fixed radius, with the loss cone evaluated
  // at the same radius, restoring the intended "vanishingly few" capture rate.
  const CLOUD_SWALLOW_R = 0.4;
  // Even inside the swallow radius the DEMO's capture region is still ~9 orders of
  // magnitude larger than the real horizon, so almost every loss-cone plunge in
  // nature MISSES the hole. Each qualifying passage rolls ONCE against this
  // probability (the graze tag makes a failed roll immune until the star leaves
  // the zone, so it is per-pericentre-passage, not per-substep) — keeping member
  // swallows the intended rare TDE events, not a wholesale feeding channel.
  const CLOUD_SWALLOW_P = 0.08;
  const GRAZE_CLEAR_R   = 1.2;   // leaving this radius re-arms the swallow roll

  // ── Common-field friction boost (progressive core coalescence) ──
  // A member star counts as "commonly pulled" when its star→core1 / star→core2
  // directions agree within ~20° (cos ≥ 0.94). As that fraction rises across
  // [CORE_ALIGN_LO, CORE_ALIGN_HI] the swarm increasingly sees ONE potential
  // well, and the Chandrasekhar inspiral is smoothly ACCELERATED — the same DF
  // decay law, multiplied by up to (1 + CORE_MERGE_BOOST) — rather than driven
  // by a separate contraction channel. Both the alignment ramp and the
  // sphere-of-influence overlap gate are smoothstepped, so the drive is a C¹
  // function of the orbital state: no thresholds snap, no hysteresis kinks.
  const CORE_ALIGN_COS  = 0.94;
  const CORE_ALIGN_LO   = 0.35;
  const CORE_ALIGN_HI   = 0.85;
  const CORE_MERGE_BOOST = 5;
  // Post-coalescence field-morph window (sim-time units): the two softened core
  // sources persist after contact and are blended into the single remnant point
  // over this window (smoothstep shrink + contact-rate rotation), so the swarm's
  // field stays C¹ through the merger instead of reconfiguring in one frame.
  const CORE_MORPH_T = 2.0;

  // ── Starburst (perturbation-triggered star formation) ──
  // A galaxy's gas members ARE its molecular clouds. When the companion's tidal
  // field at a cloud rivals its host's hold — q = (M_opp/d_opp³)/(M_own/d_own³),
  // the dimensionless perturbation ratio — clouds collide and compress, and a
  // cloud collapses into SB_SPLIT newborn stars. The collapse conserves the
  // books EXACTLY: the cloud's mass quantum is split evenly over its stars, the
  // newborns' positions/velocity kicks are symmetric (zero net displacement and
  // momentum), so ΣM and Σp are unchanged star-for-star. The birth RATE per
  // cloud scales with the perturbation (·q), so the population-wide formation
  // rate and the total stars formed both scale with the available molecular-
  // cloud mass — richer gas reservoirs burst harder, as the user model demands.
  const SB_SPLIT  = 3;      // stars born per collapsing cloud (even mass split)
  const SB_RATE   = 0.06;   // collapse probability /cloud /sim-time at q = 1
  const SB_QMIN   = 0.05;   // perturbation floor — quiescent discs do not burst
  const SB_KICK   = 0.02;   // newborn velocity dispersion (symmetric, Σ = 0)
  const SB_GLOW_T = 4;      // render-side newborn glow fade (sim-time units)

  // ── AGN ignition (merger-driven gas inflow) ──
  // A binary interaction torques a galaxy's molecular clouds inward; a cloud
  // spending time inside AGN_FUEL_R of its OWN core is fuel arriving at the
  // nucleus. Exposure integrates as Σ clouds·dt (struct.gasInflow); once it
  // crosses AGN_IGNITE a quiescent nucleus lights up (the disc turning on IS
  // the demo's active-nucleus state) with one event line. One ignition per
  // structure lifetime (struct.agnIgnited) and the remembered user preference
  // (discPref) is never rewritten — a later manual toggle always wins.
  const AGN_FUEL_R = 6.5;
  const AGN_IGNITE = 1.0;

  // ── Violent relaxation → elliptical end state (galaxy×galaxy mergers) ──
  // When two GALAXIES finish merging, the remnant's stars do not keep their
  // ordered disc rotation: the rapidly varying merger potential scatters orbit
  // orientations (Lynden-Bell's violent relaxation) and the remnant settles
  // into a dispersion-supported spheroid — an elliptical galaxy. Modeled
  // SPEED-PRESERVING (each star's kinetic energy is untouched, the ledger's ΣM
  // exactly so): every bound member gets a fixed random rotation rate for its
  // velocity DIRECTION, enveloped by sin²(π·t/T) so the drive ramps in and out
  // with zero end slope (C¹ — no kick at either edge of the window). Half the
  // stars end up counter-rotating or on near-radial orbits, so the net disc
  // rotation dies and the swarm relaxes into a rounder, hotter spheroid.
  const RELAX_T = 10;       // relaxation window (sim-time units)
  const RELAX_W = 0.35;     // max |velocity-direction rotation rate| (rad / t)

  // ── TDE flares + hypervelocity stars (Phase 3 polish) ──
  // A member STAR that threads a real BH core's loss cone is tidally shredded on
  // the way in — a tidal disruption event. The swallow bookkeeping is unchanged
  // (accreteMember conserves the mass); the flare is a short, muted render-side
  // glow anchored on the swallowing core (sim._tdeFlares). Gas accretes quietly.
  const TDE_T = 2.5;        // flare fade (sim-time units)
  // A member slung out of every structure's reach FASTER than the local escape
  // speed of everything still binding it has been dynamically ejected for good —
  // the demo's Hills-mechanism product. Tagged `_hvs` (detection only: the
  // three-body slingshot that launched it already happened in the integrator,
  // so nothing is kicked and the ledger is untouched).
  const HVS_FAC = 1.15;     // ejection threshold over the local escape speed

  // Member-star swallows are rare loss-cone events; log them (rate-limited to one
  // line per sim-second) so a star leaving the population is visible evidence in
  // the event feed, never a silent disappearance.
  function logMemberSwallow(sim, en, zh) {
    if (sim.t - (sim._swallowLogT != null ? sim._swallowLogT : -9) < 1) return;
    sim._swallowLogT = sim.t;
    logEv(sim, 'warn', tr(en, zh));
  }

  // Mass-energy conservation when a galaxy's central BH swallows a member: the star's mass
  // quantum leaves the member sum but is banked on the swallowing structure's core
  // (struct.accreted), which structureScale folds back into the binding mass. Total
  // gravitating mass is conserved — nothing is created or destroyed by the (rare) capture.
  function accreteMember(struct, b) {
    if (struct) {
      struct.accreted = (struct.accreted || 0) + (b._m || 0);
      struct.accretedN = (struct.accretedN || 0) + 1;   // swallow census (panel readout)
    }
  }

  // ── Starburst: collapse perturbed molecular clouds into newborn stars ──
  // Runs once per frame (dt = sim-time advanced). Perturbation-driven only: it
  // needs an active binary (the companion's tidal field is what compresses the
  // clouds), and only 'gas' members — a galaxy's molecular clouds — collapse.
  // See the SB_* constants for the conservation contract.
  function stepStarburst(sim, dt) {
    if (dt <= 0) return;
    const bin = sim.binary;
    if (!bin || !bin.enabled) return;
    const Mc1 = sim.params.M + ((sim._struct1 && sim._struct1.coreBoost) || 0);
    const M2 = bin.M2 || 0;
    const spawns = [];
    for (const b of sim.bodies) {
      if (!b._cloud || b.state !== 'orbit' || b.kind !== 'gas') continue;
      const role = b._cloudRole;
      if (role !== 'central' && role !== 'companion') continue;  // stripped gas is too diffuse
      const d1 = Math.max(1, Math.hypot(b.x - bin.x1, b.y - bin.y1));
      const d2 = Math.max(1, Math.hypot(b.x - bin.x2, b.y - bin.y2));
      const own = role === 'central' ? Mc1 / (d1 * d1 * d1) : M2 / (d2 * d2 * d2);
      const opp = role === 'central' ? M2 / (d2 * d2 * d2) : Mc1 / (d1 * d1 * d1);
      const q = opp / Math.max(1e-9, own);
      if (q < SB_QMIN) continue;
      // Gas-inflow census for AGN ignition: a TIDALLY PERTURBED cloud (same q floor
      // as the starburst — quiescent discs do not feed) near its own nucleus is
      // fuel arriving at the hole. Distant clouds on ordinary inner orbits don't count.
      if ((role === 'central' ? d1 : d2) < AGN_FUEL_R) {
        const st = role === 'companion' ? sim._struct2 : sim._struct1;
        if (st && st.key === 'galaxy') st.gasInflow = (st.gasInflow || 0) + dt;
      }
      if (Math.random() >= SB_RATE * Math.min(1.5, q) * dt) continue;
      // Collapse: the cloud becomes SB_SPLIT stars. Mutate the cloud body into the
      // first newborn (keeps array churn low) and queue the siblings. Offsets and
      // velocity kicks point along SB_SPLIT evenly spaced directions, so they sum
      // to zero EXACTLY — the cloud's centre of mass and momentum are untouched.
      const ms = (b._m || 0) / SB_SPLIT;
      const phi = Math.random() * Math.PI * 2;
      const ox = b.x, oy = b.y, ovx = b.vx, ovy = b.vy;
      for (let k = 0; k < SB_SPLIT; k++) {
        const th = phi + (k * 2 * Math.PI) / SB_SPLIT;
        const cx = Math.cos(th), cy = Math.sin(th);
        if (k === 0) {
          b.kind = 'star'; b.radius = 0.42; b._m = ms; b._bornAt = sim.t;
          b.x = ox + 0.45 * cx; b.y = oy + 0.45 * cy;
          b.vx = ovx + SB_KICK * cx; b.vy = ovy + SB_KICK * cy;
        } else {
          spawns.push({
            name: '', kind: 'star', radius: 0.42, binding: 6, charge: 0,
            x: ox + 0.45 * cx, y: oy + 0.45 * cy,
            vx: ovx + SB_KICK * cx, vy: ovy + SB_KICK * cy,
            _cloud: b._cloud, _cloudOrigin: b._cloudOrigin, _cloudRole: role,
            _m: ms, _bornAt: sim.t,
          });
        }
      }
      const struct = role === 'companion' ? sim._struct2 : sim._struct1;
      if (struct) struct.newborn = (struct.newborn || 0) + SB_SPLIT;
      sim._sbPend = (sim._sbPend || 0) + SB_SPLIT;
    }
    for (const s of spawns) addBody(sim, s);
    // Rate-limited starburst log: batch the births since the last line (≥1 sim-s)
    // so a vigorous burst reads as a stream of counts, not hundreds of lines.
    if ((sim._sbPend || 0) > 0 && sim.t - (sim._sbLogT != null ? sim._sbLogT : -9) >= 1) {
      logEv(sim, 'good', trp('starburst · molecular clouds collapse → {n} new stars', { n: sim._sbPend }));
      sim._sbLogT = sim.t; sim._sbPend = 0;
    }
    // Enough fuel has reached a quiescent nucleus → the AGN ignites.
    igniteAGN(sim, 'central');
    igniteAGN(sim, 'companion');
  }

  // Gas inflow → AGN ignition. A physical event, not a user toggle: the disc
  // turns on but the remembered preference (discPref / discPref2) is untouched,
  // so re-picking the body type later still honors the user's own choice. The
  // one-shot flag consumes the ignition whether or not the disc was already on.
  function igniteAGN(sim, role) {
    const st = role === 'companion' ? sim._struct2 : sim._struct1;
    if (!st || st.key !== 'galaxy' || st.agnIgnited) return;
    if ((st.gasInflow || 0) < AGN_IGNITE) return;
    st.agnIgnited = true;
    const disc = role === 'companion' ? sim.disc2 : sim.disc;
    if (!disc || disc.enabled) return;   // nucleus already shining
    disc.enabled = true;
    logEv(sim, 'warn', tr('gas inflow ignites the active nucleus (AGN) — accretion disc + jet',
                          '氣體流入點燃活躍星系核(AGN) — 吸積盤 + 噴流'));
  }

  // Arm a tidal-disruption flare on the swallowing core. Render-side only — the
  // renderer anchors it to the role's CURRENT core position and fades it over
  // TDE_T (muted, never neon). Capped so a feeding frenzy can't grow the list.
  function armTDEFlare(sim, role) {
    if (!sim._tdeFlares) sim._tdeFlares = [];
    if (sim._tdeFlares.length >= 8) sim._tdeFlares.shift();
    sim._tdeFlares.push({ role, t0: sim.t });
  }

  // Arm the violent-relaxation window on the surviving central structure after a
  // galaxy×galaxy merger. Mixed pairings (galaxy×cluster etc.) keep the survivor's
  // morphology — only the G×G channel produces an elliptical. Idempotent: a remnant
  // that already relaxed stays elliptical with no second window.
  function beginEllipticalRelaxation(sim) {
    const st = sim._struct1;
    if (!st || st.key !== 'galaxy' || st.morph === 'elliptical') return;
    st.morph = 'elliptical';
    sim._relax = { t: 0, T: RELAX_T };
    for (const b of sim.bodies) {
      if (b._cloud && b.state === 'orbit') b._rlxW = (Math.random() * 2 - 1) * RELAX_W;
    }
    logEv(sim, 'amber', tr('violent relaxation — merger remnant settling into an elliptical galaxy',
                           '劇烈鬆弛 — 合併殘骸正鬆弛為橢圓星系'));
  }

  // Run the relaxation window: rotate each tagged member's core-relative velocity
  // by its own fixed random rate, sin²-enveloped over the window. Speeds (hence
  // kinetic energies and the mass ledger) are exactly preserved; the swarm's net
  // angular momentum is deliberately scattered away — that IS the relaxation — so
  // the conservation baseline is re-based once when the window closes.
  function stepRelaxation(sim, dt) {
    const rx = sim._relax;
    if (!rx || dt <= 0) return;
    rx.t += dt;
    if (rx.t >= rx.T) {
      sim._relax = null;
      for (const b of sim.bodies) if (b._rlxW != null) b._rlxW = null;
      resetConservationBaseline(sim);   // discrete model event — re-base p/L
      logEv(sim, 'good', tr('relaxation complete → elliptical galaxy', '鬆弛完成 → 橢圓星系'));
      return;
    }
    const sn = Math.sin(Math.PI * rx.t / rx.T);
    const env = sn * sn;                // zero drive at both window edges (C¹)
    const host = resolveHost(sim, 'central');
    const hvx = host ? host.hvx : 0, hvy = host ? host.hvy : 0;
    for (const b of sim.bodies) {
      if (!b._cloud || b.state !== 'orbit' || b._cloudRole !== 'central' || b._rlxW == null) continue;
      const th = b._rlxW * env * dt;
      const c = Math.cos(th), s = Math.sin(th);
      const ux = b.vx - hvx, uy = b.vy - hvy;
      b.vx = hvx + ux * c - uy * s;
      b.vy = hvy + ux * s + uy * c;
    }
  }

  // Loss cone of a real horizon at rDest: Lcrit = sqrt(2 G Mc rDest) is the angular momentum
  // of a parabolic orbit grazing rDest (G = 1). |Δr × Δv| ≤ Lcrit ⇒ pericentre inside the
  // horizon ⇒ genuinely plunging ⇒ captured; otherwise it grazes past and survives.
  function cloudInLossCone(b, cx, cy, cvx, cvy, Mc, rDest) {
    const dx = b.x - cx, dy = b.y - cy;
    const dvx = b.vx - cvx, dvy = b.vy - cvy;
    const L = Math.abs(dx * dvy - dy * dvx);          // specific angular momentum
    const Lcrit = Math.sqrt(2 * Mc * Math.max(1e-3, rDest));
    return L <= Lcrit;
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
    // Smooth dark-matter halo field of any galaxy structure (collisionless mean-field;
    // the cloud particles feel it on top of the point-mass cores). Centred on the host
    // core: central at origin (or bin.x1) and companion at bin.x2.
    const c1x = binOn ? bin.x1 : 0, c1y = binOn ? bin.y1 : 0;
    const halo1 = sim._halo1, halo2 = sim._halo2;
    // Centre each binding halo on its structure's live centre of mass (recordCloudCounts),
    // falling back to the core. A halo centred on its own COM exerts no NET self-force on
    // the swarm (momentum-consistent) while still binding the members about their drifting
    // centroid — so a structure tugged by its companion translates as a whole instead of
    // shedding stars that "orbit" a stale core position.
    const h1c = sim._com1 || { x: c1x, y: c1y };
    const h2c = sim._com2 || { x: binOn ? bin.x2 : 0, y: binOn ? bin.y2 : 0 };
    const addHalo = (acc, px, py) => {
      if (halo1) { const h = phys.haloAccel(px - h1c.x, py - h1c.y, halo1.M, halo1.R); acc.ax += h.ax; acc.ay += h.ay; }
      if (halo2 && binOn) { const h = phys.haloAccel(px - h2c.x, py - h2c.y, halo2.M, halo2.R); acc.ax += h.ax; acc.ay += h.ay; }
    };
    // ── Cloud-member field: Plummer-softened cores + halos ──
    // A structure's core is an EXTENDED mass to its member stars (a galactic bulge / a
    // cluster's stellar core), not a point: the raw point-mass field diverges as r→0, and
    // a collisionless member grazing straight through the centre picks up an unphysical
    // energy-pumping slingshot the integrator step cannot resolve (breaking the momentum
    // ledger with v ≫ c ejecta). So members feel the cores through a Plummer-softened
    // Newtonian field (ε = 1.5 M, small next to every structure's inner radius) plus the
    // smooth halos. Real-horizon capture is untouched — it is a geometric check on r,
    // gated by the loss cone, not on the field. User-placed bodies keep the exact
    // original (pseudo-GR) field.
    // Central core mass as the SWARM feels it: the frozen unit plus any banked merger
    // mass (struct.coreBoost — the absorbed companion core, kept for field continuity).
    const Mc1 = M + ((sim._struct1 && sim._struct1.coreBoost) || 0);
    // ── Post-coalescence field morph (see coalesce) ──
    // While the window is open the central source is REPLACED by the two contact-
    // frozen progenitor points, smoothstep-shrunk onto the remnant and rotating at
    // the contact rate. Advanced here because integrate() is the field's only
    // consumer (one clock tick per sub-step). When it closes, both points coincide
    // with the origin and sum to Mc1, so the fall-through to the single-point
    // field below is an exact, jump-free handover.
    let mo = null;
    const morph = sim._coreMorph;
    if (morph) {
      morph.t += dt;
      if (morph.t >= morph.T) {
        sim._coreMorph = null;
      } else {
        const u = morph.t / morph.T;
        const s = u * u * (3 - 2 * u);                  // smoothstep: zero end slopes
        const k = 1 - s;
        const cs = Math.cos(morph.om * morph.t), sn = Math.sin(morph.om * morph.t);
        mo = {
          ax: (morph.ax0 * cs - morph.ay0 * sn) * k, ay: (morph.ax0 * sn + morph.ay0 * cs) * k,
          bx: (morph.bx0 * cs - morph.by0 * sn) * k, by: (morph.bx0 * sn + morph.by0 * cs) * k,
          mA: morph.mA, mB: Math.max(0, morph.mB - morph.eGW * s),
        };
      }
    }
    // Newton's-third-law reaction of the swarm on the cores, accumulated per member from
    // its core + halo forces (a halo's reaction is anchored to its host core — the halo
    // IS the structure's bound member mass riding that core). stepBinary translates the
    // pair's barycentre with the net force, so (cores + cloud) momentum is conserved by
    // construction instead of approximately via the halo field sampled at the cores.
    let r1fx = 0, r1fy = 0, r2fx = 0, r2fy = 0;
    const cloudAccel = (px, py, m, collect) => {
      const acc = { ax: 0, ay: 0 };
      let a1x, a1y;
      if (mo) {
        // Morph window: the central well is still the TWO progenitor points.
        const dAx = px - mo.ax, dAy = py - mo.ay;
        const wA = -mo.mA / Math.pow(dAx * dAx + dAy * dAy + EPS2, 1.5);
        const dBx = px - mo.bx, dBy = py - mo.by;
        const wB = -mo.mB / Math.pow(dBx * dBx + dBy * dBy + EPS2, 1.5);
        a1x = wA * dAx + wB * dBx; a1y = wA * dAy + wB * dBy;
      } else {
        const d1x = px - c1x, d1y = py - c1y;
        const w1 = -Mc1 / Math.pow(d1x * d1x + d1y * d1y + EPS2, 1.5);
        a1x = w1 * d1x; a1y = w1 * d1y;
      }
      if (halo1) { const hf = phys.haloAccel(px - h1c.x, py - h1c.y, halo1.M, halo1.R); a1x += hf.ax; a1y += hf.ay; }
      acc.ax += a1x; acc.ay += a1y;
      if (collect) { r1fx -= m * a1x; r1fy -= m * a1y; }
      if (binOn) {
        const d2x = px - bin.x2, d2y = py - bin.y2;
        const w2 = -bin.M2 / Math.pow(d2x * d2x + d2y * d2y + EPS2, 1.5);
        let a2x = w2 * d2x, a2y = w2 * d2y;
        if (halo2) { const hf = phys.haloAccel(px - h2c.x, py - h2c.y, halo2.M, halo2.R); a2x += hf.ax; a2y += hf.ay; }
        acc.ax += a2x; acc.ay += a2y;
        if (collect) { r2fx -= m * a2x; r2fy -= m * a2y; }
      }
      return acc;
    };
    for (const b of sim.bodies) {
      if (b.state !== 'orbit') continue;
      if (b.held) { b.trail.length = 0; continue; } // frozen while user repositions
      const cloud = !!b._cloud;
      const a1 = cloud ? cloudAccel(b.x, b.y, 0, false)
                       : phys.acceleration(b.x, b.y, b.vx, b.vy, M, Q, a, b.charge || 0, bin);
      if (!cloud) addHalo(a1, b.x, b.y);
      const mx = b.x + b.vx * dt * 0.5;
      const my = b.y + b.vy * dt * 0.5;
      const mvx = b.vx + a1.ax * dt * 0.5;
      const mvy = b.vy + a1.ay * dt * 0.5;
      // The midpoint stage is the one whose acceleration actually advances the star, so
      // the third-law reaction is collected here (×m, banked onto the cores).
      const a2 = cloud ? cloudAccel(mx, my, b._m || 0, true)
                       : phys.acceleration(mx, my, mvx, mvy, M, Q, a, b.charge || 0, bin);
      if (!cloud) addHalo(a2, mx, my);
      b.vx += a2.ax * dt;
      b.vy += a2.ay * dt;
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;

      // trail (skipped for cloud particles — there are hundreds; keeps memory bounded).
      // EXCEPT stripped stream stars: a short, bounded trail (≤60 points each) is what
      // makes the tidal tails / stellar streams readable as coherent arcs on the canvas.
      if (!b._cloud) {
        b.trail.push(b.x, b.y);
        if (b.trail.length > 1200) b.trail.splice(0, b.trail.length - 1200);
      } else if (b._stream) {
        b.trail.push(b.x, b.y);
        if (b.trail.length > 120) b.trail.splice(0, b.trail.length - 120);
      }

      const r = Math.hypot(b.x, b.y);

      // (Cloud-star membership / loss is handled per-frame by updateMembership: a star
      // that leaves all structures' reach simply becomes untagged but keeps orbiting.
      // Only genuine consumption — captured by a BH, tidally disrupted, or flung clear
      // past the far backstop below — removes it from the population.)

      // ── Binary-mode capture & tidal checks ──────────────
      if (bin && bin.enabled) {
        const r1 = Math.hypot(b.x - bin.x1, b.y - bin.y1);
        const r2 = Math.hypot(b.x - bin.x2, b.y - bin.y2);
        // A grazed member is immune until it leaves both cores' zones (re-arms the roll).
        if (b._grazed && r1 > GRAZE_CLEAR_R && r2 > GRAZE_CLEAR_R) b._grazed = false;
        // tidal stress: take worst of two bodies
        const t1 = phys.tidalStress(r1, M, b.radius || 0.4, b.binding || 1);
        const t2 = phys.tidalStress(r2, bin.M2, b.radius || 0.4, b.binding || 1);
        b.stress = Math.max(t1, t2);
        if (b.stress > b.stressPeak) b.stressPeak = b.stress;
        if (b.kind !== 'probe' && b.kind !== 'ship' && b.stress > 1.15) {
          // Members are collisionless: no tidal-shredding channel — they graze straight
          // through. NO `continue` for them: only the real-horizon loss-cone check below
          // may take a member (a `continue` here would dead-code the swallow/TDE path,
          // since stress always exceeds the threshold inside the swallow radius).
          // User bodies still spaghettify.
          if (!b._cloud) {
            b.state = 'spaghettified'; b.consumedAt = sim.t;
            logEv(sim, 'warn', trp('{name} — spaghettified between binary pair', { name: b.name }));
            continue;
          }
        }
        // Primary capture / surface impact
        if (cType === 'bh') {
          if (!naked && r1 < (isFinite(rplus) ? rplus : M)) {
            // A member is swallowed only by a REAL BH core (a galaxy/hole, not a star-swarm
            // binding mass), only inside the tiny mass-decoupled swallow radius, and only
            // if it threads that radius's loss cone.
            if (b._cloud && (!coreCanSwallow(sim.smbhStructure)
                || r1 > CLOUD_SWALLOW_R
                || !cloudInLossCone(b, bin.x1, bin.y1, bin.vx1 || 0, bin.vy1 || 0, M, CLOUD_SWALLOW_R))) continue;
            // One swallow roll per passage — most plunges graze the (truly tiny) horizon.
            if (b._cloud && b._grazed) continue;
            if (b._cloud && Math.random() >= CLOUD_SWALLOW_P) { b._grazed = true; continue; }
            if (b._cloud) {
              accreteMember(sim._struct1, b);
              // A star is shredded on the way in — a TDE with a visible flare;
              // a molecular cloud accretes quietly.
              if (b.kind !== 'gas') {
                armTDEFlare(sim, 'central');
                logMemberSwallow(sim, 'tidal disruption event — member star shredded by central BH', '潮汐撕裂事件（TDE）— 成員星被中央黑洞撕裂');
              } else {
                logMemberSwallow(sim, 'molecular cloud swallowed by central BH (loss cone)', '分子雲被中央黑洞吞噬（loss cone）');
              }
            }
            b.state = 'captured'; b.consumedAt = sim.t;
            if (!b._cloud) logEv(sim, 'warn', trp('{name} — captured by primary BH', { name: b.name }));
            continue;
          }
        } else {
          const Rs1 = sim.params.R_star || 3;
          if (r1 < Rs1) {
            if (b._cloud) continue;   // members pass through a non-BH central, never impact
            b.state = 'captured'; b.consumedAt = sim.t;
            const label = surfaceLabel(cType);
            logEv(sim, 'warn', trp('{name} — impacted primary {surface}', { name: b.name, surface: tr(label.en, label.zh) }));
            continue;
          }
        }
        // Companion capture / surface impact
        if (sType === 'bh') {
          if (!compH.naked && r2 < (isFinite(compH.rplus) ? compH.rplus : bin.M2)) {
            if (b._cloud && (!coreCanSwallow(bin.smbhStructure)
                || r2 > CLOUD_SWALLOW_R
                || !cloudInLossCone(b, bin.x2, bin.y2, bin.vx2 || 0, bin.vy2 || 0, bin.M2, CLOUD_SWALLOW_R))) continue;
            if (b._cloud && b._grazed) continue;
            if (b._cloud && Math.random() >= CLOUD_SWALLOW_P) { b._grazed = true; continue; }
            if (b._cloud) {
              accreteMember(sim._struct2, b);
              if (b.kind !== 'gas') {
                armTDEFlare(sim, 'companion');
                logMemberSwallow(sim, 'tidal disruption event — member star shredded by companion BH', '潮汐撕裂事件（TDE）— 成員星被伴星黑洞撕裂');
              } else {
                logMemberSwallow(sim, 'molecular cloud swallowed by companion BH (loss cone)', '分子雲被伴星黑洞吞噬（loss cone）');
              }
            }
            b.state = 'captured'; b.consumedAt = sim.t;
            if (!b._cloud) logEv(sim, 'warn', trp('{name} — captured by companion BH', { name: b.name }));
            continue;
          }
        } else {
          const Rs2 = bin.R_star2 || 3;
          if (r2 < Rs2) {
            if (b._cloud) continue;
            b.state = 'captured'; b.consumedAt = sim.t;
            const label = surfaceLabel(sType);
            logEv(sim, 'warn', trp('{name} — impacted companion {surface}', { name: b.name, surface: tr(label.en, label.zh) }));
            continue;
          }
        }
        // Cloud members are NEVER distance-culled: a star slung far from both
        // structures simply drops its membership tag (updateMembership) — it stops
        // supplying binding mass to either halo but keeps orbiting in the pair's
        // combined field, exactly like a real stripped star. Only user bodies keep
        // the demo's detector-range cutoff.
        if (!b._cloud && r > 50) {
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
        // Members are collisionless: no tidal-shredding channel — they graze straight
        // through, but must FALL THROUGH (no `continue`) so the real-horizon loss-cone
        // swallow below stays reachable (stress always tops the threshold inside the
        // swallow radius, so a `continue` here would dead-code member swallows / TDEs).
        if (!b._cloud) {
          b.state = 'spaghettified'; b.consumedAt = sim.t;
          logEv(sim, 'warn', trp('{name} — spaghettified at r = {r} M', { name: b.name, r: r.toFixed(2) }));
          continue;
        }
      }
      // Surface impact for stellar centrals
      if (cType !== 'bh') {
        const Rs = sim.params.R_star || 3;
        if (r < Rs) {
          if (b._cloud) continue;   // members pass through a non-BH central
          b.state = 'captured'; b.consumedAt = sim.t;
          const label = surfaceLabel(cType);
          logEv(sim, 'warn', trp('{name} — impacted {surface} at r = {r} M', { name: b.name, surface: tr(label.en, label.zh), r: r.toFixed(2) }));
          continue;
        }
      } else {
        if (b._cloud && b._grazed && r > GRAZE_CLEAR_R) b._grazed = false;   // re-arm the roll
        if (!naked && r < rplus) {
          // Member swallowed only by a REAL BH core, only inside the tiny mass-decoupled
          // swallow radius, through that radius's loss cone.
          if (b._cloud && (!coreCanSwallow(sim.smbhStructure)
              || r > CLOUD_SWALLOW_R
              || !cloudInLossCone(b, 0, 0, 0, 0, M, CLOUD_SWALLOW_R))) continue;
          if (b._cloud && b._grazed) continue;
          if (b._cloud && Math.random() >= CLOUD_SWALLOW_P) { b._grazed = true; continue; }
          if (b._cloud) {
            accreteMember(sim._struct1, b);
            if (b.kind !== 'gas') {
              armTDEFlare(sim, 'central');
              logMemberSwallow(sim, 'tidal disruption event — member star shredded by central BH', '潮汐撕裂事件（TDE）— 成員星被中央黑洞撕裂');
            } else {
              logMemberSwallow(sim, 'molecular cloud swallowed by central BH (loss cone)', '分子雲被中央黑洞吞噬（loss cone）');
            }
          }
          b.state = 'captured'; b.consumedAt = sim.t;
          if (!b._cloud) logEv(sim, 'warn', trp('{name} — crossed r₊, mass added to BH', { name: b.name }));
          continue;
        }
        if (naked && r < 0.4) {
          if (b._cloud && !coreCanSwallow(sim.smbhStructure)) continue;
          if (b._cloud) {
            accreteMember(sim._struct1, b);   // mass banked on the core (conserved)
            logMemberSwallow(sim, 'member star annihilated at naked singularity', '成員星於裸奇異點湮滅');
          }
          b.state = 'captured'; b.consumedAt = sim.t;
          if (!b._cloud) logEv(sim, 'warn', trp('{name} — annihilated at naked singularity', { name: b.name }));
          continue;
        }
      }
      // Cloud members are never distance-culled (see the binary branch above).
      if (!b._cloud && r > 50) {
        b.state = 'escaped'; b.consumedAt = sim.t;
        logEv(sim, 'amber', trp('{name} — escaped beyond detector range', { name: b.name }));
      }
    }

    // Bank this step's swarm→core reaction forces for stepBinary's barycentre update.
    sim._react1 = { fx: r1fx, fy: r1fy };
    sim._react2 = { fx: r2fx, fy: r2fy };

    // Prune cloud particles that left the structure or were consumed — the population
    // N shrinks as a galaxy/cluster loses stars (tidal stripping, ejection, or feeding
    // to a central BH). User-placed bodies are kept (they stay listed as captured/etc.).
    if (sim.bodies.some((b) => b._cloud && b.state !== 'orbit')) {
      sim.bodies = sim.bodies.filter((b) => !(b._cloud && b.state !== 'orbit'));
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
    let advanced = 0;          // total sim-time advanced this frame (drives the membership timer)
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
      advanced += dt;
      guard++;
    }
    stepStarburst(sim, advanced);     // perturbed molecular clouds collapse into new stars
    stepRelaxation(sim, advanced);    // G×G remnant relaxes toward an elliptical
    if (sim._tdeFlares && sim._tdeFlares.length)
      sim._tdeFlares = sim._tdeFlares.filter((f) => sim.t - f.t0 < TDE_T);
    updateMembership(sim, advanced);  // re-tag stars to whichever structure now owns them
    recordCloudCounts(sim);    // N1 / N2 from the fresh membership
    updateStructureMass(sim);  // mass tracks N; companion N->0 triggers the merge
  }

  // Record how many cloud stars are still in range for each structure (central N1 /
  // companion N2). Orbiting cloud particles ARE the in-range population — ones that
  // leave or are consumed get pruned in integrate() — so this count shrinks over a
  // merger. Surfaced in the body panels.
  function recordCloudCounts(sim) {
    let n1 = 0, n2 = 0, m1 = 0, m2 = 0;
    let sx1 = 0, sy1 = 0, sx2 = 0, sy2 = 0;   // mass-weighted member positions
    let nS = 0, mS = 0;                       // stripped tidal-stream stars (role null)
    let nH = 0;                               // hypervelocity ejections (subset of streams)
    let cpx = 0, cpy = 0, cL = 0, cAbs = 0;   // cloud momentum / ang-momentum (ledger)
    const bin = sim.binary, binOn = !!(bin && bin.enabled);
    const c1x = binOn ? bin.x1 : 0, c1y = binOn ? bin.y1 : 0;
    // Field-alignment tally: of the BOUND members, how many are pulled toward the
    // two cores in nearly the same direction (the angle between the star→core1 and
    // star→core2 unit vectors within ~20°)? This fraction only approaches 1 when
    // the cores sit deep inside a COMMON stellar envelope — the swarm can no longer
    // resolve them as separate attractors — and is what arms the progressive core
    // coalescence in stepBinary.
    let nAligned = 0, nAlignTot = 0;
    let gm1 = 0, gm2 = 0;   // molecular-cloud (gas member) mass per structure
    for (const b of sim.bodies) {
      if (!b._cloud || b.state !== 'orbit') continue;
      const m = b._m || 0;
      if (b.kind === 'gas') {
        if (b._cloudRole === 'companion') gm2 += m;
        else if (b._cloudRole === 'central') gm1 += m;
      }
      // Only BOUND members supply a structure's binding mass. An untagged (role null,
      // tidally stripped) star is counted as stream mass instead: it stops deepening
      // either halo — the potential well shallows as stars are stripped — but keeps
      // moving in the pair's combined field and stays on the total-mass ledger.
      if (b._cloudRole === 'companion')    { n2++; m2 += m; sx2 += m * b.x; sy2 += m * b.y; }
      else if (b._cloudRole === 'central') { n1++; m1 += m; sx1 += m * b.x; sy1 += m * b.y; }
      else                                 { nS++; mS += m; if (b._hvs) nH++; }
      if (binOn && (b._cloudRole === 'central' || b._cloudRole === 'companion')) {
        const ux = c1x - b.x, uy = c1y - b.y;          // star → central core
        const wx = bin.x2 - b.x, wy = bin.y2 - b.y;    // star → companion core
        const den = Math.hypot(ux, uy) * Math.hypot(wx, wy);
        if (den > 1e-9) {
          nAlignTot++;
          if ((ux * wx + uy * wy) / den >= CORE_ALIGN_COS) nAligned++;
        }
      }
      cpx += m * b.vx; cpy += m * b.vy;
      cL  += m * (b.x * b.vy - b.y * b.vx);
      cAbs += m * Math.hypot(b.vx, b.vy);
    }
    sim._coreAlign = binOn && nAlignTot > 0 ? nAligned / nAlignTot : 0;
    sim._gasM1 = gm1; sim._gasM2 = gm2;
    sim._cloudN1 = n1; sim._cloudN2 = n2;
    sim._cloudM1 = m1; sim._cloudM2 = m2;
    sim._streamN = nS; sim._streamM = mS;
    sim._hvsN = nH;
    // Centre of mass of each structure = (core point mass + its member stars). The core
    // is the frozen SMBH point (central params.M at the origin/bin.x1; companion bin.M2 at
    // bin.x2); the members carry the conserved bound mass. Used as the binding halo's
    // centre so the field tracks the real mass distribution as it is perturbed.
    const M1 = sim.params.M, W1 = M1 + m1;
    sim._com1 = W1 > 0 ? { x: (M1 * c1x + sx1) / W1, y: (M1 * c1y + sy1) / W1 } : { x: c1x, y: c1y };
    if (binOn) {
      const M2 = bin.M2, W2 = M2 + m2;
      sim._com2 = W2 > 0 ? { x: (M2 * bin.x2 + sx2) / W2, y: (M2 * bin.y2 + sy2) / W2 } : { x: bin.x2, y: bin.y2 };
    } else {
      sim._com2 = null;
    }

    // ── Conservation ledger ───────────────────────────────────
    // Total gravitating mass / linear momentum / angular momentum (about the world
    // origin) of the structure scene: the cores plus every cloud star's mass quantum
    // (bound members AND stripped stream stars — stripping moves mass, it never destroys
    // it; ejected stars are never culled, they stay on the books as untagged strays),
    // plus mass the cores have swallowed (struct.accreted). Exposed as sim._conserve
    // against the baseline sim._conserve0 — reset on any user perturbation (placement,
    // launch, re-seed) — so the panels can SHOW the merger conserving M and p rather
    // than asserting it. (Orbital L bleeds to the DF wake / GW by design; it is tracked
    // here for completeness but is not expected to stay flat during an inspiral.)
    // A binary turning on/off is a discrete model event (a core merges away, or a new
    // pair forms): the books legitimately change, so re-base — whatever path ended it
    // (member depletion, core-contact coalescence, escape, manual removal).
    if (sim._consBinOn !== binOn) { sim._conserve0 = null; sim._consBinOn = binOn; }
    if (n1 + n2 + nS > 0 || sim._conserve) {
      // Cloud total = bound members of both structures PLUS the untagged stream strays
      // (mS): stripped stars left the halos but never the scene, so the ledger still
      // carries them (their momentum/L are already in cpx/cpy/cL — the loop sums every
      // live cloud star regardless of role). The central core carries the frozen unit
      // PLUS any banked merger mass (struct.coreBoost) — absorbed companion cores stay
      // on the books.
      const M1c = M1 + ((sim._struct1 && sim._struct1.coreBoost) || 0);
      let mT = M1c + m1 + m2 + mS
             + ((sim._struct1 && sim._struct1.accreted) || 0)
             + ((sim._struct2 && sim._struct2.accreted) || 0);
      let pxT = cpx + M1c * (binOn ? bin.vx1 : 0);
      let pyT = cpy + M1c * (binOn ? bin.vy1 : 0);
      let LT  = cL + (binOn ? M1c * (bin.x1 * bin.vy1 - bin.y1 * bin.vx1) : 0);
      let pAbs = cAbs + M1c * (binOn ? Math.hypot(bin.vx1, bin.vy1) : 0);
      if (binOn) {
        mT += bin.M2;
        pxT += bin.M2 * bin.vx2; pyT += bin.M2 * bin.vy2;
        LT  += bin.M2 * (bin.x2 * bin.vy2 - bin.y2 * bin.vx2);
        pAbs += bin.M2 * Math.hypot(bin.vx2, bin.vy2);
      }
      sim._conserve = { M: mT, px: pxT, py: pyT, L: LT };
      // Baseline: captured on the first pass after seeding / a user perturbation. pref
      // is the momentum scale Σ|m·v| used to normalise the displayed drift percentage.
      if (!sim._conserve0) sim._conserve0 = { M: mT, px: pxT, py: pyT, L: LT, pref: Math.max(1e-6, pAbs) };
    } else {
      sim._conserve = null; sim._conserve0 = null;
    }
  }

  // Drop the conservation baseline so the next recordCloudCounts pass re-captures it.
  // Called whenever the USER changes the system's momentum (placement, launch, re-seed,
  // mass-slider edit) — those are new initial conditions, not conservation violations.
  function resetConservationBaseline(sim) { sim._conserve0 = null; }

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

  // Re-establish a clean classical stable orbit for each member star of a structure
  // cloud about its host core, then ride the host's bulk motion. For a star at offset
  // (rx,ry) and radius r the circular speed is √(v_c(r)² + a_halo·r) (the same balance
  // the swarm is seeded with: core point-mass + dark-matter halo, so the rotation curve
  // is flat for a galaxy). The star's CURRENT direction of revolution about the core is
  // preserved (its angular-momentum sign), so the swarm keeps its spin while every orbit
  // becomes a stable closed circle — the cloud analogue of circularizeBody. (hvx,hvy) is
  // the host core's lab velocity, added so the whole swarm co-moves with its core.
  function circularizeCloud(sim, role, hx, hy, hvx, hvy, Mcore, halo, dir) {
    for (const cb of sim.bodies) {
      if (!cb._cloud || cb.state !== 'orbit' || cb._cloudRole !== role) continue;
      const rx = cb.x - hx, ry = cb.y - hy;
      const r = Math.hypot(rx, ry);
      if (r < 1e-3) { cb.vx = hvx; cb.vy = hvy; continue; }
      let vc2 = cloudCircularSpeed2(r, Mcore);
      if (halo && halo.M > 0) {
        const ha = phys.haloAccel(rx, ry, halo.M, halo.R);
        vc2 += Math.hypot(ha.ax, ha.ay) * r;
      }
      const vc = Math.sqrt(Math.max(0, vc2));
      // Keep the star's current sense of revolution (sign of r × v_rel); fall back to
      // the host's spin direction if it is essentially at rest relative to the core.
      const relvx = cb.vx - hvx, relvy = cb.vy - hvy;
      let sgn = Math.sign(rx * relvy - ry * relvx) || dir || 1;
      const tx = -ry / r, ty = rx / r;            // CCW tangent unit vector
      cb.vx = hvx + tx * vc * sgn;
      cb.vy = hvy + ty * vc * sgn;
      if (cb.trail) cb.trail.length = 0;
    }
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
    // Re-settle each structure's swarm onto stable classical orbits about its host core
    // (and co-moving with that core's freshly-circularised bulk motion). The companion
    // swarm rides the secondary, the central swarm rides the primary; an untagged star
    // (role null) belongs to neither and is left alone. This is the internal analogue of
    // the barycentric circularisation above: the pair AND every member star end on a
    // momentum/angular-momentum-conserving closed orbit.
    const has1 = isCloudStruct(sim.smbhStructure);
    const has2 = isCloudStruct(bin.smbhStructure);
    if (has2) {
      circularizeCloud(sim, 'companion', bin.x2, bin.y2, bin.vx2, bin.vy2, M2, sim._halo2,
                       Math.sign(bin.a2 || sim.params.a || 1) || 1);
    }
    if (has1) {
      circularizeCloud(sim, 'central', bin.x1, bin.y1, bin.vx1, bin.vy1,
                       M1 + ((sim._struct1 && sim._struct1.coreBoost) || 0), sim._halo1,
                       Math.sign(sim.params.a || 1) || 1);
    }
    resetConservationBaseline(sim);   // circularisation rewrites the velocities
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
    resetConservationBaseline(sim);   // user launch = new initial momentum
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
      halo1: cloneState(sim._halo1),
      halo2: cloneState(sim._halo2),
      struct1: cloneState(sim._struct1),
      struct2: cloneState(sim._struct2),
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
    sim._halo1 = cloneState(s.halo1) || null;
    sim._halo2 = cloneState(s.halo2) || null;
    sim._struct1 = cloneState(s.struct1) || null;
    sim._struct2 = cloneState(s.struct2) || null;
    sim._coreMorph = null;   // morphs are transient — never restored mid-window
    sim._relax = null;       // (a restored struct keeps morph='elliptical'; only the window drops)
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
    sim._halo1 = null; sim._halo2 = null;   // no galaxy halos in a fresh scene
    sim._struct1 = null; sim._struct2 = null;
    sim._coreMorph = null;                  // no in-flight post-merger field morph
    sim._relax = null;                      // no in-flight violent relaxation
    // A fresh scene is its own sandbox — start with discs off (a galaxy's AGN turns
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

  // A structure key that is simulated as a live swarm of member stars (a particle
  // cloud + binding halo): the supermassive galaxy / star cluster, and the
  // intermediate-scale open cluster. Every cloud gate (seeding, membership, mass
  // bookkeeping, render glow) keys off this so a new swarm type only has to be added
  // here. 'smbh' (a bare hole) and the single-star stages are NOT clouds.
  function isCloudStruct(key) {
    return key === 'galaxy' || key === 'cluster' || key === 'opencluster';
  }
  // Plummer softening (ε² = 2.25, ε = 1.5 M) of the core field as the cloud members
  // feel it — shared by the integrator (cloudAccel) and the circular-speed seeds.
  const EPS2 = 2.25;
  // Squared circular speed of a cloud member at radius r in the field it ACTUALLY
  // feels: the Plummer-softened Newtonian core, v² = a(r)·r = M r² / (r²+ε²)^(3/2).
  // (NOT the pseudo-GR circularSpeed — that is the field of user-placed bodies; a
  // member seeded with it would not be on a circular orbit of the softened field.)
  function cloudCircularSpeed2(r, Mcore) {
    const s = r * r + EPS2;
    return (Mcore * r * r) / (s * Math.sqrt(s));
  }
  // Gas-poor self-bound star swarms (cluster / open cluster) — no central SMBH, no gas.
  function isStarSwarm(key) { return key === 'cluster' || key === 'opencluster'; }

  // ── Galactic-structure tracer clouds ──────────────────────
  // A galaxy or cluster is simulated as a swarm of TEST PARTICLES (stars + gas) in the
  // smooth field of its core + dark-matter halo (the collisionless / mean-field method;
  // see KNphysics dynamicalFriction/haloAccel). The particles are flagged `_cloud` so
  // the integrator skips their trail (memory) and the renderer draws them as light
  // points without labels. role 'central' orbits the primary (origin / bin.x1); role
  // 'companion' orbits the secondary (bin.x2). Idempotent per role.
  //
  // The mass slider sets N (more mass -> a richer swarm). Scales with the structure's
  // PHYSICAL solar mass across the supermassive band (1e5..1e10 M⊙) so BOTH the central
  // (whose geometric M is frozen at 1) and the companion respond to their own mass
  // slider. Mapped log-linearly onto a perf-friendly particle band [18,120].
  function structureN(massSun, key) {
    const lm = Math.log10(Math.max(1, massSun || 1));
    // The intermediate-scale open cluster lives in the 1e2..1e5 M⊙ band (lm ~2..5): a
    // few dozen member stars, fewer than a supermassive swarm but still rich enough to
    // show stripping / succession. The galaxy / supermassive cluster use the 1e5..1e10
    // band (lm ~5..10) mapped onto the perf-friendly [18,120] particle budget.
    if (key === 'opencluster') return Math.max(12, Math.min(80, Math.round(12 + 19 * (lm - 2))));
    return Math.max(18, Math.min(120, Math.round(18 + 20.4 * (lm - 5))));
  }

  // Remove a structure's seeded particles and its metadata/halo. Clears by ORIGIN
  // (the seed group), not by current membership — a star that transferred to the
  // other structure keeps orbiting, but re-seeding/clearing a role wipes its originals.
  function clearStructureCloud(sim, role) {
    sim.bodies = sim.bodies.filter((b) => !(b._cloud && b._cloudOrigin === role));
    if (role === 'companion') { sim._halo2 = null; sim._struct2 = null; }
    else                      { sim._halo1 = null; sim._struct1 = null; }
  }

  // Resolve a structure role's host core (position / velocity / geometric mass / spin
  // direction / physical solar mass). Returns null if the role has no live host (e.g.
  // a companion with no active binary).
  function resolveHost(sim, role) {
    const bin = sim.binary;
    const binOn = !!(bin && bin.enabled);
    if (role === 'companion') {
      if (!binOn) return null;
      return { hx: bin.x2, hy: bin.y2, hvx: bin.vx2, hvy: bin.vy2,
               Mcore: bin.M2, dir: Math.sign(bin.a2 || sim.params.a || 1) || 1,
               massSun: bin.M2sun != null ? bin.M2sun : (bin.M2 || 0.8) * (sim.params.Msun || 1) };
    }
    return { hx: binOn ? bin.x1 : 0, hy: binOn ? bin.y1 : 0,
             hvx: binOn ? bin.vx1 : 0, hvy: binOn ? bin.vy1 : 0,
             // Members orbit the core + any banked merger mass (field continuity).
             Mcore: sim.params.M + ((sim._struct1 && sim._struct1.coreBoost) || 0),
             dir: Math.sign(sim.params.a || 1) || 1,
             massSun: sim.params.Msun || 1 };
  }

  // Spawn one cloud particle on a circular (+dispersion) orbit about its host core,
  // sampled within [rIn,rOut] with the central concentration r = rIn+(rOut-rIn)·u².
  // `m` is the star's fixed mass quantum: the structure's bound mass shared over its
  // members, so Σ members' m = the structure's gravitating mass (conserved on transfer).
  function spawnCloudParticle(sim, key, role, host, geom, halo, gas, m = 0) {
    const { hx, hy, hvx, hvy, Mcore, dir } = host;
    const u = Math.random();
    const r = geom.rIn + (geom.rOut - geom.rIn) * u * u;
    const th = Math.random() * Math.PI * 2;
    const x = hx + r * Math.cos(th), y = hy + r * Math.sin(th);
    // Circular speed about the core (softened field the member feels), plus the
    // halo's contribution (flattens the rotation curve for a galaxy). v_halo^2 = a_halo·r.
    let vc2 = cloudCircularSpeed2(r, Mcore);
    if (halo) {
      const ha = phys.haloAccel(r, 0, halo.M, halo.R);
      vc2 += Math.abs(ha.ax) * r;
    }
    const vc = Math.sqrt(Math.max(0, vc2));
    const disp = (gas ? 0.02 : 0.06) * vc;     // gas is dynamically colder than stars
    const jx = (Math.random() - 0.5) * 2 * disp, jy = (Math.random() - 0.5) * 2 * disp;
    addBody(sim, {
      name: '', kind: gas ? 'gas' : 'star', radius: gas ? 0.32 : 0.42,
      binding: 6, charge: 0,
      x, y,
      vx: hvx - Math.sin(th) * vc * dir + jx,
      vy: hvy + Math.cos(th) * vc * dir + jy,
      // _cloud: the tracer key; _cloudOrigin: immutable seed group (for clearing);
      // _cloudRole: DYNAMIC membership (which structure owns it now; null = none);
      // _m: fixed mass quantum that follows the star across membership transfers.
      _cloud: key, _cloudOrigin: role, _cloudRole: role, _m: m,
    });
  }

  // Intrinsic-size multiplier from the structure's physical mass (the mass–size
  // relation: more massive galaxies/clusters are larger). The true virial law R∝M^(1/3)
  // would span ~46× over the 1e5..1e10 M⊙ band — far too much for the demo viewport, so
  // it is compressed log-linearly into a gentle, bounded band [0.65, 1.8]. This is what
  // makes a structure's RADIUS visibly grow/shrink with its mass slider (the outer edge
  // moves; the inner edge stays put, outside the ISCO, for orbital stability).
  function structureSizeMul(massSun, key) {
    const lm = Math.log10(Math.max(1, massSun || 1));
    // The open cluster's mass–size relation is read over its own (intermediate) band,
    // 1e2..1e5 M⊙ (lm ~2..5), compressed into a compact [0.5, 1.1] viewport range — an
    // open cluster is physically smaller than a galaxy/globular swarm. The supermassive
    // structures read the 1e5..1e10 band (lm ~5..10) into [0.65, 1.8].
    if (key === 'opencluster') return Math.max(0.5, Math.min(1.1, 0.5 + (1.1 - 0.5) * (lm - 2) / 3));
    return Math.max(0.65, Math.min(1.8, 0.65 + (1.8 - 0.65) * (lm - 5) / 5));
  }

  // Geometry (inner/outer sampling radii) for a structure key at a given mass. Only the
  // OUTER edge scales with mass (size relation); the inner edge is fixed outside the
  // ISCO so the swarm orbits stably instead of promptly plunging into the core BH.
  function structureGeom(key, massSun = 4e6) {
    const isGalaxy = key === 'galaxy';
    const isOpen = key === 'opencluster';
    const mul = structureSizeMul(massSun, key);
    const rIn = isGalaxy ? 7 : (isOpen ? 4 : 5);
    const base = isGalaxy ? 34 : (isOpen ? 16 : 22);
    const rOut = Math.max(rIn + 4, base * mul);
    return { rIn, rOut, gasFrac: isGalaxy ? 0.35 : 0 };
  }

  // Effective molecular-cloud mass fraction for a structure: the user-set slider
  // value (sim.params.gasFrac central / bin.gasFrac2 companion, set by
  // setGasFraction) overrides the seed default from structureGeom. Only galaxies
  // carry molecular clouds; star swarms stay gas-poor regardless of the slider.
  function gasFracFor(sim, key, role, geom) {
    if (key !== 'galaxy') return geom.gasFrac;
    const v = role === 'companion' ? (sim.binary ? sim.binary.gasFrac2 : null) : sim.params.gasFrac;
    return v != null ? Math.max(0, Math.min(0.8, v)) : geom.gasFrac;
  }

  // ── User slider: a galaxy's BH ↔ molecular-cloud make-up ──
  // Sets what fraction of the structure's bound member mass rides in molecular
  // clouds (gas members) vs stars, and re-balances the LIVE swarm in place by
  // flipping member kinds (star ↔ gas). Mass quanta are untouched, so the
  // conservation ledger is unaffected — composition changes, mass does not.
  // The BH : cloud mass ratio readout follows from the live sums (sim._gasM*).
  function setGasFraction(sim, role, frac) {
    const f = Math.max(0, Math.min(0.8, frac || 0));
    if (role === 'companion') { if (sim.binary) sim.binary.gasFrac2 = f; }
    else sim.params.gasFrac = f;
    const mine = sim.bodies.filter((b) => b._cloud && b.state === 'orbit' && b._cloudRole === role);
    if (!mine.length) return;
    const target = Math.round(f * mine.length);
    const gas = mine.filter((b) => b.kind === 'gas');
    const delta = target - gas.length;
    if (delta > 0) {
      const stars = mine.filter((b) => b.kind !== 'gas');
      for (let i = 0; i < delta && i < stars.length; i++) {
        stars[i].kind = 'gas'; stars[i].radius = 0.32; stars[i]._bornAt = null;
      }
    } else if (delta < 0) {
      for (let i = 0; i < -delta && i < gas.length; i++) {
        gas[i].kind = 'star'; gas[i].radius = 0.42;
      }
    }
    recordCloudCounts(sim);   // refresh the gas-mass sums for the ratio readout
  }

  function seedStructureCloud(sim, key, role = 'central') {
    clearStructureCloud(sim, role);
    resetConservationBaseline(sim);   // new swarm = new initial condition for the ledger
    if (role === 'central') { sim._coreMorph = null; sim._relax = null; }   // a re-seeded centre owns no stale morph/relaxation
    if (!isCloudStruct(key)) return;
    const host = resolveHost(sim, role);
    if (!host) return;
    const geom = structureGeom(key, host.massSun);
    const N = structureN(host.massSun, key);
    const nGas = Math.round(N * gasFracFor(sim, key, role, geom));   // clusters are gas-poor
    // Binding halo (uniform-density sphere) = the structure's gravitating bound mass —
    // dark matter for a galaxy, the self-bound star+DM mass for a cluster. BOTH get one
    // now: a cluster with no binding field is held only by the bare core point mass, so
    // its members fly apart in a merger (mass not conserved). The halo MASS is driven by
    // the live member sum each step (updateStructureMass), so it deepens as the structure
    // absorbs stars and lightens as it sheds them — conserving total mass across a transfer.
    const halo = { M: host.Mcore * (phys.DM_FRACTION / (1 - phys.DM_FRACTION)), R: geom.rOut * 1.8 };
    // Per-star mass quantum: the bound mass shared over the seed population, so the live
    // sum Σ b._m reproduces the halo mass and follows the members one-for-one.
    const mPer = N > 0 ? halo.M / N : 0;
    // Per-structure metadata: base star count + base mass + base halo mass and the
    // membership reach (the far backstop past which a star belongs to no structure). The
    // *_base fields are the seed values the live count scales against (frac = N/Nbase) to
    // drive the structure's visible radius, halo extent and brightness.
    const struct = {
      key, Nbase: N, massBase: host.massSun, haloBase: halo.M, mPer,
      reach: geom.rOut * 2.2,            // membership backstop (fixed; avoids strip runaway)
      rOut: geom.rOut, reachBase: geom.rOut * 2.2,
      RvisBase: geom.rOut, haloRbase: halo.R,
    };
    if (role === 'companion') { sim._halo2 = halo; sim._struct2 = struct; }
    else                      { sim._halo1 = halo; sim._struct1 = struct; }

    for (let i = 0; i < N; i++) spawnCloudParticle(sim, key, role, host, geom, halo, i < nGas, mPer);
  }

  // ── User mass-slider response (M -> N -> R/brightness) ─────
  // Changing a galaxy/cluster's mass slider should add or shed member stars (and so
  // grow / shrink its radius and brightness) rather than silently re-scaling the cores.
  // We add/remove particles toward the new target N, re-base the structure to the new
  // mass (so frac returns to 1), and let the per-step coupling refresh R/density. Stars
  // are shed from the OUTSIDE in (tidal-stripping order). Cheap, and keeps the existing
  // swarm in place (no jarring full re-seed during a drag).
  function rescaleStructureCloud(sim, role) {
    const struct = role === 'companion' ? sim._struct2 : sim._struct1;
    if (!struct) return;
    const host = resolveHost(sim, role);
    if (!host) return;
    const key = struct.key;
    const geom = structureGeom(key, host.massSun);
    const halo = role === 'companion' ? sim._halo2 : sim._halo1;
    const target = structureN(host.massSun, key);
    // New bound mass for the new slider mass, shared over the target population.
    const newHaloM = host.Mcore * (phys.DM_FRACTION / (1 - phys.DM_FRACTION));
    const mPer = target > 0 ? newHaloM / target : 0;
    // Current live members of this seed group.
    const mine = sim.bodies.filter((b) => b._cloud && b._cloudOrigin === role && b.state === 'orbit');
    let delta = target - mine.length;
    if (delta > 0) {
      const nGas = Math.round(delta * gasFracFor(sim, key, role, geom));
      for (let i = 0; i < delta; i++) spawnCloudParticle(sim, key, role, host, geom, halo, i < nGas, mPer);
    } else if (delta < 0) {
      // Strip the outermost stars first.
      mine.sort((a, b) => Math.hypot(b.x - host.hx, b.y - host.hy) - Math.hypot(a.x - host.hx, a.y - host.hy));
      const drop = new Set(mine.slice(0, -delta));
      sim.bodies = sim.bodies.filter((b) => !drop.has(b));
    }
    // Re-base to the new mass: N target is the fresh full count, mass = current host
    // mass, and the geometry (outer edge → RvisBase / reach / halo extent) follows the
    // mass–size relation so the structure's RADIUS visibly tracks its mass. The per-star
    // quantum is redistributed across the (post-edit) seed group so Σ b._m = the new
    // bound mass — a deliberate user mass change, not a conserved transfer.
    for (const b of sim.bodies) {
      if (b._cloud && b._cloudOrigin === role && b.state === 'orbit') b._m = mPer;
    }
    struct.Nbase = target;
    struct.massBase = host.massSun;
    struct.mPer = mPer;
    struct.rOut = geom.rOut;
    struct.reach = geom.rOut * 2.2; struct.reachBase = geom.rOut * 2.2;
    struct.RvisBase = geom.rOut; struct.haloRbase = geom.rOut * 1.8;
    struct.haloBase = newHaloM;
    if (halo) { halo.M = newHaloM; halo.R = geom.rOut * 1.8; }
    resetConservationBaseline(sim);   // deliberate mass edit — re-base the ledger
    recordCloudCounts(sim);
    updateStructureMass(sim);
  }

  // Re-seed whichever structures the current scene declares (used after a config
  // reload, which restores the structure choice + masses but not the swarm itself).
  function reseedStructureClouds(sim) {
    const bin = sim.binary;
    if (isCloudStruct(sim.smbhStructure)) {
      seedStructureCloud(sim, sim.smbhStructure, 'central');
    }
    if (bin && bin.enabled && isCloudStruct(bin.smbhStructure)) {
      seedStructureCloud(sim, bin.smbhStructure, 'companion');
    }
    recordCloudCounts(sim);
    updateStructureMass(sim);   // populate Rvis/density/frac so the glow shows pre-step
  }

  // ── Dynamic structure membership ──────────────────────────
  // Every cloud star carries exactly ONE tag at a time: the structure whose gravity
  // currently owns it (_cloudRole 'central' | 'companion' | null). A star outside both
  // structures' reach becomes UNTAGGED (null) but persists — it still feels every
  // structure's gravity (the integrator's smooth field applies to all bodies).
  //
  // Ownership is decided by the GRAVITATIONAL PULL each structure exerts on the star
  // (core point-mass + enclosed dark-matter halo), not by raw distance — a faint,
  // halo-less cluster does not steal stars from a massive galaxy just by drifting
  // close. The handover is HYSTERETIC IN TIME: a star only flips to the rival when the
  // rival has pulled measurably harder (by SWITCH_MARGIN) for a sustained spell
  // (SWITCH_TIME of sim-time, integrated in b._pullTimer). Brief, equal-footing
  // crossings during the cores' orbit do not re-tag it. This is the merger transfer
  // engine: as a companion sinks in, the central out-pulls its outer stars long enough
  // to claim them, so N1 grows while N2 falls toward zero.
  const SWITCH_TIME = 1.2;     // sim-time the rival must dominate before a star flips
  const SWITCH_MARGIN = 1.15;  // rival pull must exceed the owner's by this factor

  // Gravitational pull magnitude a structure exerts on a star at separation d:
  // core point mass (geometric) softened at the centre, plus its halo's enclosed-mass
  // term (KNphysics.haloAccel handles the inside/outside split). G = 1 in geometric units.
  function structurePull(Mcore, d, halo, dx, dy) {
    let g = Mcore / (d * d + 4);                       // softened core (eps^2 = 4)
    if (halo && halo.M > 0) {
      const ha = phys.haloAccel(dx, dy, halo.M, halo.R);
      g += Math.hypot(ha.ax, ha.ay);
    }
    return g;
  }

  function updateMembership(sim, dt = 0) {
    const bin = sim.binary;
    const binOn = !!(bin && bin.enabled);
    const c1x = binOn ? bin.x1 : 0, c1y = binOn ? bin.y1 : 0;
    const has1 = isCloudStruct(sim.smbhStructure);
    const has2 = binOn && isCloudStruct(bin.smbhStructure);
    const reach1 = (sim._struct1 && sim._struct1.reach) || 75;
    const reach2 = (sim._struct2 && sim._struct2.reach) || 55;
    const M1core = sim.params.M + ((sim._struct1 && sim._struct1.coreBoost) || 0);
    const M2core = (bin && bin.M2) || 0.8;
    for (const b of sim.bodies) {
      if (!b._cloud || b.state !== 'orbit') continue;
      const dx1 = b.x - c1x, dy1 = b.y - c1y;
      const dx2 = binOn ? b.x - bin.x2 : 0, dy2 = binOn ? b.y - bin.y2 : 0;
      const d1 = has1 ? Math.hypot(dx1, dy1) : Infinity;
      const d2 = has2 ? Math.hypot(dx2, dy2) : Infinity;
      const in1 = d1 < reach1, in2 = d2 < reach2;
      const cur = b._cloudRole;
      let role = cur;
      if (!in1 && !in2) {
        role = null;                                  // left every structure → untagged, persists
        b._pullTimer = 0;
      } else if (in1 !== in2) {
        role = in1 ? 'central' : 'companion';         // only one structure in range → instant
        b._pullTimer = 0;
      } else {
        // Both in range: compare the gravitational pull each structure exerts.
        const g1 = has1 ? structurePull(M1core, d1, sim._halo1, dx1, dy1) : 0;
        const g2 = has2 ? structurePull(M2core, d2, sim._halo2, dx2, dy2) : 0;
        const winner = g1 >= g2 ? 'central' : 'companion';
        if (cur == null) {
          role = winner;                              // adopt immediately if previously untagged
          b._pullTimer = 0;
        } else if (winner === cur) {
          role = cur;                                 // owner still dominates → relax the timer
          b._pullTimer = Math.max(0, (b._pullTimer || 0) - dt);
        } else {
          // Rival is ahead: only flip once it has led by the margin for SWITCH_TIME.
          const gWin = winner === 'central' ? g1 : g2;
          const gCur = cur === 'central' ? g1 : g2;
          if (gWin >= SWITCH_MARGIN * gCur) {
            b._pullTimer = (b._pullTimer || 0) + dt;
            if (b._pullTimer >= SWITCH_TIME) { role = winner; b._pullTimer = 0; }
          } else {
            b._pullTimer = Math.max(0, (b._pullTimer || 0) - dt);
          }
        }
      }
      // ── Tidal-tail / stellar-stream bookkeeping ──
      // A member that drops out of every structure's reach was tidally STRIPPED: it keeps
      // its mass quantum and keeps orbiting in the combined field, now tracing the tidal
      // tail / stellar stream (it grows a short trail in integrate; the renderer draws
      // stream stars + their arcs distinctly). A stream star a structure re-captures
      // stops streaming and its tail trail is dropped.
      if (role == null && cur != null) {
        b._stream = true; b._streamAt = sim.t;
        // ── Hypervelocity star (Hills-mechanism product) ──
        // The star was just stripped out of every reach. If it is moving faster
        // than the local escape speed of EVERYTHING still binding it (both cores
        // + halos, measured from the barycentre), the three-body slingshot that
        // launched it was a genuine dynamical ejection — tag it. Detection only:
        // the integrator already did the kicking, so nothing changes dynamically.
        if (!b._hvs) {
          const Mtot = M1core + ((sim._halo1 && sim._halo1.M) || 0)
                     + (binOn ? M2core + ((sim._halo2 && sim._halo2.M) || 0) : 0);
          const bx = binOn ? bin.cx : 0, by = binOn ? bin.cy : 0;
          const rB = Math.max(1, Math.hypot(b.x - bx, b.y - by));
          const v = Math.hypot(b.vx, b.vy);
          if (v > HVS_FAC * Math.sqrt(2 * Mtot / rB)) {
            b._hvs = true;
            if (sim.t - (sim._hvsLogT != null ? sim._hvsLogT : -9) >= 1) {
              sim._hvsLogT = sim.t;
              logEv(sim, 'amber', tr('hypervelocity star — ejected past escape speed (Hills mechanism)',
                                     '超高速星 — 以超脫離速度彈射（Hills 機制）'));
            }
          }
        }
      } else if (role != null && b._stream) {
        b._stream = false; b._hvs = false;   // recaptured — bound again, by definition not HVS
        if (b.trail) b.trail.length = 0;
      }
      b._cloudRole = role;
    }
  }

  // ── Member-mass binding + N=0 merge ───────────────────────
  // A structure's GRAVITATING bound mass is carried by its binding halo, whose mass is
  // the live sum of its member stars' quanta (sim._cloudM*, set in recordCloudCounts).
  // It is therefore conserved on a transfer (one structure +Σm, the other −Σm) and the
  // central deepens as it absorbs the companion's stars. The frozen core point masses
  // (central params.M = 1; companion bin.M2 = its SMBH) are NOT member-scaled — the
  // stellar mass would otherwise be counted twice (point core + halo).
  //
  // The same live fraction also drives the structure's VISIBLE SCALE (so a galaxy that
  // is gaining or shedding stars visibly grows / shrinks and brightens / dims):
  //   · radius   R_vis = R_base · frac^(1/3)   (virial mass–radius, R ∝ M^(1/3))
  //   · halo extent scales the same way (the dark matter tracks the luminous body)
  //   · surface density  Σ = N / (π R_vis²) ∝ N^(1/3)  — a richer structure is both
  //     bigger AND denser, the observed mass–size–density trend. Σ + frac drive the
  //     render-side brightness.
  // When the companion's members reach zero it has been fully absorbed -> merge.
  // Scale a halo's mass/extent to the live fraction and return {Rvis, density} for the
  // structure's N member stars (used to drive the render-side brightness).
  // `Mmembers` is the structure's live bound mass = Σ of its current members' quanta
  // (sim._cloudM*). The binding halo's mass is set to EXACTLY that, so it deepens as the
  // structure gains stars and lightens as it loses them, and a transfer between the two
  // structures conserves the total (one +, one −) — the user's mass-energy rule. The
  // visible radius / surface density still follow the member fraction (count vs seed).
  function structureScale(struct, frac, N, Mmembers, halo) {
    const f = Math.max(0, frac);
    const Rvis = Math.max(1, (struct.RvisBase || 1) * Math.cbrt(Math.max(1e-3, f)));
    if (halo) {
      // Live member mass PLUS anything the central BH has swallowed (struct.accreted): a star
      // eaten by a galaxy's hole leaves the member sum but its mass-energy is conserved into
      // the core, so the structure's total gravitating mass is unchanged across a swallow.
      halo.M = Math.max(0, Mmembers + (struct.accreted || 0));
      if (struct.haloRbase) halo.R = Math.max(1, struct.haloRbase * Math.cbrt(Math.max(1e-3, f)));
    }
    return { Rvis, density: f > 0 ? N / (Math.PI * Rvis * Rvis) : 0 };
  }

  function updateStructureMass(sim) {
    const bin = sim.binary;
    const binOn = !!(bin && bin.enabled);
    const has1 = isCloudStruct(sim.smbhStructure) && sim._struct1 && sim._struct1.Nbase > 0;
    const has2 = binOn && isCloudStruct(bin.smbhStructure) && sim._struct2 && sim._struct2.Nbase > 0;
    if (has1) {
      const frac = Math.max(0, sim._cloudN1 / sim._struct1.Nbase);
      const sc = structureScale(sim._struct1, frac, sim._cloudN1, sim._cloudM1, sim._halo1);
      sim._cloudFrac1 = frac; sim._Rvis1 = sc.Rvis; sim._density1 = sc.density;
    } else { sim._cloudFrac1 = 0; sim._Rvis1 = 0; sim._density1 = 0; }
    if (has2) {
      const frac = Math.max(0, sim._cloudN2 / sim._struct2.Nbase);
      // NOTE: the companion's gravitating member mass is carried ENTIRELY by its binding
      // halo (Σ member _m, conserved on transfer). The core point mass bin.M2 is the fixed
      // central SMBH and is deliberately NOT scaled by the member count here — doing both
      // would count the stellar mass twice (once in the point core the cloud feels via
      // KNphysics.acceleration, once in the halo).
      const sc = structureScale(sim._struct2, frac, sim._cloudN2, sim._cloudM2, sim._halo2);
      sim._cloudFrac2 = frac; sim._Rvis2 = sc.Rvis; sim._density2 = sc.density;
    } else { sim._cloudFrac2 = 0; sim._Rvis2 = 0; sim._density2 = 0; }

    // ── Member-loss consequences (the user's N→0 rules) ──
    // A structure that loses every member star is gone; its mass is conserved into
    // whatever survives, and the surviving primary's mass LABEL (Msun) snaps back to the
    // value it was built with (struct.massBase) instead of the inflated post-merge sum.
    //   · companion emptied (N2→0): the central absorbs it (structureMergeComplete).
    //   · primary emptied (N1→0)  : the companion SUCCEEDS as the new primary.
    //   · lone primary emptied    : nothing succeeds it — just snap M back, once.
    if (has2 && sim._cloudN2 <= 0 && !bin.merged) {
      structureMergeComplete(sim);
    } else if (has1 && sim._cloudN1 <= 0) {
      if (has2 && sim._cloudN2 > 0 && !bin.merged) structurePrimaryLost(sim);
      else if (!sim._struct1._emptied) {
        sim._struct1._emptied = true;
        if (sim._struct1.massBase) sim.params.Msun = sim._struct1.massBase;
      }
    }
  }

  // When a structure merge ends the binary, the integrator re-centres the lone survivor at
  // the origin at rest (single-BH frame: c1x = 0, no bulk velocity). Without compensation,
  // the member stars keep their old ABSOLUTE positions/velocities around the now-vanished
  // binary core and visibly leap away from it. This rigidly shifts the whole scene into the
  // survivor core's rest frame at the origin — a Galilean translation+boost, which is exact
  // physics and leaves every star's position and motion RELATIVE to the survivor unchanged.
  // Trails are shifted too so they don't smear; the camera follows because, with the binary
  // gone, the COM frame re-anchors to the (origin) primary.
  function recenterSceneToCore(sim, cx, cy, cvx, cvy) {
    for (const b of sim.bodies) {
      b.x -= cx; b.y -= cy;
      b.vx -= cvx; b.vy -= cvy;
      const tl = b.trail;
      if (tl && tl.length) for (let i = 0; i < tl.length; i += 2) { tl[i] -= cx; tl[i + 1] -= cy; }
    }
    sim.primary.x = 0; sim.primary.y = 0; sim.primary.vx = 0; sim.primary.vy = 0;
    sim.view.ox = 0; sim.view.oy = 0;          // survivor now sits at the origin
    resetConservationBaseline(sim);            // Galilean boost — re-base p/L
    recordCloudCounts(sim);                    // refresh member COMs / halo centres
  }

  // Merge-product type. A merger keeps the HIGHER structure on this ladder, mirroring real
  // assembly: two star clusters merge into a (bigger) star cluster; a cluster that falls into
  // a galaxy is absorbed and the product is a galaxy (the galaxy's SMBH + the cluster's stars).
  // Nothing demotes — you never make a cluster out of a galaxy.
  const STRUCT_RANK = { opencluster: 1, cluster: 2, galaxy: 3 };
  function mergedStructureType(a, b) {
    return (STRUCT_RANK[b] || 0) > (STRUCT_RANK[a] || 0) ? b : a;
  }

  // Re-type the surviving central structure IN PLACE (no re-seed — the merged swarm stays).
  // Becoming a galaxy lights its active nucleus (AGN disc + BZ jet); a cluster/open cluster
  // stays dark. The body panel's category selector reads sim.smbhStructure, so it switches to
  // the new type on the next render.
  function applyMergedCentralType(sim, key) {
    sim.smbhStructure = key;
    if (sim._struct1) sim._struct1.key = key;
    if (key === 'galaxy') {
      if (sim.disc) sim.disc.enabled = true;
      if (!(sim.params.B > 0.4)) sim.params.B = 0.6;
      if (Math.abs(sim.params.a) < 0.5) sim.params.a = 0.9 * (Math.sign(sim.params.a) || 1);
    } else if (sim.disc) {
      sim.disc.enabled = false;
    }
  }

  // The companion structure has lost all its member stars to the central — the merger
  // is complete. End the binary; its (already re-tagged) stars stay with the central, and
  // the surviving central's mass label snaps back to the value it was built with.
  function structureMergeComplete(sim) {
    const bin = sim.binary;
    if (!bin) return;
    bin.merged = true;
    bin.mergerFlash = 0;   // structure mergers are quiet — the survivor grows, no flash
    // Shift into the surviving central core's rest frame BEFORE the binary turns off, so the
    // members do not jump when the integrator re-centres the lone survivor at the origin.
    recenterSceneToCore(sim, bin.x1, bin.y1, bin.vx1 || 0, bin.vy1 || 0);
    bin.enabled = false;
    // The product takes the higher of the two structure types (cluster+cluster→cluster;
    // cluster+galaxy→galaxy). Re-type the survivor in place (no re-seed) so the merged swarm
    // is kept and the UI category selector follows.
    const product = mergedStructureType(sim.smbhStructure, bin.smbhStructure);
    // Elliptical-forming channel — both progenitors are galaxies (checked here,
    // before the survivor is re-typed).
    const galaxyPair = sim.smbhStructure === 'galaxy' && bin.smbhStructure === 'galaxy';
    // Conserve any mass each core has already swallowed: the companion's banked accretion
    // carries over to the surviving central.
    if (sim._struct1 && sim._struct2) {
      sim._struct1.accreted = (sim._struct1.accreted || 0) + (sim._struct2.accreted || 0);
      sim._struct1.accretedN = (sim._struct1.accretedN || 0) + (sim._struct2.accretedN || 0);
    }
    // The companion's members are already re-tagged to the central, so their mass is in
    // sim._cloudM1 (and the central halo) — the remnant keeps the full combined bound
    // mass. Only the now-empty companion bookkeeping is cleared.
    // The companion's CORE point mass would otherwise vanish from the swarm's field the
    // moment the binary turns off — bank it on the survivor (field continuity, same as
    // the coalescence path; geometric units unchanged since the primary keeps its M).
    if (sim._struct1) sim._struct1.coreBoost = (sim._struct1.coreBoost || 0) + (bin.M2 || 0);
    sim._halo2 = null; sim._struct2 = null; sim._cloudN2 = 0; sim._cloudM2 = 0;
    if (product !== sim.smbhStructure) applyMergedCentralType(sim, product);
    // Reset the central's displayed mass to its seed value (the user's "M reverts to the
    // value originally set" rule). The geometric core (params.M = 1) is unchanged.
    if (sim._struct1 && sim._struct1.massBase) sim.params.Msun = sim._struct1.massBase;
    // Re-base the conservation ledger AFTER the binary is gone: the absorbed companion's
    // core point mass leaves the books here (it merges into the survivor — a discrete
    // model event, not a leak), so the baseline must be recaptured from the post-merger
    // scene. (recenterSceneToCore above reset it too, but while the binary was still on.)
    resetConservationBaseline(sim);
    recordCloudCounts(sim);
    logEv(sim, 'good', tr('structure merger complete — companion absorbed into the central',
                          '結構合併完成 — 伴星系/星團已併入主體'));
    if (galaxyPair) beginEllipticalRelaxation(sim);
  }

  // The PRIMARY (central) structure has lost all its member stars to a more massive
  // companion — the companion succeeds it as the new central body. Promote the companion's
  // parameters into the central slot, re-home its surviving swarm + binding halo to the
  // central role, and reset the new primary's mass label to the value it was built with.
  function structurePrimaryLost(sim) {
    const bin = sim.binary;
    if (!bin) return;
    const newKey = bin.smbhStructure;
    // Product type takes the higher of the two (cluster+galaxy→galaxy), regardless of which
    // core emptied; conserve the depleted central's banked accretion into the survivor.
    const product = mergedStructureType(sim.smbhStructure, newKey);
    // Elliptical-forming channel — both progenitors are galaxies.
    const galaxyPair = sim.smbhStructure === 'galaxy' && newKey === 'galaxy';
    const struct2 = sim._struct2, halo2 = sim._halo2;
    if (struct2 && sim._struct1) {
      struct2.accreted = (struct2.accreted || 0) + (sim._struct1.accreted || 0);
      struct2.accretedN = (struct2.accretedN || 0) + (sim._struct1.accretedN || 0);
    }
    // The depleted central's CORE (frozen unit + any banked merger mass) would vanish
    // from the swarm's field on promotion — bank it on the survivor for field
    // continuity. Promotion renormalises the geometric unit to the companion's Msun,
    // so the old core mass is converted by the solar-mass ratio first.
    if (struct2) {
      const oldCore = (sim.params.M || 1) + ((sim._struct1 && sim._struct1.coreBoost) || 0);
      const unitRatio = (sim.params.Msun || 1) / Math.max(1e-9, bin.M2sun || sim.params.Msun || 1);
      struct2.coreBoost = (struct2.coreBoost || 0) + oldCore * unitRatio;
    }
    const keepScale = sim.view.scale;             // keep the swarm framed across promotion
    promoteCompanionToCentral(sim, bin);          // copy the companion's full param set up
    sim.view.scale = keepScale;
    // Re-tag every one of the companion's surviving members to the central role/origin so
    // they keep orbiting the (now promoted) primary and a later clear wipes them.
    for (const b of sim.bodies) {
      if (b._cloud && (b._cloudRole === 'companion' || b._cloudOrigin === 'companion')) {
        b._cloudRole = 'central'; b._cloudOrigin = 'central';
      }
    }
    sim._halo1 = halo2; sim._struct1 = struct2;
    sim._halo2 = null; sim._struct2 = null; sim._cloudN2 = 0; sim._cloudM2 = 0;
    // Type the new central to the product and light its AGN if it is (now) a galaxy. The UI
    // category selector reads sim.smbhStructure and follows on the next render.
    applyMergedCentralType(sim, product);
    if (sim.disc2) sim.disc2.enabled = false;
    // Snap the new primary's mass label back to its seed value (the "M reverts" rule).
    if (struct2 && struct2.massBase) sim.params.Msun = struct2.massBase;
    // Shift into the surviving companion core's rest frame at the origin before the binary
    // turns off, so its members do not jump as it becomes the lone central body.
    recenterSceneToCore(sim, bin.x2, bin.y2, bin.vx2 || 0, bin.vy2 || 0);
    bin.merged = true; bin.mergerFlash = 0; bin.enabled = false;   // quiet structure merger
    // Re-base the ledger from the post-succession scene (the depleted primary's core has
    // merged away and the survivor was renormalised to geometric M = 1 — a unit change).
    resetConservationBaseline(sim);
    recordCloudCounts(sim);
    logEv(sim, 'good', tr('primary depleted — companion succeeds as the new central',
                          '主星耗盡 — 伴星接替成為新的主體'));
    if (galaxyPair) beginEllipticalRelaxation(sim);
  }

  // Back-compat alias (older call sites). A nuclear star cluster is the cluster cloud.
  function seedNuclearCluster(sim) { seedStructureCloud(sim, 'cluster', 'central'); }

  // Apply a supermassive-scale structure (see KNphysics.SMBH_STRUCTURES). They differ
  // in internal make-up (which drives how they merge):
  //   · galaxy  — central SMBH + gas + dark-matter halo; its active nucleus (AGN /
  //               quasar) lights the disc + BZ jet. Selecting a galaxy lights the AGN
  //               by default (the disc being enabled IS the active-nucleus state).
  //   · cluster — a self-bound star swarm with no central SMBH and no gas.
  //   · smbh    — the quiescent bare hole.
  // ── User disc preference (remembered across body re-sets) ──
  // The user's explicit accretion-disc on/off choice per role, recorded by the
  // panel toggles and presets through here. Structure re-sets (applySMBHStructure,
  // clearStructure) consult the preference instead of forcing their own defaults,
  // so re-picking a body type never silently undoes a deliberate toggle.
  // Preference null = never touched → the structure's default applies. (Star
  // swarms still force the disc off — no central BH, nothing to accrete onto —
  // but the preference survives for the next disc-bearing body.)
  function setDiscEnabled(sim, role, on) {
    if (role === 'companion') {
      if (sim.disc2) sim.disc2.enabled = !!on;
      if (sim.binary) sim.binary.discPref2 = !!on;
    } else {
      if (sim.disc) sim.disc.enabled = !!on;
      sim.params.discPref = !!on;
    }
  }

  // role 'companion' targets the binary secondary (its own disc/jet on sim.disc2).
  function applySMBHStructure(sim, key, role = 'central') {
    if (role === 'companion') {
      const bin = sim.binary;
      if (!bin) return key;
      bin.type = 'bh';
      bin.smbhStructure = key;
      if (key === 'galaxy') {
        // AGN defaults to ON, but a remembered user toggle wins; the B/a nudges
        // (jet visibility defaults) never override a slider the user has touched.
        if (sim.disc2) sim.disc2.enabled = bin.discPref2 != null ? bin.discPref2 : true;
        if (!(bin.B2 > 0.4) && !bin._B2User) bin.B2 = 0.6;          // power a BZ jet
        if (Math.abs(bin.a2) < 0.5 * bin.M2 && !bin._a2User) bin.a2 = 0.9 * bin.M2 * (Math.sign(bin.a2) || 1);
        seedStructureCloud(sim, 'galaxy', 'companion');
        logEv(sim, 'warn', tr('Companion galaxy — active nucleus (AGN): accretion disc + jet',
                              '伴星系 — 活躍星系核(AGN):吸積盤 + 噴流'));
      } else if (key === 'cluster') {
        if (sim.disc2) sim.disc2.enabled = false;
        seedStructureCloud(sim, 'cluster', 'companion');
        logEv(sim, 'good', tr('Companion star cluster — self-bound star swarm (no central SMBH)',
                              '伴星團 — 自身束縛的恆星群(無中央黑洞)'));
      } else if (key === 'opencluster') {
        if (sim.disc2) sim.disc2.enabled = false;
        seedStructureCloud(sim, 'opencluster', 'companion');
        logEv(sim, 'good', tr('Companion open cluster — loose self-bound star swarm',
                              '伴疏散星團 — 鬆散的自束縛恆星群'));
      } else {
        // A bare hole CAN carry a disc — honor the remembered toggle (default off).
        if (sim.disc2) sim.disc2.enabled = bin.discPref2 != null ? bin.discPref2 : false;
        clearStructureCloud(sim, 'companion'); sim._halo2 = null;
        logEv(sim, 'good', tr('Quiescent supermassive companion', '寧靜的超大質量伴星'));
      }
      recordCloudCounts(sim);
      updateStructureMass(sim);   // populate Rvis/density/frac so the glow shows pre-step
      return key;
    }
    sim.params.type = 'bh';
    sim.smbhStructure = key;
    if (key === 'galaxy') {
      // AGN defaults to ON, but a remembered user toggle wins; the B/a nudges
      // (jet visibility defaults) never override a slider the user has touched.
      if (sim.disc) sim.disc.enabled = sim.params.discPref != null ? sim.params.discPref : true;
      if (!(sim.params.B > 0.4) && !sim.params._BUser) sim.params.B = 0.6;   // power a BZ jet
      if (Math.abs(sim.params.a) < 0.5 && !sim.params._aUser) sim.params.a = 0.9 * (Math.sign(sim.params.a) || 1);
      seedStructureCloud(sim, 'galaxy', 'central');
      logEv(sim, 'warn', tr('Galaxy — active nucleus (AGN): accretion disc + jet',
                            '星系 — 活躍星系核(AGN):吸積盤 + 噴流'));
    } else if (key === 'cluster') {
      if (sim.disc) sim.disc.enabled = false;   // star swarm — no central BH to accrete onto
      seedStructureCloud(sim, 'cluster', 'central');
      logEv(sim, 'good', tr('Star cluster — self-bound star swarm (no central SMBH)',
                            '星團 — 自身束縛的恆星群(無中央黑洞)'));
    } else if (key === 'opencluster') {
      if (sim.disc) sim.disc.enabled = false;
      seedStructureCloud(sim, 'opencluster', 'central');
      logEv(sim, 'good', tr('Open cluster — loose self-bound star swarm',
                            '疏散星團 — 鬆散的自束縛恆星群'));
    } else {
      // A bare hole CAN carry a disc — honor the remembered toggle (default off).
      if (sim.disc) sim.disc.enabled = sim.params.discPref != null ? sim.params.discPref : false;
      clearStructureCloud(sim, 'central'); sim._halo1 = null;
      logEv(sim, 'good', tr('Quiescent supermassive black hole', '寧靜的超大質量黑洞'));
    }
    recordCloudCounts(sim);
    updateStructureMass(sim);   // populate Rvis/density/frac so the glow shows pre-step
    return key;
  }

  // Tear down a role's structure swarm and return it to a plain (non-cloud) body. Used by
  // the intermediate-scale UI when the user leaves the open-cluster tab for a stellar
  // stage — the open cluster is a structure, not an evolutionary stage, so its swarm must
  // be removed before the body becomes a single star/remnant. Silent (no event log).
  function clearStructure(sim, role = 'central') {
    clearStructureCloud(sim, role);
    if (role === 'companion') {
      if (sim.binary) sim.binary.smbhStructure = 'smbh';
      // Restore the remembered disc toggle (default off) — leaving a swarm for a
      // disc-bearing body should bring the user's disc state back, not erase it.
      if (sim.disc2) sim.disc2.enabled = sim.binary && sim.binary.discPref2 != null ? sim.binary.discPref2 : false;
      sim._cloudN2 = 0; sim._cloudM2 = 0;
    } else {
      sim.smbhStructure = 'smbh';
      if (sim.disc) sim.disc.enabled = sim.params.discPref != null ? sim.params.discPref : false;
      sim._cloudN1 = 0; sim._cloudM1 = 0;
    }
    recordCloudCounts(sim);
    updateStructureMass(sim);
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

    // Exchange physical mass + evolutionary stage + surface/driver fields, plus the
    // per-body user preferences (disc toggle memory, user-touched B/a flags, gas
    // fraction) — they describe the BODY, so they follow it across the swap.
    const t = {
      Msun: p.Msun, type: p.type, R_star: p.R_star, T_eff: p.T_eff,
      age: p.age, Z: p.Z, cepheid: p.cepheid, cepheidAmp: p.cepheidAmp,
      B: p.B, _stellarTouched: p._stellarTouched,
      discPref: p.discPref, _BUser: p._BUser, _aUser: p._aUser, gasFrac: p.gasFrac,
    };
    p.Msun = bin.M2sun; p.type = bin.type; p.R_star = bin.R_star2; p.T_eff = bin.T_eff2;
    p.age = bin.age2; p.Z = bin.Z2; p.cepheid = bin.cepheid; p.cepheidAmp = bin.cepheidAmp;
    p.B = bin.B2; p._stellarTouched = bin._stellarTouched;
    p.discPref = bin.discPref2; p._BUser = bin._B2User; p._aUser = bin._a2User; p.gasFrac = bin.gasFrac2;
    bin.M2sun = t.Msun; bin.type = t.type; bin.R_star2 = t.R_star; bin.T_eff2 = t.T_eff;
    bin.age2 = t.age; bin.Z2 = t.Z; bin.cepheid = t.cepheid; bin.cepheidAmp = t.cepheidAmp;
    bin.B2 = t.B; bin._stellarTouched = t._stellarTouched;
    bin.discPref2 = t.discPref; bin._B2User = t._BUser; bin._a2User = t._aUser; bin.gasFrac2 = t.gasFrac;

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

    // Each accretion disc follows its body, so an active galaxy that becomes the
    // companion keeps its disc/jet (sim.disc is the primary's, sim.disc2 the companion's).
    if (sim.disc && sim.disc2) { const d = sim.disc; sim.disc = sim.disc2; sim.disc2 = d; }
    // The new central's structure: an enabled disc means an active galactic nucleus;
    // otherwise keep a non-AGN star swarm (cluster / open cluster stay themselves, else
    // a bare hole).
    sim.smbhStructure = (sim.disc && sim.disc.enabled)
      ? 'galaxy'
      : (isStarSwarm(sim.smbhStructure) ? sim.smbhStructure : 'smbh');

    // The donor/accretor indices are now inverted — re-evaluate transfer cleanly.
    resetMassTransfer(bin);
    resetConservationBaseline(sim);   // geometric renormalisation rescales velocities
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
                   setBHRegime, cycleBHRegime, applySMBHStructure, clearStructure, swapCentralCompanion, setDiscEnabled,
                   reseedStructureClouds, rescaleStructureCloud, setGasFraction,
                   fitView, worldToScreen, worldToScreenInto, screenToWorld,
                   predictTrajectory, predictBinaryTrajectory, predictGeodesicTrajectory };
})();
