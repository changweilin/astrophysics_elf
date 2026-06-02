/* Field cross-section scope — a muted 2D heatmap slice (equatorial plane) of a
 * field. Three views, selected by tab (desktop) or by the shared target cycler
 * (mobile):
 *   'primary'   → gravitational potential well of the system, centred on the
 *                 primary (full superposition of all present masses).
 *   'companion' → same system field, centred on the companion (binary only).
 *   'gw'        → gravitational-wave strain (2θ quadrupole lobes + out-going
 *                 ripples), centred on the radiating source.
 *
 * Desktop: one draggable window (FieldScope) that switches between the views
 * with tabs; it is clamped so it can never leave the viewport. Mobile reuses
 * renderFieldSection inside the existing PROFILE stage cycler.
 *
 * The heatmap is drawn as small filled cells (same approach as the other
 * scopes) — no offscreen buffer — kept soft and low-chroma, never neon.
 */

// ── Field samplers (world-space scalar fields) ─────────────────────────────
// Full-system gravitational well at a world point: Σ m / (r + soft). Both the
// primary and (when bound) the companion contribute, matching the demo's
// "full system field" convention.
function knGravityMasses(sim) {
  const bin = sim.binary;
  const useBin = bin && bin.enabled;
  const masses = [{ x: useBin ? bin.x1 : 0, y: useBin ? bin.y1 : 0, m: sim.params.M }];
  if (useBin) masses.push({ x: bin.x2, y: bin.y2, m: bin.M2 });
  return masses;
}

function knGravityCenter(sim, kind) {
  const bin = sim.binary;
  const useBin = bin && bin.enabled;
  if (kind === 'companion') {
    if (!useBin) return null;            // no companion placed → nothing to slice
    return { x: bin.x2, y: bin.y2 };
  }
  return { x: useBin ? bin.x1 : 0, y: useBin ? bin.y1 : 0 };
}

// GW source + amplitude, mirroring renderGWGrid in sim.js so the slice agrees
// with the main viewport's ripples.
function knGwParams(sim) {
  const bin = sim.binary;
  if (bin && bin.enabled) {
    const pet = bin.lastPeters || { omega: 0, Mc: 0 };
    const omegaGW = Math.max(0.15, (pet.omega || 0) * 2);
    const hAmp = Math.max(0.12, Math.min(1.2, (pet.Mc || 0) * 0.9 / Math.max(0.5, bin.d || 1)));
    return { ok: true, cx: bin.cx || 0, cy: bin.cy || 0, omegaGW, hAmp };
  }
  // Lone primary: the fastest bound orbiter is the quadrupole source.
  let best = null, bestScore = 0;
  for (const b of sim.bodies) {
    if (b.state !== 'orbit') continue;
    const r = Math.hypot(b.x, b.y);
    if (r < 0.5 || r > 40) continue;
    const v = Math.hypot(b.vx, b.vy);
    const score = v / Math.max(0.5, r);
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (!best) return { ok: false };
  const r = Math.hypot(best.x, best.y);
  const v = Math.hypot(best.vx, best.vy);
  const omegaGW = Math.max(0.15, (v / Math.max(1, r)) * 2);
  const hAmp = Math.min(1, 0.3 + 3.5 / Math.max(1.5, r));
  return { ok: true, cx: 0, cy: 0, omegaGW, hAmp };
}

// ── Heatmap renderer (direct cell fill, no offscreen buffer) ───────────────
function renderFieldSection(ctx, w, h, kind, sim) {
  ctx.clearRect(0, 0, w, h);
  if (w < 2 || h < 2) return;

  // Availability gate (companion needs a binary; GW needs a source).
  let center = null, gw = null, ok = true, span;
  if (kind === 'gw') {
    gw = knGwParams(sim);
    ok = gw.ok;
    center = ok ? { x: gw.cx, y: gw.cy } : null;
    span = 28;
  } else {
    center = knGravityCenter(sim, kind);
    ok = !!center;
    span = 14;
  }

  if (!ok) {
    ctx.fillStyle = 'oklch(0.10 0.018 255)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'oklch(0.46 0.014 255)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const msg = kind === 'companion'
      ? tr('NO COMPANION PLACED', '尚未放置伴星')
      : tr('NO GW SOURCE', '無重力波源');
    ctx.fillText(msg, w / 2, h / 2 + 3);
    ctx.textAlign = 'left';
    return;
  }

  const cell = 6;
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  // Fixed display scale (px per M), referenced to the window's default width, so
  // resizing the window widens/narrows the visible field of view rather than
  // zooming the same patch. `span` is the half-FOV (in M) at that default width.
  const REF_W = 248;                       // .field-section default width (styles.css)
  const pxPerM = REF_W / (2 * span);
  const spanX = w / (2 * pxPerM);
  const spanY = h / (2 * pxPerM);

  // GW visualisation constants (match sim.js renderGWGrid).
  let kGW = 0, omegaVis = 0;
  const t = sim.t || 0;
  if (kind === 'gw') {
    const vwave = 4;
    kGW = Math.max(0.45, Math.min(1.6, gw.omegaGW * 3.3));
    omegaVis = kGW * vwave;
  }
  const masses = kind === 'gw' ? null : knGravityMasses(sim);

  // Pass 1: sample the scalar field at each cell centre; track peak magnitude.
  const vals = new Float32Array(cols * rows);
  let maxMag = 1e-6;
  for (let j = 0; j < rows; j++) {
    const wy = center.y + (((j + 0.5) * cell / h) - 0.5) * 2 * spanY;
    for (let i = 0; i < cols; i++) {
      const wx = center.x + (((i + 0.5) * cell / w) - 0.5) * 2 * spanX;
      let val;
      if (kind === 'gw') {
        const ex = wx - gw.cx, ey = wy - gw.cy;
        const r = Math.hypot(ex, ey) + 0.6;
        const th = Math.atan2(ey, ex);
        const env = gw.hAmp / Math.sqrt(r) * Math.exp(-r / 90);
        val = env * Math.cos(2 * th + kGW * r - omegaVis * t);
      } else {
        let well = 0;
        for (const s of masses) well += s.m / (Math.hypot(wx - s.x, wy - s.y) + 0.5);
        val = well;
      }
      vals[j * cols + i] = val;
      const mag = Math.abs(val);
      if (mag > maxMag) maxMag = mag;
    }
  }

  // Pass 2: muted colour map. Gravity darkens with well depth; GW diverges
  // (warm crest / cool trough) around a dark-slate neutral.
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const val = vals[j * cols + i];
      let style;
      if (kind === 'gw') {
        const tt = Math.max(-1, Math.min(1, val / maxMag));
        const L = (0.28 + 0.18 * tt).toFixed(3);
        const hue = tt >= 0 ? 70 : 262;
        style = `oklch(${L} 0.05 ${hue})`;
      } else {
        const tt = Math.max(0, Math.min(1, val / maxMag));   // 1 deep, 0 far
        const L = (0.5 - 0.42 * tt).toFixed(3);
        style = `oklch(${L} 0.045 255)`;
      }
      ctx.fillStyle = style;
      ctx.fillRect(i * cell, j * cell, cell + 1, cell + 1);
    }
  }

  // Overlay: scale rings + centre marker + axis caption.
  const cx = w / 2, cy = h / 2;   // pxPerM is fixed above → circular rings
  ctx.strokeStyle = 'oklch(0.62 0.02 255 / 0.18)';
  ctx.lineWidth = 1;
  for (let rm = 5; rm <= Math.max(spanX, spanY); rm += 5) {
    ctx.beginPath();
    ctx.arc(cx, cy, rm * pxPerM, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'oklch(0.85 0.05 255 / 0.35)';
  ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();

  ctx.fillStyle = 'oklch(0.58 0.012 255)';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('±' + spanX.toFixed(0) + ' M', 6, h - 6);
}

// ── Desktop: single draggable, viewport-clamped window with view tabs ──────
function FieldScope({ sim }) {
  const [collapsed, setCollapsed] = knUseWinPref('field', 'collapsed', false);
  const [tab, setTab] = knUseWinPref('field', 'tab', 'primary');
  const canvasRef = React.useRef(null);
  const drag = knUseDragMove('field', { x: 14, y: 70 });   // drag-to-move + resize (persisted)

  const hasBin = !!(sim.binary && sim.binary.enabled);
  // Available views (companion only exists in binary mode), cycled by a single
  // click on the header switch.
  const order = ['primary'];
  if (hasBin) order.push('companion');
  order.push('gw');
  const labelOf = (k) => k === 'primary'   ? tr('M1 FIELD', '主星重力場')
                       : k === 'companion' ? tr('M2 FIELD', '伴星重力場')
                       :                     tr('GW SLICE', '重力波');
  // Fall back to the primary view if the active view vanished (companion removed).
  const active = order.indexOf(tab) >= 0 ? tab : 'primary';
  const cycle = () => setTab(order[(order.indexOf(active) + 1) % order.length]);

  // Re-clamp inside the viewport when the collapse toggle changes the height.
  React.useEffect(() => { drag.reclamp(); }, [collapsed]);

  React.useEffect(() => {
    if (collapsed) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf;
    function tick() {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderFieldSection(ctx, w, h, active, sim);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [collapsed, active]);

  return (
    <div ref={drag.rootRef}
         className={`field-section kn-draggable ${collapsed ? 'is-collapsed' : ''} ${drag.dragging ? 'is-dragging' : ''} ${drag.resized ? 'kn-resized' : ''}`}
         style={drag.style}>
      {/* Top row — same format as the MHD monitor header: chevron + title on the
          left, view switch on the right. Single click on the switch cycles to
          the next cross-section. The row is the drag handle (long-press to move);
          the chevron and switch stop the drag so taps don't move the window. */}
      <div className="microscope-head fs-head" onPointerDown={drag.onHeadDown}>
        <div className="mh-left">
          <span className="mh-chev"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '▾'}</span>
          <span className="mh-title">{tr('FIELD PROFILE', '場剖面圖')}</span>
        </div>
        <div className="mh-right">
          <span className="mh-switch" onPointerDown={(e) => e.stopPropagation()}>
            <button className="on" onClick={cycle}
                    title={tr('click to switch cross-section', '單擊切換剖面')}>
              <span className="mh-name">{labelOf(active)}</span> ⟳
            </button>
          </span>
        </div>
      </div>
      {!collapsed && (
        <div className="fs-body">
          <canvas ref={canvasRef} className="fs-canvas" />
        </div>
      )}
      {!collapsed && <div className="kn-resize-grip" onPointerDown={drag.onResizeDown} />}
    </div>
  );
}

window.FieldScope = FieldScope;
window.renderFieldSection = renderFieldSection;
