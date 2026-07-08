// RAGAS-style metrics, implemented against the local judge (eval/judge.mjs).
//
//   Retrieval (no LLM):  hit rate, MRR over the golden `expect` title list.
//   Context Precision:   fraction of retrieved chunks the judge deems useful
//                        for answering the question (one judge call, batched).
//   Context Recall:      fraction of ground-truth statements attributable to
//                        the retrieved context (one judge call).
//   Faithfulness:        claims are extracted from the generated answer, then
//                        each is checked against the context (two calls).
//   Hallucination:       1 - Faithfulness (the RAGAS convention).
//
// Judge calls are kept to <=4 per case so a 14-case run stays tractable on
// the local 8B model; verdict parsing defaults unparseable lines to "no".

import { generate, parseYesNoLines, parseClaimLines } from './judge.mjs';

// ---- retrieval metrics (pure computation) -----------------------------------

export function retrievalMetrics(results, expect = []) {
  const titles = results.map((r) => String(r.title || ''));
  const lowered = expect.map((e) => String(e).toLowerCase());
  const isHit = (t) => lowered.some((e) => t.toLowerCase().includes(e));
  // rank over distinct pages, mirroring how a reader sees the source list
  const seen = new Set();
  let rank = 0;
  let firstHit = 0;
  for (const r of results) {
    if (seen.has(r.pageId)) continue;
    seen.add(r.pageId);
    rank++;
    if (!firstHit && isHit(String(r.title || ''))) firstHit = rank;
  }
  return {
    hit: firstHit > 0 ? 1 : 0,
    mrr: firstHit > 0 ? 1 / firstHit : 0,
    pagesRetrieved: seen.size,
    chunksRetrieved: titles.length,
  };
}

// ---- shared prompt scaffolding ----------------------------------------------

function numbered(items) {
  return items.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

function contextBlock(results, maxCharsPerChunk = 700) {
  return results.map((r, i) =>
    `[${i + 1}] (${r.lang} "${r.title}") ${String(r.text).slice(0, maxCharsPerChunk)}`
  ).join('\n\n');
}

// Ground truths in the golden set are 1-3 sentences; split on sentence
// boundaries in either script.
export function splitStatements(text) {
  return String(text)
    .split(/(?<=[.!?。!?])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

// ---- LLM-judged metrics -------------------------------------------------------

export async function contextPrecision(judgeModel, question, results) {
  if (!results.length) return { value: 0, verdicts: [] };
  const prompt = [
    'You are a strict retrieval evaluator. For EACH numbered context passage below, decide whether it contains information useful for answering the question.',
    'Answer with one line per passage, exactly in the form "N: yes" or "N: no". No other text.',
    '',
    `QUESTION: ${question}`,
    '',
    'PASSAGES:',
    contextBlock(results),
  ].join('\n');
  const raw = await generate(judgeModel, prompt, { numPredict: 200 });
  const verdicts = parseYesNoLines(raw, results.length);
  const useful = verdicts.filter(Boolean).length;
  return { value: useful / results.length, verdicts };
}

export async function contextRecall(judgeModel, groundTruth, results) {
  const statements = splitStatements(groundTruth);
  if (!statements.length || !results.length) return { value: 0, statements, verdicts: [] };
  const prompt = [
    'You are a strict evaluator. For EACH numbered statement below, decide whether it can be attributed to (i.e. is supported by) the given context passages.',
    'Answer with one line per statement, exactly in the form "N: yes" or "N: no". No other text.',
    '',
    'CONTEXT:',
    contextBlock(results),
    '',
    'STATEMENTS:',
    numbered(statements),
  ].join('\n');
  const raw = await generate(judgeModel, prompt, { numPredict: 200 });
  const verdicts = parseYesNoLines(raw, statements.length);
  const supported = verdicts.filter(Boolean).length;
  return { value: supported / statements.length, statements, verdicts };
}

export async function faithfulness(judgeModel, question, answer, results) {
  if (!answer || !results.length) return { value: 0, claims: [], verdicts: [] };
  const extractPrompt = [
    'Break the following answer into its individual factual claims. Output one short, self-contained claim per line, nothing else. At most 10 lines.',
    '',
    `QUESTION: ${question}`,
    `ANSWER: ${answer}`,
  ].join('\n');
  const claims = parseClaimLines(await generate(judgeModel, extractPrompt, { numPredict: 400 }));
  if (!claims.length) return { value: 0, claims, verdicts: [] };

  const verifyPrompt = [
    'You are a strict evaluator. For EACH numbered claim below, decide whether it is directly supported by the given context passages. A claim that goes beyond the context is "no", even if plausible.',
    'Answer with one line per claim, exactly in the form "N: yes" or "N: no". No other text.',
    '',
    'CONTEXT:',
    contextBlock(results),
    '',
    'CLAIMS:',
    numbered(claims),
  ].join('\n');
  const verdicts = parseYesNoLines(await generate(judgeModel, verifyPrompt, { numPredict: 200 }), claims.length);
  const supported = verdicts.filter(Boolean).length;
  return { value: supported / claims.length, claims, verdicts };
}
