# Scientists Backend

Local LLM backend for the lab's **Scientists** page (`/scientists.html`). It
roleplays famous physicists and astronomers (Einstein, Feynman, Newton,
Galileo, Kepler, Hubble, Hawking, Chandrasekhar, Sagan, Vera Rubin, Noether,
Copernicus) and answers math / physics / astronomy / cosmology questions
against a local [Ollama](https://ollama.com) server (RTX 3060 is the design
target), reachable from a phone over Tailscale.

**Clean isolation.** Shares no code with the browser demo; the only contract is
the REST/SSE API below. It also hosts the merged wiki-kb routes in-process
(`../wiki-kb/lib/routes.mjs`), so the live app talks to one port.

```
Browser (scientists.html)  --HTTP/SSE-->  scientists-backend  --HTTP-->  Ollama
     served by serve.mjs :5184                 :5188  (+ merged KB)        :11434
```

## Run

```powershell
npm run dev:all     # from the repo root: page :5184 + this backend :5188
npm run dev:api     # this backend only (= node scientists-backend/server.mjs)
```

Both processes must be up — Ollama alone is not enough (the page shows
"無法連到後端 / Cannot reach the backend"). Config is environment-driven;
`.env.example` is reference only, the backend does not auto-load `.env`.

Mobile: expose **both** ports on the tailnet, then set the backend URL in the
page's Settings (stored in `localStorage`, or append
`?api=https://<host>:5188` once).

```powershell
tailscale serve --bg --https=5184 http://127.0.0.1:5184
tailscale serve --bg --https=5188 http://127.0.0.1:5188
```

## Models

Each request carries `lang`; switching UI language switches the model.

| Language | Default | Why |
|---|---|---|
| Traditional Chinese (`zh`) | `jcai/llama-3-taiwan-8b-instruct` | Best Taiwan-localized 8B; authentic zh-TW terminology. ~6 GB at Q4 |
| English (`en`) | `phi4` (14B) | Leads STEM/math reasoning at this tier. ~10 GB at Q4 — tight on 12 GB |

Alternatives: `breeze-2` for zh, `qwen3:8b` (safe bilingual) or `qwen3:14b` for
either. Override with `SCI_MODEL_ZH` / `SCI_MODEL_EN`.

- **Auto-fallback.** If a preferred model is not pulled, the backend falls back
  to the strongest installed one (`SCI_FALLBACKS_ZH`/`_EN`) so the page works
  immediately; `/api/health` (`modelStatus`) reports preferred-vs-fallback and
  it switches automatically once you `ollama pull` the real one.
- **The model pin is shared across devices**, not per browser
  (`modelOverride` in `/api/health`). Ollama keeps one model loaded at a time,
  so a per-browser pin would make a phone and a desktop fight over the GPU and
  force a reload nearly every turn. Clients read `/api/health` before assuming a
  model. `busy: true` means a generation from *any* device is in flight.

## Context window: summarize at 70%, then restart

Long tutoring sessions would overflow the 3060's KV cache. When the estimated
prompt reaches `SCI_SUMMARIZE_AT` (default **0.70**) of the context window the
backend compresses the dialogue into a compact bilingual "memory", clears the
history, seeds the next turn with it, and emits an SSE `summary` event.

Token estimation is script-aware (CJK ~1.6 chars/token vs ~3.8 for Latin) and
anchored to the last *measured* `prompt_eval_count`, so the running estimate can
never drift below reality and silently truncate.

## Knowledge / RAG

The `retrieveContext` seam in `knowledge/wiki.mjs` is the single integration
point (an external service could replace it wholesale).

- **Offline KB first.** With `SCI_WIKI_RAG=1`, retrieval calls
  `../wiki-kb/lib/retrieve.mjs` directly in-process — hybrid BM25 + vector with
  time decay and a graph channel over 8 languages. No separate server or URL.
- **Live Wikipedia fallback.** Only when the KB has no match; fails open, so
  chat never breaks because retrieval did.
- **Query rewrite** (`lib/query-rewrite.mjs`): a high-precision pronoun/opener
  gate decides whether a turn is anaphoric, and only then spends one
  deterministic local call to rewrite it before retrieval. Fail-open; the
  rewritten query is surfaced as `meta.retrievalQuery`.
- **Offline fine-tuning** (optional path B):

  ```powershell
  node knowledge/build-finetune-dataset.mjs --lang zh --out data-zh.jsonl
  # fine-tune with Unsloth / Llama-Factory -> GGUF -> ollama create -> SCI_MODEL_ZH=...
  ```

  `--topics topics.txt` supplies your own topic list.

## Feedback loop

Chat up/down votes (with reasons and corrections) go to the `feedback` table in
the shared `kb.sqlite`, upserted by `cid`, with server-side normalized edit
distance. `knowledge/triage-feedback.mjs` walks `status='new'` rows and labels
them deterministically (`positive` / by reason / `major`|`minor` on `ned>0.6`),
falling back to one fail-open judge call only for a bare downvote; rows it
cannot judge stay `new`. Idempotent; `--limit` / `--no-llm` / `--dry-run`.
Downstream use (exemplars, finetune sourcing) is LOOP2 in
`../OPTIMIZATION-PLAN.md`.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | status, resolved models, `modelOverride`, `busy`, Ollama liveness, KB health |
| GET | `/api/scientists` | — | persona list (id, names, fields, blurb, accent, `starters`) |
| POST | `/api/chat` | `{sessionId?, scientistId, lang, message, history?}` | **SSE** stream |
| POST | `/api/chat/stop` | `{sessionId}` | `{ok}` |
| POST | `/api/session/reset` \| `/summarize` | `{sessionId, lang?}` | `{ok, ...}` |
| POST | `/api/followups` | `{sessionId?, lang, history?}` | `{ok, followups[]}` |
| POST | `/api/discuss` | `{sessionId?, scientistIds[], lang, message, rounds?}` | **SSE** roundtable |
| POST | `/api/discuss/stop` \| `/reset` \| `/summarize` \| `/followups` | `{sessionId, ...}` | `{ok, ...}` |
| POST/GET | `/api/feedback` | vote payload / query | upsert by `cid` / list |
| GET | `/api/feedback/stats` | — | aggregate rates |
| * | wiki-kb routes | — | merged from `../wiki-kb/lib/routes.mjs` |

SSE on `/api/chat`: `meta` (sessionId, model, lang, scientistId, `auto`, usage),
`assigned` (routed id/name/accent/via, auto mode only), `token`, `summary`
(start/done/error), `done` (token counts), `error`.

SSE on `/api/discuss`: `meta` (ranked `speakers`), `phase`
(`discussing`/`concluding`, round, stopReason), `speaker` (id, name, accent,
`role` = turn|conclusion), `token`, `turn-done`, `done` (rounds, resolved,
stopReason), `error`.

Behaviours worth knowing:

- **Auto-assign** — `scientistId: "auto"` routes the question to the best-matched
  persona with an *isolated* LLM call (keyword ranking as fallback), so picking
  an expert never consumes the answer's context window. The session id stays
  `auto`, so each turn can be answered by a different expert.
- **Follow-ups** — 3-4 next questions generated by an isolated call; the
  generation and unclicked options never enter context. `SCI_FOLLOWUPS=0`
  disables. Requests abort on client disconnect and debounce per
  session/discussion, so a superseded turn stops occupying the GPU.
- **Rehydration** — sessions are memory-only. On reload / thread resume /
  backend restart the client replays its visible `history` (or `rounds`) and the
  backend seeds an *empty* session from it, summarizing first if that would
  cross the 70% line. A live session is never double-seeded.
- **Per-scientist starters** — `/api/scientists` returns a `{zh, en}` starter set
  per persona; the empty state samples from the selected scientist's own set.
- **Roundtable** — the panel is ranked by topic expertise (most expert leads and
  concludes), each speaks building on the others, and the loop stops when a
  neutral moderator judges the question resolved, the transcript hits
  `SCI_DISCUSS_STOP_AT` (default 0.5) of the window, or `SCI_DISCUSS_MAX_ROUNDS`.
  Tunables: `SCI_DISCUSS_*` in `config.mjs`.

## Verify

```powershell
npm run check     # node --check on every module
```
