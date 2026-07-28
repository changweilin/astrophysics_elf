# Knowledge Graph + Scientist LLM — Optimization Plan

Scope: `wiki-kb/` (Wikipedia KG + hybrid RAG) and `scientists-backend/` (Ollama
persona LLM + feedback). Additive, local-first, `node:sqlite` only, local Ollama
only, ASCII identifiers, add-only migrations. Every claim below is grounded in
source (file:symbol) and was cross-verified by an adversarial review pass.

## North star

The stack is architecturally sound (Wikidata-QID entity resolution, weighted-RRF
+ HippoRAG PPR fusion, RAGAS-shaped eval, Langfuse-style tracing, capture-complete
feedback schema). Its problem is that **the improvement flywheel is disconnected**:

- Only 2 of ~10 retrieval knobs are eval-backed, and they were tuned on a
  **14-case golden set** (`wiki-kb/eval/golden.jsonl`, all single-hop factual).
  `rrfK=10` was chosen on MRR 0.780 vs 0.786 — inside sampling noise.
- The feedback table (`scientists-backend/lib/feedback.mjs`) captures
  `correction`, `ned`, `sources`, `request_id`, and reserves `status`/`auto_label`
  — but **no code consumes any of it**; the columns only reset to `new`/`NULL`.
- Two read-path correctness bugs silently waste compute that is already spent
  (see B1, B2).

So the spine is: **make every knob falsifiable first, fix the two read-path bugs,
then deepen the KG and personas against a trustworthy eval.** Nothing gets tuned
before it can be measured — and the cheapest way to make it measurable is to
**hand-author the golden set**, not to wait on a feedback flywheel whose volume on
a low-traffic local demo is unquantified.

## Two correctness bugs — fix regardless of the roadmap

- **B1 — Vector channel gives ZERO independent recall.** `retrieve.mjs:83`
  takes the full-scan branch only when `embedded <= scanMaxChunks` (60000). The
  corpus has **453,434 embedded chunks**, so it is permanently in the
  `else` branch (`retrieve.mjs:112`): cosine is scored **only over BM25's top-400**.
  A query whose tokens don't FTS-match returns nothing, despite a good embedding
  sitting in the row. ~1.8 GB of vectors serve only as a re-ranker. → `RET3`.
- **B2 — Retrieval depth is paid for, then thrown away.** `search()` runs k=8
  fusion plus the expensive PPR multi-hop expansion, but
  `SCI_WIKI_MAX_CHARS=1500` (`scientists-backend/config.mjs:170`) lets only ~1
  chunk reach the model, and graph-expanded pages sort below organic hits and get
  truncated away — so the graph channel's headline capability is discarded before
  generation. → `RET2`.

## Phase 0 — Instrument & unblock (days, mostly dependency-free)

| id | item | effort | why it's first |
|----|------|--------|----------------|
| **GOLD1** ✅ **DONE** | **`golden.jsonl` 14 → 69 cases** with **qid-level** ground truth (`expect_qids`, validated against `pages`); `tags` slices for multi-hop/relational/graph + lexically-disjoint paraphrase. `retrievalMetrics` now honors `expect_qids`; `run-eval` reports per-`slices` hit/MRR. | S–M | The keystone — done. No LLM, no feedback traffic. Unblocks EVAL1-as-gate, EVAL3 CIs, KG1/RET5/RET6 validation, and the RET3 recall slice. |
| **EVAL1a** ✅ **DONE** | eval prints a **non-blocking** per-slice delta vs committed `eval/baseline.json` on every run (`eval/baseline.mjs`: save/load/compare; `npm run eval:baseline` to freeze; config-mismatch flagged; exit code untouched). | S | Trustworthy signal now; becomes a blocking gate (EVAL1b) by adding `process.exitCode = regressions.length ? 1 : 0` + an Ollama-up precondition, once EVAL3 sets the tolerance. |
| **EVAL2** ✅ **DONE** | `generate()` reports real `prompt_eval_count`/`eval_count` via an optional `onUsage` callback (string return unchanged); `eval-answer` + summed `eval-judge` traces and the `translate`/`generate` routes now populate token columns; `traceSummary` adds exact per-kind **p50/p95** (`msPercentile`), surfaced in kb-admin's 監測 cards. No schema change. | S | Monitoring token columns read ~0 today; tail latency hidden. No schema change. |
| **ORCH2** ✅ **DONE** | `estimateTokens` is now **script-aware** (CJK ideographs/kana/hangul at `cjkCharsPerToken≈1.6`, other text at `charsPerToken≈3.8`), fixing the TC under-count. `shouldSummarize` reads the previously-dead `session.lastPromptTokens` and **anchors** to it (`max(charEstimate, lastPromptTokens + lastAssistant + newUser)`), so the running estimate can never drift below the real measured prompt — resets to 0 on summary restart. | S | `session.lastPromptTokens` is written at `server.mjs:387` and **never read**; `estimateTokens = chars/2.8` under-counts Traditional Chinese (~1.5–1.8 chars/tok) → silent llama.cpp truncation risk on the zh model. Use last count as **base + estimate only the delta** (new turn + freshly-retrieved context); goal metric = *no prompt exceeds `num_ctx`*. |
| **ORCH5** ✅ **DONE** | Both followups handlers now build an `AbortController`, wire `req.on('close')`→abort and pass `signal` into `generateFollowups`, and **debounce** per session/discussion via a new `beginDebounced`/`endDebounced` registry (`active-requests.mjs`) so a superseded turn's suggestions stop grinding the GPU. Responses guard on `res.writableEnded`. | S | `generateFollowups` is called (`server.mjs:495,701`) with no signal and no active-request registration; up to 3 full generations keep the single GPU busy after the user has moved on. |
| **RET4** ✅ **dedup DONE** | Cross-lingual dedup by `qid` shipped in `buildContext` (with RET2). **MMR diversity pass still TODO** (near-duplicate different-`qid` chunks). | S | `maxPerPage` caps by `pageId`, but zh and en of one concept are distinct pages sharing a `qid` — both consumed the tiny budget with the same fact. |
| **EMBCACHE** ✅ **LRU DONE** | `embedQuery` now serves from an in-process LRU keyed by `model+text` (`WKB_EMBED_QUERY_CACHE`, default 512; `clearEmbedCache()` seam), removing redundant GPU embeds for repeated chat/eval queries in a long-lived server. **Cross-process golden-query persistence still TODO** (separate CLI eval runs don't share the in-memory cache). | S | `embed.mjs:embedQuery` has no cache; every chat turn and every eval run re-embeds identical queries against the scarce GPU. |
| **LOOP1** ✅ **DONE** | `scientists-backend/knowledge/triage-feedback.mjs` walks `status='new'` rows and labels deterministically (`positive` / `reasons` / `major`\|`minor` by `ned>0.6`), falling back to one fail-open local judge call (`inaccurate`/`incomplete`/`off-topic`/`style`/`other`) only for a bare downvote; sets `new→triaged`, defers un-judgeable rows (`--no-llm` or Ollama down) as still-`new`, idempotent. Prints the `rating=-1`-with-correction count (LOOP2 source pool). CLI: `--limit`/`--no-llm`/`--dry-run`. | S | Activates the dead `status`/`auto_label` columns and gives a reality check on feedback throughput before anything is gated on it. |
| **ORCH4** | Strip `<think>` blocks during streaming (not just in blocking `chat()`). | S (low impact) | Only bites if a reasoning model is pinned in `config.modelFallbacks`; cheap and correct. |

### Baseline after GOLD1 (retrieval-only, k=8, rrf, graph on)

Measured on the 69-case set — this is the reference every later item is scored against:

| slice | n | hitRate | MRR |
|---|---|---|---|
| overall | 69 | 0.942 | 0.688 |
| single-hop | 28 | 0.964 | 0.741 |
| multi-hop / relational / graph | 11 | 1.000 | 0.841 |
| **paraphrase** | 16 | **0.813** | **0.431** |
| lang:en | 37 | 0.973 | 0.690 |
| lang:zh | 32 | 0.906 | 0.686 |

The paraphrase slice (MRR 0.431 vs 0.741 single-hop) is the concrete, now-measurable
signal of the B1/RET3 semantic-recall gap; the graph slice (MRR 0.841) is the bar KG1
must clear. This is frozen as `eval/baseline.json` (EVAL1a); every run now prints a
non-blocking delta against it — a `--no-graph` A/B correctly reports the graph slice
regressing −0.08 MRR.

## Phase 1 — Fix the read path & close the loop (weeks)

| id | item | effort | deps |
|----|------|--------|------|
| **RET2** ✅ **DONE (core)** | `buildContext` now: budget **1500→3500** (scientists) / 2200→3000 (wiki-kb); cross-lingual **qid dedup**; **reserved graph slot** (`graphReserve=1`); returns `coverage` (delivered-vs-retrieved) logged to the `chat-rag` trace. Delivered chunks/qids roughly doubled on real queries (e.g. `什麼是伽瑪射線暴?` 3→6 qids). **small-to-big (parent-section delivery) deferred** — higher complexity, lower marginal value. **Finding:** graph *expansion* fires on **0/69** golden queries (boost fires on 69/69), so the reserved slot is currently a proven-correct no-op — the "expansion truncated away" half of B2 doesn't manifest on this query mix; see [graph-expansion note](#graph-expansion-is-inert-on-the-golden-set). | M | RET4 (folded in) |
| **RET1** ✅ **DONE** | History-aware **query rewrite** (`lib/query-rewrite.mjs`): high-precision pronoun/opener heuristic gate (11/11 on a discriminating set) → one deterministic local-Ollama rewrite only for dependent turns; fail-open; wired into **both** single-chat and discussion handlers before `retrieveContext`, gated by `SCI_WIKI_REWRITE` + `replyMode`; rewritten query surfaced in `meta.retrievalQuery`. Demo (en+zh): `"who first derived it?"`→`"Who first derived the Chandrasekhar limit?"` **MISS→hit@2**; `"它的密度有多高?"`→`"中子星的密度有多高?"` **MISS→hit@2**; `"why can't light escape from it?"` hit@4→**hit@1**. **TODO:** commit a multi-turn golden slice (+`history` field) so this is regression-tracked, not just demo'd. `seedQids` injection from extracted entities deferred. | M | — |
| **QROUTE** ✅ **DONE (observe-mode default)** | `lib/query-route.mjs` classifies every query into `graph-heavy` / `lookup` / `paraphrase` / `balanced` (pure string work — no DB, no LLM, no embed) and emits the graph-channel knobs. Three modes (`WKB_QROUTE`): `off` = pre-QROUTE behaviour byte-for-byte, **`observe` (default)** = report the route into eval slices + `search`/`context` traces but change nothing, `on` = apply the policy. Verified against the golden set: **11/11** relational/graph cases → `graph-heavy`, **15/16** paraphrase → `paraphrase`, **24/28** single-hop → `lookup` (`node lib/query-route.test.mjs`, 68 assertions). Policy defaults: skip the multi-hop **expansion** on `lookup`/`paraphrase` (it fires 0/69, so pure cost saving), **keep PPR everywhere** and all per-route `wGraph` scales at 1 — dropping the walk is a ranking change and the boost fires 69/69, so it waits on `--ab qroute` evidence. | S–M | — |
| **EVAL3** ✅ **DONE** | `eval/stats.mjs`: seeded-deterministic (mulberry32, never `Math.random`) percentile **bootstrap CIs** on every retrieval number, **paired** bootstrap delta + sign-flip **permutation test** (exact ≤18 non-zero diffs, Monte Carlo above) for A/B. `--ab <variant>` reruns the same dataset in the same order and pairs case-by-case — pairing matters because per-case difficulty is the dominant variance term here. Verdicts are an *equivalence* test, not just a null test: `improved`/`regressed` (CI excludes 0), `no-effect` (whole CI inside ±0.01 — a meaningful effect is **ruled out**), `need-more-cases` (undecided; prints the `casesNeeded` estimate). Variants: `no-graph`, `qroute`, `fusion=`, `rrf-k=`, `k=`. `node eval/stats.test.mjs`, 46 assertions. | M | GOLD1 |
| **EVAL1b** ✅ **DONE** | `run-eval.mjs --gate` (`npm run eval:gate`) sets the exit code: **0** clean, **1** regression, **2 undecidable**. Tolerance is no longer the hand-picked 0.005 — `gateTolerances()` takes **half each scope's own baseline CI width** (floored at `WKB_EVAL_GATE_MIN_TOL`), so an 11-case slice may wobble as much as 11 cases actually wobble while the 69-case overall number is held tight. Exit 2 (refuse to judge, rather than fail) on: **Ollama down** (`embedAvailable()` precondition — BM25-only makes every delta an artifact), run-config mismatch vs baseline, or no baseline. `saveBaseline` now persists the `ci` block; a pre-EVAL3 baseline still gates on the flat 0.005 and says so. | S | GOLD1, EVAL3 |
| **KG1** | **Relation-typed edge weights + hub damping** in `graph-rank.mjs`. PPR is undirected/unweighted (`buildIndex`, `graph-rank.mjs:42`): a `P31→'infrared source'` edge (10,379 in-edges) counts like a `P184` advisor edge; 46% of edges terminate on class stubs. Down-weight `P31/P279`-into-stubs, up-weight advisor/influence/part-of/discoverer. `WKB_GRAPH_EDGE_WEIGHTS` override, no schema change. | M | GOLD1+EVAL3 for **acceptance** (metric = MRR delta CI excludes zero) |
| **KG2** | Materialize `entities.entity_type` from dominant `P31/P279` (black-hole/star/galaxy/telescope/mission/observatory/award/concept…). Typing is binary today (person vs topic); the 'other' bucket holds 30.7% of topics. Enables typed retrieval/filter + PPR seeding. | M | — |
| **KG3** | Ingest Wikidata **aliases** (`entity_aliases`) into the linking label map. `linkQueryEntities` is exact en/zh label match, so "JWST", "Sgr A*", "M87*", "CMB" never seed PPR. | M | — |
| **PERS1** | **Ground personas in their own vetted bios.** `personaHeader`/`buildSystemPrompt` (`scientists.mjs:1239,1249`) inject only name/years/persona/style — the curated `details.{life,expertise,achievements}` are never used, so the model hallucinates its own dates/discoveries. **Hard prerequisite:** per-field verified-facts review (fix known Herschel/Cannon errors first) — injecting unvetted bios launders errors into the model's mouth. | M | — |
| **PERS2** | Few-shot **exemplar store** (`feedback_exemplars`) + an `exemplars` seam in `buildSystemPrompt`/`buildPanelPrompt`; seed from up-votes and downvote corrections; count tokens toward the summarize line. | M | LOOP1 |
| **ORCH3** | **Tiered memory + off-critical-path summarization**: keep last N turns verbatim, summarize only the older prefix, and run the summary **after** the crossing turn streams (not synchronously before it). | M | ORCH2 |
| **EVAL4** | kb-admin **Feedback tab** (up/down rate, avg ned, by-scientist, approve-for-export) + eval-over-time sparkline. Read shared `kb.sqlite` directly or proxy through the merged `:5188` host; keep `client_id` excluded. | M | LOOP1 |
| **LOOP2** | *(Re-scoped)* Feedback corrections → **exemplar/finetune sourcing**, NOT the primary eval-growth path. Mandatory human-approve; dedup by `origin_cid`. Gate on **measured** correction volume from LOOP1. | M | LOOP1 |

### Graph-expansion is inert on the golden set

RET2's coverage instrumentation surfaced this: across all **69** golden queries,
the graph channel's multiplicative **boost** fires on **69/69**, but its multi-hop
**expansion** (`graphChannel().expand`, the rows tagged `graphExpanded`) fires on
**0/69**. On canonical, well-covered topics the top-PPR neighbors are already in
the lexical/vector candidate set, so `excludePageIds` leaves nothing to pull in.
Implication: the "anchored graph expansion" capability adds nothing measurable on
this query distribution — its value only appears for queries whose answer is a
multi-hop neighbor **not** directly retrievable. Two follow-ups: (a) add a small
2-hop golden slice that actually exercises expansion, and (b) fold this into KG1's
scope (is the expansion path mistuned, or genuinely unnecessary given the boost?).
The reserved-slot delivery is proven correct (unit-tested) for when expansion does
fire; it is simply dormant today.

**QROUTE acts on the cost half of this** (follow-up (b)): since the expansion probe
demonstrably contributes nothing on `lookup`/`paraphrase` queries, those routes skip
it by default once the router is `on`, saving the per-page SQL without touching the
boost. The *ranking* half — is the expansion path mistuned, or genuinely unnecessary
given the boost? — still belongs to KG1, and follow-up (a) (a 2-hop golden slice that
actually exercises expansion) is still open.

## Phase 2 — Structural depth (once eval is trustworthy)

| id | item | effort | deps |
|----|------|--------|------|
| **RET3** | **IVF coarse-quantization vector index in `node:sqlite`** — fixes B1. Offline k-means the 453k bge-m3 vectors into ~1.5–4k centroids, store `centroid_id`; at query time scan nearest partitions and **UNION with BM25** (IVF only adds, never removes). Periodic re-cluster. Budget ~1.8 GB resident for the k-means. `sqlite-vec` documented as fallback. | L | GOLD1 paraphrase slice, EVAL1 |
| **RET5** | *(Mechanism fixed)* Optional **cross-encoder rerank** of the top ~15–20. **Not via Ollama** (no rerank API) — use a `llama.cpp --reranking` sidecar for GGUF `bge-reranker-v2-m3` (busy-gate aware), **or** a no-new-model MMR bi-encoder re-scoring pass. Flag-gated, cache by (query,chunk), A/B in `run-eval`. | M | RET2 |
| **KGCOMM** | **KG community detection** (offline Leiden/label-propagation over `edges`) + optional per-community local-Ollama summaries → **GraphRAG-style global/overview answers** ("overview of black-hole research history"), gated behind QROUTE. The single largest missing capability class; fully offline. | M–L | KG1 |
| **RET6** | Eval-driven weight sweep (`wBm25/wVec/wGraph/rrfK/decay/pprAlpha`) on a **held-out** hand-authored set the sweep never sees. | M | GOLD1, EVAL3 |
| **RET7** | Mine `feedback.sources[].qid` from labeled downvotes into a hard-negative set: eval hard-negative harness + optional small retrieval penalty for repeatedly-implicated (question-cluster, qid). | L | LOOP2 |
| **KG4** | KG **re-sync + edge reconciliation** cadence. `syncEntities` freezes non-stub entities forever (`WHERE qid IS NULL OR kind='stub'`) and never deletes retracted edges. Age-based TTL re-fetch, scoped so manual/list/llm edges are never reconciled away. | M | — |
| **KG5** | Wikilink edge layer to rescue the **3,578 isolated non-stub entities** (`fetchPageLinks` already exists). Weight **strictly below** KG1's lowest relation weight; validate that isolated-recall rises without MRR falling. | L | KG1 |
| **NLIGATE** | Lightweight local **NLI/entailment groundedness gate** (small NLI model or one cheap entailment prompt) on every RAG reply — cheaper than a full RAGAS regen, so groundedness is default not luxury. | M | — |
| **PERSANA** | Explicit **persona anti-anachronism policy** ("answer in-character, may reference modern knowledge as a teacher, flagged as beyond-my-era") + eval probes (period vs modern topics). | S–M | PERS1 |
| **PERS4** | In-voice closing-line provenance (map to `meta.sources`) + opt-in post-hoc faithfulness flag. | M | RET2 |
| **EVAL5** | Judge reliability: hand-label ~30–40 verdicts (`judge-agreement.jsonl`), report judge-vs-human agreement/kappa; optional dual-judge for high-disagreement cases. | M | — |
| **KG7** | *(Descoped to backend-only)* Materialize temporal claims (`P571/P575`) on edges for era ordering. **No library UI** until core metrics are trustworthy. | M | KG2 |
| **LOOP3** | *(Deferred spike)* Correction-derived per-language LoRA — only if corrections exceed several hundred **and** PERS2 exemplars demonstrably plateau. | L | LOOP1, LOOP2 |

## Cross-cutting risks & guardrails

- **Feedback labels are self-reinforcing** (they reflect what the current
  retriever already surfaced) and user corrections may be wrong/unsourced → keep a
  mandatory human-approve step, hold out a hand-authored test set the sweep never
  sees, dedup by `origin_cid`.
- **Single-GPU (3060) contention is the hidden tax** on nearly every LLM-touching
  item (RET1 rewrite, RET5 rerank, EVAL5 dual-judge, ORCH3 off-path summary). Land
  a busy-gate-aware serialization first; keep all of them flag-gated. Reframe the
  old "single-flight queue" idea as **UX** (queue-position SSE + coalesce identical
  in-flight) — Ollama already serializes and manages KV-cache via
  `OLLAMA_NUM_PARALLEL`; don't reimplement its scheduler.
- **Statistical power:** at n=14 no A/B is decidable; GOLD1 to ~70+ is the
  precondition for KG1/RET5/RET6 verdicts to mean anything.
- **Prompt growth vs the summarize line:** PERS1 bios, PERS2 exemplars, RET2's
  wider budget all push toward the 70% crossing on a local 8B — count every
  injected block toward `shouldSummarize` and watch faithfulness so "more context"
  never lowers answer quality.
- **Shared `kb.sqlite` across two hosts:** keep new columns ASCII, prefer add-only
  migrations, read the shared table directly rather than adding a cross-origin
  dependency.

## Suggested order of attack

1. **GOLD1** — nothing else is trustworthy without it.
2. **B1/B2 fixes** (RET2 now, RET3 in Phase 2) — you're already paying for the
   compute both bugs discard.
3. **LOOP1 + EVAL1a/EVAL2/ORCH2/ORCH5/RET4/EMBCACHE** — cheap, parallel, no deps.
4. ✅ **Close the loop** (EVAL3 → EVAL1b) and **fix the anaphora/throttle pair**
   (RET1 + RET2 + QROUTE) — all shipped. Every knob is now falsifiable: a change
   is scored by a paired CI, and a regression beyond the golden set's own noise
   fails the process. **Next action is a measurement, not code:** re-freeze the
   baseline (for CI-derived tolerances) and run `--ab qroute`.
5. **Deepen KG** (KG1/KG2/KG3) and **personas** (PERS1 + PERSANA) against CIs.
6. **Structural** (RET3 IVF, KGCOMM global search, RET6 sweep) last.

## Carried-over TODOs (loose ends from the items already implemented)

Consolidated so they aren't buried in the ✅ rows above. Each is a small,
well-scoped follow-up to something that shipped this pass.

- [ ] **Re-freeze `baseline.json` with its CI block.** `saveBaseline` now writes
  bootstrap CIs, but the committed baseline predates EVAL3, so `--gate` currently
  falls back to the flat 0.005 tolerance (and says so). One `npm run eval:baseline`
  against the real corpus with bge-m3 up replaces every tolerance with the golden
  set's measured sampling noise. **Needs the real `kb.sqlite` + Ollama** — it
  cannot be produced from source.
- [ ] **Decide QROUTE's mode with `--ab qroute`.** The router ships in `observe`
  mode: it labels queries and populates `route:*` eval slices and traces, but
  changes no retrieval behaviour. Run `npm run eval:ab -- qroute` on the real
  corpus and flip `WKB_QROUTE=on` only if every scope reads `improved` or
  `no-effect` — `need-more-cases` means the golden set is still too small to
  justify it. Same rule for the two knobs deliberately left at their identity
  values: `qrouteSkipPpr` (empty) and the per-route `wGraph` scales (all 1).
- [ ] **Wire `eval:gate` into pre-push.** `npm run check` stays DB-free and fast
  (syntax + unit tests), so the gate is a separate `npm run eval:gate` — it needs
  both the corpus and a reachable embedding model, which no CI runner has today.
- [ ] **RET4 — MMR diversity pass.** Cross-lingual `qid` dedup shipped in
  `buildContext`; the maximal-marginal-relevance pass over near-duplicate
  *different-`qid`* chunks is still TODO.
- [ ] **RET2 — small-to-big delivery.** Budget-widen + reserved graph slot shipped;
  the "rank on chunks, deliver the parent section / merged neighbor window" part is
  deferred (higher complexity, lower marginal value).
- [ ] **RET1 — regression-track it.** Commit a **multi-turn golden slice** (add a
  `history` field to golden cases + a runner path that retrieves on the rewritten
  query) so the anaphora fix is measured, not just demo'd. Optional: inject
  rewrite-extracted entity labels into the graph channel's `seedQids`.
- [ ] **Graph-expansion coverage.** `graphExpanded` rows fire on **0/69** golden
  queries; author a small **2-hop golden slice** whose answer is a multi-hop
  neighbor not directly retrievable, and fold "is the expansion path mistuned or
  genuinely unnecessary given the boost?" into **KG1**. (See
  [note](#graph-expansion-is-inert-on-the-golden-set).)
- [ ] **EMBCACHE — cross-process golden persistence.** The `embedQuery` LRU is
  per-process, so it helps the long-lived server and within one eval run but not
  across separate `run-eval.mjs` CLI invocations. Persist the fixed golden-query
  vectors to disk (keyed by `model+sha(text)`) so repeat retrieval-only runs skip
  the embed entirely.
- [ ] **Full LLM eval.** RET2 + RET1 change what the *model receives*, so their
  payoff shows only in the judged run (contextRecall / faithfulness), not the
  retrieval-only slices. Run `node eval/run-eval.mjs` (full) to set an
  answer-quality baseline once the judge/answer models are loaded.
