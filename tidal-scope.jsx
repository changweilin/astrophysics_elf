/* Tidal Microscope — floating collapsible window inside the viewport.
 * Shows the selected body in close-up, deforming under tidal stress, and
 * the post-disruption debris stream when it spaghettifies.
 */

function TidalMicroscope({ sim, force }) {
  const [collapsed, setCollapsed] = knUseWinPref('tidal', 'collapsed', false);
  const [pinnedId, setPinnedId] = React.useState(null);
  const canvasRef = React.useRef(null);
  const phys = window.KNphysics;
  const drag = knUseDragMove('tidal');   // drag-to-move + resize (persisted; CSS spot until moved)
  React.useEffect(() => { drag.reclamp(); }, [collapsed]);

  // Track selected, but remember the most-recently-disrupted body for a few
  // seconds even after the user clicks elsewhere — TDE is the headline event.
  const sel = sim.bodies.find((b) => b.id === sim.selectedId);
  const body = sel || sim.bodies.find((b) => b.id === pinnedId);

  // Step the inspected target to the previous/next placed body.
  function cycleBody(dir) {
    const list = sim.bodies;
    if (list.length < 2) return;
    let idx = list.findIndex((b) => b.id === (body ? body.id : null));
    if (idx < 0) idx = 0;
    const next = list[(idx + dir + list.length) % list.length];
    sim.selectedId = next.id;
    setPinnedId(null);   // an explicit pick overrides the disruption auto-pin
    force();
  }

  React.useEffect(() => {
    // Pin if a disruption just happened
    const recent = sim.bodies
      .filter((b) => b.state === 'spaghettified' && (sim.t - (b.consumedAt || 0)) < 5)
      .sort((a, b) => (b.consumedAt || 0) - (a.consumedAt || 0))[0];
    if (recent) setPinnedId(recent.id);
  }, [sim.bodies.map((b) => b.state).join(',')]);

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
      renderMicroscope(ctx, w, h, body, sim);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [collapsed, body]);

  const r = body ? Math.hypot(body.x, body.y) : 0;
  const tidal = body && body.state === 'orbit'
    ? phys.tidalStress(r, sim.params.M, body.radius || 0.4, body.binding || 1) : 0;
  const integrity = body ? Math.max(0, Math.min(1, 1 - tidal)) : 0;
  const dA = body && r > 0.01
    ? (300 * sim.params.M * (body.radius || 0.4)) / (r * r * r) : 0;

  const statusText = (() => {
    if (!body) return tr('no target — click a body or place one', '無目標 — 點選或放置一個天體');
    if (body.state === 'captured') return tr('past r₊ · world-line terminated', '越過 r₊ · 世界線終止');
    if (body.state === 'escaped')  return tr('beyond detector envelope', '超出偵測範圍');
    if (body.state === 'spaghettified') return tr('⚠ DISRUPTED · streaming debris', '⚠ 已撕裂 · 碎屑流出');
    if (tidal < 0.15) return tr('tidal field negligible · spherical', '潮汐場可忽略 · 球形');
    if (tidal < 0.5)  return tr('prolate stretch onset · stable', '長球拉伸開始 · 穩定');
    if (tidal < 0.85) return tr('Roche regime · structural strain', 'Roche 區 · 結構應變');
    if (tidal < 1.0)  return tr('◢ approaching disruption threshold', '◢ 逼近撕裂閾值');
    return tr('⚠ CRITICAL · imminent rupture', '⚠ 危急 · 即將碎裂');
  })();

  return (
    <div ref={drag.rootRef}
         className={`microscope kn-draggable ${collapsed ? 'is-collapsed' : ''} ${drag.dragging ? 'is-dragging' : ''} ${drag.resized ? 'kn-resized' : ''}`}
         style={drag.style}>
      <div className="microscope-head" onPointerDown={drag.onHeadDown}>
        <div className="mh-left">
          <span className="mh-chev"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '▾'}</span>
          <span className="mh-title">{tr('TIDAL MICROSCOPE', '潮汐顯微鏡')}</span>
        </div>
        <div className="mh-right">
          {sim.bodies.length > 1 ? (
            <span className="mh-switch"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}>
              <span className="mh-arrow" onClick={() => cycleBody(-1)} title={tr('previous body', '上一個天體')}>‹</span>
              <span className="mh-name">{body ? body.name : tr('— no target —', '— 無目標 —')}</span>
              <span className="mh-arrow" onClick={() => cycleBody(1)} title={tr('next body', '下一個天體')}>›</span>
            </span>
          ) : (
            <span>{body ? body.name : tr('— no target —', '— 無目標 —')}</span>
          )}
        </div>
      </div>

      {collapsed ? (
        <div className="microscope-mini">
          <div className="mm-row">
            <span className="mm-k">{tr('integrity', '完整性')}</span>
            <div className="mm-bar">
              <div className="mm-fill"
                style={{
                  width: (integrity * 100).toFixed(0) + '%',
                  background: tidal > 0.85 ? 'var(--warn)' :
                              tidal > 0.5  ? 'var(--amber)' : 'var(--cyan)'
                }} />
            </div>
            <span className="mm-v">{(integrity * 100).toFixed(0)}%</span>
          </div>
        </div>
      ) : (
        <div className="microscope-body">
          <div className="kn-win-screen">
            <canvas ref={canvasRef} className="microscope-canvas" />
            <div className="microscope-overlay-bl">×{(60).toFixed(0)} {tr('ZOOM · ROCHE FRAME', '放大 · ROCHE 座標')}</div>
          </div>
          <div className="microscope-stats">
            <div className="ms-row">
              <span className="ms-k">r</span>
              <span className="ms-v">{body ? r.toFixed(2) : '—'}<small> M</small></span>
            </div>
            <div className="ms-row">
              <span className="ms-k">Δg across R<sub>b</sub></span>
              <span className="ms-v">{body ? dA.toFixed(3) : '—'}</span>
            </div>
            <div className="ms-row">
              <span className="ms-k">{tr('stretch ratio', '拉伸比')}</span>
              <span className="ms-v">
                {body && body.state === 'orbit'
                  ? (1 + Math.min(3.5, tidal * 2.5)).toFixed(2)
                  : '—'}×
              </span>
            </div>
            <div className={`ms-row integrity-row ${tidal > 0.85 ? 'crit' : tidal > 0.5 ? 'warn' : ''}`}>
              <span className="ms-k">{tr('integrity', '完整性')}</span>
              <div className="ms-bar">
                <div className="ms-fill" style={{ width: (integrity * 100).toFixed(0) + '%' }} />
                <div className="ms-mark roche" />
              </div>
              <span className="ms-v">{(integrity * 100).toFixed(0)}<small>%</small></span>
            </div>
            <div className={`ms-status ${tidal > 0.85 ? 'crit' : tidal > 0.5 ? 'warn' : ''}`}>
              {statusText}
            </div>
          </div>
        </div>
      )}
      {!collapsed && <div className="kn-resize-grip" onPointerDown={drag.onResizeDown} />}
    </div>
  );
}

function renderMicroscope(ctx, w, h, body, sim) {
  // background
  ctx.fillStyle = 'oklch(0.09 0.018 255)';
  ctx.fillRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = 'oklch(0.20 0.022 255 / 0.6)';
  ctx.lineWidth = 0.5;
  for (let x = 16; x < w; x += 22) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 16; y < h; y += 22) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // crosshair
  ctx.strokeStyle = 'oklch(0.26 0.022 255)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

  if (!body) {
    ctx.fillStyle = 'oklch(0.42 0.014 255)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tr('NO TARGET ACQUIRED', '尚未取得目標'), w/2, h/2 + 4);
    ctx.textAlign = 'left';
    return;
  }

  const phys = window.KNphysics;
  const r = Math.hypot(body.x, body.y);
  const tidal = body.state === 'orbit'
    ? phys.tidalStress(r, sim.params.M, body.radius || 0.4, body.binding || 1) : 0;
  const cx = w / 2, cy = h / 2;

  // unit radial vector (pointing TOWARD BH from body)
  let ux = 0, uy = 0;
  if (r > 0.001) { ux = -body.x / r; uy = -body.y / r; }

  // BH direction marker on edge
  ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.65)';
  ctx.fillStyle = 'oklch(0.78 0.16 75 / 0.9)';
  ctx.lineWidth = 1;
  const dx2 = ux * (w * 0.42);
  const dy2 = uy * (h * 0.42);
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + dx2, cy + dy2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(cx + ux * (w * 0.46), cy + uy * (h * 0.46), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.fillStyle = 'oklch(0.78 0.16 75)';
  const lx = cx + ux * (w * 0.5) - (ux > 0 ? 18 : 0);
  const ly = cy + uy * (h * 0.5) - (uy > 0 ? 0 : -8);
  ctx.fillText('→ r₊', lx - 8, ly);

  if (body.state === 'orbit') {
    // Stretching: prolate ellipsoid along radial.
    const stretch = 1 + Math.min(3.5, tidal * 2.5);
    const squish = 1 / Math.sqrt(stretch); // volume preservation
    const baseR = 24;
    const a = baseR * stretch;
    const b = baseR * squish;
    const angle = Math.atan2(uy, ux); // major axis = radial direction

    // colour shift toward red as it strains
    const kind = body.kind || 'planet';
    const baseChroma = 0.13;
    const baseHue = { planet: 210, gas: 75, star: 60, ship: 350, probe: 130 }[kind] || 220;
    const blend = Math.min(1, Math.max(0, (tidal - 0.4) / 0.7));
    const hue = baseHue * (1 - blend) + 28 * blend;
    const lit = 0.78 - blend * 0.05;
    const stressColor = `oklch(${lit} ${baseChroma + blend * 0.05} ${hue})`;
    const glowColor = `oklch(${lit} ${baseChroma + blend * 0.05} ${hue} / 0.35)`;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // glow
    const gradMax = Math.max(a, b) * 1.5;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, gradMax);
    grd.addColorStop(0, glowColor);
    grd.addColorStop(0.5, glowColor);
    grd.addColorStop(1, 'oklch(0.1 0 0 / 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, 0, a * 1.5, b * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = stressColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
    ctx.fill();

    // surface texture (subtle bands)
    if (kind === 'gas') {
      ctx.strokeStyle = `oklch(${lit - 0.1} ${baseChroma} ${hue} / 0.45)`;
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(0, i * b * 0.4, a * 0.95, b * 0.05, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // fracture cracks when high stress
    if (tidal > 0.55) {
      ctx.strokeStyle = 'oklch(0.04 0 0 / 0.65)';
      ctx.lineWidth = 1.2;
      const nCracks = Math.min(7, Math.floor((tidal - 0.45) * 10));
      for (let i = 0; i < nCracks; i++) {
        const seed = i * 12.9898;
        const cy2 = (Math.sin(seed) * 0.7) * b;
        const cl  = a * (0.4 + Math.abs(Math.cos(seed * 2)) * 0.5);
        ctx.beginPath();
        ctx.moveTo(-cl, cy2);
        ctx.lineTo(-cl * 0.5, cy2 + (Math.sin(seed * 3.1) - 0.5) * 3);
        ctx.lineTo( cl * 0.5, cy2 + (Math.cos(seed * 2.7) - 0.5) * 3);
        ctx.lineTo( cl, cy2);
        ctx.stroke();
      }
    }

    ctx.restore();

    // Tidal force arrows on the body's surface
    if (tidal > 0.05) {
      const stretchLen = Math.min(34, 10 + tidal * 18);
      const compLen = Math.min(20, 4 + tidal * 12);
      const intensity = Math.min(1, tidal * 0.6 + 0.4);
      // radial stretch arrows (both ends pulled outward along radial)
      ctx.strokeStyle = `oklch(0.72 0.20 28 / ${intensity})`;
      ctx.fillStyle   = `oklch(0.72 0.20 28 / ${intensity})`;
      ctx.lineWidth = 1.5;
      const nearX = cx + ux * a, nearY = cy + uy * a;       // surface toward BH
      const farX  = cx - ux * a, farY  = cy - uy * a;       // surface away from BH
      msArrow(ctx, nearX, nearY, nearX + ux * stretchLen, nearY + uy * stretchLen);
      msArrow(ctx, farX,  farY,  farX  - ux * stretchLen, farY  - uy * stretchLen);
      // perpendicular compression arrows
      const tx = -uy, ty = ux;
      ctx.strokeStyle = `oklch(0.78 0.13 210 / ${intensity})`;
      ctx.fillStyle   = `oklch(0.78 0.13 210 / ${intensity})`;
      const sx = cx + tx * b, sy = cy + ty * b;
      const sx2 = cx - tx * b, sy2 = cy - ty * b;
      msArrow(ctx, sx,  sy,  sx  - tx * compLen, sy  - ty * compLen);
      msArrow(ctx, sx2, sy2, sx2 + tx * compLen, sy2 + ty * compLen);
    }

  } else if (body.state === 'spaghettified') {
    // debris stream — Hills mechanism: stretched into a thin filament
    // that wraps along the orbit. Half of the material is unbound (radial out),
    // half remains bound and falls in (radial in).
    const age = sim.t - (body.consumedAt || sim.t);
    const tx = -uy, ty = ux;
    const N = 28;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N - 0.5;          // -0.5 .. 0.5
      // along-orbit position
      const along = t * 130;
      // radial offset depending on side: positive t = outbound, negative = infall
      const radial = t * 70 + Math.sign(t) * age * 12;
      const x = cx + tx * along + ux * (radial);
      const y = cy + ty * along + uy * (radial);
      const alpha = Math.max(0, (1 - age / 7)) * (1 - Math.abs(t) * 0.6);
      const sz = 1.8 + Math.abs(t) * 1.2 + Math.sin(i * 1.7 + age) * 0.5;
      ctx.fillStyle = `oklch(0.72 0.20 28 / ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
      // glow halo
      ctx.fillStyle = `oklch(0.80 0.16 75 / ${alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, sz * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // label
    ctx.fillStyle = 'oklch(0.72 0.20 28)';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.fillText(tr('SPAGHETTIFIED', '已拉麵化'), 10, h - 10);
    ctx.fillStyle = 'oklch(0.58 0.012 255)';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillText(`T+${age.toFixed(1)} M`, w - 60, h - 10);
  } else if (body.state === 'captured') {
    // inside horizon — show as void with caption
    ctx.fillStyle = 'oklch(0.04 0 0)';
    ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'oklch(0.78 0.16 75 / 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'oklch(0.62 0.12 75)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tr('PAST r₊', '越過 r₊'), cx, cy + 3);
    ctx.fillText(tr('INACCESSIBLE', '不可及'), cx, cy + 14);
    ctx.textAlign = 'left';
  } else if (body.state === 'escaped') {
    ctx.fillStyle = 'oklch(0.42 0.014 255)';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tr('TRACKED OUT OF FRAME', '已追蹤至畫面外'), w/2, h/2);
    ctx.textAlign = 'left';
  }
}

function msArrow(ctx, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 2) return;
  const ux = dx / L, uy = dy / L;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * 3, y1 - uy * 3);
  ctx.stroke();
  const h = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * h - uy * h * 0.5, y1 - uy * h + ux * h * 0.5);
  ctx.lineTo(x1 - ux * h + uy * h * 0.5, y1 - uy * h - ux * h * 0.5);
  ctx.closePath();
  ctx.fill();
}

window.TidalMicroscope = TidalMicroscope;
// Exposed so the mobile cross-section panel can reuse the same renderer.
window.renderMicroscope = renderMicroscope;
