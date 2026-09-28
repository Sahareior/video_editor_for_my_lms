import { useStudio } from '../state/StudioContext.jsx';
import { maxEnd } from '../engine/timeline.js';
import { fmt } from '../engine/math.js';

export default function Header() {
  const { project, dispatch, playing, recording, micOn, setMicOn, timeLabelRef, aspect, aspects, actions } = useStudio();
  return (
    <header className="hdr">
      <div className="logo">GENESEON</div>
      <input className="ttl" value={project.title}
        onChange={e => dispatch({ type: 'project/patch', patch: { title: e.target.value } })} />
      <div className="aspRow" title="Pick the video aspect ratio">
        {aspects.map(a => (
          <button
            key={a.id}
            className={'aspBtn' + (a.id === aspect ? ' on' : '')}
            disabled={recording}
            title={a.name + ' · ' + a.w + '×' + a.h + ' — ' + a.hint}
            onClick={() => actions.changeAspect(a.id)}
          >
            <span className="aspBox" style={{ aspectRatio: a.w + ' / ' + a.h }} />
            <span className="aspLb">{a.label}</span>
          </button>
        ))}
      </div>
      <div className="sp" />
      <button className="btn" onClick={actions.togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
      <button className="btn" onClick={actions.restart}>↺</button>
      <span className="time" ref={timeLabelRef}>{fmt(0)} / {fmt(maxEnd(project.scenes))}</span>
      {recording
        ? <button className="btn rec on" onClick={actions.stopRecord}>■ Stop & save</button>
        : <button className="btn rec" onClick={actions.beginRecord}>⏺ Record</button>}
      <label className="chk" style={{ margin: 0 }}>
        <input type="checkbox" checked={micOn} onChange={e => setMicOn(e.target.checked)} />🎙️ Voice
      </label>
      <div className="sp" />
      <button className="btn" onClick={actions.snapPNG}>📷 PNG</button>
      <button className="btn" onClick={actions.saveJSON}>💾 JSON</button>
      <label className="btn">📂 Open
        <input type="file" accept=".json" hidden
          onChange={e => { const f = e.target.files[0]; if (f) actions.loadJSON(f); e.target.value = ''; }} />
      </label>
      <button className="btn" onClick={actions.loadDemo}>🎬 Demo</button>
      <a className="btn" href="geneseon-studio-source.tar.gz" download
         title="Download the full source of this app (.tar.gz)">⬇️ Source</a>
      <button className="btn" onClick={actions.newProject}>🆕</button>
    </header>
  );
}
