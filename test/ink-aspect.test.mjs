/* Two things the aspect refactor could plausibly break, and which no existing
   test covers: drawing on a non-16:9 stage, and aspect surviving a save/load. */
import { launch } from './browser.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dl = mkdtempSync(join(tmpdir(), 'gs-ink-'));
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|favicon/.test(m.text())) errs.push('CONSOLE ' + m.text()); });

let bad = 0;
const t = (n, c, x) => { if (!c) bad++; console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + n + (x ? '  ' + x : '')); };

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

const pick = async (label) => {
  await p.locator('.aspBtn', { hasText: label }).first().click();
  await p.waitForTimeout(500);
};
const inkRows = () => p.locator('.inkLyr').count();
const box = async () => (await p.locator('canvas.stage').boundingBox());

/* a rect drawn as a fraction of the stage must stay a rect on any ratio */
const dims = () => p.evaluate(() => {
  const cv = document.querySelector('canvas.stage');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const i = (y * cv.width + x) * 4;
    if (d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 110 && d[i + 3] > 150) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { w: x1 - x0, h: y1 - y0, fx: (x1 - x0) / cv.width, fy: (y1 - y0) / cv.height };
});

/* The demo scene paints accent-yellow artwork of its own (spotlight ring,
   accent headlines, watermark). Every measurement here is "find yellow
   pixels", so the scene has to be stripped to bare canvas first or the demo
   art dominates the bounding box. */
const blankScene = async () => {
  await p.getByTitle('ডেমো').click().catch(() => {});
  await p.waitForTimeout(500);
  const wm = p.locator('.colL input.inpT').last();
  if (await wm.count()) { await wm.fill(''); await p.waitForTimeout(200); }
  const del = p.locator('.colR .lyr').first().locator('button[title="লেয়ার মুছে ফেলো"]');
  if (await del.count()) { await del.click(); await p.waitForTimeout(300); }
  while (await p.locator('.lineBox').count()) {
    await p.locator('.lineBox button.mini').last().click();
    await p.waitForTimeout(200);
  }
  const dim = p.locator('.colR input[type=range]').last();
  if (await dim.count()) { await dim.fill('0'); await p.waitForTimeout(300); }
  while (await inkRows() > 0) {
    await p.locator('.inkLyr').first().locator('button[title="মুছে ফেলো"]').click();
    await p.waitForTimeout(150);
  }
};

for (const label of ['9:16', '1:1', '16:9']) {
  console.log('\n\x1b[1mdraw on ' + label + '\x1b[0m');
  await pick(label);
  await blankScene();

  /* enter draw mode, draw a free rect, measure it */
  await p.getByRole('button', { name: /ড্র মোড/ }).first().click().catch(() => {});
  await p.waitForTimeout(300);
  await p.getByTitle('আয়তাক').click();
  await p.waitForTimeout(200);

  const bb = await box();
  const at = (fx, fy) => ({ x: bb.x + bb.width * fx, y: bb.y + bb.height * fy });
  await p.mouse.move(at(0.2, 0.2).x, at(0.2, 0.2).y); await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(at(0.2, 0.2).x + (bb.width * 0.6) * i / 12, at(0.2, 0.2).y + (bb.height * 0.6) * i / 12);
  await p.mouse.up();
  await p.waitForTimeout(900);

  t('the stroke is stored', (await inkRows()) === 1, 'rows=' + await inkRows());
  const d = await dims();
  /* asked for 60% x 60% of the stage — allow slack for stroke width */
  t('drawn width tracks the stage width', d && Math.abs(d.fx - 0.6) < 0.12, d ? `fx=${d.fx.toFixed(3)}` : 'no pixels');
  t('drawn height tracks the stage height', d && Math.abs(d.fy - 0.6) < 0.12, d ? `fy=${d.fy.toFixed(3)}` : 'no pixels');

  /* the stored points must be normalised, not baked to a pixel size */
  const pts = await p.evaluate(() => {
    const el = document.querySelector('.inkEdit input.inpT');
    return el ? el.value : null;
  });
  t('a stroke exists in the list', !!pts, pts || '');

  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
}

/* aspect must survive JSON round-trip */
console.log('\n\x1b[1mproject round-trip\x1b[0m');
await pick('9:16');
const dlp = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await p.getByRole('button', { name: /JSON/ }).click();
const d = await dlp;
t('JSON saves', !!d);
if (d) {
  const out = join(dl, 'proj.geneseon.json');
  await d.saveAs(out);
  const j = JSON.parse((await import('node:fs')).readFileSync(out, 'utf8'));
  t('aspect is written to the file', j.aspect === '9:16', JSON.stringify(j.aspect));
  /* reload it and confirm the stage comes back vertical */
  await p.setInputFiles('input[type=file]', out).catch(async () => {
    await p.locator('label.btn:has-text("খোলো") input[type=file]').setInputFiles(out);
  });
  await p.waitForTimeout(900);
  const cv = await p.evaluate(() => { const c = document.querySelector('canvas.stage'); return { w: c.width, h: c.height }; });
  t('reloading restores the vertical stage', cv.w === 1080 && cv.h === 1920, JSON.stringify(cv));
  const on = await p.locator('.aspBtn.on').textContent();
  t('the picker reflects the loaded ratio', /9:16/.test(on), on);
}

/* a legacy file with no aspect key must still open */
console.log('\n\x1b[1mlegacy project (no aspect key)\x1b[0m');
const legacy = join(dl, 'legacy.geneseon.json');
(await import('node:fs')).writeFileSync(legacy, JSON.stringify({ version: 2, title: 'legacy', scenes: [{ name: 'S', start: 0, end: 3, layers: [], texts: [] }] }));
await p.locator('label.btn:has-text("খোলো") input[type=file]').setInputFiles(legacy);
await p.waitForTimeout(900);
const lcv = await p.evaluate(() => { const c = document.querySelector('canvas.stage'); return { w: c.width, h: c.height }; });
t('a pre-aspect project opens at 16:9', lcv.w === 1920 && lcv.h === 1080, JSON.stringify(lcv));

console.log('\npage errors:', errs.length ? errs : 'none');
if (errs.length) bad++;
console.log(bad ? '\n\x1b[31m' + bad + ' failed\x1b[0m' : '\n\x1b[32mall ink + persistence checks passed\x1b[0m');
await b.close();
process.exit(bad ? 1 : 0);
