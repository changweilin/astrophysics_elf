/* Kerr-Newman Lab — mobile root app
 * Layout: header → class-chips → viewport → dock → tabs → drawer
 * Touch: 1-finger drag = pan / aim, 2-finger pinch = zoom, tap = select / place
 */

const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

// ─── Bootstrap simulation ──────────────────────────────────
const MSIM = window.KNSim.createSim();
window.KNDisc.initDisc(MSIM);
window.KNSim.initBinary(MSIM);
(function seed() {
  for (const it of [
    { name: 'PL-01 Rocky',  kind: 'planet', radius: 0.30, binding: 2.5, x: 10,  y: 0, vx: 0,    vy: 0.38 },
    { name: 'SS-01 Crewed', kind: 'ship',   radius: 0.02, binding: 8.0, x: 0,   y: 8, vx: -0.42, vy: 0 },
  ]) window.KNSim.addBody(MSIM, it);
  MSIM.selectedId = MSIM.bodies[1].id;
  MSIM.view.scale = 14; // start zoomed a bit further out for small screens
})();
// Restore the user's last session (params + the scene they built). Runs after
// the seed so a saved scene/zoom replaces the defaults instead of stacking.
window.KNSim.applyConfig(MSIM);

let mobileNameCounters = {};
function bumpName(kind) {
  mobileNameCounters[kind] = (mobileNameCounters[kind] || 0) + 1;
  return String(mobileNameCounters[kind]).padStart(2, '0');
}

// ─── Main MobileApp component ─────────────────────────────
function MobileApp() {
  const [, setTick] = useStateApp(0);
  const [playing, setPlaying] = useStateApp(true);
  const [timescale, setTimescale] = useStateApp(() => isFinite(MSIM.timescale) ? MSIM.timescale : 1);
  const [tab, setTab] = useStateApp('hole'); // hole | objects | spawn | disc
  const [drawerOpen, setDrawerOpen] = useStateApp(true);
  const canvasRef = useRefApp(null);
  const force = () => setTick((t) => t + 1);

  // Persist the chosen configuration so it survives a reload (see app.jsx).
  useEffectApp(() => {
    // Re-read on mount so a layout swap (desktop→mobile) picks up edits the
    // other root flushed on unmount, not just the page-load snapshot.
    if (window.KNSim.applyConfig(MSIM)) force();
    const id = setInterval(() => window.KNSim.saveConfig(MSIM), 1000);
    const flush = () => window.KNSim.saveConfig(MSIM);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, []);

  // Arm placement and switch to viewport (collapse drawer for clarity)
  const armPlacement = (it) => {
    MSIM.placement = { item: it, wx: 0, wy: 0, inCanvas: false };
    window.KNSim.logEv(MSIM, 'amber', `placing ${it.name}… tap viewport to drop`);
    setDrawerOpen(false);
    force();
  };

  // ─── Touch / pointer handlers on canvas ─────────────────
  useEffectApp(() => {
    const c = canvasRef.current;
    if (!c) return;

    let pointers = new Map(); // pointerId → {x,y}
    let pan = null;
    let pinch = null;
    let downAt = null;
    let movedSinceDown = false;
    let suppressTap = false;
    let grab = null;            // active body/companion grab (hold→move, drag→re-aim)
    let longPressTimer = null;  // fires → enter reposition mode
    let lastTap = null;         // { t, sx, sy } — for double-tap detection

    function rectOf() { return c.getBoundingClientRect(); }
    function toLocal(e) {
      const r = rectOf();
      return {
        sx: e.clientX - r.left,
        sy: e.clientY - r.top,
        w: r.width, h: r.height,
        inside: e.clientX >= r.left && e.clientX <= r.right
             && e.clientY >= r.top && e.clientY <= r.bottom,
      };
    }

    // Which orbiting body / companion sits under a screen point (null if none).
    function hitTestGrabbable(sx, sy, w, h) {
      let best = null, bestD = 28;
      for (const b of MSIM.bodies) {
        if (b.state !== 'orbit') continue;
        const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, b.x, b.y);
        const d = Math.hypot(bx - sx, by - sy);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (best) return { kind: 'body', bodyId: best.id, label: best.name };
      if (MSIM.binary && MSIM.binary.enabled) {
        const bin = MSIM.binary;
        const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, bin.x2, bin.y2);
        const phys = window.KNphysics;
        const sType = bin.type || 'bh';
        const { rplus: rp2 } = phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
        const visualR = sType === 'bh'
          ? Math.max(4, (isFinite(rp2) ? rp2 : bin.M2) * MSIM.view.scale)
          : Math.max(6, (bin.R_star2 || 3) * MSIM.view.scale * 0.7);
        const hitR = Math.max(18, visualR + 6);
        if (Math.hypot(sx - bx, sy - by) <= hitR) return { kind: 'companion', label: 'companion' };
      }
      return null;
    }

    // Screen radius (px) of a star's drawn body — shared by binary hit-tests.
    function starVisualR(M, Q, a, type, R_star) {
      const phys = window.KNphysics;
      const { rplus, naked } = phys.horizons(M, Q || 0, a || 0);
      return (type || 'bh') === 'bh'
        ? Math.max(4, (isFinite(rplus) && !naked ? rplus : M) * MSIM.view.scale)
        : Math.max(6, (R_star || 3) * MSIM.view.scale * 0.7);
    }

    // Double-tap → snap onto a classical stable periodic orbit (mobile twin of
    // the desktop dblclick). A binary star circularises the pair; any other body
    // keeps its direction but takes the local v_circ. Returns true if it acted.
    function handleDoubleTap(sx, sy, w, h) {
      if (MSIM.binary && MSIM.binary.enabled) {
        const bin = MSIM.binary;
        const [c2x, c2y] = window.KNSim.worldToScreen(MSIM, w, h, bin.x2, bin.y2);
        const r2 = Math.max(18, starVisualR(bin.M2, bin.Q2, bin.a2, bin.type, bin.R_star2) + 6);
        const [c1x, c1y] = window.KNSim.worldToScreen(MSIM, w, h, bin.x1, bin.y1);
        const r1 = Math.max(18, starVisualR(MSIM.params.M, MSIM.params.Q, MSIM.params.a, MSIM.params.type, MSIM.params.R_star) + 6);
        if (Math.hypot(sx - c2x, sy - c2y) <= r2 || Math.hypot(sx - c1x, sy - c1y) <= r1) {
          const vc = window.KNSim.circularizeBinary(MSIM);
          window.KNSim.logEv(MSIM, 'good', `binary circularised · v_circ=${vc.toFixed(3)} c · GW inspiral active → orbit will decay`);
          return true;
        }
      }
      let best = null, bestD = 28;
      for (const b of MSIM.bodies) {
        if (b.state !== 'orbit') continue;
        const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, b.x, b.y);
        const d = Math.hypot(bx - sx, by - sy);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (best) {
        const vc = window.KNSim.circularizeBody(MSIM, best);
        MSIM.selectedId = best.id;
        window.KNSim.logEv(MSIM, 'good', `${best.name} → stable periodic orbit · |v|=${vc.toFixed(3)} c (direction kept)`);
        return true;
      }
      return false;
    }

    // Reposition the grabbed target to a world coordinate (keeps velocity).
    function moveGrabTo(g, wx, wy) {
      if (g.kind === 'companion') {
        const bin = MSIM.binary;
        if (!bin) return;
        bin.x2 = wx; bin.y2 = wy;
      } else {
        const b = MSIM.bodies.find((x) => x.id === g.bodyId);
        if (b) { b.x = wx; b.y = wy; }
      }
    }

    // Release any in-progress grab and unfreeze its target.
    function clearGrab() {
      if (grab) {
        if (grab.kind === 'companion') { if (MSIM.binary) MSIM.binary.held = false; }
        else { const b = MSIM.bodies.find((x) => x.id === grab.bodyId); if (b) b.held = false; }
      }
      clearTimeout(longPressTimer);
      longPressTimer = null;
      MSIM.moving = null;
      grab = null;
    }

    function onPointerDown(e) {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch initiation
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinch = { startDist: d, startScale: MSIM.view.scale };
        pan = null;
        clearGrab();
        return;
      }

      const { sx, sy, w, h } = toLocal(e);
      downAt = { sx, sy };
      movedSinceDown = false;

      // If aiming-armed: begin aim drag
      if (MSIM.aiming && !MSIM.aiming.isAiming) {
        MSIM.aiming.isAiming = true;
        MSIM.aiming.pullSx = sx;
        MSIM.aiming.pullSy = sy;
        e.preventDefault();
        return;
      }

      // Grab an existing body / companion: long-press → reposition, drag → re-aim v₀
      if (!MSIM.placement && !MSIM.aiming) {
        const hit = hitTestGrabbable(sx, sy, w, h);
        if (hit) {
          if (hit.kind === 'body') MSIM.selectedId = hit.bodyId;
          grab = { ...hit, startSx: sx, startSy: sy, mode: 'pending' };
          longPressTimer = setTimeout(() => {
            if (grab && grab.mode === 'pending') {
              grab.mode = 'move';
              if (grab.kind === 'companion') { if (MSIM.binary) MSIM.binary.held = true; }
              else { const b = MSIM.bodies.find((x) => x.id === grab.bodyId); if (b) b.held = true; }
              MSIM.moving = { kind: grab.kind, bodyId: grab.bodyId };
              window.KNSim.logEv(MSIM, 'amber', `${grab.label} — hold-drag to reposition`);
              force();
            }
          }, 350);
          e.preventDefault();
          return;
        }
      }

      // Otherwise: prepare pan — but only in 'free' frame and never while
      // placing/aiming (a stale pan grab would otherwise stick the view to the
      // finger after release). A locked reference frame drives view.ox/oy itself.
      if (!MSIM.placement && !MSIM.aiming && (!MSIM.view.frame || MSIM.view.frame === 'free')) {
        pan = { x: e.clientX, y: e.clientY, ox: MSIM.view.ox, oy: MSIM.view.oy };
      }
    }

    function onPointerMove(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const { sx, sy, w, h, inside } = toLocal(e);

      // Pinch zoom
      if (pinch && pointers.size === 2) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ratio = d / pinch.startDist;
        MSIM.view.scale = Math.min(80, Math.max(4, pinch.startScale * ratio));
        movedSinceDown = true;
        return;
      }

      // grab: reposition (hold) or hand off to velocity re-aim (drag)
      if (grab) {
        const dist = Math.hypot(sx - grab.startSx, sy - grab.startSy);
        if (grab.mode === 'move') {
          const [wx, wy] = window.KNSim.screenToWorld(MSIM, w, h, sx, sy);
          moveGrabTo(grab, wx, wy);
          movedSinceDown = true;
        } else if (grab.mode === 'pending' && dist > 6) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          if (grab.kind === 'companion') {
            MSIM.aiming = { kind: 'companion', isAiming: true, pullSx: sx, pullSy: sy };
          } else {
            MSIM.aiming = { bodyId: grab.bodyId, isAiming: true, pullSx: sx, pullSy: sy };
          }
          movedSinceDown = true;
          grab = null;
        }
        return;
      }

      // Placement ghost
      if (MSIM.placement) {
        const [wx, wy] = window.KNSim.screenToWorld(MSIM, w, h, sx, sy);
        MSIM.placement.wx = wx; MSIM.placement.wy = wy;
        MSIM.placement.inCanvas = inside;
      }
      // Aim pull
      if (MSIM.aiming && MSIM.aiming.isAiming) {
        MSIM.aiming.pullSx = sx; MSIM.aiming.pullSy = sy;
        movedSinceDown = true;
      }
      // Pan
      if (pan && !MSIM.aiming) {
        const dx = (e.clientX - pan.x) / MSIM.view.scale;
        const dy = (e.clientY - pan.y) / MSIM.view.scale;
        if (Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 4) movedSinceDown = true;
        MSIM.view.ox = pan.ox + dx;
        MSIM.view.oy = pan.oy + dy;
      }
    }

    function onPointerUp(e) {
      const { sx, sy, w, h, inside } = toLocal(e);
      const wasPinching = pinch && pointers.size >= 2;
      pointers.delete(e.pointerId);
      try { c.releasePointerCapture(e.pointerId); } catch {}

      if (wasPinching) {
        if (pointers.size < 2) { pinch = null; }
        // Re-seed pan from remaining finger
        if (pointers.size === 1) {
          const [p] = pointers.values();
          pan = { x: p.x, y: p.y, ox: MSIM.view.ox, oy: MSIM.view.oy };
        } else {
          pan = null;
        }
        return;
      }

      // Double-tap → classical stable periodic orbit. Only clean taps (no drag,
      // no placement/aim in progress) qualify; a second tap within 300ms and
      // ~30px re-uses the desktop circularise helpers.
      if (!movedSinceDown && !MSIM.placement && !MSIM.aiming) {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 300 && Math.hypot(sx - lastTap.sx, sy - lastTap.sy) < 30) {
          lastTap = null;
          if (handleDoubleTap(sx, sy, w, h)) {
            clearGrab();
            pan = null;
            suppressTap = true; setTimeout(() => { suppressTap = false; }, 80);
            force();
            return;
          }
        } else {
          lastTap = { t: now, sx, sy };
        }
      }

      // Placement release
      if (MSIM.placement) {
        if (inside) {
          const [wx, wy] = window.KNSim.screenToWorld(MSIM, w, h, sx, sy);
          const it = MSIM.placement.item;
          if (it.isCompanion) {
            window.KNSim.placeCompanion(MSIM, wx, wy);
            // Default to the barycentre frame so both stars stay framed (switch
            // back via FRAME · FREE).
            MSIM.view.frame = 'com';
            MSIM.aiming = { kind: 'companion', isAiming: false, pullSx: sx, pullSy: sy };
            const vc = Math.sqrt(MSIM.params.M / Math.max(0.5, Math.hypot(wx, wy)));
            window.KNSim.logEv(MSIM, 'good',
              `companion placed at r=${Math.hypot(wx, wy).toFixed(2)} M · v_circ=${vc.toFixed(3)} c — drag to override`);
          } else {
            const prefix = { planet: 'PL', gas: 'GG', star: 'ST', ship: 'SS', probe: 'PR' }[it.kind];
            const suffix = bumpName(it.kind);
            const id = window.KNSim.addBody(MSIM, {
              name: `${prefix}-${suffix} ${it.name.split(' ')[0]}`,
              kind: it.kind, radius: it.radius, binding: it.binding, charge: it.charge || 0,
              x: wx, y: wy, vx: 0, vy: 0,
            });
            MSIM.selectedId = id;
            MSIM.aiming = { bodyId: id, isAiming: false, pullSx: sx, pullSy: sy };
            window.KNSim.logEv(MSIM, 'good', `${it.name} placed at r=${Math.hypot(wx,wy).toFixed(2)} M — drag from body to launch`);
          }
        } else {
          window.KNSim.logEv(MSIM, 'warn', `placement cancelled`);
        }
        MSIM.placement = null;
        pan = null;
        suppressTap = true; setTimeout(() => { suppressTap = false; }, 80);
        force();
        return;
      }

      // Aim release
      if (MSIM.aiming && MSIM.aiming.isAiming) {
        if (MSIM.aiming.kind === 'companion') {
          const bin = MSIM.binary;
          if (bin) {
            const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, bin.x2, bin.y2);
            const dx = sx - bx, dy = sy - by;
            const dragPx = Math.hypot(dx, dy);
            if (dragPx > 4) {
              const vScale = 0.08;
              const vx2 = -dx / MSIM.view.scale * vScale;
              const vy2 = -dy / MSIM.view.scale * vScale;
              window.KNSim.setBinaryVelocity(MSIM, vx2, vy2);
              const v = Math.hypot(bin.vx2, bin.vy2);
              window.KNSim.logEv(MSIM, 'good', `companion launched · v₀ = ${v.toFixed(3)} c (primary recoils)`);
            } else {
              window.KNSim.logEv(MSIM, 'good', `companion retains stable v_circ`);
            }
          }
        } else {
          const body = MSIM.bodies.find((b) => b.id === MSIM.aiming.bodyId);
          if (body) {
            const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, body.x, body.y);
            const dx = sx - bx;
            const dy = sy - by;
            const vScale = 0.08;
            body.vx = -dx / MSIM.view.scale * vScale;
            body.vy = -dy / MSIM.view.scale * vScale;
            const v = Math.hypot(body.vx, body.vy);
            window.KNSim.logEv(MSIM, 'good', `${body.name} launched · v₀ = ${v.toFixed(3)} c`);
          }
        }
        MSIM.aiming = null;
        pan = null;
        suppressTap = true; setTimeout(() => { suppressTap = false; }, 80);
        force();
        return;
      }

      // Grab release: commit reposition (drag→re-aim already handed off above)
      if (grab) {
        if (grab.mode === 'move') {
          window.KNSim.logEv(MSIM, 'good', `${grab.label} repositioned`);
          suppressTap = true; setTimeout(() => { suppressTap = false; }, 80);
        }
        clearGrab();
        force();
        return;
      }

      // Pan end — if no real movement, treat as tap (selection)
      if (pan) {
        if (!movedSinceDown && !suppressTap) {
          // tap to select nearest body
          let best = null, bestD = 28;
          for (const b of MSIM.bodies) {
            if (b.state !== 'orbit') continue;
            const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, b.x, b.y);
            const d = Math.hypot(bx - sx, by - sy);
            if (d < bestD) { bestD = d; best = b; }
          }
          if (best) { MSIM.selectedId = best.id; force(); }
        }
        pan = null;
      }
    }

    function onPointerCancel(e) {
      pointers.delete(e.pointerId);
      pan = null; pinch = null;
      clearGrab();
    }

    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerCancel);
    return () => {
      clearTimeout(longPressTimer);
      c.removeEventListener('pointerdown', onPointerDown);
      c.removeEventListener('pointermove', onPointerMove);
      c.removeEventListener('pointerup', onPointerUp);
      c.removeEventListener('pointercancel', onPointerCancel);
    };
  }, []);

  // ─── Animation loop ─────────────────────────────────────
  useEffectApp(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf, last = performance.now(), frame = 0;
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Auto-pause while placing/aiming, resume on commit (see app.jsx). A
      // manual pause still overrides.
      MSIM.paused = !playing || !!MSIM.placement || !!MSIM.aiming;
      MSIM.timescale = timescale;
      window.KNSim.step(MSIM, dt);

      const dpr = window.devicePixelRatio || 1;
      const cssW = c.clientWidth, cssH = c.clientHeight;
      if (c.width !== cssW * dpr || c.height !== cssH * dpr) {
        c.width = cssW * dpr; c.height = cssH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      window.KNSim.render(MSIM, ctx, cssW, cssH);
      window.KNSim.renderInteraction(MSIM, ctx, cssW, cssH);

      frame++;
      if (frame % 5 === 0) force();  // ~12Hz UI refresh
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, timescale]);

  // ─── Derived state ──────────────────────────────────────
  const phys = window.KNphysics;
  const cls = phys.classify(MSIM.params.M, MSIM.params.Q, MSIM.params.a, MSIM.params.type);
  const orbitCount = MSIM.bodies.filter(b => b.state === 'orbit').length;

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="m-app">
      {/* Header */}
      <div className="m-head">
        <div className="brand">
          <span className="dot" />
          <span><strong>KN-LAB</strong></span>
        </div>
        <div className="session">
          <span>BL · RK2</span>
          <span className="live">● LIVE</span>
        </div>
      </div>

      {/* Class chip bar */}
      <div className="m-chipbar">
        <div className={`m-chip class ${cls.warn ? 'warn' : ''}`}>
          CLASS · <b>{cls.name}</b>
        </div>
        <div className="m-chip">M <b>{MSIM.params.M.toFixed(2)}</b></div>
        <div className="m-chip">Q <b>{(MSIM.params.Q >= 0 ? '+' : '') + MSIM.params.Q.toFixed(2)}</b></div>
        <div className="m-chip">a <b>{(MSIM.params.a >= 0 ? '+' : '') + MSIM.params.a.toFixed(2)}</b></div>
        <div className="m-chip">B <b>{MSIM.params.B.toFixed(2)}</b></div>
        {MSIM.binary && MSIM.binary.enabled && (
          <div className="m-chip" style={{color:'oklch(0.78 0.18 295)'}}>
            BBH <b>d={MSIM.binary.d.toFixed(1)}</b>
          </div>
        )}
        <div className="m-chip">BODIES <b>{orbitCount}/{MSIM.bodies.length}</b></div>
      </div>

      {/* Viewport */}
      <div className="m-view">
        <canvas ref={canvasRef} />

        <div className="m-view-tl">
          <div className="frame-id">θ = π/2 · BL</div>
          <div className="frame-coord">{(1 / MSIM.view.scale).toFixed(3)} M/px</div>
        </div>
        <div className="m-view-tr">
          <span className="px">{Math.round(MSIM.view.scale)}px/M</span>
          <span>T+{MSIM.t.toFixed(1)} M</span>
        </div>

        {/* Floating placement / aim hints */}
        {MSIM.placement && (
          <div className="m-hint">
            ● PLACE · {MSIM.placement.item.name}
            <span className="x" onClick={() => {
              MSIM.placement = null;
              window.KNSim.logEv(MSIM, 'warn', 'placement cancelled');
              force();
            }}>✕</span>
          </div>
        )}
        {MSIM.aiming && !MSIM.aiming.isAiming && (
          <div className="m-hint">
            ● AIM · drag from body
            <span className="x" onClick={() => {
              const body = MSIM.bodies.find((b) => b.id === MSIM.aiming.bodyId);
              if (body && body.vx === 0 && body.vy === 0) {
                MSIM.bodies = MSIM.bodies.filter((b) => b.id !== body.id);
              }
              MSIM.aiming = null;
              window.KNSim.logEv(MSIM, 'warn', 'aim cancelled');
              force();
            }}>✕</span>
          </div>
        )}
        {MSIM.aiming && MSIM.aiming.isAiming && (
          <div className="m-hint">
            ● AIMING · release to launch
          </div>
        )}

        {/* Reference-frame lock */}
        <MFrameLock sim={MSIM} force={force} />

        {/* Layer toggles scroll strip */}
        <div className="m-view-bl">
          <MToggle label="HORIZON" k="showHorizon" sim={MSIM} force={force} />
          <MToggle label="ERGO"    k="showErgo"    sim={MSIM} force={force} />
          <MToggle label="ISCO"    k="showISCO"    sim={MSIM} force={force} />
          <MToggle label="PHOTON"  k="showPhoton"  sim={MSIM} force={force} />
          <MToggle label="DRAG"    k="showDragField" sim={MSIM} force={force} />
          <MToggle label="GW"      k="showGW"      sim={MSIM} force={force} />
          <MToggle label="TRAILS"  k="showOrbits"  sim={MSIM} force={force} />
          <MToggle label="TIDAL"   k="showTidal"   sim={MSIM} force={force} />
          <MToggle label="LABELS"  k="showLabels"  sim={MSIM} force={force} />
        </div>

        {/* Zoom buttons */}
        <div className="m-zoom">
          <button onClick={() => { MSIM.view.scale = Math.min(80, MSIM.view.scale * 1.25); force(); }}>+</button>
          <button onClick={() => { MSIM.view.scale = Math.max(4, MSIM.view.scale * 0.8); force(); }}>−</button>
        </div>
      </div>

      {/* Bottom dock — playback */}
      <div className="m-dock">
        <button className="play" onClick={() => setPlaying(!playing)}>
          {playing ? '❚❚' : '▶'}
        </button>
        <SpeedScrubber timescale={timescale} setTimescale={setTimescale} />
        <div className="meta">
          <span className="t">T+{MSIM.t.toFixed(1)}</span>
          <span><b>{orbitCount}</b>/{MSIM.bodies.length} BOD</span>
        </div>
      </div>

      {/* Tab nav */}
      <div className="m-tabs">
        <button className={tab === 'hole' ? 'on' : ''}
          onClick={() => { setTab('hole'); setDrawerOpen(true); }}>
          <span className="ic">◉</span>BLACK HOLE
        </button>
        <button className={tab === 'objects' ? 'on' : ''}
          onClick={() => { setTab('objects'); setDrawerOpen(true); }}>
          <span className="ic">●</span>OBJECTS
          {MSIM.bodies.length > 0 && <span className="badge">{MSIM.bodies.length}</span>}
        </button>
        <button className={tab === 'spawn' ? 'on' : ''}
          onClick={() => { setTab('spawn'); setDrawerOpen(true); }}>
          <span className="ic">+</span>SPAWN
        </button>
        <button className={tab === 'disc' ? 'on' : ''}
          onClick={() => { setTab('disc'); setDrawerOpen(true); }}>
          <span className="ic">◌</span>DISC
          {sim_disc_active(MSIM) && <span className="badge">●</span>}
        </button>
      </div>

      {/* Drawer */}
      <div className={`m-drawer ${drawerOpen ? '' : 'collapsed'}`}>
        <div className="m-drawer-body">
          {tab === 'hole'    && <TabBlackHole sim={MSIM} force={force} />}
          {tab === 'objects' && <TabObjects   sim={MSIM} force={force} />}
          {tab === 'spawn'   && <TabSpawn     sim={MSIM} force={force} onArm={armPlacement} />}
          {tab === 'disc'    && <TabDisc      sim={MSIM} force={force} />}
        </div>
      </div>
    </div>
  );
}

function MToggle({ label, k, sim, force }) {
  const on = sim.flags[k];
  return (
    <button className={on ? 'on' : ''}
      onClick={() => { sim.flags[k] = !sim.flags[k]; force(); }}>
      <span className="sw" />{label}
    </button>
  );
}

// Reference-frame switch: lock the camera to m1 / m2 / barycenter, or free pan.
function MFrameLock({ sim, force }) {
  const cur = sim.view.frame || 'free';
  const hasBin = !!(sim.binary && sim.binary.enabled);
  const opts = [
    ['free', 'FREE', true],
    ['m1', 'M1', true],
    ['m2', 'M2', hasBin],
    ['com', 'COM', hasBin],
  ];
  return (
    <div className="m-view-frame">
      <span className="lbl">FRAME</span>
      {opts.map(([k, lbl, on]) => (
        <button key={k} className={cur === k ? 'on' : ''} disabled={!on}
          onClick={() => { sim.view.frame = k; force(); }}>
          {lbl}
        </button>
      ))}
    </div>
  );
}

function sim_disc_active(sim) {
  return sim && sim.disc && sim.disc.enabled;
}

window.MobileApp = MobileApp;
