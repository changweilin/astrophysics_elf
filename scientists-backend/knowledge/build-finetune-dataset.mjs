// Build a chat-format fine-tuning dataset from Wikipedia.
//
// This is the offline half of "wiki compatibility": pull article intros for a
// list of topics and emit JSONL you can LoRA-fine-tune on (Unsloth, Llama-
// Factory, axolotl) to bake domain knowledge into the local model. After
// training, point SCI_MODEL_ZH / SCI_MODEL_EN at the resulting Ollama model.
//
// Usage:
//   node knowledge/build-finetune-dataset.mjs --lang zh --topics topics.txt --out data-zh.jsonl
//   node knowledge/build-finetune-dataset.mjs --lang en               (uses the built-in seed list)
//
// Output line shape (OpenAI / Ollama chat fine-tune format):
//   {"messages":[{"role":"system",...},{"role":"user",...},{"role":"assistant",...}]}

import { writeFile, readFile } from 'node:fs/promises';
import { config } from '../config.mjs';

const UA = 'KN-Scientists-Lab/1.0 (dataset builder; local educational app)';

const SEED_TOPICS = {
  zh: [
    '廣義相對論', '狹義相對論', '量子力學', '量子電動力學', '牛頓運動定律',
    '萬有引力', '克卜勒定律', '日心說', '黑洞', '事件視界', '哈伯定律',
    '宇宙膨脹', '暗物質', '暗能量', '錢德拉塞卡極限', '白矮星', '中子星',
    '恆星演化', '諾特定理', '熱力學第二定律', '電磁學', '馬克士威方程組',
  ],
  en: [
    'General relativity', 'Special relativity', 'Quantum mechanics',
    'Quantum electrodynamics', "Newton's laws of motion", 'Gravity',
    "Kepler's laws of planetary motion", 'Heliocentrism', 'Black hole',
    'Event horizon', "Hubble's law", 'Expansion of the universe', 'Dark matter',
    'Dark energy', 'Chandrasekhar limit', 'White dwarf', 'Neutron star',
    'Stellar evolution', "Noether's theorem", 'Second law of thermodynamics',
    'Electromagnetism', "Maxwell's equations",
  ],
};

function parseArgs(argv) {
  const args = { lang: 'zh', topics: '', out: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') args.lang = argv[++i];
    else if (a === '--topics') args.topics = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  args.lang = args.lang === 'en' ? 'en' : 'zh';
  if (!args.out) args.out = `wiki-finetune-${args.lang}.jsonl`;
  return args;
}

function site(lang) {
  return lang === 'en' ? 'en.wikipedia.org' : `${config.wiki.lang}.wikipedia.org`;
}
function headers(lang) {
  const h = { 'User-Agent': UA, Accept: 'application/json' };
  if (lang !== 'en') h['Accept-Language'] = config.wiki.zhVariant;
  return h;
}

async function fetchIntro(lang, title) {
  const url = new URL(`https://${site(lang)}/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query', prop: 'extracts', exintro: '1', explaintext: '1',
    redirects: '1', titles: title, format: 'json', origin: '*',
    variant: lang === 'en' ? 'en' : config.wiki.zhVariant,
  }).toString();
  const res = await fetch(url, { headers: headers(lang), signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  return first && first.extract ? first.extract.trim() : null;
}

function promptFor(lang, topic) {
  return lang === 'en'
    ? `Explain "${topic}" clearly for a curious student, then give one key formula or fact.`
    : `請為一位好奇的學生清楚說明「${topic}」,並給出一個關鍵公式或事實。`;
}
function systemFor(lang) {
  return lang === 'en'
    ? 'You are a knowledgeable physics and astronomy tutor. Answer accurately and clearly.'
    : '你是一位學識淵博的物理與天文學家教,請以繁體中文準確且清楚地回答。';
}

async function main() {
  const args = parseArgs(process.argv);
  let topics = SEED_TOPICS[args.lang];
  if (args.topics) {
    const raw = await readFile(args.topics, 'utf8');
    topics = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  const lines = [];
  let ok = 0;
  for (const topic of topics) {
    process.stdout.write(`  fetching: ${topic} ... `);
    const extract = await fetchIntro(args.lang, topic);
    if (!extract) { console.log('skip (no extract)'); continue; }
    lines.push(JSON.stringify({
      messages: [
        { role: 'system', content: systemFor(args.lang) },
        { role: 'user', content: promptFor(args.lang, topic) },
        { role: 'assistant', content: extract },
      ],
    }));
    ok++;
    console.log('ok');
    await new Promise((r) => setTimeout(r, 250)); // be polite to Wikipedia
  }

  await writeFile(args.out, lines.join('\n') + '\n', 'utf8');
  console.log(`\nWrote ${ok}/${topics.length} examples to ${args.out}`);
  console.log('Next: fine-tune with Unsloth/Llama-Factory, export to GGUF, ');
  console.log('`ollama create my-sci -f Modelfile`, then set SCI_MODEL_' +
    (args.lang === 'en' ? 'EN' : 'ZH') + '=my-sci');
}

main().catch((err) => { console.error(err); process.exit(1); });
