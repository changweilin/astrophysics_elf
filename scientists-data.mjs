// Static public roster for the demo pages -- lets the scientist list and
// introductions render WITHOUT the LLM backend running.
//
// The backend persona registry (scientists-backend/personas/scientists.mjs)
// stays the single source of truth. It is dependency-free ESM, so the browser
// imports it directly and strips the backend-only prompt-engineering fields
// (persona / style / topics) -- the result matches what /api/scientists
// serves (see listScientists() there), so the scientists page can seed its
// roster from this and let the live API overwrite it when the backend is up.
//
// SCIENTIST_KG is a frontend-only concern (same idea as library-terms.js):
// it maps each scientist onto the wiki-kb knowledge graph. `qid` is the
// Wikidata id of an entity already crawled in kb.sqlite (verified
// 2026-07-16); entries with only `q` are not crawled yet and fall back to a
// label search, so the graph link still works before a crawl.

import { SCIENTISTS, STARTERS } from './scientists-backend/personas/scientists.mjs';

export const SCIENTIST_KG = {
  einstein: { qid: 'Q937' },
  feynman: { q: 'Richard Feynman' },
  newton: { qid: 'Q935' },
  galileo: { qid: 'Q307' },
  kepler: { qid: 'Q8963' },
  copernicus: { q: 'Nicolaus Copernicus' },
  hubble: { qid: 'Q43027' },
  hawking: { qid: 'Q17714' },
  chandrasekhar: { qid: 'Q148109' },
  sagan: { qid: 'Q410' },
  rubin: { qid: 'Q234888' },
  noether: { q: 'Emmy Noether' },
  leavitt: { qid: 'Q110181' },
  lemaitre: { qid: 'Q12998' },
  thorne: { qid: 'Q323320' },
  bell: { qid: 'Q233974' },
  halley: { qid: 'Q47434' },
  herschel: { qid: 'Q14277' },
  maxwell: { qid: 'Q9095' },
  cannon: { qid: 'Q230650' },
  zwicky: { qid: 'Q115462' },
  johnson: { q: 'Katherine Johnson' },
};

export const SCIENTISTS_PUBLIC = SCIENTISTS.map(({ persona, style, topics, ...pub }) => ({
  ...pub,
  kg: SCIENTIST_KG[pub.id] || null,
  starters: STARTERS[pub.id] || null,
}));

// Browser global for the non-module pages (scientists.jsx runs through
// in-browser Babel, not as a module). Harmless side effect under Node.
globalThis.KN_SCIENTISTS = SCIENTISTS_PUBLIC;
