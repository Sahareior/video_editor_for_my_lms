import { useState, useRef, useCallback } from 'react';
import { downloadBlob, safeName } from '../engine/io.js';
import { maxEnd } from '../engine/timeline.js';

export function useRecorder({ rt, canvasRef, micOnRef, projectRef, setStatus, setPlaying, setRecording }) {
  const [exportState, setExportState] = useState({
    isOpen: false,
    phase: 'idle', // 'idle' | 'configuring' | 'exporting' | 'completed' | 'error'
    progress: 0,
    currentTime: 0,
    totalTime: 0,
    blob: null,
    url: null,
    filename: '',
    filesize: 0,
    error: null,
    options: null,
  });

  const exportOptsRef = useRef(null);

  /* A recording or export can end with no usable data — fail loudly instead of a 0-byte file */
  const onRecStop = () => {
    const type = rt.mime || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const chunks = rt.chunks || [];
    const size = chunks.reduce((n, c) => n + (c ? c.size : 0), 0);

    rt.micTracks.forEach(tr => tr.stop()); rt.micTracks = [];
    rt.media = null; rt.recPhase = null; rt.chunks = [];
    setRecording(false);
    setPlaying(false);

    const isExport = !!exportOptsRef.current;
    const opts = exportOptsRef.current;
    exportOptsRef.current = null;

    if (!size) {
      setStatus('❌ No frames were recorded — try again');
      if (isExport) setExportState(prev => ({ ...prev, phase: 'error', error: 'No frames were recorded — try again' }));
      return;
    }

    const blob = new Blob(chunks, { type });
    const rawTitle = (opts && opts.title) || projectRef.current.title;
    const name = safeName(rawTitle, 'geneseon-explainer') + '.' + ext;
    downloadBlob(blob, name);
    const url = URL.createObjectURL(blob);

    if (isExport) {
      setExportState(prev => ({
        ...prev,
        phase: 'completed',
        progress: 1,
        blob,
        url,
        filename: name,
        filesize: blob.size,
      }));
    }
    setStatus('✅ Video ready — ' + name + ' (' + (blob.size / 1048576).toFixed(1) + ' MB)');
  };

  /* called by the playback loop when the 3s countdown finishes (classic Quick Record) */
  const startRecorderNow = () => {
    if (rt.recPhase === 'rec') return;
    const cv = canvasRef.current;
    if (!cv || !cv.captureStream || !window.MediaRecorder) {
      rt.recPhase = null; setRecording(false);
      setStatus('❌ This browser cannot record — use Chrome/Edge');
      return;
    }
    try {
      const stream = cv.captureStream(60);
      rt.micTracks.forEach(tr => stream.addTrack(tr));
      const hasAudio = rt.micTracks.length > 0;
      const mimes = hasAudio
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      rt.mime = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, rt.mime
        ? { mimeType: rt.mime, videoBitsPerSecond: 10e6 }
        : { videoBitsPerSecond: 10e6 });
      rt.chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) rt.chunks.push(e.data); };
      rec.onstop = onRecStop;
      rec.onerror = () => {
        rt.recPhase = null; rt.media = null; setRecording(false);
        setStatus('❌ Recording failed — was the tab in the background?');
      };
      rec.start(600);
      rt.media = rec;
      rt.recPhase = 'rec';
      rt.time = 0;
      rt.playing = true; setPlaying(true);
      setStatus('⏺ Recording… it auto-downloads at the end');
    } catch {
      rt.recPhase = null; rt.media = null; setRecording(false);
      setStatus('❌ Recording unsupported — use Chrome/Edge');
    }
  };

  /* Quick record with 3-second countdown (for voice-overs or quick captures) */
  const beginRecord = async () => {
    if (rt.recPhase) return;
    try { if (document.fonts) await document.fonts.ready; } catch {}
    rt.time = 0; rt.playing = false; setPlaying(false);
    rt.micTracks = [];
    if (micOnRef.current && navigator.mediaDevices) {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        rt.micTracks = ms.getAudioTracks();
        setStatus('🎙️ Mic connected — 3-second countdown…');
      } catch { setStatus('🎙️ No mic found — recording video only'); }
    } else setStatus('3-second countdown…');
    rt.recPhase = 'count';
    rt.recT0 = performance.now();
    setRecording(true);
  };

  /* CapCut-style dedicated Export */
  const startExport = async (opts) => {
    if (rt.recPhase) return;
    try { if (document.fonts) await document.fonts.ready; } catch {}

    const cv = canvasRef.current;
    if (!cv || !cv.captureStream || !window.MediaRecorder) {
      setExportState(prev => ({ ...prev, phase: 'error', error: 'Browser video recording is not supported — please use Chrome or Edge.' }));
      setStatus('❌ Recording unsupported — use Chrome/Edge');
      return;
    }

    const end = maxEnd(projectRef.current.scenes);
    exportOptsRef.current = opts;
    const fps = opts.fps || 60;
    const isMp4 = opts.format === 'mp4';
    const bitrateMap = {
      higher: 18e6,
      standard: 10e6,
      lower: 5e6,
    };
    const videoBitrate = bitrateMap[opts.quality] || 10e6;

    rt.micTracks = [];
    if (opts.includeMic && navigator.mediaDevices) {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        rt.micTracks = ms.getAudioTracks();
      } catch {}
    }

    try {
      const stream = cv.captureStream(fps);
      rt.micTracks.forEach(tr => stream.addTrack(tr));
      const hasAudio = rt.micTracks.length > 0;

      const mp4Mimes = hasAudio
        ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4']
        : ['video/mp4;codecs=avc1', 'video/mp4'];
      const webmMimes = hasAudio
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

      let chosenMime = '';
      if (isMp4) {
        chosenMime = mp4Mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      }
      if (!chosenMime) {
        chosenMime = webmMimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      }
      if (!chosenMime && !isMp4) {
        chosenMime = mp4Mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      }
      rt.mime = chosenMime;

      const rec = new MediaRecorder(stream, rt.mime
        ? { mimeType: rt.mime, videoBitsPerSecond: videoBitrate }
        : { videoBitsPerSecond: videoBitrate });

      rt.chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) rt.chunks.push(e.data); };
      rec.onstop = onRecStop;
      rec.onerror = () => {
        rt.recPhase = null; rt.media = null; setRecording(false);
        setExportState(prev => ({ ...prev, phase: 'error', error: 'Recording failed. Was the browser tab switched?' }));
        setStatus('❌ Export failed');
      };

      setExportState({
        isOpen: true,
        phase: 'exporting',
        progress: 0,
        currentTime: 0,
        totalTime: end,
        blob: null,
        url: null,
        filename: '',
        filesize: 0,
        error: null,
        options: opts,
      });

      rec.start(500);
      rt.media = rec;
      rt.recPhase = 'rec';
      rt.time = 0;
      rt.playing = true;
      setPlaying(true);
      setRecording(true);
      setStatus('🚀 Exporting video…');
    } catch (err) {
      rt.recPhase = null; rt.media = null; setRecording(false);
      setExportState(prev => ({ ...prev, phase: 'error', error: err.message || 'Export initialization failed' }));
    }
  };

  const onTimeUpdate = useCallback((t, end) => {
    if (exportOptsRef.current) {
      const p = Math.min(1, Math.max(0, t / Math.max(0.001, end)));
      setExportState(prev => {
        if (prev.phase !== 'exporting') return prev;
        if (Math.abs(prev.progress - p) < 0.005 && t < end) return prev;
        return { ...prev, progress: p, currentTime: t, totalTime: end };
      });
    }
  }, []);

  const cancelExport = useCallback(() => {
    exportOptsRef.current = null;
    rt.playing = false; setPlaying(false);
    rt.micTracks.forEach(tr => tr.stop()); rt.micTracks = [];
    if (rt.media && rt.media.state !== 'inactive') {
      try { rt.media.stop(); } catch {}
    }
    rt.media = null;
    rt.recPhase = null;
    rt.chunks = [];
    setRecording(false);
    setExportState(prev => ({ ...prev, phase: 'idle', progress: 0, isOpen: false }));
    setStatus('Export cancelled');
  }, []);

  const openExportModal = useCallback(() => {
    setExportState(prev => ({
      ...prev,
      isOpen: true,
      phase: 'configuring',
      progress: 0,
      currentTime: 0,
      totalTime: maxEnd(projectRef.current.scenes),
      error: null,
    }));
  }, [projectRef]);

  const closeExportModal = useCallback(() => {
    if (exportState.phase === 'exporting') {
      cancelExport();
    } else {
      setExportState(prev => ({ ...prev, isOpen: false }));
    }
  }, [exportState.phase, cancelExport]);

  const stopRecord = () => {
    rt.playing = false; setPlaying(false);
    if (!rt.recPhase) return;
    if (rt.recPhase === 'count') {
      rt.micTracks.forEach(tr => tr.stop()); rt.micTracks = [];
      rt.recPhase = null; setRecording(false); setStatus('Recording cancelled');
    } else if (rt.media && rt.media.state !== 'inactive') rt.media.stop();
  };

  return {
    beginRecord,
    stopRecord,
    startRecorderNow,
    startExport,
    cancelExport,
    openExportModal,
    closeExportModal,
    exportState,
    onTimeUpdate,
  };
}

