import { useRef } from 'react';
import { useStudio } from '../state/StudioContext.jsx';

export default function LeftPanel() {
  const { project, dispatch, selId, setSelId, rt, actions } = useStudio();
  const fileRef = useRef(null);

  const onImage = e => {
    if (e.target.files && e.target.files.length) actions.addMedia(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="colL">
      <div className="sect">📚 ছবির বিন ({project.media.length})</div>

      {project.media.length > 0 && (
        <div className="binGrid">
          {project.media.map(m => (
            <div key={m.id} className="binItem" title={m.name}>
              <img src={m.src} alt={m.name} draggable={false}
                onClick={() => actions.addLayer({ src: m.src, name: m.name })} />
              <button className="binAdd" title="এই ছবিটা বর্তমান সিনের স্ট্যাকে যোগ করো"
                onClick={() => actions.addLayer({ src: m.src, name: m.name })}>＋</button>
              <button className="binDel" title="বিন থেকে মুছো (যে সিনে আছে সেখানে থাকবে)"
                onClick={() => dispatch({ type: 'media/delete', id: m.id })}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => fileRef.current.click()}>🖼️ ছবি আপলোড</button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onImage} />
      <div className="hint">আপলোড করলে ছবি <b>বিনে</b> যাবে আর সাথে সাথে <b>নির্বাচিত সিনের স্ট্যাকে</b> বসবে।
        এক ছবি একাধিক সিনে চাইলে বিন থেকে <b>＋</b> চাপো।</div>

      <div className="sect">ব্র্যান্ড</div>
      <div className="row"><label>Accent</label>
        <input type="color" className="swatch" value={project.accent}
          onChange={e => dispatch({ type: 'project/patch', patch: { accent: e.target.value } })} /></div>
      <div className="row"><label>Background</label>
        <input type="color" className="swatch" value={project.bg}
          onChange={e => dispatch({ type: 'project/patch', patch: { bg: e.target.value } })} /></div>
      <div className="row"><label>ওয়াটারমার্ক</label>
        <input className="inp inpT" value={project.wm || ''} placeholder="GENESEON"
          onChange={e => dispatch({ type: 'project/patch', patch: { wm: e.target.value } })} /></div>

      <div className="sect">সিনসমূহ ({project.scenes.length})</div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
        onClick={() => dispatch({ type: 'scene/add', start: Math.round(rt.time * 10) / 10 })}>
        ＋ নতুন সিন (playhead থেকে)</button>

      {project.scenes.map(s => {
        const n = s.layers.length;
        const empty = n - s.layers.filter(L => L.src).length;
        return (
          <div key={s.id} className={'scItem' + (s.id === selId ? ' sel' : '')} onClick={() => setSelId(s.id)}>
            <div className="scTop">
              <span className="scName">{s.name}</span>
              {s.endcard && <span className="tag">END</span>}
              <span className={'tag' + (empty && !s.endcard ? ' blk' : '')} title="লেয়ার সংখ্যা">
                {s.endcard ? '—' : n + ' লেয়ার'}{empty && !s.endcard ? ' · ■' + empty : ''}
              </span>
            </div>
            <div className="scTop" style={{ marginTop: 4 }}>
              <span className="scTime">{(+s.start).toFixed(1)}–{(+s.end).toFixed(1)}s · {s.texts.length} লাইন</span>
              <div className="sp" />
              <button className="mini" onClick={e => { e.stopPropagation(); dispatch({ type: 'scene/move', id: s.id, dir: -1 }); }}>↑</button>
              <button className="mini" onClick={e => { e.stopPropagation(); dispatch({ type: 'scene/move', id: s.id, dir: 1 }); }}>↓</button>
              <button className="mini" onClick={e => { e.stopPropagation(); dispatch({ type: 'scene/duplicate', id: s.id }); }}>⧉</button>
              <button className="mini" onClick={e => { e.stopPropagation(); dispatch({ type: 'scene/delete', id: s.id }); }}>✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
