/* Shared pointer-interaction helpers for the desktop (mouse) and mobile (touch)
 * roots. Both roots run the same placement / aim / grab gesture model; these are
 * the pure, input-independent pieces — hit testing a screen point against the
 * scene, a star's drawn screen radius, and repositioning a grabbed target —
 * factored out of app.jsx / mobile-app.jsx so a fix lands in one place instead
 * of drifting between the two copies. The event plumbing (mouse+wheel vs
 * pointer+pinch) and the hit thresholds stay in each root: touch targets are
 * larger, so callers pass thresholds via `opts`.
 *
 * Exposes window.KNInteract. Plain JS (matches drag-move.js); resolves
 * window.KNSim / window.KNphysics / tr at call time, so it only needs sim.js and
 * the i18n layer to have loaded before the first gesture.
 */
(function () {
  // Screen radius (px) of a star's drawn body — shared by binary hit-tests.
  function starVisualR(sim, M, Q, a, type, R_star) {
    var hz = window.KNphysics.horizons(M, Q || 0, a || 0);
    return (type || 'bh') === 'bh'
      ? Math.max(4, (isFinite(hz.rplus) && !hz.naked ? hz.rplus : M) * sim.view.scale)
      : Math.max(6, (R_star || 3) * sim.view.scale * 0.7);
  }

  // Which orbiting body / companion sits under a screen point (null if none).
  // opts: { bodyR, compFloor, compPad } — desktop {22,14,4}, mobile {28,18,6}.
  function hitTestGrabbable(sim, sx, sy, w, h, opts) {
    opts = opts || {};
    var bodyR    = opts.bodyR    != null ? opts.bodyR    : 22;
    var compFloor = opts.compFloor != null ? opts.compFloor : 14;
    var compPad  = opts.compPad  != null ? opts.compPad  : 4;
    var w2s = window.KNSim.worldToScreen;
    // Single-body (user-placed) grabs take priority; a structure's member stars are
    // tracked separately, because grabbing one should grab the WHOLE structure (operating
    // a cluster/galaxy's stars == operating the cluster/galaxy itself), not pluck out a
    // lone member that is really just a tracer of the swarm.
    var best = null, bestD = bodyR;
    var cloud = null, cloudD = bodyR;
    for (var i = 0; i < sim.bodies.length; i++) {
      var b = sim.bodies[i];
      if (b.state !== 'orbit') continue;
      var p = w2s(sim, w, h, b.x, b.y);
      var d = Math.hypot(p[0] - sx, p[1] - sy);
      if (b._cloud) {
        if (d < cloudD) { cloudD = d; cloud = b; }
      } else if (d < bestD) { bestD = d; best = b; }
    }
    if (best) return { kind: 'body', bodyId: best.id, label: best.name };
    // A member star resolves to its parent structure. A companion-side member maps to the
    // companion grab (drag → re-aim / eject the whole swarm, long-press → reposition it);
    // a central-side member belongs to the immovable primary, so it falls through to pan.
    if (cloud) {
      var role = cloud._cloudRole || cloud._cloudOrigin;
      if (role === 'companion' && sim.binary && sim.binary.enabled) {
        return { kind: 'companion', label: tr('companion', '伴星') };
      }
    }
    if (sim.binary && sim.binary.enabled) {
      var bin = sim.binary;
      var bp = w2s(sim, w, h, bin.x2, bin.y2);
      var sType = bin.type || 'bh';
      var hz = window.KNphysics.horizons(bin.M2, bin.Q2 || 0, bin.a2 || 0);
      var visualR = sType === 'bh'
        ? Math.max(4, (isFinite(hz.rplus) ? hz.rplus : bin.M2) * sim.view.scale)
        : Math.max(6, (bin.R_star2 || 3) * sim.view.scale * 0.7);
      var hitR = Math.max(compFloor, visualR + compPad);
      if (Math.hypot(sx - bp[0], sy - bp[1]) <= hitR) return { kind: 'companion', label: tr('companion', '伴星') };
    }
    return null;
  }

  // Reposition the grabbed target to a world coordinate (keeps velocity).
  function moveGrabTo(sim, g, wx, wy) {
    if (g.kind === 'companion') {
      var bin = sim.binary;
      if (!bin) return;
      bin.x2 = wx; bin.y2 = wy;
    } else {
      var b = sim.bodies.find(function (x) { return x.id === g.bodyId; });
      if (b) { b.x = wx; b.y = wy; }
    }
  }

  window.KNInteract = {
    starVisualR: starVisualR,
    hitTestGrabbable: hitTestGrabbable,
    moveGrabTo: moveGrabTo,
  };
})();
