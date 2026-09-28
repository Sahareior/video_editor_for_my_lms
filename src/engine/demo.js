import { uid } from './math.js';
import { placeholderImage, placeholderZoom, placeholderCard } from './placeholder.js';

const LY = (src, name, cam, extra) => ({
  id: uid(), src, name, fill: '#000000', opacity: 1, visible: true,
  cam: cam || { x: .5, y: .5, z: 1.2 }, camTo: null, camKeys: null, ...(extra || {}),
});

/* a demo stroke so the drawing feature is visible the moment the app opens */
const INK = (tool, name, pts, extra) => ({
  id: uid(), tool, name, pts, color: '#ffd60a', width: 11, fill: null,
  loop: false, exitFade: true, anim: { type: 'draw', dur: 0.8, delay: 0.9, ease: 'out' },
  ...(extra || {}),
});

export function demoProject() {
  const board = placeholderImage();   // the full circuit board
  const zoom = placeholderZoom();    // the same board, zoomed into the gates
  const card = placeholderCard();    // a dark formula card

  const S = (name, start, end, layers, extra, texts) =>
    ({ id: uid(), name, start, end, dim: 0.25, spot: 0.35, endcard: false, layers, ...(extra || {}), texts });

  return {
    version: 2, title: 'F = ĀBC — Digital Logic',
    accent: '#ffd60a', bg: '#0a0d15', wm: 'GENESEON',
    media: [
      { id: uid(), src: board, name: 'circuit.png' },
      { id: uid(), src: zoom, name: 'circuit-zoom.png' },
      { id: uid(), src: card, name: 'formula-card.png' },
    ],
    scenes: [
      S('HOOK', 0, 3.5, [LY(board, 'Board', { x: .5, y: .47, z: 1.1 })], { dim: .18 }, [
        { text: 'DIGITAL LOGIC ⚡', style: 'pop', size: 112, y: .16, color: 'accent', delay: .15, plate: false },
        { text: 'Can you work out F for this circuit?', style: 'rise', size: 52, y: .87, color: 'white', delay: .7, plate: true }]),

      S('CHALLENGE', 3.5, 8, [LY(board, 'Board', { x: .5, y: .5, z: 1.32 })], { dim: .5, spot: 0 }, [
        { text: '5 seconds ⏱️', style: 'pop', size: 78, y: .26, color: 'accent', delay: .2, plate: true },
        { text: '5 → 4 → 3 → 2 → 1', style: 'type', size: 84, y: .55, color: 'white', delay: .7, plate: false }]),

      /* ——— two images on one scene ——— */
      S('STEP 1', 8, 13, [
        LY(board, 'Full board', { x: .27, y: .66, z: 1.9 }),
        LY(zoom, 'Zoom in', { x: .5, y: .5, z: 1.25 }),
      ], { dim: .3 }, [
        { text: 'STEP 1', style: 'slide', size: 40, y: .12, color: 'accent', delay: .1, plate: false },
        { text: 'Two images at once 🗂', style: 'pop', size: 56, y: .88, color: 'white', delay: .9, plate: true }]),

      /* ——— three images + a black gap ——— */
      S('STEP 2', 13, 19, [
        LY(board, 'Board (below)', { x: .5, y: .5, z: 1.3 }),
        LY(null, 'Empty — black slot', { x: .5, y: .5, z: 1 }, { opacity: .62 }),
        LY(card, 'Formula card (above)', { x: .5, y: .5, z: 1.05 }),
      ], { dim: .18, spot: 0 }, [
        { text: 'STEP 2', style: 'slide', size: 40, y: .1, color: 'accent', delay: .1, plate: false },
        { text: '🖼 Board → ⬛ gap → 🖼 card', style: 'rise', size: 44, y: .93, color: 'white', delay: 1, plate: true }]),

      S('STEP 3', 19, 25, [
        LY(board, 'Board (back)', { x: .5, y: .5, z: 1.2 }),
        LY(zoom, 'Zoom (middle)', { x: .5, y: .5, z: 1.3 }, { opacity: .95 }),
        LY(card, 'Card (front)', { x: .5, y: .5, z: 1.12 }),
      ], { dim: .25 }, [
        { text: 'STEP 3 — 3 layers', style: 'slide', size: 40, y: .1, color: 'accent', delay: .1, plate: false },
        { text: 'Each one with its own camera 🎯', style: 'pop', size: 50, y: .92, color: 'white', delay: .9, plate: true }]),

      S('STEP 4', 25, 30, [
        LY(board, 'Board', { x: .5, y: .5, z: 1.4 }),
        LY(zoom, 'Zoom', { x: .5, y: .5, z: 1.2 }),
      ], { dim: .3, annots: [
        // circled in, then pointed at — exactly what the draw tool produces
        INK('ellipse', 'Circle', [{ x: .335, y: .5 }, { x: .665, y: .5 }], { width: 12 }),
        INK('arrow', 'Arrow', [{ x: .78, y: .8 }, { x: .63, y: .57 }], { width: 13, color: '#ff4d4d', anim: { type: 'draw', dur: .5, delay: 1.5, ease: 'out' } }),
      ] }, [
        { text: 'STEP 4', style: 'slide', size: 40, y: .12, color: 'accent', delay: .1, plate: false },
        { text: 'P + P = P', style: 'blast', size: 110, y: .45, color: 'accent', delay: .3, plate: false },
        { text: 'F = complement of A + P', style: 'rise', size: 44, y: .8, color: 'white', delay: 1, plate: true }]),

      S('STEP 5', 30, 35, [
        LY(board, 'Board', { x: .5, y: .5, z: 1.15 }),
        LY(null, 'Empty — black', { x: .5, y: .5, z: 1 }, { opacity: .5 }),
      ], { dim: .35, spot: .2 }, [
        { text: 'STEP 5', style: 'slide', size: 40, y: .12, color: 'accent', delay: .1, plate: false },
        { text: "De Morgan's Theorem", style: 'slide', size: 52, y: .32, color: 'accent', delay: .3, plate: false },
        { text: 'Remove the image and the slot stays black ⬛', style: 'pop', size: 46, y: .85, color: 'white', delay: .8, plate: true }]),

      S('STEP 6', 35, 39, [LY(card, 'Card', { x: .5, y: .5, z: 1.28 })], { dim: .35 }, [
        { text: 'B·B̄ = 0', style: 'blast', size: 84, y: .34, color: 'white', delay: .3, plate: true },
        { text: 'F = ĀBC ✅', style: 'pop', size: 110, y: .62, color: 'accent', delay: 1.1, plate: false }]),

      S('END', 39, 44, [], { endcard: true, dim: 0 }, [
        { text: 'F = ĀBC', style: 'pop', size: 150, y: .42, color: 'accent', delay: .15, plate: false },
        { text: 'Did your answer match?', style: 'rise', size: 56, y: .63, color: 'white', delay: .8, plate: false },
        { text: 'GENESEON | DIGITAL LOGIC', style: 'type', size: 32, y: .9, color: 'white', delay: 1.5, plate: false }]),
    ],
  };
}
