/* Render the actual two pages; verify color hierarchy, copy preservation and controls. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const [base,out] = process.argv.slice(2);
if(!base || !out) throw Error('Usage: check-color-system.cjs <url> <evidence-dir>');
fs.mkdirSync(out,{recursive:true});
const auditSource=fs.readFileSync(path.join(__dirname,'style-audit.js'),'utf8');
const result={views:[],pageErrors:[],postAttempts:0,findings:[]};
function normalizedCopy(html) {
 return html.replace(/<\/?span\b[^>]*>/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
for(const file of ['index.html','kurs.html']) {
 const old=execFileSync('git',['show','9d932cf:'+file],{encoding:'utf8'});
 const current=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 assert.equal(normalizedCopy(current),normalizedCopy(old),'Visible source copy must be preserved');
 const links=s=>[...s.matchAll(/\bhref="([^"]+)"/g)].map(m=>m[1]).filter(h=>!h.includes('.css'));
 assert.deepEqual(links(current),links(old),'Navigation, programs and CTA targets must be preserved');
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BINARY});
 try {
  for(const width of [320,390,768,1440]) for(const file of ['index.html','kurs.html']) {
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
   await context.route('**/*',route=>{
    if(route.request().method()!=='GET'){result.postAttempts++;return route.abort();}
    return new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort();
   });
   const page=await context.newPage();page.on('pageerror',e=>result.pageErrors.push(e.message));
   await page.goto(new URL(file,base).href);await page.evaluate(()=>document.fonts.ready);
   assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'No document overflow');
   const inspect=async state=>{
    const a=JSON.parse(await page.evaluate(auditSource));
    for(const key of ['contrast_fails','riso_violations','palette_strays']) if(Object.keys(a[key]).length)result.findings.push({file,width,state,key,details:a[key]});
    return a;
   };
   const audit=await inspect('default');
   // Transparent text must be composited, not treated as opaque by the audit.
   await page.evaluate(()=>{const e=document.createElement('div');e.id='contrast-fixture';e.textContent='Contrast fixture';e.style.cssText='color:rgba(37,37,37,.55);background:#FBE6EF;font-size:11px';document.body.append(e);});
   const fixture=JSON.parse(await page.evaluate(auditSource));
   assert(fixture.contrast_fails.some(x=>x.el==='div#contrast-fixture'),'Audit must catch translucent small text');
   await page.locator('#contrast-fixture').evaluate(e=>e.remove());
   const team=page.locator('.team');
   if(width<768) {
    const geometry=await team.evaluate(e=>({wrap:getComputedStyle(e).flexWrap,scroll:e.scrollWidth,client:e.clientWidth,card:e.firstElementChild.getBoundingClientRect().width}));
    assert.equal(geometry.wrap,'nowrap');assert(geometry.scroll>geometry.client);assert(geometry.card>geometry.client/2);
    await team.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.team').scrollLeft>0);
    await team.evaluate(e=>{e.scrollLeft=e.scrollWidth;});
    await page.waitForTimeout(250);
    const lastVisible=await team.evaluate(e=>e.lastElementChild.getBoundingClientRect().right<=e.getBoundingClientRect().right+1);
    assert(lastVisible,'Last teacher remains reachable');await team.evaluate(e=>{e.scrollLeft=0;});
   }
   if(file==='kurs.html') {
    const pill=page.locator('#kurs .live-pill');await pill.focus();await page.keyboard.press('Shift');
    assert.equal(await pill.evaluate(e=>getComputedStyle(e).outlineColor),'rgb(253, 253, 253)','Focus ring must contrast with berry hero');
   } else {
    await page.locator('.trust a.val').hover();await inspect('rating hover');
   }
   for(const el of await page.locator('#price .price .tape-cta').all()) {
    const fits=await el.evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),box=e.getBoundingClientRect();return text.left>=box.left && text.right<=box.right && text.top>=box.top && text.bottom<=box.bottom;});
    assert(fits,'Course price CTA text must fit its painted button, excluding decorative tape ends');
   }
   if(file==='index.html') {
    const colors=await page.locator('.course-heading').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundColor));
    assert.equal(new Set(colors).size,2,'Course headings need distinct visual hierarchy');
    assert.equal(await page.locator('.gallery-grid .portrait').count(),18);
    for(const el of await page.locator('.c-actions a[href="#lead-form"]').all()) {
     const c=await el.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color}));
     assert.notEqual(c.bg,'rgba(0, 0, 0, 0)','Primary action must be visible without hover');
     await el.hover();
     await inspect('primary hover');
    }
   }
   const details=page.locator('.faq details').first(), summary=details.locator('summary');
   const initiallyOpen=await details.evaluate(e=>e.open);
   if(!initiallyOpen)await summary.click();
   await inspect('open FAQ');await summary.click();await inspect('closed FAQ hover');
   if(initiallyOpen)await summary.click();
   const footLink=page.locator('footer a').first();await footLink.focus();
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
   if(width===390 || width===1440) {
    const keys=file==='index.html'?['#hero','#courses','#prices','#trust','#team','#gallery','#faq','#lead-form','footer']:['#kurs','#komu','#result','#team','#price','#faq','footer'];
    for(const key of keys) {
     const el=page.locator(key);await el.scrollIntoViewIfNeeded();
     await el.locator('img[src]').evaluateAll(imgs=>Promise.all(imgs.map(i=>{i.loading='eager';return i.decode().catch(()=>{});})));
     await el.screenshot({path:path.join(out,`${file.replace('.html','')}-${width}-${key.replace('#','')}.jpg`),quality:76});
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(out,`${file.replace('.html','')}-${width}-full.jpg`),fullPage:true,quality:68});
   }
   result.views.push({file,width,status:'PASS',audit});await context.close();
  }
  assert.equal(result.postAttempts,0);assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.findings,[]);result.status='PASS';
 } finally {await browser.close();fs.writeFileSync(path.join(out,'color-check.json'),JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify({status:result.status,views:result.views.length,errors:result.pageErrors}));
})().catch(e=>{console.error(e);process.exitCode=1;});
