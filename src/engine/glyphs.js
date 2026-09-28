/* Bangla-safe grapheme splitting — conjuncts (ক্ষ) and combining marks (B̄) never break apart */
let _seg = null;
try { _seg = new Intl.Segmenter('bn', { granularity: 'grapheme' }); } catch { _seg = null; }
export function glyphs(str) {
  if (_seg) {
    const out = [];
    for (const s of _seg.segment(str)) out.push(s.segment);
    return out;
  }
  return Array.from(str);
}
