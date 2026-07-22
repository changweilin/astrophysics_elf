// Automated RAG evaluation runner.
//
//   node eval/run-eval.mjs                      # full run: retrieval + LLM judge
//   node eval/run-eval.mjs --retrieval-only     # no LLM at all (fast, free)
//   node eval/run-eval.mjs --no-graph           # A/B: disable the graph channel
//   node eval/run-eval.mjs --fusion weighted    # A/B: fusion strategy (rrf|weighted)
//   node eval/run-eval.mjs --limit 3 --k 8      # subset / retrieval depth
//   node eval/run-eval.mjs --judge <tag> --answer <tag>
//
// Every run is persisted (eval_runs + eval_cases) and every LLM call traced
// (traces table), so results show up in kb-admin.html's 評估/監測 tabs.
// runEval() is also exported for the HTTP route (retrieval-only from the UI).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDb, now } from '../lib/db.mjs';
import { search, buildContext } from '../lib/retrieve.mjs';
import { recordTrace } from '../lib/trace.mjs';
import { retrievalMetrics, contextPrecision, contextRecall, faithfulness } from './metrics.mjs';
import { generate, resolveJudgeModel, resolveAnswerModel } from './judge.mjs';
import { config } from '../config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadGolden(datasetPath = path.join(HERE, 'golden.jsonl')) {
  return readFileSync(datasetPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function answerPrompt(question, context, lang) {
  const langLine = lang === 'zh'
    ? 'Answer in Traditional Chinese (Taiwan).'
    : 'Answer in English.';
  return [
    'Answer the question using ONLY the reference passages below. Be concise (2-4 sentences). If the passages do not contain the answer, say you do not know.',
    langLine,
    '',
    'REFERENCES:',
    context,
    '',
    `QUESTION: ${question}`,
  ].join('\n');
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round3 = (x) => Number(x.toFixed(3));

// mode: 'retrieval' (no LLM) or 'full'. Returns the persisted run row shape.
export async function runEval(db, {
  mode = 'full', k = 8, graph = true, limit = Infinity, fusion, rrfK,
  judgeModel, answerModel, datasetPath, log = () => {},
} = {}) {
  const cases = loadGolden(datasetPath).slice(0, limit);
  const full = mode === 'full';
  // Judge/answerer are resolved per-case (see resolveJudgeModel/
  // resolveAnswerModel lang argument) because zh and en cases need different
  // models -- the generic auto-pick free-writes prose instead of the strict
  // verdict format for zh once the judge prompt carries several passages. An
  // explicit --judge/--answer CLI flag overrides this and applies globally.
  const modelsUsed = new Set();

  const runId = Number(db.prepare(
    `INSERT INTO eval_runs(ts,mode,judge_model,answer_model,k,graph,cases)
     VALUES(?,?,?,?,?,?,?)`
  ).run(now(), mode, judgeModel ?? null, answerModel ?? null, k, graph ? 1 : 0, cases.length).lastInsertRowid);

  const insCase = db.prepare(
    `INSERT INTO eval_cases(run_id,case_id,lang,question,ground_truth,answer,contexts,metrics,detail)
     VALUES(?,?,?,?,?,?,?,?,?)`
  );

  const acc = { hit: [], mrr: [], retrieveMs: [], precision: [], recall: [], faithfulness: [], hallucination: [] };

  for (const c of cases) {
    log(`  ${c.id} …`);
    const langs = c.lang === 'en' ? ['en'] : [c.lang, 'en'];
    const t0 = Date.now();
    const results = await search(db, { q: c.question, langs, k, noGraph: !graph, fusion, rrfK });
    const retrieveMs = Date.now() - t0;

    const m = { ...retrievalMetrics(results, c.expect), retrieveMs };
    acc.hit.push(m.hit);
    acc.mrr.push(m.mrr);
    acc.retrieveMs.push(retrieveMs);

    let answer = null;
    const detail = {};
    if (full) {
      const judge = judgeModel || await resolveJudgeModel(c.lang);
      const answerer = answerModel || await resolveAnswerModel(c.lang);
      modelsUsed.add(`${c.lang}:judge=${judge}`);
      modelsUsed.add(`${c.lang}:answer=${answerer}`);
      detail.judgeModel = judge;
      detail.answerModel = answerer;

      const { context } = buildContext(results);
      const tA = Date.now();
      try {
        answer = await generate(answerer, answerPrompt(c.question, context, c.lang), { temperature: 0.2, numPredict: 400 });
        recordTrace(db, { kind: 'eval-answer', name: c.id, model: answerer, input: c.question, output: answer, ms: Date.now() - tA });
      } catch (e) {
        recordTrace(db, { kind: 'eval-answer', name: c.id, model: answerer, input: c.question, ms: Date.now() - tA, ok: false, error: e.message });
      }

      const tJ = Date.now();
      try {
        const [prec, rec, faith] = [
          await contextPrecision(judge, c.question, results),
          await contextRecall(judge, c.ground_truth, results),
          answer ? await faithfulness(judge, c.question, answer, results) : { value: 0, claims: [], verdicts: [] },
        ];
        m.contextPrecision = round3(prec.value);
        m.contextRecall = round3(rec.value);
        m.faithfulness = round3(faith.value);
        m.hallucination = round3(1 - faith.value);
        detail.precisionVerdicts = prec.verdicts;
        detail.recallStatements = rec.statements;
        detail.recallVerdicts = rec.verdicts;
        detail.claims = faith.claims;
        detail.claimVerdicts = faith.verdicts;
        acc.precision.push(prec.value);
        acc.recall.push(rec.value);
        acc.faithfulness.push(faith.value);
        acc.hallucination.push(1 - faith.value);
        recordTrace(db, { kind: 'eval-judge', name: c.id, model: judge, input: c.question, output: JSON.stringify(m), ms: Date.now() - tJ });
      } catch (e) {
        detail.judgeError = e.message;
        recordTrace(db, { kind: 'eval-judge', name: c.id, model: judge, input: c.question, ms: Date.now() - tJ, ok: false, error: e.message });
      }
    }

    insCase.run(
      runId, c.id, c.lang, c.question, c.ground_truth, answer,
      JSON.stringify(results.map((r) => ({
        title: r.title, lang: r.lang, score: Number(r.score.toFixed(4)),
        g: r.g != null ? Number(r.g.toFixed(3)) : undefined,
        graphExpanded: r.graphExpanded || undefined,
        snippet: String(r.text).slice(0, 160),
      }))),
      JSON.stringify(m),
      JSON.stringify(detail)
    );
    log(`    hit=${m.hit} mrr=${m.mrr.toFixed(2)}${full ? ` P=${m.contextPrecision ?? '-'} R=${m.contextRecall ?? '-'} F=${m.faithfulness ?? '-'}` : ''}`);
  }

  // Record the fusion strategy that actually ran, so runs before/after a
  // default flip stay comparable in kb-admin's eval tab (same reason the
  // graph flag is persisted).
  const fusionUsed = fusion || config.retrieve.fusion;
  const metrics = {
    hitRate: round3(avg(acc.hit)),
    mrr: round3(avg(acc.mrr)),
    avgRetrieveMs: Math.round(avg(acc.retrieveMs)),
    fusion: fusionUsed,
    ...(fusionUsed === 'rrf' ? { rrfK: rrfK || config.retrieve.rrfK } : {}),
    ...(full ? {
      contextPrecision: round3(avg(acc.precision)),
      contextRecall: round3(avg(acc.recall)),
      faithfulness: round3(avg(acc.faithfulness)),
      hallucination: round3(avg(acc.hallucination)),
    } : {}),
  };
  if (full && !judgeModel && !answerModel) {
    // Per-case auto-picked models can differ by lang (see resolveJudgeModel);
    // record what actually ran instead of leaving the run-level columns
    // referring to a single global model that was never used as such.
    const summary = [...modelsUsed].sort().join(', ');
    db.prepare('UPDATE eval_runs SET judge_model=?, answer_model=? WHERE id=?').run(summary, summary, runId);
  }
  db.prepare('UPDATE eval_runs SET metrics=? WHERE id=?').run(JSON.stringify(metrics), runId);
  return { runId, mode, k, graph, cases: cases.length, models: [...modelsUsed].sort(), metrics };
}

// ---- CLI ----------------------------------------------------------------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
  };
  const db = openDb();
  const r = await runEval(db, {
    mode: flag('--retrieval-only') ? 'retrieval' : 'full',
    graph: !flag('--no-graph'),
    fusion: opt('--fusion', undefined),
    rrfK: Number(opt('--rrf-k', 0)) || undefined,
    k: Number(opt('--k', 8)),
    limit: Number(opt('--limit', Infinity)),
    judgeModel: opt('--judge', undefined),
    answerModel: opt('--answer', undefined),
    datasetPath: opt('--dataset', undefined),
    log: console.log,
  });
  console.log(`\nrun #${r.runId} (${r.mode}, graph=${r.graph}, k=${r.k}, ${r.cases} cases)`);
  if (r.models.length) console.log(`  models: ${r.models.join(', ')}`);
  for (const [key, value] of Object.entries(r.metrics)) console.log(`  ${key}: ${value}`);
}
