// Crawl scope: seed categories per language (with per-seed recursion depth),
// exclusion rules that keep the corpus scientific (no fiction/films/games/
// astrology), and the page-kind classifier (topic / scientist / history).
//
// Only the priority languages (zh/en) are seeded -- other languages join the
// corpus through langlink projection so all wikis share one scope. Category
// titles are external Wikipedia data, hence non-ASCII zh strings here.
//
// Extend without editing code:
//   WKB_EXTRA_SEEDS="en|Category:Radio astronomy|2;zh|Category:射电天文学|2"
//   WKB_EXCLUDE_EXTRA="(some|extra|category|pattern)"

const BUILTIN_SEEDS = {
  en: [
    // core disciplines
    ['Category:Astrophysics', 3],
    ['Category:Physical cosmology', 3],
    ['Category:Astronomy', 2],
    ['Category:Space science', 2],
    ['Category:Black holes', 3],
    ['Category:General relativity', 3],
    ['Category:Gravitational waves', 2],
    ['Category:Galaxies', 2],
    ['Category:Stars', 2],
    ['Category:Exoplanets', 2],
    ['Category:Planetary science', 2],
    ['Category:Astroparticle physics', 2],
    ['Category:Celestial mechanics', 2],
    ['Category:Astrochemistry', 2],
    ['Category:Astrobiology', 2],
    // people
    ['Category:Astronomers', 3],
    ['Category:Astrophysicists', 3],
    ['Category:Cosmologists', 3],
    // history of science
    ['Category:History of astronomy', 3],
    ['Category:History of physics', 2],
  ],
  zh: [
    ['Category:天体物理学', 3],
    ['Category:宇宙学', 3],
    ['Category:天文学', 2],
    ['Category:空间科学', 2],
    ['Category:黑洞', 3],
    ['Category:广义相对论', 3],
    ['Category:引力波', 2],
    ['Category:星系', 2],
    ['Category:恒星', 2],
    ['Category:太阳系外行星', 2],
    ['Category:行星科学', 2],
    ['Category:天体化学', 2],
    ['Category:天体生物学', 2],
    ['Category:天文学家', 3],
    ['Category:天体物理学家', 3],
    ['Category:宇宙学家', 3],
    ['Category:天文学史', 3],
    ['Category:物理学史', 2],
  ],
};

function extraSeeds(lang) {
  const raw = process.env.WKB_EXTRA_SEEDS || '';
  const out = [];
  for (const part of raw.split(';')) {
    const [l, title, depth] = part.split('|').map((s) => (s || '').trim());
    if (l === lang && title) out.push([title, Number(depth) || 1]);
  }
  return out;
}

export function getSeeds(lang) {
  return [...(BUILTIN_SEEDS[lang] ?? []), ...extraSeeds(lang)];
}

// Categories whose subtree is out of scope: fiction/media/games/music,
// pseudo-science, maintenance/meta categories. English + zh (both scripts) +
// a few ja terms that ride along on langlink-projected pages.
const EXCLUDE_CATEGORY_RE = new RegExp(
  [
    'science.?fiction', 'in fiction', 'fictional', '\\bfilms?\\b', 'movies',
    'television', 'tv series', 'video games?', 'comics', 'manga', 'anime',
    'novels', 'short stor', 'songs?', 'albums', 'discograph', '\\bmusic\\b',
    'episodes', 'characters', 'popular culture', 'conspirac', 'astrolog',
    'ufolog', '\\bufos?\\b', 'unidentified flying', 'planetariums',
    'software', 'mobile apps', 'navigational boxes', 'templates',
    'wikipedia books', 'lists? of', 'stubs',
    // zh (simplified + traditional)
    '科幻', '小说', '小說', '电影', '電影', '电视', '電視', '游戏', '遊戲',
    '漫画', '漫畫', '动画', '動畫', '歌曲', '专辑', '專輯', '音乐', '音樂',
    '占星', '不明飞行物', '不明飛行物', '阴谋论', '陰謀論', '模板', '列表',
    '消歧义', '消歧義', '软件', '軟體', '小作品',
    // ja
    'SF', 'フィクション', '映画', 'テレビ', 'ゲーム', '漫画作品', 'アニメ',
  ].join('|'),
  'i'
);

const EXCLUDE_TITLE_RE = new RegExp(
  [
    '\\(disambiguation\\)$',
    '（消歧义）$', '（消歧義）$', '\\(消歧义\\)$', '\\(消歧義\\)$',
    '^(List of|Lists of|Index of) ',
  ].join('|'),
  'i'
);

export function shouldSkipCategory(categoryTitle) {
  const extra = process.env.WKB_EXCLUDE_EXTRA;
  if (extra && new RegExp(extra, 'i').test(categoryTitle)) return true;
  return EXCLUDE_CATEGORY_RE.test(categoryTitle);
}

export function shouldSkipTitle(title) {
  return EXCLUDE_TITLE_RE.test(title);
}

// Rough kind from visible categories; the Wikidata graph pass refines it
// (P31 = Q5 human => scientist) once entities are synced.
const SCIENTIST_CAT_RE = new RegExp(
  [
    'astronomers', 'astrophysicists', 'cosmologists', 'physicists',
    'scientists', 'mathematicians',
    '天文学家', '天文學家', '天体物理学家', '天體物理學家',
    '物理学家', '物理學家', '宇宙学家', '宇宙學家', '科学家', '科學家',
    '数学家', '數學家',
  ].join('|'),
  'i'
);
const HISTORY_CAT_RE = new RegExp(
  ['^history of', ' history$', '历史', '歷史', '学史', '學史'].join('|'),
  'i'
);

export function classifyKind(categories) {
  const cats = categories || [];
  if (cats.some((c) => SCIENTIST_CAT_RE.test(c))) return 'scientist';
  if (cats.some((c) => HISTORY_CAT_RE.test(c))) return 'history';
  return 'topic';
}
