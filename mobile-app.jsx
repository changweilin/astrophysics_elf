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

// Settings-drawer split geometry. The splitter trades vertical space between the
// universe viewport (above) and the settings cluster (dock + tabs + drawer).
const M_DRAWER_DEFAULT = 300;  // px — comfortable open height
const M_VIEW_MIN = 0;          // px — universe may collapse fully (just the top bar)

// ─── Main MobileApp component ─────────────────────────────
function MobileApp() {
  const [, setTick] = useStateApp(0);
  const [playing, setPlaying] = useStateApp(true);
  const [timescale, setTimescale] = useStateApp(() => isFinite(MSIM.timescale) ? MSIM.timescale : 1);
  const [tab, setTab] = useStateApp('hole'); // hole | objects | spawn | disc
  // Default splitter position sits just above the tab bar (drawer collapsed, so
  // only the object tabs show beneath the divider). A stored height — remembered
  // across reloads via the sim config — overrides this default.
  const [drawerH, setDrawerH] = useStateApp(() => Number.isFinite(MSIM.mDrawerH) ? MSIM.mDrawerH : 0); // settings-drawer height (px)
  const [snapping, setSnapping] = useStateApp(false);          // animate height on dbl-tap
  const canvasRef = useRefApp(null);
  const viewRef = useRefApp(null);
  const drawerRef = useRefApp(null);
  const snapTimer = useRefApp(null);
  const force = () => setTick((t) => t + 1);

  // Re-render when the UI language changes.
  useEffectApp(() => window.KNi18n.subscribe(force), []);

  // Mirror the splitter height into the sim so saveConfig persists it (the
  // divider position is remembered across reloads).
  useEffectApp(() => { MSIM.mDrawerH = drawerH; }, [drawerH]);

  // ─── Universe ↔ settings splitter ───────────────────────
  // The pie is the height shared between the viewport and the drawer; the fixed
  // chrome (header, chips, splitter, dock, tabs) sits outside it.
  const drawerPie = () => {
    const v = viewRef.current, d = drawerRef.current;
    return (v && d) ? v.offsetHeight + d.offsetHeight : null;
  };
  const drawerMax = () => {
    const pie = drawerPie();
    return pie == null ? Infinity : Math.max(0, pie - M_VIEW_MIN);
  };
  const snapDrawer = (updater) => {
    setSnapping(true);
    const max = drawerMax();
    setDrawerH((h) => {
      const next = typeof updater === 'function' ? updater(h) : updater;
      return Math.max(0, Math.min(max, next));
    });
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => setSnapping(false), 260);
  };
  const openDrawer = () => snapDrawer((h) => (h > 60 ? h : M_DRAWER_DEFAULT));
  const onSplitterDown = (e) => {
    e.preventDefault();
    setSnapping(false);
    const max = drawerMax();
    const startY = e.clientY;
    const startH = drawerRef.current ? drawerRef.current.offsetHeight : drawerH;
    const move = (ev) => setDrawerH(Math.max(0, Math.min(max, startH + (startY - ev.clientY))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // Double-tap toggles the two snap extremes: collapsed (show just the tabs) ↔
  // expanded (universe collapses, show just the top bar).
  const onSplitterDouble = () => snapDrawer((h) => (h > 4 ? 0 : drawerMax()));

  // Persist the chosen configuration so it survives a reload (see app.jsx).
  useEffectApp(() => {
    // Re-read on mount so a layout swap (desktop→mobile) picks up edits the
    // other root flushed on unmount, not just the page-load snapshot.
    if (window.KNSim.applyConfig(MSIM)) {
      if (Number.isFinite(MSIM.mDrawerH)) setDrawerH(MSIM.mDrawerH);
      force();
    }
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
    window.KNSim.logEv(MSIM, 'amber', trp('placing {name}… tap viewport to drop', { name: tr(it.name, it.name_zh) }));
    snapDrawer(0);
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
        if (Math.hypot(sx - bx, sy - by) <= hitR) return { kind: 'companion', label: tr('companion', '伴星') };
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
    function handleDoubleTap(sx, sy, w, h, prevHit) {
      if (MSIM.binary && MSIM.binary.enabled) {
        const bin = MSIM.binary;
        const [c2x, c2y] = window.KNSim.worldToScreen(MSIM, w, h, bin.x2, bin.y2);
        const r2 = Math.max(18, starVisualR(bin.M2, bin.Q2, bin.a2, bin.type, bin.R_star2) + 6);
        const [c1x, c1y] = window.KNSim.worldToScreen(MSIM, w, h, bin.x1, bin.y1);
        const r1 = Math.max(18, starVisualR(MSIM.params.M, MSIM.params.Q, MSIM.params.a, MSIM.params.type, MSIM.params.R_star) + 6);
        if (Math.hypot(sx - c2x, sy - c2y) <= r2 || Math.hypot(sx - c1x, sy - c1y) <= r1
            || (prevHit && prevHit.kind === 'companion')) {
          const vc = window.KNSim.circularizeBinary(MSIM);
          setPlaying(true);   // double-tap → resume play
          window.KNSim.logEv(MSIM, 'good', trp(
            'binary → stable circular orbit · v_rel={v} c · GW decay paused (re-throw to inspiral)',
            { v: vc.toFixed(3) }));
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
      if (!best && prevHit && prevHit.kind === 'body') {
        best = MSIM.bodies.find((b) => b.id === prevHit.bodyId && b.state === 'orbit') || null;
      }
      if (best) {
        const vc = window.KNSim.circularizeBody(MSIM, best);
        setPlaying(true);   // double-tap → resume play
        MSIM.selectedId = best.id;
        window.KNSim.logEv(MSIM, 'good', trp(
          '{name} → stable periodic orbit · |v|={v} c (direction kept)',
          { name: best.name, v: vc.toFixed(3) }));
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

      // Aiming-armed (just-placed body/companion): begin the slingshot ONLY when
      // the press starts on that held object; a press elsewhere commits it and
      // falls through, so it can no longer be flung from empty space.
      if (MSIM.aiming && !MSIM.aiming.isAiming) {
        let onAimTarget = false;
        if (MSIM.aiming.kind === 'companion') {
          const bin = MSIM.binary;
          if (bin && bin.enabled) {
            const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, bin.x2, bin.y2);
            const rr = Math.max(22, starVisualR(bin.M2, bin.Q2, bin.a2, bin.type, bin.R_star2) + 10);
            onAimTarget = Math.hypot(sx - bx, sy - by) <= rr;
          }
        } else {
          const body = MSIM.bodies.find((b) => b.id === MSIM.aiming.bodyId);
          if (body) {
            const [bx, by] = window.KNSim.worldToScreen(MSIM, w, h, body.x, body.y);
            onAimTarget = Math.hypot(sx - bx, sy - by) <= 28;
          }
        }
        if (onAimTarget) {
          MSIM.aiming.isAiming = true;
          MSIM.aiming.pullSx = sx;
          MSIM.aiming.pullSy = sy;
          e.preventDefault();
          return;
        }
        MSIM.aiming = null;   // pressed off the held object → commit it; handle normally
        force();
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
              window.KNSim.logEv(MSIM, 'amber', trp('{label} — hold-drag to reposition', { label: grab.label }));
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
          const prevHit = lastTap.hit;
          lastTap = null;
          if (handleDoubleTap(sx, sy, w, h, prevHit)) {
            clearGrab();
            pan = null;
            suppressTap = true; setTimeout(() => { suppressTap = false; }, 80);
            force();
            return;
          }
        } else {
          // Remember what was under the finger so a double-tap still targets it
          // even after the body drifts away between the two taps.
          lastTap = { t: now, sx, sy, hit: hitTestGrabbable(sx, sy, w, h) };
        }
      }

      // Placement release
      if (MSIM.placement) {
        if (inside) {
          setPlaying(false);   // placed → pause until a fling or double-tap resumes
          const [wx, wy] = window.KNSim.screenToWorld(MSIM, w, h, sx, sy);
          const it = MSIM.placement.item;
          if (it.isCompanion) {
            window.KNSim.placeCompanion(MSIM, wx, wy);
            // Default to the barycentre frame so both stars stay framed (switch
            // back via FRAME · FREE).
            MSIM.view.frame = 'com';
            const vc = Math.sqrt(MSIM.params.M / Math.max(0.5, Math.hypot(wx, wy)));
            window.KNSim.logEv(MSIM, 'good', trp(
              'companion placed at r={r} M · v_circ={v} c — drag to override',
              { r: Math.hypot(wx, wy).toFixed(2), v: vc.toFixed(3) }));
          } else {
            const prefix = { planet: 'PL', gas: 'GG', star: 'ST', ship: 'SS', probe: 'PR' }[it.kind];
            const suffix = bumpName(it.kind);
            // Drop straight onto a stable circular orbit (no pickup/aim step);
            // drag from the body to fling it, or double-tap to re-stabilise.
            const rr = Math.max(0.5, Math.hypot(wx, wy));
            const vc = window.KNphysics.circularSpeed(rr, MSIM.params.M) || Math.sqrt(MSIM.params.M / rr);
            const dir = Math.sign(MSIM.params.a || 1);
            const id = window.KNSim.addBody(MSIM, {
              name: `${prefix}-${suffix} ${it.name.split(' ')[0]}`,
              kind: it.kind, radius: it.radius, binding: it.binding, charge: it.charge || 0,
              x: wx, y: wy, vx: -wy / rr * vc * dir, vy: wx / rr * vc * dir,
            });
            MSIM.selectedId = id;
            window.KNSim.logEv(MSIM, 'good', trp(
              '{name} placed at r={r} M — drag from body to launch',
              { name: tr(it.name, it.name_zh), r: Math.hypot(wx,wy).toFixed(2) }));
          }
        } else {
          window.KNSim.logEv(MSIM, 'warn', tr('placement cancelled', '已取消放置'));
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
              window.KNSim.logEv(MSIM, 'good', trp('companion launched · v₀ = {v} c (primary recoils)', { v: v.toFixed(3) }));
            } else {
              window.KNSim.logEv(MSIM, 'good', tr('companion retains stable v_circ', '伴星維持穩定 v_circ'));
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
            window.KNSim.logEv(MSIM, 'good', trp('{name} launched · v₀ = {v} c', { name: body.name, v: v.toFixed(3) }));
          }
        }
        setPlaying(true);   // fling committed → resume play
        MSIM.aiming = null;
        pan = null;
        suppressTap = true; setTimeout(() => { suppressTap = false; }, 80);
        force();
        return;
      }

      // Grab release: commit reposition (drag→re-aim already handed off above)
      if (grab) {
        if (grab.mode === 'move') {
          window.KNSim.logEv(MSIM, 'good', trp('{label} repositioned', { label: grab.label }));
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
      // Only placing a body/companion pauses the sim; slingshot-aiming and
      // double-click leave it playing.
      MSIM.paused = !playing || !!MSIM.placement;
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
          <img className="logo" src="/logos/icon-192.png" alt="Astro ELF" width="22" height="22" />
          <span><strong>ASTRO ELF</strong></span>
        </div>
        <div className="session">
          <span>BL · RK2</span>
          <span className="live">● {tr('LIVE', '即時')}</span>
          <LangToggle force={force} />
        </div>
      </div>

      {/* Class chip bar */}
      <div className="m-chipbar">
        <div className={`m-chip class ${cls.warn ? 'warn' : ''}`}>
          {tr('CLASS', '類別')} · <b>{cls.name}</b>
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
        <div className="m-chip">{tr('BODIES', '天體')} <b>{orbitCount}/{MSIM.bodies.length}</b></div>
      </div>

      {/* Viewport */}
      <div className="m-view" ref={viewRef}>
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
            ● {tr('PLACE', '放置')} · {MSIM.placement.item.name}
            <span className="x" onClick={() => {
              MSIM.placement = null;
              window.KNSim.logEv(MSIM, 'warn', tr('placement cancelled', '已取消放置'));
              force();
            }}>✕</span>
          </div>
        )}
        {MSIM.aiming && !MSIM.aiming.isAiming && (
          <div className="m-hint">
            ● {tr('AIM · drag from body', '瞄準 · 從天體拖曳')}
            <span className="x" onClick={() => {
              const body = MSIM.bodies.find((b) => b.id === MSIM.aiming.bodyId);
              if (body && body.vx === 0 && body.vy === 0) {
                MSIM.bodies = MSIM.bodies.filter((b) => b.id !== body.id);
              }
              MSIM.aiming = null;
              window.KNSim.logEv(MSIM, 'warn', tr('aim cancelled', '已取消瞄準'));
              force();
            }}>✕</span>
          </div>
        )}
        {MSIM.aiming && MSIM.aiming.isAiming && (
          <div className="m-hint">
            ● {tr('AIMING · release to launch', '瞄準中 · 放開以發射')}
          </div>
        )}

        {/* Bottom-left control cluster: frame cycle + cross-section ("剖面圖").
            The cross-section opens as a centred stage over the universe. */}
        <MViewControls sim={MSIM} force={force} />

        {/* Layer toggles scroll strip */}
        <div className="m-view-bl">
          <MToggle label={tr('HORIZON', '視界')} k="showHorizon" sim={MSIM} force={force} />
          <MToggle label={tr('ERGO', '動圈')}    k="showErgo"    sim={MSIM} force={force} />
          <MToggle label={tr('ISCO', 'ISCO')}    k="showISCO"    sim={MSIM} force={force} />
          <MToggle label={tr('PHOTON', '光子')}  k="showPhoton"  sim={MSIM} force={force} />
          <MToggle label={tr('DRAG', '拖曳')}    k="showDragField" sim={MSIM} force={force} />
          <MToggle label={tr('GW', '重力波')}    k="showGW"      sim={MSIM} force={force} />
          <MToggle label={tr('TRAILS', '軌跡')}  k="showOrbits"  sim={MSIM} force={force} />
          <MToggle label={tr('TIDAL', '潮汐')}   k="showTidal"   sim={MSIM} force={force} />
          <MToggle label={tr('LABELS', '標籤')}  k="showLabels"  sim={MSIM} force={force} />
        </div>

        {/* Zoom buttons */}
        <div className="m-zoom">
          <button onClick={() => { MSIM.view.scale = Math.min(80, MSIM.view.scale * 1.25); force(); }}>+</button>
          <button onClick={() => { MSIM.view.scale = Math.max(4, MSIM.view.scale * 0.8); force(); }}>−</button>
        </div>
      </div>

      {/* Splitter — divides the universe viewport from the settings cluster.
          Drag to resize; double-tap toggles tabs-only ↔ top-bar-only. */}
      <div className="m-splitter"
        onPointerDown={onSplitterDown}
        onDoubleClick={onSplitterDouble}
        title={tr('drag to adjust universe/settings split · double-tap to collapse or expand', '拖曳調整宇宙／設定比例 · 雙擊收合或展開')}>
        <span className="grip" />
      </div>

      {/* Bottom dock — playback */}
      <div className="m-dock">
        <button className="play" onClick={() => setPlaying(!playing)}>
          {playing ? '❚❚' : '▶'}
        </button>
        <SpeedScrubber timescale={timescale} setTimescale={setTimescale} />
        <div className="meta">
          <span className="t">T+{MSIM.t.toFixed(1)}</span>
          <span><b>{orbitCount}</b>/{MSIM.bodies.length} {tr('BOD', '天體')}</span>
        </div>
      </div>

      {/* Tab nav */}
      <div className="m-tabs">
        <button className={tab === 'hole' ? 'on' : ''}
          onClick={() => { setTab('hole'); openDrawer(); }}>
          <span className="ic">◉</span>{tr('BLACK HOLE', '黑洞')}
        </button>
        <button className={tab === 'objects' ? 'on' : ''}
          onClick={() => { setTab('objects'); openDrawer(); }}>
          <span className="ic">●</span>{tr('OBJECTS', '天體')}
          {MSIM.bodies.length > 0 && <span className="badge">{MSIM.bodies.length}</span>}
        </button>
        <button className={tab === 'spawn' ? 'on' : ''}
          onClick={() => { setTab('spawn'); openDrawer(); }}>
          <span className="ic">+</span>{tr('SPAWN', '生成')}
        </button>
        <button className={tab === 'disc' ? 'on' : ''}
          onClick={() => { setTab('disc'); openDrawer(); }}>
          <span className="ic">◌</span>{tr('DISC', '吸積盤')}
          {sim_disc_active(MSIM) && <span className="badge">●</span>}
        </button>
      </div>

      {/* Drawer */}
      <div className="m-drawer" ref={drawerRef}
        style={{ height: drawerH, transition: snapping ? 'height 0.22s ease' : 'none' }}>
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

// Bottom-left control cluster: the reference-frame cycle button plus the
// cross-section ("剖面圖") controls sitting to its right. Both controls live in
// one strip so they never cover the universe; the cross-section itself opens as
// a centred stage over the viewport (see the .m-profile-stage geometry).
//
//  • FRAME button  — taps cycle the camera lock (free → m1 → m2 → com → …).
//  • PROFILE ▸/▾   — expand/collapse the cross-section stage.
//  • target ⟳      — tap cycles the inspected target through every placed body
//                    (tidal close-up via renderMicroscope) and the MHD jet
//                    side-view(s) (via renderMHDSide); also opens if collapsed.
function MViewControls({ sim, force }) {
  const [profOpen, setProfOpen] = useStateApp(false);
  const [profKey, setProfKey] = useStateApp(null);
  const canvasRef = useRefApp(null);
  const hasBin = !!(sim.binary && sim.binary.enabled);

  // ── Reference frame ──
  const fopts = hasBin
    ? [['free', tr('FREE', '自由')], ['m1', 'M1'], ['m2', 'M2'], ['com', 'COM']]
    : [['free', tr('FREE', '自由')], ['m1', 'M1']];
  const fcur = sim.view.frame || 'free';
  let fidx = fopts.findIndex(([k]) => k === fcur);
  if (fidx < 0) fidx = 0; // a stale lock (e.g. companion removed) reads as free
  const cycleFrame = () => {
    sim.view.frame = fopts[(fidx + 1) % fopts.length][0];
    force();
  };

  // ── Cross-section targets (rebuilt each render so the list tracks the scene) ──
  const targets = [];
  for (const b of sim.bodies) {
    targets.push({ key: 'body:' + b.id, kind: 'body', body: b, label: b.name });
  }
  targets.push({ key: 'mhd:primary', kind: 'mhd', which: 'primary',
                 label: tr('MHD JET · M1', 'MHD 噴流 · M1') });
  if (hasBin) {
    targets.push({ key: 'mhd:companion', kind: 'mhd', which: 'companion',
                   label: tr('MHD JET · M2', 'MHD 噴流 · M2') });
  }
  let tidx = targets.findIndex((t) => t.key === profKey);
  if (tidx < 0) tidx = 0;
  const cur = targets[tidx] || null;

  const cycleTarget = () => {
    if (!targets.length) return;
    const next = targets[(tidx + 1) % targets.length];
    setProfKey(next.key);
    if (next.kind === 'body') sim.selectedId = next.body.id; // mirror to scene selection
    if (!profOpen) setProfOpen(true);  // first tap also opens the stage
    force();
  };

  useEffectApp(() => {
    if (!profOpen || !cur) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf;
    function tick() {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cur.kind === 'body') renderMicroscope(ctx, w, h, cur.body, sim);
      else renderMHDSide(ctx, w, h, sim, mhdView(sim, cur.which));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [profOpen, cur ? cur.key : null]);

  const tlabel = cur ? cur.label : tr('— no target —', '— 無目標 —');
  return (
    <React.Fragment>
      <div className="m-view-frame">
        <span className="lbl">{tr('FRAME', '座標系')}</span>
        <button className={fcur === 'free' ? '' : 'on'} onClick={cycleFrame}
          title={tr('tap to switch reference frame', '點一下切換座標系')}>
          {fopts[fidx][1]}
        </button>
        <span className="lbl lbl-sep">{tr('PROFILE', '剖面圖')}</span>
        <button className={profOpen ? 'on' : ''} onClick={() => setProfOpen(!profOpen)}
          title={tr('expand/collapse cross-section', '展開／收合剖面圖')}>
          {profOpen ? '▾' : '▸'}
        </button>
        <button className="prof-sw" onClick={cycleTarget}
          title={tr('tap to switch cross-section target', '點一下切換剖面目標')}>
          <span className="prof-name">{tlabel}</span><span className="prof-cyc">⟳</span>
        </button>
      </div>
      {profOpen && cur && (
        <div className="m-profile-stage">
          <canvas ref={canvasRef} className="mp-canvas" />
        </div>
      )}
    </React.Fragment>
  );
}

function sim_disc_active(sim) {
  return sim && sim.disc && sim.disc.enabled;
}

window.MobileApp = MobileApp;
