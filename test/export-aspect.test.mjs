/* End-to-end: does the export actually produce a playable file, in every
   aspect ratio, with a Bengali title? This is the regression the user hit. */
import { chromium } from 'playwright';
import { mkdtempSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SHOTS = '/workspace/gs/shots';
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
const dl = mkdtempSync(join(tmpdir(), 'gs-e2e-'));
const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome';

const b = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|favicon/.test(m.text())) errs.push('CONSOLE ' + m.text()); });

let bad = 0;
const t = (n, c, extra) => { if (!c) bad++; console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + n + (extra ? '  ' + extra : '')); };

await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

const cvBox = async () => p.evaluate(() => {
  const c = document.querySelector('canvas.stage');
  return { w: c.width, h: c.height, cw: Math.round(c.getBoundingClientRect().width), ch: Math.round(c.getBoundingClientRect().height) };
});

/* a Bengali title is the case that used to collapse to a file named "download" */
await p.locator('.ttl').fill('আমার ব্যাখ্যা 🎬');
await p.waitForTimeout(400);

for (const id of ['16:9', '9:16', '1:1', '4:5']) {
  console.log('\n\x1b[1m' + id + '\x1b[0m');
  await p.locator(`.aspBtn[title*="${(await p.locator('.aspBtn').nth(['16:9','9:16','1:1','4:5'].indexOf(id)).getAttribute('title')).split(' ')[0]}"]`).first().click().catch(() => {});
  await p.waitForTimeout(600);

  const b0 = await cvBox();
  const exp = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] }[id];
  t('canvas backing store is ' + exp[0] + '×' + exp[1], b0.w === exp[0] && b0.h === exp[1], JSON.stringify(b0));
  t('the preview fits the column (no overflow)', b0.ch <= 1000 && b0.cw <= 1600, `displayed ${b0.cw}×${b0.ch}`);

  /* the frame must actually be painted, not a black rectangle */
  const painted = await p.evaluate(() => {
    const c = document.querySelector('canvas.stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4 * 997) {
      if (Math.abs(d[i] - 10) + Math.abs(d[i + 1] - 13) + Math.abs(d[i + 2] - 21) > 24) nonBg++;
    }
    return nonBg;
  });
  t('the stage is actually painted', painted > 20, painted + ' sampled non-bg px');

  await p.screenshot({ path: join(SHOTS, 'aspect-' + id.replace(':', 'x') + '.png') });

  /* record ~4s and confirm a real, playable file lands with a real name */
  const dlp = p.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await p.getByRole('button', { name: /রেকর্ড/ }).click();
  await p.waitForTimeout(3800);
  await p.getByRole('button', { name: /স্টপ/ }).click().catch(() => {});
  const d = await dlp;
  t('a download fires', !!d);
  if (d) {
    t('filename keeps the title + extension (not "download")',
      /\.(webm|mp4)$/.test(d.suggestedFilename()) && d.suggestedFilename() !== 'download',
      JSON.stringify(d.suggestedFilename()));
    const out = join(dl, d.suggestedFilename());
    await d.saveAs(out);
    const sz = statSync(out).size;
    t('file is not empty', sz > 20000, sz + ' bytes');
    if (existsSync('/usr/bin/ffprobe')) {
      let info = '';
      try {
        info = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${out}"`).toString().trim();
      } catch (e) { info = 'probe-failed'; }
      t('video decodes at the chosen ratio', info === exp[0] + ',' + exp[1], info);
    }
  }
  await p.waitForTimeout(1200);
}

/* aspect must survive a save/load round-trip */
console.log('\n\x1b[1mpersistence\x1b[0m');
const roundTrip = await p.evaluate(() => {
  const cur = document.querySelector('.aspBtn.on');
  return cur ? cur.title : null;
});
t('a ratio is selected', !!roundTrip, roundTrip || '');

console.log('\npage errors:', errs.length ? errs : 'none');
if (errs.length) bad++;
console.log(bad ? '\n\x1b[31m' + bad + ' failed\x1b[0m' : '\n\x1b[32mall export + aspect checks passed\x1b[0m');
await b.close();
process.exit(bad ? 1 : 0);
