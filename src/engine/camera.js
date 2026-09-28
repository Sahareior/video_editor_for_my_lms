import { W, H } from './constants.js';
import { clamp, lerp, easeInOut, easeOutCubic } from './math.js';

export const coverScale = (iw, ih) => Math.max(W / iw, H / ih);

export const easings = {
  linear: (p) => p,
  in: (p) => p * p,
  out: easeOutCubic,
  'in-out': easeInOut,
};

export function clampCamN(c, iw, ih) {
  const k = coverScale(iw, ih) * (c.z || 1);
  const hw = (W / 2) / k, hh = (H / 2) / k;
  let x = c.x * iw, y = c.y * ih;
  x = (iw - 2 * hw > 0.5) ? clamp(x, hw, iw - hw) : iw / 2;
  y = (ih - 2 * hh > 0.5) ? clamp(y, hh, ih - hh) : ih / 2;
  return { x: x / iw, y: y / ih, z: c.z || 1 };
}

/* multi-waypoint keyframe evaluator
   keys = [{ t: 0..1, cam: {x,y,z}, ease: 'linear'|'in'|'out'|'in-out' }, ...]
   returns the eased camera at normalized progress p, or null if no keys */
export function evalCamKeys(keys, p) {
  if (!keys || !keys.length) return null;
  if (keys.length === 1) return keys[0].cam || null;
  const ks = [...keys].sort((a, b) => (a.t || 0) - (b.t || 0));
  if (p <= ks[0].t) return ks[0].cam;
  if (p >= ks[ks.length - 1].t) return ks[ks.length - 1].cam;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (p >= a.t && p <= b.t) {
      const span = Math.max(0.0001, b.t - a.t);
      const localP = clamp((p - a.t) / span, 0, 1);
      const ease = easings[a.ease] || easeInOut;
      const e = ease(localP);
      return {
        x: lerp(a.cam.x, b.cam.x, e),
        y: lerp(a.cam.y, b.cam.y, e),
        z: Math.max(1, lerp(a.cam.z || 1, b.cam.z || 1, e)),
      };
    }
  }
  return ks[0].cam;
}

export function evalCam(sc, p) {
  if (sc.camKeys && sc.camKeys.length) {
    const cam = evalCamKeys(sc.camKeys, p);
    if (cam) return cam;
  }
  const a = sc.cam || { x: .5, y: .5, z: 1.2 };
  if (sc.camTo) {
    const b = sc.camTo, e = easeInOut(clamp(p, 0, 1));
    return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: Math.max(1, lerp(a.z || 1, b.z || 1, e)) };
  }
  return { x: a.x, y: a.y, z: a.z || 1 };
}

export function drawCamImage(ctx, img, cam) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const c = clampCamN(cam, iw, ih);
  const k = coverScale(iw, ih) * c.z;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(-c.x * iw, -c.y * ih);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, iw, ih);
  ctx.restore();
}

/* pointer event → image-space anchor under the cursor */
export function pointerToImage(e, canvas, cam, img) {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (W / rect.width);
  const sy = (e.clientY - rect.top) * (H / rect.height);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const k = coverScale(iw, ih) * cam.z;
  return { sx, sy, iw, ih, k, ix: cam.x * iw + (sx - W / 2) / k, iy: cam.y * ih + (sy - H / 2) / k };
}

/* camera that keeps the image anchor under the same screen point */
export function camAnchoredAt(ix, iy, sx, sy, z, iw, ih) {
  const k = coverScale(iw, ih) * z;
  return clampCamN({ x: (ix - (sx - W / 2) / k) / iw, y: (iy - (sy - H / 2) / k) / ih, z }, iw, ih);
}

/* index of the keyframe that is "currently driving" the camera at progress p
   (i.e. the segment whose right endpoint is the next stop). Falls back to last. */
export function activeKeyIndex(keys, p) {
  if (!keys || !keys.length) return -1;
  const ks = [...keys].sort((a, b) => a.t - b.t);
  for (let i = 0; i < ks.length - 1; i++) if (p >= ks[i].t && p <= ks[i + 1].t) return i;
  return ks.length - 1;
}
