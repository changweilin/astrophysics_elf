// Shared "is Ollama busy" tracker for every LLM-touching call in this
// process. Both wiki-kb's own generation calls (translate/generate/embed)
// and -- when merged in-process by scientists-backend/server.mjs -- the
// chat/summarize/follow-up calls in scientists-backend/lib/ollama.mjs go
// through the same counter here, so either side can see "an LLM call from
// the OTHER side is already running" and react (refuse a new KB write,
// show a busy dot) instead of silently queuing behind Ollama's own request
// serialization. Standalone wiki-kb (wiki-kb/server.mjs) imports this same
// module but only ever registers its own calls, since there is no chat
// backend sharing the process in that deployment.
let inFlight = 0;

export function isBusy() {
  return inFlight > 0;
}

// Run an Ollama-bound async call under the shared counter. Always releases,
// even if `fn` throws or its signal aborts.
export async function withBusy(fn) {
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
  }
}
