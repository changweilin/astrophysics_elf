// Unit tests for lib/query-route.mjs (QROUTE).
//
// The router is a heuristic, so the regression net is the golden set itself:
// every `relational`/`graph`-tagged case must classify as graph-heavy, and the
// `paraphrase` slice -- long descriptions that deliberately avoid the target
// page's wording -- must not be mistaken for short lookups. Those two slices are
// the ones the plan tracks separately (MRR 0.841 vs 0.431), so a heuristic that
// stops separating them is a real regression, not a style nit.
//
// No DB, no Ollama, no embeddings. Run:  node lib/query-route.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { classifyQuery, routeQuery, querySignals, ROUTES } from './query-route.mjs';
import { config } from '../config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, '..', 'eval', 'golden.jsonl');

let passed = 0;
let failed = 0;
function check(label, ok, extra) {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  FAIL  ${label}${extra !== undefined ? `  (${JSON.stringify(extra)})` : ''}`);
}

const cases = readFileSync(GOLDEN, 'utf8')
  .split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));

// ---- signal extraction --------------------------------------------------------
console.log('querySignals: anchors, person names, length');
{
  const s = querySignals('What is the Schwarzschild radius of a black hole?');
  check('finds a capitalized anchor', s.anchors.includes('Schwarzschild'), s.anchors);
  check('is definitional', s.definitional === true);
  check('is not long', s.long === false, { words: s.words });

  const opener = querySignals('What forms when a massive star collapses?');
  check('a sentence-initial "What" is not an anchor', !opener.anchors.length, opener.anchors);

  const acr = querySignals('When did LIGO first detect a signal?');
  check('all-caps acronyms count as anchors', acr.anchors.includes('LIGO'), acr.anchors);

  const poss = querySignals("What is Stephen Hawking's most famous book?");
  check('possessive on a named person is a person signal', poss.person === true, poss);

  const cjk = querySignals('史蒂芬·霍金最著名的科普著作是哪一本?');
  check('CJK interpunct name is a person signal', cjk.person === true, cjk);
  check('CJK query detected as CJK', cjk.isCjk === true);

  const long = querySignals('What forms when a massive star collapses so completely that not even light can escape its gravity?');
  check('a 17-word description is long', long.long === true, { words: long.words });
  const longZh = querySignals('一顆大質量恆星塌縮到連光都無法逃離時,會形成什麼天體?');
  check('a 27-char zh description is long', longZh.long === true, { cjkChars: longZh.cjkChars });
}

// ---- classification against the golden slices ---------------------------------
console.log('classifyQuery: golden relational/graph slice -> graph-heavy');
{
  const relational = cases.filter((c) => (c.tags || []).some((t) => t === 'relational' || t === 'graph'));
  check('the golden set still carries a relational slice', relational.length >= 10, relational.length);
  for (const c of relational) {
    const { route, reason } = classifyQuery(c.question);
    check(`${c.id} -> graph-heavy`, route === 'graph-heavy', { question: c.question, route, reason });
  }
}

console.log('classifyQuery: golden paraphrase slice -> paraphrase (never lookup)');
{
  const paraphrase = cases.filter((c) => (c.tags || []).includes('paraphrase'));
  check('the golden set still carries a paraphrase slice', paraphrase.length >= 12, paraphrase.length);
  for (const c of paraphrase) {
    const { route } = classifyQuery(c.question);
    // graph-heavy is acceptable for the handful of paraphrases that still name a
    // person or a prize; being routed as a short `lookup` is not -- that is the
    // exact confusion this slice exists to expose.
    check(`${c.id} is not misrouted as a lookup`, route !== 'lookup', { question: c.question, route });
  }
  const pure = paraphrase.filter((c) => classifyQuery(c.question).route === 'paraphrase');
  check('most of the paraphrase slice lands on the paraphrase route',
    pure.length >= Math.ceil(paraphrase.length * 0.8), `${pure.length}/${paraphrase.length}`);
}

console.log('classifyQuery: short definitional questions -> lookup');
{
  const expectLookup = [
    'What is a quasar?',
    'What is Hawking radiation?',
    'What is the Schwarzschild radius of a black hole?',
    '什麼是中子星?',
    '黑洞的事件視界是什麼?',
    '什麼是吸積盤?',
  ];
  for (const q of expectLookup) {
    const { route } = classifyQuery(q);
    check(`"${q}" -> lookup`, route === 'lookup', route);
  }
}

console.log('classifyQuery: relation cues in both scripts');
{
  const expectGraph = [
    "Who was Jocelyn Bell Burnell's doctoral advisor?",
    'Who discovered the first pulsar?',
    'The Kerr metric is named after which scientist?',
    'For what discovery did Kip Thorne share the 2017 Nobel Prize?',
    '喬瑟琳·貝爾·伯奈爾的博士指導教授是誰?',
    '克爾度規是以哪位科學家命名的?',
    '羅傑·彭羅斯為什麼獲得2020年諾貝爾物理學獎?',
  ];
  for (const q of expectGraph) {
    const { route } = classifyQuery(q);
    check(`"${q.slice(0, 40)}" -> graph-heavy`, route === 'graph-heavy', route);
  }
}

console.log('classifyQuery: degenerate input');
{
  check('empty string is balanced', classifyQuery('').route === 'balanced');
  check('whitespace is balanced', classifyQuery('   ').route === 'balanced');
  check('undefined is balanced', classifyQuery(undefined).route === 'balanced');
  check('every route is a declared route',
    cases.every((c) => ROUTES.includes(classifyQuery(c.question).route)));
}

// ---- routing policy -----------------------------------------------------------
console.log('routeQuery: mode gates every knob');
{
  const q = 'What is a quasar?';

  const observe = routeQuery(q, { mode: 'observe' });
  check('observe reports the route', observe.route === 'lookup', observe.route);
  check('observe applies nothing', observe.applied === false);
  check('observe keeps PPR on', observe.usePpr === true);
  check('observe keeps expansion on', observe.expand === true);
  check('observe keeps wGraph unscaled', observe.wGraphScale === 1);

  const on = routeQuery(q, { mode: 'on' });
  check('on marks itself applied', on.applied === true);
  check('on skips expansion for a lookup (config default)',
    on.expand === !config.retrieve.qrouteSkipExpand.includes('lookup'), {
      expand: on.expand, skip: config.retrieve.qrouteSkipExpand,
    });
  check('on keeps PPR by default -- dropping the walk is a ranking change',
    on.usePpr === true, config.retrieve.qrouteSkipPpr);
  check('on keeps wGraph at 1 by default', on.wGraphScale === 1);

  // graph-heavy is never stripped, in any mode.
  const rel = routeQuery("Who was Jocelyn Bell Burnell's doctoral advisor?", { mode: 'on' });
  check('graph-heavy keeps PPR', rel.usePpr === true, rel);
  check('graph-heavy keeps expansion', rel.expand === true, rel);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
