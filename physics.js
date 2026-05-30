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

  function isco(M, a) {
    // Bardeen-Press-Teukolsky for prograde Kerr; analytic
    const aN = a / M;
    const Z1 = 1 + Math.cbrt(1 - aN * aN) * (Math.cbrt(1 + aN) + Math.cbrt(1 - aN));
    const Z2 = Math.sqrt(3 * aN * aN + Z1 * Z1);
    const r_isco_M = 3 + Z2 - Math.sign(aN) * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
    return r_isco_M * M;
  }

  function photonSphereEq(M, a) {
    // prograde equatorial photon orbit: r_ph = 2M{1 + cos[(2/3)arccos(-|a|/M)]}
    const aN = Math.min(0.99999, Math.abs(a) / M);
    return 2 * M * (1 + Math.cos((2 / 3) * Math.acos(-aN)));
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
        name: 'NAKED SINGULARITY',
        family: 'kerr-newman',
        warn: true,
        desc: '宇宙審查假設崩壞 — a² + Q² > M²，事件視界消失。',
        pill: 'UNSHIELDED'
      };
    }
    const spinning = Math.abs(aN) > 0.01;
    const charged = Math.abs(qN) > 0.01;
    if (!spinning && !charged) {
      return { name: 'Schwarzschild', family: 'schwarzschild', warn: false,
        desc: '球對稱、靜止、不帶電。最簡單的真空解。', pill: 'STATIC' };
    }
    if (spinning && !charged) {
      return { name: 'Kerr', family: 'kerr', warn: false,
        desc: '自旋形成動圈與內外視界。frame dragging 主導附近的測地線。', pill: 'ROTATING' };
    }
    if (!spinning && charged) {
      return { name: 'Reissner-Nordström', family: 'rn', warn: false,
        desc: '帶電、不自旋。電場排斥同號電荷的測試粒子。', pill: 'CHARGED' };
    }
    return { name: 'Kerr-Newman', family: 'kn', warn: false,
      desc: '帶電且自旋的最一般穩態解。具備動圈與電磁交互作用。', pill: 'FULL' };
  }

  // Stellar-type metadata used when the central body is not a black hole.
  const STELLAR_INFO = {
    ns: { name: 'Neutron Star',     pill: 'DEGENERATE',
          desc: '中子簡併壓支撐的極緻密殘骸。半徑 ≈ 3 M，自旋與磁場主導電磁相位現象。' },
    wd: { name: 'White Dwarf',      pill: 'COMPACT',
          desc: '電子簡併壓支撐。半徑 ≈ 7 M（壓縮可視化）；無事件視界但仍可被潮汐力擾動。' },
    ms: { name: 'Main-Sequence Star', pill: 'FUSING',
          desc: '質子-質子鏈或 CNO 循環活躍。半徑大，r_s 遠遠埋在內部，時空近於牛頓。' },
  };

  // Default stellar radii (geometric units, M) and surface temperatures (K).
  const STELLAR_DEFAULTS = {
    ns: { R: 3.0,  T: 1.0e6 },   // very hot, X-ray
    wd: { R: 7.0,  T: 1.2e4 },   // hot but optical
    ms: { R: 18.0, T: 5800 },    // sun-like
  };

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
        // Coulomb on charged probe from primary
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

    // Coulomb (charged BH on charged probe)
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

  // Tidal stress at distance r on a body of radius R_b — units arbitrary, 0..∞.
  // Returns normalised 0..1.2+ against the body's binding threshold thr.
  // The 300× factor scales so disruption happens at observationally interesting
  // radii (r ≈ a few M for low-binding bodies) rather than inside r₊.
  function tidalStress(r, M, R_body, bindingThr = 1) {
    if (r < 1e-3) return 5;
    const dF = (300 * G * M * R_body) / (r * r * r);
    return dF / bindingThr;
  }

  // Blackbody → oklch colour for a stellar surface.
  // Approximate Planckian locus: cool → red, sun-like → yellow-white,
  // hot (≥10⁴ K) → blue-white, very hot (≥10⁵ K) → deep blue/violet.
  function tempToColor(T, alpha = 1) {
    const t = Math.log10(Math.max(500, Math.min(2e7, T)));
    // map log10(T) ∈ [3, 6.5]  →  u ∈ [0, 1]
    const u = Math.max(0, Math.min(1, (t - 3.0) / 3.5));
    const hue = 25 + u * 225;        // red → cyan-blue
    const L   = 0.76 + 0.12 * u;     // hotter → brighter
    const C   = 0.13;
    return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue.toFixed(0)} / ${alpha})`;
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
    STELLAR_INFO, STELLAR_DEFAULTS, wouldCollapse, tempToColor,
  };
})();
