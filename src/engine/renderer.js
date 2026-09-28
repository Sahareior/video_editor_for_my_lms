import { W, H, fontF, S } from './constants.js';
import { clamp, hexA, backOut } from './math.js';
import { drawKineticLine } from './kinetic.js';
import { drawCamImage, evalCam } from './camera.js';
import { drawInks, drawInkOverlay } from './ink.js';
import { getImg } from './imageCache.js';
import { sceneAt } from './timeline.js';

/* Composite a scene's layer stack back-to-front.
   A layer with no src draws its flat fill instead of an image — that is the
   "removed the picture, kept the slot black" state. */
function drawLayers(ctx, sc, p) {
  const layers = sc.layers || [];
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    if (!L || L.visible === false) continue;
    const op = clamp(L.opacity === undefined ? 1 : +L.opacity, 0, 1);
    if (op <= 0.002) continue;

    ctx.save();
    ctx.globalAlpha = op;
    ctx.fillStyle = L.fill || '#000000';
    ctx.fillRect(0, 0, W, H); // base fill — also the "gap" colour
    if (L.src) {
      const im = getImg(L.src);
      if (im) drawCamImage(ctx, im, evalCam(L, p));
    }
    ctx.restore();
  }
}

export function renderFrame(ctx, t, P, rt) {
  /* every literal below used to be a 1920/1080/960/540 constant — they are
     now derived so the same composition renders on any aspect ratio */
  const s = S();
  const cx = W / 2, cy = H / 2;
  const R = Math.hypot(W, H) / 2;   // half-diagonal: a ratio-agnostic "far" distance

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.setLineDash([]);
  ctx.fillStyle = P.bg || '#0a0d15';
  ctx.fillRect(0, 0, W, H);

  const accent = P.accent || '#ffd60a';
  const sc = sceneAt(P.scenes || [], t);

  if (sc) {
    if (!sc.endcard) {
      const p = clamp((t - sc.start) / Math.max(.001, sc.end - sc.start), 0, 1);
      drawLayers(ctx, sc, p);

      // preview-only nudge when a scene has nothing on it (never baked into a recording)
      if (!(sc.layers || []).length && rt && !rt.recPhase) {
        ctx.fillStyle = '#2c3a58'; ctx.font = '600 ' + Math.round(46 * s) + 'px "Inter", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('＋ Add an image from “Layer” in the right panel', cx, cy);
      }

      const dim = +sc.dim || 0;
      if (dim > 0.01) {
        const inner = 1 - clamp(+sc.spot || 0, 0, 1);
        const g = ctx.createRadialGradient(cx, cy, R * 0.12, cx, cy, R);
        g.addColorStop(0, 'rgba(0,0,0,' + (dim * inner * 0.92).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(0,0,0,' + dim.toFixed(3) + ')');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        if ((+sc.spot || 0) > 0.03) {
          ctx.save(); ctx.strokeStyle = accent; ctx.globalAlpha = .45; ctx.lineWidth = Math.max(2, 3 * s);
          ctx.shadowColor = accent; ctx.shadowBlur = 20 * s;
          ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.139, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
    } else {
      const egY = H * 0.426, egR = R * 0.777;
      const rg = ctx.createRadialGradient(cx, egY, egR * 0.095, cx, egY, egR);
      rg.addColorStop(0, hexA(accent, .13)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = hexA(accent, .65); ctx.lineWidth = Math.max(2, 3 * s);
      /* the rules spanned 770..1150 on 1920 — keep them at the same inset */
      const x0 = W * 0.401, x1 = W * 0.599;
      ctx.beginPath(); ctx.moveTo(x0, H * 0.111); ctx.lineTo(x1, H * 0.111); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, H * 0.887); ctx.lineTo(x1, H * 0.887); ctx.stroke();
    }

    /* `ts` is the scene-local clock every animated thing reads from */
    const dur = Math.max(.001, sc.end - sc.start), ts = t - sc.start;

    if (!sc._holdOnly) {
      const q = clamp((ts - (dur - .35)) / .35, 0, 1), exitA = 1 - q * q * (3 - 2 * q);
      (sc.texts || []).forEach(L => drawKineticLine(ctx, L, ts - (+L.delay || 0), exitA, accent));
    }

    /* drawn ink — drawn on top of the imagery, below the watermark, and
       baked into the recording because it lives in renderFrame() */
    drawInks(ctx, sc.annots, ts, dur);

    if (P.wm && !sc.endcard) {
      ctx.save(); ctx.globalAlpha = .55; ctx.font = fontF(26 * s);
      try { ctx.letterSpacing = '6px'; } catch {}
      ctx.fillStyle = accent; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(P.wm, W - 44 * s, 64 * s);
      try { ctx.letterSpacing = '0px'; } catch {}
      ctx.restore();
    }
  } else if (!(P.scenes || []).length) {
    ctx.fillStyle = '#2c3a58'; ctx.font = '600 ' + Math.round(44 * s) + 'px "Inter", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('＋ Add a new scene', cx, cy);
  }

  /* preview-only: outline the layer currently selected in the Layer stack */  if (sc && !sc.endcard && rt && !rt.recPhase && rt.selLayerId) {
    const L = (sc.layers || []).find(l => l.id === rt.selLayerId);
    if (L && L.visible !== false) {
      ctx.save();
      ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2, 3 * s); ctx.globalAlpha = .8;
      ctx.setLineDash([14 * s, 10 * s]);
      ctx.strokeRect(8 * s, 8 * s, W - 16 * s, H - 16 * s);
      ctx.setLineDash([]);
      const tag = (L.src ? L.name || 'Layer' : '■ Empty (black)');
      ctx.font = fontF(26 * s);
      const tw = ctx.measureText(tag).width + 26 * s;
      ctx.globalAlpha = .92;
      ctx.fillStyle = accent;
      ctx.fillRect(8 * s, 8 * s, tw, 42 * s);
      ctx.fillStyle = '#0a0d15'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(tag, 21 * s, 30 * s);
      ctx.restore();
    }
  }

  const vg = ctx.createRadialGradient(cx, cy, R * 0.405, cx, cy, R);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  /* preview-only ink editing chrome — selection frames, handles, live draft */
  drawInkOverlay(ctx, rt && rt.inkEdit ? { ...rt.inkEdit, recPhase: rt.recPhase, accent } : null);

  /* recording countdown overlay */
  if (rt && rt.recPhase === 'count') {
    const rem = Math.max(0, 3 - (performance.now() - rt.recT0) / 1000);
    const n = Math.max(1, Math.ceil(rem)), f = clamp(rem - Math.floor(rem), 0, 1);
    ctx.fillStyle = 'rgba(3,5,10,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(cx, cy);
    const s2 = 0.8 + 0.25 * backOut(clamp((1 - f) * 2.4, 0, 1));
    ctx.scale(s2, s2);
    ctx.font = fontF(330 * s); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 60 * s;
    ctx.globalAlpha = clamp(.15 + f * 1.2, 0, 1);
    ctx.fillText(['3', '2', '1'][3 - n] || '3', 0, 0);
    ctx.restore();
  }
}
