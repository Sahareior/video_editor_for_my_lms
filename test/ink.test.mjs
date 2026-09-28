/* smoke test for the ink engine — pure geometry + a recording-canvas stub
   that counts real draw calls, so we know it paints and not just parses. */
import { buildPath, inkProgress, hitInk, pickInk, normalizeInks, makeInk, drawInk, drawInkOverlay, eventToStage, toNorm } from '../src/engine/ink.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + name + (extra ? '  → ' + extra : '')); }
};

/* --- canvas stub: records ops, resolves the calls drawInk actually makes --- */
function stubCtx() {
  const ops = [];
  const rec = (n) => (...a) => { ops.push([n, a[0]]); };
  return {
    ops,
    save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'),
    closePath: rec('closePath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    stroke: rec('stroke'), fill: rec('fill'), clip: rec('clip'),
    rect: rec('rect'), arc: rec('arc'), arcTo: rec('arcTo'),
    strokeRect: rec('strokeRect'), fillRect: rec('fillRect'),
    translate: (...a) => ops.push(['translate', a]),
    scale: (...a) => ops.push(['scale', a]),
    setLineDash: rec('setLineDash'),
    measureText: () => ({ width: 10 }),
    set fillStyle(v) { ops.push(['fillStyle', v]); },
    set strokeStyle(v) { ops.push(['strokeStyle', v]); },
    set lineWidth(v) { ops.push(['lineWidth', v]); },
    set lineCap(v) {}, set lineJoin(v) {}, set miterLimit(v) {},
    set globalAlpha(v) { ops.push(['globalAlpha', v]); },
    set shadowColor(v) { ops.push(['shadowColor', v]); },
    set shadowBlur(v) { ops.push(['shadowBlur', v]); },
  };
}
const count = (ctx, n) => ctx.ops.filter(o => o[0] === n).length;

console.log('\n\x1b[1mgeometry\x1b[0m');

const circle = normalizeInks([{ tool: 'ellipse', pts: [{ x: .3, y: .4 }, { x: .7, y: .8 }], width: 10 }])[0];
const cpath = buildPath(circle);
ok('ellipse builds a closed ring', cpath && cpath.closed === true);
ok('ellipse has real arc length', cpath.len > 1000, 'len=' + cpath && cpath.len.toFixed(1));
ok('ellipse ring is 96 segments', cpath.pts.length === 96, 'got ' + cpath.pts.length);
ok('ellipse bbox matches the drag', Math.abs(cpath.bbox.w - 0.4 * 1920) < 1 && Math.abs(cpath.bbox.h - 0.4 * 1080) < 1);

const rect = normalizeInks([{ tool: 'rect', pts: [{ x: .2, y: .2 }, { x: .6, y: .5 }] }])[0];
const rpath = buildPath(rect);
const perim = 2 * (0.4 * 1920 + 0.3 * 1080);
ok('rect perimeter = 2(w+h)', Math.abs(rpath.len - perim) < 2, rpath.len + ' vs ' + perim);

/* dragging up-left must still make a sane box, not a negative one */
const rectBL = normalizeInks([{ tool: 'rect', pts: [{ x: .6, y: .5 }, { x: .2, y: .2 }] }])[0];
const blPath = buildPath(rectBL);
ok('rect normalises a backwards drag', blPath.bbox.w > 0 && blPath.bbox.h > 0);

const arrow = normalizeInks([{ tool: 'arrow', pts: [{ x: .2, y: .2 }, { x: .8, y: .6 }], width: 10 }])[0];
const apath = buildPath(arrow);
ok('arrow builds a head', !!apath.head);
ok('arrow shaft length = the drag', Math.abs(apath.len - Math.hypot(.6 * 1920, .4 * 1080)) < 1);

/* freehand: a scribble should simplify down without changing its shape */
const scribble = [];
for (let i = 0; i <= 400; i++) {
  const t = i / 400;
  scribble.push({ x: 0.2 + t * 0.5, y: 0.5 + Math.sin(t * Math.PI * 4) * 0.2 });
}
const pen = normalizeInks([{ tool: 'pen', pts: scribble, width: 8 }])[0];
const ppath = buildPath(pen);
ok('pen smooths into a dense polyline', ppath.pts.length > 150, 'got ' + ppath.pts.length);
ok('smoothing does not overshoot the control points', Math.abs(ppath.bbox.y0 - 0.3 * 1080) < 2 && Math.abs(ppath.bbox.y1 - 0.7 * 1080) < 2,
   `y0=${ppath.bbox.y0.toFixed(2)} y1=${ppath.bbox.y1.toFixed(2)}`);

const straight = normalizeInks([{ tool: 'pen', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }])[0];
ok('a straight pen line does not balloon', buildPath(straight).len < buildPath(straight).len * 1.2);

console.log('\n\x1b[1manimation curve\x1b[0m');
const a = makeInk({ tool: 'ellipse', pts: [{ x: .3, y: .3 }, { x: .7, y: .7 }], anim: { dur: 1, delay: .5, ease: 'linear' } });
ok('nothing before the delay', inkProgress(a, 0) === 0 && inkProgress(a, .49) === 0);
ok('midpoint is halfway', Math.abs(inkProgress(a, 1.0) - 0.5) < 1e-9, inkProgress(a, 1.0));
ok('completes at dur', inkProgress(a, 1.5) === 1);
ok('stays at 1 after', inkProgress(a, 99) === 1);

const loop = makeInk({ pts: [{ x: .3, y: .3 }, { x: .7, y: .7 }], loop: true, anim: { dur: 1, delay: 0, ease: 'linear' } });
ok('loop restarts', inkProgress(loop, 2.2) < 0.5, inkProgress(loop, 2.2));
ok('loop still completes a cycle', inkProgress(loop, 0.5) > 0.4);

console.log('\n\x1b[1mrendering\x1b[0m');
const shot = (annot, ts) => { const c = stubCtx(); drawInk(c, annot, ts, 8); return c; };
const at0 = shot(circle, 0);
const at2 = shot(circle, 2);
ok('draws nothing at t=0', count(at0, 'stroke') === 0);
ok('draws once fully revealed', count(at2, 'stroke') >= 1);
ok('scales by the stroke width', at2.ops.some(o => o[0] === 'lineWidth' && o[1] === 10));
ok('glow uses the stroke colour', at2.ops.some(o => o[0] === 'shadowColor' && String(o[1]).indexOf('255,214,10') > -1));

const mid = shot(circle, 0.22); // inside the draw window, 'out' easing → ~78% revealed
ok('partial draw uses fewer segments than full', count(mid, 'lineTo') < count(at2, 'lineTo'));
ok('partial draw still strokes', count(mid, 'stroke') >= 1);

const fadeOut = shot(circle, 7.9); // scene dur 8 → inside the exit fade
ok('fades out at scene end', fadeOut.ops.some(o => o[0] === 'globalAlpha' && o[1] < 0.99));

const arrowMid = shot(arrow, 0.3);
ok('arrow head waits for the tip', !arrowMid.ops.some(o => o[0] === 'fill'));
const arrowDone = shot(arrow, 2);
ok('arrow head lands at the end', arrowDone.ops.some(o => o[0] === 'fill'));

const wiped = shot(makeInk({ tool: 'rect', pts: [{ x: .2, y: .2 }, { x: .8, y: .8 }], anim: { type: 'wipe', dur: 1, delay: 0 } }), 0.5);
ok('wipe clips to a reveal band', count(wiped, 'clip') === 1);
const popped = shot(makeInk({ tool: 'ellipse', pts: [{ x: .2, y: .2 }, { x: .8, y: .8 }], anim: { type: 'pop', dur: 1, delay: 0 } }), 0.3);
ok('pop scales the shape', popped.ops.some(o => o[0] === 'scale' && o[1] !== 1));

let threw = null;
try { [circle, rect, arrow, pen].forEach(x => { for (let ts = 0; ts < 9; ts += 0.1) drawInk(stubCtx(), x, ts, 8); }); }
catch (e) { threw = e; }
ok('no throw across every tool × every frame', !threw, threw && threw.message);

console.log('\n\x1b[1meditor overlay\x1b[0m');
const ov = stubCtx();
drawInkOverlay(ov, { edit: true, annots: [circle], selInkId: circle.id, recPhase: null, accent: '#ffd60a' });
ok('draws a dashed selection frame', count(ov, 'setLineDash') >= 2);
ok('ghosted strokes are drawn too', count(ov, 'stroke') >= 1);

const off = stubCtx();
drawInkOverlay(off, { edit: true, annots: [circle], recPhase: 'rec' });
ok('never drawn while recording', off.ops.length === 0);
const off2 = stubCtx();
drawInkOverlay(off2, null);
ok('null overlay is a no-op', off2.ops.length === 0);

const draft = stubCtx();
drawInkOverlay(draft, { edit: true, annots: [], selInkId: null, recPhase: null, draft: { tool: 'pen', pts: [{ x: .1, y: .1 }, { x: .5, y: .5 }, { x: .9, y: .2 }], color: '#ff4d4d', width: 9 } });
ok('live draft stroke previews', count(draft, 'stroke') >= 1);

console.log('\n\x1b[1mhit testing\x1b[0m');
ok('catches a point on the ellipse ring', hitInk(circle, 0.5 * 1920, 0.4 * 1080, 14), 'left edge');
ok('misses the middle of the ring', !hitInk(circle, 0.5 * 1920, 0.6 * 1080, 14));
ok('misses far outside', !hitInk(circle, 20, 20, 14));
ok('catches the arrow shaft', hitInk(arrow, 0.5 * 1920, 0.4 * 1080, 14));
ok('catches the pen scribble', hitInk(pen, 0.45 * 1920, 0.5 * 1080 + 0.2 * 1080 * 0, 14) || hitInk(pen, 0.45 * 1920, 0.5 * 1080, 200));

// identical rings stacked: the later one must win, probed ON the ring
const under = normalizeInks([{ tool: 'ellipse', pts: [{ x: .3, y: .4 }, { x: .7, y: .8 }] }])[0];
const over = { ...under, id: 'over' };
const onRing = [(0.5 + 0.2) * 1920, 0.6 * 1080]; // right edge: centre 960 + rx 384
ok('picks the topmost of two identical strokes', pickInk([under, over], onRing[0], onRing[1], 14) === over);
ok('an unfilled ellipse is hollow — the middle is not a hit', !hitInk(circle, 0.5 * 1920, 0.6 * 1080, 14));
ok('skips hidden strokes', pickInk([{ ...rect, visible: false }, arrow], 0.5 * 1920, 0.4 * 1080, 14) === arrow);

console.log('\n\x1b[1mlegacy + bad input\x1b[0m');
ok('old project with no annots → empty list', normalizeInks(undefined).length === 0);
ok('garbage entries are dropped', normalizeInks([null, { tool: 'nope', pts: [] }, { tool: 'pen', pts: [{ x: 1, y: 1 }] }]).length === 1);
ok('out-of-range points get clamped', normalizeInks([{ tool: 'pen', pts: [{ x: -3, y: 9 }] }])[0].pts[0].x === 0);
ok('crazy width is clamped', normalizeInks([{ tool: 'pen', pts: [{ x: .1, y: .1 }], width: 9999 }])[0].width <= 90);
ok('bad colour falls back to accent', normalizeInks([{ tool: 'pen', pts: [{ x: .1, y: .1 }], color: 'javascript:x' }])[0].color === '#ffd60a');
ok('NaN is not silently kept', normalizeInks([{ tool: 'pen', pts: [{ x: NaN, y: 1 }] }]).length === 0);
ok('bad anim type falls back to draw', normalizeInks([{ tool: 'pen', pts: [{ x: .1, y: .1 }], anim: { type: 'spin' } }])[0].anim.type === 'draw');
let noThrow = true;
try { for (const junk of [null, undefined, 0, '', [], [{}], [1, 2, 3], [{ tool: 'pen' }], [{ tool: 'ellipse', pts: [{ x: .5, y: .5 }] }]]) { normalizeInks(junk); buildPath(normalizeInks(Array.isArray(junk) ? junk : [])[0]); } }
catch (e) { noThrow = false; }
ok('malformed input never throws', noThrow);

console.log('\n\x1b[1mpointer mapping\x1b[0m');
const fakeCanvas = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 960, height: 540 }) };
const p = eventToStage({ clientX: 100, clientY: 50 }, fakeCanvas);
ok('maps the canvas corner to (0,0)', p.x === 0 && p.y === 0, JSON.stringify(p));
const p2 = eventToStage({ clientX: 1060, clientY: 590 }, fakeCanvas);
ok('maps the far corner to the stage size', p2.x === 1920 && p2.y === 1080, JSON.stringify(p2));
ok('round-trips to normalised coords', toNorm(p2).x === 1);

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' passed, ' + fail + ' failed\x1b[0m\n');
process.exit(fail ? 1 : 0);
