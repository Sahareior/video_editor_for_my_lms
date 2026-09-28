/* The draw bar must never overlap the canvas — that was the whole point. */
import { launch } from './browser.mjs';
const b = await launch();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let bad=0; const t=(n,c,x)=>{ if(!c) bad++; console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗\x1b[0m ')+n+(x?'  '+x:'')); };
await p.goto('http://localhost:4173/',{waitUntil:'networkidle'});
await p.waitForTimeout(1800);

t('draw bar is hidden until draw mode is on', (await p.locator('.inkBar').count())===0);
await p.getByRole('button',{name:/Draw mode/}).first().click();
await p.waitForTimeout(500);
t('draw bar appears with draw mode', (await p.locator('.inkBar').count())===1);

/* geometric overlap is the real assertion */
const geo = await p.evaluate(() => {
  const cv = document.querySelector('canvas.stage').getBoundingClientRect();
  const bar = document.querySelector('.inkBar').getBoundingClientRect();
  const overlapX = Math.max(0, Math.min(cv.right,bar.right) - Math.max(cv.left,bar.left));
  const overlapY = Math.max(0, Math.min(cv.bottom,bar.bottom) - Math.max(cv.top,bar.top));
  return { overlap: overlapX>0 && overlapY>0, overlapX: Math.round(overlapX), overlapY: Math.round(overlapY),
           barTop: Math.round(bar.top), canvasBottom: Math.round(cv.bottom) };
});
t('the bar does NOT overlap the canvas', geo.overlap===false, JSON.stringify(geo));
t('the bar sits below the canvas', geo.barTop >= geo.canvasBottom - 1, `bar.top=${geo.barTop} canvas.bottom=${geo.canvasBottom}`);

const pos = await p.evaluate(()=>getComputedStyle(document.querySelector('.inkBar')).position);
t('the bar is no longer absolutely positioned over the stage', pos==='static', pos);

await p.screenshot({ path:'/workspace/gs/shots/toolbar-docked.png' });

/* still usable, and still fully on-screen at every ratio */
for (const label of ['9:16','1:1','4:5','16:9']) {
  await p.locator('.aspBtn',{hasText:label}).first().click();
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const bar=document.querySelector('.inkBar').getBoundingClientRect();
    return { fits: bar.bottom <= window.innerHeight+1 && bar.left >= -1 && bar.right <= window.innerWidth+1,
             off: Math.round(Math.max(0, bar.bottom - window.innerHeight)) };
  });
  t('bar fits on screen at ' + label, r.fits, r.off ? r.off+'px below the fold' : 'fully visible');
  await p.screenshot({ path:'/workspace/gs/shots/bar-'+label.replace(':','x')+'.png' });
}

/* the tools still work from the new position */
await p.locator('.aspBtn',{hasText:'16:9'}).first().click();
await p.waitForTimeout(500);
await p.getByTitle('Rectangle').click();
await p.waitForTimeout(200);
const bb = await p.locator('canvas.stage').boundingBox();
await p.mouse.move(bb.x+bb.width*0.25, bb.y+bb.height*0.25); await p.mouse.down();
for(let i=1;i<=10;i++) await p.mouse.move(bb.x+bb.width*(0.25+0.4*i/10), bb.y+bb.height*(0.25+0.4*i/10));
await p.mouse.up();
await p.waitForTimeout(900);
t('drawing still works from the docked bar', (await p.locator('.inkLyr').count())===1, 'rows='+await p.locator('.inkLyr').count());

console.log('\npage errors:', errs.length?errs:'none');
if(errs.length) bad++;
console.log(bad?'\n\x1b[31m'+bad+' failed\x1b[0m':'\n\x1b[32mtoolbar placement verified\x1b[0m');
await b.close(); process.exit(bad?1:0);
