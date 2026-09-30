export const maxEnd = (scenes) => (scenes || []).reduce((m, s) => Math.max(m, +s.end || 0), 1);

/* ensure all scenes sit flush end-to-end like CapCut main track (magnetic contiguous sequence) */
export function resequenceScenes(scenes) {
  if (!scenes || !scenes.length) return [];
  let cur = 0;
  return scenes.map(s => {
    const rawDur = (+s.end || 0) - (+s.start || 0);
    const dur = Math.max(0.4, Math.round((rawDur > 0 ? rawDur : 4) * 10) / 10);
    const start = Math.round(cur * 10) / 10;
    const end = Math.round((start + dur) * 10) / 10;
    cur = end;
    return { ...s, start, end };
  });
}

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

