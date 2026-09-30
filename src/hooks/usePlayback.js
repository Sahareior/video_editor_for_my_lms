import { useEffect } from 'react';
import { maxEnd } from '../engine/timeline.js';
import { renderFrame } from '../engine/renderer.js';
import { fmt } from '../engine/math.js';

/* The single 60fps loop. Reads project via ref, paints canvas, updates
   clock/playhead/seek through refs — React never re-renders per frame. */
export function usePlayback({ rt, projectRef, canvasRef, timeLabelRef, playheadRef, seekRef, apiRef, setPlaying }) {
  useEffect(() => {
    let raf, last = performance.now();
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      const P = projectRef.current;
      const end = maxEnd(P.scenes);

      if (rt.recPhase === 'count' && (ts - rt.recT0) / 1000 >= 3) apiRef.current.startRecorderNow?.();

      if (rt.playing) {
        rt.time += dt;
        if (rt.time >= end) {
          rt.time = end; rt.playing = false; setPlaying(false);
          if (rt.recPhase === 'rec' && rt.media && rt.media.state !== 'inactive') rt.media.stop();
        }
        apiRef.current.onTimeUpdate?.(rt.time, end);
      }


      const cv = canvasRef.current;
      if (cv) renderFrame(cv.getContext('2d'), rt.time, P, rt);

      if (timeLabelRef.current) timeLabelRef.current.textContent = fmt(rt.time) + ' / ' + fmt(end);
      if (playheadRef.current) playheadRef.current.style.left = (rt.time / end * 100) + '%';
      if (seekRef.current && !rt.seekDragging) seekRef.current.value = rt.time;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
