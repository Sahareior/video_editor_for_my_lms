import { useState, useRef, useEffect } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { maxEnd } from '../engine/timeline.js';
import { fmt } from '../engine/math.js';

export default function Header() {
  const {
    project, dispatch, playing, recording, micOn, setMicOn,
    timeLabelRef, aspect, aspects, actions,
    saveStatus, lastSavedAt,
  } = useStudio();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleClick);
    return () => window.removeEventListener('pointerdown', handleClick);
  }, [menuOpen]);

  const handleOpenClick = () => {
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) actions.loadJSON(file);
    e.target.value = '';
  };

  const handleNewProject = () => {
    setMenuOpen(false);
    if (window.confirm('Create a new blank project? Your current work is auto-saved in browser storage, but starting a new project will reset the timeline.')) {
      actions.newProject();
    }
  };

  const handleResetDemo = () => {
    setMenuOpen(false);
    if (window.confirm('Reset to the demo video project? This will replace your timeline with the demo scenes.')) {
      actions.loadDemo();
    }
  };

  const saveTitle = lastSavedAt
    ? `Auto-saved locally at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : 'All progress is automatically saved to browser storage';

  return (
    <header className="hdr">
      <div className="logo">GENESEON</div>

      {/* Project Menu */}
      <div className="projMenuWrap" ref={menuRef}>
        <button
          className={'btn' + (menuOpen ? ' sel' : '')}
          style={{ padding: '6px 11px', fontSize: '13px' }}
          onClick={() => setMenuOpen(!menuOpen)}
          title="Project file options (Open, Save, New, Reset)"
        >
          📁 File <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
        </button>

        {menuOpen && (
          <div className="projDropdown">
            <button className="projDropdownItem" onClick={() => { setMenuOpen(false); actions.saveJSON(); }}>
              <span>💾</span> Save Project (.json)
            </button>
            <button className="projDropdownItem" onClick={handleOpenClick}>
              <span>📂</span> Open Project (.json)
            </button>
            <div className="projDropdownDivider" />
            <button className="projDropdownItem" onClick={handleNewProject}>
              <span>＋</span> New Project
            </button>
            <button className="projDropdownItem danger" onClick={handleResetDemo}>
              <span>↺</span> Reset to Demo
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <input className="ttl" value={project.title}
        title="Project title"
        onChange={e => dispatch({ type: 'project/patch', patch: { title: e.target.value } })} />

      {/* Auto-save status badge */}
      <span className={'saveBadge ' + (saveStatus || 'saved')} title={saveTitle}>
        <span className={'saveDot' + (saveStatus === 'saving' ? ' pulse' : '')} />
        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : saveStatus === 'error' ? 'Save error' : 'Auto-saved'}
      </span>

      <div className="aspRow" title="Pick the video aspect ratio">
        {aspects.map(a => (
          <button
            key={a.id}
            className={'aspBtn' + (a.id === aspect ? ' on' : '')}
            disabled={recording}
            title={a.name + ' · ' + a.w + '×' + a.h + ' — ' + a.hint}
            onClick={() => actions.changeAspect(a.id)}
          >
            <span className="aspBox" style={{ aspectRatio: a.w + ' / ' + a.h }} />
            <span className="aspLb">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="sp" />
      <button className="btn" onClick={actions.togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
      <button className="btn" onClick={actions.restart}>↺</button>
      <span className="time" ref={timeLabelRef}>{fmt(0)} / {fmt(maxEnd(project.scenes))}</span>
      {recording
        ? <button className="btn rec on" onClick={actions.stopRecord}>■ Stop & save</button>
        : <button className="btn rec" onClick={actions.beginRecord}>⏺ Record</button>}
      <label className="chk" style={{ margin: 0 }}>
        <input type="checkbox" checked={micOn} onChange={e => setMicOn(e.target.checked)} />🎙️ Voice
      </label>
      <div className="sp" />
      <button
        type="button"
        className="btn btnExport"
        title="Export Video (CapCut style)"
        onClick={actions.openExportModal}
      >
        <span>↗</span> Export
      </button>
    </header>
  );
}
