/* Shared drag-to-move + resize for floating viewport windows (desktop).
 *
 * Move: press a window's drag handle and drag — the window follows the pointer
 * as soon as it travels past a few pixels (no hold/long-press). A press that
 * never crosses that threshold stays a plain click, so the handle's own controls
 * (collapse chevron / view switch) still work and a tap never nudges the window.
 * The position is clamped to the parent (the viewport) so a window can never be
 * dragged past the bounds.
 *
 * Resize: a bottom-right grip (onResizeDown) drags the window's width/height,
 * clamped so the window stays inside the viewport (it can never grow past the
 * bounds) and never shrinks below a sensible minimum.
 *
 * Overlap: pressing anywhere inside a window raises it above the others (a
 * running z-index counter), so the window you grab comes to the front and only
 * that (topmost) window moves — overlapping windows never move together.
 *
 * Persistence: each window's position AND size are keyed by `id` and saved to
 * localStorage, so it reopens where and how big it was left after a reload.
 *
 * Usage in a component:
 *   const drag = knUseDragMove('tidal', initial);   // id required; initial {x,y} optional
 *   <div ref={drag.rootRef} style={drag.style}
 *        className={`... kn-draggable ${drag.dragging ? 'is-dragging' : ''} ${drag.resized ? 'kn-resized' : ''}`}>
 *     <div className="...-head" onPointerDown={drag.onHeadDown}> ... </div>
 *     <div className="kn-resize-grip" onPointerDown={drag.onResizeDown} />
 *   </div>
 * Call drag.reclamp() when the window's size changes (e.g. collapse toggles).
 * Optional 3rd arg: { minW, minH } overrides the resize minimum.
 *
 * If `initial` is omitted (and nothing was saved) the window keeps its CSS
 * position/size until first dragged, so right-anchored windows stay anchored.
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
function knReadWinSize(id) {
  try {
    var s = window.localStorage.getItem('knwinsize:' + id);
    if (!s) return null;
    var p = JSON.parse(s);
    return (p && typeof p.w === 'number' && typeof p.h === 'number') ? p : null;
  } catch (e) { return null; }
}

function knUseDragMove(id, initial, opts) {
  var React = window.React;
  var minW = (opts && opts.minW) || 200;
  var minH = (opts && opts.minH) || 140;
  var posState = React.useState(function () { return knReadWinPos(id) || initial || null; });
  var pos = posState[0], setPos = posState[1];
  var sizeState = React.useState(function () { return knReadWinSize(id) || null; });
  var size = sizeState[0], setSize = sizeState[1];
  var dragState = React.useState(false);
  var dragging = dragState[0], setDragging = dragState[1];
  var zState = React.useState(null);
  var z = zState[0], setZ = zState[1];
  var rootRef = React.useRef(null);
  var grab = React.useRef(null);
  // True once a press on the handle has turned into an actual move; lets a
  // header title distinguish a click (toggle) from a drag (move) — read it in
  // an onPointerUp/onClick and skip the toggle when a drag just happened.
  var moved = React.useRef(false);

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
  function reclamp() {
    var el = rootRef.current;
    // Shrink the size first so it always fits inside the viewport from the
    // current top-left, then re-clamp the position.
    if (el && el.parentElement) {
      var pr = el.parentElement.getBoundingClientRect();
      var er = el.getBoundingClientRect();
      var left = Math.max(0, er.left - pr.left), top = Math.max(0, er.top - pr.top);
      var maxW = Math.max(minW, pr.width - left), maxH = Math.max(minH, pr.height - top);
      setSize(function (s) {
        if (!s) return s;
        var nw = Math.max(minW, Math.min(maxW, s.w));
        var nh = Math.max(minH, Math.min(maxH, s.h));
        return (nw === s.w && nh === s.h) ? s : { w: nw, h: nh };
      });
    }
    setPos(function (p) { return p ? clamp(p.x, p.y) : p; });
  }

  // Clamp an explicit/saved initial position on mount; no-op while CSS-positioned.
  React.useLayoutEffect(function () { reclamp(); }, []);
  // Keep inside the viewport when it resizes (only once the window owns a pos/size).
  React.useEffect(function () {
    window.addEventListener('resize', reclamp);
    return function () { window.removeEventListener('resize', reclamp); };
  }, []);
  // Persist the position (per id) whenever it settles to a real value.
  React.useEffect(function () {
    if (!pos) return;
    try { window.localStorage.setItem('knwin:' + id, JSON.stringify(pos)); } catch (e) {}
  }, [id, pos]);
  // Persist the size (per id) whenever it settles to a real value.
  React.useEffect(function () {
    if (!size) return;
    try { window.localStorage.setItem('knwinsize:' + id, JSON.stringify(size)); } catch (e) {}
  }, [id, size]);
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
    moved.current = false;   // fresh gesture — assume click until it travels
    function cancel() {
      grab.current = null;
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    function onMove(ev) {
      var g = grab.current;
      if (!g) return;
      if (!g.armed) {
        // Start moving the moment the pointer travels past a small threshold, so
        // a plain drag moves the window immediately. A press that never crosses
        // it stays a click (chevron / view-switch taps), so taps never nudge.
        if (Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) <= 4) return;
        g.armed = true;
        moved.current = true;
        setDragging(true);
      }
      var pr2 = el.parentElement.getBoundingClientRect();
      setPos(clamp(ev.clientX - pr2.left - g.dx, ev.clientY - pr2.top - g.dy));
    }
    function onUp() { cancel(); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  }

  function onResizeDown(e) {
    if (e.button !== 0) return;
    var el = rootRef.current;
    if (!el || !el.parentElement) return;
    e.stopPropagation();  // don't arm the header drag
    var pr = el.parentElement.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    // Top-left in parent space (fixed for the gesture) bounds how big we can grow.
    var left = Math.max(0, er.left - pr.left), top = Math.max(0, er.top - pr.top);
    var start = { mx: e.clientX, my: e.clientY, w: er.width, h: er.height };
    setDragging(true);
    function onMove(ev) {
      var maxW = pr.width - left, maxH = pr.height - top;
      var w = Math.max(minW, Math.min(maxW, start.w + (ev.clientX - start.mx)));
      var h = Math.max(minH, Math.min(maxH, start.h + (ev.clientY - start.my)));
      setSize({ w: w, h: h });
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  }

  var style;
  if (pos || size || z != null) {
    style = {};
    if (pos) { style.left = pos.x + 'px'; style.top = pos.y + 'px'; style.right = 'auto'; style.bottom = 'auto'; }
    if (size) { style.width = size.w + 'px'; style.height = size.h + 'px'; }
    if (z != null) style.zIndex = z;
  }
  return {
    rootRef: rootRef, dragging: dragging, resized: !!size, movedRef: moved,
    onHeadDown: onHeadDown, onResizeDown: onResizeDown, reclamp: reclamp, style: style,
  };
}
window.knUseDragMove = knUseDragMove;

/* Per-window UI preference that survives a reload (the active view switch, the
 * collapse state, ...). Keyed by (window id, key) alongside the window position,
 * so a small window reopens with the same item selected. Storage is wrapped so
 * private mode can't throw. Returns a [value, setValue] pair like useState. */
function knReadWinPref(id, key, fallback) {
  try {
    var s = window.localStorage.getItem('knwinpref:' + id);
    if (!s) return fallback;
    var o = JSON.parse(s);
    return (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, key)) ? o[key] : fallback;
  } catch (e) { return fallback; }
}
function knWriteWinPref(id, key, val) {
  try {
    var s = window.localStorage.getItem('knwinpref:' + id);
    var o = s ? JSON.parse(s) : {};
    if (!o || typeof o !== 'object') o = {};
    o[key] = val;
    window.localStorage.setItem('knwinpref:' + id, JSON.stringify(o));
  } catch (e) { /* storage blocked */ }
}
function knUseWinPref(id, key, fallback) {
  var React = window.React;
  var st = React.useState(function () { return knReadWinPref(id, key, fallback); });
  React.useEffect(function () { knWriteWinPref(id, key, st[0]); }, [st[0]]);
  return st;
}
window.knUseWinPref = knUseWinPref;
