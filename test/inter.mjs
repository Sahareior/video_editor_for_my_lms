import { launch } from './browser.mjs';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
let bad = 0;
const t = (n, c) => { if (!c) bad++; console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + n); };

const rows = () => p.locator('.inkLyr').count();
const bb = await p.locator('canvas.stage').boundingBox();
const at = (fx, fy) => ({ x: bb.x + bb.width * fx, y: bb.y + bb.height * fy });
const drag = async (a, z, steps = 16) => {
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  for (let i = 1; i <= steps; i++) await p.mouse.move(a.x + (z.x - a.x) * i / steps, a.y + (z.y - a.y) * i / steps);
  await p.mouse.up(); await p.waitForTimeout(1200);
};
const centroidY = () => p.evaluate(() => {
  const cv = document.querySelector('canvas.stage');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let sy = 0, n = 0;
  for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
    const i = (y * cv.width + x) * 4;
    if (d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 110 && d[i + 3] > 150) { sy += y; n++; }
  }
  return n ? sy / n : 0;
});

await p.getByRole('button', { name: /Draw mode/ }).first().click();
await p.waitForTimeout(400);

console.log('\ncreate');
await p.getByTitle('Rectangle').click();
await drag(at(0.2, 0.2), at(0.5, 0.5));
t('rect drawn', await rows() === 1);
await drag(at(0.55, 0.55), at(0.85, 0.85));
t('second rect stacks on top', await rows() === 2);

console.log('\nundo / redo-the-other-way');
await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
t('Ctrl+Z removes the newest', await rows() === 1);
await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
t('Ctrl+Z again empties the list', await rows() === 0);
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
t('Ctrl+Z on an empty stack is harmless', await rows() === 0);

console.log('\nalt-click delete + its undo');
await drag(at(0.2, 0.2), at(0.5, 0.5));
await p.keyboard.down('Alt');
await p.mouse.click(at(0.5, 0.35).x, at(0.5, 0.35).y);
await p.keyboard.up('Alt');
await p.waitForTimeout(400);
t('Alt+click deleted the stroke', await rows() === 0);
await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
t('undo brought it back', await rows() === 1);

console.log('\nselect tool: move');
await p.getByTitle('Select').click(); await p.waitForTimeout(250);
const y0 = await centroidY();
await drag(at(0.5, 0.35), at(0.5, 0.8), 14);
const y1 = await centroidY();
t('drag moved the stroke down (' + Math.round(y0) + 'px → ' + Math.round(y1) + 'px)', y1 - y0 > 60);
t('the stroke is still there', await rows() === 1);
await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
const y2 = await centroidY();
t('undo restored its original position', Math.abs(y2 - y0) < 25);

console.log('\nshift constrains (blank stage, one stroke at a time)');
// the demo artwork, its accent-coloured headlines, the spotlight ring and the
// watermark are ALL accent yellow — strip the scene down to a blank stage so a
// pixel measurement can only be seeing ink
await p.locator('.colL input.inpT').last().fill('');          // blank the watermark
await p.waitForTimeout(300);
const delLayer = p.locator('.colR .lyr').first().locator('button[title="Delete layer"]');
if (await delLayer.count()) { await delLayer.click(); await p.waitForTimeout(400); }
while (await p.locator('.lineBox').count()) {
  await p.locator('.lineBox button.mini').last().click();     // ✕ on each text line
  await p.waitForTimeout(250);
}
const dim = p.locator('.colR input[type=range]').last();
await dim.fill('0'); await p.waitForTimeout(300);
const clearAll = async () => { while (await rows() > 0) { await p.locator('.inkLyr').first().locator('button[title="Delete"]').click(); await p.waitForTimeout(200); } };
await clearAll();
const dims = async () => p.evaluate(() => {
  const cv = document.querySelector('canvas.stage');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const i = (y * cv.width + x) * 4;
    if (d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 110 && d[i + 3] > 150) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { w: x1 - x0, h: y1 - y0 };
});
await p.getByTitle('Rectangle').click(); await p.waitForTimeout(150);
await drag(at(0.2, 0.2), at(0.6, 0.3), 10);
const free = await dims();
await clearAll();
await p.keyboard.down('Shift');
await drag(at(0.2, 0.2), at(0.6, 0.3), 10);
await p.keyboard.up('Shift');
const sq = await dims();
console.log('    free=', JSON.stringify(free), ' shifted=', JSON.stringify(sq));
t('free drag keeps the aspect (wide, short)', free && free.w > free.h * 1.5, JSON.stringify(free));
t('shift-drag squares it off', sq && Math.abs(sq.w - sq.h) < 80, JSON.stringify(sq));

console.log('\nreorder + hide + delete from the panel');
await clearAll();
await drag(at(0.15, 0.15), at(0.35, 0.35));
await drag(at(0.6, 0.6), at(0.8, 0.8));
t('two strokes to reorder', await rows() === 2);
// give them distinguishable names so the order is observable
// the newest stroke is already selected; pick the other row so the editor opens
if (await p.locator('.inkEdit').count() === 0) await p.locator('.inkLyr').nth(1).click();
await p.waitForTimeout(400);
await p.locator('.inkEdit input.inpT').first().fill('ZZZ');
await p.waitForTimeout(400);
const nameOf = async (i) => (await p.locator('.inkLyr .lyrName').nth(i).textContent()).replace(/#\d+/, '').trim();
const before0 = await nameOf(0), before1 = await nameOf(1);
await p.locator('.inkLyr').first().locator('button[title="Move down"]').click();
await p.waitForTimeout(400);
const after0 = await nameOf(0), after1 = await nameOf(1);
t('↓ swapped the stack (' + before0 + '/' + before1 + ' → ' + after0 + '/' + after1 + ')', after0 === before1 && after1 === before0);

await p.locator('.inkLyr').first().locator('button[title="Hide"]').click();
await p.waitForTimeout(400);
const sub = await p.locator('.lyrSub').first().textContent();
t('hidden row says Hidden (' + JSON.stringify(sub) + ')', /Hidden/.test(sub));
await p.locator('.inkLyr').first().locator('button[title="Show"]').click();
await p.waitForTimeout(400);
t('shown again', !/Hidden/.test(await p.locator('.lyrSub').first().textContent()));
const n = await rows();
await p.locator('.inkLyr').first().locator('button[title="Delete"]').click();
await p.waitForTimeout(300);
t('✕ removed one', await rows() === n - 1);

console.log('\nescape + the demo scene');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
t('Esc closed the toolbar', await p.locator('.inkBar').count() === 0);
await p.locator('.scItem', { hasText: 'STEP 4' }).first().click();
await p.waitForTimeout(500);
t('STEP 4 ships with its demo circle + arrow', await rows() === 2);

console.log('\npage errors:', errs.length ? errs : 'none');
if (errs.length) bad++;
console.log(bad ? '\n\x1b[31m' + bad + ' failed\x1b[0m' : '\n\x1b[32mall interaction checks passed\x1b[0m');
await p.screenshot({ path: '/workspace/gs/shots/06-final.png' });
await b.close();
process.exit(bad ? 1 : 0);
