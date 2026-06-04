/* Kerr-Newman Black Hole physics — geometric units (G = c = 1)
 * Mass M, charge Q (|Q| <= M), spin a = J/M (|a| <= M for sub-extremal)
 * Outer horizon r+ = M + sqrt(M^2 - a^2 - Q^2)
 * Static limit (ergosphere outer) on equator: r_erg = M + sqrt(M^2 - Q^2)
 * Photon sphere (Schwarzschild approx) r_ph = 1.5 r_s ; ISCO ≈ 3 r_s for Schwarzschild.
 *
 * This file exports KNphysics on window. The simulation uses simplified Newtonian
 * gravity with relativistic *augmentations* for visual fidelity:
 *  - Frame dragging: tangential acceleration ~ 2 a M / r^3  (Lense-Thirring scaled)
 *  - Electromagnetic: Coulomb force on charged probes
 *  - Tidal stress on extended bodies: ~ 2 G M R_body / r^3
 */

(function () {
  const G = 1;          // geometric units
  const c = 1;
  const r_s = (M) => 2 * M;

  function horizons(M, Q, a) {
    const disc = M * M - a * a - Q * Q;
    if (disc < 0) return { rplus: NaN, rminus: NaN, naked: true };
    const root = Math.sqrt(disc);
    return { rplus: M + root, rminus: M - root, naked: false };
  }

  function ergosphereEq(M, Q) {
    // equator, theta = pi/2; cos = 0
    const disc = M * M - Q * Q;
    return disc < 0 ? NaN : M + Math.sqrt(disc);
  }

  function ergospherePole(M, Q, a) {
    // poles, cos^2 theta = 1
    const disc = M * M - a * a - Q * Q;
    return disc < 0 ? NaN : M + Math.sqrt(disc);
  }

  function iscoKerr(M, a) {
    // Bardeen-Press-Teukolsky for prograde Kerr; analytic (charge-ignoring).
    const aN = a / M;
    const Z1 = 1 + Math.cbrt(1 - aN * aN) * (Math.cbrt(1 + aN) + Math.cbrt(1 - aN));
    const Z2 = Math.sqrt(3 * aN * aN + Z1 * Z1);
    const r_isco_M = 3 + Z2 - Math.sign(aN) * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
    return r_isco_M * M;
  }

  // Prograde ISCO radius. Delegates to the full-physics facade for the EXACT
  // Kerr-Newman value (charge-aware) when the optional Q is supplied and the bridge
  // (window.KNFull) has loaded; otherwise falls back to the charge-ignoring Kerr
  // analytic above. Q defaults to 0 so existing callers are unchanged.
  function isco(M, a, Q = 0) {
    const F = window.KNFull;
    if (F && F.geometryScalars && Math.abs(Q) > 1e-9) {
      const r = F.geometryScalars({ M, Q, a }).iscoPrograde;
      if (Number.isFinite(r)) return r;
    }
    return iscoKerr(M, a);
  }

  function photonSphereKerr(M, a) {
    // prograde equatorial photon orbit: r_ph = 2M{1 + cos[(2/3)arccos(-|a|/M)]}
    const aN = Math.min(0.99999, Math.abs(a) / M);
    return 2 * M * (1 + Math.cos((2 / 3) * Math.acos(-aN)));
  }

  // Prograde equatorial photon-orbit radius. Delegates to the facade for the exact
  // Kerr-Newman value when Q is supplied and the bridge is loaded; else the Kerr
  // analytic. Q defaults to 0 so existing callers are unchanged.
  function photonSphereEq(M, a, Q = 0) {
    const F = window.KNFull;
    if (F && F.geometryScalars && Math.abs(Q) > 1e-9) {
      const r = F.geometryScalars({ M, Q, a }).photonPrograde;
      if (Number.isFinite(r)) return r;
    }
    return photonSphereKerr(M, a);
  }

  function classify(M, Q, a, type) {
    const eps = 1e-6;
    const aN = a / M;
    const qN = Q / M;
    const k = aN * aN + qN * qN;

    // Non-BH stellar types — user-selected.
    if (type && type !== 'bh') {
      const info = STELLAR_INFO[type];
      if (info) return { ...info, family: type, warn: false };
    }

    if (k > 1 + eps) {
      return {
        name: tr('NAKED SINGULARITY', '裸奇異點'),
        family: 'kerr-newman',
        warn: true,
        desc: tr('Cosmic censorship breaks down — a² + Q² > M², the event horizon vanishes.',
                 '宇宙審查假設崩壞 — a² + Q² > M²，事件視界消失。'),
        pill: tr('UNSHIELDED', '無遮蔽')
      };
    }
    const spinning = Math.abs(aN) > 0.01;
    const charged = Math.abs(qN) > 0.01;
    if (!spinning && !charged) {
      return { name: 'Schwarzschild', family: 'schwarzschild', warn: false,
        desc: tr('Spherically symmetric, static, uncharged. The simplest vacuum solution.',
                 '球對稱、靜止、不帶電。最簡單的真空解。'), pill: tr('STATIC', '靜止') };
    }
    if (spinning && !charged) {
      return { name: 'Kerr', family: 'kerr', warn: false,
        desc: tr('Spin forms the ergosphere and inner/outer horizons. Frame dragging dominates nearby geodesics.',
                 '自旋形成動圈與內外視界。frame dragging 主導附近的測地線。'), pill: tr('ROTATING', '自旋') };
    }
    if (!spinning && charged) {
      return { name: 'Reissner-Nordström', family: 'rn', warn: false,
        desc: tr('Charged, non-spinning. The electric field repels like-charged test particles.',
                 '帶電、不自旋。電場排斥同號電荷的測試粒子。'), pill: tr('CHARGED', '帶電') };
    }
    return { name: 'Kerr-Newman', family: 'kn', warn: false,
      desc: tr('The most general stationary solution: charged and spinning. Has an ergosphere and electromagnetic coupling.',
               '帶電且自旋的最一般穩態解。具備動圈與電磁交互作用。'), pill: tr('FULL', '完整') };
  }

  // Stellar-type metadata used when the central body is not a black hole.
  // Getters so name/pill/desc re-resolve against the live language. classify
  // spreads these objects ({ ...info }) at call time, snapshotting the current
  // language for that render.
  const STELLAR_INFO = {
    ns: { get name() { return tr('Neutron Star', '中子星'); },
          get pill() { return tr('DEGENERATE', '簡併'); },
          get desc() { return tr('Ultra-compact remnant held up by neutron degeneracy pressure. Radius ≈ 3 M; spin and magnetic field drive the electromagnetic phenomena.',
                                 '中子簡併壓支撐的極緻密殘骸。半徑 ≈ 3 M，自旋與磁場主導電磁相位現象。'); } },
    wd: { get name() { return tr('White Dwarf', '白矮星'); },
          get pill() { return tr('COMPACT', '緻密'); },
          get desc() { return tr('Held up by electron degeneracy pressure. Radius ≈ 7 M (compressed for display); no event horizon, but still perturbed by tidal forces.',
                                 '電子簡併壓支撐。半徑 ≈ 7 M（壓縮可視化）；無事件視界但仍可被潮汐力擾動。'); } },
    ms: { get name() { return tr('Main-Sequence Star', '主序星'); },
          get pill() { return tr('H FUSION', '氫融合'); },
          get desc() { return tr('Core hydrogen fusion (proton-proton chain or CNO cycle). Large radius, r_s buried deep inside; spacetime is nearly Newtonian. Exhausting its core hydrogen turns it into a giant.',
                                 '核心氫融合（質子-質子鏈或 CNO 循環）。半徑大，r_s 遠遠埋在內部，時空近於牛頓。核心氫耗盡後將膨脹為巨星。'); } },
    giant: { get name() { return tr('Giant', '巨星'); },
          get pill() { return tr('HEAVY FUSION', '重元素融合'); },
          get desc() { return tr('Post-main-sequence star fusing helium and heavier elements in shells around a contracting core. Hugely swollen, low-density envelope; sheds mass before collapsing into a remnant.',
                                 '主序後的恆星，在收縮核心外的殼層融合氦與更重的元素。外殼極度膨脹、密度低；在塌縮為殘骸前會拋失質量。'); } },
  };

  // Default stellar radii (geometric units, M) and surface temperatures (K).
  const STELLAR_DEFAULTS = {
    ns: { R: 3.0,  T: 1.0e6 },   // very hot, X-ray
    wd: { R: 7.0,  T: 1.2e4 },   // hot but optical
    ms: { R: 18.0, T: 5800 },    // sun-like
    giant:{R: 24.0, T: 3400 },   // swollen, cool red giant
  };

  // ── Stellar-evolution classification (solar masses) ──────────────────
  // The displayed mass M⊙ is a *physical label*, decoupled from the geometric
  // length scale (which is always 1 — geometry is drawn in units of M). It sorts
  // a central body into one of three evolutionary stages and, for a collapsed
  // remnant, picks the remnant flavour purely from its mass.
  const M_CHANDRASEKHAR = 1.4;   // M⊙ — electron-degeneracy (white dwarf) ceiling
  const M_TOV           = 3.0;   // M⊙ — neutron-degeneracy (TOV) ceiling → black hole

  // Per-stage solar-mass slider ranges (min, max) and a sensible default.
  const MASS_RANGES = {
    star:    { min: 0.08, max: 150, def: 1.0  },  // hydrogen-fusing main sequence
    giant:   { min: 0.5,  max: 50,  def: 5.0  },  // heavy-element fusion
    remnant: { min: 0.1,  max: 150, def: 1.0  },  // collapsed: WD / NS / BH by mass
  };

  // The stages differ enormously in physical size (units of M): a giant photosphere
  // is R ~ 24, a main-sequence star R ~ 18, but a remnant is compact (BH r+ ~ 1-2,
  // NS R ~ 3, WD R ~ 7). Each stage therefore gets its own default camera zoom
  // (view.scale, px per unit M) so the body is framed instead of overflowing or
  // shrinking to a dot. The UI remembers the user's per-stage zoom on top of this.
  const VIEW_SCALES = { star: 9, giant: 6, remnant: 18 };

  // Which evolutionary stage a concrete type belongs to.
  function uiCategory(type) {
    if (type === 'ms') return 'star';
    if (type === 'giant') return 'giant';
    return 'remnant';            // wd | ns | bh
  }

  // The collapsed-remnant flavour implied by a solar mass.
  function remnantType(Msun) {
    if (!(Msun > 0)) return 'wd';
    if (Msun < M_CHANDRASEKHAR) return 'wd';
    if (Msun < M_TOV)           return 'ns';
    return 'bh';
  }

  // Resolve the concrete central-body type for a stage + solar mass. For the
  // remnant stage the flavour follows the mass; the other stages map directly.
  function typeForStage(category, Msun) {
    if (category === 'star') return 'ms';
    if (category === 'giant') return 'giant';
    return remnantType(Msun);
  }

  // ── Main-sequence & giant structure model (solar units) ──────────────
  // Everything keys off the displayed solar mass M⊙. Empirical ZAMS power laws
  // give luminosity and radius; the effective temperature then follows from
  // Stefan-Boltzmann (L = 4π R² σ T⁴), and tempToColor turns T into the rendered
  // surface colour. So for a main-sequence star the radius, luminosity, effective
  // temperature AND colour are ALL functions of M — and, through slow evolution,
  // of its fractional main-sequence age. These are derived, not free knobs.
  const T_SUN = 5772;             // K  — solar effective temperature
  const MS_LIFETIME_SUN = 1.0e10; // yr — nuclear timescale of the Sun on the MS

  // Mass–luminosity relation, L in L⊙ (piecewise power law).
  function msLuminosity(Msun) {
    const M = Math.max(0.05, Msun);
    if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
    if (M < 2)    return Math.pow(M, 4);
    if (M < 55)   return 1.4 * Math.pow(M, 3.5);
    return 32000 * M;
  }

  // Mass–radius relation, R in R⊙ (ZAMS, two-branch power law).
  function msRadius(Msun) {
    const M = Math.max(0.05, Msun);
    return M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57);
  }

  // Hydrogen-burning (main-sequence) lifetime in years: t ≈ t_sun · M / L.
  // The upper limit on a star's main-sequence life is therefore set by its mass
  // alone (massive stars burn out fast; red dwarfs outlive the universe).
  function msLifetime(Msun) {
    const M = Math.max(0.05, Msun);
    return MS_LIFETIME_SUN * (M / msLuminosity(M));
  }

  // Effective temperature from Stefan-Boltzmann, given L and R in solar units.
  function effTemp(Lsun, Rsun) {
    return T_SUN * Math.pow(Lsun / (Rsun * Rsun), 0.25);
  }

  // Map a physical photosphere radius (R⊙) to the geometric display radius
  // (units of M). Compressed power law + clamp so dwarfs stay visible and
  // supergiants do not overflow the frame; the read-out still shows true R⊙.
  function geomRadius(Rsun, anchor, power, lo, hi) {
    return Math.max(lo, Math.min(hi, anchor * Math.pow(Math.max(1e-3, Rsun), power)));
  }

  // Full main-sequence state. `age` ∈ [0,1] is the fraction of the star's
  // main-sequence lifetime elapsed; as it ages the star brightens (~+90%) and
  // swells (~+50%), and Stefan-Boltzmann cools the larger photosphere.
  function mainSequenceState(Msun, age = 0) {
    const f = Math.max(0, Math.min(1, age));
    const L = msLuminosity(Msun) * (1 + 0.9 * f);
    const R_solar = msRadius(Msun) * (1 + 0.5 * f);
    const T_eff = effTemp(L, R_solar);
    return { L, R_solar, T_eff, lifetime: msLifetime(Msun),
             R_star: geomRadius(R_solar, 18, 0.55, 6, 40) };
  }

  // Giant state. Beyond mass, a heavy-element (metallicity) knob Z ∈ [0,1]
  // (0.5 ≈ solar) raises envelope opacity: metal-rich → cooler, more swollen,
  // redder; metal-poor → hotter, more compact, bluer (Population II giants).
  function giantState(Msun, Z = 0.5) {
    const M = Math.max(0.1, Msun);
    const z = Math.max(0, Math.min(1, Z));
    const L = 60 * Math.pow(M, 1.5);
    const T_eff = 4800 - 1600 * z;             // K — metal-rich cools the envelope
    const R_solar = Math.sqrt(L) / Math.pow(T_eff / T_SUN, 2);
    return { L, R_solar, T_eff, R_star: geomRadius(R_solar, 7.2, 0.4, 12, 40) };
  }

  // White-dwarf state. Electron degeneracy gives an INVERSE mass-radius relation:
  // R ∝ M^(-1/3)·√(1−(M/M_Ch)^(4/3)), shrinking to zero as the mass approaches the
  // Chandrasekhar limit. Rotation (spin) adds centrifugal support → a larger star;
  // a denser (heavier) or strongly magnetic white dwarf runs hotter. So R and T are
  // both consequences of M plus the spin / magnetic-field knobs — not free.
  function whiteDwarfState(Msun, opts = {}) {
    const Mch = M_CHANDRASEKHAR;
    const M = Math.max(0.15, Math.min(Mch * 0.99, Msun));
    const a = Math.abs(opts.a || 0);
    const B = Math.max(0, opts.B || 0);
    const x = M / Mch;
    const compact = Math.pow(0.6 / M, 1 / 3) * Math.sqrt(Math.max(0.015, 1 - Math.pow(x, 4 / 3)));
    const support = 1 + 0.12 * a;                       // spin centrifugal support
    const R_solar = 0.0126 * compact * support;         // ~ Earth-sized
    const R_star = Math.max(1.8, Math.min(11, 8.5 * compact * support));
    const T_eff = 9000 * Math.pow(M / 0.6, 0.55) * (1 + 0.6 * B);
    const L = R_solar * R_solar * Math.pow(T_eff / T_SUN, 4);
    return { L, R_solar, T_eff, R_star, MoverMch: x };
  }

  // Neutron-star state. The stiff nuclear equation of state pins the radius near
  // 10–12 km almost independently of mass (it shrinks slightly toward the TOV
  // limit); rotation flattens and enlarges the equatorial radius. The surface runs
  // ~0.7 MK for a quiet pulsar, but a strong magnetic field (a magnetar) heats the
  // crust to several MK and a young fast rotator is hotter still — so the magnetic
  // field and spin set the temperature.
  function neutronStarState(Msun, opts = {}) {
    const M = Math.max(M_CHANDRASEKHAR, Math.min(M_TOV, Msun));
    const a = Math.abs(opts.a || 0);
    const B = Math.max(0, opts.B || 0);
    const R_star = Math.max(2.4, Math.min(4.2, 3.2 * Math.pow(M_TOV / M, 0.05) * (1 + 0.18 * a)));
    const T_eff = 0.7e6 * (1 + 4.5 * B) * (1 + 0.25 * a);
    const Rkm = 12 * (R_star / 3.2);                     // rough physical radius (km)
    const R_solar = Rkm / 6.957e5;                       // R⊙ (tiny; for L only)
    const L = R_solar * R_solar * Math.pow(T_eff / T_SUN, 4);
    return { L, R_solar, T_eff, R_star, Rkm };
  }

  // Derived photosphere (geometric R★ + T★, plus L/R⊙ read-outs) for any stellar
  // stage. Returns null only for a black hole, which has no surface. The optional
  // knobs are stage-specific: age (ms), metallicity Z (giant), spin a + magnetic
  // field B (wd/ns). R and T are therefore never independent variables.
  function deriveStellar(type, Msun, opts = {}) {
    if (type === 'ms')    return mainSequenceState(Msun, opts.age != null ? opts.age : 0);
    if (type === 'giant') return giantState(Msun, opts.Z != null ? opts.Z : 0.5);
    if (type === 'wd')    return whiteDwarfState(Msun, opts);
    if (type === 'ns')    return neutronStarState(Msun, opts);
    return null;
  }

  // Will the configuration **physically** collapse into a BH?
  // Returns true when user-set surface radius is at or below r₊ (or r_s if no horizon).
  function wouldCollapse(M, Q, a, R_star) {
    const { rplus, naked } = horizons(M, Q, a);
    const rcrit = naked ? 2 * M : rplus;
    return R_star <= rcrit * 1.001;
  }

  // Acceleration on a test body at (px, py).
  // Single-BH mode: primary at sim.primary.(x,y) with mass M, charge Q, spin a.
  // Binary mode (binary && binary.enabled): primary at (binary.x1,binary.y1)
  // with (M, Q, a); secondary at (binary.x2,binary.y2) with (M2, Q2, a2).
  function acceleration(px, py, vx, vy, M, Q, a, bodyCharge = 0, binary = null) {
    // ── Binary path ───────────────────────────────────────
    if (binary && binary.enabled) {
      const M1 = M, M2 = binary.M2;
      const Q2 = binary.Q2 || 0;
      const a2 = binary.a2 || 0;
      let ax = 0, ay = 0;

      const d1x = px - binary.x1, d1y = py - binary.y1;
      const r1sq = d1x * d1x + d1y * d1y;
      const r1 = Math.sqrt(r1sq);
      if (r1 > 1e-6) {
        const inv1 = 1 / (r1 * r1sq);
        ax += -G * M1 * d1x * inv1;
        ay += -G * M1 * d1y * inv1;
        // Frame dragging on primary (gravitomagnetic, perpendicular to v → no work)
        if (Math.abs(a) > 1e-6) {
          const Bg = (2 * a * M1) / (r1 * r1sq);
          ax += Bg * vy;
          ay += -Bg * vx;
        }
        // Coulomb on charged probe from primary (0.5 = visual-coupling scale, see
        // single-BH path below)
        if (Math.abs(Q) > 1e-6 && Math.abs(bodyCharge) > 1e-6) {
          const coul = (Q * bodyCharge) * inv1 * 0.5;
          ax += coul * d1x;
          ay += coul * d1y;
        }
      }
      const d2x = px - binary.x2, d2y = py - binary.y2;
      const r2sq = d2x * d2x + d2y * d2y;
      const r2 = Math.sqrt(r2sq);
      if (r2 > 1e-6) {
        const inv2 = 1 / (r2 * r2sq);
        ax += -G * M2 * d2x * inv2;
        ay += -G * M2 * d2y * inv2;
        // Frame dragging from companion (gravitomagnetic, perpendicular to v → no work)
        if (Math.abs(a2) > 1e-6) {
          const Bg2 = (2 * a2 * M2) / (r2 * r2sq);
          ax += Bg2 * vy;
          ay += -Bg2 * vx;
        }
        // Coulomb from companion charge
        if (Math.abs(Q2) > 1e-6 && Math.abs(bodyCharge) > 1e-6) {
          const coul2 = (Q2 * bodyCharge) * inv2 * 0.5;
          ax += coul2 * d2x;
          ay += coul2 * d2y;
        }
      }
      return { ax, ay };
    }

    // ── Single-BH path (original) ────────────────────────
    const r2 = px * px + py * py;
    const r = Math.sqrt(r2);
    if (r < 1e-6) return { ax: 0, ay: 0 };

    // Newtonian gravity
    const inv_r3 = 1 / (r2 * r);
    let ax = -G * M * px * inv_r3;
    let ay = -G * M * py * inv_r3;

    // Effective potential correction (mimics ISCO instability) ~ -3 M L^2 / r^5
    const tangential = (px * vy - py * vx) / r;
    const L2 = tangential * tangential * r2;
    const corr = (3 * G * M * L2) / (r2 * r2 * r);
    ax -= corr * px / r;
    ay -= corr * py / r;

    // Frame dragging — Lense-Thirring as a gravitomagnetic force (~ v × B_g,
    // with B_g = 2 a M / r^3 along the spin axis). Because it is perpendicular to
    // the velocity it does NO work, so it precesses orbits without injecting
    // energy. The previous fixed-tangential push did positive work on every
    // co-rotating (prograde) orbit, steadily spinning bodies up and flinging them
    // outward — a violation of energy conservation, not real frame dragging.
    if (Math.abs(a) > 1e-6) {
      const Bg = (2 * a * M) / (r2 * r);
      ax += Bg * vy;
      ay += -Bg * vx;
    }

    // Coulomb (charged BH on charged probe). The 0.5 is a visual-coupling scale,
    // NOT a physical constant: in G=c=1 units Q and the probe charge are visual
    // knobs, and 0.5 keeps the electrostatic push/pull comparable to gravity over
    // the same r-range rather than swamping or vanishing against it.
    if (Math.abs(Q) > 1e-6 && Math.abs(bodyCharge) > 1e-6) {
      const coul = (Q * bodyCharge) * inv_r3 * 0.5;
      ax += coul * px;
      ay += coul * py;
    }
    return { ax, ay };
  }

  // ── Binary-BH inspiral: Peters (1964) circular case ────────
  // Returns angular orbital frequency ω, separation decay rate ḋ,
  // time-to-merger t_c, and chirp mass Mc. Geometric units.
  function peters(M1, M2, d) {
    const Mt = M1 + M2;
    const dSafe = Math.max(0.05, d);
    // Kepler orbital angular frequency
    const omega = Math.sqrt(Mt / (dSafe * dSafe * dSafe));
    // Peters: ḋ = -(64/5) M1 M2 (M1+M2) / d^3
    const ddot = -(64 / 5) * (M1 * M2 * Mt) / (dSafe * dSafe * dSafe);
    // t_merge = (5/256) d^4 / (M1 M2 (M1+M2))
    const t_merge = (5 / 256) * Math.pow(dSafe, 4) / (M1 * M2 * Mt);
    // Chirp mass Mc = (M1 M2)^(3/5) / (M1+M2)^(1/5)
    const Mc = Math.pow(M1 * M2, 0.6) / Math.pow(Mt, 0.2);
    // Reduced mass μ
    const mu = (M1 * M2) / Mt;
    // GW luminosity (Peters circular): dE/dt = (32/5) M1² M2² (M1+M2) / d⁵.
    // It is set by BOTH masses (∝ M1²M2²) — the system radiates as one
    // time-varying mass quadrupole, not as two independent sources.
    const Lgw = (32 / 5) * (M1 * M1 * M2 * M2) * Mt / Math.pow(dSafe, 5);
    return { omega, ddot, t_merge, Mc, Mt, mu, Lgw };
  }

  // ── Binary-BH coalescence remnant (approximate NR fits) ──────
  // Given progenitor masses and dimensionless spins χ_i = a_i/M_i (signed,
  // projected on the orbital angular momentum), returns the remnant mass M_f,
  // dimensionless spin a_f/M_f and the energy E_rad carried off by the final
  // merger/ringdown GW burst. Built on the symmetric mass ratio
  //   η = M1 M2 / (M1+M2)²   (η → 0.25 equal mass, → 0 extreme ratio):
  //   · radiated energy  E_rad/M ≈ 0.055·(4η)·(1 + 0.4 χ_eff)
  //         equal-mass non-spinning → ≈5.5%; extreme mass ratio radiates little.
  //   · final spin  a_f/M_f ≈ √12 η − 2.9 η²            (orbital, ≈0.686 at η=¼)
  //                          + (χ1 M1² + χ2 M2²)/M_f²    (progenitor spins carried in)
  function mergerRemnant(M1, M2, chi1 = 0, chi2 = 0, orbitSign = 1) {
    const Mt = M1 + M2;
    const eta = (M1 * M2) / (Mt * Mt);              // 0 < η ≤ 0.25
    const chiEff = (chi1 * M1 + chi2 * M2) / Mt;    // mass-weighted aligned spin
    let eRadFrac = 0.055 * (4 * eta) * (1 + 0.4 * chiEff);
    eRadFrac = Math.max(0.002, Math.min(0.12, eRadFrac));
    const eRad = Mt * eRadFrac;
    const Mf = Mt - eRad;
    const jOrb = Math.sqrt(12) * eta - 2.9 * eta * eta;            // orbital → a_f/M_f
    const jSpin = (chi1 * M1 * M1 + chi2 * M2 * M2) / (Mf * Mf);   // S_total / M_f²
    let af = orbitSign * jOrb + jSpin;
    af = Math.max(-0.998, Math.min(0.998, af));     // sub-extremal Kerr bound
    return { Mf, af, eRad, eta, chiEff };
  }

  // ── Binary mass transfer & evolution (Roche-lobe overflow) ───────────
  // When a star swells to fill its Roche lobe it sheds mass onto its companion
  // through the inner Lagrange point. These helpers drive the demo's mass-transfer
  // layer: the critical lobe size, the overflow rate, the orbit's reaction, and
  // the unstable common-envelope branch. Masses are solar; lengths are geometric
  // (units of M), matching the rest of the binary code. Constants are calibrated
  // to be visible on interactive timescales, the same spirit as inspiralRate.
  const CE_ALPHA   = 3.0;     // common-envelope efficiency (orbital energy → ejection)
  const CE_LAMBDA  = 1.0;     // envelope structure parameter (binding-energy form factor)
  const NOVA_RETAIN = 0.15;   // fraction of an accreted H layer a WD keeps after a nova
  // Overflow-rate scale (M⊙ per unit time at unit overflow). Only the tenuous gas
  // ABOVE the Roche lobe streams across the L1 point — a small fraction of the
  // donor — so the flux is gentle and the orbit drifts adiabatically rather than
  // the stars flinging apart. Kept low; the user transfer multiplier speeds it up.
  const MT_K       = 0.012;

  // Eggleton (1983) Roche-lobe radius of a star, given its mass, the companion's
  // mass and the orbital separation a (all consistent units; returns the lobe
  // radius in the units of a). q = Mself / Mother.
  function rocheLobeEggleton(Mself, Mother, a) {
    const q = Math.max(1e-6, Mself) / Math.max(1e-6, Mother);
    const q23 = Math.pow(q, 2 / 3);
    return a * 0.49 * q23 / (0.6 * q23 + Math.log(1 + Math.pow(q, 1 / 3)));
  }

  // ── Ballistic gas-stream trajectories in the rotating (Roche) frame ──────
  // The gas that overflows the donor's Roche lobe leaves through the inner
  // Lagrange point L1 and follows a ballistic path under BOTH stars' gravity plus
  // the centrifugal and Coriolis forces of the co-rotating frame (the restricted
  // three-body problem). A real stream has finite width and a spread of launch
  // conditions, so a FAMILY of trajectories is integrated to show the full range
  // the gas can take — the bundle deflects in the orbital direction (Coriolis) and,
  // if it misses the accretor, wraps around it toward an accretion disc.
  //
  // Units: total mass = 1, separation = 1, angular velocity Ω = 1. The donor sits
  // at x = −m_a and the accretor at x = +m_d (barycentre at the origin), where
  // m_d, m_a are the mass fractions. Paths are returned in a DONOR-origin frame
  // (donor at 0, accretor at +1 on the x-axis) for easy mapping to the screen.
  // `orbitSign` (+1/−1) sets the orbital/Coriolis sense; `accRadiusFrac` is the
  // accretor's capture radius in units of the separation.
  function gasStreamPaths(Mdonor, Maccretor, accRadiusFrac = 0.05, orbitSign = 1, nPaths = 7) {
    const Mt = Math.max(1e-6, Mdonor + Maccretor);
    const md = Mdonor / Mt, ma = Maccretor / Mt;     // mass fractions (sum 1)
    const xd = -ma, xa = md;                          // donor / accretor on x-axis
    // Pseudo-potential gradient (rotating frame, Ω = 1): a = ∇U with
    // U = ½(x²+y²) + m_d/r_d + m_a/r_a.
    const grad = (x, y) => {
      const ddx = x - xd, ddy = y, dax = x - xa, day = y;
      const rd = Math.max(1e-4, Math.hypot(ddx, ddy)), ra = Math.max(1e-4, Math.hypot(dax, day));
      const rd3 = rd * rd * rd, ra3 = ra * ra * ra;
      return [x - md * ddx / rd3 - ma * dax / ra3, y - md * ddy / rd3 - ma * day / ra3];
    };
    // Locate L1 on the x-axis between the stars (root of ∂U/∂x = 0).
    let lo = xd + 1e-3, hi = xa - 1e-3, xL1 = 0.5 * (lo + hi);
    let flo = grad(lo, 0)[0];
    for (let i = 0; i < 64; i++) {
      const mid = 0.5 * (lo + hi), fm = grad(mid, 0)[0];
      if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
      xL1 = mid;
    }
    const Om = orbitSign >= 0 ? 1 : -1;
    const capR = Math.max(0.02, accRadiusFrac);
    const deriv = (st) => {                            // ẍ = 2Ω ẏ + U_x, ÿ = −2Ω ẋ + U_y
      const g = grad(st[0], st[1]);
      return [st[2], st[3], 2 * Om * st[3] + g[0], -2 * Om * st[2] + g[1]];
    };
    const v0 = 0.05, dt = 0.012, fan = 80 * Math.PI / 180;  // launch speed, step, spread
    const paths = [];
    for (let k = 0; k < nPaths; k++) {
      const frac = nPaths > 1 ? k / (nPaths - 1) : 0.5;
      const ang = (frac - 0.5) * fan;                  // −40°..+40° about the L1→accretor line
      let x = xL1, y = 0, vx = v0 * Math.cos(ang), vy = v0 * Math.sin(ang);
      const path = [[x + ma, y]];                      // donor-origin frame
      for (let step = 0; step < 420; step++) {
        let s0 = [x, y, vx, vy];
        const k1 = deriv(s0);
        const k2 = deriv([s0[0] + 0.5 * dt * k1[0], s0[1] + 0.5 * dt * k1[1], s0[2] + 0.5 * dt * k1[2], s0[3] + 0.5 * dt * k1[3]]);
        const k3 = deriv([s0[0] + 0.5 * dt * k2[0], s0[1] + 0.5 * dt * k2[1], s0[2] + 0.5 * dt * k2[2], s0[3] + 0.5 * dt * k2[3]]);
        const k4 = deriv([s0[0] + dt * k3[0], s0[1] + dt * k3[1], s0[2] + dt * k3[2], s0[3] + dt * k3[3]]);
        x += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        y += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        vx += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        vy += dt / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
        path.push([x + ma, y]);
        if (Math.hypot(x - xa, y) < capR) break;       // captured by the accretor
        if (Math.hypot(x, y) > 1.9 || Math.hypot(x - xd, y) < 0.02) break;  // off-range
      }
      paths.push(path);
    }
    return { xL1: xL1 + ma, paths };
  }

  // Mass-transfer rate (M⊙ per unit time) for a donor of photosphere radius
  // R_star overflowing a Roche lobe R_L. Zero unless R_star > R_L; otherwise it
  // grows with the cube of the fractional overflow depth (an isothermal-atmosphere
  // -like response). K folds in the global scale and the user transfer multiplier.
  function massTransferRate(R_star, R_L, K = MT_K) {
    if (!(R_star > R_L) || !(R_L > 0)) return 0;
    const depth = (R_star - R_L) / R_L;
    return K * depth * depth * depth;
  }

  // Fractional orbital-separation response to conservative mass transfer,
  // (da/dt)/a, from orbital angular-momentum conservation (J ∝ M_d M_a √a):
  //   (da/dt)/a = 2 · mdot · (M_a − M_d) / (M_d M_a).
  // Donor heavier than accretor (M_d > M_a) → negative → the orbit shrinks, the
  // lobe shrinks, and transfer runs away (unstable). Donor lighter → the orbit
  // widens and transfer self-regulates (stable). mdot is the donor's loss rate.
  function orbitalResponseRate(Md, Ma, mdot) {
    if (!(Md > 0) || !(Ma > 0)) return 0;
    return 2 * mdot * (Ma - Md) / (Md * Ma);
  }

  // Critical mass ratio q = M_donor / M_accretor above which Roche-lobe overflow
  // is dynamically unstable and a common envelope forms. Convective (giant)
  // donors are unstable at modest q; radiative (main-sequence) donors tolerate
  // higher q; compact (wd) donors are easily unstable.
  function ceCriticalQ(donorType) {
    if (donorType === 'giant') return 0.79;
    if (donorType === 'ms')    return 2.2;
    if (donorType === 'wd')    return 0.6;
    return 1.0;
  }

  // Common-envelope outcome via the α-λ energy formalism. The donor's envelope
  // (M_env = Md − M_core) is ejected at the expense of orbital energy released as
  // the cores spiral in from a to a_f:
  //   α · (M_core M_a / (2 a_f) − Md M_a / (2 a)) = G Md M_env / (λ R_d).
  // Solving for a_f (G = 1, demo-calibrated): the pair survives as a close binary
  // if a_f clears the post-CE surfaces, otherwise the cores merge. M_core ≈ 0.45 Md
  // for a giant (its He/CO core → a white dwarf).
  function ceOutcome(opts, alpha = CE_ALPHA, lambda = CE_LAMBDA) {
    const { Md, Ma, Rd, a, donorType } = opts;
    const coreFrac = donorType === 'giant' ? 0.3 : (donorType === 'ms' ? 0.0 : 1.0);
    const M_core = Math.max(0.05, coreFrac * Md);
    const M_env  = Math.max(0, Md - M_core);
    // No clean core (a main-sequence donor) → the spiral-in always merges.
    if (M_env <= 0 || coreFrac <= 0) return { survive: false, a_f: 0, M_core: Md };
    const eBind = (Md * M_env) / (Math.max(0.05, lambda) * Math.max(0.05, Rd));
    // a_f from the energy balance; the initial-orbit term is usually negligible.
    const denom = (Md * Ma) / Math.max(1e-3, a) + (2 * eBind) / Math.max(1e-3, alpha);
    const a_f = (M_core * Ma) / Math.max(1e-6, denom);
    return { survive: a_f > 0, a_f, M_core };
  }

  // Accreted-hydrogen layer mass (M⊙) that triggers a nova flash on a white dwarf
  // of mass M_wd. Heavier (more compact) white dwarfs ignite a thinner shell, so
  // the ignition mass decreases with M_wd. Scaled so it is reachable on the demo's
  // interactive transfer timescale (true novae need ~1e-4 M⊙; this is larger).
  function novaIgnitionMass(M_wd) {
    const M = Math.max(0.2, Math.min(M_CHANDRASEKHAR, M_wd || 0.6));
    return 0.02 * Math.pow(0.6 / M, 2);
  }

  // Tidal stress at distance r on a body of radius R_b — units arbitrary, 0..∞.
  // Returns normalised 0..1.2+ against the body's binding threshold thr.
  // The 300× factor scales so disruption happens at observationally interesting
  // radii (r ≈ a few M for low-binding bodies) rather than inside r₊.
  function tidalStress(r, M, R_body, bindingThr = 1) {
    if (r < 1e-3) return 5;
    const dF = (300 * G * M * R_body) / (r * r * r);
    return dF / bindingThr;
  }

  // Visual glow factor (0..1) for a luminosity L (L⊙), log-compressed across the
  // enormous stellar range so a luminous O-star or giant blazes while a faint
  // white/red dwarf barely glows — the brightness axis of the H-R diagram. The
  // colour still comes from temperature (tempToColor); this only sets how bright
  // the body and its halo render. Kept gentle (callers map it onto modest gains).
  function stellarGlow(Lsun) {
    const x = Math.log10(Math.max(1e-4, Lsun || 1e-4));
    return Math.max(0, Math.min(1, (x + 2) / 6));   // L: 0.01→0, 1→0.33, 1e4→1
  }

  // Real blackbody colours along the Planckian locus, in sRGB (Mitchell Charity's
  // blackbody table, normalised against black). Anchors are [T_K, r, g, b]. Real
  // stars run red → orange → yellow → white → blue-white and famously NEVER pass
  // through green, so the colour is interpolated from data rather than a synthetic
  // rainbow ramp. Overlapping temperatures simply share their true colour — that
  // is correct, not a bug, so no artificial hue separation is imposed.
  const BB_TABLE = [
    [1000, 255, 56, 0],    [1500, 255, 109, 0],   [2000, 255, 137, 18],
    [2500, 255, 161, 72],  [3000, 255, 180, 107], [3500, 255, 196, 137],
    [4000, 255, 209, 163], [4500, 255, 219, 186], [5000, 255, 228, 206],
    [5500, 255, 236, 224], [6000, 255, 243, 239], [6500, 255, 249, 253],
    [7000, 245, 243, 255], [7500, 235, 238, 255], [8000, 227, 233, 255],
    [9000, 214, 225, 255], [10000, 204, 219, 255],[12000, 191, 211, 255],
    [15000, 179, 204, 255],[20000, 168, 197, 255],[30000, 159, 191, 255],
    [40000, 155, 188, 255],
  ];

  // Blackbody → CSS colour for a stellar surface. `alpha` sets opacity; `lum`
  // (0..1, from stellarGlow) gently blends the disk toward white so a luminous
  // star reads brighter, without shifting its true hue. Surfaces hotter than the
  // table (e.g. a megakelvin neutron-star crust) saturate at the hot blue-white
  // end — the eye sees blue-white, never violet.
  function tempToColor(T, alpha = 1, lum = null) {
    const Tk = Math.max(1000, Math.min(40000, T || 5800));
    let i = 0;
    while (i < BB_TABLE.length - 1 && BB_TABLE[i + 1][0] <= Tk) i++;
    const a0 = BB_TABLE[i], a1 = BB_TABLE[Math.min(i + 1, BB_TABLE.length - 1)];
    const span = (a1[0] - a0[0]) || 1;
    const f = Math.max(0, Math.min(1, (Tk - a0[0]) / span));
    let r = a0[1] + (a1[1] - a0[1]) * f;
    let g = a0[2] + (a1[2] - a0[2]) * f;
    let b = a0[3] + (a1[3] - a0[3]) * f;
    if (lum != null) {
      const w = 0.22 * Math.max(0, Math.min(1, lum));   // gentle brighten toward white
      r += (255 - r) * w; g += (255 - g) * w; b += (255 - b) * w;
    }
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
  }

  // Circular-orbit speed for the single-BH effective potential (see acceleration).
  // Balancing v²/r against the radial pull M/r² + 3M·(v·r)²/r⁵ for a circular
  // orbit (where v_t = v) gives  v_circ² = (M/r) / (1 − 3M/r²).
  // Pure-Newtonian √(M/r) ignores the denominator, so it is too slow for the well
  // and a body set to it spirals in and merges. Returns 0 where no circular orbit
  // exists (r ≤ √(3M), inside the effective photon sphere); callers fall back.
  function circularSpeed(r, M) {
    const denom = 1 - (3 * G * M) / (r * r);
    if (denom <= 1e-6) return 0;
    return Math.sqrt((G * M / r) / denom);
  }

  window.KNphysics = {
    horizons, ergosphereEq, ergospherePole, isco, photonSphereEq,
    classify, acceleration, circularSpeed, tidalStress, r_s, peters, mergerRemnant,
    rocheLobeEggleton, massTransferRate, orbitalResponseRate, ceCriticalQ,
    ceOutcome, novaIgnitionMass, gasStreamPaths,
    STELLAR_INFO, STELLAR_DEFAULTS, wouldCollapse, tempToColor,
    uiCategory, remnantType, typeForStage, MASS_RANGES, VIEW_SCALES,
    M_CHANDRASEKHAR, M_TOV, CE_ALPHA, CE_LAMBDA, NOVA_RETAIN, MT_K,
    msLuminosity, msRadius, msLifetime, effTemp,
    mainSequenceState, giantState, whiteDwarfState, neutronStarState, deriveStellar,
    stellarGlow,
  };
})();
