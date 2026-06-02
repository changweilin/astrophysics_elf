/* Shared long-press drag-to-move for floating viewport windows (desktop).
 *
 * Hold a window's drag handle for ~300ms to arm, then drag to move it; the
 * position is clamped to the parent (the viewport) so a window can never be
 * dragged past the bounds. Until the hold arms, pointer moves are ignored (and
 * a wander cancels the hold), so a quick click on the handle is left for the
 * handle's own controls (collapse chevron / view switch) and never nudges the
 * window. Matches the body-reposition gesture used in the main canvas.
 *
 * Overlap: pressing anywhere inside a window raises it above the others (a
 * running z-index counter), so the window you grab comes to the front and only
 * that (topmost) window moves — overlapping windows never move together.
 *
 * Persistence: each window's position is keyed by `id` and saved to
 * localStorage, so it reopens where it was left after a reload.
 *
 * Usage in a component:
 *   const drag = knUseDragMove('tidal', initial);   // id required; initial {x,y} optional
 *   <div ref={drag.rootRef} style={drag.style}
 *        className={`... kn-draggable ${drag.dragging ? 'is-dragging' : ''}`}>
 *     <div className="...-head" onPointerDown={drag.onHeadDown}> ... </div>
 *   </div>
 * Call drag.reclamp() when the window's size changes (e.g. collapse toggles).
 *
 * If `initial` is omitted (and nothing was saved) the window keeps its CSS
 * position until first dragged, so right-anchored windows stay right-anchored.
 */
var knTopZ = 10;                       // running stack order for raised windows
function knNextZ() { knTopZ += 1; return knTopZ; }

function knReadWinPos(id) {
  try {
    var s = window.localStorage.getItem('knwin:' + id);
    if (!s) return null;
    var p = JSON.parse(s);
    return (p && typeof p.x === 'number' && typeof p.y === 'number') ? p : null;
  } catch (e) { return null; }
}

function knUseDragMove(id, initial) {
  var React = window.React;
  var posState = React.useState(function () { return knReadWinPos(id) || initial || null; });
  var pos = posState[0], setPos = posState[1];
  var dragState = React.useState(false);
  var dragging = dragState[0], setDragging = dragState[1];
  var zState = React.useState(null);
  var z = zState[0], setZ = zState[1];
  var rootRef = React.useRef(null);
  var grab = React.useRef(null);
  var holdTimer = React.useRef(null);

  function clamp(x, y) {
    var el = rootRef.current;
    if (!el || !el.parentElement) return { x: x, y: y };
    var pr = el.parentElement.getBoundingClientRect();
    var pw = el.offsetWidth, ph = el.offsetHeight;
    return {
      x: Math.max(0, Math.min(Math.max(0, pr.width - pw), x)),
      y: Math.max(0, Math.min(Math.max(0, pr.height - ph), y)),
    };
  }
  function reclamp() { setPos(function (p) { return p ? clamp(p.x, p.y) : p; }); }

  // Clamp an explicit/saved initial position on mount; no-op while CSS-positioned.
  React.useLayoutEffect(function () { reclamp(); }, []);
  // Keep inside the viewport when it resizes (only once the window owns a pos).
  React.useEffect(function () {
    window.addEventListener('resize', reclamp);
    return function () { window.removeEventListener('resize', reclamp); };
  }, []);
  // Drop any pending hold if the window unmounts mid-gesture.
  React.useEffect(function () {
    return function () { if (holdTimer.current) clearTimeout(holdTimer.current); };
  }, []);
  // Persist the position (per id) whenever it settles to a real value.
  React.useEffect(function () {
    if (!pos) return;
    try { window.localStorage.setItem('knwin:' + id, JSON.stringify(pos)); } catch (e) {}
  }, [id, pos]);
  // Raise above the other windows on any press inside (so the grabbed window
  // comes to the front and the topmost is always the one you interact with).
  React.useEffect(function () {
    var el = rootRef.current;
    if (!el) return;
    var onDown = function () { setZ(knNextZ()); };
    el.addEventListener('pointerdown', onDown);
    return function () { el.removeEventListener('pointerdown', onDown); };
  }, []);

  function onHeadDown(e) {
    if (e.button !== 0) return;
    var el = rootRef.current;
    if (!el || !el.parentElement) return;
    var pr = el.parentElement.getBoundingClientRect();
    // Current top-left relative to the parent (from state, or measured if the
    // window is still CSS-positioned and hasn't been dragged yet).
    var base = pos;
    if (!base) {
      var er = el.getBoundingClientRect();
      base = { x: er.left - pr.left, y: er.top - pr.top };
    }
    grab.current = {
      dx: e.clientX - pr.left - base.x, dy: e.clientY - pr.top - base.y,
      sx: e.clientX, sy: e.clientY, armed: false,
    };
    function cancel() {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
      grab.current = null;
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    function onMove(ev) {
      var g = grab.current;
      if (!g) return;
      if (!g.armed) {
        // Wandering before the hold arms → treat as a mis-press, drop it.
        if (Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) > 8) cancel();
        return;
      }
      var pr2 = el.parentElement.getBoundingClientRect();
      setPos(clamp(ev.clientX - pr2.left - g.dx, ev.clientY - pr2.top - g.dy));
    }
    function onUp() { cancel(); }
    holdTimer.current = setTimeout(function () {
      if (grab.current) { grab.current.armed = true; setDragging(true); }
    }, 300);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  }

  var style;
  if (pos || z != null) {
    style = {};
    if (pos) { style.left = pos.x + 'px'; style.top = pos.y + 'px'; style.right = 'auto'; style.bottom = 'auto'; }
    if (z != null) style.zIndex = z;
  }
  return { rootRef: rootRef, dragging: dragging, onHeadDown: onHeadDown, reclamp: reclamp, style: style };
}
window.knUseDragMove = knUseDragMove;
