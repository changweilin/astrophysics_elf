/* MHD accretion disc + jet engine.
 * Simulates a swarm of disc particles around the Kerr-Newman BH:
 *   - Newtonian gravity (incl. frame-dragging from sim.params.a)
 *   - α-viscosity tangential drag → angular-momentum loss → inspiral
 *   - Magnetorotational instability (MRI) kicks scaled by B²
 *   - Magnetic reconnection flare events probabilistic in B²
 * Computes jet metrics: P_BZ (Blandford-Znajek, ~ a² B² M²), P_acc (~ Ṁ),
 *   Lorentz factor Γ, opening angle θ, radiative efficiency η.
 * Exports window.KNDisc.
 */
(function () {
  const phys = window.KNphysics;

  function makeDisc() {
    return {
      enabled: false,
      particles: [],
      alpha: 0.18,
      emissionRate: 6,
      emissionAccum: 0,
      maxParticles: 700,
      outerR: 26,
      mDot: 0,
      mDotInst: 0,
      reconnects: [],
      reconnectAccum: 0,
      totalAccreted: 0,
      lastFlareT: -10,
    };
  }

  function initDisc(sim) {
    sim.disc = makeDisc();   // primary accretion disc
    sim.disc2 = makeDisc();  // companion accretion disc (binary mode only)
    if (sim.params.B == null) sim.params.B = 0.30;
  }

  // Describe the star a disc orbits: world centre + bulk velocity (so the swarm
  // co-moves with a primary that is itself orbiting the barycentre) plus the
  // mass/spin/charge/field that set its ISCO, capture radius and jet power.
  function primaryHost(sim) {
    const bin = sim.binary, useBin = bin && bin.enabled;
    const p = sim.primary;
    return {
      cx: useBin ? bin.x1 : p.x, cy: useBin ? bin.y1 : p.y,
      vx: useBin ? bin.vx1 : (p.vx || 0), vy: useBin ? bin.vy1 : (p.vy || 0),
      M: sim.params.M, Q: sim.params.Q, a: sim.params.a, B: sim.params.B || 0,
      type: sim.params.type || 'bh', R_star: sim.params.R_star || 3,
    };
  }
  function companionHost(sim) {
    const bin = sim.binary;
    if (!bin || !bin.enabled) return null;
    return {
      cx: bin.x2, cy: bin.y2, vx: bin.vx2, vy: bin.vy2,
      M: bin.M2, Q: bin.Q2 || 0, a: bin.a2 || 0, B: bin.B2 || 0,
      type: bin.type || 'bh', R_star: bin.R_star2 || 3,
    };
  }

  function captureRadius(host) {
    if (host.type !== 'bh') return Math.max(0.4, host.R_star || 3);
    const { rplus, naked } = phys.horizons(host.M, host.Q, host.a);
    if (naked) return 0.4;
    return Math.max(rplus, phys.isco(host.M, host.a) * 0.85);
  }

  function spawnParticle(disc, host) {
    const r = disc.outerR + (Math.random() - 0.5) * 3;
    const ang = Math.random() * Math.PI * 2;
    const sign = host.a >= 0 ? 1 : -1;
    const vCirc = Math.sqrt(host.M / r);
    // Orbit is built about the host: position offset from the star, velocity is
    // the star's bulk motion plus the local circular speed (keeps the swarm
    // gravitationally bound to a moving primary instead of drifting to origin).
    disc.particles.push({
      x: host.cx + Math.cos(ang) * r,
      y: host.cy + Math.sin(ang) * r,
      vx: host.vx + -Math.sin(ang) * sign * vCirc * (0.9 + Math.random() * 0.2),
      vy: host.vy +  Math.cos(ang) * sign * vCirc * (0.9 + Math.random() * 0.2),
      t: 0.05,
      age: 0,
    });
  }

  // Advance one disc around its host. All radial quantities (temperature, drag,
  // capture, escape) are measured from the host's *current* position, and the
  // viscous drag damps velocity relative to the host's bulk motion — so the disc
  // tracks the star whatever reference frame the camera is locked to.
  function stepDisc(sim, disc, host, dt) {
    if (!disc.enabled || !host) {
      disc.mDotInst = 0;
      disc.mDot *= Math.exp(-dt * 1.5);
      return;
    }
    const M = sim.params.M, Q = sim.params.Q, a = sim.params.a;
    const B = host.B;
    const cap = captureRadius(host);

    disc.emissionAccum += disc.emissionRate * dt;
    while (disc.emissionAccum >= 1 && disc.particles.length < disc.maxParticles) {
      spawnParticle(disc, host);
      disc.emissionAccum -= 1;
    }

    disc.mDotInst = 0;
    const dragCoef = disc.alpha * (0.05 + B * B * 0.7);
    const mriKick = B * 0.05 * Math.sqrt(dt);

    for (let i = disc.particles.length - 1; i >= 0; i--) {
      const p = disc.particles[i];
      // Gravity is the full system field (primary + companion when bound), so a
      // companion disc feels the primary and vice-versa.
      const acc = phys.acceleration(p.x, p.y, p.vx, p.vy, M, Q, a, 0, sim.binary || null);
      p.vx += acc.ax * dt;
      p.vy += acc.ay * dt;

      const dx = p.x - host.cx, dy = p.y - host.cy;
      const r = Math.hypot(dx, dy);
      if (r > 0.5) {
        const ux = dx / r, uy = dy / r;
        const tx = -uy, ty = ux;
        // damp the tangential component of velocity *relative to the host*
        const rvx = p.vx - host.vx, rvy = p.vy - host.vy;
        const vt = rvx * tx + rvy * ty;
        const damp = Math.min(0.6, dragCoef);
        p.vx -= tx * vt * damp;
        p.vy -= ty * vt * damp;
      }
      if (B > 0.02) {
        p.vx += (Math.random() - 0.5) * mriKick;
        p.vy += (Math.random() - 0.5) * mriKick;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
      p.t = Math.min(1, Math.max(0, 1 - r / 22));

      if (r < cap) {
        disc.mDotInst += 1;
        disc.totalAccreted += 1;
        disc.particles.splice(i, 1);
      } else if (r > disc.outerR * 2.1) {
        disc.particles.splice(i, 1);
      }
    }
    disc.mDot = disc.mDot * 0.93 + (disc.mDotInst / Math.max(dt, 0.001)) * 0.07;

    // Reconnection flares
    if (B > 0.08 && disc.particles.length > 25) {
      disc.reconnectAccum += B * B * 0.7 * dt;
      while (disc.reconnectAccum >= 1) {
        disc.reconnectAccum -= 1;
        const seed = disc.particles[Math.floor(Math.random() * disc.particles.length)];
        if (seed) {
          disc.reconnects.push({
            x: seed.x, y: seed.y,
            ang: Math.atan2(seed.vy - host.vy, seed.vx - host.vx),
            age: 0,
            life: 0.5 + Math.random() * 0.5,
            size: 0.6 + B,
          });
          disc.lastFlareT = sim.t;
          if (sim.t - (disc._lastLog || -10) > 1.2) {
            window.KNSim.logEv(sim, 'amber',
              `MHD reconnection · r=${Math.hypot(seed.x - host.cx, seed.y - host.cy).toFixed(1)} M · ΔE ≈ ${(B*B*5).toFixed(2)}`);
            disc._lastLog = sim.t;
          }
        }
      }
    }
  }

  function ageReconnects(disc, dt) {
    for (let i = disc.reconnects.length - 1; i >= 0; i--) {
      disc.reconnects[i].age += dt;
      if (disc.reconnects[i].age > disc.reconnects[i].life) {
        disc.reconnects.splice(i, 1);
      }
    }
  }

  function step(sim, dt) {
    stepDisc(sim, sim.disc, primaryHost(sim), dt);
    ageReconnects(sim.disc, dt);
    if (sim.disc2) {
      const cHost = companionHost(sim);
      // No bound companion → drop any leftover swarm so it doesn't linger.
      if (!cHost && sim.disc2.particles.length) sim.disc2.particles.length = 0;
      stepDisc(sim, sim.disc2, cHost, dt);
      ageReconnects(sim.disc2, dt);
    }
  }

  // Jet metrics for a single magnetized, spinning body. mDot is the disc
  // accretion rate feeding the P_acc term (0 for a body with no disc, e.g. the
  // binary companion — its jet is then pure Blandford-Znajek from spin × B²).
  function jetMetricsFor(M, a, B, mDot) {
    const aN = Math.abs(a) / M;
    const P_BZ = aN * aN * B * B * 100;
    const P_acc = mDot * 0.45;
    const P = P_BZ + P_acc;
    const gamma = Math.min(40, 1 + 9 * aN * B + mDot * 0.18);
    const theta = Math.max(1.5, 26 - 22 * aN * B);
    const aNclamp = Math.min(0.9999, aN);
    const eta = aN < 0.01 ? 0.057 : 0.057 + (0.42 - 0.057) * (1 - Math.sqrt(1 - aNclamp * aNclamp));
    const L_disc = mDot * eta;
    return { P, P_BZ, P_acc, gamma, theta, L_disc, eta, mDot };
  }

  // Primary BH jet — fed by the accretion disc when it is spun up.
  function jetMetrics(sim) {
    const { M, a, B } = sim.params;
    const mDot = sim.disc.enabled ? sim.disc.mDot : 0;
    return jetMetricsFor(M, a, B, mDot);
  }

  // Companion jet (binary mode only): Blandford-Znajek from its own spin × B₂,
  // plus accretion power from its own disc when that disc is spun up.
  function companionJetMetrics(sim) {
    const bin = sim.binary;
    if (!bin || !bin.enabled) return null;
    const mDot = (sim.disc2 && sim.disc2.enabled) ? sim.disc2.mDot : 0;
    return jetMetricsFor(bin.M2, bin.a2 || 0, bin.B2 || 0, mDot);
  }

  function renderOneDisc(sim, disc, ctx, w, h, worldToScreen) {
    if (!disc) return;
    if (disc.enabled) {
      for (const p of disc.particles) {
        const [px, py] = worldToScreen(sim, w, h, p.x, p.y);
        if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
        const t = p.t;
        const hue = 30 + t * 200; // red (cool outer) → blue-white (hot inner)
        const lit = 0.55 + t * 0.4;
        ctx.fillStyle = `oklch(${lit} ${0.12 + t * 0.08} ${hue} / ${0.7 + t * 0.3})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.8 + t * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Reconnection flares
    for (const f of disc.reconnects) {
      const [px, py] = worldToScreen(sim, w, h, f.x, f.y);
      if (px < -40 || px > w + 40 || py < -40 || py > h + 40) continue;
      const t = f.age / f.life;
      const alpha = (1 - t) * 0.9;
      const sz = f.size * (1 + t * 7);
      ctx.fillStyle = `oklch(0.92 0.16 320 / ${alpha * 0.3})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `oklch(0.97 0.18 320 / ${alpha})`;
      ctx.beginPath(); ctx.arc(px, py, sz * 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `oklch(0.95 0.18 320 / ${alpha * 0.85})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const r0 = sz * 11;
      for (let i = 0; i <= 7; i++) {
        const aa = f.ang - 0.5 + i * 0.16;
        const rr = r0 * (1 + (i % 2 === 0 ? 0 : 0.35));
        const x = px + Math.cos(aa) * rr;
        const y = py + Math.sin(aa) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function renderDisc(sim, ctx, w, h, worldToScreen) {
    renderOneDisc(sim, sim.disc, ctx, w, h, worldToScreen);
    if (sim.disc2) renderOneDisc(sim, sim.disc2, ctx, w, h, worldToScreen);
  }

  // Draw one jet glow + readout chip centred on a world position (ox,oy).
  // worldToScreen resolves the active reference frame, so the glow tracks its
  // host body whether the camera is locked to the primary, the companion, or
  // the barycentre — the hole never separates from its halo.
  function drawJetGlow(sim, ctx, w, h, worldToScreen, ox, oy, m) {
    if (!m || m.P < 0.3) return;
    const lum = Math.min(1, m.P / 30);
    const flick = 0.85 + 0.15 * Math.sin(sim.t * 7);
    const radius = 5 + lum * 18;
    const [cx, cy] = worldToScreen(sim, w, h, ox, oy);
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 4);
    grd.addColorStop(0, `oklch(0.96 0.18 290 / ${lum * flick * 0.8})`);
    grd.addColorStop(0.4, `oklch(0.85 0.16 290 / ${lum * 0.25})`);
    grd.addColorStop(1, 'oklch(0.1 0 0 / 0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 4, 0, Math.PI * 2); ctx.fill();
    // small chip overlay near the body
    ctx.fillStyle = `oklch(0.92 0.05 290 / ${0.7})`;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(trp('JET ⊙ {p}', { p: m.P.toFixed(1) }), cx + radius + 6, cy - 4);
    ctx.fillStyle = `oklch(0.72 0.10 290 / 0.7)`;
    ctx.fillText(`Γ ≈ ${m.gamma.toFixed(1)}`, cx + radius + 6, cy + 7);
  }

  function renderJetCenter(sim, ctx, w, h, worldToScreen) {
    const bin = sim.binary;
    if (bin && bin.enabled) {
      // Primary orbits the barycentre at (bin.x1,bin.y1); companion at (bin.x2,bin.y2).
      drawJetGlow(sim, ctx, w, h, worldToScreen, bin.x1, bin.y1, jetMetrics(sim));
      drawJetGlow(sim, ctx, w, h, worldToScreen, bin.x2, bin.y2, companionJetMetrics(sim));
    } else {
      drawJetGlow(sim, ctx, w, h, worldToScreen, 0, 0, jetMetrics(sim));
    }
  }

  window.KNDisc = { initDisc, step, jetMetrics, companionJetMetrics, renderDisc, renderJetCenter };
})();
