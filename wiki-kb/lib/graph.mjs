// Knowledge graph built from Wikidata: every corpus page with a QID gets an
// entity row (labels, description, birth/death for people) and typed edges to
// other entities (advisor/student/influence chains for scientists; instance/
// part-of/parent-body relations for astronomical topics). Edge endpoints that
// fall outside the corpus are kept as labeled 'stub' entities so the graph
// stays walkable.

import { wdGetEntities } from './wiki-api.mjs';
import { now, logSync } from './db.mjs';
import { toTaiwan } from './zh-convert.mjs';

export const RELS = {
  // topics
  P31: 'instance of',
  P279: 'subclass of',
  P361: 'part of',
  P527: 'has part',
  P397: 'parent astronomical body',
  P398: 'child astronomical body',
  P59: 'constellation',
  P61: 'discoverer or inventor',
  // people
  P101: 'field of work',
  P106: 'occupation',
  P737: 'influenced by',
  P184: 'doctoral advisor',
  P185: 'doctoral student',
  P1066: 'student of',
  P802: 'student',
  P69: 'educated at',
  P108: 'employer',
  P166: 'award received',
  P800: 'notable work',
  P463: 'member of',
};

const HUMAN_QID = 'Q5';

function claimEntityIds(claims, prop) {
  return (claims?.[prop] ?? [])
    .map((st) => st?.mainsnak?.datavalue?.value?.id)
    .filter((id) => typeof id === 'string' && id.startsWith('Q'));
}

function claimTime(claims, prop) {
  const t = (claims?.[prop] ?? [])[0]?.mainsnak?.datavalue?.value?.time;
  return typeof t === 'string' ? t.replace(/^\+/, '').slice(0, 10) : null;
}

function pickLabel(labels, keys) {
  for (const k of keys) {
    if (labels?.[k]?.value) return labels[k].value;
  }
  return null;
}

// Sync entities + edges for corpus pages that have a QID but no full entity
// row yet. Returns counts. Batches of 50 (wbgetentities limit).
export async function syncEntities(db, { limit = 2000, log = () => {} } = {}) {
  const rows = db
    .prepare(
      `SELECT DISTINCT p.qid FROM pages p
       LEFT JOIN entities e ON e.qid = p.qid
       WHERE p.qid IS NOT NULL AND p.status='active'
         AND (e.qid IS NULL OR e.kind='stub')
       LIMIT ?`
    )
    .all(limit)
    .map((r) => r.qid);

  const insEntity = db.prepare(
    `INSERT INTO entities(qid,kind,label_en,label_zh,description,birth,death,claims,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(qid) DO UPDATE SET kind=excluded.kind, label_en=excluded.label_en,
       label_zh=excluded.label_zh, description=excluded.description,
       birth=excluded.birth, death=excluded.death, claims=excluded.claims,
       updated_at=excluded.updated_at`
  );
  const insEdge = db.prepare(
    `INSERT INTO edges(src,rel,rel_label,dst,source,updated_at) VALUES(?,?,?,?,'wikidata',?)
     ON CONFLICT(src,rel,dst) DO UPDATE SET updated_at=excluded.updated_at`
  );

  let entities = 0;
  let edges = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    let ents;
    try {
      ents = await wdGetEntities(batch);
    } catch (e) {
      log(`  ! wikidata batch failed: ${e.message}`);
      continue;
    }
    const ts = now();
    for (const qid of batch) {
      const ent = ents[qid];
      if (!ent || ent.missing !== undefined) continue;
      const claims = ent.claims ?? {};
      const isHuman = claimEntityIds(claims, 'P31').includes(HUMAN_QID);
      const kind = isHuman ? 'person' : 'topic';
      const kept = {};
      for (const prop of Object.keys(RELS)) {
        const ids = claimEntityIds(claims, prop);
        if (ids.length) kept[prop] = ids;
      }
      insEntity.run(
        qid,
        kind,
        pickLabel(ent.labels, ['en']),
        toTaiwan(pickLabel(ent.labels, ['zh-tw', 'zh'])),
        toTaiwan(pickLabel(ent.descriptions, ['en', 'zh-tw', 'zh'])),
        isHuman ? claimTime(claims, 'P569') : null,
        isHuman ? claimTime(claims, 'P570') : null,
        JSON.stringify(kept),
        ts
      );
      entities++;
      for (const [prop, ids] of Object.entries(kept)) {
        for (const dst of ids) {
          insEdge.run(qid, prop, RELS[prop], dst, ts);
          edges++;
        }
      }
      if (isHuman) {
        db.prepare("UPDATE pages SET kind='scientist' WHERE qid=? AND kind='topic'").run(qid);
      }
    }
    log(`  entities ${Math.min(i + 50, rows.length)}/${rows.length}`);
  }

  const stubs = await labelStubs(db, { log });
  if (entities || edges) {
    logSync(db, 'graph-sync', null, null, `entities=${entities} edges=${edges} stubs=${stubs}`);
  }
  return { entities, edges, stubs };
}

// Give edge endpoints outside the corpus a label so graph output is readable.
async function labelStubs(db, { limit = 3000, log = () => {} } = {}) {
  const unknown = db
    .prepare(
      `SELECT DISTINCT e.dst AS qid FROM edges e
       LEFT JOIN entities x ON x.qid = e.dst
       WHERE x.qid IS NULL LIMIT ?`
    )
    .all(limit)
    .map((r) => r.qid);
  const ins = db.prepare(
    `INSERT OR IGNORE INTO entities(qid,kind,label_en,label_zh,updated_at)
     VALUES(?,'stub',?,?,?)`
  );
  let n = 0;
  for (let i = 0; i < unknown.length; i += 50) {
    const batch = unknown.slice(i, i + 50);
    let ents;
    try {
      ents = await wdGetEntities(batch, { props: 'labels' });
    } catch (e) {
      log(`  ! stub labels failed: ${e.message}`);
      continue;
    }
    const ts = now();
    for (const qid of batch) {
      const ent = ents[qid];
      ins.run(
        qid,
        ent ? pickLabel(ent.labels, ['en']) : null,
        ent ? toTaiwan(pickLabel(ent.labels, ['zh-tw', 'zh'])) : null,
        ts
      );
      n++;
    }
  }
  return n;
}

export function getEntity(db, qid) {
  const entity = db.prepare('SELECT * FROM entities WHERE qid=?').get(qid);
  if (!entity) return null;
  const out = db
    .prepare(
      `SELECT e.rel, e.rel_label, e.dst, x.label_en, x.label_zh, x.kind
       FROM edges e LEFT JOIN entities x ON x.qid = e.dst WHERE e.src=?`
    )
    .all(qid);
  const inbound = db
    .prepare(
      `SELECT e.rel, e.rel_label, e.src, x.label_en, x.label_zh, x.kind
       FROM edges e LEFT JOIN entities x ON x.qid = e.src WHERE e.dst=?`
    )
    .all(qid);
  const pages = db
    .prepare("SELECT id, lang, title, url, kind, source FROM pages WHERE qid=? AND status='active'")
    .all(qid);
  return { entity, out, in: inbound, pages };
}

// A hop-1 node can be a "list of X" page with hundreds of members; a plain
// BFS at depth=2 would let a handful of those flood the subgraph with
// low-value stubs in whatever order SQLite happens to return them. Instead,
// hop 1 (the root's immediate neighborhood) is taken in full as before, but
// hop 2 candidates are gathered first and only the best-connected ones are
// kept -- the rest are simply left off this render (still reachable by
// re-centering on them directly).
const HOP2_MAX_NEW = 40;

// Breadth-first neighborhood, both edge directions, capped for sane payloads.
export function subgraph(db, qid, depth = 1, maxNodes = 150) {
  const nodes = new Map();
  const edges = [];
  const seen = new Set([qid]);
  const nodeStmt = db.prepare('SELECT qid, kind, label_en, label_zh FROM entities WHERE qid=?');
  const outStmt = db.prepare('SELECT src, rel, rel_label, dst FROM edges WHERE src=?');
  const inStmt = db.prepare('SELECT src, rel, rel_label, dst FROM edges WHERE dst=?');
  const degreeStmt = db.prepare(
    'SELECT (SELECT COUNT(*) FROM edges WHERE src=?) + (SELECT COUNT(*) FROM edges WHERE dst=?) AS n'
  );
  // Per-language content status (for the reader-facing translated/generated/
  // untranslated/ungenerated markers, see kg-view.js contentState()).
  const pagesStmt = db.prepare("SELECT lang, source FROM pages WHERE qid=? AND status='active'");

  const addNode = (id) => {
    if (!nodes.has(id)) {
      const base = nodeStmt.get(id) ?? { qid: id, kind: 'unknown' };
      nodes.set(id, { ...base, pages: pagesStmt.all(id) });
    }
  };
  addNode(qid);

  // Hop 1: root's immediate neighborhood, unconditionally (historical depth=1
  // behavior, unchanged).
  let frontier = [qid];
  {
    const next = [];
    for (const cur of frontier) {
      for (const e of [...outStmt.all(cur), ...inStmt.all(cur)]) {
        if (nodes.size >= maxNodes) break;
        edges.push(e);
        for (const id of [e.src, e.dst]) {
          addNode(id);
          if (!seen.has(id)) {
            seen.add(id);
            next.push(id);
          }
        }
      }
    }
    frontier = next;
  }

  // Hop 2 (depth>=2 only): rank genuinely-new nodes by total degree; edges
  // that only cross-link already-included hop-1 nodes are free (they cost no
  // node budget) and always kept.
  if (depth >= 2 && frontier.length && nodes.size < maxNodes) {
    const candidateEdgesByNode = new Map();
    const crossLinks = [];
    for (const cur of frontier) {
      for (const e of [...outStmt.all(cur), ...inStmt.all(cur)]) {
        const newIds = [e.src, e.dst].filter((id) => !seen.has(id));
        if (!newIds.length) { crossLinks.push(e); continue; }
        for (const id of newIds) {
          if (!candidateEdgesByNode.has(id)) candidateEdgesByNode.set(id, []);
          candidateEdgesByNode.get(id).push(e);
        }
      }
    }
    edges.push(...crossLinks);
    const ranked = [...candidateEdgesByNode.keys()]
      .map((id) => ({ id, degree: degreeStmt.get(id, id).n }))
      .sort((a, b) => b.degree - a.degree);
    const budget = Math.max(0, Math.min(HOP2_MAX_NEW, maxNodes - nodes.size));
    for (const { id } of ranked.slice(0, budget)) {
      addNode(id);
      seen.add(id);
      edges.push(...candidateEdgesByNode.get(id));
    }
  }

  // de-duplicate edges collected from both directions
  const key = (e) => `${e.src}|${e.rel}|${e.dst}`;
  const uniq = [...new Map(edges.map((e) => [key(e), e])).values()];
  return { root: qid, nodes: [...nodes.values()], edges: uniq };
}
