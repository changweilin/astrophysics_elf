/* MHD Jet Monitor — floating side-view of the BH showing magnetic field,
 * accretion disc cross-section, and bipolar jets. Collapsible like the
 * Tidal Microscope. Lives in the viewport overlay.
 */

// Does a star have an active MHD engine (disc spun up, or field above the
// jet-launch threshold)? Used to decide whether the body switch is offered.
function bodyHasMHD(sim, which) {
  if (which === 'companion') {
    const bin = sim.binary;
    return !!(bin && bin.enabled && ((sim.disc2 && sim.disc2.enabled) || (bin.B2 || 0) >= 0.05));
  }
  return !!(sim.disc.enabled || (sim.params.B || 0) >= 0.05);
}

// Bundle the params / disc / jet metrics for whichever star the monitor shows,
// so the side elevation + stats render the primary or the companion uniformly.
function mhdView(sim, which) {
  const bin = sim.binary;
  if (which === 'companion') {
    return {
      params: { M: bin.M2, Q: bin.Q2 || 0, a: bin.a2 || 0, B: bin.B2 || 0 },
      disc: sim.disc2,
      center: { x: bin.x2, y: bin.y2 },
      m: window.KNDisc.companionJetMetrics(sim) || { P: 0, P_BZ: 0, P_acc: 0, gamma: 1, theta: 26, eta: 0.057, mDot: 0 },
    };
  }
  const center = (bin && bin.enabled) ? { x: bin.x1, y: bin.y1 } : { x: sim.primary.x, y: sim.primary.y };
  return { params: sim.params, disc: sim.disc, center, m: window.KNDisc.jetMetrics(sim) };
}

function MHDMonitor({ sim, force, onClose }) {
  const [collapsed, setCollapsed] = knUseWinPref('mhd', 'collapsed', false);
  const [which, setWhich] = knUseWinPref('mhd', 'which', 'primary');

  const companionMHD = bodyHasMHD(sim, 'companion');
  const bothMHD = bodyHasMHD(sim, 'primary') && companionMHD;
  // Fall back to the primary if the companion's MHD was switched off.
  const active = (which === 'companion' && companionMHD) ? 'companion' : 'primary';
  const canvasRef = React.useRef(null);
  const drag = knUseDragMove('mhd');   // drag-to-move + resize (persisted; CSS spot until moved)
  React.useEffect(() => { drag.reclamp(); }, [collapsed]);

  // Draw loop. Prefers the 3D MHD engine view (render3d.mjs): the real oblate
  // horizon + ergosphere, disc particles at their true flared-height positions,
  // the poloidal field revolved around the spin axis, and bipolar jet cones
  // whose length/opening follow the live jet metrics — drag to orbit. Falls
  // back to the shared 2D renderMHDSide (also used by mobile).
  const [use3dMHD, setUse3dMHD] = React.useState(false);
  React.useEffect(() => {
    if (collapsed) return;
    const c = canvasRef.current;
    if (!c) return;
    let raf, view = null, ctx = null, triedView = false, wait = 20;
    function tick() {
      raf = requestAnimationFrame(tick);
      if (!triedView) {
        if (window.KNRender3D) {
          triedView = true;
          view = window.KNRender3D.createMHDView(c);
          if (view) setUse3dMHD(true);
        } else if (--wait > 0) {
          return;
        } else {
          triedView = true;
        }
      }
      if (view) { view.update(sim, mhdView(sim, active)); return; }
      if (!ctx) {
        ctx = c.getContext('2d');
        if (!ctx) return;
      }
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr; c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderMHDSide(ctx, w, h, sim, mhdView(sim, active));
    }
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (view) view.dispose(); };
  }, [collapsed, active]);

  const m = mhdView(sim, active).m;
  const off = !bodyHasMHD(sim, active);
  // Publish the active star so the sidebar readout (panel-right §04d) mirrors the
  // window's M1/M2 switch — the data table now lives there, the window is canvas.
  sim.mhdActive = active;

  return (
    <div ref={drag.rootRef}
         className={`microscope mhd-monitor kn-draggable ${collapsed ? 'is-collapsed' : ''} ${drag.dragging ? 'is-dragging' : ''} ${drag.resized ? 'kn-resized' : ''}`}
         style={drag.style}>
      <div className="microscope-head" onPointerDown={drag.onHeadDown}>
        <div className="mh-left">
          <span className="kn-win-close" title={tr('Close', '關閉')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onClose && onClose()}>×</span>
          <span className="mh-chev"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '▾'}</span>
          <span className="mh-title"
                onPointerUp={() => { if (!drag.movedRef.current) setCollapsed(!collapsed); }}>{tr('MHD JET MONITOR', 'MHD 噴流監視器')}</span>
        </div>
        <div className="mh-right" style={{color: m.P > 1 ? 'var(--magenta)' : 'var(--fg-3)'}}>
          {bothMHD && (
            <span className="mh-switch"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}>
              <button className={active === 'primary' ? 'on' : ''}
                onClick={() => { setWhich('primary'); force(); }}>M₁</button>
              <button className={active === 'companion' ? 'on' : ''}
                onClick={() => { setWhich('companion'); force(); }}>M₂</button>
            </span>
          )}
          <span>{off ? tr('INERT', '靜止') : `P = ${m.P.toFixed(2)}`}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="microscope-body">
          <div className="kn-win-screen">
            <canvas ref={canvasRef} className="microscope-canvas mhd-canvas" />
            <div className="microscope-overlay-bl">{use3dMHD
              ? tr('3D · Ω axis ↑↓ · drag to orbit', '3D · Ω 軸 ↑↓ · 拖曳旋轉')
              : tr('SIDE ELEVATION · Ω ↑↓', '側視圖 · Ω ↑↓')}</div>
          </div>
          {/* Numeric jet readout moved to the right sidebar (panel-right §04d). */}
        </div>
      )}
      {!collapsed && <div className="kn-resize-grip" onPointerDown={drag.onResizeDown} />}
    </div>
  );
}

function mhdStatus(off, m) {
  if (off) return tr('inactive — enable disc or raise B', '未啟用 — 開啟吸積盤或提高 B');
  if (m.P < 0.3)  return tr('no collimation · field is sub-critical', '無準直 · 磁場低於臨界');
  if (m.P < 3)    return tr('weak bipolar outflow · Blandford-Payne regime', '微弱雙極外流 · Blandford-Payne 區');
  if (m.P < 15)   return tr('collimated jet · relativistic plasma', '準直噴流 · 相對論性電漿');
  if (m.P < 50)   return tr('powerful jet · approaches quasar luminosity', '強力噴流 · 逼近類星體光度');
  return tr('⚠ extreme magnetar/blazar regime · runaway extraction', '⚠ 極端磁星／耀變體區 · 失控萃取');
}

function renderMHDSide(ctx, w, h, sim, view) {
  view = view || mhdView(sim, 'primary');
  const disc = view.disc;
  // Background
  ctx.fillStyle = 'oklch(0.08 0.018 255)';
  ctx.fillRect(0, 0, w, h);
  // Grid
  ctx.strokeStyle = 'oklch(0.20 0.022 255 / 0.5)';
  ctx.lineWidth = 0.5;
  for (let x = 16; x < w; x += 22) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 16; y < h; y += 22) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const phys = window.KNphysics;
  const { M, Q, a, B } = view.params;
  const m = view.m;
  const { rplus, naked } = phys.horizons(M, Q, a);
  const rErg = phys.ergosphereEq(M, Q);
  const cx = w / 2, cy = h / 2;
  // Display scale derives from the LIVE canvas height so the same 50 M side
  // view auto-fits whatever size this panel gets (desktop window, resized
  // window, mobile profile canvas). Only the camera scales — jet length,
  // field-line loft and disc radii stay the real geometric values.
  const scale = Math.max(1, h) / 50; // px per M (4 px/M at the 200px default)

  // ── Disc particles projected as edge-on slab (radius measured from the host)
  const oc = view.center || { x: 0, y: 0 };
  if (disc && disc.enabled) {
    for (const p of disc.particles) {
      const dpx = p.x - oc.x, dpy = p.y - oc.y;
      const r = Math.hypot(dpx, dpy);
      // radial position in screen x (signed by x), tiny vertical jitter
      const sgn = dpx >= 0 ? 1 : -1;
      const sx = cx + sgn * r * scale;
      const sy = cy + Math.sin(dpx * 1.3 + dpy * 0.9) * Math.max(1.5, scale * 0.6);
      if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue;
      const t = p.t;
      const hue = 30 + t * 200;
      const lit = 0.55 + t * 0.4;
      ctx.fillStyle = `oklch(${lit} ${0.12 + t * 0.08} ${hue} / ${0.7 + t * 0.3})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.9 + t * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // soft disc glow band
    const dg = ctx.createLinearGradient(0, cy - 14, 0, cy + 14);
    dg.addColorStop(0, 'oklch(0.40 0.08 30 / 0)');
    dg.addColorStop(0.5, 'oklch(0.70 0.14 40 / 0.18)');
    dg.addColorStop(1, 'oklch(0.40 0.08 30 / 0)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, cy - 14, w, 28);
  }

  // ── Magnetic field lines (poloidal, wrapping around the BH)
  // An active accretion disc is threaded by magnetic field, so draw field lines
  // whenever the disc is spun up — even if this star's explicit B slider is low
  // or zero (e.g. a companion restored from an older save with B₂ = 0).
  const Bvis = (disc && disc.enabled) ? Math.max(B, 0.18) : B;
  if (Bvis > 0.02) {
    const lineAlpha = 0.25 + Bvis * 0.45;
    ctx.strokeStyle = `oklch(0.70 0.13 200 / ${lineAlpha})`;
    ctx.lineWidth = 1;
    // Loft radii in world units of M (× scale px) so the field geometry keeps
    // its real extent at any canvas size.
    const r0List = [2.5, 5.5, 9, 13, 17.5];
    for (const r0 of r0List) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let t = 0; t <= 1.0001; t += 0.04) {
          const yFrac = (t - 0.5) * 2;
          const yPix = cy + yFrac * h * 0.55;
          const compress = 1 - Math.exp(-(yFrac * yFrac) * 3) * 0.55;
          const xPix = cx + side * r0 * scale * compress;
          if (t === 0) ctx.moveTo(xPix, yPix);
          else ctx.lineTo(xPix, yPix);
        }
        ctx.stroke();
      }
    }
    // helical twist marks (frame dragging × B)
    if (Math.abs(a) > 0.1) {
      ctx.strokeStyle = `oklch(0.75 0.15 250 / ${lineAlpha * 0.7})`;
      ctx.lineWidth = 0.8;
      const dirSign = Math.sign(a);
      for (let k = 0; k < 8; k++) {
        const phase = (sim.t * dirSign * 0.6 + k * Math.PI / 4) % (Math.PI * 2);
        const yPix = cy + Math.sin(phase) * h * 0.4;
        const xOff = Math.cos(phase) * 4.5 * scale;
        ctx.beginPath();
        ctx.moveTo(cx + xOff - 5, yPix);
        ctx.lineTo(cx + xOff + 5, yPix);
        ctx.stroke();
      }
    }
  }

  // ── Bipolar jets (collimated streams along spin axis)
  if (m.P > 0.3) {
    const lum = Math.min(1, m.P / 30);
    const opening = m.theta * Math.PI / 180;
    const len = h * 0.45;
    const baseR = 4 + lum * 3;
    const tipR = baseR + Math.tan(opening) * len * 1.2;
    const flick = 0.85 + 0.15 * Math.sin(sim.t * 9);

    for (const dirY of [-1, 1]) {
      // outer envelope (cooler)
      ctx.fillStyle = `oklch(0.80 0.17 285 / ${lum * 0.35 * flick})`;
      ctx.beginPath();
      ctx.moveTo(cx - baseR, cy + dirY * 5);
      ctx.lineTo(cx + baseR, cy + dirY * 5);
      ctx.lineTo(cx + tipR, cy + dirY * len);
      ctx.lineTo(cx - tipR, cy + dirY * len);
      ctx.closePath();
      ctx.fill();
      // inner spine (hot)
      ctx.fillStyle = `oklch(0.97 0.12 290 / ${lum * 0.85 * flick})`;
      ctx.beginPath();
      ctx.moveTo(cx - baseR * 0.45, cy + dirY * 5);
      ctx.lineTo(cx + baseR * 0.45, cy + dirY * 5);
      ctx.lineTo(cx + tipR * 0.32, cy + dirY * len);
      ctx.lineTo(cx - tipR * 0.32, cy + dirY * len);
      ctx.closePath();
      ctx.fill();
      // Mach knots (subtle bright bands)
      if (m.gamma > 3) {
        const knots = Math.min(5, Math.floor(m.gamma / 4));
        ctx.fillStyle = `oklch(1 0 0 / ${lum * 0.6 * flick})`;
        for (let i = 1; i <= knots; i++) {
          const f = i / (knots + 1);
          const ky = cy + dirY * len * f;
          const kw = (baseR + (tipR - baseR) * f) * 0.55;
          ctx.fillRect(cx - kw * 0.35, ky - 1, kw * 0.7, 1.5);
        }
      }
    }
  }

  // ── Ergosphere (oblate due to spin)
  if (!naked && rErg && rErg > rplus) {
    const polar = phys.ergospherePole(M, Q, a) || rplus;
    ctx.fillStyle = `oklch(0.55 0.10 210 / 0.08)`;
    ctx.strokeStyle = `oklch(0.65 0.12 210 / 0.45)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rErg * scale, polar * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ── Black hole horizon (slightly oblate in spin frame visually)
  if (!naked) {
    const aN = Math.abs(a) / M;
    const rHx = rplus * scale;
    const rHy = rplus * scale * (1 - aN * 0.18);
    ctx.fillStyle = 'oklch(0.04 0 0)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rHx, rHy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rHx, rHy, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Spin axis indicator
  if (Math.abs(a) > 0.05) {
    ctx.strokeStyle = 'oklch(0.78 0.13 210 / 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'oklch(0.78 0.13 210)';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillText(`Ω`, cx + 6, 10);
    ctx.fillText(`Ω`, cx + 6, h - 4);
  }

  // ── Recent reconnection sparkle (along disc plane)
  for (const f of (disc ? disc.reconnects : [])) {
    const dfx = f.x - oc.x, dfy = f.y - oc.y;
    const sgn = dfx >= 0 ? 1 : -1;
    const r = Math.hypot(dfx, dfy);
    const sx = cx + sgn * r * scale;
    const sy = cy + (Math.sin(f.ang * 2) * 1.5);
    const t = f.age / f.life;
    const alpha = (1 - t);
    ctx.fillStyle = `oklch(0.96 0.18 320 / ${alpha})`;
    ctx.beginPath(); ctx.arc(sx, sy, 2 + (1 - t) * 3, 0, Math.PI * 2); ctx.fill();
  }

  // legend
  ctx.fillStyle = 'oklch(0.42 0.014 255)';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillText(tr('B field · disc · jet plasma', 'B 磁場 · 吸積盤 · 噴流電漿'), 10, 12);
}

window.MHDMonitor = MHDMonitor;
// Exposed so the mobile cross-section panel can reuse the jet renderer/view, and
// so the right-sidebar readout (panel-right §04d) can mirror the jet metrics.
window.renderMHDSide = renderMHDSide;
window.mhdView = mhdView;
window.bodyHasMHD = bodyHasMHD;
window.mhdStatus = mhdStatus;
