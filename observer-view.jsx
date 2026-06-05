/* Observer View — the gravitational-lensing "camera" panel (Phase 6, P6.3).
 *
 * A draggable floating window (sibling of FieldScope / TidalMicroscope /
 * MHDMonitor) that shows what an observer pointed at the Kerr-Newman object
 * sees: the shadow, the photon ring, a lensed background, and the lensed
 * accretion disc. It does NOT touch the main top-down canvas.
 *
 * Rendering is off-thread and event-driven: it asks window.KNLensing to render
 * only when (M, Q, a) or the camera changes (the bridge debounces, caches, and
 * renders coarse-then-fine), then blits the returned ImageData scaled into the
 * panel canvas. There is no per-frame animation loop — a static lensed image is
 * correct between parameter changes, which keeps the 60 fps main loop free.
 *
 * Resolution comes from the deflection-LUT fast path (PHASE6-LENSING-PLAN.md
 * sec 4.5): the expensive GR ray trace runs once at a low base resolution into a
 * LUT, which the bridge then shades at a higher DISPLAY resolution (smooth
 * bilinear upsample, no extra integration) — so the image is no longer a blocky
 * block-upscale of the trace grid. Because the LUT is azimuth-invariant
 * (Kerr-Newman is axisymmetric), rotating the camera azimuth (AZ) reuses the
 * cached LUT and only re-shades, so it is effectively free.
 *
 * Muted by design (user preference): the renderer already keeps the disc and
 * ring gentle; here we only upscale and annotate.
 */

// Panel preferences (inclination preset + disc toggle) persisted to localStorage,
// mirroring the drag-move window-position persistence. The draggable window's
// position is already saved by knUseDragMove('observer', ...); these are the
// remaining user-chosen settings. Storage is wrapped so private mode can't throw.
const LENS_PREFS_KEY = 'knlens:prefs';
function knReadLensPrefs() {
  try {
    var s = window.localStorage.getItem(LENS_PREFS_KEY);
    if (!s) return null;
    var p = JSON.parse(s);
    return (p && typeof p === 'object') ? p : null;
  } catch (e) { return null; }
}
function knWriteLensPrefs(prefs) {
  try { window.localStorage.setItem(LENS_PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
}

// Compact length read-out for the gravitational radius: km → AU → pc as it grows
// across the black-hole mass scales (a stellar r_g is a few km; a supermassive one
// is astronomical units to parsecs).
function knFmtKmScale(km) {
  const AU = 1.495978707e8, PC = 3.0856776e13;
  if (km >= PC) return (km / PC).toFixed(2) + ' pc';
  if (km >= AU) return (km / AU).toFixed(2) + ' AU';
  if (km >= 1e4) {
    const e = Math.floor(Math.log10(km)); const mant = km / Math.pow(10, e);
    const sup = String(e).replace(/[0-9]/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
    return mant.toFixed(1) + '×10' + sup + ' km';
  }
  return (km >= 100 ? String(Math.round(km)) : km.toFixed(1)) + ' km';
}

// Angular size read-out: mas → μas → nas → pas. The shadow of a stellar/IMBH hole
// is sub-nanoarcsecond (unresolvable); only a supermassive hole reaches the tens of
// μas the Event Horizon Telescope can actually image.
function knFmtAngle(uas) {
  const v = Math.abs(uas || 0);
  if (v >= 1e3)  return (v / 1e3).toFixed(2) + ' mas';
  if (v >= 1)    return v.toFixed(1) + ' μas';
  if (v >= 1e-3) return (v * 1e3).toFixed(1) + ' nas';
  return (v * 1e6).toFixed(1) + ' pas';
}

function ObserverView({ sim }) {
  // Inclination presets (degrees from the spin pole). 90 deg is edge-on.
  const INCL = [20, 40, 60, 80];
  // Camera azimuth presets (degrees). Azimuth reuses the cached LUT, so cycling
  // it is a cheap reshade — it swings the lensed starfield around the hole.
  const AZIM = [0, 60, 120, 180, 240, 300];

  const prefs = React.useMemo(knReadLensPrefs, []); // read saved settings once
  const [collapsed, setCollapsed] = knUseWinPref('observer', 'collapsed', false);
  const [inclIdx, setInclIdx] = React.useState(
    () => (prefs && Number.isInteger(prefs.inclIdx) && prefs.inclIdx >= 0 && prefs.inclIdx < INCL.length)
      ? prefs.inclIdx : 2,
  );
  const [discOn, setDiscOn] = React.useState(
    () => (prefs && typeof prefs.discOn === 'boolean') ? prefs.discOn : true,
  );
  const [azIdx, setAzIdx] = React.useState(
    () => (prefs && Number.isInteger(prefs.azIdx) && prefs.azIdx >= 0 && prefs.azIdx < AZIM.length)
      ? prefs.azIdx : 0,
  );
  const canvasRef = React.useRef(null);
  const offRef = React.useRef(null);              // offscreen buffer for scaling
  const stateRef = React.useRef({ key: null, result: null, pending: false });
  const traceCanvasRef = React.useRef(null);      // lower pane: bent-ray curves
  const traceRef = React.useRef(null);            // cached equatorial-ray polylines
  const drag = knUseDragMove('observer', { x: 14, y: 300 });
  const split = knUseSplit('observer', 0.56);     // lensed-image / ray-trace divider (persisted)

  // Lower pane lens = the system monopole: total mass M1+M2 (charges add; spin is
  // the mass-weighted mean, kept sub-extremal), the self-consistent far-field
  // picture that also fixes the lens centre at the barycentre.
  const bin = sim.binary;
  const useBin = !!(bin && bin.enabled);
  const M1 = sim.params.M, M2 = useBin ? (bin.M2 || 0) : 0;
  const totM = M1 + M2;
  const totQ = sim.params.Q + (useBin ? (bin.Q2 || 0) : 0);
  const totA = (useBin && totM > 0) ? (M1 * sim.params.a + M2 * (bin.a2 || 0)) / totM : sim.params.a;

  // Persist the settings whenever they change (window position persists itself).
  React.useEffect(() => { knWriteLensPrefs({ inclIdx, discOn, azIdx }); }, [inclIdx, discOn, azIdx]);

  const thetaDeg = INCL[inclIdx];
  const azDeg = AZIM[azIdx];

  // Scale-dependent observables. The lensed image above is scale-INVARIANT (it
  // only depends on a/M, Q/M), so it is identical for a stellar-mass and a
  // supermassive hole — correct GR. What changes with the chosen mass scale is the
  // on-sky size: r_g = GM/c² and the shadow's angular diameter θ = b·r_g/D at the
  // regime's representative distance. b comes from the spin/charge-aware ray trace
  // (its critical impact parameter) when available, else the Schwarzschild √27.
  const phys = window.KNphysics;
  const regime = sim.bhRegime || 'stellar';
  const centralBH = (sim.params.type || 'bh') === 'bh';
  const bCritM = (traceRef.current && traceRef.current.bCrit > 0) ? traceRef.current.bCrit : Math.sqrt(27);
  const lensObs = phys.bhObservables(sim.params.Msun, regime, bCritM);
  const regName = phys.BH_REGIMES[regime]
    ? tr(phys.BH_REGIMES[regime].label_en, phys.BH_REGIMES[regime].label_zh) : '';
  const cycleIncl = () => setInclIdx((inclIdx + 1) % INCL.length);
  const cycleAzim = () => setAzIdx((azIdx + 1) % AZIM.length);

  // Display + trace resolution and FOV are derived per-request from the live
  // canvas size (see the render effect): resizing the window changes the camera
  // field of view at a constant angular scale — it reveals more/less sky rather
  // than stretching the image. REF_H/FOVY0 anchor that scale at the default size.
  const REF_H = 132;                 // default fs-canvas height (styles.css)
  const FOVY0 = Math.PI / 2.5;       // vertical FOV at the default height
  // Fast trace tuning for interactive use. targetAffine must stay >= ~30 or the
  // central plunging rays never reach the horizon and the shadow disappears;
  // minStep is left at the integrator default so horizon capture still resolves.
  const TRACE = {
    targetAffine: 30,
    escapeRadius: 48,
    maxStep: 0.45,
    absoluteTolerance: 1e-5,
    relativeTolerance: 1e-5,
    recordEvery: 12,
  };

  React.useEffect(() => { drag.reclamp(); }, [collapsed]);

  const blit = React.useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth, cssH = c.clientHeight;
    if (cssW < 2 || cssH < 2) return;
    if (c.width !== cssW * dpr || c.height !== cssH * dpr) { c.width = cssW * dpr; c.height = cssH * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'oklch(0.04 0.005 255)';
    ctx.fillRect(0, 0, cssW, cssH);

    const st = stateRef.current;
    const res = st.result;
    if (res && res.imageData) {
      let off = offRef.current;
      if (!off) { off = document.createElement('canvas'); offRef.current = off; }
      if (off.width !== res.imageData.width || off.height !== res.imageData.height) {
        off.width = res.imageData.width; off.height = res.imageData.height;
      }
      off.getContext('2d').putImageData(res.imageData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, cssW, cssH);

      // Read-outs: inclination, shadow fraction, photon-ring angular diameter.
      const counts = res.counts || {};
      const total = (counts.captured || 0) + (counts.active || 0) +
        (counts.escaped || 0) + (counts['integration-failed'] || 0);
      const shadowPct = total ? Math.round((counts.captured || 0) / total * 100) : 0;
      const ringDeg = res.photonRing ? (res.photonRing.angularDiameter * 180 / Math.PI) : 0;
      ctx.fillStyle = 'oklch(0.72 0.012 255 / 0.9)';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`i ${thetaDeg}°  ${tr('shadow', '陰影')} ${shadowPct}%  ${tr('ring', '環')} Ø ${ringDeg.toFixed(0)}°`, 6, cssH - 6);
    } else {
      ctx.fillStyle = 'oklch(0.46 0.014 255)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(window.KNLensing ? tr('rendering…', '算繪中…') : tr('lensing engine offline', '透鏡引擎離線'), cssW / 2, cssH / 2);
      ctx.textAlign = 'left';
    }
    if (st.pending && res) {
      ctx.fillStyle = 'oklch(0.80 0.16 75 / 0.9)';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillText(tr('rendering…', '算繪中…'), 6, 12);
    }
  }, [thetaDeg]);

  React.useEffect(() => {
    if (collapsed) return undefined;
    const KNL = window.KNLensing;
    blit(); // paint placeholder / last frame immediately
    if (!KNL) return undefined;

    const disc = discOn ? { accretionRate: 0.08, outerR: 18, exposure: 150 } : null;

    // Read the live canvas size so the camera scales by field of view, not by
    // stretching: at a constant angular scale a bigger window shows more sky.
    const measure = () => {
      const c = canvasRef.current;
      const cw = (c && c.clientWidth) || 246, ch = (c && c.clientHeight) || REF_H;
      return { cw, ch, aspect: cw / Math.max(1, ch) };
    };

    // Azimuth is in the key so cycling it triggers a request, but it is NOT in the
    // LUT cache key (the bridge omits it), so an azimuth-only change reuses the
    // cached trace and just re-shades — effectively free. The canvas size is
    // quantised into the key so a resize re-renders at the new FOV (without
    // thrashing the trace on every pixel of a drag).
    const makeKey = () => {
      const { cw, ch } = measure();
      const p = sim.params;
      return [p.M, p.Q, p.a, thetaDeg, azDeg, discOn ? 1 : 0,
              Math.round(cw / 8), Math.round(ch / 8)]
        .map((x) => (Number(x) || 0).toFixed(3)).join(',');
    };
    const maybeRequest = () => {
      const k = makeKey();
      if (k === stateRef.current.key) return;
      stateRef.current.key = k;
      stateRef.current.pending = true;
      const { aspect, ch } = measure();
      // Constant angular scale ⇒ FOV grows with the window height (and, via the
      // matched display aspect, its width). Clamp so a huge window can't request
      // a degenerate fisheye.
      const fovY = Math.max(0.4, Math.min(Math.PI * 0.92, FOVY0 * (ch / REF_H)));
      // Display size tracks the canvas (1:1, so no stretch); trace stays cheap.
      const dispH = Math.max(60, Math.min(220, Math.round(ch)));
      const dispW = Math.max(60, Math.round(dispH * aspect));
      const baseH = Math.max(24, Math.min(60, Math.round(dispH * 0.32)));
      const baseW = Math.max(24, Math.round(baseH * aspect));
      const camera = { r: 26, theta: thetaDeg * Math.PI / 180, phi: azDeg * Math.PI / 180, fovY };
      KNL.syncParams(sim.params);
      KNL.requestRenderLUT({
        params: { ...sim.params },
        camera,
        // Trace at the cheap base size (lutWidth/lutHeight); shade to the larger
        // display size (width/height) via the smooth LUT upsample.
        options: { width: dispW, height: dispH, lutWidth: baseW, lutHeight: baseH, disc, ...TRACE },
        progressive: true,
      });
      blit(); // show the "rendering" hint over the previous frame
    };

    const onFrame = (result, final) => {
      stateRef.current.result = result;
      if (final) stateRef.current.pending = false;
      blit();
    };
    KNL.setOnFrame(onFrame);
    maybeRequest();
    const iv = setInterval(maybeRequest, 250);
    return () => {
      clearInterval(iv);
      if (KNL.onFrame === onFrame) KNL.setOnFrame(null);
    };
  }, [collapsed, inclIdx, discOn, azIdx, blit]);

  // Lower pane: fetch (and cache) the bent-ray polylines for the monopole, then
  // draw them in their own canvas stacked under the lensed image.
  React.useEffect(() => {
    if (collapsed) return undefined;
    const KNL = window.KNLensing;
    if (!KNL || !KNL.equatorialRays) return undefined;
    let cancelled = false;
    // Parallel bundle (not a camera fan): rays arrive from infinity on parallel
    // tracks, bend around the hole, and head back out toward infinity — the
    // textbook gravitational-lensing diagram.
    // targetAffine is raised so even the widest-impact-parameter rays integrate
    // all the way back out to the escape radius (they need ~120 to clear it).
    KNL.equatorialRays({ M: totM, Q: totQ, a: totA, B: sim.params.B },
      { count: 17, cameraR: 42, parallel: true, targetAffine: 140 })
      .then((d) => { if (!cancelled) traceRef.current = d; })
      .catch(() => { /* keep last good curves */ });
    return () => { cancelled = true; };
  }, [collapsed, totM, totQ, totA, sim.params.B]);

  React.useEffect(() => {
    if (collapsed) return undefined;
    const c = traceCanvasRef.current;
    if (!c) return undefined;
    const ctx = c.getContext('2d');
    let raf;
    function tick() {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Base, then a faint copy of the lensed image (the over layer's bitmap is
      // fully drawn even though CSS clips it) so the ray curves sit on a dim
      // lens picture — a quick check that the ring centre and the ray fan share
      // the same centre.
      ctx.fillStyle = 'oklch(0.08 0.018 255)';
      ctx.fillRect(0, 0, w, h);
      const lc = canvasRef.current;
      if (lc && lc.width > 0) {
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(lc, 0, 0, w, h);
        ctx.restore();
      }
      renderLensTrace(ctx, w, h, traceRef.current, { skipBackground: true });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [collapsed]);

  return (
    <div ref={drag.rootRef}
         className={`field-section kn-draggable ${collapsed ? 'is-collapsed' : ''} ${drag.dragging ? 'is-dragging' : ''} ${drag.resized ? 'kn-resized' : ''}`}
         style={drag.style}>
      <div className="microscope-head fs-head" onPointerDown={drag.onHeadDown}>
        <div className="mh-left">
          <span className="mh-chev"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '▾'}</span>
          <span className="mh-title"
                onPointerUp={() => { if (!drag.movedRef.current) setCollapsed(!collapsed); }}>{tr('GRAVITATIONAL LENS', '重力透鏡')}</span>
        </div>
        <div className="mh-right">
          <span className="mh-switch" onPointerDown={(e) => e.stopPropagation()}>
            <button className="on" onClick={cycleIncl}
                    title={tr('click to change inclination', '單擊切換傾角')}>
              <span className="mh-name">{`i ${thetaDeg}°`}</span> ⟳
            </button>
          </span>
        </div>
      </div>
      {!collapsed && (
        <React.Fragment>
          {/* Two diagrams wiped by a draggable divider: the lensed camera image
              over the bent equatorial light-bending curves. Both fill the body
              and centre on the hole, so the divider only reveals more/less of the
              top (image) layer over the bottom (trace) layer — nothing rescales. */}
          <div ref={split.containerRef}
               className={`fs-split ${split.dragging ? 'is-splitting' : ''}`}>
            <canvas ref={traceCanvasRef} className="fs-canvas fs-under" />
            <canvas ref={canvasRef} className="fs-canvas fs-over"
                    style={{ clipPath: `inset(0 0 ${((1 - split.frac) * 100).toFixed(2)}% 0)` }} />
            <span className="fs-pane-label">{tr('LENS IMAGE', '透鏡圖')}</span>
            <span className="fs-pane-label fs-label-bottom">{tr('RAY TRACE', '光跡曲線')}</span>
            <div className="fs-divider" onPointerDown={split.onDividerDown}
                 style={{ top: `${(split.frac * 100).toFixed(2)}%` }}
                 title={tr('drag to compare', '拖曳調整比較')} />
          </div>
          <div className="view-toggles" style={{ borderTop: '1px solid var(--line)' }}>
            <button className={discOn ? 'on' : ''} onClick={() => setDiscOn(!discOn)}
                    title={tr('toggle accretion disc', '切換吸積盤')}>
              {tr('DISC', '吸積盤')}
            </button>
            <button onClick={cycleIncl}
                    title={tr('cycle inclination', '循環傾角')}>
              {tr('TILT', '傾角')}
            </button>
            <button onClick={cycleAzim}
                    title={tr('cycle camera azimuth', '循環方位角')}>
              {tr('AZ', '方位')} {azDeg}°
            </button>
          </div>
          {/* Scale-dependent read-out. The image is mass-independent; this row is the
              honest part that scales with the chosen black-hole mass + distance. */}
          {centralBH && (
            <div className="lens-scale"
                 title={tr(
                   'Lensing is scale-invariant in units of M: the image above is identical for any black-hole mass (it depends only on a/M, Q/M). Only the on-sky angular size scales with mass and distance — shown here at a representative distance for the selected scale.',
                   '以 M（重力半徑）為單位時，重力透鏡為尺度不變：上方影像對任何黑洞質量都相同（僅取決於 a/M、Q/M）。只有天空角尺寸隨質量與距離改變 — 此處以所選尺度的代表距離顯示。')}>
              <div className="ls-row">
                <span>r<sub>g</sub> <b>{knFmtKmScale(lensObs.rgKm)}</b></span>
                <span>{tr('shadow', '陰影')} Ø <b>{knFmtAngle(lensObs.shadowUas)}</b></span>
                <span className={`ls-eht ${lensObs.ehtResolvable ? 'on' : ''}`}>
                  {lensObs.ehtResolvable ? tr('EHT-resolvable', 'EHT 可解析') : tr('unresolved', '無法解析')}
                </span>
              </div>
              <div className="ls-dist">{regName} · @ {tr(lensObs.distanceLabel_en, lensObs.distanceLabel_zh)}</div>
            </div>
          )}
        </React.Fragment>
      )}
      {!collapsed && <div className="kn-resize-grip" onPointerDown={drag.onResizeDown} />}
    </div>
  );
}

// Lower-pane renderer: self-contained, lens-centred plot of the bent equatorial
// geodesics + the critical-impact-parameter circle. Fixed px-per-M scale, so
// resizing the window widens the field of view rather than zooming the curves.
// Each traced ray is extended with a straight asymptote at both ends (incoming
// from, and escaping toward, infinity) so the parallel bundle reads as light
// arriving from and departing to infinity — captured rays only extend inward.
// `opts.skipBackground` leaves the canvas untouched (the caller has already
// painted a faint lensed-image underlay) so only the grid + rays are drawn.
function renderLensTrace(ctx, w, h, data, opts) {
  opts = opts || {};
  if (!opts.skipBackground) {
    ctx.fillStyle = 'oklch(0.08 0.018 255)';
    ctx.fillRect(0, 0, w, h);
  }
  if (w < 2 || h < 2) return;

  const cx = w / 2, cy = h / 2;
  const PX_PER_M = 1.5;   // fixed scale (≈ fits the ±42 M ray fan at default size)

  ctx.strokeStyle = 'oklch(0.20 0.022 255 / 0.5)';
  ctx.lineWidth = 0.5;
  for (let x = (cx % 22); x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = (cy % 22); y < h; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  if (!data || !data.rays) {
    ctx.fillStyle = 'oklch(0.46 0.014 255)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(window.KNLensing ? tr('tracing…', '追跡中…') : tr('lensing engine offline', '透鏡引擎離線'), cx, cy + 4);
    ctx.textAlign = 'left';
    return;
  }

  // Critical impact parameter: rays aimed within b_crit of the centre fall in.
  if (data.bCrit > 0) {
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'oklch(0.78 0.10 60 / 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, data.bCrit * PX_PER_M, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Bent geodesics (faint cyan = bends past; faint red = captured). Straight
  // asymptotes carry each ray out to the panel edge (toward infinity): the
  // incoming end always, the outgoing end only for rays that escape.
  const SX = (x) => cx + x * PX_PER_M, SY = (y) => cy - y * PX_PER_M;
  const reach = Math.hypot(w, h) / PX_PER_M;   // M needed to clear the canvas
  ctx.lineWidth = 1;
  for (const ray of data.rays) {
    const pts = ray.points;
    if (!pts || pts.length < 4) continue;
    const n = pts.length;
    ctx.strokeStyle = ray.captured
      ? 'oklch(0.62 0.13 28 / 0.45)'
      : 'oklch(0.72 0.09 210 / 0.4)';
    ctx.beginPath();
    // Incoming asymptote: continue the first segment outward to infinity.
    let dx = pts[0] - pts[2], dy = pts[1] - pts[3];
    let len = Math.hypot(dx, dy) || 1;
    ctx.moveTo(SX(pts[0] + dx / len * reach), SY(pts[1] + dy / len * reach));
    ctx.lineTo(SX(pts[0]), SY(pts[1]));
    for (let i = 2; i < n; i += 2) ctx.lineTo(SX(pts[i]), SY(pts[i + 1]));
    // Outgoing asymptote: escaping rays straighten out to infinity; captured
    // rays end at the horizon, so they get no outward extension.
    if (!ray.captured) {
      dx = pts[n - 2] - pts[n - 4]; dy = pts[n - 1] - pts[n - 3];
      len = Math.hypot(dx, dy) || 1;
      ctx.lineTo(SX(pts[n - 2] + dx / len * reach), SY(pts[n - 1] + dy / len * reach));
    }
    ctx.stroke();
  }

  ctx.fillStyle = 'oklch(0.78 0.16 75 / 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'oklch(0.58 0.012 255)';
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('±' + (w / (2 * PX_PER_M)).toFixed(0) + ' M', 6, h - 6);
  if (data.bCrit > 0) {
    ctx.fillStyle = 'oklch(0.72 0.09 60 / 0.8)';
    ctx.fillText('b_crit ' + data.bCrit.toFixed(2) + ' M', 6, 12);
  }
}

window.ObserverView = ObserverView;
