// Unit tests for the delivery half of lib/retrieve.mjs: the RET4 MMR pass and
// the coverage block buildContext reports.
//
// Ranking (search()) needs the corpus and the embedding model; delivery does
// not -- it is pure JS over already-scored rows, which is exactly why the
// diversity knob is testable here instead of only in the local eval. No DB, no
// Ollama, no network.  Run:  node lib/retrieve.test.mjs

import { mmrOrder, buildContext } from './retrieve.mjs';

let passed = 0;
let failed = 0;
function check(label, ok, extra) {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  FAIL  ${label}${extra !== undefined ? `  (${JSON.stringify(extra)})` : ''}`);
}

// Two chunks that say the same thing under different qids -- what qid dedup
// cannot catch and MMR exists for -- plus one that does not.
const KERR_A = 'The Kerr metric describes the vacuum spacetime around a rotating uncharged black hole in general relativity.';
const KERR_B = 'The Kerr solution describes the vacuum spacetime around a rotating uncharged black hole in general relativity.';
const DISC = 'Accretion discs emit X-rays as infalling gas is heated by viscous dissipation near the innermost stable circular orbit.';

function row(i, score, text, extra = {}) {
  return {
    chunkId: i, pageId: i, qid: `Q${i}`, title: `Page ${i}`, lang: 'en',
    section: null, url: `https://example.org/${i}`, revTime: '2026-01-01T00:00:00Z',
    text, score, ...extra,
  };
}

console.log('mmrOrder: identity cases');
{
  const rows = [row(1, 1.0, KERR_A), row(2, 0.95, KERR_B), row(3, 0.9, DISC)];
  check('lambda=1 returns the input untouched', mmrOrder(rows, 1) === rows);
  check('lambda>1 returns the input untouched', mmrOrder(rows, 1.5) === rows);
  const two = rows.slice(0, 2);
  check('fewer than 3 rows is a no-op', mmrOrder(two, 0.5) === two);
}

console.log('mmrOrder: diversity');
{
  const rows = [row(1, 1.0, KERR_A), row(2, 0.95, KERR_B), row(3, 0.9, DISC)];
  const out = mmrOrder(rows, 0.7);
  check('top-relevance row is still first', out[0].chunkId === 1, out.map((r) => r.chunkId));
  check('the near-duplicate is demoted below the distinct chunk',
    out.map((r) => r.chunkId).join(',') === '1,3,2', out.map((r) => r.chunkId));
  check('nothing is dropped', out.length === 3);
}

console.log('mmrOrder: distinct rows keep score order');
{
  const rows = [
    row(1, 1.0, DISC),
    row(2, 0.9, KERR_A),
    row(3, 0.8, 'Gravitational waves from a binary inspiral carry away orbital energy and shrink the separation.'),
    row(4, 0.7, 'Hawking radiation is a quantum field effect that makes an isolated horizon slowly evaporate.'),
  ];
  const out = mmrOrder(rows, 0.7).map((r) => r.chunkId).join(',');
  check('no spurious reordering when nothing is a duplicate', out === '1,2,3,4', out);
}

console.log('mmrOrder: degenerate scores');
{
  // All-zero scores must not divide by zero (normalization falls back to 1)
  // and must still return every row exactly once.
  const rows = [row(1, 0, KERR_A), row(2, 0, KERR_B), row(3, 0, DISC)];
  const out = mmrOrder(rows, 0.7);
  check('all-zero scores still return every row', out.length === 3
    && new Set(out.map((r) => r.chunkId)).size === 3, out.map((r) => r.chunkId));
}

console.log('buildContext: coverage reports the MMR decision');
{
  const rows = [row(1, 1.0, KERR_A), row(2, 0.95, KERR_B), row(3, 0.9, DISC)];
  const off = buildContext(rows, 4000);
  check('default lambda is the identity', off.coverage.mmrMoved === 0, off.coverage);
  check('lambda is reported', off.coverage.mmrLambda === 1, off.coverage.mmrLambda);
  check('every chunk is delivered when the budget fits', off.coverage.deliveredChunks === 3, off.coverage);

  const on = buildContext(rows, 4000, { mmrLambda: 0.7 });
  check('mmrMoved counts the reorder', on.coverage.mmrMoved > 0, on.coverage);
  check('same chunk count, different order',
    on.coverage.deliveredChunks === 3 && on.sources[1].title === 'Page 3',
    on.sources.map((s) => s.title));
}

console.log('buildContext: a tight budget spends it on distinct facts');
{
  const rows = [row(1, 1.0, KERR_A), row(2, 0.95, KERR_B), row(3, 0.9, DISC)];
  // Room for two blocks only: relevance order delivers the duplicate pair,
  // MMR delivers one of each.
  const budget = 320;
  const off = buildContext(rows, budget).sources.map((s) => s.title);
  const on = buildContext(rows, budget, { mmrLambda: 0.7 }).sources.map((s) => s.title);
  check('relevance-only delivers the near-duplicate pair', off.join(',') === 'Page 1,Page 2', off);
  check('MMR delivers two distinct facts instead', on.join(',') === 'Page 1,Page 3', on);
}

console.log('buildContext: qid dedup still collapses one concept\'s languages');
{
  const rows = [
    { ...row(1, 1.0, KERR_A), qid: 'Q83371' },
    { ...row(2, 0.95, '克爾度規描述旋轉不帶電黑洞周圍的真空時空。'), qid: 'Q83371', lang: 'zh' },
    row(3, 0.9, DISC),
  ];
  const out = buildContext(rows, 4000, { mmrLambda: 0.7 });
  check('the shared qid is delivered once', out.coverage.deliveredChunks === 2, out.sources);
  check('MMR never sees the collapsed row', out.coverage.deliveredQids === 2, out.coverage);
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} — ${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
