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
  const [status, setStatus] = useState('প্রস্তুত 🎬 — ডেমো রেডি। নিজের ছবি আপলোড করে নিজের ভিডিও বানাও।');

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
    setStatus('🎞️ অ্যাসপেক্ট: ' + a.label + ' (' + a.w + '×' + a.h + ') — ' + a.name);
  }, [aspect]);

  /* which layer is being edited — read by the 60fps loop to draw the selection frame */
  useEffect(() => { rt.selLayerId = selLayerId; }, [selLayerId]);

  /* webfonts ready → invalidate kinetic layout cache */
  useEffect(() => {
    if (!document.fonts) return;
    Promise.all(['700 64px "Hind Siliguri"', '600 32px "Hind Siliguri"'].map(f => document.fonts.load(f).catch(() => {})))
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
  const saveJSON = useCallback(() => { saveProjectJSON(projectRef.current); setStatus('💾 প্রজেক্ট সেভ হয়েছে'); }, []);

  /* switching ratio is a no-op while recording — resizing the canvas
     mid-capture would tear the stream and corrupt the file */
  const changeAspect = useCallback((id) => {
    if (rt.recPhase) { setStatus('⛔ রেকর্ডিং চলছে — আগে থামাও'); return; }
    const a = aspectById(id);
    if (a.id === projectRef.current.aspect) return;
    dispatch({ type: 'project/patch', patch: { aspect: a.id } });
  }, []);
  const loadJSON = useCallback(async (file) => {
    try {
      const j = JSON.parse(await file.text());
      dispatch({ type: 'project/load', project: j });
      setSelId(null); setSelLayerId(null); rt.time = 0;
      setStatus('📂 প্রজেক্ট লোড হয়েছে');
    } catch { setStatus('❌ ফাইলটা ঠিক না'); }
  }, []);
  const loadDemo = useCallback(() => {
    dispatch({ type: 'project/load', project: demoProject() });
    setSelId(null); setSelLayerId(null); rt.time = 0;
    setStatus('🎬 ডেমো লোড হয়েছে — ▶ চাপো');
  }, []);
  const newProject = useCallback(() => {
    dispatch({ type: 'project/new', media: projectRef.current.media });
    setSelId(null); setSelLayerId(null); rt.time = 0;
  }, []);

  /* ---------- media + layer actions ---------- */
  const sceneId = () => selIdRef.current;
  const selScene = () => projectRef.current.scenes.find(s => s.id === selIdRef.current) || null;

  const addLayer = useCallback((patch) => {
    const sid = selIdRef.current;
    if (!sid) return;
    const sc = selScene();
    const L = { id: uid(), ...(patch || {}) };
    if (!L.name) L.name = 'লেয়ার ' + ((sc ? sc.layers.length : 0) + 1);
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
        setStatus('🖼️ "' + m.name + '" যোগ হয়েছে — '
          + (opts2.toScene === false ? 'বিনে সংরক্ষিত' : 'বর্তমান সিনের স্ট্যাকে যোগ হয়েছে'));
      }
    }
    if (firstId) setSelLayerId(firstId);
  }, []);

  const clearLayer = useCallback((layerId) => {
    const sid = sceneId();
    if (!sid) return;
    dispatch({ type: 'layer/clear', sceneId: sid, layerId });
    setStatus('⬛ ছবিটা সরানো হয়েছে — স্লটটা কালো হয়ে আছে');
  }, []);

  const fillLayer = useCallback((layerId, media) => {
    const sid = sceneId();
    if (!sid) return;
    dispatch({ type: 'layer/fill', sceneId: sid, layerId, src: media.src, name: media.name });
    setStatus('🖼️ "' + media.name + '" এই লেয়ারে বসানো হয়েছে');
  }, []);

  /* ---------- drawing actions ---------- */
  const setInkOn = useCallback((v) => {
    const on = typeof v === 'function' ? v(rt.inkEdit.on) : v;
    setInkOnState(on);
    if (!on) setSelInkId(null);
    setStatus(on ? '✏️ ড্র মোড চালু — প্রিভিউতে আঁকো' : '🎬 ড্র মোড বন্ধ');
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
  const undoInk = useCallback(() => { inkDraw.undo(); setStatus('↺ ফেরত হয়েছে'); }, [inkDraw]);

  /* latest callbacks for the RAF loop */
  Object.assign(apiRef.current, {
    togglePlay, restart, seekTo,
    startRecorderNow: recorder.startRecorderNow,
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
    actions: {
      togglePlay, restart, pause, seekTo, snapPNG, saveJSON, loadJSON, loadDemo, newProject,
      addMedia, addLayer, clearLayer, fillLayer,
      beginRecord: recorder.beginRecord, stopRecord: recorder.stopRecord,
      setInkOn, setInkTool, setInkColor, setInkWidth, undoInk, previewInk,
      changeAspect,
    },
  }), [project, selId, selLayerId, selSceneMemo, selLayer, playing, recording, micOn, status,
       recorder, cameraDrag, inkDraw, inkOn, inkTool, inkColor, inkWidth, selInkId,
       setInkOn, setInkTool, setInkColor, setInkWidth, undoInk, previewInk, changeAspect]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
