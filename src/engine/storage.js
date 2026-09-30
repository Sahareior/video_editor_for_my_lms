/* ---------- IndexedDB Project Persistence ----------
   Handles automatic persistence of projects across browser refreshes and sessions.
   Uses IndexedDB because video projects can contain base64 media dataURLs
   that easily exceed localStorage's ~5MB synchronous quota. */

const DB_NAME = 'geneseon_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'project_store';
const CURRENT_PROJECT_KEY = 'active_project';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error || new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

/**
 * Save the active project along with workspace UI state (selected scene, layer, playhead).
 * @param {object} project The project object
 * @param {object} meta Optional workspace metadata { selId, selLayerId, time }
 */
export async function saveActiveProject(project, meta = {}) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const { image, ...cleanProject } = project || {};
      const payload = {
        key: CURRENT_PROJECT_KEY,
        updatedAt: Date.now(),
        project: cleanProject,
        meta: {
          selId: meta.selId || null,
          selLayerId: meta.selLayerId || null,
          time: typeof meta.time === 'number' ? meta.time : 0,
        },
      };
      const req = store.put(payload, CURRENT_PROJECT_KEY);
      req.onsuccess = () => resolve(payload);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[storage] Failed to save active project to IndexedDB:', err);
    throw err;
  }
}

/**
 * Load the active project and workspace metadata.
 * @returns {Promise<{ project: object, meta: object, updatedAt: number } | null>}
 */
export async function loadActiveProject() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CURRENT_PROJECT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[storage] Failed to load active project from IndexedDB:', err);
    return null;
  }
}

/**
 * Clear the active project from storage (e.g. user chose to reset to fresh demo).
 */
export async function clearActiveProject() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(CURRENT_PROJECT_KEY);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[storage] Failed to clear active project from IndexedDB:', err);
    return false;
  }
}
