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
| **EVAL2** | Capture `tokensIn/tokensOut` in `run-eval.mjs`/`routes.mjs` traces; add p50/p95 to `traceSummary`. | S | Monitoring token columns read ~0 today; tail latency hidden. No schema change. |
| **ORCH2** | Drive `shouldSummarize` from **real `prompt_eval_count`** + per-language `charsPerToken`. | S | `session.lastPromptTokens` is written at `server.mjs:387` and **never read**; `estimateTokens = chars/2.8` under-counts Traditional Chinese (~1.5–1.8 chars/tok) → silent llama.cpp truncation risk on the zh model. Use last count as **base + estimate only the delta** (new turn + freshly-retrieved context); goal metric = *no prompt exceeds `num_ctx`*. |
| **ORCH5** | Register an `AbortController` + debounce for `/api/followups`. | S | `generateFollowups` is called (`server.mjs:495,701`) with no signal and no active-request registration; up to 3 full generations keep the single GPU busy after the user has moved on. |
| **RET4** ✅ **dedup DONE** | Cross-lingual dedup by `qid` shipped in `buildContext` (with RET2). **MMR diversity pass still TODO** (near-duplicate different-`qid` chunks). | S | `maxPerPage` caps by `pageId`, but zh and en of one concept are distinct pages sharing a `qid` — both consumed the tiny budget with the same fact. |
| **EMBCACHE** | LRU cache for `embedQuery`; persist embeddings for the fixed golden queries. | S | `embed.mjs:embedQuery` has no cache; every chat turn and every eval run re-embeds identical queries against the scarce GPU. |
| **LOOP1** | Triage + auto-label worker (`knowledge/triage-feedback.mjs`): `status new→triaged`, deterministic-first labeling (reasons → use; downvote+correction → `ned>0.6` major vs minor; bare downvote → one local judge call). **Also print the current count of `rating=-1`-with-correction rows.** | S | Activates the dead `status`/`auto_label` columns and gives a reality check on feedback throughput before anything is gated on it. |
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
| **QROUTE** | **Query router**: classify graph-heavy / vector-only / skip-PPR per query so simple lookups don't pay PPR cost or eat graph noise. | S–M | — |
| **EVAL3** | Bootstrap CIs over per-case metric arrays + paired A/B significance (graph on/off, rrf/weighted); label borderline sweeps "need more cases". | M | GOLD1 |
| **EVAL1b** | Promote EVAL1a to a **blocking** pre-push/CI gate; tolerance from CI width, qid-level hit. | S | GOLD1, EVAL3 |
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
4. **Close the loop** (EVAL3 → EVAL1b) and **fix the anaphora/throttle pair**
   (RET1 + RET2 + QROUTE).
5. **Deepen KG** (KG1/KG2/KG3) and **personas** (PERS1 + PERSANA) against CIs.
6. **Structural** (RET3 IVF, KGCOMM global search, RET6 sweep) last.

## Carried-over TODOs (loose ends from the items already implemented)

Consolidated so they aren't buried in the ✅ rows above. Each is a small,
well-scoped follow-up to something that shipped this pass.

- [ ] **EVAL1b — promote the gate.** EVAL1a prints a non-blocking delta; make it
  blocking with `process.exitCode = compareToBaseline(...).regressions.length ? 1 : 0`
  plus an **Ollama-up precondition** (retrieval metrics are only reproducible while
  bge-m3 is reachable), and wire into `wiki-kb` `check` / pre-push. Set the tolerance
  from EVAL3's bootstrap-CI width, not the current hand-picked 0.005.
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
- [ ] **Full LLM eval.** RET2 + RET1 change what the *model receives*, so their
  payoff shows only in the judged run (contextRecall / faithfulness), not the
  retrieval-only slices. Run `node eval/run-eval.mjs` (full) to set an
  answer-quality baseline once the judge/answer models are loaded.
