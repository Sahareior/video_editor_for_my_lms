import { useStudio } from '../state/StudioContext.jsx';
import { aspectById } from '../engine/aspect.js';
import InkToolbar from './InkToolbar.jsx';

/* The stage serves two masters: ink draw mode claims the pointer while it is
   on, everything else falls through to the camera drag. Each ink handler
   returns true when it consumed the event.

   The draw bar is docked UNDER the canvas rather than floating over it — it
   used to sit at the top-centre of the stage, which covered the exact region
   people were trying to circle and point at. Nothing may overlap the artwork
   while drawing. The transport below stays live, so you can scrub, play and
   watch the stroke you just drew animate. */
export default function PreviewStage() {
  const { canvasRef, recording, cameraDrag, inkDraw, inkOn, inkTool, aspect } = useStudio();
  const cam = cameraDrag, ink = inkDraw;
  const a = aspectById(aspect);

  return (
    <div className="prevWrap">
      {/* the flex column centres the box, so a tall 9:16 stage stays put when
          the preview area is short instead of being cropped by overflow */}
      <div className="stagewrap" style={{ aspectRatio: a.w + ' / ' + a.h }}>
        <canvas
          ref={canvasRef} width={a.w} height={a.h}
          className={'stage' + (inkOn ? ' inkOn' : '') + (inkTool === 'pen' ? ' pen' : '')}
          onPointerDown={e => { if (!ink.onPointerDown(e)) cam.onPointerDown(e); }}
          onPointerMove={e => { if (!ink.onPointerMove(e)) cam.onPointerMove(e); }}
          onPointerUp={e => { if (!ink.onPointerUp(e)) cam.onPointerUp(e); }}
          onPointerCancel={e => { if (!ink.onPointerCancel(e)) cam.onPointerCancel(e); }}
          onDoubleClick={e => { if (!inkOn) cam.onDoubleClick(e); }}
          onContextMenu={ink.onContextMenu}
        />
        {recording && <div className="recBadge"><span className="dot"></span>REC</div>}
      </div>
      <InkToolbar />
    </div>
  );
}
