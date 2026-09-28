import { useStudio } from '../state/StudioContext.jsx';
import { INK_TOOLS, INK_COLORS } from '../engine/ink.js';

/* Floating draw bar — sits over the preview stage while draw mode is on.
   The transport below the canvas stays live, so you can scrub, play and see
   the stroke you just drew actually animate. */
export default function InkToolbar() {
  const { inkOn, inkTool, inkColor, inkWidth, actions, recording } = useStudio();
  if (!inkOn) return null;

  const WIDTHS = [4, 9, 16, 28];

  return (
    <div className={'inkBar' + (recording ? ' dis' : '')} onPointerDown={e => e.stopPropagation()}>
      <div className="inkBarGrp">
        {INK_TOOLS.map(t => (
          <button key={t.id}
            className={'inkTool' + (inkTool === t.id ? ' on' : '')}
            title={t.name}
            onClick={() => actions.setInkTool(t.id)}>
            <span className="inkToolIco">{t.label}</span>
            <span className="inkToolName">{t.name}</span>
          </button>
        ))}
      </div>

      <div className="inkBarGrp">
        {INK_COLORS.map(c => (
          <button key={c}
            className={'inkDot' + (inkColor === c ? ' on' : '')}
            style={{ background: c, borderColor: c === '#0a0d15' ? '#3a4560' : c }}
            title={c}
            onClick={() => actions.setInkColor(c)} />
        ))}
      </div>

      <div className="inkBarGrp">
        {WIDTHS.map(w => (
          <button key={w}
            className={'inkWd' + (inkWidth === w ? ' on' : '')}
            title={'Width ' + w}
            onClick={() => actions.setInkWidth(w)}>
            <i style={{ width: Math.min(20, w + 2), height: Math.min(20, w + 2), background: inkColor === '#0a0d15' ? '#e8ecf5' : inkColor }} />
          </button>
        ))}
      </div>

      <div className="inkBarGrp">
        <button className="inkTool wide" title="Ctrl+Z" onClick={actions.undoInk}>↺ Undo</button>
        <button className="inkTool wide done" title="Turn off draw" onClick={() => actions.setInkOn(false)}>✓ Done</button>
      </div>
    </div>
  );
}
