import { createContext, useContext, useState, useReducer, useRef, useEffect, useMemo, useCallback } from 'react';
import { projectReducer, normalize } from './projectReducer.js';
import { demoProject } from '../engine/demo.js';
import { maxEnd } from '../engine/timeline.js';
import { clamp, uid } from '../engine/math.js';
import { clearLayoutCache } from '../engine/kinetic.js';
import { downloadBlob, saveProjectJSON } from '../engine/io.js';
import { primeImages } from '../engine/imageCache.js';
import { setAspect, aspectById, ASPECTS } from '../engine/aspect.js';
import { setStage } from '../engine/constants.js';
import { usePlayback } from '../hooks/usePlayback.js';
import { useRecorder } from '../hooks/useRecorder.js';
import { useCameraDrag } from '../hooks/useCameraDrag.js';
import { useInkDraw } from '../hooks/useInkDraw.js';
import { saveActiveProject, loadActiveProject, clearActiveProject } from '../engine/storage.js';

const StudioContext = createContext(null);
export const useStudio = () => useContext(StudioContext);

/* one file → dataURL */
function readImage(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ id: uid(), src: r.result, name: file.name });
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function StudioProvider({ children }) {
  const [project, dispatch] = useReducer(projectReducer, undefined, () => normalize(demoProject()));
  const [selId, setSelId] = useState(null);
  const [selLayerId, setSelLayerId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micOn, setMicOn] = useState(false);

  /* drawing mode — React mirrors the toolbar, the truth lives on rt.inkEdit
     so the 60fps loop can read the draft stroke without re-rendering */
  const [inkOn, setInkOnState] = useState(false);
  const [inkTool, setInkToolState] = useState('pen');
  const [inkColor, setInkColorState] = useState('#ffd60a');
  const [inkWidth, setInkWidthState] = useState(9);
  const [selInkId, setSelInkId] = useState(null);
  const [status, setStatus] = useState('Ready 🎬 — demo loaded. Upload your own images and make your own video.');

  /* auto-save & hydration state */
  const [isHydrated, setIsHydrated] = useState(false);
  const isHydratedRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved' | 'error'
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const saveTimeoutRef = useRef(null);

  /* refs mirrored from state — read by the 60fps loop without re-renders */
  const projectRef = useRef(project); projectRef.current = project;
  const selIdRef = useRef(selId); selIdRef.current = selId;
  const selLayerIdRef = useRef(selLayerId); selLayerIdRef.current = selLayerId;
  const recordingRef = useRef(recording); recordingRef.current = recording;
  const micOnRef = useRef(micOn); micOnRef.current = micOn;

  /* non-reactive runtime shared with the engine */
  const rt = useRef({
    time: 0, playing: false, seekDragging: false,
    recPhase: null, recT0: 0, media: null, chunks: [], micTracks: [], mime: '',
    /* drawing state. `annots` is refreshed every render so renderFrame can
       ghost the scene's strokes while editing. */
    inkEdit: { on: false, tool: 'pen', color: '#ffd60a', width: 9, selInkId: null, draft: null, annots: [], undo: [], token: 0 },
  }).current;

  const canvasRef = useRef(null);
  const timeLabelRef = useRef(null);
  const playheadRef = useRef(null);
  const seekRef = useRef(null);
  const apiRef = useRef({});

  /* Restore project from IndexedDB on startup so refreshing never loses progress */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await loadActiveProject();
        if (stored && stored.project && active) {
          const norm = normalize(stored.project);
          dispatch({ type: 'project/load', project: norm });
          if (stored.meta) {
            if (stored.meta.selId && norm.scenes.some(s => s.id === stored.meta.selId)) {
              setSelId(stored.meta.selId);
              const sc = norm.scenes.find(s => s.id === stored.meta.selId);
              if (stored.meta.selLayerId && sc && sc.layers.some(l => l.id === stored.meta.selLayerId)) {
                setSelLayerId(stored.meta.selLayerId);
              }
            }
            if (typeof stored.meta.time === 'number' && isFinite(stored.meta.time)) {
              rt.time = Math.max(0, stored.meta.time);
            }
          }
          setStatus('✨ Restored your project from auto-save');
          if (stored.updatedAt) setLastSavedAt(new Date(stored.updatedAt));
        }
      } catch (err) {
        console.warn('[storage] Failed to restore project:', err);
      } finally {
        if (active) {
          isHydratedRef.current = true;
          setIsHydrated(true);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  /* warm the decode cache so the first frames of playback are already drawn */
  useEffect(() => { primeImages(project); }, [project]);

  /* aspect ratio drives the stage size: the engine reads W/H live, the canvas
     needs its backing store resized, and the kinetic layout cache holds
     measurements taken at the old font scale so it has to go. */
  const aspect = project.aspect || '16:9';
  useEffect(() => {
    const a = aspectById(aspect);
    setStage(a.w, a.h);
    const cv = canvasRef.current;
    if (cv && (cv.width !== a.w || cv.height !== a.h)) { cv.width = a.w; cv.height = a.h; }
    clearLayoutCache();
    setStatus('🎞️ Aspect: ' + a.label + ' (' + a.w + '×' + a.h + ') — ' + a.name);
  }, [aspect]);

  /* which layer is being edited — read by the 60fps loop to draw the selection frame */
  useEffect(() => { rt.selLayerId = selLayerId; }, [selLayerId]);

  /* webfonts ready → invalidate kinetic layout cache */
  useEffect(() => {
    if (!document.fonts) return;
    Promise.all(['700 64px "Inter"', '600 32px "Inter"'].map(f => document.fonts.load(f).catch(() => {})))
      .then(() => clearLayoutCache());
  }, []);

  /* keep a valid scene selected */
  useEffect(() => {
    if ((selId == null || !project.scenes.some(s => s.id === selId)) && project.scenes.length)
      setSelId(project.scenes[0].id);
  }, [project, selId]);

  /* keep a valid layer selected — defaults to the top-most layer of the scene */
  useEffect(() => {
    const sc = project.scenes.find(s => s.id === selId);
    if (!sc) return;
    if (!sc.layers.some(L => L.id === selLayerId))
      setSelLayerId(sc.layers.length ? sc.layers[sc.layers.length - 1].id : null);
  }, [project, selId, selLayerId]);

  /* ---------- drawing mode wiring ----------
     rt.inkEdit is the render loop's source of truth; these effects only mirror
     the toolbar's React state down onto it. */
  useEffect(() => { rt.inkEdit.tool = inkTool; }, [inkTool]);
  useEffect(() => { rt.inkEdit.color = inkColor; }, [inkColor]);
  useEffect(() => { rt.inkEdit.width = inkWidth; }, [inkWidth]);
  useEffect(() => { rt.inkEdit.selInkId = selInkId; }, [selInkId]);

  /* the renderer ghosts these while editing — refresh on every project change */
  const scForInk = project.scenes.find(s => s.id === selId) || null;
  rt.inkEdit.annots = (scForInk && scForInk.annots) || [];

  /* keep the annotation selection valid for the selected scene */
  useEffect(() => {
    if (selInkId == null) return;
    const sc = project.scenes.find(s => s.id === selId);
    if (!sc || !(sc.annots || []).some(a => a.id === selInkId)) setSelInkId(null);
  }, [project, selId, selInkId]);

  /* recording must not carry an editing crosshair into the baked frames */
  useEffect(() => { rt.inkEdit.on = inkOn && !recording; }, [inkOn, recording]);

  /* ---------- auto-save execution & event triggers ---------- */
  const performSave = useCallback(async (customProject, customMeta) => {
    if (!isHydratedRef.current) return;
    const proj = customProject || projectRef.current;
    if (!proj) return;
    setSaveStatus('saving');
    try {
      await saveActiveProject(proj, {
        selId: (customMeta && customMeta.selId !== undefined) ? customMeta.selId : selIdRef.current,
        selLayerId: (customMeta && customMeta.selLayerId !== undefined) ? customMeta.selLayerId : selLayerIdRef.current,
        time: (customMeta && typeof customMeta.time === 'number') ? customMeta.time : rt.time,
      });
      setSaveStatus('saved');
      setLastSavedAt(new Date());
    } catch (e) {
      console.warn('Auto-save error:', e);
      setSaveStatus('error');
    }
  }, [rt]);

  /* Debounced auto-save whenever project changes (after initial hydration) */
  useEffect(() => {
    if (!isHydratedRef.current) return;
    setSaveStatus('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
    }, 600);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [project, performSave]);

  /* Warn before navigating away if recording/exporting, and flush any pending save */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (recordingRef.current || rt.recPhase) {
        e.preventDefault();
        e.returnValue = 'Recording or Export is in progress! If you leave, this progress will be lost.';
        return e.returnValue;
      }
      if (isHydratedRef.current && projectRef.current) {
        saveActiveProject(projectRef.current, {
          selId: selIdRef.current,
          selLayerId: selLayerIdRef.current,
          time: rt.time,
        }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [rt]);

  /* ---------- actions ---------- */
  const pause = useCallback(() => { rt.playing = false; setPlaying(false); }, []);
  const togglePlay = useCallback(() => {
    if (rt.recPhase) return;
    const end = maxEnd(projectRef.current.scenes);
    if (rt.time >= end) rt.time = 0;
    rt.playing = !rt.playing; setPlaying(rt.playing);
  }, []);
  const restart = useCallback(() => { if (rt.recPhase) return; rt.time = 0; rt.playing = true; setPlaying(true); }, []);
  const seekTo = useCallback((t) => { rt.time = clamp(t, 0, maxEnd(projectRef.current.scenes)); }, []);
  const snapPNG = useCallback(() => {
    canvasRef.current && canvasRef.current.toBlob(b => b && downloadBlob(b, 'geneseon-frame.png'));
  }, []);
  const saveJSON = useCallback(() => {
    saveProjectJSON(projectRef.current);
    performSave();
    setStatus('💾 Project saved to file');
  }, [performSave]);

  /* switching ratio is a no-op while recording — resizing the canvas
     mid-capture would tear the stream and corrupt the file */
  const changeAspect = useCallback((id) => {
    if (rt.recPhase) { setStatus('⛔ Recording in progress — stop it first'); return; }
    const a = aspectById(id);
    if (a.id === projectRef.current.aspect) return;
    dispatch({ type: 'project/patch', patch: { aspect: a.id } });
  }, []);
  const loadJSON = useCallback(async (file) => {
    try {
      const j = JSON.parse(await file.text());
      const norm = normalize(j);
      dispatch({ type: 'project/load', project: norm });
      const firstId = norm.scenes.length ? norm.scenes[0].id : null;
      setSelId(firstId);
      setSelLayerId(null);
      rt.time = 0;
      await performSave(norm, { selId: firstId, selLayerId: null, time: 0 });
      setStatus('📂 Project loaded');
    } catch {
      setStatus('❌ That file is not valid');
    }
  }, [performSave, rt]);
  const loadDemo = useCallback(async () => {
    const demo = normalize(demoProject());
    dispatch({ type: 'project/load', project: demo });
    const firstId = demo.scenes.length ? demo.scenes[0].id : null;
    setSelId(firstId);
    setSelLayerId(null);
    rt.time = 0;
    setStatus('🎬 Demo loaded — press ▶');
    await performSave(demo, { selId: firstId, selLayerId: null, time: 0 });
  }, [performSave, rt]);
  const newProject = useCallback(async () => {
    dispatch({ type: 'project/new', media: projectRef.current.media });
    setSelId(null);
    setSelLayerId(null);
    rt.time = 0;
    setStatus('✨ New project created');
  }, [rt]);

  /* ---------- media + layer actions ---------- */
  const sceneId = () => selIdRef.current;
  const selScene = () => projectRef.current.scenes.find(s => s.id === selIdRef.current) || null;

  const addLayer = useCallback((patch) => {
    const sid = selIdRef.current;
    if (!sid) return;
    const sc = selScene();
    const L = { id: uid(), ...(patch || {}) };
    if (!L.name) L.name = 'Layer ' + ((sc ? sc.layers.length : 0) + 1);
    dispatch({ type: 'layer/add', sceneId: sid, layer: L });
    setSelLayerId(L.id);
    return L.id;
  }, []);

  /* upload → media bin + straight onto the current scene's stack */
  const addMedia = useCallback(async (files, opts) => {
    const list = Array.from(files || []).filter(f => f && /^image\//.test(f.type || ''));
    if (!list.length) return;
    const opts2 = opts || {};
    let firstId = null;
    for (const f of list) {
      let m;
      try { m = await readImage(f); } catch { continue; }
      dispatch({ type: 'media/add', media: m });
      if (opts2.toScene !== false) {
        const sid = selIdRef.current;
        if (sid) {
          const sc = selScene();
          const L = { id: uid(), src: m.src, name: m.name };
          dispatch({ type: 'layer/add', sceneId: sid, layer: L });
          if (!firstId) firstId = L.id;
        }
      }
      if (!opts2.silent) {
        setStatus('🖼️ "' + m.name + '" added — '
          + (opts2.toScene === false ? 'saved to the bin' : "added to the current scene's stack"));
      }
    }
    if (firstId) setSelLayerId(firstId);
  }, []);

  const clearLayer = useCallback((layerId) => {
    const sid = sceneId();
    if (!sid) return;
    dispatch({ type: 'layer/clear', sceneId: sid, layerId });
    setStatus('⬛ Image removed — the slot is now black');
  }, []);

  const fillLayer = useCallback((layerId, media) => {
    const sid = sceneId();
    if (!sid) return;
    dispatch({ type: 'layer/fill', sceneId: sid, layerId, src: media.src, name: media.name });
    setStatus('🖼️ "' + media.name + '" placed on this layer');
  }, []);

  /* ---------- drawing actions ---------- */
  const setInkOn = useCallback((v) => {
    const on = typeof v === 'function' ? v(rt.inkEdit.on) : v;
    setInkOnState(on);
    if (!on) setSelInkId(null);
    setStatus(on ? '✏️ Draw mode on — draw on the preview' : '🎬 Draw mode off');
  }, []);
  const setInkTool = useCallback((t) => { setInkToolState(t); rt.inkEdit.tool = t; }, []);
  const setInkColor = useCallback((c) => { setInkColorState(c); rt.inkEdit.color = c; }, []);
  const setInkWidth = useCallback((w) => { setInkWidthState(w); rt.inkEdit.width = w; }, []);

  /* scrub to the start of an annotation's animation and play it through */
  const previewInk = useCallback((annot) => {
    const sc = projectRef.current.scenes.find(s => (s.annots || []).some(a => a.id === (annot && annot.id)));
    if (!sc) return;
    const a = (sc.annots || []).find(x => x.id === annot.id) || annot;
    const d = Math.max(0.05, (a.anim || {}).dur || 0.55);
    const from = sc.start + Math.max(0, (a.anim || {}).delay || 0);
    const to = from + d * (a.loop ? 2.2 : 1) + 0.12;
    rt.time = from; rt.playing = true; setPlaying(true);
    const token = (rt.inkEdit.token = (rt.inkEdit.token || 0) + 1);
    setTimeout(() => {
      if (rt.inkEdit.token !== token || !rt.playing) return;
      rt.playing = false; setPlaying(false);
    }, Math.max(300, (to - from) * 1000));
  }, []);

  /* ---------- engine hooks ---------- */
  const recorder = useRecorder({ rt, canvasRef, micOnRef, projectRef, setStatus, setPlaying, setRecording });
  usePlayback({ rt, projectRef, canvasRef, timeLabelRef, playheadRef, seekRef, apiRef, setPlaying });
  const cameraDrag = useCameraDrag({ rt, canvasRef, projectRef, selIdRef, selLayerIdRef, recordingRef, setSelId, setSelLayerId, dispatch });
  const inkDraw = useInkDraw({ rt, canvasRef, projectRef, selIdRef, recordingRef, setSelId, setSelInkId, setPlaying, setInkOn, dispatch });
  const undoInk = useCallback(() => { inkDraw.undo(); setStatus('↺ Undone'); }, [inkDraw]);

  /* latest callbacks for the RAF loop */
  Object.assign(apiRef.current, {
    togglePlay, restart, seekTo,
    startRecorderNow: recorder.startRecorderNow,
    onTimeUpdate: recorder.onTimeUpdate,
  });

  /* spacebar = play/pause */
  useEffect(() => {
    const h = (e) => {
      if (e.code === 'Space' && !rt.recPhase && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
        e.preventDefault();
        apiRef.current.togglePlay();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const selSceneMemo = useMemo(
    () => project.scenes.find(s => s.id === selId) || null,
    [project, selId]);
  const selLayer = useMemo(
    () => (selSceneMemo ? selSceneMemo.layers.find(L => L.id === selLayerId) || null : null),
    [selSceneMemo, selLayerId]);

  const value = useMemo(() => ({
    project, dispatch, selId, setSelId, selLayerId, setSelLayerId,
    selScene: selSceneMemo, selLayer,
    playing, recording, micOn, setMicOn, status, setStatus,
    rt, projectRef, selIdRef, selLayerIdRef, recordingRef,
    canvasRef, timeLabelRef, playheadRef, seekRef,
    cameraDrag, inkDraw,
    inkOn, inkTool, inkColor, inkWidth, selInkId, setSelInkId,
    aspect, aspects: ASPECTS,
    exportState: recorder.exportState,
    saveStatus, lastSavedAt, isHydrated,
    actions: {
      togglePlay, restart, pause, seekTo, snapPNG, saveJSON, loadJSON, loadDemo, newProject,
      forceSave: performSave,
      addMedia, addLayer, clearLayer, fillLayer,
      beginRecord: recorder.beginRecord, stopRecord: recorder.stopRecord,
      openExportModal: recorder.openExportModal, closeExportModal: recorder.closeExportModal,
      startExport: recorder.startExport, cancelExport: recorder.cancelExport,
      setInkOn, setInkTool, setInkColor, setInkWidth, undoInk, previewInk,
      changeAspect,
    },
  }), [project, selId, selLayerId, selSceneMemo, selLayer, playing, recording, micOn, status,
       saveStatus, lastSavedAt, isHydrated, performSave,
       recorder, cameraDrag, inkDraw, inkOn, inkTool, inkColor, inkWidth, selInkId,
       setInkOn, setInkTool, setInkColor, setInkWidth, undoInk, previewInk, changeAspect]);


  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
