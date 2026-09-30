import { useState, useRef } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { maxEnd } from '../engine/timeline.js';
import { clamp } from '../engine/math.js';

export default function Timeline() {
  const { project, selId, setSelId, dispatch, playheadRef, recordingRef, actions } = useStudio();
  const trackRef = useRef(null);
  const drag = useRef(null);
  const [dragState, setDragState] = useState(null);
  const end = maxEnd(project.scenes);

  const down = (e, mode, s, idx) => {
    e.stopPropagation();
    if (recordingRef.current) return;
    drag.current = {
      mode,
      id: s.id,
      startIndex: idx,
      x0: e.clientX,
      s0: +s.start,
      e0: +s.end,
      dur0: (+s.end - +s.start),
      moved: false,
    };
    try { e.target.setPointerCapture(e.pointerId); } catch {}
    setSelId(s.id);
  };

  const move = e => {
    const d = drag.current;
    if (!d || !trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const trackWidth = Math.max(1, r.width);
    const dx = e.clientX - d.x0;

    if (!d.moved && Math.abs(dx) > 3) {
      d.moved = true;
    }

    if (d.mode === 'm') {
      if (!d.moved) return;
      const pointerX = clamp(e.clientX - r.left, 0, trackWidth);
      const scenes = project.scenes;
      let targetIndex = d.startIndex;
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        const scMid = ((sc.start + sc.end) / 2 / end) * trackWidth;
        if (pointerX < scMid) {
          targetIndex = i;
          break;
        }
        targetIndex = i;
      }
      setDragState({
        id: d.id,
        startIndex: d.startIndex,
        targetIndex,
        dx,
      });
    } else if (d.mode === 'r') {
      const dt = (dx / trackWidth) * end;
      const newDur = Math.max(0.4, Math.round((d.dur0 + dt) * 10) / 10);
      dispatch({ type: 'scene/resize', id: d.id, duration: newDur });
    } else if (d.mode === 'l') {
      const dt = (dx / trackWidth) * end;
      const newDur = Math.max(0.4, Math.round((d.dur0 - dt) * 10) / 10);
      dispatch({ type: 'scene/resize', id: d.id, duration: newDur });
    }
  };

  const up = (allowSeek) => {
    const d = drag.current;
    drag.current = null;
    if (d && d.mode === 'm') {
      if (d.moved && dragState) {
        if (dragState.startIndex !== dragState.targetIndex) {
          dispatch({
            type: 'scene/reorder',
            fromIndex: dragState.startIndex,
            toIndex: dragState.targetIndex,
          });
        }
      } else if (allowSeek && !d.moved && !recordingRef.current) {
        const s = project.scenes.find(x => x.id === d.id);
        if (s) actions.seekTo(+s.start + 0.01);
      }
    }
    setDragState(null);
  };

  // Compute drop indicator position
  let dropIndicatorLeft = null;
  if (dragState && dragState.startIndex !== undefined) {
    const { startIndex, targetIndex } = dragState;
    const scenes = project.scenes;
    if (targetIndex === 0) {
      dropIndicatorLeft = 0;
    } else if (targetIndex <= startIndex) {
      dropIndicatorLeft = (scenes[targetIndex].start / end) * 100;
    } else {
      dropIndicatorLeft = (scenes[targetIndex].end / end) * 100;
    }
  }

  // Width in percentage of the dragged card
  const draggedScene = dragState ? project.scenes[dragState.startIndex] : null;
  const draggedWidthPct = draggedScene ? ((draggedScene.end - draggedScene.start) / end) * 100 : 0;

  return (
    <div className="tl">
      <div
        className="tlTrack"
        ref={trackRef}
        onPointerMove={move}
        onPointerUp={() => up(true)}
        onPointerLeave={() => up(false)}
        onPointerDown={e => {
          if (!trackRef.current) return;
          const r = trackRef.current.getBoundingClientRect();
          actions.pause();
          actions.seekTo(((e.clientX - r.left) / r.width) * end);
        }}
      >
        {project.scenes.map((s, idx) => {
          const isSelected = s.id === selId;
          const isDragging = dragState && dragState.id === s.id;

          let transform = '';
          if (isDragging) {
            transform = `translate3d(${dragState.dx}px, 0, 0)`;
          } else if (dragState && draggedWidthPct > 0) {
            const { startIndex, targetIndex } = dragState;
            if (targetIndex < startIndex) {
              if (idx >= targetIndex && idx < startIndex) {
                transform = `translateX(${draggedWidthPct}%)`;
              }
            } else if (targetIndex > startIndex) {
              if (idx > startIndex && idx <= targetIndex) {
                transform = `translateX(-${draggedWidthPct}%)`;
              }
            }
          }

          const baseLeftPct = (s.start / end) * 100;
          const baseWidthPct = Math.max(1.2, ((s.end - s.start) / end) * 100);

          return (
            <div
              key={s.id}
              className={`tlBlock${isSelected ? ' sel' : ''}${isDragging ? ' dragging' : ''}`}
              style={{
                left: `${baseLeftPct}%`,
                width: `${baseWidthPct}%`,
                transform: transform || undefined,
              }}
              onPointerDown={e => down(e, 'm', s, idx)}
            >
              <div className="lbl">
                {s.name}
                {s.endcard ? ' ★' : ''}
              </div>
              <div className="tm">
                {(+s.start).toFixed(1)}–{(+s.end).toFixed(1)}s
              </div>
              <div className="hz hzl" title="Trim start (ripple)" onPointerDown={e => down(e, 'l', s, idx)} />
              <div className="hz hzr" title="Trim end (ripple)" onPointerDown={e => down(e, 'r', s, idx)} />
            </div>
          );
        })}

        {dropIndicatorLeft !== null && (
          <div className="tlDropIndicator" style={{ left: `${dropIndicatorLeft}%` }} />
        )}

        <div className="tlPlay" ref={playheadRef} />
      </div>
    </div>
  );
}

