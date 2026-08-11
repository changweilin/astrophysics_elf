# ADR: graph-augmented RAG — GraphRAG vs LightRAG vs HippoRAG

Date: 2026-07-08 · Status: **decided and implemented** (`lib/graph-rank.mjs` +
the graph channel in `lib/retrieve.mjs`). Cited from those files — keep the
path stable. Operational detail lives in `../README.md`; this file only records
*why*.

## Constraints that decided it

- Corpus: 110k+ Wikipedia pages, hundreds of thousands of chunks.
- **The knowledge graph already exists**: Wikidata-synced `entities` (110k+)
  and typed `edges` — human-curated, better than any LLM/OpenIE extraction.
- Compute: one local RTX 3060 + 8B-class Ollama models. **LLM throughput is the
  scarcest resource** (chat, translation, generation share one busy gate).
- Engineering: `node:sqlite`, no Python, no vector DB, no Docker.
- Query shape: single-fact / concept tutoring questions. Corpus-wide thematic
  summarization is rarely asked for.

| | GraphRAG (Microsoft) | LightRAG | HippoRAG |
|---|---|---|---|
| Indexing | LLM extracts entities+relations per chunk, Leiden communities, LLM community summaries | LLM extracts keywords/entities per chunk | Offline KG (originally OpenIE) + PPR at query time |
| Indexing LLM cost | >=1 call per chunk + summaries (**weeks on a local 8B**) | 1 call per chunk (also infeasible) | **0 — Wikidata already provides the graph** |
| Query cost | High (map-reduce over community summaries) | Medium (LLM keyword extraction) | Low (entity linking + PPR, pure compute) |
| Strength | Global "what is this corpus about" | Lightweight dual-level retrieval | Multi-hop factual association |
| Fit with what exists | Rebuild the whole index | Rebuild the graph | **Reuses `entities`/`edges` as-is** |

## Decision: HippoRAG-style graph augmentation

Decisive reason: the expensive offline-KG step is already done, at curation
quality. Only two query-time pieces were missing — entity linking (query n-grams
+ QIDs of the top hybrid hits as seeds) and bounded Personalized PageRank
(damping ~0.5, as in the paper) over an in-memory adjacency list.

Fusion is **multiplicative** (`score *= 1 + wGraph × g`, g = min-max normalized
PPR) so QID-less manual notes are unaffected, `WKB_W_GRAPH=0` disables it, and
any failure falls back to plain hybrid search. Multiplicative boosting and the
decay factor are both scale-invariant, so the later switch of the two text
channels to weighted RRF needed no re-tuning. The multi-hop **expansion** probe
borrows LightRAG's dual-level idea; its score is anchored to the k-th organic
result so RRF score compression cannot let expanded pages either never enter or
permanently dominate the top-k.

Validation: `eval/run-eval.mjs --no-graph` A/B on the same golden set.

## Kept in reserve (not adopted)

- **GraphRAG community summaries** — if corpus-wide overview questions ever
  appear, summarize `entities.category` subtrees offline in a nightly local-LLM
  batch. No need for the full framework. Tracked as KGCOMM in
  `../../OPTIMIZATION-PLAN.md`.
- **LightRAG query-keyword extraction** — if entity-linking recall proves
  insufficient, one cheap LLM call can extract query entities and feed
  `graph-rank.mjs`'s existing `seedQids` seam.
