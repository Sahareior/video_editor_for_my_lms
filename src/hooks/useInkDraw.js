import { useRef, useEffect } from 'react';
import { clamp } from '../engine/math.js';
import { W, H } from '../engine/constants.js';
import { eventToStage, toNorm, pickInk, makeInk, dedupe } from '../engine/ink.js';
import { sceneAt } from '../engine/timeline.js';

/* Pointer model for the drawing layer, sharing the preview canvas with the
   camera drag. Draw mode owns the pointer while it is on; otherwise every
   gesture falls through to useCameraDrag unchanged.

     pen / ellipse / rect / arrow / line  → drag to create
     select                              → click to pick, drag to move
     alt-click                          → delete under the cursor
     shift                              → constrain (square / circle / 45°)
     ⌘Z / Ctrl+Z                        → undo

   Every handler returns true when it consumed the event, which is how
   PreviewStage decides whether to forward to the camera. */

const MIN_LEN = 7;

export function useInkDraw({
  rt, canvasRef, projectRef, selIdRef, recordingRef,
  setSelId, setSelInkId, setPlaying, setInkOn, dispatch,
}) {
  const drag = useRef(null);
  const selInkIdRef = useRef(null);
  const setSelInkIdRef = useRef(setSelInkId); setSelInkIdRef.current = setSelInkId;

  const ik = rt.inkEdit;

  const select = (id) => { ik.selInkId = id; selInkIdRef.current = id; setSelInkIdRef.current(id); };

  /* Undo is a stack of *inverse* operations, so every edit kind undoes
     through the same door: a draw is undone by deleting what it created, a
     delete by putting the stroke back, a move by restoring the old points. */
  const pushUndo = (op) => { ik.undo.push(op); if (ik.undo.length > 80) ik.undo.shift(); };
  const undo = () => {
    const op = ik.undo && ik.undo.pop();
    if (!op) return false;
    if (op.k === 'del') dispatch({ type: 'annot/delete', id: op.sid, annotId: op.id });
    else if (op.k === 'add') dispatch({ type: 'annot/add', id: op.sid, annot: op.annot });
    else if (op.k === 'pts') dispatch({ type: 'annot/update', id: op.sid, annotId: op.id, patch: { pts: op.pts } });
    return true;
  };

  const targetScene = () => {
    let sc = projectRef.current.scenes.find(s => s.id === selIdRef.current);
    if (!sc) {
      const h = sceneAt(projectRef.current.scenes, rt.time);
      if (h && h.id) {
        setSelId(h.id);
        sc = projectRef.current.scenes.find(s => s.id === h.id);
      }
    }
    return sc || null;
  };

  const fresh = (e) => {
    const p = eventToStage(e, canvasRef.current);
    return { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) };
  };

  const onPointerDown = (e) => {
    if (recordingRef.current || !ik || !ik.on || e.button === 2) return false;
    const sc = targetScene();
    if (!sc) return false;

    const p = fresh(e);
    const hit = pickInk(sc.annots, p.x, p.y, 18);

    /* alt-click = quick delete, works with any tool */
    if (e.altKey && hit) {
      pushUndo({ k: 'add', sid: sc.id, annot: hit });
      dispatch({ type: 'annot/delete', id: sc.id, annotId: hit.id });
      if (ik.selInkId === hit.id) select(null);
      return true;
    }

    if (ik.tool === 'select') {
      select(hit ? hit.id : null);
      if (hit) {
        drag.current = {
          mode: 'move', sid: sc.id, aid: hit.id,
          sx: p.x, sy: p.y, dx: 0, dy: 0,          // grab point
          base: hit.pts.map(q => ({ ...q })),      // geometry before the drag
        };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      }
      return true;
    }

    const draft = { tool: ik.tool, pts: [toNorm(p)], color: ik.color, width: ik.width };
    ik.draft = draft;
    drag.current = { mode: 'draw', sid: sc.id, start: p, draft };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    return true;
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || recordingRef.current) return false;
    const p = fresh(e);

    if (d.mode === 'draw') {
      if (d.draft.tool === 'pen') {
        const l = d.draft.pts[d.draft.pts.length - 1];
        if (Math.hypot(p.x - l.x * W, p.y - l.y * H) >= 3) d.draft.pts.push(toNorm(p));
      } else {
        const q = e.shiftKey ? constrain(d.start, p, d.draft.tool) : p;
        d.draft.pts = [toNorm(d.start), toNorm(q)];
      }
      return true;
    }

    if (d.mode === 'move') {
      const nx = (p.x - d.sx) / W, ny = (p.y - d.sy) / H;
      if (Math.abs(nx - d.dx) < 1e-6 && Math.abs(ny - d.dy) < 1e-6) return true;
      d.dx = nx; d.dy = ny;
      /* remember where the stroke started, once, so undo restores the
         original geometry rather than a frame of the drag */
      if (!d.undoPts) pushUndo({ k: 'pts', sid: d.sid, id: d.aid, pts: d.base });
      dispatch({
        type: 'annot/update', id: d.sid, annotId: d.aid,
        patch: { pts: d.base.map(q => ({ x: clamp(q.x + d.dx, 0, 1), y: clamp(q.y + d.dy, 0, 1) })) },
      });
      return true;
    }
    return false;
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return false;
    if (d.mode === 'move') return true; // the move was already dispatched live

    ik.draft = null;
    const pts = simplify(d.draft.pts);
    if (!longEnough(pts)) return true;

    const annot = makeInk({ tool: d.draft.tool, pts, color: d.draft.color, width: d.draft.width });
    dispatch({ type: 'annot/add', id: d.sid, annot });
    pushUndo({ k: 'del', sid: d.sid, id: annot.id });
    select(annot.id);
    announce(d.sid, annot, e);
    return true;
  };

  /* After drawing, put the playhead where the animation starts and run it,
     so the user immediately sees the stroke draw itself. */
  const announce = (sid, annot, e) => {
    const sc = projectRef.current.scenes.find(s => s.id === sid);
    if (!sc) return;
    const d = Math.max(0.05, (annot.anim && annot.anim.dur) || 0.55);
    const delay = Math.max(0, (annot.anim && annot.anim.delay) || 0);
    const from = sc.start + delay;
    const to = from + d + 0.12;
    if (rt.time >= from && rt.time < to) return; // already on screen — leave the playhead alone
    rt.time = from;
    rt.playing = true;
    if (setPlaying) setPlaying(true);
    const token = (ik.token = (ik.token || 0) + 1);
    setTimeout(() => {
      if (ik.token !== token || !rt.playing) return;
      rt.playing = false;
      if (setPlaying) setPlaying(false);
    }, Math.max(300, (to - from) * 1000));
  };

  /* ---------- undo + keyboard ---------- */
  useEffect(() => {
    const h = (e) => {
      if (!ik || !ik.on) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
      /* go through the real action so React state and the toolbar follow */
      if (e.key === 'Escape') { setInkOn(false); select(null); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const onContextMenu = (e) => { if (ik && ik.on) e.preventDefault(); };

  return {
    onPointerDown, onPointerMove, onPointerUp,
    onPointerCancel: onPointerUp, onContextMenu, undo,
    isActive: () => !!(ik && ik.on),
  };
}

/* ---------- helpers ---------- */

function constrain(a, p, tool) {
  const dx = p.x - a.x, dy = p.y - a.y;
  if (tool === 'ellipse' || tool === 'rect') {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + (dx < 0 ? -s : s), y: a.y + (dy < 0 ? -s : s) };
  }
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const r = Math.hypot(dx, dy);
  return { x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r };
}

/* same Ramer-Douglas-Peucker the renderer uses, so what gets stored is what
   actually gets drawn — keeps project files small for long scribbles */
function simplify(pts) {
  const src = pts.map(p => ({ x: p.x * W, y: p.y * H }));
  const clean = dedupe(src, 3);
  if (clean.length < 3) return clean.map(p => ({ x: p.x / W, y: p.y / H }));
  const keep = new Uint8Array(clean.length);
  keep[0] = keep[clean.length - 1] = 1;
  const stack = [[0, clean.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, fd = 2.4;
    const ax = clean[a].x, ay = clean[a].y, bx = clean[b].x, by = clean[b].y;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-6;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * clean[i].x - dx * clean[i].y + bx * ay - by * ax) / L;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return clean.filter((_, i) => keep[i]).map(p => ({ x: p.x / W, y: p.y / H }));
}

function longEnough(pts) {
  if (!pts || pts.length < 1) return false;
  if (pts.length === 1) return false;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.hypot((b.x - a.x) * W, (b.y - a.y) * H) >= MIN_LEN;
}
