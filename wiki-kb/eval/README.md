# RAG Evaluation Pipeline

RAGAS-shaped metrics, entirely local (judge = the local Ollama chat model). No
Python / RAGAS / DeepEval dependency — metric definitions match RAGAS, so
`golden.jsonl` transfers directly if the real RAGAS is ever adopted.

## Run

```powershell
node eval/run-eval.mjs                    # full: retrieval + LLM judging (minutes of GPU)
node eval/run-eval.mjs --retrieval-only   # retrieval metrics only, no LLM, seconds
node eval/run-eval.mjs --no-graph         # A/B: graph channel disabled
node eval/run-eval.mjs --limit 3 --k 8
node eval/run-eval.mjs --judge llama3 --answer phi4

npm run eval:baseline                     # freeze the current retrieval baseline
npm run eval:ab -- no-graph               # paired A/B + significance
npm run eval:gate                         # blocking regression gate
```

Without `--gate` the exit code is always 0 — baseline comparison is a report.

Results land in `eval_runs` / `eval_cases` (`kb.sqlite`) and are browsable
per-case in kb-admin's RAG evaluation tab; every LLM call also shows up in the
monitoring tab.

## Paired A/B and confidence intervals

The golden set is 69 cases. At that size "MRR 0.688 -> 0.694" carries no
information — the current `rrfK=10` was originally chosen on 0.780 vs 0.786,
entirely inside sampling noise. `eval/stats.mjs` makes a knob change
*decidable* rather than eyeballed:

- Every run prints **bootstrap 95% CIs** next to hitRate/MRR, overall and per
  slice. An 11-case slice and the 69-case overall both produce a number; only
  the interval says which one supports a conclusion.
- `--ab <variant>` re-runs the **same dataset in the same order** and compares
  case by case. Pairing matters: per-case difficulty dominates the variance
  here (paraphrase cases are hard under every setting), and pairing cancels it.
- Randomness is seeded (mulberry32) — never `Math.random` — so verdicts
  reproduce.

Verdicts (`negligible` defaults to 0.01, about one rank step):

| Label | Meaning |
|---|---|
| `improved` / `regressed` | The delta's CI **excludes 0** — the effect is real |
| `no-effect` | The whole CI sits inside ±negligible — a meaningful change is **ruled out** |
| `need-more-cases` | CI contains 0 but exceeds ±negligible — undecided; prints how many cases would settle it |

The third label is the point: a marginal sweep would otherwise be read as "no
change" when it is really "unmeasurable at n=69".

Variants: `no-graph`, `qroute`, `fusion=weighted`, `rrf-k=60`, `k=12`. `--ab`
requires `--retrieval-only` (a paired judged run doubles LLM cost).

## Regression gate

`node eval/run-eval.mjs --retrieval-only --gate` sets the exit code:

| Code | Meaning |
|---|---|
| 0 | No regression beyond tolerance |
| 1 | Regression — the only "failure" |
| 2 | **Undecidable**, refusing to judge |

Tolerance is not a hand-picked constant: each scope gets **half its own
bootstrap CI width** from `baseline.json` (floored at `WKB_EVAL_GATE_MIN_TOL`),
so an 11-case slice may wobble as much as 11 cases actually wobble while the
69-case overall number is held tight.

Exit 2 fires when the run cannot be a fair comparison at all: **Ollama
unreachable** (the vector channel silently degrades to BM25-only, making every
delta an artifact — the gate pings `/api/tags` first), **run config differs from
the baseline** (fusion/rrfK/graph/k/cases), or **no baseline exists**. A gate
that judges wrongly is worse than no gate.

> A baseline frozen before CIs existed falls back to a flat 0.005 tolerance and
> says so. Re-freezing it against the real corpus is an open TODO in
> `../../OPTIMIZATION-PLAN.md`.

## Metrics

| Metric | Definition | Cost |
|---|---|---|
| hit rate | Any retrieved page matches the case's ground truth | No LLM |
| MRR | Reciprocal rank of the first hit | No LLM |
| Context Precision | Fraction of chunks the judge calls useful | 1 judge call |
| Context Recall | Fraction of ground-truth sentences attributable to the context | 1 judge call |
| Faithfulness | Fraction of answer claims supported by the context | 2 judge calls |
| Hallucination | 1 − Faithfulness | — |

Unparseable judge lines count as "no" — a lazy judge can only lower a score,
never inflate it.

Retrieval metrics are additionally grouped by `slices` (golden `tags` +
language + QROUTE `route:*`), so paraphrase / multi-hop subsets read separately
from the single-hop baseline. That split is what makes the semantic-recall gap
(RET3) and the graph channel (KG1) measurable at all.

## Golden set (`golden.jsonl`)

One case per line: `{id, lang, question, ground_truth, expect, expect_qids?, tags?}`.

- **`expect_qids` (authoritative)** — qid-level ground truth. zh and en pages of
  one concept share a qid, so this is language-independent and unambiguous;
  when present, hit/MRR match on qids.
- `expect` (legacy fallback) — title substring list (zh + en). Used only when
  `expect_qids` is absent, so the original seed cases still work.
- `tags` (optional) — evaluation slices: `single-hop`, `multi-hop`,
  `relational`, `graph`, `paraphrase`. Paraphrase cases deliberately avoid the
  target page's wording, exposing the BM25-only / rerank-only recall gap.

Currently 69 cases (37 en / 32 zh): 14 original hand-written seeds + 55
corpus-verified additions, every `expect_qids` validated against `pages`. New
cases follow the same shape — ASCII `id` and field names, and `expect_qids`
must resolve to `status='active'` pages in the corpus.
