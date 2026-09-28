import { useRef, useEffect } from 'react';
import { clamp } from '../engine/math.js';
import { evalCam, pointerToImage, camAnchoredAt, activeKeyIndex } from '../engine/camera.js';
import { getImg } from '../engine/imageCache.js';
import { sceneAt } from '../engine/timeline.js';

/* Drag = pan · wheel = zoom · double-click = fit
   Every layer owns its own camera, so these gestures always edit the
   layer currently selected in the Layer stack. When that layer has camKeys,
   drag/zoom update the keyframe that is "currently driving" at the playhead. */
export function useCameraDrag({ rt, canvasRef, projectRef, selIdRef, selLayerIdRef, recordingRef, setSelId, setSelLayerId, dispatch }) {
  const panRef = useRef(null);

  const sceneToAim = () => {
    let sc = projectRef.current.scenes.find(s => s.id === selIdRef.current);
    if (!sc) {
      const h = sceneAt(projectRef.current.scenes, rt.time);
      if (h && h.id) { setSelId(h.id); sc = projectRef.current.scenes.find(s => s.id === h.id); }
    }
    return (sc && !sc.endcard) ? sc : null;
  };

  /* the selected layer inside the aimed scene (falls back to the top layer) */
  const layerToAim = (sc) => {
    if (!sc) return null;
    return sc.layers.find(l => l.id === selLayerIdRef.current)
        || sc.layers[sc.layers.length - 1] || null;
  };

  /* index of the keyframe to mutate when dragging with camKeys */
  const targetKeyIndex = (L, sc) => {
    if (!L || !L.camKeys || !L.camKeys.length) return -1;
    const p = clamp((rt.time - sc.start) / Math.max(.001, sc.end - sc.start), 0, 1);
    return activeKeyIndex(L.camKeys, p);
  };

  const aim = () => {
    // ink draw mode owns the canvas while it is on
    if (rt.inkEdit && rt.inkEdit.on) return null;
    const sc = sceneToAim();
    if (!sc) return null;
    const L = layerToAim(sc);
    if (!L || !L.src || L.visible === false) return null;
    const img = getImg(L.src);
    if (!img) return null;
    return { sc, L, img, p: clamp((rt.time - sc.start) / Math.max(.001, sc.end - sc.start), 0, 1) };
  };

  const commit = (d, cam) => {
    if (d.ki >= 0) dispatch({ type: 'camkeys/update', sceneId: d.sid, layerId: d.lid, index: d.ki, patch: { cam } });
    else dispatch({ type: 'layer/update', sceneId: d.sid, layerId: d.lid, patch: { cam } });
  };

  const onPointerDown = (e) => {
    if (recordingRef.current) return;
    const a = aim();
    if (!a) return;
    const { sc, L, img, p } = a;
    const cam = evalCam(L, p);
    const pt = pointerToImage(e, canvasRef.current, cam, img);
    panRef.current = { sid: sc.id, lid: L.id, ki: targetKeyIndex(L, sc), ...pt, z: cam.z };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    const d = panRef.current;
    if (!d) return;
    const pt = pointerToImage(e, canvasRef.current, { x: 0, y: 0, z: d.z }, { naturalWidth: d.iw, naturalHeight: d.ih });
    const c = camAnchoredAt(d.ix, d.iy, pt.sx, pt.sy, d.z, d.iw, d.ih);
    commit(d, { x: +c.x.toFixed(4), y: +c.y.toFixed(4), z: +c.z.toFixed(3) });
  };

  const onPointerUp = () => { panRef.current = null; };

  const onDoubleClick = () => {
    if (recordingRef.current) return;
    const a = aim();
    if (!a) return;
    const cam = { x: .5, y: .5, z: 1.1 };
    const d = { sid: a.sc.id, lid: a.L.id, ki: targetKeyIndex(a.L, a.sc) };
    commit(d, cam);
  };

  /* wheel needs a native non-passive listener for preventDefault */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const h = (e) => {
      e.preventDefault();
      if (recordingRef.current) return;
      const a = aim();
      if (!a) return;
      const { L, img, p } = a;
      const cam = evalCam(L, p);
      const pt = pointerToImage(e, cv, cam, img);
      const nz = clamp(cam.z * Math.exp(-e.deltaY * 0.0012), 1, 6);
      const c = camAnchoredAt(pt.ix, pt.iy, pt.sx, pt.sy, nz, pt.iw, pt.ih);
      commit({ sid: a.sc.id, lid: L.id, ki: targetKeyIndex(L, a.sc) },
        { x: +c.x.toFixed(4), y: +c.y.toFixed(4), z: +c.z.toFixed(3) });
    };
    cv.addEventListener('wheel', h, { passive: false });
    return () => cv.removeEventListener('wheel', h);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick };
}
