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
      <div className="aspRow" title="ভিডিওর অ্যাসপেক্ট রেশিও বেছে নাও">
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
      <button className="btn" onClick={actions.togglePlay}>{playing ? '⏸ পজ' : '▶ প্লে'}</button>
      <button className="btn" onClick={actions.restart}>↺</button>
      <span className="time" ref={timeLabelRef}>{fmt(0)} / {fmt(maxEnd(project.scenes))}</span>
      {recording
        ? <button className="btn rec on" onClick={actions.stopRecord}>■ স্টপ ও সেভ</button>
        : <button className="btn rec" onClick={actions.beginRecord}>⏺ রেকর্ড</button>}
      <label className="chk" style={{ margin: 0 }}>
        <input type="checkbox" checked={micOn} onChange={e => setMicOn(e.target.checked)} />🎙️ ভয়েস
      </label>
      <div className="sp" />
      <button className="btn" onClick={actions.snapPNG}>📷 PNG</button>
      <button className="btn" onClick={actions.saveJSON}>💾 JSON</button>
      <label className="btn">📂 খোলো
        <input type="file" accept=".json" hidden
          onChange={e => { const f = e.target.files[0]; if (f) actions.loadJSON(f); e.target.value = ''; }} />
      </label>
      <button className="btn" onClick={actions.loadDemo}>🎬 ডেমো</button>
      <a className="btn" href="geneseon-studio-source.tar.gz" download
         title="এই অ্যাপের সম্পূর্ণ সোর্স কোড নামাও (.tar.gz)">⬇️ সোর্স কোড</a>
      <button className="btn" onClick={actions.newProject}>🆕</button>
    </header>
  );
}
