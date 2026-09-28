import { useRef } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import SliderRow from './SliderRow.jsx';

/* The compositor panel. A scene's layer stack is listed top-most first
   (the list is reversed because index 0 is the bottom-most layer).
   Each row: pick it to drive the camera, ⬛ to drop the picture and leave a
   black gap, ✕ to remove the layer entirely, 👁 to hide it. */

function LayerRow({ L, i, sel }) {
  const { dispatch, selScene, actions, project, setSelLayerId } = useStudio();
  const sid = selScene.id;
  const u = patch => dispatch({ type: 'layer/update', sceneId: sid, layerId: L.id, patch });

  return (
    <div className={'lyr' + (sel ? ' sel' : '')} onClick={() => setSelLayerId(L.id)}>
      <div className="lyrMain">
        <div className="lyrThumb">
          {L.src
            ? <img src={L.src} alt="" draggable={false} />
            : <div className="lyrBlack" style={{ background: L.fill || '#000' }}><span>■</span></div>}
        </div>
        <div className="lyrInfo">
          <div className="lyrName">{L.name || 'Layer'} <span className="lyrIdx">#{i + 1}</span></div>
          <div className="lyrSub">
            {L.src ? '▣ Image' : '■ Empty'}
            {L.opacity < 1 && ' · ' + Math.round(L.opacity * 100) + '%'}
            {L.visible === false && ' · Hidden'}
            {L.camKeys && L.camKeys.length ? ' · ⭐ Keyframes' : ''}
          </div>
        </div>
      </div>
      <div className="lyrBtns">
        <button className="mini" title="Move up/down (stack order)"
          onClick={e => { e.stopPropagation(); dispatch({ type: 'layer/move', sceneId: sid, layerId: L.id, dir: 1 }); }}>↑</button>
        <button className="mini" title="Move down/up"
          onClick={e => { e.stopPropagation(); dispatch({ type: 'layer/move', sceneId: sid, layerId: L.id, dir: -1 }); }}>↓</button>
        <button className="mini" title={L.visible === false ? 'Show' : 'Hide'}
          style={L.visible === false ? { borderColor: '#8c2f2f', color: '#ff7b7b' } : null}
          onClick={e => { e.stopPropagation(); u({ visible: L.visible === false }); }}>{L.visible === false ? '○' : '◉'}</button>
        <button className="mini" title={L.src ? 'Remove image — the slot turns black' : 'Place an image from the bin'}
          onClick={e => { e.stopPropagation(); L.src ? actions.clearLayer(L.id) : null; }}>
          {L.src ? '■' : '▣'}
        </button>
        <button className="mini" title="Duplicate"
          onClick={e => { e.stopPropagation(); dispatch({ type: 'layer/duplicate', sceneId: sid, layerId: L.id }); }}>⧉</button>
        <button className="mini" title="Delete layer"
          onClick={e => { e.stopPropagation(); dispatch({ type: 'layer/delete', sceneId: sid, layerId: L.id }); }}>✕</button>
      </div>

      {sel && (
        <div className="lyrEdit" onClick={e => e.stopPropagation()}>
          <div className="row" style={{ marginBottom: 6 }}>
            <label>Name</label>
            <input className="inp inpT" value={L.name} onChange={e => u({ name: e.target.value })} />
          </div>
          <SliderRow label="Opacity" v={L.opacity} min={0} max={1} step={0.01} set={v => u({ opacity: v })} />

          {!L.src && (
            <div className="row">
              <label>Gap colour</label>
              <input type="color" className="swatch" value={L.fill || '#000000'}
                onChange={e => u({ fill: e.target.value })} />
              <span className="val" style={{ minWidth: 0 }}>Empty slot = this colour</span>
            </div>
          )}

          <div className="row">
            <label>Image</label>
            <select className="sel" value="" onChange={e => {
              const m = project.media.find(x => x.id === e.target.value);
              if (m) actions.fillLayer(L.id, m);
            }}>
              <option value="">— Place from the bin —</option>
              {project.media.map(m => <option key={m.id} value={m.id}>▣ {m.name}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LayerStack() {
  const { selScene, selLayerId, setSelLayerId, actions, project } = useStudio();
  const fileRef = useRef(null);
  if (!selScene) return null;

  const layers = selScene.layers || [];
  const ordered = [...layers].reverse(); // top-most layer first
  const offset = layers.length;

  return (
    <>
      <div className="sect">🗂 Layer stack ({layers.length})</div>

      <div className="row">
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => fileRef.current.click()}>＋ Image</button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => actions.addLayer({ src: null, fill: '#000000', name: 'Empty layer' })}>＋ Empty (black)</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={e => { actions.addMedia(e.target.files); e.target.value = ''; }} />

      {layers.length === 0 && (
        <div className="hint">This scene has no layers — the screen is fully black. Press <b>＋ Image</b> and it lands instantly.</div>
      )}

      {/* top-most layer first (index 0 is the bottom of the stack) */}
      {ordered.map((L, i) => (
        <LayerRow key={L.id} L={L} i={offset - 1 - i} sel={L.id === selLayerId} />
      ))}

      {selLayerId && (
        <div className="hint">
          In the preview: <b>drag</b> = pan this layer · <b>wheel</b> = zoom · <b>double-click</b> = fit<br />
          <b>■</b> = remove the image, the slot stays black · <b>✕</b> = delete the layer · <b>◉/○</b> = hide/show
        </div>
      )}
    </>
  );
}
