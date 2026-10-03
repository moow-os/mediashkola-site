/* Equal resting offers, transient mouse/keyboard attention, no sticky touch selection. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Usage: check-course-parity.cjs <url> <evidence-dir>');
fs.mkdirSync(out, {recursive:true});
const auditSource = fs.readFileSync(path.join(__dirname, 'style-audit.js'), 'utf8');
const report = {url:base, views:[], errors:[], postAttempts:0};
const paper = 'rgb(253, 253, 253)', ink = 'rgb(37, 37, 37)', accent = 'rgb(225, 63, 138)';
async function colors(page) {
  return page.locator('.course').evaluateAll(cards => cards.map(card => {
    const h = card.querySelector('.course-heading'), age = h.querySelector('.c-age');
    const c = getComputedStyle(card), s = getComputedStyle(h), a = getComputedStyle(age);
    return {body:c.backgroundColor, head:s.backgroundColor, text:s.color,
      rule:s.borderTopColor, age:a.backgroundColor, ageText:a.color};
  }));
}
async function settled(page) { await page.waitForTimeout(240); return colors(page); }
function equalRest(rows) {
  assert.equal(rows.length, 2); assert.deepEqual(rows[0], rows[1]);
  assert.equal(rows[0].head, paper); assert.equal(rows[0].body, paper);
  assert.equal(rows[0].text, ink); assert.equal(rows[0].rule, accent);
}
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BINARY});
  try {
    for (const width of [320,390,768,1440]) for (const reducedMotion of ['no-preference','reduce']) {
      const touch = width < 768;
      const context = await browser.newContext({viewport:{width,height:1000},hasTouch:touch,isMobile:touch,reducedMotion});
      await context.route('**/*', route => {
        if (route.request().method() !== 'GET') { report.postAttempts++; return route.abort(); }
        return new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort();
      });
      const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
      await page.goto(base); await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches),!touch);
      const section = page.locator('#courses'); await section.scrollIntoViewIfNeeded();
      await page.mouse.move(0,0); const resting = await settled(page); equalRest(resting);
      const geometry = await page.locator('.course-heading').evaluateAll(es=>es.map(e=>({w:e.offsetWidth,h:e.offsetHeight})));
      const audit = async () => {
        const a = JSON.parse(await page.evaluate(auditSource));
        assert.deepEqual(a.contrast_fails, []); assert.deepEqual(a.riso_violations, []); assert.deepEqual(a.palette_strays, {});
      };
      await audit();
      if (width===1440 && reducedMotion==='no-preference')
        await section.screenshot({path:path.join(out,`courses-${width}-rest.jpg`),quality:85});
      for (let i=0; i<2; i++) {
        const card = page.locator('.course').nth(i);
        if (touch) {
          await card.locator('h3').tap(); equalRest(await settled(page));
          assert.equal(await page.evaluate(()=>matchMedia('(hover:hover)').matches),false);
        } else {
          await card.hover(); const active = await settled(page);
          assert.equal(active[i].head, accent); assert.equal(active[i].text, paper);
          assert.deepEqual(active[1-i], resting[1-i]); await audit();
          assert.deepEqual(await page.locator('.course-heading').evaluateAll(es=>es.map(e=>({w:e.offsetWidth,h:e.offsetHeight}))),geometry);
          if (width===1440 && reducedMotion==='no-preference')
            await section.screenshot({path:path.join(out,`courses-${width}-hover-${i}.jpg`),quality:85});
          await page.mouse.move(0,0); equalRest(await settled(page));
        }
      }
      // Enter through the keyboard, so :focus-visible reflects real keyboard modality.
      await page.locator('.course').first().locator('a').first().focus();
      await page.keyboard.press('Tab'); await page.mouse.move(0,0);
      let focused = await colors(page); assert.equal(focused[0].head,accent); assert.equal(focused[1].head,paper);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
      await page.keyboard.press('Tab'); focused = await settled(page);
      assert.equal(focused[1].head,accent); assert.equal(focused[0].head,paper); await audit();
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); equalRest(await settled(page));
      assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
      assert.equal(await page.locator('.motion-toggle,.motion-tools').count(),0);
      const times = () => page.locator('.motion-track').evaluateAll(es=>es.map(e=>e.getAnimations()[0].currentTime));
      const before=await times(); await page.waitForTimeout(150); const after=await times();
      assert.equal(after.length,2); after.forEach((t,i)=>assert(t>before[i]));
      report.views.push({width,reducedMotion,touch,status:'PASS',resting,hoverReset:!touch,touchNeutral:touch,keyboard:true});
      // A tall element screenshot can resize the mobile viewport and reset pointer emulation.
      // Capture only after all touch assertions; it must not change the tested environment.
      if (width===390 && reducedMotion==='no-preference')
        await section.screenshot({path:path.join(out,`courses-${width}-rest.jpg`),quality:85});
      await context.close();
    }
    assert.deepEqual(report.errors,[]); assert.equal(report.postAttempts,0); report.status='PASS';
  } finally { await browser.close(); fs.writeFileSync(path.join(out,'course-check.json'),JSON.stringify(report,null,2)+'\n'); }
  console.log(JSON.stringify({status:report.status,views:report.views.length,errors:report.errors}));
})().catch(e=>{console.error(e);process.exitCode=1;});
