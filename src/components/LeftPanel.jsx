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
      <div className="sect">📚 Media bin ({project.media.length})</div>

      {project.media.length > 0 && (
        <div className="binGrid">
          {project.media.map(m => (
            <div key={m.id} className="binItem" title={m.name}>
              <img src={m.src} alt={m.name} draggable={false}
                onClick={() => actions.addLayer({ src: m.src, name: m.name })} />
              <button className="binAdd" title="Add this image to the current scene's stack"
                onClick={() => actions.addLayer({ src: m.src, name: m.name })}>＋</button>
              <button className="binDel" title="Delete from the bin (stays wherever it is already placed)"
                onClick={() => dispatch({ type: 'media/delete', id: m.id })}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => fileRef.current.click()}>🖼️ Upload images</button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onImage} />
      <div className="hint">Uploaded images go into the <b>bin</b> and land on the <b>selected scene's stack</b> right away.
        Want one image in several scenes? Press <b>＋</b> in the bin.</div>

      <div className="sect">Brand</div>
      <div className="row"><label>Accent</label>
        <input type="color" className="swatch" value={project.accent}
          onChange={e => dispatch({ type: 'project/patch', patch: { accent: e.target.value } })} /></div>
      <div className="row"><label>Background</label>
        <input type="color" className="swatch" value={project.bg}
          onChange={e => dispatch({ type: 'project/patch', patch: { bg: e.target.value } })} /></div>
      <div className="row"><label>Watermark</label>
        <input className="inp inpT" value={project.wm || ''} placeholder="GENESEON"
          onChange={e => dispatch({ type: 'project/patch', patch: { wm: e.target.value } })} /></div>

      <div className="sect">Scenes ({project.scenes.length})</div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
        onClick={() => dispatch({ type: 'scene/add', start: Math.round(rt.time * 10) / 10 })}>
        ＋ New scene (from playhead)</button>

      {project.scenes.map(s => {
        const n = s.layers.length;
        const empty = n - s.layers.filter(L => L.src).length;
        return (
          <div key={s.id} className={'scItem' + (s.id === selId ? ' sel' : '')} onClick={() => setSelId(s.id)}>
            <div className="scTop">
              <span className="scName">{s.name}</span>
              {s.endcard && <span className="tag">END</span>}
              <span className={'tag' + (empty && !s.endcard ? ' blk' : '')} title="Layer count">
                {s.endcard ? '—' : n + (n === 1 ? ' layer' : ' layers')}{empty && !s.endcard ? ' · ■' + empty : ''}
              </span>
            </div>
            <div className="scTop" style={{ marginTop: 4 }}>
              <span className="scTime">{(+s.start).toFixed(1)}–{(+s.end).toFixed(1)}s · {s.texts.length} {s.texts.length === 1 ? 'line' : 'lines'}</span>
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
