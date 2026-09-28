import { launch } from './browser.mjs';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);

await p.getByRole('button', { name: /ড্র মোড/ }).first().click();
await p.waitForTimeout(400);
const bb = await p.locator('canvas.stage').boundingBox();
const at = (fx, fy) => ({ x: bb.x + bb.width * fx, y: bb.y + bb.height * fy });

// one big red circle, anim type = draw, so we can count revealed arc
await p.getByTitle('তির').click();               // placeholder to switch tool
await p.getByTitle('বৃত্ত/এলিপ্স').click();
await p.locator('.inkBar .inkDot').nth(1).click(); // red
let s = at(0.25, 0.25), e = at(0.75, 0.85);
await p.mouse.move(s.x, s.y); await p.mouse.down();
for (let i = 1; i <= 20; i++) await p.mouse.move(s.x + (e.x - s.x) * i / 20, s.y + (e.y - s.y) * i / 20);
await p.mouse.up();
await p.waitForTimeout(1500);

// count red pixels in the stage at successive playhead times
const countRed = () => p.evaluate(() => {
  const cv = document.querySelector('canvas.stage');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 170 && d[i + 1] < 110 && d[i + 2] < 110 && d[i + 3] > 120) n++;
  }
  return n;
});
const seek = async (t) => {
  await p.evaluate((tt) => { const ev = new Event('x'); window.__t = tt; }, t);
  // drive via the timeline range input
  const tl = p.locator('.tlTrack input[type=range], input[type=range]').first();
  return null;
};

// simpler: use the scene start + the stroke's delay, sampled by scrubbing the transport
const samples = [];
for (const frac of [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1.0]) {
  // the transport seek bar
  const bar = await p.locator('.seek, .tlSeek, input[type=range]').first().boundingBox().catch(() => null);
  samples.push(frac);
}

// instead of fighting the transport UI, read the frame at exact times via the app's own clock
const frames = await p.evaluate(async () => {
  const out = [];
  const cv = document.querySelector('canvas.stage');
  const g = cv.getContext('2d');
  const red = () => {
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 110 && d[i + 2] < 110 && d[i + 3] > 120) n++;
    return n;
  };
  // HOOK scene is 0–3.5s, stroke delay 0.1 dur 0.55 → sample across 0.1..0.65
  for (const t of [0.0, 0.12, 0.2, 0.3, 0.42, 0.55, 0.8, 2.0]) {
    window.dispatchEvent(new Event('resize'));
    // nudge the shared clock through the seek API on the transport slider
    const slider = document.querySelector('.transport input[type=range], .tlRange');
    if (slider) {
      const max = +slider.max || 1;
      slider.value = String(t);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.push([t, red()]);
  }
  return out;
});
console.log('playhead → red pixels');
for (const [t, n] of frames) console.log('  t=' + t.toFixed(2) + 's  ' + String(n).padStart(6) + ' px');

const counts = frames.map(f => f[1]);
const increasing = counts.every((v, i) => i === 0 || v >= counts[i - 1]);
console.log('\nmonotonically revealing:', increasing);
console.log('first frame empty:', counts[0] === 0);
console.log('last frame has ink:', counts[counts.length - 1] > 500);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
