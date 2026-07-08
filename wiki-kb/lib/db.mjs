// SQLite storage for the wiki knowledge base (node:sqlite, zero dependencies).
//
// One database file holds pages, chunks (+ FTS5 index + embedding BLOBs), the
// Wikidata-backed knowledge graph (entities/edges), the crawl queue, and the
// sync log. All timestamps are ISO-8601 UTC strings; deletes are soft by
// default (status='deleted') so CRUD history stays auditable.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config.mjs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS pages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lang TEXT NOT NULL,
  pageid INTEGER,
  title TEXT NOT NULL,
  qid TEXT,
  kind TEXT NOT NULL DEFAULT 'topic',
  url TEXT,
  summary TEXT,
  content TEXT,
  rev_id INTEGER,
  rev_time TEXT,
  crawled_at TEXT,
  updated_at TEXT,
  source TEXT NOT NULL DEFAULT 'wikipedia',
  license TEXT NOT NULL DEFAULT 'CC BY-SA 4.0',
  status TEXT NOT NULL DEFAULT 'active',
  source_lang TEXT,
  UNIQUE(lang, title)
);
CREATE INDEX IF NOT EXISTS idx_pages_qid ON pages(qid);
CREATE INDEX IF NOT EXISTS idx_pages_lang_status ON pages(lang, status);
CREATE TABLE IF NOT EXISTS page_categories(
  page_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  PRIMARY KEY(page_id, category)
);
CREATE TABLE IF NOT EXISTS chunks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  section TEXT,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  embedding BLOB,
  embed_model TEXT,
  embed_dim INTEGER,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks(page_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(tok);
CREATE TABLE IF NOT EXISTS entities(
  qid TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'stub',
  label_en TEXT,
  label_zh TEXT,
  description TEXT,
  birth TEXT,
  death TEXT,
  claims TEXT,
  category TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS edges(
  src TEXT NOT NULL,
  rel TEXT NOT NULL,
  rel_label TEXT,
  dst TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'wikidata',
  updated_at TEXT,
  PRIMARY KEY(src, rel, dst)
);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst);
CREATE TABLE IF NOT EXISTS crawl_queue(
  lang TEXT NOT NULL,
  title TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  added_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  detail TEXT,
  PRIMARY KEY(lang, title)
);
CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status, lang);
CREATE TABLE IF NOT EXISTS sync_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  lang TEXT,
  title TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS traces(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT,
  model TEXT,
  input TEXT,
  output TEXT,
  ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  ok INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_traces_kind_ts ON traces(kind, ts);
CREATE TABLE IF NOT EXISTS eval_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  mode TEXT NOT NULL,
  judge_model TEXT,
  answer_model TEXT,
  k INTEGER,
  graph INTEGER NOT NULL DEFAULT 1,
  cases INTEGER NOT NULL DEFAULT 0,
  metrics TEXT
);
CREATE TABLE IF NOT EXISTS eval_cases(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  case_id TEXT,
  lang TEXT,
  question TEXT,
  ground_truth TEXT,
  answer TEXT,
  contexts TEXT,
  metrics TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_eval_cases_run ON eval_cases(run_id);
`;

export function openDb(dbPath = config.dbPath) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// `CREATE TABLE IF NOT EXISTS` only helps on a fresh database -- an existing
// pages table (the crawled corpus) needs its new column added explicitly.
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(pages)').all().map((c) => c.name);
  if (!cols.includes('source_lang')) {
    db.exec('ALTER TABLE pages ADD COLUMN source_lang TEXT');
  }
  const entityCols = db.prepare('PRAGMA table_info(entities)').all().map((c) => c.name);
  if (!entityCols.includes('category')) {
    db.exec('ALTER TABLE entities ADD COLUMN category TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_entities_category ON entities(category)');
}

export const now = () => new Date().toISOString();
export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// --- CJK-aware tokenization for the FTS index -------------------------------
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

// --- pages -------------------------------------------------------------------

export function getPageByTitle(db, lang, title) {
  return db.prepare('SELECT * FROM pages WHERE lang=? AND title=?').get(lang, title);
}
export function getPageById(db, id) {
  return db.prepare('SELECT * FROM pages WHERE id=?').get(id);
}

export function upsertPage(db, p) {
  const ts = now();
  const existing = db
    .prepare('SELECT id FROM pages WHERE lang=? AND title=?')
    .get(p.lang, p.title);
  if (existing) {
    db.prepare(
      `UPDATE pages SET pageid=?, qid=COALESCE(?,qid), kind=COALESCE(?,kind),
         url=COALESCE(?,url), summary=COALESCE(?,summary), content=COALESCE(?,content),
         rev_id=?, rev_time=?, source=COALESCE(?,source), source_lang=COALESCE(?,source_lang),
         updated_at=?, status='active'
       WHERE id=?`
    ).run(
      p.pageid ?? null, p.qid ?? null, p.kind ?? null, p.url ?? null,
      p.summary ?? null, p.content ?? null, p.revId ?? null, p.revTime ?? null,
      p.source ?? null, p.sourceLang ?? null, ts, existing.id
    );
    return existing.id;
  }
  const r = db.prepare(
    `INSERT INTO pages(lang,pageid,title,qid,kind,url,summary,content,rev_id,rev_time,crawled_at,updated_at,source,source_lang)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    p.lang, p.pageid ?? null, p.title, p.qid ?? null, p.kind ?? 'topic',
    p.url ?? null, p.summary ?? null, p.content ?? null, p.revId ?? null,
    p.revTime ?? null, ts, ts, p.source ?? 'wikipedia', p.sourceLang ?? null
  );
  return Number(r.lastInsertRowid);
}

export function setPageCategories(db, pageId, categories) {
  db.prepare('DELETE FROM page_categories WHERE page_id=?').run(pageId);
  const ins = db.prepare(
    'INSERT OR IGNORE INTO page_categories(page_id,category) VALUES(?,?)'
  );
  for (const c of categories || []) ins.run(pageId, c);
}

// Column names the admin UI is allowed to sort by, mapped to a safe SQL
// ORDER BY expression (a fixed whitelist, not user input, so this stays
// injection-safe even though it's string-interpolated below).
const PAGE_SORT_COLUMNS = {
  id: 'id', lang: 'lang', title: 'title', kind: 'kind', qid: 'qid',
  source: 'source', updated_at: 'updated_at', rev_time: 'rev_time',
  chunks: 'chunks', contentChars: 'contentChars',
};

// Browse/filter pages for the admin UI. Returns { total, rows } (rows carry
// contentChars instead of the full text so listings stay light).
export function listPages(db, { lang, kind, status = 'active', q, limit = 50, offset = 0, sort, dir } = {}) {
  const filters = [];
  const args = [];
  if (status && status !== 'all') { filters.push('status=?'); args.push(status); }
  if (lang) { filters.push('lang=?'); args.push(lang); }
  if (kind) { filters.push('kind=?'); args.push(kind); }
  if (q) { filters.push('title LIKE ?'); args.push(`%${q}%`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM pages ${where}`).get(...args).n;
  const sortCol = PAGE_SORT_COLUMNS[sort] || 'updated_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(
      `SELECT id, lang, title, qid, kind, url, source, status, rev_time, updated_at,
              LENGTH(COALESCE(content,'')) AS contentChars,
              (SELECT COUNT(*) FROM chunks c WHERE c.page_id = pages.id) AS chunks
       FROM pages ${where} ORDER BY ${sortCol} ${sortDir}, id LIMIT ? OFFSET ?`
    )
    .all(...args, Math.max(1, Math.min(500, limit)), Math.max(0, offset));
  return { total, rows };
}

// Column names the library page's KG root-node list is allowed to sort by,
// mapped to a safe SQL ORDER BY expression (a fixed whitelist, not user
// input, so this stays injection-safe even though it's string-interpolated
// below). 'degree' is the link-count the sidebar shows next to each node.
const ENTITY_SORT_COLUMNS = {
  degree: 'degree', label_en: 'e.label_en', label_zh: 'e.label_zh',
  kind: 'e.kind', qid: 'e.qid',
};

// Browse/search knowledge-graph entities, busiest (highest degree) first by
// default; `sort`/`dir` let the caller re-order by link count, name, or kind
// (forward/reverse) instead.
export function listEntities(db, { q, kind, category, limit = 50, sort, dir } = {}) {
  const filters = [];
  const args = [];
  if (kind) { filters.push('e.kind=?'); args.push(kind); }
  else { filters.push("e.kind != 'stub'"); }
  if (q) {
    filters.push('(e.label_en LIKE ? OR e.label_zh LIKE ? OR e.qid = ?)');
    args.push(`%${q}%`, `%${q}%`, q);
  }
  // A leaf key ('astronomy/stars') matches itself exactly; a group key
  // ('astronomy') matches every leaf nested under it via the '/' prefix.
  if (category) {
    filters.push('(e.category = ? OR e.category LIKE ?)');
    args.push(category, `${category}/%`);
  }
  const where = `WHERE ${filters.join(' AND ')}`;
  const sortCol = ENTITY_SORT_COLUMNS[sort] || 'degree';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(
      `SELECT e.qid, e.kind, e.label_en, e.label_zh, e.description, e.birth, e.death, e.category,
              (SELECT COUNT(*) FROM edges x WHERE x.src = e.qid OR x.dst = e.qid) AS degree
       FROM entities e ${where} ORDER BY ${sortCol} ${sortDir}, e.qid LIMIT ?`
    )
    .all(...args, Math.max(1, Math.min(300, limit)));

  // Attach per-language content status (source: wikipedia/llm-translation/
  // llm-generated/...) so the browse list can show the same translated/
  // generated/untranslated/ungenerated markers as the canvas graph.
  if (rows.length) {
    const placeholders = rows.map(() => '?').join(',');
    const pageRows = db
      .prepare(`SELECT qid, lang, source FROM pages WHERE status='active' AND qid IN (${placeholders})`)
      .all(...rows.map((r) => r.qid));
    const byQid = new Map();
    for (const pr of pageRows) {
      if (!byQid.has(pr.qid)) byQid.set(pr.qid, []);
      byQid.get(pr.qid).push({ lang: pr.lang, source: pr.source });
    }
    for (const r of rows) r.pages = byQid.get(r.qid) || [];
  }
  return rows;
}

// Manual (admin/user) entity upsert. Without a qid a collision-free local id is
// minted with a 'KN' prefix so it can never shadow a Wikidata Q-number.
export function upsertManualEntity(db, { qid, kind = 'topic', label_en, label_zh, description } = {}) {
  const id = qid && String(qid).trim()
    ? String(qid).trim()
    : `KN${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  db.prepare(
    `INSERT INTO entities(qid,kind,label_en,label_zh,description,updated_at)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(qid) DO UPDATE SET
       kind=excluded.kind,
       label_en=COALESCE(excluded.label_en,label_en),
       label_zh=COALESCE(excluded.label_zh,label_zh),
       description=COALESCE(excluded.description,description),
       updated_at=excluded.updated_at`
  ).run(id, kind, label_en ?? null, label_zh ?? null, description ?? null, now());
  return db.prepare('SELECT * FROM entities WHERE qid=?').get(id);
}

export function addEdge(db, src, rel, relLabel, dst, source = 'manual') {
  db.prepare(
    `INSERT INTO edges(src,rel,rel_label,dst,source,updated_at) VALUES(?,?,?,?,?,?)
     ON CONFLICT(src,rel,dst) DO UPDATE SET rel_label=excluded.rel_label, updated_at=excluded.updated_at`
  ).run(src, rel, relLabel ?? rel, dst, source, now());
}

export function removeEdge(db, src, rel, dst) {
  return db.prepare('DELETE FROM edges WHERE src=? AND rel=? AND dst=?').run(src, rel, dst).changes;
}

export function recentLog(db, limit = 100) {
  return db
    .prepare('SELECT ts, kind, lang, title, detail FROM sync_log ORDER BY id DESC LIMIT ?')
    .all(Math.max(1, Math.min(500, limit)));
}

export function getPageCategories(db, pageId) {
  return db
    .prepare('SELECT category FROM page_categories WHERE page_id=? ORDER BY category')
    .all(pageId)
    .map((r) => r.category);
}

// Replace a page's chunks; embeddings survive for chunks whose text is
// unchanged (matched by content hash), so an article edit only re-embeds the
// paragraphs that actually changed.
export function replaceChunks(db, pageId, pieces) {
  const old = db
    .prepare('SELECT id, text_hash, embedding, embed_model, embed_dim FROM chunks WHERE page_id=?')
    .all(pageId);
  const byHash = new Map(old.map((c) => [c.text_hash, c]));
  const delFts = db.prepare('DELETE FROM chunks_fts WHERE rowid=?');
  for (const c of old) delFts.run(c.id);
  db.prepare('DELETE FROM chunks WHERE page_id=?').run(pageId);

  const ins = db.prepare(
    `INSERT INTO chunks(page_id,seq,section,text,text_hash,embedding,embed_model,embed_dim,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)`
  );
  const insFts = db.prepare('INSERT INTO chunks_fts(rowid, tok) VALUES(?,?)');
  const ts = now();
  let kept = 0;
  pieces.forEach((p, i) => {
    const hash = sha256(p.text);
    const prev = byHash.get(hash);
    if (prev && prev.embedding) kept++;
    const r = ins.run(
      pageId, i, p.section ?? null, p.text, hash,
      prev?.embedding ?? null, prev?.embed_model ?? null, prev?.embed_dim ?? null, ts
    );
    insFts.run(
      Number(r.lastInsertRowid),
      ftsText(`${p.section ? p.section + ' ' : ''}${p.text}`)
    );
  });
  return { total: pieces.length, keptEmbeddings: kept };
}

// Rename a page's title in place (e.g. Simplified -> Taiwan Traditional
// variant fix-up). Refuses when the target title already names a different
// active page for the same lang (a real duplicate -- left for manual review
// rather than silently merging/overwriting).
export function renamePageTitle(db, pageId, newTitle) {
  const page = getPageById(db, pageId);
  if (!page) return { ok: false, reason: 'not-found' };
  const clash = db
    .prepare('SELECT id FROM pages WHERE lang=? AND title=? AND id!=?')
    .get(page.lang, newTitle, pageId);
  if (clash) return { ok: false, reason: 'title-collision', existingId: clash.id };
  db.prepare('UPDATE pages SET title=?, updated_at=? WHERE id=?').run(newTitle, now(), pageId);
  return { ok: true };
}

// Soft delete keeps the page row (status='deleted') but always removes chunks
// so the page can no longer be retrieved; --hard purges everything.
export function deletePage(db, pageId, { hard = false } = {}) {
  const chunkIds = db.prepare('SELECT id FROM chunks WHERE page_id=?').all(pageId);
  const delFts = db.prepare('DELETE FROM chunks_fts WHERE rowid=?');
  for (const c of chunkIds) delFts.run(c.id);
  db.prepare('DELETE FROM chunks WHERE page_id=?').run(pageId);
  if (hard) {
    db.prepare('DELETE FROM page_categories WHERE page_id=?').run(pageId);
    db.prepare('DELETE FROM pages WHERE id=?').run(pageId);
  } else {
    db.prepare("UPDATE pages SET status='deleted', updated_at=? WHERE id=?").run(now(), pageId);
  }
}

// --- crawl queue --------------------------------------------------------------

export function enqueue(db, lang, title, depth = 0, reason = '') {
  const r = db.prepare(
    `INSERT INTO crawl_queue(lang,title,depth,reason,added_at)
     VALUES(?,?,?,?,?) ON CONFLICT(lang,title) DO NOTHING`
  ).run(lang, title, depth, reason, now());
  return r.changes > 0;
}

export function pendingQueue(db, lang, limit = 50) {
  return db
    .prepare("SELECT title, depth, reason FROM crawl_queue WHERE lang=? AND status='pending' LIMIT ?")
    .all(lang, limit);
}

export function markQueue(db, lang, title, status, detail = null) {
  db.prepare('UPDATE crawl_queue SET status=?, detail=? WHERE lang=? AND title=?')
    .run(status, detail, lang, title);
}

// --- sync log / stats -----------------------------------------------------------

export function logSync(db, kind, lang = null, title = null, detail = null) {
  db.prepare('INSERT INTO sync_log(ts,kind,lang,title,detail) VALUES(?,?,?,?,?)')
    .run(now(), kind, lang, title, detail);
}

export function stats(db) {
  const one = (sql) => db.prepare(sql).get();
  return {
    pagesActive: one("SELECT COUNT(*) n FROM pages WHERE status='active'").n,
    pagesDeleted: one("SELECT COUNT(*) n FROM pages WHERE status='deleted'").n,
    byLang: db
      .prepare("SELECT lang, COUNT(*) n FROM pages WHERE status='active' GROUP BY lang ORDER BY n DESC")
      .all(),
    byKind: db
      .prepare("SELECT kind, COUNT(*) n FROM pages WHERE status='active' GROUP BY kind ORDER BY n DESC")
      .all(),
    chunks: one('SELECT COUNT(*) n FROM chunks').n,
    embedded: one('SELECT COUNT(*) n FROM chunks WHERE embedding IS NOT NULL').n,
    entities: one("SELECT COUNT(*) n FROM entities WHERE kind!='stub'").n,
    stubEntities: one("SELECT COUNT(*) n FROM entities WHERE kind='stub'").n,
    edges: one('SELECT COUNT(*) n FROM edges').n,
    queuePending: one("SELECT COUNT(*) n FROM crawl_queue WHERE status='pending'").n,
    queueErrors: one("SELECT COUNT(*) n FROM crawl_queue WHERE status='error'").n,
    lastSync: db.prepare('SELECT ts, kind, lang, title, detail FROM sync_log ORDER BY id DESC LIMIT 1').get() ?? null,
  };
}
