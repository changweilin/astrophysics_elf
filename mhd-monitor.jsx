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

function MHDMonitor({ sim, force }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [which, setWhich] = React.useState('primary');

  const companionMHD = bodyHasMHD(sim, 'companion');
  const bothMHD = bodyHasMHD(sim, 'primary') && companionMHD;
  // Fall back to the primary if the companion's MHD was switched off.
  const active = (which === 'companion' && companionMHD) ? 'companion' : 'primary';
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    if (collapsed) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf;
    function tick() {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr; c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderMHDSide(ctx, w, h, sim, mhdView(sim, active));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [collapsed, active]);

  const m = mhdView(sim, active).m;
  const off = !bodyHasMHD(sim, active);

  return (
    <div className={`microscope mhd-monitor ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="microscope-head" onClick={() => setCollapsed(!collapsed)}>
        <div className="mh-left">
          <span className="mh-chev">{collapsed ? '▸' : '▾'}</span>
          <span className="mh-title">MHD JET MONITOR</span>
        </div>
        <div className="mh-right" style={{color: m.P > 1 ? 'var(--magenta)' : 'var(--fg-3)'}}>
          {bothMHD && (
            <span className="mh-switch" onClick={(e) => e.stopPropagation()}>
              <button className={active === 'primary' ? 'on' : ''}
                onClick={() => { setWhich('primary'); force(); }}>M₁</button>
              <button className={active === 'companion' ? 'on' : ''}
                onClick={() => { setWhich('companion'); force(); }}>M₂</button>
            </span>
          )}
          <span>{off ? 'INERT' : `P = ${m.P.toFixed(2)}`}</span>
        </div>
      </div>
      {collapsed ? (
        <div className="microscope-mini">
          <div className="mm-row">
            <span className="mm-k">jet P</span>
            <div className="mm-bar">
              <div className="mm-fill"
                style={{
                  width: Math.min(100, m.P * 3.3).toFixed(0) + '%',
                  background: m.P > 5 ? 'var(--magenta)' : m.P > 1 ? 'var(--amber)' : 'var(--cyan-dim)'
                }} />
            </div>
            <span className="mm-v">{m.P.toFixed(1)}</span>
          </div>
        </div>
      ) : (
        <div className="microscope-body">
          <canvas ref={canvasRef} className="microscope-canvas" style={{height: 200}} />
          <div className="microscope-overlay-bl">SIDE ELEVATION · Ω ↑↓</div>
          <div className="microscope-stats">
            <div className="ms-row">
              <span className="ms-k">P_jet · total</span>
              <span className="ms-v" style={{color: m.P > 1 ? 'var(--magenta)' : 'var(--fg-0)'}}>
                {m.P.toFixed(2)}
              </span>
            </div>
            <div className="ms-row">
              <span className="ms-k">  ↳ Blandford-Znajek</span>
              <span className="ms-v">{m.P_BZ.toFixed(2)}</span>
            </div>
            <div className="ms-row">
              <span className="ms-k">  ↳ disc accretion</span>
              <span className="ms-v">{m.P_acc.toFixed(2)}</span>
            </div>
            <div className="ms-row">
              <span className="ms-k">Γ bulk Lorentz</span>
              <span className="ms-v">{m.gamma.toFixed(1)}</span>
            </div>
            <div className="ms-row">
              <span className="ms-k">θ opening</span>
              <span className="ms-v">{m.theta.toFixed(1)}<small>°</small></span>
            </div>
            <div className="ms-row">
              <span className="ms-k">η radiative</span>
              <span className="ms-v">{(m.eta * 100).toFixed(1)}<small>%</small></span>
            </div>
            <div className={`ms-status ${m.P > 5 ? 'crit' : m.P > 1 ? 'warn' : ''}`}>
              {mhdStatus(off, m)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mhdStatus(off, m) {
  if (off) return 'inactive — enable disc or raise B';
  if (m.P < 0.3)  return 'no collimation · field is sub-critical';
  if (m.P < 3)    return 'weak bipolar outflow · Blandford-Payne regime';
  if (m.P < 15)   return 'collimated jet · relativistic plasma';
  if (m.P < 50)   return 'powerful jet · approaches quasar luminosity';
  return '⚠ extreme magnetar/blazar regime · runaway extraction';
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
  const scale = h / 50; // 50 M maps to canvas height

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
  if (B > 0.02) {
    const lineAlpha = 0.25 + B * 0.45;
    ctx.strokeStyle = `oklch(0.70 0.13 200 / ${lineAlpha})`;
    ctx.lineWidth = 1;
    const r0List = [10, 22, 36, 52, 70];
    for (const r0 of r0List) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let t = 0; t <= 1.0001; t += 0.04) {
          const yFrac = (t - 0.5) * 2;
          const yPix = cy + yFrac * h * 0.55;
          const compress = 1 - Math.exp(-(yFrac * yFrac) * 3) * 0.55;
          const xPix = cx + side * r0 * compress;
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
        const xOff = Math.cos(phase) * 18;
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
  ctx.fillText('B field · disc · jet plasma', 10, 12);
}

window.MHDMonitor = MHDMonitor;
