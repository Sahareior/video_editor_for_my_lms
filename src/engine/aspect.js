/* ---------- aspect ratio ----------
   The stage used to be a hardcoded 1920x1080 baked into every module. Aspect
   switching works by keeping ONE source of truth for the current dimensions
   (set from the project when it changes) and reading it at draw time, so a
   ratio switch needs no re-plumbing of the render loop.

   Every draw call scales by `S` (the design scale) so line weights, glows and
   plate radii keep their optical weight on a smaller stage — otherwise a
   1080-tall vertical frame renders with a 9px-equivalent hairline stroke. */

export const ASPECTS = [
  { id: '16:9', label: '16:9', name: 'ল্যান্ডস্কেপ', w: 1920, h: 1080, hint: 'YouTube · প্রেজেন্টেশন' },
  { id: '9:16', label: '9:16', name: 'ভার্টিক্যাল', w: 1080, h: 1920, hint: 'Reels · Shorts · TikTok' },
  { id: '1:1', label: '1:1', name: 'বর্গাকার', w: 1080, h: 1080, hint: 'Instagram পোস্ট' },
  { id: '4:5', label: '4:5', name: 'পোর্ট্রেট', w: 1080, h: 1350, hint: 'Instagram ফিড' },
];

export const DEFAULT_ASPECT = '16:9';

/* The stage is 1920x1080 by design; text sizes, camera zooms and the demo
   project are all authored against that. This is the reference. */
export const REF_W = 1920, REF_H = 1080;

/* live dimensions, mutated by setAspect() and read by the engine */
export const stage = { w: REF_W, h: REF_H };

export function aspectById(id) {
  return ASPECTS.find(a => a.id === id) || ASPECTS[0];
}

export function normalizeAspect(v) {
  return ASPECTS.some(a => a.id === v) ? v : DEFAULT_ASPECT;
}

export function setAspect(id) {
  const a = aspectById(normalizeAspect(id));
  stage.w = a.w; stage.h = a.h;
  return a;
}

/* design scale: 1.0 on the 1920x1080 reference, ~0.5625 on a 1080-wide
   vertical. Applied to stroke weights and other absolute pixel sizes so the
   composition reads the same at every ratio. */
export const scaleOf = (w = stage.w, h = stage.h) => Math.min(w / REF_W, h / REF_H);
