// Registry of in-flight generations, keyed by a client-generated requestId.
//
// The existing cancellation path (`req.on('close', () => ac.abort())`) only
// fires once the underlying TCP connection actually closes. Over a direct
// loopback connection that is immediate, but a mobile client going through a
// reverse proxy (tailscale serve) or a flaky connection can leave that FIN
// delayed or never delivered promptly -- so tapping "Stop" aborts the fetch in
// the browser, but the backend keeps generating (and stays "busy") for a long
// time afterward. Giving the client an explicit stop endpoint keyed by a
// requestId it already controls makes cancellation deterministic regardless
// of what the transport in between does.
const active = new Map(); // requestId -> AbortController

export function registerRequest(requestId, ac) {
  if (!requestId) return;
  active.set(requestId, ac);
}

export function unregisterRequest(requestId) {
  if (!requestId) return;
  active.delete(requestId);
}

// Returns true if a matching in-flight request was found and aborted.
export function abortRequest(requestId) {
  const ac = active.get(requestId);
  if (!ac) return false;
  ac.abort();
  active.delete(requestId);
  return true;
}

// Debounce registry for isolated background generations (follow-up suggestions),
// keyed by a caller-chosen key such as a session id (ORCH5). Follow-ups are a
// best-effort, non-blocking generation the user never explicitly waits on, so
// when a newer turn supersedes an older one there is no reason to keep the
// stale generation grinding the single GPU -- starting a new one for the same
// key aborts the previous one. Distinct from `active` above: that keys on the
// client's requestId for an explicit /stop; this coalesces same-session churn.
const debounced = new Map(); // key -> AbortController

export function beginDebounced(key, ac) {
  if (!key) return;
  const prev = debounced.get(key);
  if (prev) prev.abort();
  debounced.set(key, ac);
}

export function endDebounced(key, ac) {
  if (!key) return;
  // Only clear if we still own the slot -- a newer generation may have already
  // replaced us (and we were the one aborted).
  if (debounced.get(key) === ac) debounced.delete(key);
}
