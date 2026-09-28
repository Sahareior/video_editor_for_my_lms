import { useStudio } from '../state/StudioContext.jsx';
import { maxEnd } from '../engine/timeline.js';

export default function Transport() {
  const { project, seekRef, rt, actions } = useStudio();
  return (
    <div className="transport">
      <input ref={seekRef} type="range" min="0" max={maxEnd(project.scenes)} step="0.02" defaultValue="0"
        onPointerDown={() => { rt.seekDragging = true; actions.pause(); }}
        onPointerUp={() => { rt.seekDragging = false; }}
        onInput={e => actions.seekTo(+e.target.value)} />
    </div>
  );
}
