// CJK-aware tokenization for the FTS index, and the query form that matches it.
//
// Lifted out of db.mjs unchanged so the pure string work has no `node:sqlite`
// import behind it: retrieve.mjs and the MMR pass need the same tokenizer the
// index was built with, and CI runs its logic tests on a Node where
// `node:sqlite` is still flag-gated.

// FTS5's unicode61 keeps a CJK run as a single token, which makes Chinese/
// Japanese/Korean text unsearchable. We index a pre-tokenized form instead:
// latin/digit words are kept whole (lowercased) and every CJK run is expanded
// into overlapping character bigrams. Queries go through the same transform.
const TOKEN_RE =
  /([A-Za-z0-9][A-Za-z0-9+.\-]*)|([぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿가-힯]+)/g;

export function cjkTokenize(text) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m[1]) {
      out.push(m[1].toLowerCase());
    } else {
      const run = m[2];
      if (run.length === 1) out.push(run);
      else for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
    }
  }
  return out;
}

export function ftsText(text) {
  return cjkTokenize(text).join(' ');
}

// OR-of-tokens keeps recall high; BM25 ranking sorts the rest out.
export function ftsQuery(text, maxTokens = 32) {
  const toks = [...new Set(cjkTokenize(text))].slice(0, maxTokens);
  return toks.map((t) => `"${t.replaceAll('"', '')}"`).join(' OR ');
}
