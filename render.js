/* Renderer for the Kerr-Newman Lab browser demo — split out of sim.js so the
 * simulation core, the canvas renderer, and config persistence each live in one
 * file. Augments window.KNSim with render / renderInteraction / colorOf.
 *
 * Loads AFTER sim.js (see index.html): it pulls the coordinate transforms,
 * camera frame-lock, and trajectory predictors off window.KNSim, and the
 * geometry helpers off window.KNphysics. window.KNDisc is resolved at draw time.
 */
(function () {
  const phys = window.KNphysics;
  const KN = window.KNSim;
  const { worldToScreen, worldToScreenInto, screenToWorld,
          applyFrameLock, predictTrajectory, predictBinaryTrajectory } = KN;

  function render(sim, ctx, w, h) {
    if (KN.syncStellar) KN.syncStellar(sim);   // derived R★/T★ stay current even while paused
    sim._vw = w; sim._vh = h;   // last canvas size — used to fit the camera on placement
    ctx.clearRect(0, 0, w, h);
    applyFrameLock(sim); // re-centre camera before any worldToScreen calls
    const { M, Q, a } = sim.params;
    const type = sim.params.type || 'bh';
    const isBH = type === 'bh';
    const { rplus, naked } = phys.horizons(M, Q, a);
    const rErg = phys.ergosphereEq(M, Q);
    const rIsco = phys.isco(M, a, Q);
    const rPh = phys.photonSphereEq(M, a, Q);
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

    // frame dragging field — each spinning body drags spacetime around it, so in
    // binary mode both stars contribute their own swirl. They are drawn as
    // separate concentric ring sets centred on each body; visually the two fields
    // read as superimposed where they overlap (each segment is alpha-blended).
    if (sim.flags.showDragField) {
      const drawDragField = (dragCx, dragCy, spin, baseR) => {
        if (Math.abs(spin) <= 0.02) return;
        const ringCount = 4;
        const sgn = Math.sign(spin);
        ctx.strokeStyle = 'oklch(0.55 0.10 210 / 0.35)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= ringCount; i++) {
          const r = baseR + i * 2.2;
          const N = 28;
          for (let k = 0; k < N; k++) {
            const ang = (k / N) * Math.PI * 2 + (sim.t * 0.05 * sgn) / (i);
            const x = dragCx + Math.cos(ang) * r * s;
            const y = dragCy + Math.sin(ang) * r * s;
            const tx = -Math.sin(ang) * sgn;
            const ty =  Math.cos(ang) * sgn;
            const len = 6;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + tx * len, y + ty * len);
            ctx.stroke();
          }
        }
      };

      const bin = sim.binary;
      if (bin && bin.enabled) {
        // Primary swirl about (x1,y1) with spin a; companion swirl about
        // (x2,y2) with its own spin a2. The two overlapping fields superimpose.
        const baseR1 = isBH ? (rplus || 1) : Math.max(rplus || 0, sim.params.R_star || 3);
        const [px1, py1] = worldToScreen(sim, w, h, bin.x1, bin.y1);
        drawDragField(px1, py1, a, baseR1);

        const compBH = (bin.type || 'bh') === 'bh';
        const { rplus: rp2 } = phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
        const baseR2 = compBH ? (rp2 || 1) : Math.max(rp2 || 0, bin.R_star2 || 3);
        const [px2, py2] = worldToScreen(sim, w, h, bin.x2, bin.y2);
        drawDragField(px2, py2, bin.a2 || 0, baseR2);
      } else {
        const baseR = isBH ? (rplus || 1) : Math.max(rplus || 0, sim.params.R_star || 3);
        drawDragField(cx, cy, a, baseR);
      }
    }

    // Gravitational-wave ripples (under disc particles, over distance rings)
    if (sim.flags.showGW) renderGW(sim, ctx, w, h);

    // Disc particles (under frame dragging arrows, over distance rings)
    if (window.KNDisc) window.KNDisc.renderDisc(sim, ctx, w, h, worldToScreenInto);

    // Gravitational-lensing bent-ray curves used to overlay here; they now live
    // in the lower pane of the Gravitational Lens window (observer-view.jsx),
    // stacked under the lensed image, so the top-down canvas stays uncluttered.

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
      labelRing(ctx, cx, cy, rErg * s, tr('ergosphere', '動圈'));
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
        const [ts, ty_] = worldToScreenInto(sim, w, h, bin.trail1[0], bin.trail1[1]);
        ctx.moveTo(ts, ty_);
        for (let i = 2; i < bin.trail1.length; i += 2) {
          const [tx, ty] = worldToScreenInto(sim, w, h, bin.trail1[i], bin.trail1[i+1]);
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
        const [ts2, ty2_] = worldToScreenInto(sim, w, h, bin.trail2[0], bin.trail2[1]);
        ctx.moveTo(ts2, ty2_);
        for (let i = 2; i < bin.trail2.length; i += 2) {
          const [tx2, ty2] = worldToScreenInto(sim, w, h, bin.trail2[i], bin.trail2[i+1]);
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

      // Primary — stellar or black hole. A stellar primary is drawn at its
      // photosphere R_star so the visible disk matches the collision surface the
      // inspiral uses (surface1 = R_star); otherwise its tiny horizon would make
      // the companion "merge" while still visually far away.
      const cType = sim.params.type || 'bh';
      const { rplus: rp1, naked: n1 } = phys.horizons(M1, Q, a);
      if (cType !== 'bh') {
        const Rs1 = sim.params.R_star || 3;
        const T1 = sim.params.T_eff || 1e6;
        const col1 = phys.tempToColor(T1, 1);
        const colHalo1 = phys.tempToColor(T1, 0.30);
        const haloR1 = Math.max(Rs1 * s * 1.5, Rs1 * s + 10);
        const grdH1 = ctx.createRadialGradient(bx1, by1, Rs1 * s * 0.8, bx1, by1, haloR1);
        grdH1.addColorStop(0, colHalo1);
        grdH1.addColorStop(1, 'oklch(0.06 0 0 / 0)');
        ctx.fillStyle = grdH1;
        ctx.beginPath(); ctx.arc(bx1, by1, haloR1, 0, Math.PI*2); ctx.fill();
        const grdS1 = ctx.createRadialGradient(bx1, by1, 0, bx1, by1, Rs1 * s);
        grdS1.addColorStop(0, col1);
        grdS1.addColorStop(0.7, col1);
        grdS1.addColorStop(1, phys.tempToColor(T1, 0.10));
        ctx.fillStyle = grdS1;
        ctx.beginPath(); ctx.arc(bx1, by1, Math.max(2, Rs1 * s), 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = phys.tempToColor(T1, 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(bx1, by1, Math.max(2, Rs1 * s), 0, Math.PI*2); ctx.stroke();
        if (sim.flags.showLabels) {
          ctx.fillStyle = phys.tempToColor(T1, 0.85);
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(`M₁ ${(sim.params.Msun || 0).toFixed(1)} M⊙ ${cType.toUpperCase()}`, bx1 + Math.max(2, Rs1*s) + 4, by1 - 4);
        }
      } else if (!n1 && rp1 > 0) {
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
          ctx.fillText(`M₁ ${(sim.params.Msun || 0).toFixed(1)} M⊙`, bx1 + rp1*s + 4, by1 - 4);
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
        ctx.fillText(`M₂ ${(bin.M2sun || 0).toFixed(1)} M⊙${typeTag}`, bx2 + Math.max(2, visualR * s) + 4, by2 - 4);
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
      ctx.fillText(`Mc ${(pet.Mc * (sim.params.Msun || 1)).toFixed(2)} M⊙`, midX + 4, midY + 18);

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
    if (sim.binary && sim.binary.mergerFlash > 0 && w > 0 && h > 0) {
      const t = Math.max(0, Math.min(1, sim.binary.mergerFlash / 1.6));
      const alpha = Math.min(1, t * 2);
      // Expanding shell: radius grows as the flash fades. Guard ≥ 1 and finite
      // so the gradient never gets a negative/NaN radius (which throws).
      const radius = Math.max(1, (1 - t) * Math.min(w, h) * 0.7);
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
        ctx.fillText(tr('GW MERGER · RINGDOWN', '重力波合併 · 衰盪'), cx, cy - 14);
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = `oklch(0.75 0.10 295 / ${(t - 0.6) * 2.5 * alpha})`;
        ctx.fillText(`M_f = ${(sim.params.Msun || 0).toFixed(1)} M⊙`, cx, cy);
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
        const [sx, sy] = worldToScreenInto(sim, w, h, b.trail[0], b.trail[1]);
        ctx.moveTo(sx, sy);
        for (let i = 2; i < b.trail.length; i += 2) {
          const [tx, ty] = worldToScreenInto(sim, w, h, b.trail[i], b.trail[i + 1]);
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
        label = tr('companion', '伴星');
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
        ctx.fillText(trp('moving · {label}', { label }), mx + 24, my - 8);
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
      ctx.fillText(isCompanion ? tr('release → place companion', '放開 → 放置伴星') : tr('release → place', '放開 → 放置'), px + 22, py - 4);
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
        ctx.fillText(isCompanion ? tr('drag from companion → custom v₀', '從伴星拖曳 → 自訂 v₀') : tr('drag from body → launch', '從天體拖曳 → 發射'), bx + 22, by - 6);
        ctx.fillStyle = 'oklch(0.58 0.012 255)';
        ctx.fillText(isCompanion ? tr('release at body → keep stable v_circ', '在伴星上放開 → 保持穩定 v_circ') : tr('release at body for v = 0', '在天體上放開 → v = 0'), bx + 22, by + 8);
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
      const { pts, fate } = isCompanion
        ? predictBinaryTrajectory(sim, vx, vy)
        : predictTrajectory(sim, bodyRef.x, bodyRef.y, vx, vy);
      const fateColor = fate === 'capture' ? 'oklch(0.72 0.20 28 / 0.85)' :
                        fate === 'escape'  ? 'oklch(0.85 0.10 130 / 0.8)' :
                                             (isCompanion ? 'oklch(0.78 0.18 295 / 0.8)' : 'oklch(0.78 0.13 210 / 0.8)');
      ctx.strokeStyle = fateColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const [sx0, sy0] = worldToScreenInto(sim, w, h, pts[0], pts[1]);
      ctx.moveTo(sx0, sy0);
      for (let i = 2; i < pts.length; i += 2) {
        const [tx, ty] = worldToScreenInto(sim, w, h, pts[i], pts[i + 1]);
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
      // Exact-GR reference line (full-physics geodesic for the same launch). Drawn
      // as a muted violet finely-dashed overlay so the GR-vs-Newtonian difference
      // reads at a glance; the solid fate-coloured line above is still the one that
      // matches the live (pseudo-Newtonian) bodies. Single-body aim only.
      if (!isCompanion && KN.predictGeodesicTrajectory) {
        const gr = KN.predictGeodesicTrajectory(sim, bodyRef.x, bodyRef.y, vx, vy);
        if (gr && gr.pts && gr.pts.length >= 4) {
          ctx.strokeStyle = 'oklch(0.80 0.12 300 / 0.6)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          const [gx0, gy0] = worldToScreenInto(sim, w, h, gr.pts[0], gr.pts[1]);
          ctx.moveTo(gx0, gy0);
          for (let i = 2; i < gr.pts.length; i += 2) {
            const [tx, ty] = worldToScreenInto(sim, w, h, gr.pts[i], gr.pts[i + 1]);
            ctx.lineTo(tx, ty);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          const [gex, gey] = worldToScreen(sim, w, h, gr.pts[gr.pts.length - 2], gr.pts[gr.pts.length - 1]);
          ctx.fillStyle = 'oklch(0.80 0.12 300 / 0.85)';
          ctx.font = '8px JetBrains Mono, monospace';
          ctx.fillText('GR', gex + 4, gey - 3);
        }
      }
      // readout
      const v = Math.hypot(vx, vy);
      ctx.fillStyle = isCompanion ? 'oklch(0.82 0.14 295)' : 'oklch(0.80 0.16 75)';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`v0 = ${v.toFixed(3)} c`, px + 10, py - 4);
      ctx.fillStyle = fateColor;
      ctx.font = '9px JetBrains Mono, monospace';
      const fateWord = tr(fate.toUpperCase(), { capture: '落入', escape: '逃逸', bound: '束縛' }[fate] || fate);
      ctx.fillText(trp('fate: {fate}', { fate: fateWord }), px + 10, py + 9);
    }
  }

  // Warped, shaded spacetime grid — a qualitative depiction of curved spacetime
  // around the bodies. It is NOT a numerical solution of Einstein's equations,
  // but it uses the right functional forms and the genuinely relativistic
  // effects, scaled up for legibility:
  //  (1) CURVATURE WELL — each mass funnels the grid radially inward with an
  //      embedding-diagram profile that steepens toward its Schwarzschild
  //      radius r_s = 2M (the Flamm-paraboloid slope dz/dr = √(r_s/(r−r_s))),
  //      and the cells darken with the gravitational potential so the depth of
  //      the well reads at a glance. Present for ANY mass — even a lone one.
  //  (2) FRAME DRAGGING — a spinning body (a≠0) shears the grid azimuthally in
  //      the spin direction, the Lense-Thirring drag ω_drag ∝ J/r³ = M·a/r³.
  //  (3) GRAVITATIONAL WAVES — only a *time-varying* quadrupole (a binary, or an
  //      orbiting body) adds the propagating strain h ∝ cos(2θ − ω(t − r/c))
  //      that ripples the shading outward; a lone, stationary, axisymmetric
  //      mass has a constant quadrupole and radiates none.
  function renderGWGrid(sim, ctx, w, h) {
    const bin = sim.binary;

    // Masses that curve the grid (with spin a, for frame dragging).
    const masses = [];
    if (bin && bin.enabled) {
      masses.push({ x: bin.x1, y: bin.y1, m: sim.params.M, a: sim.params.a || 0 });
      masses.push({ x: bin.x2, y: bin.y2, m: bin.M2,       a: bin.a2 || 0 });
    } else {
      masses.push({ x: 0, y: 0, m: sim.params.M, a: sim.params.a || 0 });
    }

    // Quadrupole wave source (a *time-varying* mass distribution). A binary
    // radiates from its barycentre; otherwise the fastest orbiting body does.
    let wave = false, omegaGW = 0, hAmp = 0, waveCx = 0, waveCy = 0;
    if (bin && bin.enabled) {
      const pet = bin.lastPeters;
      omegaGW = Math.max(0.15, pet.omega * 2);
      hAmp = Math.max(0.12, Math.min(1.2, pet.Mc * 0.9 / Math.max(0.5, bin.d)));
      waveCx = bin.cx; waveCy = bin.cy; wave = true;
    } else {
      const { rplus } = phys.horizons(sim.params.M, sim.params.Q, sim.params.a);
      let best = null, bestScore = 0;
      for (const b of sim.bodies) {
        if (b.state !== 'orbit') continue;
        const r = Math.hypot(b.x, b.y);
        if (r < (rplus || 0.5) || r > 40) continue;
        const v = Math.hypot(b.vx, b.vy);
        const score = v / Math.max(0.5, r);
        if (score > bestScore) { bestScore = score; best = b; }
      }
      if (best) {
        const r = Math.hypot(best.x, best.y);
        const v = Math.hypot(best.vx, best.vy);
        omegaGW = Math.max(0.15, (v / Math.max(1, r)) * 2);
        hAmp = Math.min(1, 0.3 + 3.5 / Math.max(1.5, r));
        wave = true;
      }
    }

    // Visual GW wavefront. The temporal/spatial scales are a *visualisation*
    // mapping (like inspiralRate), decoupled from the slow physical ω so a few
    // crests actually fit the viewport and visibly travel outward. The spatial
    // wavenumber tracks ω, so the ripples tighten into a chirp as the orbit
    // speeds up toward merger.
    const vwave = 4;        // visual wavefront speed (M per unit sim-time)
    const kGW = wave ? Math.max(0.45, Math.min(1.6, omegaGW * 3.3)) : 0;
    const omegaVis = kGW * vwave;   // temporal rate consistent with vwave
    const t = sim.t;

    // World-space field sample → radial funnel + frame-drag shear (displacement),
    // potential-well depth (shading), and GW strain (shading ripple).
    function fieldAt(wx, wy) {
      let dispx = 0, dispy = 0, well = 0;
      for (const src of masses) {
        const ex = wx - src.x, ey = wy - src.y;
        const r = Math.hypot(ex, ey);
        const ux = ex / (r + 1e-6), uy = ey / (r + 1e-6);
        const rs = Math.max(0.6, 2 * src.m);     // Schwarzschild radius ~ 2M
        const rr = Math.max(r, rs * 0.55);       // clamp inside the horizon
        // Radial funnel — broad 1/r dishing that the cap turns into a steep
        // plunge once inside ~r_s, so the well is dramatic but never collapses
        // a node through the centre.
        let pull = 2.8 * src.m / rr;
        const cap = r * 0.78;
        if (pull > cap) pull = cap;
        dispx -= ux * pull;
        dispy -= uy * pull;
        // Lense-Thirring frame dragging — azimuthal shear ∝ M·a/r³, in the
        // spin's direction, vanishing fast with distance (capped near centre).
        if (src.a) {
          let drag = 3.0 * src.m * Math.abs(src.a) / (rr * rr);
          const dcap = r * 0.45;
          if (drag > dcap) drag = dcap;
          const sgn = Math.sign(src.a);
          dispx += -uy * drag * sgn;
          dispy +=  ux * drag * sgn;
        }
        well += src.m / (r + 0.6);               // ∝ Newtonian potential depth
      }
      let hgt = 0;
      if (wave) {
        const ex = wx - waveCx, ey = wy - waveCy;
        const r = Math.hypot(ex, ey) + 0.6;
        const ux = ex / r, uy = ey / r;
        const th = Math.atan2(ey, ex);
        // Outgoing quadrupole wave: 2θ lobes, crests travelling out at vwave.
        const phase = 2 * th + kGW * r - omegaVis * t;
        const env = hAmp / Math.sqrt(r) * Math.exp(-r / 90);   // 1/√r + far fade
        const osc = Math.cos(phase);
        hgt = env * osc;
        // Transverse-traceless strain actually displaces the lattice — a gentle
        // radial breathing so the wavefront is *seen* travelling outward rather
        // than only tinting the gridlines. Capped to stay soft, not flashy.
        const wamp = Math.min(0.5, env * 9);   // world units (M)
        dispx += ux * wamp * osc;
        dispy += uy * wamp * osc;
      }
      return { dispx, dispy, hgt, well };
    }

    // Lattice over the viewport (+margin, so inward-pulled border nodes still
    // cover the edges). Each node is warped and tagged with strain + well depth.
    const stepPx = 20;
    const margin = stepPx * 3;
    const nx = Math.ceil((w + margin * 2) / stepPx) + 1;
    const ny = Math.ceil((h + margin * 2) / stepPx) + 1;
    const px = new Float32Array(nx * ny);
    const py = new Float32Array(nx * ny);
    const ph = new Float32Array(nx * ny);
    const pw = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const sx = -margin + i * stepPx;
        const sy = -margin + j * stepPx;
        const [wx, wy] = screenToWorld(sim, w, h, sx, sy);
        const f = fieldAt(wx, wy);
        const [dsx, dsy] = worldToScreenInto(sim, w, h, wx + f.dispx, wy + f.dispy);
        const k = j * nx + i;
        px[k] = dsx; py[k] = dsy; ph[k] = f.hgt; pw[k] = f.well;
      }
    }

    // Shade a gridline segment: a deep potential well darkens it and makes it
    // more prominent (the curvature reads as a dark, taut funnel), while a GW
    // strain crest brightens / trough dims it (the wave ripples through).
    const segStyle = (hm, wm) => {
      const wn = Math.min(1, wm * 0.55);
      const tt = Math.max(-1, Math.min(1, hm * 4));
      const L = Math.max(0.06, 0.46 - 0.34 * wn + 0.30 * tt).toFixed(3);
      const A = Math.min(0.78, 0.12 + 0.34 * wn + 0.24 * Math.abs(tt)).toFixed(3);
      return `oklch(${L} 0.05 288 / ${A})`;
    };

    ctx.save();
    ctx.lineWidth = 1.5;
    for (let j = 0; j < ny; j++) {            // horizontal lines
      for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        ctx.strokeStyle = segStyle((ph[k] + ph[k + 1]) * 0.5, (pw[k] + pw[k + 1]) * 0.5);
        ctx.beginPath(); ctx.moveTo(px[k], py[k]); ctx.lineTo(px[k + 1], py[k + 1]); ctx.stroke();
      }
    }
    for (let i = 0; i < nx; i++) {             // vertical lines
      for (let j = 0; j < ny - 1; j++) {
        const k = j * nx + i, k2 = k + nx;
        ctx.strokeStyle = segStyle((ph[k] + ph[k2]) * 0.5, (pw[k] + pw[k2]) * 0.5);
        ctx.beginPath(); ctx.moveTo(px[k], py[k]); ctx.lineTo(px[k2], py[k2]); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderGW(sim, ctx, w, h) {
    const { M, Q, a } = sim.params;
    const { rplus } = phys.horizons(M, Q, a);
    const [cx, cy] = worldToScreen(sim, w, h, 0, 0);

    // Always draw the warped, shaded spacetime grid. The field distortion (the
    // grid bending toward each mass) is present for ANY configuration — a lone
    // primary still curves spacetime — so it shows even with no GW source.
    // renderGWGrid only adds the rippling light/dark undulation when a genuine
    // time-varying quadrupole exists (a binary, or an orbiting body); a lone,
    // stationary mass radiates no GW, so its grid simply sits in the static well.
    ctx.save();
    renderGWGrid(sim, ctx, w, h);
    ctx.restore();

    // ── Binary inspiral GW source ────────────────────────
    const bin = sim.binary;
    if (bin && bin.enabled) {
      const pet = bin.lastPeters;
      const omegaGW = pet.omega * 2;  // quadrupole: f_GW = 2 f_orb
      // strain grows as chirp: h ∝ Mc^(5/3) / d
      const h0 = Math.min(1.8, pet.Mc * 0.8 / Math.max(0.5, bin.d));
      const [bx1, by1] = worldToScreen(sim, w, h, bin.x1, bin.y1);
      const [bx2, by2] = worldToScreen(sim, w, h, bin.x2, bin.y2);
      ctx.save();
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
      ctx.fillText(`Mc = ${(pet.Mc * (sim.params.Msun || 1)).toFixed(2)} M⊙  t_c = ${pet.t_merge < 1e5 ? pet.t_merge.toFixed(1) : '∞'} M`, midX + 10, midY + 40);
      ctx.restore();
      return; // skip single-body GW below
    }

    // ── Single-body GW source annotation ─────────────────
    // The grid is already drawn (it shows the static field for any mass). Here
    // we only add the wave readout/axis IF a body is genuinely orbiting — a
    // stationary, axisymmetric mass has a *constant* quadrupole moment and so
    // radiates no GW; the changing position of an orbiting body is the source.
    let primary = null, bestScore = 0;
    for (const b of sim.bodies) {
      if (b.state !== 'orbit') continue;
      const r = Math.hypot(b.x, b.y);
      if (r < (rplus || 0.5) || r > 35) continue;
      const v = Math.hypot(b.vx, b.vy);
      const score = v / Math.max(0.5, r);   // ~ orbital ω
      if (score > bestScore) { bestScore = score; primary = b; }
    }
    if (!primary) return;   // no orbiting mass → no time-varying quadrupole → no wave annotation

    const r = Math.hypot(primary.x, primary.y);
    const v = Math.hypot(primary.vx, primary.vy);
    const omegaOrb = Math.max(0.08, v / Math.max(1, r));
    const compact = Math.min(1, 4 / Math.max(1.5, r));
    const mass = Math.min(1, (primary.binding || 1) / 6);
    const amp = 0.25 + 0.85 * compact * (0.3 + mass);
    const omegaGW = omegaOrb * 2;

    ctx.save();
    // Quadrupole axis toward the orbiting source
    const [bx, by] = worldToScreen(sim, w, h, primary.x, primary.y);
    ctx.strokeStyle = 'oklch(0.78 0.10 288 / 0.4)';
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'oklch(0.80 0.10 288 / 0.8)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(`f_GW ${(omegaGW / (2 * Math.PI)).toFixed(3)} c/M  h ${amp.toFixed(2)}`, bx + 10, by + 18);

    ctx.restore();
  }

  function labelRing(ctx, cx, cy, r, text) {
    ctx.fillStyle = 'oklch(0.58 0.012 255 / 0.9)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(text, cx + r * 0.71, cy - r * 0.71);
  }

  Object.assign(KN, { render, renderInteraction, colorOf });
})();
