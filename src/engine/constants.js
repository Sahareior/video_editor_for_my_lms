/* Stage dimensions.

   These used to be frozen constants, which is why every ratio baked its
   layout around 1920x1080. They are now LIVE BINDINGS: aspect.js mutates
   them through setStage() and every module that imports W/H follows along
   automatically, because the engine reads them at draw time rather than
   baking them into module scope. */
import { stage, REF_W, REF_H } from './aspect.js';

export let W = REF_W;
export let H = REF_H;

export function setStage(w, h) {
  W = stage.w = w;
  H = stage.h = h;
  return { w, h };
}

export const KSTYLES = ['pop', 'slide', 'wave', 'type', 'blast', 'rise'];
export const FONT = '"Hind Siliguri", sans-serif';
export const fontF = (s) => `700 ${s}px ${FONT}`;

/* Optical scale for the current stage: 1 on the 1920x1080 reference, ~0.5625
   on a 1080-wide vertical. Used to keep stroke weights, glow radii and font
   sizes proportional when the ratio changes, so a portrait frame is a
   re-framing of the same composition rather than a differently-weighted one. */
export const S = () => Math.min(W / REF_W, H / REF_H);
