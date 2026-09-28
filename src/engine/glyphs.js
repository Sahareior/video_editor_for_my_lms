/* Script-safe grapheme splitting — letters and their combining marks (Ā) never break apart */
let _seg = null;
try { _seg = new Intl.Segmenter('en', { granularity: 'grapheme' }); } catch { _seg = null; }
export function glyphs(str) {
  if (_seg) {
    const out = [];
    for (const s of _seg.segment(str)) out.push(s.segment);
    return out;
  }
  return Array.from(str);
}
