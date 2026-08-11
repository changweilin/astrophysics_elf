# Knowledge Graph + Scientist LLM — Optimization Plan

Scope: `wiki-kb/` (Wikipedia KG + hybrid RAG) and `scientists-backend/` (Ollama
persona LLM + feedback). Additive, local-first, `node:sqlite` only, local Ollama
only, ASCII identifiers, add-only migrations.

## North star

The stack is architecturally sound (Wikidata-QID entity resolution,
weighted-RRF + HippoRAG PPR fusion, RAGAS-shaped eval, Langfuse-style tracing,
capture-complete feedback schema). The rule that governs every item here:
**nothing gets tuned before it can be measured**, and the way to make it
measurable is to hand-author golden cases, not to wait on feedback volume a
low-traffic local demo will never produce.

That spine is now in place — the eval is trustworthy, every knob is falsifiable
via paired CIs, and the read-path throughput bug is fixed. What remains is one
real recall bug (B1/RET3), KG depth, and persona grounding.

## Baseline (retrieval-only, k=8, weighted RRF, graph on, 69 golden cases)

Frozen as `eval/baseline.json`; every later change is scored against it.

| slice | n | hitRate | MRR |
|---|---|---|---|
| overall | 69 | 0.942 | 0.688 |
| single-hop | 28 | 0.964 | 0.741 |
| multi-hop / relational / graph | 11 | 1.000 | 0.841 |
| **paraphrase** | 16 | **0.813** | **0.431** |
| lang:en | 37 | 0.973 | 0.690 |
| lang:zh | 32 | 0.906 | 0.686 |

The paraphrase slice is the measurable face of the B1 semantic-recall gap; the
graph slice (0.841) is the bar KG1 must clear.

## Two durable findings

- **B1 — the vector channel gives ZERO independent recall (still open, = RET3).**
  `retrieve.mjs` takes the full-scan branch only when `embedded <=
  scanMaxChunks` (60000); the corpus has **453,434 embedded chunks**, so it is
  permanently in the else branch where cosine is scored **only over BM25's
  top-400**. A query whose tokens do not FTS-match returns nothing despite a
  good embedding sitting in the row. ~1.8 GB of vectors serve only as a
  re-ranker.
- **Graph *expansion* is inert on this query mix.** Across all 69 golden
  queries the graph channel's multiplicative **boost** fires 69/69 but the
  multi-hop **expansion** (`graphChannel().expand`, rows tagged
  `graphExpanded`) fires **0/69** — on canonical topics the top-PPR neighbours
  are already in the lexical/vector candidate set, so `excludePageIds` leaves
  nothing to pull in. The reserved delivery slot is unit-tested-correct but
  dormant. QROUTE acts on the cost half (skip the probe on `lookup`/
  `paraphrase`); the ranking half — mistuned or genuinely unnecessary? — is
  folded into KG1, and a 2-hop golden slice that actually exercises expansion
  is still unwritten.

## Shipped — do not redo

One line each; the code and its tests are the detail.

- **GOLD1** — `golden.jsonl` 14 -> 69 cases with **qid-level** ground truth
  (`expect_qids`, validated against `pages`) + `tags` slices; metrics and
  per-slice reporting honour it.
- **EVAL3** — `eval/stats.mjs`: seeded (mulberry32, never `Math.random`)
  bootstrap CIs, paired bootstrap delta + sign-flip permutation test for A/B.
  Verdicts are an equivalence test: `improved`/`regressed`/`no-effect`/
  `need-more-cases` (with a `casesNeeded` estimate).
- **EVAL1a/b** — every run prints a per-slice delta vs `baseline.json`;
  `--gate` (`npm run eval:gate`) sets exit 0/1/**2 = refuse to judge** (Ollama
  down, run-config mismatch, or no baseline). Tolerances are half each scope's
  own baseline CI width, not a hand-picked constant.
- **EVAL2** — real `prompt_eval_count`/`eval_count` via an `onUsage` callback;
  exact p50/p95 per trace kind, surfaced in kb-admin.
- **RET2** — context budget 1500->3500 (scientists) / 2200->3000 (wiki-kb),
  cross-lingual **qid dedup**, reserved graph slot, `coverage` logged to the
  `chat-rag` trace. Delivered qids roughly doubled on real queries.
- **RET1** — history-aware **query rewrite**
  (`scientists-backend/lib/query-rewrite.mjs`): a
  high-precision pronoun/opener gate, then one deterministic local rewrite for
  dependent turns only; fail-open; wired into chat + discussion; surfaced as
  `meta.retrievalQuery`. Turns anaphoric MISSes into hit@1-2.
- **QROUTE** — `lib/query-route.mjs` classifies every query
  (`graph-heavy`/`lookup`/`paraphrase`/`balanced`) with pure string work.
  **Default `observe`**: labels traces and eval slices, changes nothing.
- **ORCH2** — script-aware `estimateTokens` (CJK ~1.6 chars/token vs ~3.8) and
  `shouldSummarize` anchored to the real measured `lastPromptTokens`, so the
  running estimate can never drift below the truth.
- **ORCH5** — followups now abort on client disconnect and debounce per
  session/discussion, so a superseded turn stops grinding the single GPU.
- **LOOP1** — `knowledge/triage-feedback.mjs` activates the dead
  `status`/`auto_label` columns: deterministic labels, one fail-open judge call
  only for a bare downvote, idempotent, `new -> triaged`.
- **RET4 (dedup half)** / **EMBCACHE (in-process half)** — see open TODOs for
  what is still missing.

## Open roadmap

| id | item | effort | deps |
|----|------|--------|------|
| **RET3** | **IVF coarse-quantization vector index in `node:sqlite`** — fixes B1. Offline k-means the 453k bge-m3 vectors into ~1.5-4k centroids, store `centroid_id`; at query time scan the nearest partitions and **UNION with BM25** (IVF only adds, never removes). Periodic re-cluster; ~1.8 GB resident for the k-means. `sqlite-vec` documented as fallback. | L | paraphrase slice |
| **KG1** | **Relation-typed edge weights + hub damping** in `graph-rank.mjs`. PPR is undirected/unweighted, so a `P31 -> 'infrared source'` edge (10,379 in-edges) counts like a `P184` advisor edge and 46% of edges terminate on class stubs. Down-weight `P31/P279`-into-stubs, up-weight advisor/influence/part-of/discoverer. `WKB_GRAPH_EDGE_WEIGHTS`, no schema change. Acceptance = MRR delta CI excludes zero. | M | EVAL3 |
| **KG2** | Materialize `entities.entity_type` from dominant `P31/P279`. Typing is binary today (person vs topic) and the 'other' bucket holds 30.7% of topics. Enables typed filtering + PPR seeding. | M | — |
| **KG3** | Ingest Wikidata **aliases** into the linking label map. `linkQueryEntities` is exact en/zh label match, so "JWST", "Sgr A*", "M87*", "CMB" never seed PPR. | M | — |
| **RET5** | Optional **cross-encoder rerank** of the top ~15-20. **Not via Ollama** (no rerank API): a `llama.cpp --reranking` sidecar for GGUF `bge-reranker-v2-m3`, or a no-new-model MMR bi-encoder pass. Flag-gated, cached by (query, chunk), A/B in `run-eval`. | M | RET2 |
| **RET6** | Eval-driven weight sweep (`wBm25/wVec/wGraph/rrfK/decay/pprAlpha`) on a **held-out** hand-authored set the sweep never sees. | M | EVAL3 |
| **RET7** | Mine `feedback.sources[].qid` from labeled downvotes into a hard-negative harness + optional penalty for repeatedly-implicated (question-cluster, qid). | L | LOOP2 |
| **KGCOMM** | Offline **community detection** (Leiden/label-propagation over `edges`) + optional per-community local summaries -> GraphRAG-style global/overview answers, gated behind QROUTE. Largest missing capability class; fully offline. | M-L | KG1 |
| **KG4** | KG **re-sync + edge reconciliation** cadence. `syncEntities` freezes non-stub entities forever and never deletes retracted edges. Age-based TTL re-fetch, scoped so manual/list/llm edges survive. | M | — |
| **KG5** | Wikilink edge layer to rescue the **3,578 isolated non-stub entities** (`fetchPageLinks` exists). Weight strictly below KG1's lowest relation weight; validate isolated-recall rises without MRR falling. | L | KG1 |
| **KG7** | Materialize temporal claims (`P571/P575`) on edges for era ordering. Backend only — no library UI until core metrics are trustworthy. | M | KG2 |
| **PERS1** | **Ground personas in their own vetted bios.** `personaHeader`/`buildSystemPrompt` inject only name/years/persona/style; the curated `details.{life,expertise,achievements}` are never used, so the model invents its own dates. **Hard prerequisite:** per-field fact review (fix the known Herschel/Cannon errors first) — injecting unvetted bios launders errors into the model's mouth. | M | — |
| **PERSANA** | Explicit anti-anachronism policy ("answer in character; modern knowledge allowed as a teacher, flagged as beyond-my-era") + eval probes. | S-M | PERS1 |
| **PERS2** | Few-shot **exemplar store** (`feedback_exemplars`) + an `exemplars` seam in the prompt builders; seed from upvotes and downvote corrections; count tokens toward the summarize line. | M | LOOP1 |
| **PERS4** | In-voice closing-line provenance mapped to `meta.sources` + opt-in post-hoc faithfulness flag. | M | RET2 |
| **ORCH3** | **Tiered memory**: keep the last N turns verbatim, summarize only the older prefix, and run the summary **after** the crossing turn streams. | M | ORCH2 |
| **ORCH4** | Strip `<think>` blocks during streaming, not just in blocking `chat()`. Only bites if a reasoning model is pinned. | S | — |
| **EVAL4** | kb-admin **Feedback tab** (up/down rate, avg ned, by-scientist, approve-for-export) + eval-over-time sparkline. Read shared `kb.sqlite` directly; keep `client_id` excluded. | M | LOOP1 |
| **EVAL5** | Judge reliability: hand-label ~30-40 verdicts (`judge-agreement.jsonl`), report agreement/kappa, optional dual-judge on disagreement. | M | — |
| **NLIGATE** | Lightweight local NLI/entailment groundedness gate on every RAG reply — cheaper than a full RAGAS regen, so groundedness is default not luxury. | M | — |
| **LOOP2** | Feedback corrections -> **exemplar/finetune sourcing**, not the primary eval-growth path. Mandatory human approve; dedup by `origin_cid`. Gate on measured correction volume. | M | LOOP1 |
| **LOOP3** | *(Deferred spike)* Correction-derived per-language LoRA — only if corrections exceed several hundred **and** PERS2 exemplars demonstrably plateau. | L | LOOP2 |

## Open TODOs (loose ends on things already shipped)

- [ ] **Re-freeze `baseline.json` with its CI block.** The committed baseline
  predates EVAL3, so `--gate` still falls back to the flat 0.005 tolerance (and
  says so). One `npm run eval:baseline` against the real corpus with bge-m3 up
  replaces every tolerance with measured sampling noise. Needs the real
  `kb.sqlite` + Ollama — it cannot be produced from source.
- [ ] **Decide QROUTE's mode with `npm run eval:ab -- qroute`.** Flip
  `WKB_QROUTE=on` only if every scope reads `improved` or `no-effect`;
  `need-more-cases` means the golden set is still too small to justify it. Same
  rule for the two knobs left at identity values: `qrouteSkipPpr` (empty) and
  the per-route `wGraph` scales (all 1).
- [ ] **A 2-hop golden slice that actually exercises graph expansion** (see the
  inert-expansion finding above).
- [ ] **A multi-turn golden slice** (`history` field + a runner path that
  retrieves on the rewritten query) so RET1's anaphora fix is regression-tracked
  rather than demo'd. Optional: inject rewrite-extracted entities into
  `seedQids`.
- [ ] **RET4 — MMR diversity pass** over near-duplicate *different-qid* chunks
  (cross-lingual qid dedup already shipped).
- [ ] **RET2 — small-to-big delivery** (rank on chunks, deliver the parent
  section / merged neighbour window). Deferred: higher complexity, lower
  marginal value.
- [ ] **EMBCACHE — cross-process persistence.** The `embedQuery` LRU is
  per-process; persist the fixed golden-query vectors to disk (keyed by
  `model+sha(text)`) so repeat CLI eval runs skip the embed entirely.
- [ ] **Full LLM eval baseline.** RET1/RET2 change what the *model receives*, so
  their payoff shows only in the judged run (contextRecall / faithfulness). Run
  `node eval/run-eval.mjs` (full) once the judge/answer models are loaded.
- [ ] **Wire `eval:gate` into pre-push.** It needs both the corpus and a
  reachable embedding model, which no CI runner has — so it stays a separate
  local command, never part of `npm run check`.

## Cross-cutting risks

- **Feedback labels are self-reinforcing** (they reflect what the current
  retriever already surfaced) and user corrections may be wrong -> mandatory
  human-approve, a held-out hand-authored set the sweep never sees, dedup by
  `origin_cid`.
- **Single-GPU (3060) contention is the hidden tax** on every LLM-touching item
  (RET1 rewrite, RET5 rerank, EVAL5 dual-judge, ORCH3 off-path summary). Keep
  them all flag-gated and busy-gate aware. Treat queueing as **UX**
  (queue-position SSE, coalesce identical in-flight requests) — Ollama already
  serializes and manages KV cache via `OLLAMA_NUM_PARALLEL`; do not reimplement
  its scheduler.
- **Statistical power.** At n=69 a marginal sweep is often `need-more-cases`,
  not "no change". Grow the golden set before believing a small delta.
- **Prompt growth vs the summarize line.** PERS1 bios, PERS2 exemplars, and
  RET2's wider budget all push toward the 70% crossing on a local 8B — count
  every injected block toward `shouldSummarize` and watch faithfulness so "more
  context" never lowers answer quality.
- **Shared `kb.sqlite` across two hosts.** ASCII columns, add-only migrations,
  read the shared table directly rather than adding a cross-origin dependency.

## Order of attack

1. **Measurements, not code:** re-freeze the baseline with CIs, then
   `--ab qroute`.
2. **RET3 (IVF)** — the one remaining bug that wastes compute already spent.
3. **Deepen the KG** (KG1 -> KG2/KG3) and **personas** (PERS1 + PERSANA),
   each accepted only on a CI that excludes zero.
4. **Structural** (KGCOMM global search, RET5 rerank, RET6 sweep) last.
