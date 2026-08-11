# Wiki Knowledge Base (`wiki-kb`)

Crawls Wikipedia (space / astrophysics / cosmology / adjacent fields + the
scientists and history behind them) into a **knowledge graph + hybrid RAG
corpus**, with scheduled update checks. Cleanly isolated like the rest of the
repo: the only outward contract is a small HTTP API.

- **Zero npm dependencies.** Storage is Node's built-in `node:sqlite`
  (Node >= 22.5; this box runs v24); embeddings come from local Ollama
  (`bge-m3`, same 3060 as scientists-backend).
- **Languages.** zh (always fetched in the `zh-tw` variant) and en are priority
  languages: full category-tree crawl, **full text** stored. The other six
  (ja/ko/de/fr/es/it) inherit scope via langlinks and store **intros only**
  (widen with `WKB_FULLTEXT_LANGS`).
- **Polite crawling.** Serial requests at 250 ms, descriptive User-Agent,
  `maxlag=5`, backoff retries (~4 req/s, so a full crawl takes hours). Every
  stage is idempotent and resumable — queue and content hashes live in SQLite.

Corpus state (last full sweep, 2026-07-23): **126,090 pages** (en 34.6k, zh
26.3k), **453,434 chunks all embedded**, 43.5k entities, 219k edges.
Deliberately left queued: ~24.5k langlink projections for the six secondary
languages and ~11.7k of the en astronomy backlog (mostly named minor planets).
`data/kb.sqlite` is gitignored.

```
crawl.mjs / check-updates.mjs ──> data/kb.sqlite <── server.mjs (:5189, standalone/admin)
      │  MediaWiki + Wikidata API                        ↑
      └─ Ollama /api/embed (bge-m3)                      │ lib/routes.mjs (shared dispatch)
                                                         │
                            scientists-backend/server.mjs (:5188, merged — the live app)
```

`lib/routes.mjs` owns the route dispatch. The local `server.mjs` wraps it for
standalone crawl/admin use (`kb-admin.html`, no chat model needed); the live app
uses the copy merged into `scientists-backend/server.mjs` — same process, same
`data/kb.sqlite` (WAL, two connections are fine). Enabling RAG is just
`SCI_WIKI_RAG=1` + `npm run dev:all`; no `SCI_WIKI_KB_URL`, no second terminal.
`knowledge/wiki.mjs` calls `lib/retrieve.mjs` directly and falls back to live
Wikipedia on any error or empty result — fail-open, chat never breaks on KB.

## Data model (`data/kb.sqlite`)

| Table | Contents | Update mechanism |
|---|---|---|
| `pages` | Full text / intro + metadata: lang, QID, kind (topic/scientist/history), URL, source + licence (Wikipedia, CC BY-SA 4.0), `rev_id`/`rev_time`, `crawled_at`/`updated_at` | Re-fetch only when `rev_id` differs |
| `page_categories` | Visible categories | Rebuilt with the page |
| `chunks` | Section-sliced text + `text_hash` + embedding BLOB | Hash compare: unchanged sections **keep their vectors**, only changed ones re-embed |
| `chunks_fts` | FTS5 index (CJK tokenized as character bigrams, so zh/ja/ko are searchable) | Rebuilt with chunks |
| `entities` / `edges` | Knowledge graph: Wikidata entities (label/description/dates) + typed relations (advisor P184/P185, influence P737, discoverer P61, instance-of P31, parent body P397, …) | Incremental sync on `crawl.mjs graph` / update check |
| `crawl_queue` | Pending fetches with a `reason` (`category:…` / `langlink:…`) | Idempotent enqueue |
| `sync_log` | Operational audit: added/updated/deleted/discover/update-check | Append-only |
| `eval_runs` / `eval_cases` | Eval history, browsable in kb-admin | Append-only |
| `feedback` | Chat up/down votes, reasons, corrections, `ned`, `sources`, `status`/`auto_label` | Upsert by `cid`; triaged by `scientists-backend/knowledge/triage-feedback.mjs` |

## Hybrid retrieval

`lib/retrieve.mjs`: BM25 (FTS5) takes the top 400 candidates; vector cosine
full-scans when the corpus is small, otherwise **re-ranks the BM25 candidates
only** (above `WKB_SCAN_MAX_CHUNKS`). The two channels fuse with **weighted
RRF** — rank each lang/kind-filtered candidate per channel (ties share a rank),
`score = Σ w_c / (rrfK + rank_c)`, normalized to [0,1] by the observed max
(defaults 0.45 / 0.55, `WKB_RRF_K=10`; `WKB_FUSION=weighted` reverts to the old
min-max blend). Then a recency factor:

```
decay = floor + (1 - floor) * exp(-ln2 * page_revision_age / half_life)
```

Defaults: 3-year half-life (`WKB_DECAY_HALFLIFE_DAYS=1095`), floor 0.6
(`WKB_DECAY_FLOOR`) — stale pages sink, classic physics is never buried. With
Ollama down retrieval degrades to BM25-only rather than failing.

> **Known gap:** because the corpus has ~453k embedded chunks, the vector
> channel is *permanently* in re-rank mode and contributes **zero independent
> recall** — a query that does not FTS-match returns nothing. This is the
> paraphrase-slice deficit tracked as RET3 in `../OPTIMIZATION-PLAN.md`.

### Graph channel (HippoRAG-style)

Design record: `docs/rag-architecture-decision.md`. Query n-grams and the top
hybrid hits seed Wikidata QIDs, then bounded **Personalized PageRank**
(damping ~0.5) over an in-memory adjacency list lifts pages 1-2 hops from the
seeds. Fusion is **multiplicative**: `score *= 1 + wGraph × g` — notes without a
QID are unaffected, `WKB_W_GRAPH=0` disables the channel, and any error falls
back to plain hybrid search. A multi-hop **expansion** probe can additionally
pull in up to `graphExpandPages` representative chunks that the lexical/vector
channels cannot see (anchored to the k-th organic score); it fires on 0/69
golden queries today, so treat it as unproven rather than load-bearing.

Knobs (`config.mjs → retrieve`, all `WKB_*`-overridable): `wGraph`,
`graphSeedPages`, `graphExpandPages`, `graphExpandScore`, `pprAlpha`,
`pprIters`.

### Query routing (QROUTE, `lib/query-route.mjs`)

Every query is classified by pure string work (no DB, no LLM, no embedding)
into `graph-heavy` (relations: advisor, named-after, awards, discoverer,
possessives on person names), `lookup` (short definitional), `paraphrase` (long
descriptions that deliberately avoid the target page's wording), or `balanced`.
Modes via `WKB_QROUTE`:

| Mode | Behaviour |
|---|---|
| `off` | No classification; bit-for-bit identical to pre-QROUTE |
| `observe` (**default**) | Classify, write `route` into eval slices and `search`/`context` traces, change **nothing** |
| `on` | Apply the policy |

The `on` policy currently does exactly one thing: skip the multi-hop expansion
probe for `lookup`/`paraphrase` (pure cost saving — it fires 0 times on the
golden set). **PPR always stays on** and every per-route `wGraph` scale is 1;
the boost fires 69/69, so disabling it is a ranking change that needs paired
`npm run eval:ab -- qroute` evidence first.

## Commands

```powershell
ollama pull bge-m3                       # embeddings (optional -> BM25-only)

node crawl.mjs all --limit 300           # small trial run (resumable, repeatable)
node crawl.mjs all                       # discover -> fetch -> langlinks -> graph -> embed
node crawl.mjs status                    # corpus stats
node server.mjs                          # http://127.0.0.1:5189

node check-updates.mjs --dry-run         # report only
node check-updates.mjs --discover        # rev compare + scan for new pages + re-embed
.\schedule-task.ps1                      # Windows Task Scheduler, daily 03:30
.\schedule-task.ps1 -Weekly -Time "04:00"
.\schedule-task.ps1 -Unregister
```

Update check: (1) compare `rev_id` in batches of 50 — changed pages are
re-fetched and re-chunked (unchanged sections keep vectors), pages deleted
upstream are soft-deleted; (2) `--discover` re-scans seed categories shallowly
and langlink-projects new pages; (3) sync new QIDs into the graph and embed new
chunks; (4) everything lands in `sync_log`. Log file: `data\update-check.log`.

CRUD / operations (`kb-admin.mjs`):

```powershell
node kb-admin.mjs stats
node kb-admin.mjs list --lang zh --kind scientist
node kb-admin.mjs get --lang zh --title "史蒂芬·霍金" --chunks
node kb-admin.mjs add --lang en --title "Kerr metric"       # manual ingest
node kb-admin.mjs refresh --id 12                           # force re-fetch
node kb-admin.mjs delete --id 12                            # soft delete (--hard purges)
node kb-admin.mjs reembed                                   # backfill (--all re-embeds)
node kb-admin.mjs entity --qid Q937
node kb-admin.mjs graph --qid Q937 --depth 2
node kb-admin.mjs export --out corpus.jsonl --lang zh       # finetune-ready dump
node kb-admin.mjs log --limit 50
node kb-admin.mjs vacuum
node kb-admin.mjs search --q "黑洞的事件視界" --langs zh,en
```

## HTTP API (`server.mjs`, :5189)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + corpus counts + embedding-model status |
| GET | `/api/stats` | Full statistics |
| GET | `/api/search?q=&langs=zh,en&k=8&kind=` | Hybrid results (scores, decay, sources) |
| GET | `/api/context?q=&lang=zh&maxChars=1500` | Prompt-ready citation block (title, lang, revision date) |
| GET/POST/DELETE | `/api/page` | Page CRUD (POST `{lang,title,force}`; DELETE `?id=&hard=1`) |
| GET | `/api/entity?qid=` | Graph entity (out/in edges, linked pages) |
| GET | `/api/graph?qid=&depth=` | Subgraph for visualization |

## Scope and extension

Seed categories and exclusion rules live in `lib/seeds.mjs` (sci-fi, film, TV,
games, music, astrology, list and disambiguation pages are excluded). Extend
without touching code:

```powershell
$env:WKB_EXTRA_SEEDS   = "en|Category:Radio astronomy|2;zh|Category:射电天文学|2"
$env:WKB_EXCLUDE_EXTRA = "(pattern|to|exclude)"
```

Beyond core astronomy/astrophysics/cosmology, scientists, and history of
science, the corpus also covers philosophy/history/sociology of science, space
policy and law, science ethics/communication, archaeoastronomy
(`humanities/*`, `people/{philosophers,historians,sociologists}-of-science`),
and space life science: space medicine, astrobiology, SETI, Fermi paradox,
panspermia, extremophiles, habitability (`space-life/*`,
`people/{astronauts,astrobiologists}`).

Three traps worth remembering:

- zh Wikipedia stores **one script variant per category** and the API does not
  convert category titles, so a seed written in the wrong variant silently
  matches zero pages (five were fixed in 2026-07: 廣義相對論, 太陽系外行星,
  天體生物學, 天體物理學家, 物理學史). Test both spellings with
  `categoryMembers` before adding a zh seed.
- `WKB_MAX_PAGES_PER_LANG` is a cap **including existing corpus**, not a
  per-run increment. Once a language exceeds it, every later discover silently
  enqueues nothing.
- `openDb` sets `busy_timeout` to 15 s for a reason: without it any second
  writer (the merged server storing feedback while a crawl runs) dies with
  `SQLITE_BUSY`. Long embed runs also need the retry/backoff — Windows
  ephemeral-port exhaustion killed a 100k-chunk run mid-way once.
- When the queue mixes subtrees, `crawl.mjs fetch --reasons <file>` (one
  `crawl_queue.reason` per line, e.g. `category:Category:Philosophy of science`)
  drains just that subtree and leaves the rest queued.

Main env vars (full list in `config.mjs`): `WKB_DB`, `WKB_LANGS`,
`WKB_PRIORITY_LANGS`, `WKB_FULLTEXT_LANGS`, `WKB_MAX_PAGES_PER_LANG`,
`WKB_EMBED_MODEL`, `WKB_OLLAMA_URL`, `WKB_TOP_K`, `WKB_W_BM25`/`WKB_W_VEC`,
`WKB_DECAY_HALFLIFE_DAYS`, `WKB_DECAY_FLOOR`, `WKB_QROUTE`, `WKB_PORT`.

## Verify

```powershell
npm run check        # node --check every module + unit tests (no DB, no Ollama)
npm test             # unit tests only (eval/stats, lib/query-route)
npm run eval:gate    # retrieval regression gate — needs kb.sqlite AND live bge-m3
```

`check` is deliberately corpus- and Ollama-free so it can run anywhere (this is
what CI runs). `eval:gate` needs both; see `eval/README.md`.

Content licence: Wikipedia text is **CC BY-SA 4.0** and every `pages` row
records source + licence. Preserve attribution when displaying it — the
`/api/context` citation header already carries title and revision date.
