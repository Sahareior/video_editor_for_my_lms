import { W, H, S } from './constants.js';
import { clamp, hexA, uid } from './math.js';

/* ---------- freehand vector ink ----------
   Annotations are per-scene, resolution-independent (points are normalised
   0..1 against the 1920x1080 stage) and are rendered inside renderFrame(), so
   they are baked into the recording and round-trip through the project JSON
   for free.

   Everything is reduced to one primitive: a dense polyline in stage pixels
   plus an arc-length table. Draw-on animation is then just "walk the polyline
   up to L * progress", which works identically for a pen squiggle, an
   ellipse, a rectangle perimeter and an arrow shaft. */

export const INK_TOOLS = [
  { id: 'select', label: '↖', name: 'Select' },
  { id: 'pen', label: '✎', name: 'Freehand' },
  { id: 'ellipse', label: '◯', name: 'Ellipse' },
  { id: 'rect', label: '▭', name: 'Rectangle' },
  { id: 'arrow', label: '➜', name: 'Arrow' },
  { id: 'line', label: '╱', name: 'Line' },
];

export const ANIM_TYPES = [
  { id: 'draw', name: '✎ Draw' },
  { id: 'pop', name: '💥 Pop' },
  { id: 'fade', name: '🌫 Fade' },
  { id: 'wipe', name: '▤ Wipe' },
];

export const INK_EASES = ['linear', 'out', 'in-out', 'in'];
export const INK_COLORS = ['#ffd60a', '#ff4d4d', '#4dd97a', '#4dc4ff', '#ffffff', '#0a0d15'];

/* ---------- model ---------- */

export function makeInk(patch) {
  const a = { id: uid(), tool: 'pen', pts: [], color: '#ffd60a', width: 9, fill: null, loop: false, exitFade: true, ...(patch || {}) };
  a.id = a.id || uid(); // patch may pass id:null
  a.anim = { type: 'draw', dur: 0.55, delay: 0.1, ease: 'out', ...((patch && patch.anim) || {}) };
  a.name = a.name || (a.tool === 'pen' ? 'Freehand' : (INK_TOOLS.find(t => t.id === a.tool) || {}).name || 'Ink');
  return a;
}

const isPt = (p) => p && isFinite(+p.x) && isFinite(+p.y);
const pt = (p) => ({ x: clamp(+p.x, 0, 1), y: clamp(+p.y, 0, 1) });

/* project files from before this feature simply have no `annots` — that is
   the whole migration. Anything malformed is dropped rather than thrown on. */
export function normalizeInks(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isInk).map(a => ({
    ...a,
    /* backfill: an id is what every update/delete/select keys off, so a
       missing one would make the stroke match *every* stroke */
    id: a.id || uid(),
    tool: INK_TOOLS.some(t => t.id === a.tool) ? a.tool : 'pen',
    pts: a.pts.filter(isPt).map(pt),
    width: clamp(+a.width || 9, 1, 90),
    anim: {
      type: ANIM_TYPES.some(t => t.id === (a.anim || {}).type) ? a.anim.type : 'draw',
      dur: clamp(+((a.anim || {}).dur) || 0.55, 0.05, 10),
      delay: clamp(+((a.anim || {}).delay) || 0, 0, 30),
      ease: INK_EASES.includes((a.anim || {}).ease) ? a.anim.ease : 'out',
    },
    loop: !!a.loop,
    exitFade: a.exitFade === undefined ? true : !!a.exitFade,
    color: /^#[0-9a-f]{3,8}$/i.test(a.color || '') ? a.color : '#ffd60a',
    fill: /^#[0-9a-f]{3,8}$/i.test(a.fill || '') ? a.fill : null,
  })).filter(a => a.pts.length >= 1);
}

const isInk = (a) => a && INK_TOOLS.some(t => t.id === a.tool) && Array.isArray(a.pts) && a.pts.length >= 1;

/* ---------- pointer → stage pixels ---------- */

export function eventToStage(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    x: clamp((e.clientX - r.left) * (W / r.width), -W * 0.25, W * 1.25),
    y: clamp((e.clientY - r.top) * (H / r.height), -H * 0.25, H * 1.25),
  };
}
export const toNorm = (p) => ({ x: p.x / W, y: p.y / H });
export const toStage = (p) => ({ x: p.x * W, y: p.y * H });

/* ---------- simplify (Ramer-Douglas-Peucker) ---------- */

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, fd = eps;
    const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-6;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i].x - dx * pts[i].y + bx * ay - by * ax) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* drop points closer than `min` px — kills the jitter a finger/stylus adds */
export function dedupe(pts, min) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p.x - l.x, p.y - l.y) >= min) out.push(p);
  }
  return out;
}

/* ---------- shape building (normalised pts → dense stage polyline) ---------- */

/* Catmull-Rom through the control points, sampled into a dense polyline.
   This is what gives a raw pointer trail its soft, hand-drawn curve. */
function sampleSpline(src, closed, per) {
  const n = src.length;
  if (n < 2) return src.slice();
  const at = (i) => closed ? src[((i % n) + n) % n] : src[clamp(i, 0, n - 1)];
  const out = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  if (!closed) out.push(src[n - 1]);
  return out;
}

const ellipseRing = (cx, cy, rx, ry) => {
  const SEG = 96, out = [];
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2 - Math.PI / 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
};

const rectRing = (x0, y0, x1, y1) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
];

/* Build the drawable polyline for an annotation, in stage pixels.
   Returns { pts, closed, head, bbox, len, cum }.
   `head` is only set for arrows: the shaft is trimmed, the head is drawn
   separately once the tip arrives so it "lands" instead of stretching. */
export function buildPath(a) {
  if (!a || !Array.isArray(a.pts) || !a.pts.length) return null;
  const P = a.pts.filter(p => p && isFinite(+p.x) && isFinite(+p.y)).map(toStage);
  if (!P.length) return null;

  const s = S();
  let pts = P, closed = false, head = null;

  if (a.tool === 'ellipse' || a.tool === 'rect') {
    const b = boxOf(P);
    if (!b) return null;
    pts = a.tool === 'ellipse'
      ? ellipseRing((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2)
      : rectRing(b.x0, b.y0, b.x1, b.y1);
    closed = true;
  } else if (a.tool === 'pen') {
    const simp = rdp(P, 2.2 * s);
    pts = sampleSpline(simp, false, Math.max(6, Math.min(22, Math.ceil(simp.length * 1.4))));
  } else {
    // line / arrow: straight two-point path
    const A = P[0], B = P[P.length - 1];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    pts = len < 1 ? [A, B] : [A, B];
    if (a.tool === 'arrow' && len >= 8) {
      const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
      const hl = Math.min(len * 0.34, Math.max(a.width * 3.1 * s, 26 * s));
      head = { x: B.x, y: B.y, ux, uy, len: hl, w: hl * 0.62 };
    }
  }

  if (pts.length < 2) return null;
  const cum = arcTable(pts);
  return { pts, closed, head, bbox: boxOf(pts), len: cum[cum.length - 1], cum };
}

function arcTable(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return cum;
}

function boxOf(pts) {
  if (!pts || !pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/* ---------- draw-on progress ---------- */

const EASE = {
  linear: (p) => p,
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p,
  'in-out': (p) => (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
};

/* 0 → 1 while the scene's own clock advances, then hold / erase / repeat. */
export function inkProgress(a, ts) {
  const an = a.anim || {};
  const d = Math.max(0.05, an.dur || 0.55);
  const delay = Math.max(0, an.delay || 0);
  if (ts <= delay) return 0;
  if (!a.loop) return clamp((ts - delay) / d, 0, 1);

  const hold = 0.55, out = Math.min(0.3, d * 0.5), period = d + hold + out;
  const t = (ts - delay) % period;
  if (t <= d) return clamp(t / d, 0, 1);
  if (t <= d + hold) return 1;
  return clamp(1 - (t - d - hold) / out, 0, 1);
}

/* alpha multiplier, including the scene-exit fade shared with text lines */
export function inkAlpha(a, ts, sceneDur) {
  const an = a.anim || {};
  if (an.type === 'fade' || an.type === 'wipe') {
    const p = inkProgress(a, ts);
    if (p <= 0) return 0;
  }
  if (!a.exitFade) return 1;
  const q = clamp((ts - (sceneDur - 0.3)) / 0.3, 0, 1);
  return 1 - q * q * (3 - 2 * q);
}

/* ---------- rendering ---------- */

function tracePath(ctx, pts, closed) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
}

/* the polyline up to arc length `max`, plus the tangent there */
function trimTo(pts, cum, max) {
  const total = cum[cum.length - 1];
  if (max >= total) return { seg: pts, tip: pts[pts.length - 1], ux: 0, uy: 0, done: true };
  let i = 1;
  while (i < cum.length - 1 && cum[i] < max) i++;
  const t = (max - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  const a = pts[i - 1], b = pts[i];
  const seg = pts.slice(0, i);
  seg.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
  return { seg, tip: seg[seg.length - 1], ux: (b.x - a.x) / d, uy: (b.y - a.y) / d, done: false };
}

function styleStroke(ctx, a) {
  /* stroke widths are stored as design-space px (authored against 1920x1080),
     so they are scaled at draw time — otherwise a 1080-wide vertical frame
     gets a visibly heavier line for the same stored value */
  ctx.strokeStyle = a.color || '#ffd60a';
  ctx.lineWidth = (a.width || 9) * S();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 4;
}

/* Draw one annotation at its current animation progress.
   `ts` is seconds since the scene started. */
export function drawInk(ctx, a, ts, sceneDur) {
  if (a.visible === false) return;
  const path = buildPath(a);
  if (!path) return;

  const an = a.anim || {};
  const type = an.type || 'draw';
  const raw = inkProgress(a, ts);
  const p = (EASE[an.ease] || EASE.out)(raw);
  // at p=0 a trimmed path degenerates to a dot at the origin of the stroke —
  // a visible speck that isn't part of the drawing, so draw nothing at all
  if (p <= 0) return;
  const alpha = inkAlpha(a, ts, sceneDur);
  if (alpha <= 0.004) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // "pop" scales the whole shape up from its own centre
  let sc = 1;
  if (type === 'pop') {
    const e = EASE[an.ease] || EASE.out;
    sc = e(p) < 1 ? 0.55 + 0.45 * e(p) + 0.12 * Math.sin(e(p) * Math.PI) : 1;
    ctx.translate(path.bbox.cx, path.bbox.cy);
    ctx.scale(sc, sc);
    ctx.translate(-path.bbox.cx, -path.bbox.cy);
  }

  const isTrim = type === 'draw' || type === 'pop';
  const { seg, tip, ux, uy, done } = isTrim
    ? trimTo(path.pts, path.cum, path.len * p)
    : { seg: path.pts, tip: path.pts[path.pts.length - 1], ux: 0, uy: 0, done: true };

  if (!seg.length) { ctx.restore(); return; }

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  styleStroke(ctx, a);
  const aw = (a.width || 9) * S();

  // soft glow so the ink reads on top of busy imagery
  ctx.shadowColor = hexA(a.color || '#ffd60a', 0.55);
  ctx.shadowBlur = Math.min(38, aw * 1.7);

  if (a.fill && (a.tool === 'ellipse' || a.tool === 'rect')) {
    tracePath(ctx, path.pts, true);
    ctx.fillStyle = hexA(a.fill, 0.22);
    ctx.fill();
  }

  if (type === 'wipe') {
    // left-to-right reveal with a bright leading edge
    const bx = path.bbox;
    const x = bx.x0 - 6 + (bx.w + 12) * p;
    ctx.beginPath(); ctx.rect(x - W, -H, W, H * 3); ctx.clip();
    ctx.shadowBlur = 0;
    tracePath(ctx, path.pts, path.closed);
    ctx.stroke();
    ctx.shadowBlur = Math.min(38, aw * 1.7);
    if (p > 0.001 && p < 0.999) {
      ctx.save();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, aw * 0.3);
      ctx.beginPath(); ctx.moveTo(x, Math.max(0, bx.y0 - 40)); ctx.lineTo(x, Math.min(H, bx.y1 + 40)); ctx.stroke();
      ctx.restore();
    }
  } else {
    tracePath(ctx, seg, false);
    ctx.stroke();
  }

  // arrow head: lands once the shaft tip reaches it
  if (path.head && (done || p > 0.985)) {
    const hd = path.head, hx = tip.x, hy = tip.y;
    const bx = hx - hd.ux * hd.len, by = hy - hd.uy * hd.len;
    const nx = -hd.uy, ny = hd.ux;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(bx + nx * hd.w, by + ny * hd.w);
    ctx.lineTo(bx - nx * hd.w, by - ny * hd.w);
    ctx.closePath();
    ctx.fillStyle = a.color || '#ffd60a';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

export function drawInks(ctx, list, ts, sceneDur) {
  for (const a of (list || [])) drawInk(ctx, a, ts, sceneDur);
}

/* ---------- hit testing (stage px) ---------- */

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L < 1e-9 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function hitInk(a, px, py, tol) {
  const path = buildPath(a);
  if (!path) return false;
  /* tolerance arrives in design px, so scale it to the live stage */
  const t = (tol || 16) * S();
  const b = path.bbox;
  if (px < b.x0 - t || px > b.x1 + t || py < b.y0 - t || py > b.y1 + t) return false;
  /* a zero-radius shape has no ring to catch — fall back to its extent */
  if (b.w <= t && b.h <= t) return true;
  for (let i = 1; i < path.pts.length; i++) {
    if (distToSeg(px, py, path.pts[i - 1].x, path.pts[i - 1].y, path.pts[i].x, path.pts[i].y) <= t) return true;
  }
  return false;
}

/* topmost (last drawn) annotation under the cursor */
export function pickInk(list, px, py, tol) {
  const arr = list || [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].visible === false) continue;
    if (hitInk(arr[i], px, py, tol)) return arr[i];
  }
  return null;
}

/* ---------- editor chrome (never recorded) ---------- */

export function drawInkOverlay(ctx, ink) {
  if (!ink || !ink.edit || ink.recPhase) return;
  const accent = ink.accent || '#ffd60a';
  const list = ink.annots || [];
  const draft = ink.draft;

  const frame = (b, on) => {
    if (!b) return;
    const pad = 14 * S();
    ctx.save();
    ctx.strokeStyle = on ? accent : 'rgba(159,170,195,.45)';
    ctx.lineWidth = (on ? 3 : 2) * S();
    ctx.setLineDash(on ? [12, 8].map(v => v * S()) : [7, 7].map(v => v * S()));
    ctx.strokeRect(b.x0 - pad, b.y0 - pad, b.w + pad * 2, b.h + pad * 2);
    ctx.setLineDash([]);
    if (on) {
      const dots = [[b.x0 - pad, b.y0 - pad], [b.x1 + pad, b.y0 - pad], [b.x1 + pad, b.y1 + pad], [b.x0 - pad, b.y1 + pad]];
      ctx.fillStyle = '#0a0d15'; ctx.strokeStyle = accent; ctx.lineWidth = 2 * S();
      for (const [x, y] of dots) { ctx.beginPath(); ctx.arc(x, y, 7 * S(), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
  };

  for (const a of list) {
    if (a.visible === false) continue;
    const path = buildPath(a);
    if (!path) continue;
    const on = a.id === ink.selInkId;
    /* Only the *unselected* strokes get a ghost — the selected one is already
       painted at full strength by drawInk, and ghosting it would read as a
       second outline sitting inside the real one. */
    if (!on) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      styleStroke(ctx, a);
      ctx.lineWidth = (a.width || 9) * S() * 0.3;
      tracePath(ctx, path.pts, path.closed);
      ctx.stroke();
      ctx.restore();
    }
    frame(path.bbox, on);
  }

  if (draft && draft.pts && draft.pts.length > 1) {
    const p = buildPath({ tool: draft.tool, pts: draft.pts, width: draft.width || 9, color: draft.color });
    if (p) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      styleStroke(ctx, { color: draft.color || '#ffd60a', width: draft.width || 9 });
      tracePath(ctx, p.pts, p.closed);
      ctx.stroke();
      ctx.restore();
    }
  }
}
