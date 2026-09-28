/* Pure-logic tests for the export fix and the aspect engine — no browser. */
import { safeName } from '../src/engine/io.js';
import { ASPECTS, DEFAULT_ASPECT, aspectById, normalizeAspect, stage, scaleOf } from '../src/engine/aspect.js';
import { setStage } from '../src/engine/constants.js';

let bad = 0;
const t = (n, c, x) => { if (!c) bad++; console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nsafeName — the bug that broke every export');
t('plain ascii is preserved', safeName('My Explainer') === 'My-Explainer');
t('spaces become dashes', safeName('a b c') === 'a-b-c');
/* a browser DISCARDS a `download` value outside its accepted charset and
   saves the blob as a file literally called "download" — this is the case the
   user hit with a Bengali title */
t('bengali falls back to a usable name', safeName('আমার ব্যাখ্যা 🎬', 'geneseon-explainer') === 'geneseon-explainer');
t('devanagari falls back too', safeName('नमस्ते', 'fb') === 'fb');
t('emoji is stripped, not passed through', !/[^\x00-\x7F]/.test(safeName('Reel 🎬 1', 'fb')));
t('accented latin degrades to ascii', safeName('F = ĀBC — HSC ICT') === 'F-ABC-HSC-ICT', safeName('F = ĀBC — HSC ICT'));
t('never returns an empty string', safeName('') === 'geneseon');
t('never returns an empty string (whitespace)', safeName('   ') === 'geneseon');
t('null/undefined are safe', safeName(null) === 'geneseon' && safeName(undefined) === 'geneseon');
t('no path traversal survives', !safeName('../../etc/passwd').includes('/'), safeName('../../etc/passwd'));
t('no leading or trailing dot (windows)', !/^\./.test(safeName('...hidden')), safeName('...hidden'));
t('result is filesystem-length safe', safeName('x'.repeat(500)).length <= 80, safeName('x'.repeat(500)).length);
t('collapses dash runs', safeName('a -- -- b') === 'a-b', safeName('a -- -- b'));
t('keeps dots inside a name', safeName('chapter 1.2 intro') === 'chapter-1.2-intro', safeName('chapter 1.2 intro'));

console.log('\naspect catalogue');
t('four ratios are offered', ASPECTS.length === 4, ASPECTS.map(a => a.id));
t('default is 16:9', DEFAULT_ASPECT === '16:9');
t('every ratio is positive and integral', ASPECTS.every(a => a.w > 0 && a.h > 0 && a.w % 1 === 0 && a.h % 1 === 0));
t('the labels match the true ratios', ASPECTS.every(a => {
  const [x, y] = a.id.split(':').map(Number);
  return Math.abs(a.w / a.h - x / y) < 0.001;
}), ASPECTS.map(a => a.id + '=' + a.w + 'x' + a.h));
t('16:9 is the 1920x1080 reference', aspectById('16:9').w === 1920 && aspectById('16:9').h === 1080);
t('9:16 is a true vertical', aspectById('9:16').w === 1080 && aspectById('9:16').h === 1920);
t('unknown ids fall back to the default', aspectById('21:9').id === '16:9');
t('normalizeAspect rejects garbage', normalizeAspect('banana') === '16:9' && normalizeAspect(null) === '16:9' && normalizeAspect(undefined) === '16:9');
t('normalizeAspect keeps a valid id', normalizeAspect('9:16') === '9:16');

console.log('\nstage scaling');
t('the reference scale is 1', Math.abs(scaleOf(1920, 1080) - 1) < 1e-9);
t('a 1080-wide vertical scales down', scaleOf(1080, 1920) < 1, scaleOf(1080, 1920));
t('scale follows the short edge, so 1:1 and 9:16 tie', Math.abs(scaleOf(1080, 1080) - scaleOf(1080, 1920)) < 1e-9, [scaleOf(1080, 1080), scaleOf(1080, 1920)]);
t('a wider stage scales up', scaleOf(1920, 1080) > scaleOf(1080, 1080), [scaleOf(1920, 1080), scaleOf(1080, 1080)]);
t('scale is driven by the SHORT edge', Math.abs(scaleOf(1080, 1080) - 1080 / 1920) < 1e-9);
t('a 4K landscape is scaled up, not clamped', scaleOf(3840, 2160) > 1, scaleOf(3840, 2160));

/* setStage mutates the live bindings the engine reads at draw time */
const mod = await import('../src/engine/constants.js');
t('setStage updates the exported W', (setStage(1080, 1920), mod.W === 1080 && mod.H === 1920), [mod.W, mod.H]);
t('setStage updates the shared stage object', stage.w === 1080 && stage.h === 1920, [stage.w, stage.h]);
t('S() follows the stage', Math.abs(mod.S() - 1080 / 1920) < 1e-9, mod.S());
setStage(1920, 1080);
t('and switching back restores 16:9', mod.W === 1920 && mod.H === 1080, [mod.W, mod.H]);

console.log(bad ? '\n\x1b[31m' + bad + ' failed\x1b[0m' : '\n\x1b[32mall passed\x1b[0m');
process.exit(bad ? 1 : 0);
