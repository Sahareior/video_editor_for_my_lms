import { W, H, fontF, S } from './constants.js';
import { clamp, backOut, easeOutCubic, frac, rr } from './math.js';
import { glyphs } from './glyphs.js';

const layoutCache = new Map();
export function clearLayoutCache() { layoutCache.clear(); }

/* Text sizes are authored in design px against the 1920x1080 reference, so
   scale them to the live stage and include the scale in the cache key — a
   portrait frame must not reuse a landscape line's measured layout. */
function layoutLine(ctx, text, size, s) {
  const px = Math.max(1, Math.round(size * s));
  const key = px + '¦' + text;
  let L = layoutCache.get(key);
  if (L) return L;
  ctx.font = fontF(px);
  const gs = glyphs(text);
  const gitems = [], witems = [];
  let x = 0, cur = null;
  const flush = () => { if (cur && cur.items.length) witems.push({ x: cur.x0, w: x - cur.x0, items: cur.items }); cur = null; };
  for (const g of gs) {
    const w = ctx.measureText(g).width;
    if (g === ' ') { flush(); gitems.push({ g: ' ', x, w }); x += w; witems.push({ space: true, w }); continue; }
    if (!cur) cur = { x0: x, items: [] };
    gitems.push({ g, x, w });
    cur.items.push({ g, x, w });
    x += w;
  }
  flush();
  L = { gitems, witems, total: x };
  if (layoutCache.size > 800) layoutCache.clear();
  layoutCache.set(key, L);
  return L;
}

/* st: pop | slide | wave | type | blast | rise */
export function drawKineticLine(ctx, line, tm, exitA, accent) {
  if (tm < 0 || !line.text) return;
  const s = S();
  const size = (+line.size || 64) * s;
  const col = line.color === 'accent' ? accent : (line.color === 'custom' ? (line.custom || '#ffffff') : '#f2f6ff');
  const st = line.style || 'pop';
  const L = layoutLine(ctx, line.text, +line.size || 64, s);
  const x0 = W / 2 - L.total / 2, y = line.y * H;
  const perWord = (st === 'slide' || st === 'blast' || st === 'rise');
  const items = perWord ? L.witems.filter(w => !w.space) : L.gitems.filter(g => g.g !== ' ');
  const n = items.length;
  if (!n) return;
  const STAG = st === 'type' ? 0.035 : 0.05, DUR = 0.55;

  if (line.plate) {
    const pA = clamp((tm - (n - 1) * STAG) / DUR, 0, 1) * exitA;
    if (pA > 0.01) {
      ctx.save(); ctx.globalAlpha = pA * 0.88;
      ctx.fillStyle = 'rgba(8,11,18,0.85)'; ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 2 * s;
      rr(ctx, W / 2 - (L.total + size * 0.9) / 2, y - size * 0.78, L.total + size * 0.9, size * 1.56, 16 * s);
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  ctx.save();
  ctx.font = fontF(size); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = col;                       // glyphs were inheriting the vignette's near-black
  if (line.color === 'accent') { ctx.shadowColor = accent; ctx.shadowBlur = 30 * s; }
  else { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 14 * s; }

  /* dark outline keeps the line readable on top of any photo — the glow alone
     only separates the text from a dark plate, not from a busy image */
  const outline = line.outline === undefined ? true : !!line.outline;
  if (outline) { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.strokeStyle = 'rgba(0,0,0,0.62)'; }

  items.forEach((it, i) => {
    let a = 1, dx = 0, dy = 0, s2 = 1, rot = 0;
    const p = clamp((tm - i * STAG) / DUR, 0, 1);
    if (st === 'pop') { a = p; s2 = backOut(p); dy = (1 - easeOutCubic(p)) * 34 * s; }
    else if (st === 'slide') { a = p; dx = (i % 2 ? 1 : -1) * (1 - easeOutCubic(p)) * 90 * s; }
    else if (st === 'wave') { a = p; s2 = 0.7 + 0.3 * backOut(p); dy = Math.sin(tm * 3 + i * 0.55) * 7 * s; }
    else if (st === 'type') { a = tm > i * STAG ? 1 : 0; }
    else if (st === 'blast') {
      const r = frac(Math.sin((i + 1) * 127.1) * 43758.545); const e = easeOutCubic(p);
      a = p; dx = (r - 0.5) * (1 - e) * 560 * s; dy = (((r * 7.31) % 1) - 0.5) * (1 - e) * 380 * s;
      rot = (r - 0.5) * (1 - e) * 0.7; s2 = 0.6 + 0.4 * e;
    }
    else if (st === 'rise') { a = p; dy = (1 - easeOutCubic(p)) * 80 * s; }
    if (a <= 0.003) return;
    const di = perWord ? it.items : [it];
    const cx = x0 + it.x + it.w / 2;
    ctx.save(); ctx.globalAlpha *= a * exitA;
    ctx.translate(cx, y + dy);
    if (rot) ctx.rotate(rot);
    if (s2 !== 1) ctx.scale(s2, s2);
    if (outline) {
      ctx.lineWidth = Math.max(2 * s, size * 0.085);
      for (const gi of di) ctx.strokeText(gi.g, x0 + gi.x - cx, 0);
    }
    for (const gi of di) ctx.fillText(gi.g, x0 + gi.x - cx, 0);
    ctx.restore();
  });

  if (st === 'type') {
    const vi = Math.min(n - 1, Math.floor(tm / STAG));
    if (tm > vi * STAG && tm < n * STAG + 2.2 && Math.floor(tm * 2.6) % 2 === 0) {
      ctx.save(); ctx.globalAlpha *= exitA; ctx.fillStyle = col; ctx.shadowBlur = 0;
      ctx.fillRect(x0 + items[vi].x + items[vi].w + 8 * s, y - size * 0.5, Math.max(4 * s, size * 0.08), size);
      ctx.restore();
    }
  }
  ctx.restore();
}
