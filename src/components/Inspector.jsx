import { useState, useEffect } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import SliderRow from './SliderRow.jsx';
import LineEditor from './LineEditor.jsx';
import LayerStack from './LayerStack.jsx';
import InkList from './InkList.jsx';
import { easings } from '../engine/camera.js';
import { lerp, clamp } from '../engine/math.js';

/* tiny SVG curve preview for the current keyframe sequence */
function KeyCurve({ keys, width = 280, height = 64 }) {
  if (!keys || keys.length < 2) return null;
  const padX = 6, padY = 6;
  const innerW = width - padX * 2, innerH = height - padY * 2;
  const xs = (t) => padX + t * innerW;
  const zs = keys.map(k => k.cam.z || 1);
  const zMin = Math.min(...zs, 1), zMax = Math.max(...zs, 1);
  const zSpan = Math.max(0.001, zMax - zMin);
  const ys = (z) => padY + (1 - (z - zMin) / zSpan) * innerH;

  // approximate the actual evaluated curve by sampling between adjacent keys
  const samples = [];
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    for (let s = 0; s <= 24; s++) {
      const t = a.t + (b.t - a.t) * (s / 24);
      const localP = clamp((t - a.t) / Math.max(0.0001, b.t - a.t), 0, 1);
      const ease = easings[a.ease] || easings['in-out'];
      const e = ease(localP);
      const z = lerp(a.cam.z, b.cam.z, e);
      samples.push({ x: xs(t), y: ys(z) });
    }
  }

  const pts = samples.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const keyPts = sorted.map(k => `${xs(k.t)},${ys(k.cam.z)}`).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block', background: '#0a0e17', borderRadius: 6, border: '1px solid #1a2133' }}>
      <line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2} stroke="#1a2133" strokeDasharray="2 4" />
      <polyline points={pts} fill="none" stroke="#ffd60a" strokeWidth="1.6" />
      {sorted.map((k, i) => {
        const cx = xs(k.t), cy = ys(k.cam.z);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="3.5" fill="#ffd60a" stroke="#0a0e17" strokeWidth="1.5" />
            <text x={cx} y={cy - 7} fontSize="8" fill="#9aa3b8" textAnchor="middle">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* camera + keyframes for ONE layer */
function LayerCamera({ sc, L }) {
  const { dispatch, rt } = useStudio();
  const sid = sc.id, lid = L.id;
  const upd = patch => dispatch({ type: 'layer/update', sceneId: sid, layerId: lid, patch });
  const kf = (type, extra) => dispatch({ type, sceneId: sid, layerId: lid, ...(extra || {}) });
  const ph = () => Math.round(rt.time * 10) / 10;
  const hasKeys = L.camKeys && L.camKeys.length;

  const playP = clamp((rt.time - sc.start) / Math.max(.001, sc.end - sc.start), 0, 1);
  const activeKi = hasKeys
    ? (() => {
        const ks = [...L.camKeys].sort((a, b) => a.t - b.t);
        for (let i = 0; i < ks.length - 1; i++) if (playP >= ks[i].t && playP <= ks[i + 1].t) return i;
        return ks.length - 1;
      })()
    : -1;

  const [editKi, setEditKi] = useState(activeKi);
  useEffect(() => { setEditKi(activeKi); }, [lid, activeKi]);

  if (!L.src) {
    return (
      <>
        <div className="sect">Camera — ■ empty layer</div>
        <div className="hint">This slot has no image, so it just shows a black panel — nothing for the camera to do.
          Place an image and pan/zoom/keyframes work here.</div>
      </>
    );
  }

  return (
    <>
      <div className="sect">Camera — “{L.name || 'Layer'}”</div>

      {/* mode switch */}
      <div className="row" style={{ marginBottom: 4 }}>
        <button
          className={'btn' + (!hasKeys ? ' sel' : '')}
          onClick={() => hasKeys && kf('camkeys/toggle')}>
          Simple (Ken Burns)
        </button>
        <button
          className={'btn' + (hasKeys ? ' sel' : '')}
          onClick={() => !hasKeys && kf('camkeys/toggle')}>
          ✨ Keyframes
        </button>
      </div>

      {!hasKeys && (
        <>
          <SliderRow label="Start X" v={L.cam.x} min={0} max={1} step={0.002} set={v => upd({ cam: { x: v } })} />
          <SliderRow label="Start Y" v={L.cam.y} min={0} max={1} step={0.002} set={v => upd({ cam: { y: v } })} />
          <SliderRow label="Start Zoom" v={L.cam.z} min={1} max={6} step={0.01} set={v => upd({ cam: { z: v } })} />
          <div className="row">
            <button className="btn" onClick={() => upd({ cam: { x: .5, y: .5 } })}>Center</button>
            <button className="btn" onClick={() => upd({ cam: { x: .5, y: .5, z: 1.1 } })}>Fit</button>
          </div>
          <label className="chk">
            <input type="checkbox" checked={!!L.camTo}
              onChange={e => upd({ camTo: e.target.checked ? { x: L.cam.x, y: L.cam.y, z: Math.min(6, L.cam.z + 0.4) } : null })} />
            Pan to the end
          </label>
          {L.camTo && (
            <>
              <SliderRow label="→ X" v={L.camTo.x} min={0} max={1} step={0.002} set={v => upd({ camTo: { x: v } })} />
              <SliderRow label="→ Y" v={L.camTo.y} min={0} max={1} step={0.002} set={v => upd({ camTo: { y: v } })} />
              <SliderRow label="→ Zoom" v={L.camTo.z} min={1} max={6} step={0.01} set={v => upd({ camTo: { z: v } })} />
            </>
          )}
        </>
      )}

      {hasKeys && (
        <>
          <div className="row" style={{ marginBottom: 6 }}>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => kf('camkeys/add')}>
              ＋ Add keyframe
            </button>
          </div>

          <KeyCurve keys={L.camKeys} />

          {/* keyframe strip — click to select */}
          <div className="kfStrip">
            {L.camKeys.map((k, i) => (
              <button key={i}
                className={'kfDot' + (i === editKi ? ' sel' : '') + (i === activeKi ? ' live' : '')}
                style={{ left: (k.t * 100) + '%' }}
                title={`K${i + 1} @ ${(k.t * 100).toFixed(0)}% — z ${k.cam.z.toFixed(2)}`}
                onClick={() => setEditKi(i)}>
                <span>{i + 1}</span>
              </button>
            ))}
            <div className="kfPlay" style={{ left: (playP * 100) + '%' }} />
          </div>

          {L.camKeys[editKi] && (
            <div className="kfEditor">
              <div className="row" style={{ marginBottom: 4 }}>
                <label>Keyframe #{editKi + 1}</label>
                <div className="sp" />
                <button className="mini" disabled={L.camKeys.length <= 2}
                  onClick={() => kf('camkeys/delete', { index: editKi })}>✕</button>
              </div>
              <SliderRow label="Time" v={L.camKeys[editKi].t} min={0} max={1} step={0.01}
                set={v => kf('camkeys/update', { index: editKi, patch: { t: v } })} />
              <SliderRow label="X" v={L.camKeys[editKi].cam.x} min={0} max={1} step={0.002}
                set={v => kf('camkeys/update', { index: editKi, patch: { cam: { x: v } } })} />
              <SliderRow label="Y" v={L.camKeys[editKi].cam.y} min={0} max={1} step={0.002}
                set={v => kf('camkeys/update', { index: editKi, patch: { cam: { y: v } } })} />
              <SliderRow label="Zoom" v={L.camKeys[editKi].cam.z} min={1} max={6} step={0.01}
                set={v => kf('camkeys/update', { index: editKi, patch: { cam: { z: v } } })} />
              <div className="row"><label>Ease</label>
                <select className="sel" value={L.camKeys[editKi].ease || 'in-out'}
                  onChange={e => kf('camkeys/update', { index: editKi, patch: { ease: e.target.value } })}>
                  <option value="linear">linear</option>
                  <option value="in">ease-in</option>
                  <option value="out">ease-out</option>
                  <option value="in-out">ease-in-out</option>
                </select>
              </div>
              <div className="row">
                <button className="btn" onClick={() => kf('camkeys/update', { index: editKi, patch: { cam: { x: .5, y: .5 } } })}>Center</button>
                <button className="btn" onClick={() => kf('camkeys/update', { index: editKi, patch: { cam: { x: .5, y: .5, z: 1.1 } } })}>Fit</button>
                <button className="btn" onClick={() => kf('camkeys/update', { index: editKi, patch: { t: playP } })}>▶ Set here</button>
              </div>
            </div>
          )}

          <div className="row">
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => kf('camkeys/init')}>
              ↺ Reset
            </button>
          </div>
        </>
      )}
    </>
  );
}

export default function Inspector() {
  const { selScene: sc, selLayer, dispatch, rt } = useStudio();
  if (!sc) return <div className="colR"><div className="hint">Select a scene 👈</div></div>;

  const upd = patch => dispatch({ type: 'scene/update', id: sc.id, patch });
  const ph = () => Math.round(rt.time * 10) / 10;

  return (
    <div className="colR">
      <div className="sect">Scene</div>
      <div className="row"><label>Name</label>
        <input className="inp inpT" value={sc.name} onChange={e => upd({ name: e.target.value })} /></div>
      <div className="row"><label>Start</label>
        <input type="number" className="inp" step="0.1" min="0" value={sc.start}
          onChange={e => upd({ start: Math.max(0, +e.target.value || 0) })} />
        <button className="mini" title="Set to playhead" onClick={() => upd({ start: ph() })}>▶</button></div>
      <div className="row"><label>End</label>
        <input type="number" className="inp" step="0.1" min="0.4" value={sc.end}
          onChange={e => upd({ end: Math.max(sc.start + 0.4, +e.target.value || 0) })} />
        <button className="mini" title="Set to playhead" onClick={() => upd({ end: ph() })}>▶</button></div>
      <label className="chk">
        <input type="checkbox" checked={!!sc.endcard} onChange={e => upd({ endcard: e.target.checked })} />
        ★ Endcard scene (all layers hide, clean screen)
      </label>

      <LayerStack />

      {!sc.endcard && <InkList />}

      {!sc.endcard && (
        <>
          {selLayer
            ? <LayerCamera sc={sc} L={selLayer} />
            : <><div className="sect">Camera</div>
                <div className="hint">This scene has no layers. Press <b>＋ Image</b> or <b>＋ Empty</b> above.</div></>}

          <div className="sect">Look</div>
          <SliderRow label="Dim" v={+sc.dim || 0} min={0} max={0.85} step={0.01} set={v => upd({ dim: v })} />
          <SliderRow label="Spotlight" v={+sc.spot || 0} min={0} max={1} step={0.01} set={v => upd({ spot: v })} />
        </>
      )}

      <div className="sect">Text — KINETIC TYPOGRAPHY</div>
      {sc.texts.map((L, i) => <LineEditor key={i} sceneId={sc.id} line={L} index={i} />)}
      <button className="btn" onClick={() => dispatch({ type: 'line/add', id: sc.id })}>＋ Add line</button>
    </div>
  );
}
