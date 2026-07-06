// One-off maintenance pass: repair zh page titles that were stored in
// Simplified Chinese because action=query's `title` field is not run through
// the LanguageConverter even when variant=zh-tw is requested -- only content
// props like `extract` are converted (see lib/wiki-api.mjs fetchDisplayTitle,
// confirmed empirically against zh.wikipedia.org). Content is unaffected;
// only the `pages.title` column needs correcting.
//
// Checks every active zh page's title against the API's zh-tw-converted
// displaytitle and renames on mismatch. Idempotent -- safe to re-run.
//
//   node fix-zh-titles.mjs           -- dry run, prints planned renames
//   node fix-zh-titles.mjs --apply   -- actually renames

import { openDb, renamePageTitle, logSync } from './lib/db.mjs';
import { fetchDisplayTitle } from './lib/wiki-api.mjs';

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const db = openDb();

const allRows = db
  .prepare("SELECT id, title FROM pages WHERE lang='zh' AND status='active' ORDER BY id")
  .all();
const rows = Number.isFinite(limit) ? allRows.slice(0, limit) : allRows;

console.log(`Checking ${rows.length} active zh page titles${apply ? ' (applying renames)' : ' (dry run)'}...`);

let checked = 0;
let changed = 0;
let collisions = 0;
let errors = 0;

for (const row of rows) {
  checked++;
  try {
    const converted = await fetchDisplayTitle('zh', row.title);
    if (!converted || converted === row.title) continue;
    changed++;
    if (apply) {
      const r = renamePageTitle(db, row.id, converted);
      if (r.ok) {
        logSync(db, 'zh-title-fix', 'zh', converted, `was="${row.title}" pageId=${row.id}`);
        console.log(`  [${row.id}] "${row.title}" -> "${converted}"`);
      } else {
        collisions++;
        console.log(`  [${row.id}] SKIP (${r.reason}, existingId=${r.existingId}): "${row.title}" -> "${converted}"`);
      }
    } else {
      console.log(`  [${row.id}] "${row.title}" -> "${converted}"`);
    }
  } catch (e) {
    errors++;
    console.log(`  [${row.id}] ! error for "${row.title}": ${e.message}`);
  }
  if (checked % 500 === 0) {
    console.log(`-- progress: ${checked}/${rows.length} checked, ${changed} need fixing, ${collisions} collisions, ${errors} errors --`);
  }
}

console.log(`Done. checked=${checked} changed=${changed} collisions=${collisions} errors=${errors}`);
if (!apply && changed) console.log('Re-run with --apply to write these renames.');
