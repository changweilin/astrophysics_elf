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

  function initDisc(sim) {
    sim.disc = {
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
    if (sim.params.B == null) sim.params.B = 0.30;
  }

  function spawnParticle(sim) {
    const r = sim.disc.outerR + (Math.random() - 0.5) * 3;
    const ang = Math.random() * Math.PI * 2;
    const sign = sim.params.a >= 0 ? 1 : -1;
    const vCirc = Math.sqrt(sim.params.M / r);
    sim.disc.particles.push({
      x: Math.cos(ang) * r,
      y: Math.sin(ang) * r,
      vx: -Math.sin(ang) * sign * vCirc * (0.9 + Math.random() * 0.2),
      vy:  Math.cos(ang) * sign * vCirc * (0.9 + Math.random() * 0.2),
      t: 0.05,
      age: 0,
    });
  }

  function step(sim, dt) {
    // age out flares & decay mDot even when disc is off
    if (!sim.disc.enabled) {
      sim.disc.mDotInst = 0;
      sim.disc.mDot *= Math.exp(-dt * 1.5);
    } else {
      const { M, Q, a, B } = sim.params;
      const type = sim.params.type || 'bh';
      const { rplus, naked } = phys.horizons(M, Q, a);
      const rIsco = phys.isco(M, a);
      let cap;
      if (type !== 'bh') {
        cap = Math.max(0.4, sim.params.R_star || 3);
      } else if (naked) {
        cap = 0.4;
      } else {
        cap = Math.max(rplus, rIsco * 0.85);
      }

      sim.disc.emissionAccum += sim.disc.emissionRate * dt;
      while (sim.disc.emissionAccum >= 1 && sim.disc.particles.length < sim.disc.maxParticles) {
        spawnParticle(sim);
        sim.disc.emissionAccum -= 1;
      }

      sim.disc.mDotInst = 0;
      const dragCoef = sim.disc.alpha * (0.05 + B * B * 0.7);
      const mriKick = B * 0.05 * Math.sqrt(dt);

      for (let i = sim.disc.particles.length - 1; i >= 0; i--) {
        const p = sim.disc.particles[i];
        const acc = phys.acceleration(p.x, p.y, p.vx, p.vy, M, Q, a, 0, sim.binary || null);
        p.vx += acc.ax * dt;
        p.vy += acc.ay * dt;

        const r = Math.hypot(p.x, p.y);
        if (r > 0.5) {
          const ux = p.x / r, uy = p.y / r;
          const tx = -uy, ty = ux;
          const vt = p.vx * tx + p.vy * ty;
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
          sim.disc.mDotInst += 1;
          sim.disc.totalAccreted += 1;
          sim.disc.particles.splice(i, 1);
        } else if (r > sim.disc.outerR * 2.1) {
          sim.disc.particles.splice(i, 1);
        }
      }
      sim.disc.mDot = sim.disc.mDot * 0.93 + (sim.disc.mDotInst / Math.max(dt, 0.001)) * 0.07;

      // Reconnection flares
      if (B > 0.08 && sim.disc.particles.length > 25) {
        sim.disc.reconnectAccum += B * B * 0.7 * dt;
        while (sim.disc.reconnectAccum >= 1) {
          sim.disc.reconnectAccum -= 1;
          const seed = sim.disc.particles[Math.floor(Math.random() * sim.disc.particles.length)];
          if (seed) {
            sim.disc.reconnects.push({
              x: seed.x, y: seed.y,
              ang: Math.atan2(seed.vy, seed.vx),
              age: 0,
              life: 0.5 + Math.random() * 0.5,
              size: 0.6 + B,
            });
            sim.disc.lastFlareT = sim.t;
            if (sim.t - (sim.disc._lastLog || -10) > 1.2) {
              window.KNSim.logEv(sim, 'amber',
                `MHD reconnection · r=${Math.hypot(seed.x, seed.y).toFixed(1)} M · ΔE ≈ ${(B*B*5).toFixed(2)}`);
              sim.disc._lastLog = sim.t;
            }
          }
        }
      }
    }
    for (let i = sim.disc.reconnects.length - 1; i >= 0; i--) {
      sim.disc.reconnects[i].age += dt;
      if (sim.disc.reconnects[i].age > sim.disc.reconnects[i].life) {
        sim.disc.reconnects.splice(i, 1);
      }
    }
  }

  function jetMetrics(sim) {
    const { M, a, B } = sim.params;
    const aN = Math.abs(a) / M;
    const mDot = sim.disc.enabled ? sim.disc.mDot : 0;
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

  function renderDisc(sim, ctx, w, h, worldToScreen) {
    if (!sim.disc) return;
    if (sim.disc.enabled) {
      for (const p of sim.disc.particles) {
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
    for (const f of sim.disc.reconnects) {
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

  function renderJetCenter(sim, ctx, w, h, worldToScreen) {
    const m = jetMetrics(sim);
    if (m.P < 0.3) return;
    const lum = Math.min(1, m.P / 30);
    const flick = 0.85 + 0.15 * Math.sin(sim.t * 7);
    const radius = 5 + lum * 18;
    const [cx, cy] = worldToScreen(sim, w, h, 0, 0);
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 4);
    grd.addColorStop(0, `oklch(0.96 0.18 290 / ${lum * flick * 0.8})`);
    grd.addColorStop(0.4, `oklch(0.85 0.16 290 / ${lum * 0.25})`);
    grd.addColorStop(1, 'oklch(0.1 0 0 / 0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 4, 0, Math.PI * 2); ctx.fill();
    // small chip overlay near BH
    ctx.fillStyle = `oklch(0.92 0.05 290 / ${0.7})`;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(`JET ⊙ ${m.P.toFixed(1)}`, cx + radius + 6, cy - 4);
    ctx.fillStyle = `oklch(0.72 0.10 290 / 0.7)`;
    ctx.fillText(`Γ ≈ ${m.gamma.toFixed(1)}`, cx + radius + 6, cy + 7);
  }

  window.KNDisc = { initDisc, step, jetMetrics, renderDisc, renderJetCenter };
})();
