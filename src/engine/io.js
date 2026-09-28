/* ---------- downloads ----------
   Every export path funnels through here so the browser quirks are handled
   once instead of at each call site. */

/* Turn a project title into a filename the browser will actually honour.
   A `download` attribute containing characters outside the OS/browser's
   accepted set is silently DISCARDED — Chrome then saves the blob as a file
   literally called "download", with no extension, which the OS cannot open.
   Bengali/emoji titles hit this constantly, so we keep only a safe subset
   and always fall back to a real name. */
export function safeName(raw, fallback) {
  let s = String(raw == null ? '' : raw)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // drop combining accents
    .replace(/[^\w\s.-]/g, ' ')         // everything else → space
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');      // no leading/trailing dots or dashes
  /* keep it short enough for every filesystem (255-byte name limit) */
  if (s.length > 80) s = s.slice(0, 80).replace(/[-.]+$/, '');
  return s || (fallback || 'geneseon');
}

/* Trigger a download for a blob.

   The anchor MUST be in the document: a detached anchor's `download`
   attribute is ignored by some browsers, and Firefox in particular drops the
   whole download. We also revoke the object URL afterwards — a 44s 1080p
   recording is ~11MB of blob pinned in memory for the life of the tab
   otherwise, and repeated exports would pile up until the tab dies. */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function saveProjectJSON(project) {
  /* `image` is a legacy mirror of media[0] and would duplicate the whole
     base64 blob in the file — drop it on the way out. normalize() rebuilds it
     on load, so old and new files both round-trip. */
  const { image, ...rest } = project;
  const blob = new Blob([JSON.stringify({ version: 2, ...rest })], { type: 'application/json' });
  downloadBlob(blob, safeName(project.title, 'geneseon-project') + '.geneseon.json');
}
