// QROUTE -- per-query router for the graph channel.
//
// Every query currently pays the same price: a PPR power iteration over the
// ~110k-node Wikidata graph plus a multi-hop expansion probe, whether or not
// the question has anything relational in it. This module classifies the query
// first (pure string work, no DB, no LLM, no embedding) so a plain definitional
// lookup can skip the expensive parts, and a genuinely relational question can
// be given the graph channel's full weight.
//
// Four routes, each keyed to a slice the golden set already measures:
//
//   graph-heavy  a relation is being asked about -- an advisor, an eponym, a
//                prize, a discoverer, or anything possessive of a named person.
//                This is the `relational`/`graph` slice (MRR 0.841).
//   lookup       short definitional question with a named anchor ("What is the
//                Schwarzschild radius?", "什麼是中子星?"). The answer page is
//                directly retrievable; multi-hop expansion has nothing to add.
//   paraphrase   long descriptive question that deliberately avoids the target
//                page's wording and names no entity ("What forms when a massive
//                star collapses so completely that not even light can escape?").
//                The `paraphrase` slice (MRR 0.431) -- the weakest one, and the
//                one where graph seeds come only from possibly-wrong top hybrid
//                hits, so graph noise is the biggest risk.
//   balanced     everything else; today's behaviour, unchanged.
//
// Three modes (config.retrieve.qroute), because the route policy changes
// ranking and nothing in this project gets tuned before it can be measured:
//
//   off       never classify (byte-identical to pre-QROUTE retrieval)
//   observe   classify and report the label -- eval gains per-route slices and
//             traces gain a `route` field -- but apply NO knob change (default)
//   on        apply the policy below
//
// Promotion path: run `node eval/run-eval.mjs --retrieval-only --ab qroute`
// and read the paired verdict (eval/stats.mjs). Flip the default only when the
// per-route deltas are `improved` or `no-effect`, never on `need-more-cases`.

import { config } from '../config.mjs';

export const ROUTES = ['graph-heavy', 'lookup', 'paraphrase', 'balanced'];

// ---- lexical signals ----------------------------------------------------------

// Relation cues. English is matched case-insensitively on word boundaries;
// Chinese on plain substrings (no tokenizer needed, and these are specific
// enough not to fire on definitional questions).
const CUES_EN = [
  'advisor', 'adviser', 'supervisor', 'doctoral', 'phd student', 'student of',
  'named after', 'named for', 'named in honou?r', 'eponym',
  'who discovered', 'who first', 'who found', 'who proposed', 'who derived',
  'discovered by', 'proposed by', 'derived by', 'formulated by', 'predicted by',
  'nobel', 'prize', 'award', 'medal',
  'collaborat', 'co-?author', 'mentor', 'influenced', 'taught', 'teacher of',
  'worked with', 'disputed', 'colleague',
];
const CUES_ZH = [
  '指導教授', '博士指導', '導師', '師從', '學生是', '的學生', '的老師',
  '命名', '以誰', '得名', '紀念',
  '誰發現', '誰提出', '誰導出', '誰首先', '發現者', '提出者', '由誰',
  '諾貝爾', '獎項', '得獎', '獲獎', '獲得.{0,6}獎',
  '合作', '影響了', '同事', '反對', '質疑',
];
const CUE_EN_RE = new RegExp(`\\b(?:${CUES_EN.join('|')})`, 'i');
const CUE_ZH_RE = new RegExp(CUES_ZH.join('|'));

// Definitional openers: "what is/are ...", "define ...", "什麼是 ...",
// "... 是什麼", "... 叫什麼".
const DEF_EN_RE = /^\s*(?:what\s+(?:is|are|was|were)\b|define\b|what\s+do(?:es)?\s+.*\bmean\b)/i;
const DEF_ZH_RE = /什麼是|甚麼是|是什麼|是甚麼|叫什麼|叫甚麼|何謂/;

// A capitalized latin word/phrase that is NOT a sentence-initial question word
// is treated as a named anchor ("Schwarzschild radius", "Milky Way", "LIGO").
const PROPER_EN_RE = /\b(?:[A-Z][a-z]{2,}(?:[ -][A-Z][a-z]+)*|[A-Z]{2,}[0-9-]*)\b/g;
const OPENERS = new Set([
  'What', 'Who', 'When', 'Where', 'Why', 'How', 'Which', 'Whose', 'Whom',
  'The', 'Is', 'Are', 'Was', 'Were', 'Does', 'Do', 'Did', 'Can', 'Could',
  'For', 'In', 'On', 'At', 'By', 'And', 'But', 'If', 'A', 'An',
]);

// "Stephen Hawking's", "Chandrasekhar's" -- a possessive on a named person is
// itself a relation ("X's advisor", "X's book", "X's limit").
const POSSESSIVE_RE = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*['’]s\b/;
// CJK transliterated personal names carry the interpunct: 史蒂芬·霍金,
// 喬瑟琳·貝爾·伯奈爾, 羅傑·彭羅斯. A very high-precision person signal.
const CJK_PERSON_RE = /[一-鿿]{1,4}[·‧・][一-鿿·‧・]{1,12}/;

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

// Descriptive-clause thresholds. Above these a definitional question is a
// deliberately reworded description rather than a short lookup -- exactly the
// shape of the golden `paraphrase` slice.
const LONG_WORDS = 12; // latin words
const LONG_CJK_CHARS = 20; // CJK characters

export function querySignals(q) {
  const text = String(q || '').trim();
  const cjkChars = (text.match(/[㐀-䶿一-鿿가-힯]/g) || []).length;
  const isCjk = CJK_RE.test(text);
  const words = (text.match(/[A-Za-z][A-Za-z0-9+.\-']*/g) || []).length;

  const anchors = [];
  for (const m of text.match(PROPER_EN_RE) || []) {
    const head = m.split(/[ -]/)[0];
    if (OPENERS.has(head) && m === head) continue; // bare "What", "The", ...
    anchors.push(m);
  }
  const person = POSSESSIVE_RE.test(text) || CJK_PERSON_RE.test(text);
  const relational = person || CUE_EN_RE.test(text) || CUE_ZH_RE.test(text);
  const definitional = DEF_EN_RE.test(text) || DEF_ZH_RE.test(text);
  const long = isCjk ? cjkChars >= LONG_CJK_CHARS : words >= LONG_WORDS;

  return { text, isCjk, words, cjkChars, anchors, person, relational, definitional, long };
}

// ---- policy -------------------------------------------------------------------

function parseWeights(spec) {
  const out = {};
  for (const part of String(spec || '').split(',')) {
    const [name, value] = part.split('=').map((s) => (s || '').trim());
    const n = Number(value);
    if (name && Number.isFinite(n)) out[name] = n;
  }
  return out;
}

// Classify only -- never reads config, so it is trivially testable.
export function classifyQuery(q) {
  const s = querySignals(q);
  if (!s.text) return { route: 'balanced', reason: 'empty query', signals: s };
  if (s.relational) {
    return {
      route: 'graph-heavy',
      reason: s.person ? 'names a person in a possessive/relational form' : 'relation cue word',
      signals: s,
    };
  }
  if (s.long && !s.anchors.length) {
    return { route: 'paraphrase', reason: 'long descriptive clause with no named anchor', signals: s };
  }
  if (s.definitional && !s.long) {
    return { route: 'lookup', reason: 'short definitional question', signals: s };
  }
  return { route: 'balanced', reason: 'no distinguishing signal', signals: s };
}

// Full routing decision: classification + the knobs search() should use.
// `mode` overrides config.retrieve.qroute (so run-eval can A/B it in-process).
export function routeQuery(q, { mode } = {}) {
  const effMode = mode || config.retrieve.qroute || 'observe';
  const { route, reason, signals } = classifyQuery(q);
  const applied = effMode === 'on';
  const skipPpr = config.retrieve.qrouteSkipPpr.includes(route);
  const skipExpand = config.retrieve.qrouteSkipExpand.includes(route);
  const weights = parseWeights(config.retrieve.qrouteGraphWeights);

  return {
    mode: effMode,
    route,
    reason,
    applied,
    // Knobs. With `applied` false these are all the pre-QROUTE defaults, so a
    // caller can read them unconditionally.
    usePpr: applied ? !skipPpr : true,
    expand: applied ? !skipExpand : true,
    wGraphScale: applied ? (weights[route] ?? 1) : 1,
    signals,
  };
}
