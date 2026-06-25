// Lightweight lexical-similarity helpers shared by the roundtable repetition
// guard (lib/discussion.mjs) and the follow-up diversity filter
// (lib/followups.mjs).
//
// Character n-gram shingles + Jaccard work for both Traditional Chinese and
// English without needing word boundaries (CJK has none), and need no model
// call -- so detecting "this just restates the last turn" or "these two
// suggestions are the same question" is instant and deterministic.

// Normalize text (lowercase, drop whitespace + punctuation/symbols) and build a
// set of overlapping k-character shingles. Strings shorter than k collapse to a
// single shingle so two identical short questions still compare as equal.
//
// k=2 (character bigrams) is deliberate: information-dense CJK shifts every
// longer shingle on a one-word edit, so 3-4 grams badly under-score obvious
// restatements/rewordings in Traditional Chinese. Bigrams separate "same
// thing, reworded" from "different direction" cleanly in both zh and en.
export function shingles(text, k = 2) {
  const norm = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\p{P}\p{S}]/gu, '');
  const set = new Set();
  if (!norm) return set;
  if (norm.length < k) { set.add(norm); return set; }
  for (let i = 0; i + k <= norm.length; i++) set.add(norm.slice(i, i + k));
  return set;
}

// Jaccard overlap of two shingle sets: |A n B| / |A u B|, in [0, 1].
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

// Highest Jaccard similarity of `text` against any of the prior shingle sets.
// 0 when there are no priors (so the first item is never flagged a duplicate).
export function maxSimilarity(text, priorSets) {
  const s = shingles(text);
  let max = 0;
  for (const p of priorSets) max = Math.max(max, jaccard(s, p));
  return max;
}
