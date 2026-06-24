# Scientists Backend

Local LLM backend for the Black Hole Lab **Scientists** page. It roleplays famous
physicists and astronomers (Einstein, Feynman, Newton, Galileo, Kepler, Hubble,
Hawking, Chandrasekhar, Sagan, Vera Rubin, Noether, Copernicus) and answers
math / physics / astronomy / cosmology questions.

It runs on your local machine against an [Ollama](https://ollama.com) server (an
RTX 3060 is the design target) and is reachable from your phone over Tailscale.

## Clean isolation

This backend shares **no code** with the static browser demo. The only contract
is the small REST/SSE API below. The demo's `serve.mjs` and root files are
untouched; the frontend (`/scientists.html`) talks to this process over HTTP.

```
Browser (scientists.html / .jsx)  --HTTP/SSE-->  scientists-backend  --HTTP-->  Ollama (3060)
        served by serve.mjs :5184                       :5188                     :11434
```

## Per-language model switching

Switching the UI language switches the model. Each request carries `lang`, and
the backend serves it with that language's strongest 3060-sized model:

| Language | Default model | Why |
|---|---|---|
| Traditional Chinese (`zh`) | `jcai/llama-3-taiwan-8b-instruct` | Tops the Open TW LLM Leaderboard among Taiwan-localized 8B models; authentic zh-TW terminology. ~6 GB at Q4. |
| English (`en`) | `phi4` (14B) | Leads STEM/math reasoning at this tier (MATH ~80%). ~10 GB at Q4 -- tight on 12 GB; see fallbacks. |

Alternatives: `breeze-2` / MediaTek Breeze for zh, `qwen3:8b` (safe, strong
bilingual) or `qwen3:14b` (quality) for either. Override with `SCI_MODEL_ZH` /
`SCI_MODEL_EN`.

**Runs immediately (auto-fallback).** If a preferred model isn't pulled yet, the
backend automatically falls back to the strongest model you *do* have installed
(see `SCI_FALLBACKS_ZH` / `SCI_FALLBACKS_EN`) so the page works right away. The
startup log and `/api/health` (`modelStatus`) show whether each language is
running the preferred model or a fallback. Once you `ollama pull` the preferred
model it is used automatically -- no config change needed.

## Setup

### 1. Install Ollama and pull the models

```powershell
# Install from https://ollama.com, then:
ollama pull jcai/llama-3-taiwan-8b-instruct   # Traditional Chinese
ollama pull phi4                              # English (or: ollama pull qwen3:8b)
```

If VRAM is tight on the 3060, prefer `qwen3:8b` for both and/or lower
`SCI_CONTEXT_TOKENS_EN`.

### 2. Start everything (one command)

From the repo root, run both the static page server and this backend together:

```powershell
npm run dev:all
#   [web] static page  http://127.0.0.1:5184
#   [api] LLM backend  http://127.0.0.1:5188
# open http://127.0.0.1:5184/scientists.html   (Ctrl+C stops both)
```

Env overrides pass through, e.g. `SCI_MODEL_ZH=qwen3:8b npm run dev:all`.

Prefer separate terminals? `npm run dev` (page only) and `npm run dev:api`
(backend only, = `node scientists-backend/server.mjs`) do the same thing.
Configuration is environment-driven; copy `.env.example` for reference. (The
backend does not auto-load `.env`; set real env vars or use your shell.)

> **Both servers must be running.** The page (5184) and the backend (5188) are
> separate processes; if only the page is up you'll see "無法連到後端 / Cannot
> reach the backend". Ollama (11434) being up is not enough on its own.

## Mobile over Tailscale

Expose **both** ports on your tailnet (static page + backend API):

```powershell
tailscale serve --bg --https=5184 http://127.0.0.1:5184   # the page
tailscale serve --bg --https=5188 http://127.0.0.1:5188   # this backend
```

On the phone:
1. Open `https://<your-host>.ts.net:5184/scientists.html`.
2. Tap **設定 / Settings** and set the backend URL to
   `https://<your-host>.ts.net:5188` (or append `?api=https://<host>:5188` to the
   page URL once). It is remembered in `localStorage`.

## Context window: summarize at 70%, then restart

Long tutoring sessions would overflow the small KV cache on a 3060. When the
estimated prompt reaches `SCI_SUMMARIZE_AT` (default **0.70**) of the model's
context window, the backend:

1. asks the model to compress the dialogue into a compact bilingual "memory",
2. clears the running history and seeds the next turn with that memory,
3. emits an SSE `summary` event so the UI shows a "context restarted" notice.

The context meter in the header shows current usage.

## Wikipedia compatibility

Two complementary paths (the `retrieveContext` seam in `knowledge/wiki.mjs` is
the single integration point, so an external "LLM-wiki" service can replace it):

**A. Live retrieval (RAG).** Set `SCI_WIKI_RAG=1`. Each question pulls the intro
of the best-matching Wikipedia article (zh.wikipedia in the `zh-tw` variant for
Chinese, en.wikipedia for English) and injects it as reference context. Fails
open -- if Wikipedia is unreachable the chat proceeds normally.

**B. Offline fine-tuning.** Build a chat-format dataset from Wikipedia and
LoRA-fine-tune a local model:

```powershell
node knowledge/build-finetune-dataset.mjs --lang zh --out data-zh.jsonl
node knowledge/build-finetune-dataset.mjs --lang en --out data-en.jsonl
# fine-tune with Unsloth / Llama-Factory, export to GGUF,
# ollama create my-sci-zh -f Modelfile
# then: SCI_MODEL_ZH=my-sci-zh
```

Pass `--topics topics.txt` (one topic per line) to use your own topic list.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | - | status, resolved models, Ollama liveness |
| GET | `/api/scientists` | - | persona list (id, names, fields, blurb, accent) |
| POST | `/api/chat` | `{sessionId?, scientistId, lang, message}` | **SSE** stream |
| POST | `/api/session/reset` | `{sessionId}` | `{ok}` |

SSE event types on `/api/chat`: `meta` (sessionId, model, lang, usage),
`token` (text delta), `summary` (start/done/error), `done` (token counts,
usage), `error`.

## Verify

```powershell
npm run check     # node --check on every module
```
