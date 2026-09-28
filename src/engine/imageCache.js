/* Non-reactive image cache.
   The render loop runs at 60fps and must never create an <img> or wait on a
   network/decode round-trip, so every layer src is decoded once into a cached
   HTMLImageElement and looked up synchronously. Missing / still-loading entries
   are simply drawn as black. */

const cache = new Map(); // src -> HTMLImageElement

/* guard against unbounded growth when a user swaps a lot of files */
const MAX = 48;

export function getImg(src) {
  if (!src) return null;
  let el = cache.get(src);
  if (!el) {
    el = new Image();
    el.decoding = 'async';
    el.onload = () => { cache.set(src, el); bump(src); };
    el.onerror = () => { cache.delete(src); };
    el.src = src;
    cache.set(src, el);
  }
  if (!el.complete || !el.naturalWidth) return null;
  if (cache.size > MAX) bump(src);
  return el;
}

function bump(keep) {
  const first = cache.keys().next();
  if (!first.done && first.value !== keep) cache.delete(first.value);
}

/* Warm the cache for a whole project. Called whenever scenes change so the
   first frame of playback is already decoded. */
export function primeImages(project) {
  const srcs = new Set();
  (project && project.media || []).forEach(m => m && m.src && srcs.add(m.src));
  if (project && project.image && project.image.src) srcs.add(project.image.src);
  (project && project.scenes || []).forEach(s =>
    (s.layers || []).forEach(L => L && L.src && srcs.add(L.src)));
  srcs.forEach(getImg);
}
