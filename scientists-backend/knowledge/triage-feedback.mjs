// Feedback triage + auto-labelling worker (LOOP1).
//
// The scientists chat writes per-reply thumbs up/down (+ optional structured
// reasons and a free-text correction) to the `feedback` table in the shared
// kb.sqlite (see ../lib/feedback.mjs). Until now nothing consumed it: the
// `status`/`auto_label` columns were reserved but only ever reset to `new`/NULL.
// This activates them -- it walks the `new` rows, assigns a deterministic label
// wherever the data already implies one, and only falls back to a single local
// judge call for a bare downvote that carries no reasons and no correction.
//
// Labelling precedence (cheapest signal first):
//   rating = +1                         -> 'positive'
//   downvote WITH structured reasons    -> 'reasons'   (the reasons ARE the label)
//   downvote WITH a correction          -> 'major' | 'minor'  (by edit distance)
//   bare downvote (neither)             -> one local Ollama judge call
//
// A labelled row moves new -> triaged. A bare downvote is only judged when
// Ollama is reachable and --no-llm was not passed; otherwise it is left `new`
// (deferred) so a later run retries it rather than mislabelling it now. Re-
// rating a reply resets it to `new` (feedback.mjs upsert), so triage re-examines
// changed minds automatically. Idempotent: only `status='new'` rows are touched.
//
// Usage:
//   node knowledge/triage-feedback.mjs                # triage all new rows (judge bare downvotes)
//   node knowledge/triage-feedback.mjs --no-llm       # deterministic only; defer bare downvotes
//   node knowledge/triage-feedback.mjs --limit 50     # cap rows processed this run
//   node knowledge/triage-feedback.mjs --dry-run      # report only, write nothing

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../wiki-kb/lib/db.mjs';
import { initFeedback } from '../lib/feedback.mjs';
import { chat } from '../lib/ollama.mjs';
import { resolveModel } from '../config.mjs';

// ned above this reads as a substantive rewrite (the answer was largely wrong),
// below it as a light touch-up. 0.6 = "more than half the reply changed".
const MAJOR_NED = 0.6;

const JUDGE_LABELS = ['inaccurate', 'incomplete', 'off-topic', 'style', 'other'];

function judgePrompt(lang, question, answer) {
  if (lang === 'zh') {
    return [
      '使用者對下面這則助理回答按了「倒讚」,但沒有說明原因。',
      `請從這個清單中選出「最可能」的單一原因:${JUDGE_LABELS.join('、')}。`,
      '只回答清單中的一個英文單字,不要任何其他文字。',
      '',
      `問題:${question || '(未提供)'}`,
      `回答:${answer}`,
    ].join('\n');
  }
  return [
    "A user gave a thumbs-down to the assistant answer below but did not say why.",
    `Choose the SINGLE most likely reason from this list: ${JUDGE_LABELS.join(', ')}.`,
    'Reply with only one word from the list, nothing else.',
    '',
    `QUESTION: ${question || '(not provided)'}`,
    `ANSWER: ${answer}`,
  ].join('\n');
}

function parseJudgeLabel(text) {
  const t = String(text || '').toLowerCase();
  return JUDGE_LABELS.find((l) => t.includes(l)) || 'other';
}

// One bare-downvote classification via the row's own language model. Fail-open:
// any error returns null so the caller defers the row instead of mislabelling.
async function judgeBareDownvote(row) {
  try {
    const model = resolveModel(row.lang);
    const { content } = await chat({
      model,
      messages: [{ role: 'user', content: judgePrompt(model.lang, row.question, row.answer) }],
      optionOverrides: { temperature: 0, num_predict: 24 },
    });
    return parseJudgeLabel(content);
  } catch {
    return null;
  }
}

function hasReasons(row) {
  if (!row.reasons) return false;
  try {
    const arr = JSON.parse(row.reasons);
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

// Deterministic label from the row alone, or null when a judge call is needed.
function deterministicLabel(row) {
  if (row.rating === 1) return 'positive';
  if (hasReasons(row)) return 'reasons';
  if (row.correction != null && row.correction !== '') {
    return (row.ned != null && row.ned > MAJOR_NED) ? 'major' : 'minor';
  }
  return null; // bare downvote -> judge
}

export async function triageFeedback(db, { limit = Infinity, useLlm = true, dryRun = false, log = () => {} } = {}) {
  initFeedback(db);

  const rows = db.prepare(
    `SELECT id, lang, rating, reasons, correction, ned, question, answer
     FROM feedback WHERE status = 'new' ORDER BY id`
  ).all().slice(0, Number.isFinite(limit) ? limit : undefined);

  const setLabel = db.prepare(
    "UPDATE feedback SET status = 'triaged', auto_label = ? WHERE id = ? AND status = 'new'"
  );

  const counts = {};
  let triaged = 0;
  let deferred = 0;
  for (const row of rows) {
    let label = deterministicLabel(row);
    if (label === null) {
      // Bare downvote: judge only if allowed and Ollama answers; else defer.
      if (!useLlm) { deferred++; continue; }
      label = await judgeBareDownvote(row);
      if (label === null) { deferred++; continue; }
    }
    counts[label] = (counts[label] || 0) + 1;
    if (!dryRun) setLabel.run(label, row.id);
    triaged++;
    log(`  #${row.id} rating=${row.rating} -> ${label}`);
  }

  // Reality check for the LOOP2 / PERS2 gates: correction volume is what those
  // items are supposed to source from, so surface it before anything is built
  // on the assumption that it exists.
  const correctionRows = Number(db.prepare(
    'SELECT COUNT(*) AS n FROM feedback WHERE rating = -1 AND correction IS NOT NULL'
  ).get().n);

  return { scanned: rows.length, triaged, deferred, counts, correctionRows };
}

// ---- CLI --------------------------------------------------------------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };

  const db = openDb();
  const dryRun = flag('--dry-run');
  const useLlm = !flag('--no-llm');
  const limit = Number(opt('--limit', Infinity)) || Infinity;

  const r = await triageFeedback(db, { limit, useLlm, dryRun, log: console.log });

  console.log(`\ntriaged ${r.triaged}/${r.scanned} new rows${dryRun ? ' (dry-run, no writes)' : ''}`);
  if (r.deferred) console.log(`  deferred ${r.deferred} bare downvote(s)${useLlm ? ' (Ollama unreachable)' : ' (--no-llm)'} -- left 'new' for a later run`);
  const byLabel = Object.entries(r.counts).sort((a, b) => b[1] - a[1]);
  if (byLabel.length) console.log('  labels: ' + byLabel.map(([k, v]) => `${k}=${v}`).join(', '));
  console.log(`  downvotes with a correction (LOOP2 source pool): ${r.correctionRows}`);
}
