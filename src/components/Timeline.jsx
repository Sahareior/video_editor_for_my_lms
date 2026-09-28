import { useRef } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { maxEnd } from '../engine/timeline.js';
import { clamp } from '../engine/math.js';

export default function Timeline() {
  const { project, selId, setSelId, dispatch, playheadRef, recordingRef, actions } = useStudio();
  const trackRef = useRef(null);
  const drag = useRef(null);
  const end = maxEnd(project.scenes);

  const down = (e, mode, s) => {
    e.stopPropagation();
    if (recordingRef.current) return;
    drag.current = { mode, id: s.id, x0: e.clientX, s0: +s.start, e0: +s.end, moved: false };
    try { e.target.setPointerCapture(e.pointerId); } catch {}
    setSelId(s.id);
  };

  const move = e => {
    const d = drag.current;
    if (!d || !trackRef.current) return;
    if (Math.abs(e.clientX - d.x0) > 3) d.moved = true;
    const r = trackRef.current.getBoundingClientRect();
    const dt = (e.clientX - d.x0) / Math.max(1, r.width) * end;
    const snap = v => Math.round(v * 10) / 10;
    if (d.mode === 'm') {
      const len = d.e0 - d.s0;
      const ns = clamp(snap(d.s0 + dt), 0, Math.max(0, end - len));
      dispatch({ type: 'scene/update', id: d.id, patch: { start: ns, end: ns + len } });
    } else if (d.mode === 'l') {
      dispatch({ type: 'scene/update', id: d.id, patch: { start: clamp(snap(d.s0 + dt), 0, d.e0 - 0.4) } });
    } else {
      dispatch({ type: 'scene/update', id: d.id, patch: { end: clamp(snap(d.e0 + dt), d.s0 + 0.4, end + 60) } });
    }
  };

  /* plain click (no drag) = jump the playhead to that scene, like any NLE */
  const up = (allowSeek) => {
    const d = drag.current;
    drag.current = null;
    if (allowSeek && d && !d.moved && d.mode === 'm' && !recordingRef.current) {
      const s = project.scenes.find(x => x.id === d.id);
      if (s) actions.seekTo(+s.start + 0.01);
    }
  };

  return (
    <div className="tl">
      <div className="tlTrack" ref={trackRef}
        onPointerMove={move} onPointerUp={() => up(true)} onPointerLeave={() => up(false)}
        onPointerDown={e => {
          const r = trackRef.current.getBoundingClientRect();
          actions.pause();
          actions.seekTo((e.clientX - r.left) / r.width * end);
        }}>
        {project.scenes.map(s => (
          <div key={s.id} className={'tlBlock' + (s.id === selId ? ' sel' : '')}
            style={{ left: (s.start / end * 100) + '%', width: Math.max(1.2, (s.end - s.start) / end * 100) + '%' }}
            onPointerDown={e => down(e, 'm', s)}>
            <div className="lbl">{s.name}{s.endcard ? ' ★' : ''}</div>
            <div className="tm">{(+s.start).toFixed(1)}–{(+s.end).toFixed(1)}s</div>
            <div className="hz hzl" onPointerDown={e => down(e, 'l', s)} />
            <div className="hz hzr" onPointerDown={e => down(e, 'r', s)} />
          </div>
        ))}
        <div className="tlPlay" ref={playheadRef} />
      </div>
    </div>
  );
}
