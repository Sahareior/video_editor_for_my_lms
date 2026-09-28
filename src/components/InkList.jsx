import { useRef, useEffect } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import SliderRow from './SliderRow.jsx';
import { INK_TOOLS, ANIM_TYPES, INK_EASES, INK_COLORS, buildPath } from '../engine/ink.js';

/* live thumbnail of one stroke, drawn with the same geometry the renderer
   uses — no second source of truth for what a shape looks like */
function InkThumb({ annot, on }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = 132, H = 74;
    ctx.clearRect(0, 0, W, H);
    const p = buildPath(annot);
    if (!p) return;
    const b = p.bbox, pad = 10;
    const k = Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    ctx.translate(-b.cx, -b.cy);
    ctx.strokeStyle = annot.color || '#ffd60a';
    ctx.lineWidth = (annot.width || 9) / k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.pts[0].x, p.pts[0].y);
    for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i].x, p.pts[i].y);
    if (p.closed) ctx.closePath();
    ctx.stroke();
    if (p.head) {
      const hd = p.head, hx = p.pts[p.pts.length - 1].x, hy = p.pts[p.pts.length - 1].y;
      const bx = hx - hd.ux * hd.len, by = hy - hd.uy * hd.len;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(bx - hd.uy * hd.w, by + hd.ux * hd.w);
      ctx.lineTo(bx + hd.uy * hd.w, by - hd.ux * hd.w);
      ctx.closePath();
      ctx.fillStyle = annot.color || '#ffd60a';
      ctx.fill();
    }
    ctx.restore();
  }, [annot]);
  return <canvas ref={ref} width={132} height={74} className="inkThumb" style={on ? { borderColor: '#ffd60a' } : null} />;
}

const toolName = (t) => (INK_TOOLS.find(x => x.id === t) || {}).name || t;

export default function InkList() {
  const { selScene: sc, selInkId, setSelInkId, dispatch, inkOn, inkColor, inkWidth, actions } = useStudio();
  if (!sc) return null;

  const annots = sc.annots || [];
  const upd = (a, patch) => dispatch({ type: 'annot/update', id: sc.id, annotId: a.id, patch });
  const sel = annots.find(a => a.id === selInkId) || null;
  const ordered = [...annots].reverse(); // last drawn = on top

  return (
    <>
      <div className="sect">✏️ ড্র · অ্যানোটেশন ({annots.length})</div>

      <div className="row">
        <button className={'btn' + (inkOn ? ' sel' : '')} style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => actions.setInkOn(!inkOn)}>
          {inkOn ? '✏️ ড্র বন্ধ করো' : '✏️ ড্র মোড'}
        </button>
        {annots.length > 0 && (
          <button className="mini" style={{ width: 'auto', padding: '0 9px' }} title="সব ড্র মুছো"
            onClick={() => { if (confirm('এই সিনের সব ড্র মুছে যাবে — ঠিক আছে?')) { dispatch({ type: 'annot/clear', id: sc.id }); setSelInkId(null); } }}>🗑</button>
        )}
      </div>

      {inkOn && (
        <div className="hint">
          প্রিভিউ ক্যানভাসে সরাসরি <b>আঁকো</b> — ফ্রিহ্যান্ড টুল ফ্রি-হ্যান্ড,
          বৃত্ত/আয়তাক/তির টুলে <b>ড্র্যাগ</b> করো।
          <b>Shift</b> = সমান বাঁকা, <b>Alt+ক্লিক</b> = মুছো, <b>Ctrl+Z</b> = ফেরত, <b>Esc</b> = বন্ধ।
        </div>
      )}

      {!inkOn && annots.length === 0 && (
        <div className="hint">এই সিনে কোনো ড্র নেই। <b>✏️ ড্র মোড</b> চাপো তারপর প্রিভিউতে আঁকো।</div>
      )}

      {ordered.map(a => {
        const on = a.id === selInkId;
        return (
          <div key={a.id} className={'lyr inkLyr' + (on ? ' sel' : '')} onClick={() => setSelInkId(on ? null : a.id)}>
            <div className="lyrMain">
              <InkThumb annot={a} on={on} />
              <div className="lyrInfo">
                <div className="lyrName">{a.name || toolName(a.tool)}</div>
                <div className="lyrSub">
                  {toolName(a.tool)} · {Math.round(a.width)}px
                  {' · ' + (ANIM_TYPES.find(t => t.id === (a.anim || {}).type) || ANIM_TYPES[0]).name.split(' ').pop()}
                  {a.loop && ' ↻'}
                  {a.visible === false && ' · লুকানো'}
                </div>
              </div>
            </div>
            <div className="lyrBtns">
              <button className="mini" title="উপরে" onClick={e => { e.stopPropagation(); dispatch({ type: 'annot/move', id: sc.id, annotId: a.id, dir: 1 }); }}>↑</button>
              <button className="mini" title="নিচে" onClick={e => { e.stopPropagation(); dispatch({ type: 'annot/move', id: sc.id, annotId: a.id, dir: -1 }); }}>↓</button>
              <button className="mini" title={a.visible === false ? 'দেখাও' : 'লুকাও'}
                style={a.visible === false ? { borderColor: '#8c2f2f', color: '#ff7b7b' } : null}
                onClick={e => { e.stopPropagation(); upd(a, { visible: a.visible === false }); }}>{a.visible === false ? '○' : '◉'}</button>
              <button className="mini" title="এই ড্র দেখাও (প্লে চেপে অ্যানিমেশন দেখো)"
                onClick={e => { e.stopPropagation(); actions.previewInk(a); }}>▶</button>
              <button className="mini" title="মুছে ফেলো"
                onClick={e => { e.stopPropagation(); dispatch({ type: 'annot/delete', id: sc.id, annotId: a.id }); }}>✕</button>
            </div>
          </div>
        );
      })}

      {sel && (
        <div className="inkEdit" onClick={e => e.stopPropagation()}>
          <div className="row" style={{ marginBottom: 6 }}>
            <label>নাম</label>
            <input className="inp inpT" value={sel.name || ''} onChange={e => upd(sel, { name: e.target.value })} />
          </div>

          <div className="row">
            <label>রঙ</label>
            <div className="chipRow" style={{ margin: 0 }}>
              {INK_COLORS.map(c => (
                <button key={c} className={'inkDot' + (sel.color === c ? ' on' : '')}
                  style={{ background: c, borderColor: c === '#0a0d15' ? '#3a4560' : c }}
                  onClick={() => upd(sel, { color: c })} />
              ))}
            </div>
          </div>

          <SliderRow label="মোটা" v={sel.width} min={2} max={48} step={1} set={v => upd(sel, { width: v })} />

          {(sel.tool === 'ellipse' || sel.tool === 'rect') && (
            <label className="chk">
              <input type="checkbox" checked={!!sel.fill}
                onChange={e => upd(sel, { fill: e.target.checked ? (sel.color === '#0a0d15' ? '#ffd60a' : sel.color) : null })} />
              ভেতর হালকা রঙ
            </label>
          )}

          <div className="row">
            <label>অ্যানিমেশন</label>
            <select className="sel" value={(sel.anim || {}).type || 'draw'}
              onChange={e => upd(sel, { anim: { ...sel.anim, type: e.target.value } })}>
              {ANIM_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <SliderRow label="সময়" v={(sel.anim || {}).dur} min={0.05} max={4} step={0.05}
            set={v => upd(sel, { anim: { ...sel.anim, dur: v } })} />
          <SliderRow label="ডিলে" v={(sel.anim || {}).delay} min={0} max={6} step={0.05}
            set={v => upd(sel, { anim: { ...sel.anim, delay: v } })} />

          <div className="row">
            <label>ইজ</label>
            <select className="sel" value={(sel.anim || {}).ease || 'out'}
              onChange={e => upd(sel, { anim: { ...sel.anim, ease: e.target.value } })}>
              {INK_EASES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          <label className="chk">
            <input type="checkbox" checked={!!sel.loop} onChange={e => upd(sel, { loop: e.target.checked })} />
            ↻ বারবার লুপ করুক
          </label>
          <label className="chk">
            <input type="checkbox" checked={sel.exitFade !== false} onChange={e => upd(sel, { exitFade: e.target.checked })} />
            সিন শেষে মুছে যাবে
          </label>

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => actions.previewInk(sel)}>
              ▶ অ্যানিমেশন দেখাও
            </button>
          </div>
        </div>
      )}
    </>
  );
}
