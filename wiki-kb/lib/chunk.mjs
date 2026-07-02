// Section-aware chunking of Wikipedia plaintext extracts.
//
// Extracts arrive with `== Heading ==` markers (exsectionformat=wiki). We
// split on headings, drop reference/appendix sections in every corpus
// language, then greedily pack paragraphs to the target size with a small
// overlap so sentences straddling a boundary stay retrievable.

import { config } from '../config.mjs';

const SKIP_SECTIONS = new Set(
  [
    // en
    'references', 'external links', 'see also', 'further reading',
    'bibliography', 'notes', 'citations', 'sources', 'footnotes', 'gallery',
    // zh
    '参考文献', '參考文獻', '参考资料', '參考資料', '参考', '參考',
    '参见', '參見', '外部链接', '外部連結', '注释', '註釋', '脚注', '腳註',
    '延伸阅读', '延伸閱讀', '相关条目', '相關條目', '图集', '圖集',
    // ja
    '関連項目', '出典', '脚注', '参考文献', '外部リンク', '注釈',
    // ko
    '각주', '외부 링크', '같이 보기', '참고 문헌', '참조',
    // de
    'einzelnachweise', 'literatur', 'weblinks', 'siehe auch', 'anmerkungen',
    // fr
    'notes et references', 'notes et références', 'voir aussi',
    'liens externes', 'bibliographie', 'references',
    // it
    'note', 'voci correlate', 'collegamenti esterni', 'bibliografia',
    'altri progetti',
    // es
    'referencias', 'vease tambien', 'véase también', 'enlaces externos',
    'bibliografia', 'bibliografía', 'notas',
  ].map((s) => s.toLowerCase())
);

const HEADING_RE = /^(={2,})\s*(.+?)\s*\1\s*$/;

function splitSections(text) {
  const sections = [{ name: null, lines: [] }];
  for (const line of String(text || '').split('\n')) {
    const m = HEADING_RE.exec(line.trim());
    if (m) sections.push({ name: m[2], lines: [] });
    else sections.at(-1).lines.push(line);
  }
  return sections.map((s) => ({ name: s.name, body: s.lines.join('\n').trim() }));
}

// Hard-split an oversized paragraph at sentence boundaries.
function splitLong(para, target) {
  const sentences = para.split(/(?<=[.!?。！？])\s*/);
  const out = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && buf.length + s.length > target) {
      out.push(buf);
      buf = '';
    }
    buf += s;
    // pathological: single sentence longer than the target
    while (buf.length > target * 1.5) {
      out.push(buf.slice(0, target));
      buf = buf.slice(target);
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function chunkText(text, opts = {}) {
  const target = opts.targetChars ?? config.chunk.targetChars;
  const overlap = opts.overlapChars ?? config.chunk.overlapChars;
  const min = opts.minChars ?? config.chunk.minChars;

  const out = [];
  for (const { name, body } of splitSections(text)) {
    if (!body) continue;
    if (name && SKIP_SECTIONS.has(name.toLowerCase())) continue;
    const paras = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    let buf = '';
    const push = () => {
      const t = buf.trim();
      if (t.length >= min) out.push({ section: name || null, text: t });
      buf = '';
    };
    for (const para of paras) {
      const pieces = para.length > target * 1.5 ? splitLong(para, target) : [para];
      for (const piece of pieces) {
        if (buf && buf.length + piece.length + 1 > target) {
          const tail = overlap > 0 ? buf.slice(-overlap) : '';
          push();
          buf = tail;
        }
        buf += (buf ? '\n' : '') + piece;
      }
    }
    push();
  }
  return out;
}
