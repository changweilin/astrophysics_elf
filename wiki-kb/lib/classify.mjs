// Classification tree for knowledge-graph root nodes (entities), built ONLY
// from data already in the local DB -- no extra network calls, no LLM. Two
// signals, matching the two tag kinds already sitting here:
//   - "subject" tags: the Wikidata ontology this app already crawls into
//     edges (P31 instance-of / P279 subclass-of for topics, P106 occupation /
//     P101 field-of-work for people -- see lib/graph.mjs RELS).
//   - "content" tags: the raw Wikipedia categories already crawled per page
//     (page_categories -- see lib/ingest.mjs).
//
// The bucket list below mirrors this app's own crawl seeds (lib/seeds.mjs),
// so a node lands in the subject bucket that seeded its own corner of the
// corpus, rather than a generic taxonomy invented from scratch.

const TOPIC_BUCKETS = [
  { path: 'astrophysics/black-holes', re: /black.?holes?|黑洞/i },
  { path: 'astrophysics/general-relativity', re: /general relativity|(?<!special )relativity|廣義相對論|广义相对论|相對論|相对论/i },
  { path: 'astrophysics/gravitational-waves', re: /gravitational.?waves?|引力波|重力波/i },
  { path: 'astrophysics/cosmology', re: /cosmolog|宇宙學|宇宙学/i },
  { path: 'astrophysics/astroparticle-physics', re: /astroparticle|\bneutrinos?\b|dark matter|dark energy|微中子|中微子|暗物質|暗物质|暗能量/i },
  { path: 'astronomy/stars', re: /\bstars?\b|stellar|恆星|恒星/i },
  { path: 'astronomy/galaxies', re: /galax|星系/i },
  { path: 'astronomy/exoplanets-and-planetary-science', re: /exoplanets?|planetary science|系外行星|太陽系外行星|太阳系外行星|行星科學|行星科学/i },
  { path: 'astronomy/celestial-mechanics', re: /celestial mechanics|天體力學|天体力学/i },
  { path: 'astronomy/astrochemistry-and-astrobiology', re: /astrochemistry|astrobiology|天體化學|天体化学|天體生物學|天体生物学/i },
  { path: 'astronomy/general', re: /astronom|space science|天文學|天文学|空間科學|空间科学/i },
  { path: 'history-of-science', re: /history of (astronomy|physics|science)|天文學史|天文学史|物理學史|物理学史|科學史|科学史/i },
];

const PEOPLE_BUCKETS = [
  { path: 'people/astronomers', re: /astronomers?|天文學家|天文学家/i },
  { path: 'people/astrophysicists', re: /astrophysicists?|天體物理學家|天体物理学家/i },
  { path: 'people/cosmologists', re: /cosmologists?|宇宙學家|宇宙学家/i },
  { path: 'people/physicists', re: /physicists?|物理學家|物理学家/i },
  { path: 'people/mathematicians', re: /mathematicians?|數學家|数学家/i },
];

// Human-readable tree shape for the frontend (label pair per node). Keys must
// match the `path` values above (leaf) and their prefixes (groups).
export const CATEGORY_TREE = [
  {
    key: 'astrophysics', label: { en: 'Astrophysics & Cosmology', zh: '天體物理與宇宙學' },
    children: [
      { key: 'astrophysics/black-holes', label: { en: 'Black Holes', zh: '黑洞' } },
      { key: 'astrophysics/general-relativity', label: { en: 'General Relativity', zh: '廣義相對論' } },
      { key: 'astrophysics/gravitational-waves', label: { en: 'Gravitational Waves', zh: '引力波' } },
      { key: 'astrophysics/cosmology', label: { en: 'Cosmology', zh: '宇宙學' } },
      { key: 'astrophysics/astroparticle-physics', label: { en: 'Astroparticle Physics', zh: '天體粒子物理學' } },
    ],
  },
  {
    key: 'astronomy', label: { en: 'Astronomy', zh: '天文學' },
    children: [
      { key: 'astronomy/stars', label: { en: 'Stars', zh: '恆星' } },
      { key: 'astronomy/galaxies', label: { en: 'Galaxies', zh: '星系' } },
      { key: 'astronomy/exoplanets-and-planetary-science', label: { en: 'Exoplanets & Planetary Science', zh: '系外行星與行星科學' } },
      { key: 'astronomy/celestial-mechanics', label: { en: 'Celestial Mechanics', zh: '天體力學' } },
      { key: 'astronomy/astrochemistry-and-astrobiology', label: { en: 'Astrochemistry & Astrobiology', zh: '天體化學與天體生物學' } },
      { key: 'astronomy/general', label: { en: 'General Astronomy', zh: '天文學總論' } },
    ],
  },
  {
    key: 'people', label: { en: 'People', zh: '人物' },
    children: [
      { key: 'people/astronomers', label: { en: 'Astronomers', zh: '天文學家' } },
      { key: 'people/astrophysicists', label: { en: 'Astrophysicists', zh: '天體物理學家' } },
      { key: 'people/cosmologists', label: { en: 'Cosmologists', zh: '宇宙學家' } },
      { key: 'people/physicists', label: { en: 'Physicists', zh: '物理學家' } },
      { key: 'people/mathematicians', label: { en: 'Mathematicians', zh: '數學家' } },
      { key: 'people/other', label: { en: 'Other people', zh: '其他人物' } },
    ],
  },
  { key: 'history-of-science', label: { en: 'History of Science', zh: '科學史' } },
  { key: 'other', label: { en: 'Other / Uncategorized', zh: '其他 / 未分類' } },
];

// Human-readable label for a category key (leaf or group), for prompt context
// and admin UI use. Falls back to the raw key if the tree doesn't have it.
export function categoryLabel(key, lang = 'en') {
  if (!key) return null;
  for (const node of CATEGORY_TREE) {
    if (node.key === key) return node.label[lang] || node.label.en;
    for (const child of node.children || []) {
      if (child.key === key) return child.label[lang] || child.label.en;
    }
  }
  return key;
}

function isPersonKind(kind) {
  return kind === 'person' || kind === 'scientist';
}

// Concatenate every locally-known text signal for one entity: its own label/
// description, every active page's crawled Wikipedia categories, and the
// labels of whatever it's linked to via the ontology relations relevant to
// its kind (occupation/field-of-work for people, instance-of/subclass-of for
// everything else).
function buildSignalText(db, entity, stmts) {
  const parts = [entity.label_en, entity.label_zh, entity.description].filter(Boolean);

  const pageIds = stmts.pagesForQid.all(entity.qid).map((r) => r.id);
  for (const pid of pageIds) {
    for (const row of stmts.categoriesForPage.all(pid)) parts.push(row.category);
  }

  const rels = isPersonKind(entity.kind) ? ['P106', 'P101'] : ['P31', 'P279'];
  for (const rel of rels) {
    for (const e of stmts.edgesForRel.all(entity.qid, rel)) {
      if (e.rel_label) parts.push(e.rel_label);
      const dst = stmts.entityByQid.get(e.dst);
      if (dst) { if (dst.label_en) parts.push(dst.label_en); if (dst.label_zh) parts.push(dst.label_zh); }
    }
  }
  return parts.join(' | ');
}

// First bucket (in priority order) whose regex matches anywhere in the
// signal text, searching only the bucket list appropriate to its kind. Falls
// back to 'people/other' / 'other' when nothing matches.
//
// This is priority order, NOT highest-match-count: a page about a specific
// stellar-mass black hole legitimately carries broad categories like "Stars"
// or "Stellar evolution" alongside "Black holes" -- counting raw hits would
// let the broad, high-frequency bucket (stars/galaxies) outvote and dilute
// the narrow, specific one (black holes) that this app's own domain cares
// about most. TOPIC_BUCKETS/PEOPLE_BUCKETS are ordered narrow-to-broad on
// purpose; first match wins.
export function classifyEntity(db, entity, stmts) {
  const signal = buildSignalText(db, entity, stmts);
  const buckets = isPersonKind(entity.kind) ? PEOPLE_BUCKETS : TOPIC_BUCKETS;
  for (const b of buckets) {
    if (b.re.test(signal)) return b.path;
  }
  return isPersonKind(entity.kind) ? 'people/other' : 'other';
}

// Prepared statements classifyEntity() needs -- factored out so a caller that
// only has ONE entity to classify (e.g. a stub picked up by /api/entity/
// generate, which never gets a batch-classified `category` since
// classifyEntities() only runs on non-stub rows) doesn't have to duplicate
// this shape itself.
export function buildClassifyStmts(db) {
  return {
    pagesForQid: db.prepare("SELECT id FROM pages WHERE qid=? AND status='active'"),
    categoriesForPage: db.prepare('SELECT category FROM page_categories WHERE page_id=?'),
    edgesForRel: db.prepare('SELECT rel_label, dst FROM edges WHERE src=? AND rel=?'),
    entityByQid: db.prepare('SELECT label_en, label_zh FROM entities WHERE qid=?'),
  };
}

// Batch-classify every non-stub entity missing a category (or all of them,
// with `force`). Mirrors syncEntities' batch style in lib/graph.mjs so it
// slots into the same crawl pipeline (see crawl.mjs).
export function classifyEntities(db, { limit = Infinity, force = false, log = () => {} } = {}) {
  const stmts = buildClassifyStmts(db);
  const where = force ? "kind != 'stub'" : "kind != 'stub' AND category IS NULL";
  const rows = db.prepare(`SELECT qid, kind, label_en, label_zh, description FROM entities WHERE ${where} LIMIT ?`)
    .all(Number.isFinite(limit) ? limit : 1e9);
  const update = db.prepare('UPDATE entities SET category=? WHERE qid=?');
  let n = 0;
  for (const entity of rows) {
    update.run(classifyEntity(db, entity, stmts), entity.qid);
    n++;
    if (n % 2000 === 0) log(`  classified ${n}/${rows.length}`);
  }
  return { classified: n };
}

// Counts per leaf bucket (for rendering the tree with numbers). Only counts
// non-stub entities, matching listEntities' default visibility.
export function categoryCounts(db) {
  const rows = db.prepare("SELECT category, COUNT(*) n FROM entities WHERE kind!='stub' AND category IS NOT NULL GROUP BY category").all();
  const byKey = new Map(rows.map((r) => [r.category, r.n]));
  return byKey;
}
