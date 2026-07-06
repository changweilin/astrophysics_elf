// Ingest the curated "List of X" / index pages (lib/seeds.mjs getListSeeds)
// as list-kind KG nodes with child edges to their linked items -- see
// lib/list-ingest.mjs for what this actually does and why it's a curated,
// capped set rather than "crawl every list Wikipedia has".
//
//   node crawl-lists.mjs           -- dry run, just prints the seed set
//   node crawl-lists.mjs --apply   -- actually fetches and ingests

import { openDb } from './lib/db.mjs';
import { getListSeeds } from './lib/seeds.mjs';
import { ingestListPage } from './lib/list-ingest.mjs';

const apply = process.argv.includes('--apply');
const db = openDb();

const langs = ['en', 'zh'];
const plan = langs.flatMap((lang) => getListSeeds(lang).map(([title, cap]) => ({ lang, title, cap })));

console.log(`${apply ? 'Ingesting' : 'Planned (dry run)'} ${plan.length} list pages:`);
for (const p of plan) console.log(`  [${p.lang}] "${p.title}" (cap ${p.cap} items)`);
if (!apply) {
  console.log('Re-run with --apply to actually fetch these from Wikipedia and ingest.');
  process.exit(0);
}

let added = 0;
let missing = 0;
let errors = 0;
let totalItems = 0;
for (const p of plan) {
  try {
    const r = await ingestListPage(db, p.lang, p.title, p.cap, { log: (m) => console.log(m) });
    if (r.status === 'missing') {
      missing++;
      console.log(`  [${p.lang}] "${p.title}" not found on Wikipedia, skipping`);
    } else {
      added++;
      totalItems += r.itemsLinked;
      console.log(`  [${p.lang}] "${r.title}" -> qid=${r.qid}, ${r.itemsLinked}/${r.itemsSeen} items linked, ${r.chunks} chunks`);
    }
  } catch (e) {
    errors++;
    console.log(`  ! [${p.lang}] "${p.title}" failed: ${e.message}`);
  }
}
console.log(`Done. added=${added} missing=${missing} errors=${errors} totalItemsLinked=${totalItems}`);
console.log('Run the normal graph-sync pass afterward (see wiki-kb README) to label the newly-linked item stubs.');
