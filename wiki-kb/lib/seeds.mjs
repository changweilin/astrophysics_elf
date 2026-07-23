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
    // space life sciences: human spaceflight physiology/medicine, and the
    // search for life off Earth. Extremophiles/Fermi paradox/Panspermia are
    // seeded at depth 0 on purpose -- they are reachable from Astrobiology,
    // but their own subtrees run straight into general microbiology.
    ['Category:Space medicine', 2],
    ['Category:Human spaceflight', 1],
    ['Category:Astronauts', 1],
    ['Category:Extraterrestrial life', 2],
    ['Category:Search for extraterrestrial intelligence', 1],
    ['Category:Interstellar messages', 1],
    ['Category:Planetary habitability', 1],
    ['Category:Exoplanet search projects', 1],
    ['Category:Extremophiles', 0],
    ['Category:Fermi paradox', 0],
    ['Category:Panspermia', 0],
    // people
    ['Category:Astronomers', 3],
    ['Category:Astrophysicists', 3],
    ['Category:Cosmologists', 3],
    // history of science
    ['Category:History of astronomy', 3],
    ['Category:History of physics', 2],
    // Interdisciplinary humanities/social-science side of the same subject
    // matter: philosophy, history, sociology (STS), politics/law/policy,
    // ethics and communication of astronomy & space science. Depths come from
    // a category-size probe (2026-07-23), NOT guesses: the broad parents get
    // depth 2 because their subtrees are curated ("Philosophy of science" ->
    // by-discipline / philosophers by nationality), while categories that
    // border on a whole other field ("Politics of outer space" -> every space
    // mission, "Ethics of science and technology" -> bioethics) are held at
    // depth 1 and the off-domain branches are cut by EXCLUDE_CATEGORY_RE.
    ['Category:Philosophy of science', 2],
    ['Category:Philosophers of science', 2],
    ['Category:Philosophy of physics', 2],
    ['Category:Philosophy of astronomy', 2],
    ['Category:Epistemology of science', 1],
    ['Category:Concepts in the philosophy of science', 1],
    ['Category:Philosophy of time', 1],
    ['Category:Scientific method', 1],
    // depth 1, not 2: at depth 2 "History of science by discipline" walks into
    // the whole history of technology (furniture, glass, printing, smartphones
    // ...), so the two period branches worth having are seeded directly.
    ['Category:History of science', 1],
    ['Category:Ancient science', 1],
    ['Category:Science in the Middle Ages', 1],
    ['Category:Historians of science', 2],
    ['Category:Historiography of science', 1],
    ['Category:Scientific Revolution', 1],
    ['Category:Copernican Revolution', 2],
    ['Category:Science and technology studies', 2],
    ['Category:Sociology of science', 2],
    ['Category:Sociologists of science', 1],
    ['Category:Politics of outer space', 1],
    ['Category:Space policy', 2],
    ['Category:Space law', 2],
    ['Category:Space advocacy', 2],
    // depth 1: at 2 the ministry subcats drag in every energy/information
    // ministry on Wikipedia
    ['Category:Science policy', 1],
    ['Category:Ethics of science and technology', 1],
    ['Category:Science communication', 2],
    ['Category:Astronomy education', 1],
    ['Category:Religion and science', 1],
    ['Category:Archaeoastronomy', 1],
  ],
  zh: [
    ['Category:天体物理学', 3],
    ['Category:宇宙学', 3],
    ['Category:天文学', 2],
    ['Category:空间科学', 2],
    ['Category:黑洞', 3],
    // Variant-corrected: zh.wikipedia has ONE stored spelling per category and
    // the API does not convert titles, so these five Simplified spellings
    // resolved to nothing at all (probed 2026-07-23) -- 廣義相對論 alone is 74
    // pages + 14 subcats that never entered the corpus. Their Simplified twins
    // are kept below in case they are ever created as redirects.
    ['Category:廣義相對論', 3],
    ['Category:广义相对论', 3],
    ['Category:引力波', 2],
    ['Category:星系', 2],
    ['Category:恒星', 2],
    ['Category:太陽系外行星', 2],
    ['Category:太阳系外行星', 2],
    ['Category:行星科学', 2],
    ['Category:天体化学', 2],
    ['Category:天體生物學', 2],
    ['Category:天体生物学', 2],
    ['Category:天文学家', 3],
    ['Category:天體物理學家', 3],
    ['Category:天体物理学家', 3],
    ['Category:宇宙学家', 3],
    ['Category:天文学史', 3],
    ['Category:物理學史', 2],
    ['Category:物理学史', 2],
    // space life sciences (zh has no 太空醫學 category of its own; the en
    // Space medicine subtree reaches zh through langlink projection)
    ['Category:载人航天', 1],
    ['Category:宇航员', 1],
    ['Category:外星生命', 1],
    ['Category:SETI', 1],
    ['Category:行星適居性', 1],
    ['Category:嗜极生物', 0],
    ['Category:费米悖论', 0],
    // Interdisciplinary block, mirroring the en list above. zh.wikipedia
    // stores category titles in whichever variant the creator used and the
    // API does NOT LanguageConverter them, so the Traditional/Simplified
    // spelling of each title here is the one that actually resolves (probed
    // 2026-07-23) -- e.g. 科學哲學 exists but 科学哲学 does not, while
    // 科学哲学家 exists but 科學哲學家 does not. Do not "normalize" these.
    ['Category:科學哲學', 2],
    ['Category:科学哲学家', 2],
    ['Category:物理学哲学', 2],
    ['Category:哲学天文学', 1],
    ['Category:科学哲学概念', 1],
    ['Category:科学的认识论', 1],
    ['Category:時間哲學', 1],
    ['Category:科学史', 2],
    ['Category:科学史家', 2],
    ['Category:科學史學', 1],
    ['Category:科学革命', 1],
    ['Category:科學社會學', 1],
    ['Category:知識社會學', 1],
    ['Category:科学政策', 2],
    ['Category:空间政策', 2],
    ['Category:太空法', 1],
    ['Category:太空殖民', 1],
    ['Category:科学传播', 2],
    ['Category:大眾科學', 1],
    ['Category:天文教育', 1],
    ['Category:考古天文学', 1],
    ['Category:古代天文学', 2],
    ['Category:宗教與科學', 1],
  ],
};

// Curated "List of X" / index articles to ingest as their own KG node (kind
// 'list') with child edges to whichever listed items resolve to a Wikidata
// item -- see lib/list-ingest.mjs. Deliberately hand-picked and capped per
// list: some astronomy lists are enormous (List of minor planets runs past a
// million rows; List of exoplanets runs to thousands), so this is NOT "crawl
// every list Wikipedia has" -- only a bounded, curated starter set, each
// entry [title, itemCap]. Extend the same way as BUILTIN_SEEDS, by editing
// this array (or WKB_EXTRA_LIST_SEEDS, same "lang|title|cap" shape).
const BUILTIN_LIST_SEEDS = {
  en: [
    ['List of black holes', 150],
    ['List of nearest stars and brown dwarfs', 150],
    ['List of brightest stars', 150],
    ['List of largest stars', 150],
    ['List of largest galaxies', 150],
    ['List of nearest galaxies', 150],
    ['List of natural satellites', 200],
    ['List of Solar System objects by size', 150],
    ['List of space telescopes', 150],
    ['List of gravitational wave observations', 100],
    ['List of potentially habitable exoplanets', 100],
  ],
  zh: [
    ['黑洞列表', 150],
    ['太阳系天然卫星列表', 200],
    ['最亮恒星列表', 150],
    ['系外行星列表', 150],
  ],
};

function extraListSeeds(lang) {
  const raw = process.env.WKB_EXTRA_LIST_SEEDS || '';
  const out = [];
  for (const part of raw.split(';')) {
    const [l, title, cap] = part.split('|').map((s) => (s || '').trim());
    if (l === lang && title) out.push([title, Number(cap) || 150]);
  }
  return out;
}

export function getListSeeds(lang) {
  return [...(BUILTIN_LIST_SEEDS[lang] ?? []), ...extraListSeeds(lang)];
}

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
    'ufolog', '\\bufos?\\b', 'unidentified flying', 'planetari(um|a)',
    'software', 'mobile apps', 'navigational boxes', 'templates',
    'wikipedia books', 'lists? of', 'stubs',
    // Off-domain branches reachable from the interdisciplinary seeds:
    // religion-and-science leads into creationism/the paranormal, ethics of
    // science into bio/medical ethics, history/sociology of science into the
    // history of medicine, and science communication into media personalities.
    'creationis', 'creation myth', 'intelligent design', 'paranormal',
    'supernatural', 'new age', 'religious studies', 'bioethic',
    'medical ethic', 'history of medicine',
    'medical (historians|sociologists|anthropolog)',
    'celebrity', 'youtube', 'podcasters?', 'radio programs?',
    // neighbouring-discipline theory reached from the sociology/policy seeds
    'political theor', 'popular psychology',
    '創造論', '创造论', '超自然', '醫學史', '医学史', '醫史學', '医史学',
    '政治理論', '政治理论', '社會學理論', '社会学理论', '心理學理論', '心理学理论',
    // UFO-lore branches hanging off the extraterrestrial-life categories
    '超常現象', '超常现象', '虚构', '虛構', '傳言', '传言',
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
    // interdisciplinary people (philosophy/history/sociology of science);
    // 'scientist' is this schema's people bucket, not a claim about method
    'philosophers', 'historians', 'sociologists', 'science communicators',
    '天文学家', '天文學家', '天体物理学家', '天體物理學家',
    '物理学家', '物理學家', '宇宙学家', '宇宙學家', '科学家', '科學家',
    '数学家', '數學家', '哲学家', '哲學家', '史学家', '史學家',
    '史家', '社会学家', '社會學家', '科普作家',
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
