/* Exercise actual running timelines; seam seeking is a separate structural check. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const [base, out, mode] = process.argv.slice(2);
if (!base || !out) throw Error('Usage: check-motion-loops.cjs <url> <out> [cycles]');
fs.mkdirSync(out, {recursive:true});
const result = {url:base,views:[],errors:[],postAttempts:0};
async function snapshot(page) {
 return page.evaluate(() => [...document.querySelectorAll('.motion-loop')].map(root => {
  const track=root.querySelector('.motion-track'), groups=[...track.children], a=track.getAnimations()[0];
  return {key:root.dataset.loop,playing:root.dataset.playing,state:a.playState,time:a.currentTime,duration:a.effect.getTiming().duration,iteration:a.effect.getComputedTiming().currentIteration,x:new DOMMatrixReadOnly(getComputedStyle(track).transform).m41,width:groups[0].getBoundingClientRect().width,copyWidth:groups[1].getBoundingClientRect().width,count:groups[0].children.length,copyHidden:groups[1].getAttribute('aria-hidden'),gap:groups[1].getBoundingClientRect().left-groups[0].getBoundingClientRect().right};
 }));
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BINARY});
 try {
  for (const preference of ['no-preference','reduce']) for (const width of [320,390,1280]) {
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'});
   await context.route('**/*',route=>{
    if(route.request().method()!=='GET'){result.postAttempts++;return route.abort();}
    return new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort();
   });
   const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
   await page.goto(base);await page.evaluate(()=>document.fonts.ready);
   await page.locator('.photo-track img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
   let a=await snapshot(page);await page.waitForTimeout(1100);let b=await snapshot(page);
   assert.deepEqual(b.map(x=>x.count),[18,9]);
   for(let i=0;i<2;i++){
    const speed=i===0?30:27,dx=a[i].x-b[i].x;
    assert(Math.abs(dx/((b[i].time-a[i].time)/1000)-speed)<0.2);
    assert.equal(b[i].state,'running');assert.equal(b[i].copyHidden,'true');
    assert(Math.abs(b[i].width-b[i].copyWidth)<0.1);assert(Math.abs(b[i].gap)<0.1);
   }
   assert.equal(await page.locator('.portrait-number').count(),0);
   assert.equal(await page.locator('.gallery-grid .portrait').count(),18);
   assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
   assert.equal(await page.locator('.motion-toggle,.motion-tools').count(),0,'No start/pause controls');
   for(const key of ['photos','reviews']) {
    const root=page.locator('[data-loop="'+key+'"]');await root.hover();
    a=await snapshot(page);await page.waitForTimeout(350);b=await snapshot(page);
    const i=key==='photos'?0:1;assert(b[i].time>a[i].time+200,'Hover must not stop autoplay');
   }
   // Seek only for this structural clone-click fixture; natural cycles use a fresh context.
   await page.locator('.hero-portraits').scrollIntoViewIfNeeded();
   await page.locator('.photo-track').evaluate(track=>{
    const a=track.getAnimations()[0];a.pause();a.currentTime=a.effect.getTiming().duration-500;
   });
   const copy=page.locator('.photo-track .motion-group[aria-hidden="true"] [data-photo]').first();
   await copy.click({force:true});
   await page.locator('#photo-dialog').waitFor({state:'visible'});
   await page.locator('.photo-close').click();
   await page.waitForFunction(()=>document.activeElement===document.querySelector('.hero-portraits figcaption a[href="#gallery"]'));
   assert.equal(await page.evaluate(()=>!!document.activeElement.closest('[aria-hidden="true"]')),false);
   await page.locator('.photo-track').evaluate(track=>track.getAnimations()[0].play());
   const gridPhoto=page.locator('.gallery-grid .portrait').last();
   await gridPhoto.click();await page.locator('#photo-dialog').waitFor({state:'visible'});
   await page.locator('.photo-close').click();
   await page.waitForFunction(()=>document.activeElement===document.querySelector('.gallery-grid .portrait:last-child'));
   await page.locator('.hero-portraits').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,'photos-'+preference+'-'+width+'.jpg')});
   await page.locator('.rev-marquee').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,'reviews-'+preference+'-'+width+'.jpg')});
   await page.setViewportSize({width:width+25,height:900});await page.waitForTimeout(100);
   b=await snapshot(page);for(const x of b)assert(Math.abs(x.width-x.copyWidth)<0.1);
   await page.evaluate(()=>{sessionStorage.setItem('msh-motion-photos','pause');sessionStorage.setItem('msh-motion-reviews','pause');});
   await page.reload();a=await snapshot(page);await page.waitForTimeout(300);b=await snapshot(page);
   b.forEach((x,i)=>{assert.equal(x.state,'running');assert(x.time>a[i].time+100);});
   await page.emulateMedia({reducedMotion:preference==='reduce'?'no-preference':'reduce'});
   a=await snapshot(page);await page.waitForTimeout(300);b=await snapshot(page);
   b.forEach((x,i)=>{assert.equal(x.state,'running');assert(x.time>a[i].time+100);});
   result.views.push({width,preference,status:'PASS',noControls:true,oldPauseIgnored:true,mediaChangeKeepsRunning:true,loops:b});await context.close();
  }
  if(mode==='cycles') {
   const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});
   const page=await context.newPage();await page.goto(base);await page.evaluate(()=>document.fonts.ready);
   await page.locator('.photo-track img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
   await page.locator('.rev-marquee').scrollIntoViewIfNeeded();
   const duration=Math.max(...(await snapshot(page)).map(x=>x.duration))*2+1500;
   console.log('Natural cycles started; expected seconds',Math.ceil(duration/1000));
   const cycles=await page.evaluate(async duration=>{
    const roots=[...document.querySelectorAll('.motion-loop')];
    const rows=roots.map(root=>({key:root.dataset.loop,wraps:0,maxStep:0,maxGap:0,samples:0,seen:[]}));
    const previous=[];const started=performance.now();
    return await new Promise(resolve=>{
     const timer=setInterval(()=>{
      roots.forEach((root,i)=>{
       const track=root.querySelector('.motion-track'),a=track.getAnimations()[0],g=track.firstElementChild,w=g.getBoundingClientRect().width;
       const timing=a.effect.getComputedTiming(),x=new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
       const now=performance.now(),p=previous[i];
       if(p){if(timing.currentIteration>p.lap)rows[i].wraps++;const step=(p.x-x+w)%w;rows[i].maxStep=Math.max(rows[i].maxStep,step);}
       const v=root.getBoundingClientRect();
       track.querySelectorAll('[data-photo]').forEach(el=>{const r=el.getBoundingClientRect();if(r.right>v.left&&r.left<v.right&&!rows[i].seen.includes(el.dataset.photo))rows[i].seen.push(el.dataset.photo);});
       rows[i].maxGap=Math.max(rows[i].maxGap,Math.abs(track.lastElementChild.getBoundingClientRect().left-g.getBoundingClientRect().right));
       rows[i].samples++;previous[i]={x,lap:timing.currentIteration,now};
      });
      if(performance.now()-started>=duration){clearInterval(timer);resolve(rows);}
     },50);
    });
   },duration);
   for(const row of cycles){assert(row.wraps>=2);assert(row.maxGap<0.1);assert(row.maxStep<15,'No visible jump at wrapping boundary');}
   assert.equal(cycles[0].seen.length,18);
   result.naturalCycles={durationSeconds:duration/1000,rows:cycles,clockManipulation:false};
   await context.close();
  }
  assert.equal(result.postAttempts,0);assert.deepEqual(result.errors,[]);result.status='PASS';
 } finally {await browser.close();fs.writeFileSync(path.join(out,'motion-check.json'),JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify({status:result.status,views:result.views.length,naturalCycles:result.naturalCycles||null}));
})().catch(e=>{console.error(e);process.exitCode=1;});
