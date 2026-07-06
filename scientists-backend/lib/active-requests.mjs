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
