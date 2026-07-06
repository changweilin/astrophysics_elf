// Simplified -> Taiwan Traditional normalization (OpenCC s2twp: character
// conversion plus Taiwan phrase/idiom localization, e.g. 软件 -> 軟體 not just
// 軟件). Used as a belt-and-suspenders pass wherever zh text can still arrive
// Simplified despite variant=zh-tw requests: Wikidata labels (no variant
// param exists for wbgetentities), local-LLM translation output (models
// drift into Simplified even when told the target is Taiwan), and one-off
// backfill of content ingested before any of this existed.
import { Converter } from 'opencc-js';

const s2twp = Converter({ from: 'cn', to: 'twp' });

// No-ops on falsy input and on text that doesn't actually change, so callers
// can unconditionally run this without extra branching or spurious
// updated_at bumps on rows that were already fine.
export function toTaiwan(text) {
  if (!text) return text;
  const converted = s2twp(text);
  return converted === text ? text : converted;
}
