// Automated RAG evaluation runner.
//
//   node eval/run-eval.mjs                      # full run: retrieval + LLM judge
//   node eval/run-eval.mjs --retrieval-only     # no LLM at all (fast, free)
//   node eval/run-eval.mjs --no-graph           # A/B: disable the graph channel
//   node eval/run-eval.mjs --fusion weighted    # A/B: fusion strategy (rrf|weighted)
//   node eval/run-eval.mjs --limit 3 --k 8      # subset / retrieval depth
//   node eval/run-eval.mjs --judge <tag> --answer <tag>
//
// EVAL3 -- paired A/B with significance, instead of eyeballing two numbers:
//   node eval/run-eval.mjs --retrieval-only --ab no-graph
//   node eval/run-eval.mjs --retrieval-only --ab fusion=weighted
//   node eval/run-eval.mjs --retrieval-only --ab rrf-k=60
//   node eval/run-eval.mjs --retrieval-only --ab qroute
//
// EVAL1b -- blocking regression gate (exit 1 on regression, 2 if undecidable):
//   node eval/run-eval.mjs --retrieval-only --gate
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
import { embedAvailable } from '../lib/embed.mjs';
import { retrievalMetrics, contextPrecision, contextRecall, faithfulness } from './metrics.mjs';
import { generate, resolveJudgeModel, resolveAnswerModel } from './judge.mjs';
import { saveBaseline, loadBaseline, compareToBaseline, formatComparison, gateTolerances } from './baseline.mjs';
import { bootstrapCI, abVerdict, formatVerdict } from './stats.mjs';
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
  mode = 'full', k = 8, graph = true, limit = Infinity, fusion, rrfK, qroute,
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
  // Per-slice retrieval accuracy (golden `tags`, plus lang and the QROUTE
  // route), so a paraphrase / multi-hop subset can be read separately from the
  // single-hop baseline -- the whole point of RET3's "semantic recall" and
  // KG1's "graph MRR" metrics.
  const bySlice = {};
  const pushSlice = (key, m) => {
    const s = (bySlice[key] ??= { n: 0, hit: [], mrr: [] });
    s.n++; s.hit.push(m.hit); s.mrr.push(m.mrr);
  };
  // Case-level arrays, in dataset order, so a second run of the same dataset can
  // be compared PAIRED against this one (EVAL3, see abCompare below).
  const perCase = [];

  for (const c of cases) {
    log(`  ${c.id} …`);
    const langs = c.lang === 'en' ? ['en'] : [c.lang, 'en'];
    const t0 = Date.now();
    let route = null;
    const results = await search(db, {
      q: c.question, langs, k, noGraph: !graph, fusion, rrfK, qroute,
      onRoute: (r) => { route = r; },
    });
    const retrieveMs = Date.now() - t0;

    const m = { ...retrievalMetrics(results, c.expect, c.expect_qids), retrieveMs };
    acc.hit.push(m.hit);
    acc.mrr.push(m.mrr);
    acc.retrieveMs.push(retrieveMs);
    perCase.push({ id: c.id, lang: c.lang, tags: c.tags ?? [], route: route?.route ?? null, hit: m.hit, mrr: m.mrr });
    pushSlice(`lang:${c.lang}`, m);
    for (const tag of (Array.isArray(c.tags) ? c.tags : [])) pushSlice(`tag:${tag}`, m);
    if (route) pushSlice(`route:${route.route}`, m);

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
      let answerUsage = { tokensIn: null, tokensOut: null };
      try {
        answer = await generate(answerer, answerPrompt(c.question, context, c.lang), {
          temperature: 0.2, numPredict: 400, onUsage: (u) => { answerUsage = u; },
        });
        recordTrace(db, { kind: 'eval-answer', name: c.id, model: answerer, input: c.question, output: answer, ms: Date.now() - tA, tokensIn: answerUsage.tokensIn, tokensOut: answerUsage.tokensOut });
      } catch (e) {
        recordTrace(db, { kind: 'eval-answer', name: c.id, model: answerer, input: c.question, ms: Date.now() - tA, ok: false, error: e.message });
      }

      // Sum token usage across all three RAGAS judge calls into the one
      // eval-judge trace row (EVAL2), so the monitoring dashboard's token
      // columns reflect judge cost instead of reading ~0.
      const judgeUsage = { tokensIn: 0, tokensOut: 0 };
      const accUsage = (u) => { judgeUsage.tokensIn += u.tokensIn; judgeUsage.tokensOut += u.tokensOut; };
      const tJ = Date.now();
      try {
        const [prec, rec, faith] = [
          await contextPrecision(judge, c.question, results, { onUsage: accUsage }),
          await contextRecall(judge, c.ground_truth, results, { onUsage: accUsage }),
          answer ? await faithfulness(judge, c.question, answer, results, { onUsage: accUsage }) : { value: 0, claims: [], verdicts: [] },
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
        recordTrace(db, { kind: 'eval-judge', name: c.id, model: judge, input: c.question, output: JSON.stringify(m), ms: Date.now() - tJ, tokensIn: judgeUsage.tokensIn, tokensOut: judgeUsage.tokensOut });
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
  const slices = {};
  for (const [key, s] of Object.entries(bySlice)) {
    slices[key] = { n: s.n, hitRate: round3(avg(s.hit)), mrr: round3(avg(s.mrr)) };
  }
  // EVAL3: bootstrap CIs on every retrieval number the baseline stores. A slice
  // of 11 cases and a slice of 69 both print an MRR; only the interval says
  // which of them can support a verdict. `strip` drops the bookkeeping fields so
  // baseline.json stays readable.
  const strip = ({ lo, hi, width }) => ({ lo, hi, width });
  const ciSlices = {};
  for (const [key, s] of Object.entries(bySlice)) {
    ciSlices[key] = { hitRate: strip(bootstrapCI(s.hit)), mrr: strip(bootstrapCI(s.mrr)) };
  }
  const ci = {
    hitRate: strip(bootstrapCI(acc.hit)),
    mrr: strip(bootstrapCI(acc.mrr)),
    ...(Object.keys(ciSlices).length ? { slices: ciSlices } : {}),
  };
  const metrics = {
    hitRate: round3(avg(acc.hit)),
    mrr: round3(avg(acc.mrr)),
    avgRetrieveMs: Math.round(avg(acc.retrieveMs)),
    fusion: fusionUsed,
    ...(fusionUsed === 'rrf' ? { rrfK: rrfK || config.retrieve.rrfK } : {}),
    ...(Object.keys(slices).length ? { slices } : {}),
    ci,
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
  return { runId, mode, k, graph, cases: cases.length, models: [...modelsUsed].sort(), metrics, perCase };
}

// ---- EVAL3: paired A/B --------------------------------------------------------

// Variant specs accepted by --ab. Each returns the runEval opts to override.
const AB_VARIANTS = {
  'no-graph': () => ({ graph: false }),
  qroute: () => ({ qroute: 'on' }),
  fusion: (v) => ({ fusion: v }),
  'rrf-k': (v) => ({ rrfK: Number(v) }),
  k: (v) => ({ k: Number(v) }),
};

export function parseVariant(spec) {
  const [name, value] = String(spec || '').split('=');
  const make = AB_VARIANTS[name];
  if (!make) {
    throw new Error(`unknown --ab variant "${spec}" (want one of: ${Object.keys(AB_VARIANTS).join(', ')})`);
  }
  return { name: spec, opts: make(value) };
}

// Pair two runs case-by-case and label every scope. Arms MUST come from the
// same dataset in the same order -- runEval preserves dataset order, and the
// id equality check below makes a mismatch loud rather than silently unpaired.
export function abCompare(variantRun, baseRun) {
  const a = variantRun.perCase;
  const b = baseRun.perCase;
  if (a.length !== b.length || a.some((c, i) => c.id !== b[i].id)) {
    throw new Error('A/B arms are not case-aligned; both arms must run the same dataset');
  }
  const scopes = [{ key: 'overall', pick: () => true }];
  const sliceKeys = new Set();
  for (const c of b) {
    sliceKeys.add(`lang:${c.lang}`);
    for (const t of c.tags) sliceKeys.add(`tag:${t}`);
    if (c.route) sliceKeys.add(`route:${c.route}`);
  }
  for (const key of [...sliceKeys].sort()) {
    const [kind, value] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    scopes.push({
      key,
      // Slice membership is taken from the BASE arm so both arms carry exactly
      // the same case set even when the variant reroutes a query (route:* would
      // otherwise compare different subsets and break pairing).
      pick: (i) => (kind === 'lang' ? b[i].lang === value
        : kind === 'tag' ? b[i].tags.includes(value)
        : b[i].route === value),
    });
  }

  const out = [];
  for (const scope of scopes) {
    const idx = a.map((_, i) => i).filter((i) => scope.pick(i));
    if (idx.length < 2) continue;
    out.push({
      scope: scope.key,
      n: idx.length,
      hitRate: abVerdict(idx.map((i) => a[i].hit), idx.map((i) => b[i].hit)),
      mrr: abVerdict(idx.map((i) => a[i].mrr), idx.map((i) => b[i].mrr)),
    });
  }
  return out;
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
  const gate = flag('--gate');
  const abSpec = opt('--ab', undefined);

  // Validate the A/B request BEFORE the base run: a typo'd variant name or a
  // judged --ab used to surface only after a full run had already been paid for.
  let variant = null;
  if (abSpec) {
    if (!flag('--retrieval-only')) {
      console.error('--ab requires --retrieval-only (a paired judged run would double the LLM cost).');
      process.exitCode = 2;
      process.exit();
    }
    try {
      variant = parseVariant(abSpec);
    } catch (e) {
      console.error(e.message);
      process.exitCode = 2;
      process.exit();
    }
  }

  // EVAL1b precondition. Retrieval metrics are only reproducible while the
  // embedding model answers; with Ollama down the vector channel silently
  // degrades to BM25-only and every delta is an artifact. A gate that failed on
  // that would train people to ignore it, so refuse to judge (exit 2) instead.
  if (gate) {
    const ok = await embedAvailable();
    if (!ok) {
      console.error(
        `gate: embedding model "${config.embed.model}" unreachable at ${config.embed.baseUrl} `
        + '-- retrieval metrics are not reproducible in BM25-only mode. Not judging.'
      );
      process.exitCode = 2;
      process.exit();
    }
  }

  const baseOpts = {
    mode: flag('--retrieval-only') ? 'retrieval' : 'full',
    graph: !flag('--no-graph'),
    fusion: opt('--fusion', undefined),
    rrfK: Number(opt('--rrf-k', 0)) || undefined,
    qroute: opt('--qroute', undefined),
    k: Number(opt('--k', 8)),
    limit: Number(opt('--limit', Infinity)),
    judgeModel: opt('--judge', undefined),
    answerModel: opt('--answer', undefined),
    datasetPath: opt('--dataset', undefined),
    log: console.log,
  };
  const r = await runEval(db, baseOpts);

  // `[lo, hi]` on every headline number: at n=69 the interval is what says
  // whether a delta means anything, so it is printed next to the point estimate
  // rather than buried in the JSON.
  const band = (c) => (c ? ` [${c.lo}, ${c.hi}]` : '');
  const report = (run) => {
    console.log(`\nrun #${run.runId} (${run.mode}, graph=${run.graph}, k=${run.k}, ${run.cases} cases)`);
    if (run.models.length) console.log(`  models: ${run.models.join(', ')}`);
    const ci = run.metrics.ci || {};
    for (const [key, value] of Object.entries(run.metrics)) {
      if (key === 'ci') continue; // folded into the lines below
      if (key === 'slices') {
        console.log('  slices:');
        for (const [sk, sv] of Object.entries(value)) {
          const sci = ci.slices?.[sk];
          console.log(
            `    ${sk.padEnd(20)} n=${String(sv.n).padStart(2)}  `
            + `hitRate=${sv.hitRate}${band(sci?.hitRate)}  mrr=${sv.mrr}${band(sci?.mrr)}`
          );
        }
      } else if (key === 'hitRate' || key === 'mrr') {
        console.log(`  ${key}: ${value}${band(ci[key])}`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }
  };
  report(r);

  // EVAL3: paired A/B. The variant arm reruns the SAME dataset in the same
  // order, so every scope is compared case-by-case (see abCompare).
  if (variant) {
    console.log(`\n=== A/B variant: ${variant.name} (rerunning the same ${r.cases} cases) ===`);
    const v = await runEval(db, { ...baseOpts, ...variant.opts });
    report(v);
    console.log(`\n  paired A/B  variant(${variant.name}) vs base  [95% CI of the difference]`);
    for (const row of abCompare(v, r)) {
      console.log(`    ${row.scope} (n=${row.n})`);
      console.log(formatVerdict('hitRate', row.hitRate));
      console.log(formatVerdict('mrr', row.mrr));
    }
    console.log('\n  ^ improved  v regressed  = no-effect (a meaningful change is ruled out)'
      + '  ? need-more-cases (undecided at this n)');
    process.exit();
  }

  // EVAL1a (report) / EVAL1b (gate): freeze or diff the retrieval baseline.
  // Without --gate the exit code is never touched; with it, a regression beyond
  // the CI-derived tolerance fails the process.
  if (flag('--save-baseline')) {
    const p = saveBaseline(r);
    console.log(`\nsaved baseline -> ${path.relative(process.cwd(), p)} `
      + `(${r.cases} cases, ${r.metrics.fusion}${r.metrics.rrfK ? ` k=${r.metrics.rrfK}` : ''}, graph=${r.graph})`);
  } else {
    const baseline = loadBaseline();
    if (baseline) {
      const combined = { ...r.metrics, mode: r.mode, k: r.k, graph: r.graph, cases: r.cases };
      // Tolerance = half the baseline's bootstrap CI width for that same scope
      // (floored at config.eval.gateMinTol), so an 11-case slice is allowed to
      // wobble as much as 11 cases actually wobble and the 69-case overall
      // number is held tight. Falls back to the flat 0.005 for scopes the
      // baseline predates the CI block for.
      const tolBy = gateTolerances(baseline);
      const cmp = compareToBaseline(combined, baseline, { tolBy });
      console.log('');
      for (const line of formatComparison(cmp, baseline, { blocking: gate })) console.log(line);
      if (gate) {
        if (!Object.keys(tolBy).length) {
          console.log('    note: baseline has no `ci` block (pre-EVAL3) -- gating on the flat 0.005 tolerance.'
            + ' Re-freeze with `npm run eval:baseline` for CI-derived tolerances.');
        }
        if (cmp.configMismatch.length) {
          console.error('gate: run config differs from the baseline -- refusing to judge.');
          process.exitCode = 2;
        } else {
          process.exitCode = cmp.regressions.length ? 1 : 0;
        }
      }
    } else {
      console.log('\n  (no eval/baseline.json -- run `npm run eval:baseline` to freeze one)');
      if (gate) {
        console.error('gate: no baseline to compare against.');
        process.exitCode = 2;
      }
    }
  }
}
