import { downloadBlob, safeName } from '../engine/io.js';

export function useRecorder({ rt, canvasRef, micOnRef, projectRef, setStatus, setPlaying, setRecording }) {
  /* A recording can end with no usable data — the user hits stop inside the
     first frame, the tab was backgrounded, or the encoder dropped out. The
     old code happily built a 0-byte Blob, called it a success and handed the
     user a file that will not play. Fail loudly instead. */
  const onRecStop = () => {
    const type = rt.mime || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const chunks = rt.chunks || [];
    const size = chunks.reduce((n, c) => n + (c ? c.size : 0), 0);

    rt.micTracks.forEach(tr => tr.stop()); rt.micTracks = [];
    rt.media = null; rt.recPhase = null; rt.chunks = [];
    setRecording(false);
    setPlaying(false);

    if (!size) {
      setStatus('❌ কোনো ফ্রেম রেকর্ড হয়নি — আবার চেষ্টা করো');
      return;
    }

    const blob = new Blob(chunks, { type });
    const name = safeName(projectRef.current.title, 'geneseon-explainer') + '.' + ext;
    downloadBlob(blob, name);
    setStatus('✅ ভিডিও তৈরি — ' + name + ' (' + (blob.size / 1048576).toFixed(1) + ' MB)');
  };

  /* called by the playback loop when the 3s countdown finishes */
  const startRecorderNow = () => {
    if (rt.recPhase === 'rec') return;
    const cv = canvasRef.current;
    if (!cv || !cv.captureStream || !window.MediaRecorder) {
      rt.recPhase = null; setRecording(false);
      setStatus('❌ এই ব্রাউজারে রেকর্ডিং সাপোর্ট নেই — Chrome/Edge ব্যবহার করো');
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
        ? { mimeType: rt.mime, videoBitsPerSecond: 9e6 }
        : { videoBitsPerSecond: 9e6 });
      rt.chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) rt.chunks.push(e.data); };
      rec.onstop = onRecStop;
      /* the recorder can die mid-take (tab throttled, encoder OOM) — without
         this the UI stays stuck on "recording" forever with no file */
      rec.onerror = () => {
        rt.recPhase = null; rt.media = null; setRecording(false);
        setStatus('❌ রেকর্ডিং ব্যর্থ — ট্যাবটি ব্যাকগ্রাউন্ডে ছিল না তো?');
      };
      rec.start(800);
      rt.media = rec;
      rt.recPhase = 'rec';
      rt.time = 0;
      rt.playing = true; setPlaying(true);
      setStatus('⏺ রেকর্ড হচ্ছে… শেষে অটো-ডাউনলোড হবে');
    } catch {
      rt.recPhase = null; rt.media = null; setRecording(false);
      setStatus('❌ রেকর্ডিং সাপোর্ট নেই — Chrome/Edge ব্যবহার করো');
    }
  };

  const beginRecord = async () => {
    if (rt.recPhase) return;
    try { if (document.fonts) await document.fonts.ready; } catch {}
    rt.time = 0; rt.playing = false; setPlaying(false);
    rt.micTracks = [];
    if (micOnRef.current && navigator.mediaDevices) {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        rt.micTracks = ms.getAudioTracks();
        setStatus('🎙️ মাইক কানেক্টেড — ৩ সেকেন্ডের কাউন্টডাউন…');
      } catch { setStatus('🎙️ মাইক পাওয়া যায়নি — শুধু ভিডিও রেকর্ড হবে'); }
    } else setStatus('৩ সেকেন্ডের কাউন্টডাউন…');
    rt.recPhase = 'count';
    rt.recT0 = performance.now();
    setRecording(true);
  };

  const stopRecord = () => {
    rt.playing = false; setPlaying(false);
    if (!rt.recPhase) return;
    if (rt.recPhase === 'count') {
      /* cancelled mid-countdown — release the mic, it was opened already */
      rt.micTracks.forEach(tr => tr.stop()); rt.micTracks = [];
      rt.recPhase = null; setRecording(false); setStatus('রেকর্ডিং বাতিল');
    } else if (rt.media && rt.media.state !== 'inactive') rt.media.stop();
  };
  return { beginRecord, stopRecord, startRecorderNow };
}
