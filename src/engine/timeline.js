export const maxEnd = (scenes) => (scenes || []).reduce((m, s) => Math.max(m, +s.end || 0), 1);
/* scene under playhead; falls back to a hold-only neighbour */
export function sceneAt(scenes, t) {
  for (const s of scenes) if (t >= s.start && t < s.end) return s;
  let first = null, prev = null;
  for (const s of scenes) {
    if (!first || s.start < first.start) first = s;
    if (s.start <= t && (!prev || s.start > prev.start)) prev = s;
  }
  if (first && t < first.start) return { ...first, _holdOnly: true };
  return prev ? { ...prev, _holdOnly: true } : null;
}
