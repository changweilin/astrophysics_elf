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
    // A demo load / resize queued an auto-fit before the canvas size was
    // known — apply it on the first frame that has real dimensions.
    if (sim._pendingFit) { sim._pendingFit = false; KN.fitView(sim, w, h); }
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

      // ── Mass transfer: Roche lobes, accretion stream, nova & CE glow ──
      const mt = bin.mt;
      // Common-envelope haze — a translucent warm shroud enclosing both stars
      // while the cores spiral in. Drawn first so the stars/stream sit on top.
      if (bin.ceFlash > 0) {
        const k = Math.max(0, Math.min(1, bin.ceFlash / 1.6));
        const ecx = (bx1 + bx2) / 2, ecy = (by1 + by2) / 2;
        const er = Math.hypot(bx2 - bx1, by2 - by1) * 0.75 + 30;
        const hg = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, er);
        hg.addColorStop(0, `oklch(0.70 0.10 60 / ${0.22 * k})`);
        hg.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(ecx, ecy, er, 0, Math.PI * 2); ctx.fill();
      }
      // ── Roche lobes (teardrop equipotentials meeting at L1) ──
      // Drawn as a tear-shaped curve around each star, cusp pointing at the inner
      // Lagrange point between the pair. When a star fills/overflows its lobe the
      // interior is tinted with its surface colour — that gas is what streams to
      // the companion. Computed straight from the masses + separation so the lobes
      // show whenever the indicator is enabled, not only during active transfer.
      if (sim.flags.showRoche) {
        const M1s = sim.params.Msun || 1;
        const M2s = (bin.M2sun != null ? bin.M2sun : bin.M2 * M1s);
        const RL1 = phys.rocheLobeEggleton(M1s, M2s, bin.d);
        const RL2 = phys.rocheLobeEggleton(M2s, M1s, bin.d);
        const cT = sim.params.type || 'bh', sT = bin.type || 'bh';
        const R1 = cT === 'bh' ? 0 : (sim.params.R_star || 0);
        const R2 = sT === 'bh' ? 0 : (bin.R_star2 || 0);
        const ang = Math.atan2(by2 - by1, bx2 - bx1);   // primary → companion
        // Trace one teardrop lobe of radius RL (geometric) around (sx,sy), cusp
        // pointing along `dir` (toward the companion / L1). fillCol tints it if the
        // star overflows (gas filling the lobe); strokeCol outlines it.
        const drawLobe = (sx, sy, RL, dir, overflow, baseT) => {
          if (!(RL > 0)) return;
          const Rp = RL * s;
          const dNose = Rp * 1.30, dBack = Rp * 0.74, W = Rp * 0.82;
          const ca = Math.cos(dir), sa = Math.sin(dir);
          ctx.beginPath();
          for (let i = 0; i <= 64; i++) {
            const t = (i / 64) * Math.PI * 2;
            const nx = Math.cos(t), ny = Math.sin(t) * Math.sin(t / 2);
            const lx = ((dNose + dBack) / 2) * nx + (dNose - dBack) / 2;  // along axis
            const ly = W * ny;                                            // across axis
            const px = sx + lx * ca - ly * sa, py = sy + lx * sa + ly * ca;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          if (overflow) {                       // gas filling/overflowing the lobe
            ctx.fillStyle = phys.tempToColor(baseT || 6000, 0.10);
            ctx.fill();
            ctx.strokeStyle = phys.tempToColor(baseT || 6000, 0.55);
            ctx.lineWidth = 1.3;
          } else {
            ctx.strokeStyle = 'oklch(0.62 0.07 75 / 0.32)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        };
        drawLobe(bx1, by1, RL1, ang, R1 > RL1, sim.params.T_eff);
        drawLobe(bx2, by2, RL2, ang + Math.PI, R2 > RL2, bin.T_eff2);
      }
      // ── Roche-lobe overflow ANIMATION: ballistic gas streams through L1 ──
      // The gas does NOT follow one line — a family of parcels leaves L1 and falls
      // along ballistic trajectories in the rotating frame (both stars' gravity +
      // centrifugal + Coriolis: the restricted three-body problem). We integrate a
      // fan of them (KNphysics.gasStreamPaths) to show the full range the gas can
      // take; it deflects in the orbital sense and, missing a compact accretor,
      // wraps toward an accretion disc. Trajectories are steady in the co-rotating
      // frame, so they are cached and only recomputed when the mass ratio changes.
      if (mt && mt.active && mt.donor) {
        const dn0 = mt.donor === 1 ? [bx1, by1] : [bx2, by2];
        const ac0 = mt.donor === 1 ? [bx2, by2] : [bx1, by1];
        const Tdn = mt.donor === 1 ? (sim.params.T_eff || 6000) : (bin.T_eff2 || 6000);
        const Mdon = mt.donor === 1 ? (sim.params.Msun || 1) : (bin.M2sun || 1);
        const Macc = mt.accretor === 1 ? (sim.params.Msun || 1) : (bin.M2sun || 1);
        const accType = mt.accretor === 1 ? (sim.params.type || 'bh') : (bin.type || 'bh');
        const accRgeo = accType === 'bh'
          ? (mt.accretor === 1 ? M1 : M2) * 1.5
          : ((mt.accretor === 1 ? sim.params.R_star : bin.R_star2) || 3);
        const orbitSign = Math.sign(sim.params.a || 1) || 1;
        const accFrac = Math.max(0.02, Math.min(0.4, accRgeo / Math.max(0.1, bin.d)));
        // Cache the trajectory family; recompute only when q / accretor / sense move.
        const key = `${(Mdon / Math.max(0.05, Macc)).toFixed(2)}|${accFrac.toFixed(2)}|${orbitSign}`;
        if (bin._streamKey !== key || !bin._stream) {
          bin._stream = phys.gasStreamPaths(Mdon, Macc, accFrac, orbitSign, 7);
          bin._streamKey = key;
        }
        const stream = bin._stream;
        const paths = stream.paths;
        // Map a donor-origin path point (donor at 0, accretor at +1) to the screen.
        const axx = ac0[0] - dn0[0], axy = ac0[1] - dn0[1];   // donor→accretor (= 1 unit)
        const pxx = -axy, pxy = axx;                          // perpendicular (Coriolis plane)
        const toScreen = (px, py) => [dn0[0] + px * axx + py * pxx, dn0[1] + px * axy + py * pxy];
        const rand = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

        // ── Gas as a diffusing fluid (physical density + heating) ──
        // Soft parcels are advected along the streamline family, but the DENSITY is
        // highest at L1 and along the central trajectory (the gas is squeezed
        // through the L1 nozzle and stays collimated), thinning downstream as it
        // accelerates (mass-flux continuity). COLOUR follows blackbody temperature
        // that climbs from the donor photosphere at L1 to a shock-heated peak at the
        // accretor — deep potential wells (WD/NS/BH) glow blue-white at the impact.
        const accT = mt.accretor === 1 ? (sim.params.T_eff || 6000) : (bin.T_eff2 || 6000);
        const Tpeak = (accType === 'bh' || accType === 'ns') ? 40000
          : accType === 'wd' ? 30000
          : Math.max(accT || 6000, Tdn * 1.6, 9000);          // shock hot-spot temperature
        // Cache a small ramp of soft sprites from the donor temp (L1) to Tpeak
        // (impact); a parcel picks the sprite matching its heating along the stream.
        const NSP = 5, rampKey = `${Math.round(Tdn / 300)}|${Math.round(Tpeak / 1000)}`;
        if (sim._gasRampKey !== rampKey || !sim._gasRamp) {
          sim._gasRamp = [];
          for (let j = 0; j < NSP; j++) {
            const Tj = Tdn + (Tpeak - Tdn) * (j / (NSP - 1));
            const c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
            if (c) {
              c.width = c.height = 32;
              const gc = c.getContext('2d');
              const gg = gc.createRadialGradient(16, 16, 0, 16, 16, 16);
              gg.addColorStop(0, phys.tempToColor(Tj, 1));
              gg.addColorStop(0.5, phys.tempToColor(Tj, 0.5));
              gg.addColorStop(1, phys.tempToColor(Tj, 0));
              gc.fillStyle = gg; gc.fillRect(0, 0, 32, 32);
              sim._gasRamp.push(c);
            }
          }
          sim._gasRampKey = rampKey;
        }
        const ramp = sim._gasRamp;
        const t = sim.t || 0;
        const axisAngle = Math.atan2(axy, axx);            // donor → companion (toward L1)
        const dnRgeo = (mt.donor === 1 ? sim.params.R_star : bin.R_star2) || 3;
        const dnRpx = dnRgeo * s;
        const L1s = toScreen(stream.xL1 != null ? stream.xL1 : 0.5, 0);
        const coolSpr = ramp && ramp[0];                   // donor-temperature sprite

        // (A) Donor → L1 feeder: the donor's envelope drains toward L1 (the low point
        // of its Roche potential), so gas converges from its companion-facing surface
        // onto the L1 throat — density builds as the parcels reach L1.
        const NF = 56;
        for (let i = 0; i < NF; i++) {
          const r1 = rand(i + 101.1), r2 = rand(i + 203.7), r3 = rand(i + 307.3);
          const phi = axisAngle + (r1 - 0.5) * 1.7;        // L1-facing hemisphere
          const startx = dn0[0] + Math.cos(phi) * dnRpx, starty = dn0[1] + Math.sin(phi) * dnRpx;
          const uf = ((t * (0.45 + 0.3 * r2)) + r3) % 1;   // 0 at surface → 1 at L1
          const fx = startx + (L1s[0] - startx) * uf, fy = starty + (L1s[1] - starty) * uf;
          const rad = 2.4 + 1.4 * uf;
          const al = 0.06 + 0.16 * uf;                     // densest as it reaches L1
          if (coolSpr) { ctx.globalAlpha = al; ctx.drawImage(coolSpr, fx - rad, fy - rad, rad * 2, rad * 2); }
        }
        ctx.globalAlpha = 1;

        const center = (paths.length - 1) / 2;
        const NP = 240;
        for (let i = 0; i < NP; i++) {
          // Collimate: bias parcels toward the CENTRAL streamline (≈sum-of-3 → bell),
          // so the density is highest along the L1 axis and only sparsely on the
          // outer trajectories (which still mark the full range the gas can reach).
          const gpick = (rand(i + 0.1) + rand(i + 2.3) + rand(i + 5.7)) / 3 - 0.5;
          const si = Math.max(0, Math.min(paths.length - 1, Math.round(center + gpick * (paths.length - 1) * 1.6)));
          const path = paths[si]; const n = path.length; if (n < 3) continue;
          const r1 = rand(i + 1), r2 = rand(i + 7.3), r3 = rand(i + 19.7);
          const speed = 0.32 + 0.30 * r1;
          const u = ((t * speed) + r2) % 1;                 // progress along this streamline
          const idx = Math.min(n - 2, Math.max(0, Math.floor(u * (n - 1))));
          const p0 = path[idx], p1 = path[idx + 1], fr = u * (n - 1) - idx;
          let px = p0[0] + (p1[0] - p0[0]) * fr, py = p0[1] + (p1[1] - p0[1]) * fr;
          const tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tx, ty) || 1;
          const spread = (0.010 + 0.06 * Math.sqrt(u)) * (r3 - 0.5) * 2;   // collimated, mild downstream
          px += (-ty / tl) * spread; py += (tx / tl) * spread;
          const [sx, sy] = toScreen(px, py);
          // Density highest at L1 (u→0) and on the axis; thins downstream / off-axis.
          const offaxis = center > 0 ? Math.abs(si - center) / center : 0;
          const dens = (1 - 0.5 * u) * (1 - 0.4 * offaxis);
          const rad = 2.6 + 5.0 * u;                        // visible, broadens downstream
          const al = 0.09 + 0.24 * Math.max(0, dens);
          // Colour by heating along the stream (donor temp → Tpeak), steeper near impact.
          const sj = (ramp && ramp.length) ? Math.min(ramp.length - 1, Math.floor(Math.pow(u, 1.6) * ramp.length)) : 0;
          const spr = ramp && ramp[sj];
          if (spr) { ctx.globalAlpha = al; ctx.drawImage(spr, sx - rad, sy - rad, rad * 2, rad * 2); }
          else { ctx.fillStyle = phys.tempToColor(Tpeak, al); ctx.beginPath(); ctx.arc(sx, sy, rad * 0.6, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.globalAlpha = 1;

        // (C) Gravitationally-captured gas around a COMPACT accretor: not all the
        // stream falls straight in — a fraction is bound and circularises into an
        // accretion disc orbiting the accretor (Keplerian: inner gas faster, hotter
        // and denser). Stellar accretors instead just take the impact hot spot.
        const accCompact = (accType === 'bh' || accType === 'ns' || accType === 'wd');
        if (accCompact && ramp && ramp.length) {
          const sepScreen = Math.hypot(axx, axy) || 1;
          const accRpx = (accRgeo || 1) * s;
          const rIn = Math.max(4, accRpx * 1.1);
          const rOut = Math.max(rIn * 2.6, Math.min(0.22 * sepScreen, 72));
          const ND = 110;
          for (let i = 0; i < ND; i++) {
            const r1 = rand(i + 501.1), r2 = rand(i + 613.3), r3 = rand(i + 727.7);
            const rr = rIn + (rOut - rIn) * Math.sqrt(r1);        // area-weighted radius
            const om = orbitSign * 1.3 * Math.pow(rIn / rr, 1.5); // Keplerian: inner faster
            const th = r2 * Math.PI * 2 + om * t + (r3 - 0.5) * 0.25;
            const sx = ac0[0] + Math.cos(th) * rr, sy = ac0[1] + Math.sin(th) * rr;
            const rnorm = (rr - rIn) / Math.max(1e-3, rOut - rIn);  // 0 inner, 1 outer
            const sj = Math.min(ramp.length - 1, Math.floor((1 - rnorm) * ramp.length));  // inner hotter
            const spr = ramp[sj];
            const rad = 2.2 + 1.6 * (1 - rnorm);
            const al = 0.07 + 0.18 * (1 - rnorm);            // denser/brighter inner (accumulated)
            if (spr) { ctx.globalAlpha = al; ctx.drawImage(spr, sx - rad, sy - rad, rad * 2, rad * 2); }
          }
          ctx.globalAlpha = 1;
        }

        // Shock-heated impact hot spot at the accretor — colour at the peak temperature.
        const pulse = 0.30 + 0.12 * Math.sin(t * 4);
        const hg = ctx.createRadialGradient(ac0[0], ac0[1], 0, ac0[0], ac0[1], 20);
        hg.addColorStop(0, phys.tempToColor(Tpeak, pulse));
        hg.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(ac0[0], ac0[1], 20, 0, Math.PI * 2); ctx.fill();
      }
      // Nova flash — a brief expanding shell on the accreting white dwarf.
      if (bin.novaFlash > 0 && mt && mt.accretor) {
        const t = Math.max(0, Math.min(1, bin.novaFlash / 1.2));
        const ac = mt.accretor === 1 ? [bx1, by1] : [bx2, by2];
        const nr = Math.max(2, (1 - t) * 48 + 8);
        const ng = ctx.createRadialGradient(ac[0], ac[1], 0, ac[0], ac[1], nr);
        ng.addColorStop(0, `oklch(0.96 0.12 80 / ${t * 0.7})`);
        ng.addColorStop(0.6, `oklch(0.85 0.10 60 / ${t * 0.25})`);
        ng.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = ng;
        ctx.beginPath(); ctx.arc(ac[0], ac[1], nr, 0, Math.PI * 2); ctx.fill();
      }

      // Type I X-ray burst — a hard (blue-white), fast thermonuclear flash on the
      // neutron-star accretor: brighter, smaller and quicker than a WD nova, with
      // a thin shock ring that races outward as it fades.
      if (bin.xrayFlash > 0 && mt && mt.accretor) {
        const t = Math.max(0, Math.min(1, bin.xrayFlash / 0.9));
        const ac = mt.accretor === 1 ? [bx1, by1] : [bx2, by2];
        const xr = Math.max(2, (1 - t) * 30 + 5);
        const xg = ctx.createRadialGradient(ac[0], ac[1], 0, ac[0], ac[1], xr);
        xg.addColorStop(0, `oklch(0.97 0.06 235 / ${t * 0.8})`);
        xg.addColorStop(0.5, `oklch(0.86 0.11 250 / ${t * 0.3})`);
        xg.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = xg;
        ctx.beginPath(); ctx.arc(ac[0], ac[1], xr, 0, Math.PI * 2); ctx.fill();
        const ring = Math.max(2, (1 - t) * 34 + 4);
        ctx.strokeStyle = `oklch(0.92 0.07 240 / ${t * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ac[0], ac[1], ring, 0, Math.PI * 2); ctx.stroke();
      }

      // Accretion-induced collapse — the neutron-star accretor implodes to a black
      // hole: a blue-white shell that CONTRACTS (rather than expands) onto a new,
      // shrinking horizon, with a brief neutrino-bright core, then settles.
      if (bin.aicFlash > 0 && bin.aicAt) {
        const t = Math.max(0, Math.min(1, bin.aicFlash / 1.4));
        const ac = bin.aicAt === 1 ? [bx1, by1] : [bx2, by2];
        const collapseR = Math.max(2, t * 40 + 4);      // large early, shrinks to the core
        const ag = ctx.createRadialGradient(ac[0], ac[1], 0, ac[0], ac[1], collapseR);
        ag.addColorStop(0, `oklch(0.98 0.05 230 / ${(1 - t) * 0.85})`);
        ag.addColorStop(0.45, `oklch(0.80 0.12 255 / ${t * 0.35})`);
        ag.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.arc(ac[0], ac[1], collapseR, 0, Math.PI * 2); ctx.fill();
        // In-falling shock ring closing on the new horizon.
        const inR = Math.max(2, t * 30 + 3);
        ctx.strokeStyle = `oklch(0.88 0.09 250 / ${(1 - t) * 0.5})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(ac[0], ac[1], inR, 0, Math.PI * 2); ctx.stroke();
      }

      // Primary — stellar or black hole. A stellar primary is drawn at its
      // photosphere R_star so the visible disk matches the collision surface the
      // inspiral uses (surface1 = R_star); otherwise its tiny horizon would make
      // the companion "merge" while still visually far away.
      const cType = sim.params.type || 'bh';
      const { rplus: rp1, naked: n1 } = phys.horizons(M1, Q, a);
      if (cType !== 'bh') {
        const Rs1 = sim.params.R_star || 3;
        const T1 = sim.params.T_eff || 1e6;
        const g1 = phys.stellarGlow(sim.params._L);   // brightness ∝ luminosity
        const col1 = phys.tempToColor(T1, 1, g1);
        const colHalo1 = phys.tempToColor(T1, 0.14 + 0.28 * g1, g1);
        const haloR1 = Math.max(Rs1 * s * (1.35 + 0.75 * g1), Rs1 * s + 10 + 20 * g1);
        const grdH1 = ctx.createRadialGradient(bx1, by1, Rs1 * s * 0.8, bx1, by1, haloR1);
        grdH1.addColorStop(0, colHalo1);
        grdH1.addColorStop(1, 'oklch(0.06 0 0 / 0)');
        ctx.fillStyle = grdH1;
        ctx.beginPath(); ctx.arc(bx1, by1, haloR1, 0, Math.PI*2); ctx.fill();
        const grdS1 = ctx.createRadialGradient(bx1, by1, 0, bx1, by1, Rs1 * s);
        grdS1.addColorStop(0, col1);
        grdS1.addColorStop(0.7, col1);
        grdS1.addColorStop(1, phys.tempToColor(T1, 0.05 + 0.10 * g1, g1));
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
        const g2 = phys.stellarGlow(bin._L2);          // brightness ∝ luminosity
        const col = phys.tempToColor(T2, 1, g2);
        const colHalo = phys.tempToColor(T2, 0.14 + 0.28 * g2, g2);
        const haloR2 = Math.max(Rs2 * s * (1.35 + 0.75 * g2), Rs2 * s + 10 + 20 * g2);
        const grdH2 = ctx.createRadialGradient(bx2, by2, Rs2 * s * 0.8, bx2, by2, haloR2);
        grdH2.addColorStop(0, colHalo);
        grdH2.addColorStop(1, 'oklch(0.06 0 0 / 0)');
        ctx.fillStyle = grdH2;
        ctx.beginPath(); ctx.arc(bx2, by2, haloR2, 0, Math.PI*2); ctx.fill();
        const grdS2 = ctx.createRadialGradient(bx2, by2, 0, bx2, by2, Rs2 * s);
        grdS2.addColorStop(0, col);
        grdS2.addColorStop(0.7, col);
        grdS2.addColorStop(1, phys.tempToColor(T2, 0.05 + 0.10 * g2, g2));
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
      // Brightness follows luminosity (the H-R diagram's vertical axis): a
      // luminous giant / O-star glows far more than a faint white or red dwarf.
      // Colour still comes from temperature; `g` only modulates the glow. Gentle.
      const g = phys.stellarGlow(sim.params._L);
      const col = phys.tempToColor(T, 1, g);
      const colHalo = phys.tempToColor(T, 0.14 + 0.30 * g, g);
      const colCorona = phys.tempToColor(T, 0.05 + 0.12 * g, g);
      // outer corona / glow — radius and opacity grow with luminosity
      const haloR = Math.max(Rs * s * (1.4 + 0.8 * g), Rs * s + 12 + 24 * g);
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
      // luminous-core highlight — a soft brightening for high-L stars only
      if (g > 0.45) {
        const hi = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rs * s * 0.55);
        hi.addColorStop(0, phys.tempToColor(T, 0.22 * (g - 0.45), 1));
        hi.addColorStop(1, phys.tempToColor(T, 0, 1));
        ctx.fillStyle = hi;
        ctx.beginPath(); ctx.arc(cx, cy, Rs * s * 0.55, 0, Math.PI * 2); ctx.fill();
      }
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

    // Type Ia supernova flash — a bright expanding shell from the disrupted white
    // dwarf. Visible but gentle (warm white→amber), centred on the scene.
    if (sim.binary && sim.binary.snFlash > 0 && w > 0 && h > 0) {
      const t = Math.max(0, Math.min(1, sim.binary.snFlash / 1.8));
      const alpha = Math.min(1, t * 2);
      const radius = Math.max(1, (1 - t) * Math.min(w, h) * 0.85);
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grd.addColorStop(0, `oklch(0.97 0.10 90 / ${alpha * 0.85})`);
      grd.addColorStop(0.45, `oklch(0.82 0.16 55 / ${alpha * 0.4})`);
      grd.addColorStop(1, 'oklch(0.1 0 0 / 0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
      if (t > 0.55) {
        ctx.fillStyle = `oklch(0.97 0.10 80 / ${(t - 0.55) * 2.2 * alpha})`;
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(tr('TYPE Ia SUPERNOVA', 'Ia 型超新星'), cx, cy - 8);
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = `oklch(0.85 0.10 55 / ${(t - 0.55) * 2.2 * alpha})`;
        ctx.fillText(tr('WD → Chandrasekhar · detonation', '白矮星 → 錢德拉塞卡極限 · 爆轟'), cx, cy + 8);
        ctx.textAlign = 'left';
      }
    }

    // Multi-phase post-coalescence transient (tidal-tail ejecta, short-GRB jet,
    // blue/red kilonova, r-process cloud, luminous red nova, WD debris disc).
    drawTransient(sim, ctx, w, h, cx, cy, s);

    // Galaxy/cluster diffuse glow — a soft halo whose RADIUS tracks the structure's
    // visible R (R ∝ N^(1/3)) and whose brightness tracks its member fraction, so a
    // structure visibly swells / brightens as it gains stars and shrinks / dims as it
    // sheds them. Muted (never neon); drawn under the swarm dots.
    drawStructureGlow(sim, ctx, w, h, s);

    // Tidal-disruption flares — a short soft glow on the core that just shredded
    // a member star (sim._tdeFlares, sim.js armTDEFlare). Muted, brief, anchored
    // to the swallowing core's CURRENT position so it rides the orbit.
    drawTDEFlares(sim, ctx, w, h, s);

    // Per-structure brightness multiplier for the swarm dots: denser structures glow
    // a touch harder (rel = density / seed-density = frac^(1/3)). Gentle band.
    const bri = (frac) => Math.max(0.45, Math.min(1.2, 0.6 + 0.55 * Math.cbrt(Math.max(1e-3, frac || 0))));
    const briCentral = bri(sim._cloudFrac1), briCompanion = bri(sim._cloudFrac2);

    // ---- Bodies & trails ----
    for (const b of sim.bodies) {
      // Galaxy/cluster cloud particles: hundreds of test stars/gas — draw as light
      // dots and skip the per-body trail / label / tidal-stretch overlays (perf).
      if (b._cloud) {
        if (b.state !== 'orbit') continue;
        // Stripped stream stars carry a short bounded trail (sim.js) — draw it first as
        // a faint arc: these arcs ARE the visible tidal tails / stellar streams. Muted
        // warm tint, gentle alpha (never neon, per the project's visual rule).
        if (b._stream && b.trail && b.trail.length > 4 && sim.flags.showOrbits) {
          ctx.lineWidth = 1;
          // A hypervelocity ejection streaks cool blue-white; ordinary stripped
          // stream stars keep the warm tidal-tail tint.
          ctx.strokeStyle = b._hvs ? 'oklch(0.86 0.05 250 / 0.30)' : 'oklch(0.78 0.05 70 / 0.25)';
          ctx.beginPath();
          const [tx0, ty0] = worldToScreenInto(sim, w, h, b.trail[0], b.trail[1]);
          ctx.moveTo(tx0, ty0);
          for (let i = 2; i < b.trail.length; i += 2) {
            const [tx, ty] = worldToScreenInto(sim, w, h, b.trail[i], b.trail[i + 1]);
            ctx.lineTo(tx, ty);
          }
          ctx.stroke();
        }
        const [px, py] = worldToScreen(sim, w, h, b.x, b.y);
        const bf = b._cloudRole === 'companion' ? briCompanion
                 : b._cloudRole === 'central'   ? briCentral : 0.85;
        const a = Math.min(1, (b.kind === 'gas' ? 0.55 : 0.85) * bf);
        // Starburst newborns (b._bornAt, sim.js stepStarburst) read as young blue
        // stars for a few time units — slightly larger, cool-tinted, fading gently
        // back into the population (muted per the visual rule, never a flare).
        const young = b._bornAt != null ? Math.max(0, 1 - (sim.t - b._bornAt) / 4) : 0;
        // A stream star reads slightly warmer than the bound members so the tails /
        // streams separate visually from the structures shedding them.
        // A hypervelocity star (b._hvs, sim.js Hills detection) reads as a slightly
        // larger cool blue-white runaway, distinct from the warm stream stars.
        ctx.fillStyle = young > 0 ? `oklch(${0.84 + 0.06 * young} ${0.06 + 0.05 * young} 235 / ${Math.min(1, a + 0.12 * young)})`
                      : b._hvs    ? `oklch(0.92 0.05 250 / ${Math.min(1, a + 0.1)})`
                      : b._stream ? `oklch(0.84 0.07 70 / ${a})` : colorOf(b, a);
        ctx.beginPath();
        ctx.arc(px, py, (b.kind === 'gas' ? 1.1 : 1.5) + 0.7 * young + (b._hvs ? 0.5 : 0), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
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

  // ── Galaxy / cluster diffuse glow ───────────────────────────────────────
  // A soft radial halo for each active structure, centred on its core. The radius is
  // the structure's live visible R (sim._Rvis*, which scales as N^(1/3)) and the
  // opacity tracks its member fraction, so the glow visibly grows + brightens as a
  // structure gains stars and shrinks + dims as it sheds them. Muted per the project's
  // visual rule (gentle, never neon). Galaxies read cooler/blue, clusters warmer/gold.
  function drawStructureGlow(sim, ctx, w, h, s) {
    const bin = sim.binary;
    const binOn = !!(bin && bin.enabled);
    const draw = (key, Rvis, frac, wx, wy, isGalaxy) => {
      if (!(Rvis > 0) || !(frac > 0)) return;
      const [px, py] = worldToScreen(sim, w, h, wx, wy);
      const R = Rvis * s;
      if (!(R > 2)) return;
      const op = Math.max(0.04, Math.min(0.20, 0.06 + 0.16 * Math.min(1.4, frac)));
      const hue = isGalaxy ? 255 : 80;          // blue-violet galaxy vs golden cluster
      const grd = ctx.createRadialGradient(px, py, R * 0.12, px, py, R);
      grd.addColorStop(0, `oklch(0.85 0.07 ${hue} / ${op})`);
      grd.addColorStop(0.55, `oklch(0.72 0.06 ${hue} / ${op * 0.45})`);
      grd.addColorStop(1, `oklch(0.60 0.05 ${hue} / 0)`);
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
    };
    // Faint dark-matter halo extent — a barely-there dashed ring at the binding
    // halo's radius (galaxies only; the invisible mass made just visible enough
    // to teach that it is there, per the "faint optional halo" design note).
    const drawDM = (halo, wx, wy) => {
      if (!halo || !(halo.R > 0) || !(halo.M > 0)) return;
      const [px, py] = worldToScreen(sim, w, h, wx, wy);
      const R = halo.R * s;
      if (!(R > 8)) return;
      ctx.strokeStyle = 'oklch(0.75 0.04 290 / 0.10)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 7]);
      ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    };
    const isCloud = (k) => k === 'galaxy' || k === 'cluster' || k === 'opencluster';
    if (isCloud(sim.smbhStructure)) {
      const cx = binOn ? bin.x1 : 0, cy = binOn ? bin.y1 : 0;
      draw(sim.smbhStructure, sim._Rvis1, sim._cloudFrac1, cx, cy, sim.smbhStructure === 'galaxy');
      if (sim.smbhStructure === 'galaxy') drawDM(sim._halo1, cx, cy);
    }
    if (binOn && isCloud(bin.smbhStructure)) {
      draw(bin.smbhStructure, sim._Rvis2, sim._cloudFrac2, bin.x2, bin.y2, bin.smbhStructure === 'galaxy');
      if (bin.smbhStructure === 'galaxy') drawDM(sim._halo2, bin.x2, bin.y2);
    }
  }

  // ── Tidal-disruption flares ─────────────────────────────────────────────
  // Each entry in sim._tdeFlares marks a member star shredded by a core BH
  // (sim.js, the loss-cone swallow path). The flare is a soft expanding glow
  // that fades over ~2.5 t-units — clearly visible but gentle, never neon.
  function drawTDEFlares(sim, ctx, w, h, s) {
    const list = sim._tdeFlares;
    if (!list || !list.length) return;
    const bin = sim.binary, binOn = !!(bin && bin.enabled);
    for (const f of list) {
      const age = sim.t - f.t0;
      if (age < 0 || age >= 2.5) continue;
      if (f.role === 'companion' && !binOn) continue;   // anchor gone (post-merger)
      const wx = f.role === 'companion' ? bin.x2 : (binOn ? bin.x1 : 0);
      const wy = f.role === 'companion' ? bin.y2 : (binOn ? bin.y1 : 0);
      const [px, py] = worldToScreen(sim, w, h, wx, wy);
      const u = age / 2.5;
      const R = Math.max(4, (3 + 9 * u) * s);
      const a = 0.30 * (1 - u) * (1 - u);     // quick-rise slow-fade luminosity
      const grd = ctx.createRadialGradient(px, py, 0, px, py, R);
      grd.addColorStop(0, `oklch(0.92 0.09 75 / ${a})`);
      grd.addColorStop(0.5, `oklch(0.82 0.08 55 / ${a * 0.5})`);
      grd.addColorStop(1, 'oklch(0.70 0.06 40 / 0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Post-coalescence transient choreography ─────────────────────────────
  // Draws the seconds-long aftermath of a coalescence so a merger reads as a
  // continuous physical event — matter is flung off, a relativistic jet lights,
  // a kilonova swells and reddens, freshly-forged heavy elements drift outward —
  // rather than two bodies snapping into one. Anchored at the scene centre (cx,cy)
  // where the remnant is drawn; sim.transient (set by armTransient) carries the
  // channel flags + jet axis. Kept gentle/muted per the project's visual rule.
  function drawTransient(sim, ctx, w, h, cx, cy, s) {
    const tx = sim.transient;
    if (!tx || !(w > 0) || !(h > 0)) return;
    const T = tx.t;                       // seconds since coalescence
    const span = Math.min(w, h);
    const ax = tx.axis || 0;
    const ej = Math.max(0.2, tx.ejecta || 0.5);
    // Phase helpers: ramp = clamped 0→1 over [a,b]; bell = 0→1→0 over [a,b].
    const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    const bell = (t, a, b) => (t <= a || t >= b) ? 0 : Math.sin(Math.PI * (t - a) / (b - a));
    const rand = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

    ctx.save();

    // (1) Tidal-tail ejecta — two trailing arms of matter flung tangentially as the
    // cores touch, winding outward in the orbital sense and dispersing. This is the
    // smooth bridge from "two bodies" to "one remnant": the lost mass is visibly
    // thrown off. Skipped for a clean BH-BH pair (no matter) — that stays pure GW.
    if (tx.kind !== 'gw') {
      const tailDur = tx.lrn ? 2.6 : 1.7;
      const p = ramp(T, 0, tailDur);
      if (p < 1) {
        const grow = 1 - Math.pow(1 - p, 2);             // ease-out expansion
        const fade = (1 - p) * Math.min(1, T / 0.15);    // quick rise, slow fade
        // Cool neutron-rich ejecta (compact) vs warm stellar ejecta (LRN / Ia).
        const hue = (tx.kind === 'nsns' || tx.kind === 'nsbh') ? 32 : tx.lrn ? 40 : 55;
        const chroma = tx.lrn ? 0.12 : 0.13;
        const orbDir = Math.sign(Math.sin(ax)) || 1;     // wind in the orbital sense
        for (let arm = 0; arm < 2; arm++) {
          const base = ax + Math.PI / 2 + arm * Math.PI;  // tangential, two opposite arms
          const N = 26;
          for (let i = 0; i < N; i++) {
            const f = i / (N - 1);
            const swirl = orbDir * (0.9 + 1.4 * ej) * f;   // logarithmic-spiral wind
            const ang = base + swirl;
            const rr = (0.03 + (0.34 + 0.18 * ej) * f) * span * grow;
            const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
            const a0 = fade * (0.26 * (1 - f));
            if (a0 <= 0.004) continue;
            const rad = (2.4 + 4 * (1 - f)) * (0.7 + 0.5 * ej);
            const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
            g.addColorStop(0, `oklch(${0.78 - 0.16 * f} ${chroma} ${hue} / ${a0})`);
            g.addColorStop(1, 'oklch(0.1 0 0 / 0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    // (2) Short gamma-ray burst — a bipolar relativistic jet along the orbital
    // axis, launched within a fraction of a second of merger from the accreting
    // remnant. The forward jet is Doppler-beamed brighter than the counter-jet.
    if (tx.grb) {
      const k = bell(T, 0.10, 1.5);
      if (k > 0.01) {
        const L = span * (0.26 + 0.30 * ramp(T, 0.10, 0.8));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ax);
        for (const dir of [1, -1]) {
          const beam = dir === 1 ? 1 : 0.5;               // relativistic beaming
          const w0 = 4, w1 = Math.max(6, L * 0.11);
          const g = ctx.createLinearGradient(0, 0, dir * L, 0);
          g.addColorStop(0, `oklch(0.97 0.08 245 / ${0.5 * k * beam})`);
          g.addColorStop(0.5, `oklch(0.90 0.11 250 / ${0.26 * k * beam})`);
          g.addColorStop(1, 'oklch(0.1 0 0 / 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, -w0);
          ctx.lineTo(dir * L, -w1);
          ctx.lineTo(dir * L, w1);
          ctx.lineTo(0, w0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = `oklch(0.99 0.05 240 / ${0.45 * k * beam})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dir * L, 0); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // (3) Kilonova — the quasi-thermal glow of the radioactive r-process ejecta.
    // It opens BLUE (early, lanthanide-poor polar ejecta) and reddens as the
    // lanthanide-rich tidal ejecta dominates, swelling as it expands.
    if (tx.kilonova) {
      const blueA = (1 - ramp(T, 0.5, 2.6)) * Math.min(1, T / 0.4) * 0.42;
      if (blueA > 0.01) {
        const rb = span * (0.05 + 0.20 * ramp(T, 0.4, 3.0)) * (0.7 + 0.6 * ej);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rb);
        g.addColorStop(0, `oklch(0.88 0.09 240 / ${blueA})`);
        g.addColorStop(0.6, `oklch(0.78 0.10 250 / ${blueA * 0.4})`);
        g.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rb, 0, Math.PI * 2); ctx.fill();
      }
      const redA = bell(T, 0.9, tx.dur) * 0.5;
      if (redA > 0.01) {
        const rr = span * (0.06 + 0.27 * ramp(T, 1.0, tx.dur)) * (0.7 + 0.6 * ej);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, `oklch(0.70 0.14 34 / ${redA})`);
        g.addColorStop(0.55, `oklch(0.58 0.15 28 / ${redA * 0.45})`);
        g.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      }
    }

    // (4) r-process ejecta cloud — a diffuse, clumpy shell of newly-forged heavy
    // elements drifting outward and shimmering as it cools (copper-red glints).
    if (tx.rProcess) {
      const p = ramp(T, 1.1, tx.dur);
      const shell = span * (0.10 + 0.30 * p) * (0.7 + 0.6 * ej);
      const fade = bell(T, 1.0, tx.dur);
      if (fade > 0.01) {
        const N = 70;
        for (let i = 0; i < N; i++) {
          const a1 = rand(i + 11.3) * Math.PI * 2;
          const rr = shell * (0.55 + 0.45 * rand(i + 47.1));
          const px = cx + Math.cos(a1) * rr, py = cy + Math.sin(a1) * rr * 0.92;
          const shimmer = 0.5 + 0.5 * Math.sin(T * 3 + i);
          const a0 = fade * (0.05 + 0.12 * rand(i + 91.7)) * shimmer;
          if (a0 <= 0.004) continue;
          const rad = 1.8 + 2.4 * rand(i + 5.5);
          ctx.fillStyle = `oklch(${0.52 + 0.14 * rand(i + 3.1)} 0.11 ${30 + 18 * rand(i + 7.7)} / ${a0})`;
          ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // (5) Luminous red nova — the slow, cool, dusty optical transient of a STELLAR
    // merger (e.g. V1309 Sco): a swelling red envelope that brightens then fades to
    // an even cooler, dustier red over several seconds. No jet, no blue phase.
    if (tx.lrn) {
      const rr = span * (0.06 + 0.22 * ramp(T, 0.3, tx.dur)) * (0.8 + 0.5 * ej);
      const env = bell(T, 0.2, tx.dur);
      if (env > 0.01) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, `oklch(0.74 0.12 48 / ${env * 0.5})`);
        g.addColorStop(0.5, `oklch(0.58 0.14 32 / ${env * 0.3})`);
        g.addColorStop(1, 'oklch(0.1 0 0 / 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
        // Dust wisps — faint cool clumps in the expanding envelope.
        const N = 30;
        for (let i = 0; i < N; i++) {
          const a1 = rand(i + 2.7) * Math.PI * 2;
          const dr = rr * (0.5 + 0.5 * rand(i + 13.1));
          const px = cx + Math.cos(a1) * dr, py = cy + Math.sin(a1) * dr;
          const a0 = env * 0.10 * rand(i + 31.7);
          if (a0 <= 0.004) continue;
          ctx.fillStyle = `oklch(0.46 0.10 30 / ${a0})`;
          ctx.beginPath(); ctx.arc(px, py, 2 + 2 * rand(i + 4.4), 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // (6) WD debris disc — a white dwarf tidally shredded by a compact accretor
    // wraps its stream into a faint, reddened debris disc that orbits and fades.
    if (tx.kind === 'disc') {
      const fade = bell(T, 0.1, tx.dur);
      if (fade > 0.01) {
        const rOut = span * (0.06 + 0.10 * ramp(T, 0.1, tx.dur));
        const N = 90;
        for (let i = 0; i < N; i++) {
          const r1 = rand(i + 101.1), r2 = rand(i + 211.3);
          const rr = rOut * (0.35 + 0.65 * Math.sqrt(r1));
          const om = 1.4 * Math.pow((rOut * 0.35) / Math.max(1, rr), 1.5);
          const th = r2 * Math.PI * 2 + om * T;
          const px = cx + Math.cos(th) * rr, py = cy + Math.sin(th) * rr * 0.5;  // inclined disc
          const a0 = fade * (0.06 + 0.12 * (1 - rr / rOut));
          if (a0 <= 0.004) continue;
          ctx.fillStyle = `oklch(${0.62 - 0.1 * (rr / rOut)} 0.10 45 / ${a0})`;
          ctx.beginPath(); ctx.arc(px, py, 1.6 + 1.4 * (1 - rr / rOut), 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Headline — names the transient as it unfolds (placed below centre so it
    // clears the ringdown / SN labels the merger flash draws at the core). The
    // double-degenerate Ia is already labelled by its SN flash, so it is skipped.
    if (!tx.ddIa) {
      const la = bell(T, 0.2, 2.4);
      if (la > 0.02) {
        const head = {
          nsns: tr('NS-NS MERGER · KILONOVA', '中子星雙星合併 · 千新星'),
          nsbh: tr('NS-BH MERGER · KILONOVA', '中子星-黑洞合併 · 千新星'),
          lrn:  tr('LUMINOUS RED NOVA', '紅色高光度新星'),
          disc: tr('TIDAL DISRUPTION · DEBRIS DISC', '潮汐瓦解 · 碎屑盤'),
        }[tx.kind] || '';
        const sub = tx.grb
          ? tr('short GRB · r-process ejecta', '短伽瑪射線暴 · r-過程拋射物')
          : tx.lrn ? tr('stellar coalescence', '恆星合併')
          : tx.kind === 'disc' ? tr('white dwarf shredded', '白矮星被瓦解') : '';
        const ly = cy + span * 0.20;
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.fillStyle = `oklch(0.86 0.10 ${tx.lrn ? 40 : 250} / ${la})`;
        ctx.fillText(head, cx, ly);
        if (sub) {
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillStyle = `oklch(0.72 0.08 ${tx.lrn ? 36 : 240} / ${la * 0.9})`;
          ctx.fillText(sub, cx, ly + 13);
        }
        ctx.textAlign = 'left';
      }
    }

    ctx.restore();
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
      // Same relativistic circular speed the drop itself uses (see sim.js initBinary).
      const vc = window.KNphysics.circularSpeed(r, sim.params.M, sim.params.Q)
              || Math.sqrt(sim.params.M / Math.max(0.5, r));
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
        if (b.state !== 'orbit' || b._cloud) continue;
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
      if (b.state !== 'orbit' || b._cloud) continue;
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
