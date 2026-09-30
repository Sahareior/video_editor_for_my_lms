import { useState, useEffect, useRef } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { maxEnd } from '../engine/timeline.js';
import { fmt } from '../engine/math.js';
import { downloadBlob } from '../engine/io.js';

export default function ExportModal() {
  const { project, aspect, exportState, actions, canvasRef, micOn } = useStudio();
  const [thumbUrl, setThumbUrl] = useState('');
  const [title, setTitle] = useState('');
  const [resolution, setResolution] = useState('1080p');
  const [format, setFormat] = useState('mp4');
  const [fps, setFps] = useState(60);
  const [quality, setQuality] = useState('standard');
  const [includeMic, setIncludeMic] = useState(false);

  const end = maxEnd(project.scenes);

  // Capture canvas poster frame and initialize fields when opened
  useEffect(() => {
    if (exportState?.isOpen && exportState.phase === 'configuring') {
      setTitle(project.title || 'My Video');
      setIncludeMic(!!micOn);
      try {
        if (canvasRef.current) {
          setThumbUrl(canvasRef.current.toDataURL('image/jpeg', 0.85));
        }
      } catch {}
    }
  }, [exportState?.isOpen, exportState?.phase, project.title, micOn, canvasRef]);

  if (!exportState?.isOpen) return null;

  // Calculate estimated file size
  const bitrateMap = { higher: 18e6, standard: 10e6, lower: 5e6 };
  const bitrate = bitrateMap[quality] || 10e6;
  const estSizeMB = Math.max(0.1, ((bitrate / 8) * Math.max(0.1, end)) / (1024 * 1024)).toFixed(1);

  const handleStartExport = () => {
    actions.startExport({
      title: title.trim() || 'My Video',
      resolution,
      format,
      fps,
      quality,
      includeMic,
    });
  };

  const pct = Math.round((exportState.progress || 0) * 100);
  const circumference = 2 * Math.PI * 56;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="modalOverlay" onClick={e => e.target === e.currentTarget && actions.closeExportModal()}>
      <div className="modalBox">
        {/* Modal Header */}
        <div className="modalHeader">
          <div className="modalTitle">
            <span className="modalTitleIcon">↗</span>
            {exportState.phase === 'exporting'
              ? 'Exporting Video…'
              : exportState.phase === 'completed'
              ? 'Export Completed'
              : 'Export Video'}
          </div>
          <button className="modalClose" onClick={actions.closeExportModal} title="Close">✕</button>
        </div>

        {/* Modal Body */}
        <div className="modalBody">
          {/* Phase 1: Configuring Settings */}
          {exportState.phase === 'configuring' && (
            <>
              {/* Left Column: Preview & Summary */}
              <div className="exportCoverCol">
                <div className="exportPreviewCard">
                  {thumbUrl ? (
                    <img className="exportPreviewThumb" src={thumbUrl} alt="Cover Preview" />
                  ) : (
                    <div style={{ color: '#64748b', fontSize: 12 }}>Preview</div>
                  )}
                  <div className="exportBadgeOverlay">
                    <span className="exportBadge">{resolution}</span>
                    <span className="exportBadge dur">{fmt(end)}</span>
                  </div>
                </div>

                <div className="exportSummaryBox">
                  <div className="exportSummaryRow">
                    <span>Aspect Ratio</span>
                    <span className="exportSummaryVal">{aspect}</span>
                  </div>
                  <div className="exportSummaryRow">
                    <span>Total Duration</span>
                    <span className="exportSummaryVal">{fmt(end)} ({end.toFixed(1)}s)</span>
                  </div>
                  <div className="exportSummaryRow">
                    <span>Scene Count</span>
                    <span className="exportSummaryVal">{project.scenes.length} scenes</span>
                  </div>
                  <div className="exportSummaryRow">
                    <span>Est. File Size</span>
                    <span className="exportSummaryVal" style={{ color: '#00d2ff' }}>~{estSizeMB} MB</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Settings Form */}
              <div className="exportFormCol">
                <div className="exportFormGroup">
                  <label className="exportLabel">Title</label>
                  <input
                    type="text"
                    className="exportInput"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Enter video title"
                  />
                </div>

                <div className="exportFormGroup">
                  <div className="exportLabel">
                    <span>Resolution</span>
                    <span className="exportHint">{resolution === '1080p' ? 'Full HD' : resolution === '4K' ? 'Ultra HD' : resolution}</span>
                  </div>
                  <div className="exportPillGroup">
                    <button
                      type="button"
                      className={`exportPill${resolution === '720p' ? ' active' : ''}`}
                      onClick={() => setResolution('720p')}
                    >
                      720p
                      <span className="pillSub">HD</span>
                    </button>
                    <button
                      type="button"
                      className={`exportPill${resolution === '1080p' ? ' active' : ''}`}
                      onClick={() => setResolution('1080p')}
                    >
                      1080p
                      <span className="recTag">REC</span>
                    </button>
                    <button
                      type="button"
                      className={`exportPill${resolution === '2K' ? ' active' : ''}`}
                      onClick={() => setResolution('2K')}
                    >
                      2K
                      <span className="pillSub">QHD</span>
                    </button>
                    <button
                      type="button"
                      className={`exportPill${resolution === '4K' ? ' active' : ''}`}
                      onClick={() => setResolution('4K')}
                    >
                      4K
                      <span className="pillSub">UHD</span>
                    </button>
                  </div>
                </div>

                <div className="exportFormGroup">
                  <div className="exportLabel">Format</div>
                  <div className="exportPillGroup" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`exportPill${format === 'mp4' ? ' active' : ''}`}
                      onClick={() => setFormat('mp4')}
                    >
                      MP4
                      <span className="pillSub">Universal H.264</span>
                    </button>
                    <button
                      type="button"
                      className={`exportPill${format === 'webm' ? ' active' : ''}`}
                      onClick={() => setFormat('webm')}
                    >
                      WebM
                      <span className="pillSub">VP9 Standard</span>
                    </button>
                  </div>
                </div>

                <div className="exportFormGroup">
                  <div className="exportLabel">Frame Rate</div>
                  <div className="exportPillGroup" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`exportPill${fps === 30 ? ' active' : ''}`}
                      onClick={() => setFps(30)}
                    >
                      30 FPS
                      <span className="pillSub">Standard</span>
                    </button>
                    <button
                      type="button"
                      className={`exportPill${fps === 60 ? ' active' : ''}`}
                      onClick={() => setFps(60)}
                    >
                      60 FPS
                      <span className="pillSub">Smooth</span>
                    </button>
                  </div>
                </div>

                <div className="exportFormGroup">
                  <div className="exportLabel">Quality</div>
                  <div className="exportPillGroup">
                    <button
                      type="button"
                      className={`exportPill${quality === 'lower' ? ' active' : ''}`}
                      onClick={() => setQuality('lower')}
                    >
                      Lower
                      <span className="pillSub">Fast / Small</span>
                    </button>
                    <button
                      type="button"
                      className={`exportPill${quality === 'standard' ? ' active' : ''}`}
                      onClick={() => setQuality('standard')}
                    >
                      Standard
                      <span className="pillSub">Recommended</span>
                    </button>
                    <button
                      type="button"
                      className={`exportPill${quality === 'higher' ? ' active' : ''}`}
                      onClick={() => setQuality('higher')}
                    >
                      Higher
                      <span className="pillSub">Crisp 18 Mbps</span>
                    </button>
                  </div>
                </div>

                <div className="exportFormGroup">
                  <label className="chk" style={{ margin: '4px 0 0' }}>
                    <input
                      type="checkbox"
                      checked={includeMic}
                      onChange={e => setIncludeMic(e.target.checked)}
                    />
                    🎙️ Include microphone narration voice-over
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Phase 2: Exporting In Progress */}
          {exportState.phase === 'exporting' && (
            <div className="exportProgressView">
              <svg width="0" height="0">
                <defs>
                  <linearGradient id="exportGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00d2ff" />
                    <stop offset="100%" stopColor="#0066ff" />
                  </linearGradient>
                </defs>
              </svg>

              <div className="exportProgressCircleWrapper">
                <svg className="exportProgressSvg" viewBox="0 0 128 128">
                  <circle className="exportProgressBg" cx="64" cy="64" r="56" />
                  <circle
                    className="exportProgressFill"
                    cx="64"
                    cy="64"
                    r="56"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
                <div className="exportProgressText">
                  <span className="exportProgressPct">{pct}%</span>
                  <span className="exportProgressStatus">Rendering</span>
                </div>
              </div>

              <div className="exportProgressBarTrack">
                <div className="exportProgressBarFill" style={{ width: `${pct}%` }} />
              </div>

              <div className="exportProgressDetails">
                <span>Time: {fmt(exportState.currentTime)} / {fmt(exportState.totalTime)}</span>
                <span>•</span>
                <span>{resolution} · {format.toUpperCase()} · {fps} FPS</span>
              </div>
            </div>
          )}

          {/* Phase 3: Export Completed */}
          {exportState.phase === 'completed' && (
            <div className="exportCompleteView">
              <div className="exportSuccessIcon">✓</div>
              <div className="exportSuccessTitle">Export Complete!</div>
              <div className="exportSuccessDesc">
                Your video <b>{exportState.filename}</b> ({(exportState.filesize / (1024 * 1024)).toFixed(1)} MB) has been generated and downloaded.
              </div>

              {exportState.url && (
                <div className="exportVideoPlayerWrapper">
                  <video
                    className="exportVideoPlayer"
                    src={exportState.url}
                    controls
                    autoPlay
                    loop
                  />
                </div>
              )}

              <div className="exportCompleteActions">
                <button
                  type="button"
                  className="btnCancel"
                  onClick={() => downloadBlob(exportState.blob, exportState.filename)}
                >
                  ⬇ Download Again
                </button>
                <button
                  type="button"
                  className="btnStartExport"
                  onClick={actions.closeExportModal}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Phase 4: Error */}
          {exportState.phase === 'error' && (
            <div className="exportCompleteView">
              <div className="exportSuccessIcon" style={{ background: '#ef4444' }}>✕</div>
              <div className="exportSuccessTitle" style={{ color: '#f87171' }}>Export Failed</div>
              <div className="exportSuccessDesc">
                {exportState.error || 'An unexpected error occurred during video rendering.'}
              </div>
              <button
                type="button"
                className="btnStartExport"
                onClick={actions.openExportModal}
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {exportState.phase === 'configuring' && (
          <div className="modalFooter">
            <div className="modalFooterInfo">
              <span>Estimated: ~{estSizeMB} MB</span>
              <span>•</span>
              <span>{fmt(end)} duration</span>
            </div>
            <div className="modalFooterActions">
              <button type="button" className="btnCancel" onClick={actions.closeExportModal}>
                Cancel
              </button>
              <button type="button" className="btnStartExport" onClick={handleStartExport}>
                <span>↗</span> Export Video
              </button>
            </div>
          </div>
        )}

        {exportState.phase === 'exporting' && (
          <div className="modalFooter" style={{ justifyContent: 'center' }}>
            <button type="button" className="btnCancel" onClick={actions.cancelExport}>
              Cancel Export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
