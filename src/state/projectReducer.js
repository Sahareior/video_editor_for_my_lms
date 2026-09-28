import { uid, clamp } from '../engine/math.js';
import { normalizeInks } from '../engine/ink.js';
import { normalizeAspect, DEFAULT_ASPECT } from '../engine/aspect.js';

/* ---------- layers ----------
   A scene owns a stack of image layers (index 0 = bottom-most, like a
   compositor / CapCut track list). A layer is either:
     - filled  → has src, draws the image through its own camera
     - EMPTY   → src === null, draws a flat colour (black by default).
                 This is the "remove the image but keep the gap" behaviour. */

export function makeLayer(patch) {
  return normalizeLayer({ id: uid(), name: 'Layer', ...(patch || {}) });
}

export function normalizeLayer(L) {
  L = L || {};
  const cam = L.cam || {}, to = L.camTo || null;
  const nz = (v, d) => (v === undefined || v === null || !isFinite(+v)) ? d : +v;
  return {
    id: L.id || uid(),
    src: L.src || null,
    name: L.name || 'Layer',
    fill: L.fill || '#000000',
    opacity: L.opacity === undefined ? 1 : clamp(nz(L.opacity, 1), 0, 1),
    visible: L.visible === undefined ? true : !!L.visible,
    cam: { x: clamp(nz(cam.x, .5), 0, 1), y: clamp(nz(cam.y, .5), 0, 1), z: Math.max(1, nz(cam.z, 1.2)) },
    camTo: to ? { x: clamp(nz(to.x, .5), 0, 1), y: clamp(nz(to.y, .5), 0, 1), z: Math.max(1, nz(to.z, 1.2)) } : null,
    camKeys: normalizeKeys(L.camKeys),
  };
}

/* is this layer showing an image (as opposed to a blank gap)? */
export const layerHasImage = (L) => !!(L && L.src);

/* human label for the layer row */
export const layerLabel = (L) => (L && L.src) ? (L.name || 'Image') : (L && L.name ? L.name + ' (empty)' : 'Empty');

export function makeLine() {
  return { text: 'New line', style: 'pop', size: 64, y: .5, color: 'white', custom: '#ffffff', delay: .2, plate: false };
}

export function makeScene(start, index) {
  return {
    name: 'SCENE ' + (index + 1), start, end: start + 4,
    dim: .25, spot: .35, endcard: false,
    layers: [makeLayer({ name: 'Layer 1' })],
    texts: [{ text: 'New scene', style: 'pop', size: 84, y: .5, color: 'accent', delay: .1, plate: true }],
  };
}

export function normalizeKey(k) {
  const cam = k.cam || { x: .5, y: .5, z: 1.2 };
  return {
    t: clamp(+k.t || 0, 0, 1),
    cam: { x: +cam.x || .5, y: +cam.y || .5, z: Math.max(1, +cam.z || 1) },
    ease: k.ease || 'in-out',
  };
}

export function normalizeKeys(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr.map(normalizeKey).sort((a, b) => a.t - b.t);
}

/* initialize camKeys from the legacy cam + camTo (or cam alone if no camTo) */
export function keysFromLegacyCam(node) {
  const a = node.cam || { x: .5, y: .5, z: 1.2 };
  if (node.camTo) {
    return [
      { t: 0, cam: { x: +a.x, y: +a.y, z: +a.z || 1 }, ease: 'in-out' },
      { t: 1, cam: { x: +node.camTo.x, y: +node.camTo.y, z: +node.camTo.z || 1 }, ease: 'in-out' },
    ];
  }
  return [
    { t: 0, cam: { x: +a.x, y: +a.y, z: +a.z || 1 }, ease: 'in-out' },
    { t: 1, cam: { x: +a.x, y: +a.y, z: Math.min(6, (+a.z || 1) + 0.4) }, ease: 'in-out' },
  ];
}

/* Legacy projects had a single global image + scene-level camera.
   Migrate them into a one-layer scene so old files keep opening intact. */
export function normalizeScene(s, legacyImg) {
  const base = {
    id: s.id || uid(),
    name: s.name || 'SCENE',
    start: +s.start || 0,
    end: +s.end || 4,
    dim: +s.dim || 0,
    spot: +s.spot || 0,
    endcard: !!s.endcard,
  };

  const layers = Array.isArray(s.layers)
    ? s.layers.map(normalizeLayer)
    : [normalizeLayer({
        id: uid(),
        src: (legacyImg && legacyImg.src) || null,
        name: (legacyImg && legacyImg.name) || 'Layer 1',
        cam: s.cam, camTo: s.camTo, camKeys: s.camKeys,
      })];

  return {
    ...base,
    layers,
    /* drawn annotations — absent in older project files, normalizeInks turns
       that into an empty list so legacy JSON keeps opening untouched */
    annots: normalizeInks(s.annots),
    texts: (s.texts || []).map(L => ({
      text: L.text || '', style: L.style || 'pop', size: +L.size || 64, y: +L.y || .5,
      color: L.color || 'white', custom: L.custom || '#ffffff', delay: +L.delay || 0, plate: !!L.plate,
      outline: L.outline === undefined ? true : !!L.outline,
    })),
  };
}

export function normalize(j) {
  j = j || {};
  j = { ...j };
  j.title = j.title || 'My Explainer';
  j.accent = j.accent || '#ffd60a';
  j.bg = j.bg || '#0a0d15';
  j.wm = j.wm !== undefined ? j.wm : 'GENESEON';
  /* aspect ratio — absent in older project files, so they land on 16:9 */
  j.aspect = normalizeAspect(j.aspect || DEFAULT_ASPECT);

  /* media bin — deduped, legacy project.image folded in as the first entry */
  const media = [], seen = new Set();
  const add = (m) => {
    if (!m || !m.src || seen.has(m.src)) return;
    seen.add(m.src);
    media.push({ id: m.id || uid(), src: m.src, name: m.name || 'Image' });
  };
  (Array.isArray(j.media) ? j.media : []).forEach(add);
  add(j.image);
  j.media = media;
  j.image = media.length ? media[0] : null; // legacy field: first bin item

  j.scenes = (j.scenes || []).map(s => normalizeScene(s, j.image));
  return j;
}

const mapScene = (state, id, fn) => ({ ...state, scenes: state.scenes.map(s => s.id === id ? fn(s) : s) });
const mapLayer = (state, sceneId, layerId, fn) =>
  mapScene(state, sceneId, s => ({ ...s, layers: s.layers.map(L => L.id === layerId ? fn(L) : L) }));

export function projectReducer(state, action) {
  switch (action.type) {
    case 'project/load':
      return normalize(action.project);

    case 'project/new':
      return normalize({
        title: 'My Explainer',
        media: action.media || (action.image ? [action.image] : []),
        scenes: [{
          name: 'SCENE 1', start: 0, end: 5, dim: .3, spot: .35,
          layers: [makeLayer({ name: 'Layer 1' })],
          texts: [{ text: 'Your question here', style: 'pop', size: 84, y: .5, color: 'accent', delay: .2, plate: true }],
        }],
      });

    case 'project/patch':
      return { ...state, ...action.patch };

    /* ---------- media bin ---------- */
    case 'media/add': {
      const m = action.media;
      if (!m || !m.src) return state;
      const hit = state.media.find(x => x.src === m.src);
      if (hit) return state;
      return { ...state, media: [...state.media, { id: m.id || uid(), src: m.src, name: m.name || 'Image' }] };
    }

    case 'media/delete': {
      const media = state.media.filter(m => m.id !== action.id);
      return { ...state, media, image: media.length ? media[0] : null };
    }

    /* legacy single-image setter — still used by "apply media to scene" */
    case 'image/set':
      return { ...state, image: action.image };

    /* ---------- scenes ---------- */
    case 'scene/add':
      return { ...state, scenes: [...state.scenes, normalizeScene(makeScene(action.start, state.scenes.length))] };

    case 'scene/update':
      return mapScene(state, action.id, s => ({ ...s, ...action.patch }));

    case 'scene/duplicate': {
      const i = state.scenes.findIndex(s => s.id === action.id);
      if (i < 0) return state;
      const s = state.scenes[i];
      const clone = normalizeScene({
        ...JSON.parse(JSON.stringify(s)),
        id: uid(),
        // fresh layer ids so the clone's layers are independently addressable
        layers: s.layers.map(L => ({ ...JSON.parse(JSON.stringify(L)), id: uid() })),
        // same for annotations, otherwise selecting one selects both
        annots: (s.annots || []).map(a => ({ ...JSON.parse(JSON.stringify(a)), id: uid() })),
        name: s.name + ' copy',
        start: +s.end, end: +s.end + (+s.end - +s.start),
      });
      const arr = [...state.scenes];
      arr.splice(i + 1, 0, clone);
      return { ...state, scenes: arr };
    }

    case 'scene/delete':
      return { ...state, scenes: state.scenes.filter(s => s.id !== action.id) };

    case 'scene/move': {
      const arr = [...state.scenes];
      const i = arr.findIndex(s => s.id === action.id);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= arr.length) return state;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...state, scenes: arr };
    }

    /* ---------- lines (text) ---------- */
    case 'line/add':
      return mapScene(state, action.id, s => ({ ...s, texts: [...s.texts, makeLine()] }));

    case 'line/update':
      return mapScene(state, action.id, s => ({ ...s, texts: s.texts.map((L, i) => i === action.index ? { ...L, ...action.patch } : L) }));

    case 'line/delete':
      return mapScene(state, action.id, s => ({ ...s, texts: s.texts.filter((_, i) => i !== action.index) }));

    case 'line/move':
      return mapScene(state, action.id, s => {
        const t = [...s.texts]; const j = action.index + action.dir;
        if (j < 0 || j >= t.length) return s;
        [t[action.index], t[j]] = [t[j], t[action.index]];
        return { ...s, texts: t };
      });

    /* ---------- layers ---------- */
    case 'layer/add': {
      return mapScene(state, action.sceneId, s => {
        // callers may pass a pre-built layer (so they can pre-select its id)
        const L = action.layer
          ? normalizeLayer(action.layer)
          : makeLayer({ src: action.src || null, name: action.name || ('Layer ' + (s.layers.length + 1)) });
        const arr = [...s.layers];
        // top of the stack by default (last = drawn last = on top)
        if (action.index == null || action.index >= arr.length) arr.push(L);
        else arr.splice(Math.max(0, action.index), 0, L);
        return { ...s, layers: arr };
      });
    }

    case 'layer/update':
      return mapLayer(state, action.sceneId, action.layerId, L => ({
        ...L, ...action.patch, cam: action.patch && action.patch.cam ? { ...L.cam, ...action.patch.cam } : L.cam,
      }));

    case 'layer/delete':
      return mapScene(state, action.sceneId, s => ({ ...s, layers: s.layers.filter(L => L.id !== action.layerId) }));

    case 'layer/duplicate':
      return mapScene(state, action.sceneId, s => {
        const i = s.layers.findIndex(L => L.id === action.layerId);
        if (i < 0) return s;
        const arr = [...s.layers];
        const L = arr[i];
        arr.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(L)), id: uid(), name: L.name + ' copy' });
        return { ...s, layers: arr };
      });

    case 'layer/move': {
      return mapScene(state, action.sceneId, s => {
        const i = s.layers.findIndex(L => L.id === action.layerId);
        const j = i + action.dir;
        if (i < 0 || j < 0 || j >= s.layers.length) return s;
        const arr = [...s.layers];
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...s, layers: arr };
      });
    }

    /* "remove the image but keep the slot" — the gap renders as a flat fill */
    case 'layer/clear':
      return mapLayer(state, action.sceneId, action.layerId, L => ({ ...L, src: null }));

    case 'layer/fill':
      return mapLayer(state, action.sceneId, action.layerId, L => ({ ...L, src: action.src || null, name: action.name || L.name }));

    /* ---------- annotations (drawn ink) ----------
       Same shape as texts: a per-scene array where the last entry is drawn
       on top. Points are normalised 0..1 so the file is resolution-safe. */
    case 'annot/add':
      return mapScene(state, action.id, s => ({ ...s, annots: [...(s.annots || []), normalizeInks([action.annot])[0]].filter(Boolean) }));

    case 'annot/update':
      return mapScene(state, action.id, s => ({
        ...s,
        annots: (s.annots || []).map(a => (a.id === action.annotId ? normalizeInks([{ ...a, ...action.patch, anim: { ...a.anim, ...(action.patch || {}).anim } }])[0] : a)),
      }));

    case 'annot/delete':
      return mapScene(state, action.id, s => ({ ...s, annots: (s.annots || []).filter(a => a.id !== action.annotId) }));

    case 'annot/clear':
      return mapScene(state, action.id, s => ({ ...s, annots: [] }));

    case 'annot/move': {
      return mapScene(state, action.id, s => {
        const arr = [...(s.annots || [])];
        const i = arr.findIndex(a => a.id === action.annotId);
        const j = i + action.dir;
        if (i < 0 || j < 0 || j >= arr.length) return s;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...s, annots: arr };
      });
    }

    /* ---------- keyframes (per layer) ---------- */
    case 'camkeys/init':
      return mapLayer(state, action.sceneId, action.layerId, L => ({ ...L, camKeys: keysFromLegacyCam(L) }));

    case 'camkeys/toggle':
      return mapLayer(state, action.sceneId, action.layerId, L => ({
        ...L, camKeys: L.camKeys && L.camKeys.length ? null : keysFromLegacyCam(L),
      }));

    case 'camkeys/add':
      return mapLayer(state, action.sceneId, action.layerId, L => {
        const ks = (L.camKeys && L.camKeys.length) ? [...L.camKeys] : keysFromLegacyCam(L);
        const last = ks[ks.length - 1];
        const prevT = last ? last.t : 0;
        const newT = clamp(prevT + 0.25, 0, 1);
        const lerp = (a, b, p) => a + (b - a) * p;
        const baseCam = ks[0] ? ks[0].cam : L.cam || { x: .5, y: .5, z: 1.2 };
        const tipCam = { x: clamp(baseCam.x + 0.1, 0, 1), y: clamp(baseCam.y + 0.1, 0, 1), z: Math.min(6, (baseCam.z || 1) + 0.4) };
        const segP = prevT < 1 ? (newT - prevT) / Math.max(0.0001, 1 - prevT) : 0.5;
        ks.push({
          t: newT,
          cam: {
            x: lerp(baseCam.x, tipCam.x, segP),
            y: lerp(baseCam.y, tipCam.y, segP),
            z: lerp(baseCam.z || 1, tipCam.z, segP),
          },
          ease: 'in-out',
        });
        return { ...L, camKeys: ks.sort((a, b) => a.t - b.t) };
      });

    case 'camkeys/delete':
      return mapLayer(state, action.sceneId, action.layerId, L => {
        if (!L.camKeys || L.camKeys.length <= 2) return L; // keep at least 2 waypoints
        return { ...L, camKeys: L.camKeys.filter((_, i) => i !== action.index) };
      });

    case 'camkeys/update':
      return mapLayer(state, action.sceneId, action.layerId, L => {
        if (!L.camKeys || !L.camKeys[action.index]) return L;
        const ks = L.camKeys.map((k, i) => {
          if (i !== action.index) return k;
          const patch = action.patch || {};
          const next = { ...k, ...patch };
          if (patch.cam) next.cam = { ...k.cam, ...patch.cam };
          next.t = clamp(+next.t, 0, 1);
          return next;
        }).sort((a, b) => a.t - b.t);
        return { ...L, camKeys: ks };
      });

    default:
      return state;
  }
}
