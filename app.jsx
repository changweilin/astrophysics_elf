/* App root — wires panels + viewport */

const { useState: useS, useEffect: useE, useRef: useR } = React;

const SIM = window.KNSim.createSim();
window.KNDisc.initDisc(SIM);
window.KNSim.initBinary(SIM);
// seed a couple of bodies so the first frame is interesting
(function seed() {
  for (const it of [
    { name: 'PL-01 Rocky',    kind: 'planet', radius: 0.30, binding: 2.5, x: 12,  y: 0, vx: 0,    vy: 0.35 },
    { name: 'GG-01 Gas',      kind: 'gas',    radius: 0.55, binding: 0.9, x: -16, y: 4, vx: -0.05, vy: -0.30 },
    { name: 'SS-01 Crewed',   kind: 'ship',   radius: 0.02, binding: 8.0, x: 0,   y: 9, vx: -0.40, vy: 0 },
  ]) window.KNSim.addBody(SIM, it);
  SIM.selectedId = SIM.bodies[2].id;
})();
// Restore the user's last session (params + the scene they built). Runs after
// the seed so a saved scene replaces the defaults instead of stacking on them.
window.KNSim.applyConfig(SIM);

function App() {
  const [, setTick] = useS(0);
  const [playing, setPlaying] = useS(true);
  const [timescale, setTimescale] = useS(() => isFinite(SIM.timescale) ? SIM.timescale : 1);
  const force = () => setTick((t) => t + 1);
  const canvasRef = useR(null);

  // Persist the chosen configuration so it survives a reload. saveConfig diffs
  // internally, so the 1 s timer only writes when something actually changed;
  // visibility/pagehide flushes capture edits made right before leaving.
  useE(() => {
    // Re-read on mount so a layout swap (mobile→desktop) picks up edits the
    // other root flushed on unmount, not just the page-load snapshot.
    if (window.KNSim.applyConfig(SIM)) force();
    const id = setInterval(() => window.KNSim.saveConfig(SIM), 1000);
    const flush = () => window.KNSim.saveConfig(SIM);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, []);

  // Unified pointer interaction (placement / aim / pan / select).
  useE(() => {
    const c = canvasRef.current;
    if (!c) return;
    let pan = null;
    let suppressClick = false;
    let downAt = null;
    let lastDown = null;        // first-press hit {kind,bodyId,sx,sy,t}; lets a
                                // double-click resolve a body that drifted between clicks
    let grab = null;            // active body/companion grab (hold→move, drag→re-aim)
    let longPressTimer = null;  // fires → enter reposition mode

    function rectOf() { return c.getBoundingClientRect(); }
    function clientToCanvas(e) {
      const r = rectOf();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top, w: r.width, h: r.height, inside:
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
    }

    // Which orbiting body / companion sits under a screen point (null if none).
    function hitTestGrabbable(sx, sy, w, h) {
      let best = null, bestD = 22;
      for (const b of SIM.bodies) {
        if (b.state !== 'orbit') continue;
        const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, b.x, b.y);
        const d = Math.hypot(bx - sx, by - sy);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (best) return { kind: 'body', bodyId: best.id, label: best.name };
      if (SIM.binary && SIM.binary.enabled) {
        const bin = SIM.binary;
        const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, bin.x2, bin.y2);
        const phys = window.KNphysics;
        const sType = bin.type || 'bh';
        const { rplus: rp2 } = phys.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
        const visualR = sType === 'bh'
          ? Math.max(4, (isFinite(rp2) ? rp2 : bin.M2) * SIM.view.scale)
          : Math.max(6, (bin.R_star2 || 3) * SIM.view.scale * 0.7);
        const hitR = Math.max(14, visualR + 4);
        if (Math.hypot(sx - bx, sy - by) <= hitR) return { kind: 'companion', label: 'companion' };
      }
      return null;
    }

    // Reposition the grabbed target to a world coordinate (keeps velocity).
    function moveGrabTo(g, wx, wy) {
      if (g.kind === 'companion') {
        const bin = SIM.binary;
        if (!bin) return;
        bin.x2 = wx; bin.y2 = wy;
      } else {
        const b = SIM.bodies.find((x) => x.id === g.bodyId);
        if (b) { b.x = wx; b.y = wy; }
      }
    }

    // Release any in-progress grab and unfreeze its target.
    function clearGrab() {
      if (grab) {
        if (grab.kind === 'companion') { if (SIM.binary) SIM.binary.held = false; }
        else { const b = SIM.bodies.find((x) => x.id === grab.bodyId); if (b) b.held = false; }
      }
      clearTimeout(longPressTimer);
      longPressTimer = null;
      SIM.moving = null;
      grab = null;
    }

    function onMove(e) {
      const { sx, sy, w, h, inside } = clientToCanvas(e);
      // update placement ghost
      if (SIM.placement) {
        const [wx, wy] = window.KNSim.screenToWorld(SIM, w, h, sx, sy);
        SIM.placement.wx = wx; SIM.placement.wy = wy;
        SIM.placement.inCanvas = inside;
      }
      // update aim pull
      if (SIM.aiming && SIM.aiming.isAiming) {
        SIM.aiming.pullSx = sx; SIM.aiming.pullSy = sy;
      }
      // grab: reposition (hold) or hand off to velocity re-aim (drag)
      if (grab) {
        const dist = Math.hypot(sx - grab.startSx, sy - grab.startSy);
        if (grab.mode === 'move') {
          const [wx, wy] = window.KNSim.screenToWorld(SIM, w, h, sx, sy);
          moveGrabTo(grab, wx, wy);
        } else if (grab.mode === 'pending' && dist > 5) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          if (grab.kind === 'companion') {
            SIM.aiming = { kind: 'companion', isAiming: true, pullSx: sx, pullSy: sy };
          } else {
            SIM.aiming = { bodyId: grab.bodyId, isAiming: true, pullSx: sx, pullSy: sy };
          }
          grab = null;
        }
        return;
      }
      // pan
      if (pan) {
        const dx = (e.clientX - pan.x) / SIM.view.scale;
        const dy = (e.clientY - pan.y) / SIM.view.scale;
        SIM.view.ox = pan.ox + dx;
        SIM.view.oy = pan.oy + dy;
      }
    }

    function onUp(e) {
      const { sx, sy, w, h, inside } = clientToCanvas(e);
      // 1) Placement release: commit body + enter aim mode
      if (SIM.placement) {
        if (inside) {
          setPlaying(false);   // placed → pause until a fling or double-click resumes
          const [wx, wy] = window.KNSim.screenToWorld(SIM, w, h, sx, sy);
          const it = SIM.placement.item;
          if (it.isCompanion) {
            // Companion placement: set up binary at world pos with default circular v
            window.KNSim.placeCompanion(SIM, wx, wy);
            // Default the camera to the conserved barycentre so both stars stay
            // framed as they orbit (user can switch back via FRAME · FREE).
            SIM.view.frame = 'com';
            const vc = Math.sqrt(SIM.params.M / Math.max(0.5, Math.hypot(wx, wy)));
            window.KNSim.logEv(SIM, 'good',
              `companion placed at r=${Math.hypot(wx, wy).toFixed(2)} M · v_circ=${vc.toFixed(3)} c — drag to override`);
          } else {
            const prefix = { planet:'PL', gas:'GG', star:'ST', ship:'SS', probe:'PR' }[it.kind];
            const suffix = window.__bumpName(it.kind);
            // Drop straight onto a stable circular orbit (no pickup/aim step);
            // drag from the body to fling it, or double-click to re-stabilise.
            const rr = Math.max(0.5, Math.hypot(wx, wy));
            const vc = window.KNphysics.circularSpeed(rr, SIM.params.M) || Math.sqrt(SIM.params.M / rr);
            const dir = Math.sign(SIM.params.a || 1);
            const id = window.KNSim.addBody(SIM, {
              name: `${prefix}-${suffix} ${it.name.split(' ')[0]}`,
              kind: it.kind, radius: it.radius, binding: it.binding, charge: it.charge || 0,
              x: wx, y: wy, vx: -wy / rr * vc * dir, vy: wx / rr * vc * dir,
            });
            SIM.selectedId = id;
            window.KNSim.logEv(SIM, 'good', `${it.name} placed at r=${Math.hypot(wx,wy).toFixed(2)} M — drag from body to launch`);
          }
        } else {
          window.KNSim.logEv(SIM, 'warn', `placement cancelled`);
        }
        SIM.placement = null;
        pan = null;   // a click-armed placement (companion) left a stale pan grab
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 80);
        force();
        return;
      }
      // 2) Aim release: commit velocity
      if (SIM.aiming && SIM.aiming.isAiming) {
        if (SIM.aiming.kind === 'companion') {
          const bin = SIM.binary;
          if (bin) {
            const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, bin.x2, bin.y2);
            const dx = sx - bx, dy = sy - by;
            const dragPx = Math.hypot(dx, dy);
            // Tiny drag → keep the stable circular default we set at placement.
            if (dragPx > 4) {
              const vScale = 0.08;
              const vx2 = -dx / SIM.view.scale * vScale;
              const vy2 = -dy / SIM.view.scale * vScale;
              window.KNSim.setBinaryVelocity(SIM, vx2, vy2);
              const v = Math.hypot(bin.vx2, bin.vy2);
              window.KNSim.logEv(SIM, 'good', `companion launched · v₀ = ${v.toFixed(3)} c (primary recoils)`);
            } else {
              window.KNSim.logEv(SIM, 'good', `companion retains stable v_circ`);
            }
          }
        } else {
          const body = SIM.bodies.find((b) => b.id === SIM.aiming.bodyId);
          if (body) {
            const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, body.x, body.y);
            const dx = sx - bx;
            const dy = sy - by;
            const vScale = 0.08;
            body.vx = -dx / SIM.view.scale * vScale;
            body.vy = -dy / SIM.view.scale * vScale;
            const v = Math.hypot(body.vx, body.vy);
            window.KNSim.logEv(SIM, 'good', `${body.name} launched · v₀ = ${v.toFixed(3)} c`);
          }
        }
        setPlaying(true);   // fling committed → resume play
        SIM.aiming = null;
        pan = null;
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 80);
        force();
        return;
      }
      // 2.5) Grab release: commit reposition (drag→re-aim already handed off above)
      if (grab) {
        if (grab.mode === 'move') {
          let r = 0;
          if (grab.kind === 'companion') { r = SIM.binary ? SIM.binary.d : 0; }
          else { const b = SIM.bodies.find((x) => x.id === grab.bodyId); r = b ? Math.hypot(b.x, b.y) : 0; }
          window.KNSim.logEv(SIM, 'good', `${grab.label} repositioned · r = ${r.toFixed(2)} M`);
          suppressClick = true; setTimeout(() => { suppressClick = false; }, 80);
        }
        clearGrab();
        force();
        return;
      }
      // 3) End pan
      if (pan) {
        const moved = Math.hypot(e.clientX - pan.x, e.clientY - pan.y);
        pan = null;
        if (moved > 4) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 60); }
      }
    }

    function onDown(e) {
      const { sx, sy, w, h } = clientToCanvas(e);
      downAt = { sx, sy };
      // Aiming-armed (just-placed body/companion, not yet flung): start the
      // slingshot ONLY when the press begins on that held object. A press
      // elsewhere commits it as-is and falls through to normal interaction, so it
      // can no longer be flung from empty space.
      if (SIM.aiming && !SIM.aiming.isAiming) {
        let onAimTarget = false;
        if (SIM.aiming.kind === 'companion') {
          const bin = SIM.binary;
          if (bin && bin.enabled) {
            const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, bin.x2, bin.y2);
            const rr = Math.max(18, starVisualR(bin.M2, bin.Q2, bin.a2, bin.type, bin.R_star2) + 8);
            onAimTarget = Math.hypot(sx - bx, sy - by) <= rr;
          }
        } else {
          const body = SIM.bodies.find((b) => b.id === SIM.aiming.bodyId);
          if (body) {
            const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, body.x, body.y);
            onAimTarget = Math.hypot(sx - bx, sy - by) <= 24;
          }
        }
        if (onAimTarget) {
          SIM.aiming.isAiming = true;
          SIM.aiming.pullSx = sx;
          SIM.aiming.pullSy = sy;
          e.preventDefault();
          return;
        }
        SIM.aiming = null;   // pressed off the held object → commit it; handle normally
        force();
      }
      // Grab an existing body / companion: long-press → reposition, drag → re-aim v₀
      if (!SIM.placement && !SIM.aiming) {
        const hit = hitTestGrabbable(sx, sy, w, h);
        if (hit) {
          if (hit.kind === 'body') SIM.selectedId = hit.bodyId;
          grab = { ...hit, startSx: sx, startSy: sy, mode: 'pending' };
          lastDown = { kind: hit.kind, bodyId: hit.bodyId, sx, sy, t: performance.now() };
          longPressTimer = setTimeout(() => {
            if (grab && grab.mode === 'pending') {
              grab.mode = 'move';
              if (grab.kind === 'companion') { if (SIM.binary) SIM.binary.held = true; }
              else { const b = SIM.bodies.find((x) => x.id === grab.bodyId); if (b) b.held = true; }
              SIM.moving = { kind: grab.kind, bodyId: grab.bodyId };
              window.KNSim.logEv(SIM, 'amber', `${grab.label} — hold-drag to reposition`);
              force();
            }
          }, 300);
          e.preventDefault();
          return;
        }
      }
      // Otherwise: drag empty space to pan the view — but only in 'free' frame
      // and never while placing/aiming (a press to drop a body must not also arm
      // a pan, which would otherwise leak past the release and stick the view to
      // the cursor). A locked reference frame drives view.ox/oy itself.
      if (!SIM.placement && !SIM.aiming && (!SIM.view.frame || SIM.view.frame === 'free')) {
        pan = { x: e.clientX, y: e.clientY, ox: SIM.view.ox, oy: SIM.view.oy };
      }
    }

    // Screen radius (px) of a star's drawn body — shared by binary hit-tests.
    function starVisualR(M, Q, a, type, R_star) {
      const phys = window.KNphysics;
      const { rplus, naked } = phys.horizons(M, Q || 0, a || 0);
      return (type || 'bh') === 'bh'
        ? Math.max(4, (isFinite(rplus) && !naked ? rplus : M) * SIM.view.scale)
        : Math.max(6, (R_star || 3) * SIM.view.scale * 0.7);
    }

    // Double-click → snap onto a classical stable periodic orbit.
    //  · a binary star (primary or companion) circularises the whole pair
    //  · any other body keeps its direction but takes the local v_circ
    function onDblClick(e) {
      if (SIM.placement || SIM.aiming) return;
      const { sx, sy, w, h } = clientToCanvas(e);
      // A body drifts between the two clicks, so a live hit-test at the cursor can
      // miss it; fall back to whatever the first press hit, if recent and nearby.
      const recent = lastDown && (performance.now() - lastDown.t < 700)
        && Math.hypot(sx - lastDown.sx, sy - lastDown.sy) < 44;
      // Binary star first (primary at x1,y1 / companion at x2,y2)
      if (SIM.binary && SIM.binary.enabled) {
        const bin = SIM.binary;
        const [c2x, c2y] = window.KNSim.worldToScreen(SIM, w, h, bin.x2, bin.y2);
        const r2 = Math.max(14, starVisualR(bin.M2, bin.Q2, bin.a2, bin.type, bin.R_star2) + 4);
        const [c1x, c1y] = window.KNSim.worldToScreen(SIM, w, h, bin.x1, bin.y1);
        const r1 = Math.max(14, starVisualR(SIM.params.M, SIM.params.Q, SIM.params.a, SIM.params.type, SIM.params.R_star) + 4);
        if (Math.hypot(sx - c2x, sy - c2y) <= r2 || Math.hypot(sx - c1x, sy - c1y) <= r1
            || (recent && lastDown.kind === 'companion')) {
          const vc = window.KNSim.circularizeBinary(SIM);
          setPlaying(true);   // double-click → resume play
          window.KNSim.logEv(SIM, 'good', `binary → stable circular orbit · v_rel=${vc.toFixed(3)} c · GW decay paused (re-throw to inspiral)`);
          force();
          return;
        }
      }
      // Otherwise the nearest orbiting body
      let best = null, bestD = 22;
      for (const b of SIM.bodies) {
        if (b.state !== 'orbit') continue;
        const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, b.x, b.y);
        const d = Math.hypot(bx - sx, by - sy);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (!best && recent && lastDown.kind === 'body') {
        best = SIM.bodies.find((b) => b.id === lastDown.bodyId && b.state === 'orbit') || null;
      }
      if (best) {
        const vc = window.KNSim.circularizeBody(SIM, best);
        setPlaying(true);   // double-click → resume play
        SIM.selectedId = best.id;
        window.KNSim.logEv(SIM, 'good', `${best.name} → stable periodic orbit · |v|=${vc.toFixed(3)} c (direction kept)`);
        force();
      }
    }

    function onClick(e) {
      if (suppressClick || SIM.placement || SIM.aiming) return;
      const { sx, sy, w, h } = clientToCanvas(e);
      let best = null, bestD = 22;
      for (const b of SIM.bodies) {
        if (b.state !== 'orbit') continue;
        const [bx, by] = window.KNSim.worldToScreen(SIM, w, h, b.x, b.y);
        const d = Math.hypot(bx - sx, by - sy);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (best) { SIM.selectedId = best.id; force(); }
    }

    function onWheel(e) {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.1 : 0.9;
      SIM.view.scale = Math.min(80, Math.max(4, SIM.view.scale * k));
    }

    c.addEventListener('mousedown', onDown);
    c.addEventListener('click', onClick);
    c.addEventListener('dblclick', onDblClick);
    c.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      clearTimeout(longPressTimer);
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('click', onClick);
      c.removeEventListener('dblclick', onDblClick);
      c.removeEventListener('wheel', onWheel);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // animation loop
  useE(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf, last = performance.now(), frame = 0;
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Auto-pause while the user is placing or aiming a body/companion, then
      // resume the instant they commit (drag-launch / double-click clears these).
      // A manual pause (playing=false) still overrides and stays paused.
      // Only placing a body/companion pauses the sim; slingshot-aiming and
      // double-click leave it playing.
      SIM.paused = !playing || !!SIM.placement;
      SIM.timescale = timescale;
      window.KNSim.step(SIM, dt);

      // resize
      const dpr = window.devicePixelRatio || 1;
      const cssW = c.clientWidth, cssH = c.clientHeight;
      if (c.width !== cssW * dpr || c.height !== cssH * dpr) {
        c.width = cssW * dpr; c.height = cssH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      window.KNSim.render(SIM, ctx, cssW, cssH);
      window.KNSim.renderInteraction(SIM, ctx, cssW, cssH);

      // throttle React re-render to ~15 Hz for telemetry
      frame++;
      if (frame % 4 === 0) force();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, timescale]);

  // keyboard
  useE(() => {
    function onKey(e) {
      if (e.key === ' ') { setPlaying((p) => !p); e.preventDefault(); }
      if (e.key === 'Escape') {
        if (SIM.placement) { SIM.placement = null; window.KNSim.logEv(SIM, 'warn', 'placement cancelled'); force(); }
        else if (SIM.aiming) {
          if (SIM.aiming.kind === 'companion') {
            // If user never customised velocity & companion still on default, remove it.
            if (!SIM.aiming.isAiming) {
              window.KNSim.removeCompanion(SIM);
              window.KNSim.logEv(SIM, 'warn', 'companion placement cancelled');
            } else {
              window.KNSim.logEv(SIM, 'warn', 'aim cancelled · companion kept at default v_circ');
            }
          } else {
            // remove the un-launched body if velocity never set
            const body = SIM.bodies.find((b) => b.id === SIM.aiming.bodyId);
            if (body && !SIM.aiming.isAiming && body.vx === 0 && body.vy === 0) {
              SIM.bodies = SIM.bodies.filter((b) => b.id !== body.id);
            }
            window.KNSim.logEv(SIM, 'warn', 'aim cancelled');
          }
          SIM.aiming = null;
          force();
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        SIM.bodies = []; SIM.selectedId = null; SIM.events = []; SIM.t = 0;
        SIM.placement = null; SIM.aiming = null; SIM.moving = null;
        if (SIM.binary) SIM.binary.held = false;
        force();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const phys = window.KNphysics;
  const cls = phys.classify(SIM.params.M, SIM.params.Q, SIM.params.a, SIM.params.type);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <img className="logo" src="/logos/icon-192.png" alt="Astro ELF" width="24" height="24" />
          <span className="wordmark"><strong>ASTRO ELF</strong><span className="suffix">BLACK HOLE LAB</span></span>
        </div>
        <div className="crumbs">
          INSTRUMENT <span>/</span> SANDBOX <span>/</span> <span>session 04C</span>
        </div>
        <div className="session">
          <span>SOLVER <b>RK2-MID</b></span>
          <span>SUBSTEP <b>4×</b></span>
          <span>FRAME <b>BL-COORDS</b></span>
          <span className="ok">● LIVE</span>
        </div>
      </div>

      <LeftPanel sim={SIM} force={force} />

      <div className="viewport" style={{ cursor: SIM.placement ? 'crosshair' : SIM.moving ? 'move' : (SIM.aiming && !SIM.aiming.isAiming) ? 'grab' : 'default' }}>
        <canvas ref={canvasRef} />
        <div className="overlay-tl">
          <div className="frame-id">Equatorial slice · θ = π/2</div>
          <div className="frame-coord">scale: 1 px = {(1 / SIM.view.scale).toFixed(3)} M · drag to pan · scroll to zoom</div>
          {SIM.placement && (
            <div className="frame-coord" style={{color: SIM.placement.item.isCompanion ? 'oklch(0.82 0.14 295)' : 'var(--amber)'}}>
              ● PLACEMENT · {SIM.placement.item.name} · ESC to cancel
            </div>
          )}
          {SIM.aiming && !SIM.aiming.isAiming && (
            <div className="frame-coord" style={{color: SIM.aiming.kind === 'companion' ? 'oklch(0.82 0.14 295)' : 'var(--amber)'}}>
              ● AIM · {SIM.aiming.kind === 'companion' ? 'drag from companion to override v_circ' : 'drag from body to launch'} · ESC to cancel
            </div>
          )}
          {SIM.aiming && SIM.aiming.isAiming && (
            <div className="frame-coord" style={{color: SIM.aiming.kind === 'companion' ? 'oklch(0.82 0.14 295)' : 'var(--amber)'}}>
              ● AIMING… release to commit v₀
            </div>
          )}
        </div>
        <div className="overlay-tr">
          <div className="chip">CLASS · <b>{cls.name}</b></div>
          <div className="chip">M=<b>{SIM.params.M.toFixed(2)}</b> · Q=<b>{SIM.params.Q.toFixed(2)}</b> · a=<b>{SIM.params.a.toFixed(2)}</b>
            {SIM.params.type && SIM.params.type !== 'bh' && <> · R★=<b>{(SIM.params.R_star || 3).toFixed(2)}</b></>}
          </div>
        </div>
        <div className="overlay-bl">
          <div className="view-toggles">
            <ToggleBtn label="HORIZON"  k="showHorizon" sim={SIM} force={force} />
            <ToggleBtn label="ERGO"     k="showErgo" sim={SIM} force={force} />
            <ToggleBtn label="ISCO"     k="showISCO" sim={SIM} force={force} />
            <ToggleBtn label="PHOTON"   k="showPhoton" sim={SIM} force={force} />
            <ToggleBtn label="DRAG"     k="showDragField" sim={SIM} force={force} />
            <ToggleBtn label="GW"       k="showGW" sim={SIM} force={force} />
            <ToggleBtn label="TRAILS"   k="showOrbits" sim={SIM} force={force} />
            <ToggleBtn label="TIDAL"    k="showTidal" sim={SIM} force={force} />
            <ToggleBtn label="LABELS"   k="showLabels" sim={SIM} force={force} />
          </div>
          <FrameLock sim={SIM} force={force} />
        </div>
        <div className="overlay-br">
          <div>RENDER · CANVAS2D · {Math.round(SIM.view.scale)}px/M</div>
        </div>

        <TidalMicroscope sim={SIM} force={force} />
        <MHDMonitor sim={SIM} force={force} />
      </div>

      <RightPanel sim={SIM} force={force} />

      <BottomStrip sim={SIM} force={force}
        playing={playing} setPlaying={setPlaying}
        timescale={timescale} setTimescale={setTimescale} />
    </div>
  );
}

// Reference-frame switch: lock the camera to m1 / m2 / barycenter, or free pan.
function FrameLock({ sim, force }) {
  const cur = sim.view.frame || 'free';
  const hasBin = !!(sim.binary && sim.binary.enabled);
  const opts = [
    ['free', 'FREE', true],
    ['m1', 'M1', true],
    ['m2', 'M2', hasBin],
    ['com', 'COM', hasBin],
  ];
  return (
    <div className="view-toggles frame-lock">
      <span className="vt-label">FRAME</span>
      {opts.map(([k, lbl, on]) => (
        <button key={k} className={cur === k ? 'on' : ''} disabled={!on}
          title={on ? `lock camera to ${lbl}` : 'place a companion first'}
          onClick={() => { sim.view.frame = k; force(); }}>
          {lbl}
        </button>
      ))}
    </div>
  );
}

function ToggleBtn({ label, k, sim, force }) {
  const on = sim.flags[k];
  return (
    <button className={on ? 'on' : ''}
      onClick={() => { sim.flags[k] = !sim.flags[k]; force(); }}>
      <span className="sw" />{label}
    </button>
  );
}

window.App = App;
