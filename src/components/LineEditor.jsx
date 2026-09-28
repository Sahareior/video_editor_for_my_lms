import { useStudio } from '../state/StudioContext.jsx';
import { KSTYLES } from '../engine/constants.js';
import SliderRow from './SliderRow.jsx';

export default function LineEditor({ sceneId, line, index }) {
  const { dispatch } = useStudio();
  const upd = patch => dispatch({ type: 'line/update', id: sceneId, index, patch });
  return (
    <div className="lineBox">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="tag">L{index + 1}</span><div className="sp" />
        <button className="mini" onClick={() => dispatch({ type: 'line/move', id: sceneId, index, dir: -1 })}>↑</button>
        <button className="mini" onClick={() => dispatch({ type: 'line/move', id: sceneId, index, dir: 1 })}>↓</button>
        <button className="mini" onClick={() => dispatch({ type: 'line/delete', id: sceneId, index })}>✕</button>
      </div>
      <input className="inp inpT" style={{ width: '100%', marginBottom: 7 }} value={line.text}
        onChange={e => upd({ text: e.target.value })} />
      <div className="chipRow">
        {KSTYLES.map(k => (
          <button key={k} className={'chip' + ((line.style || 'pop') === k ? ' on' : '')}
            onClick={() => upd({ style: k })}>{k.toUpperCase()}</button>
        ))}
      </div>
      <SliderRow label="Size" v={+line.size} min={24} max={200} step={1} set={v => upd({ size: v })} />
      <SliderRow label="Y পজিশন" v={+line.y} min={0.05} max={0.95} step={0.005} set={v => upd({ y: v })} />
      <SliderRow label="Delay" v={+line.delay || 0} min={0} max={4} step={0.05} set={v => upd({ delay: v })} />
      <div className="row"><label>রং</label>
        <select className="sel" value={line.color || 'white'} onChange={e => upd({ color: e.target.value })}>
          <option value="accent">Accent</option>
          <option value="white">সাদা</option>
          <option value="custom">কাস্টম…</option>
        </select>
        {line.color === 'custom' && (
          <input type="color" className="swatch" value={line.custom || '#ffffff'}
            onChange={e => upd({ custom: e.target.value })} />
        )}
      </div>
      <label className="chk">
        <input type="checkbox" checked={!!line.plate} onChange={e => upd({ plate: e.target.checked })} />
        প্লেট (ব্যাকগ্রাউন্ড ব্যাজ)
      </label>
      <label className="chk">
        <input type="checkbox" checked={line.outline === undefined ? true : !!line.outline}
          onChange={e => upd({ outline: e.target.checked })} />
        আউটলাইন (ছবির উপরেও পড়া যায়)
      </label>
    </div>
  );
}
