/* Verify Katya's selected website without sending real leads. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Usage: check-selected-site.cjs <base-url/> <evidence-dir>');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BINARY });
  const result = { source: 'Katya Telegram message25', views: [], postAttempts: [], errors: [] };
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      await context.route('**/*', route => {
        const request = route.request();
        if (request.method() !== 'GET') { result.postAttempts.push(request.method()); return route.abort(); }
        if (new URL(request.url()).origin !== new URL(base).origin) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => result.errors.push(error.message));
      const response = await page.goto(base);
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const t = document.querySelector('.hero .type'), c = getComputedStyle(document.querySelector('.caret'));
        const range = document.createRange(); range.selectNodeContents(t);
        return t.getBoundingClientRect().width >= range.getBoundingClientRect().width - 1 && (c.display === 'none' || c.opacity === '0');
      });
      assert.equal(await page.locator('body.option-b').count(), 1);
      assert.equal(await page.locator('.portrait-number').count(), 0);
      assert.equal(await page.locator('.hero-portraits .portrait').count(), 4);
      assert.equal(await page.locator('.gallery-grid .portrait').count(), 18);
      assert.deepEqual(await page.locator('.months button').evaluateAll(n => n.map(x => x.dataset.m)), ['10','11','12']);
      assert(!/СЕЗОН СТАРТУЕТ 6 СЕНТЯБРЯ/i.test(await page.locator('body').innerText()));
      assert.equal(await page.locator('.guest-preview-bar').count(), 0);
      assert.equal(await page.locator('meta[name="robots"][content*="noindex"]').count(), 0);
      assert.equal(await page.locator('#lead button[type="submit"]').count(), 1);
      const hero = await page.locator('#hero').boundingBox();
      await page.screenshot({ path: path.join(out, `b-${width}-hero.jpg`), fullPage: false });
      const photos = page.locator('.gallery-grid .portrait');
      for (const photo of await photos.all()) {
        await photo.scrollIntoViewIfNeeded();
        await photo.locator('img').evaluate(img => img.decode());
      }
      const sources = await photos.locator('img').evaluateAll(n => n.map(i => i.getAttribute('src')));
      assert.equal(new Set(sources).size, 18);
      await photos.first().click();
      assert.equal(await page.locator('#photo-count').innerText(), '01 / 18');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#photo-count').innerText(), '18 / 18');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      assert(await photos.first().evaluate(el => document.activeElement === el));
      await page.locator('#gallery').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `b-${width}-gallery.jpg`) });
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
      for (const name of ['programma-media.pdf','programma-orator.pdf']) {
        const r = await page.request.get(new URL('assets/docs/'+name,base).href);
        assert.equal(r.status(),200); assert((await r.body()).subarray(0,5).equals(Buffer.from('%PDF-')));
      }
      await page.goto(new URL('kurs.html',base).href);
      await page.locator('header.top a.wordmark').click();
      assert.equal(new URL(page.url()).pathname, new URL('index.html',base).pathname);
      assert.equal(await page.locator('body.option-b').count(),1);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert(await page.locator('.hero .type').isVisible());
      result.views.push({ width, status: 'PASS', photos:18, photoBadges:0, nativeForm:true, courseReturn:true, naturalIntro:true, reducedMotion:true });
      await context.close();
    }
    assert.deepEqual(result.postAttempts,[]); assert.deepEqual(result.errors,[]);
    result.status='PASS';
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out,'selected-check.json'),JSON.stringify(result,null,2)+'\n');
  }
  console.log(JSON.stringify({status:result.status,views:result.views.length,postAttempts:result.postAttempts.length,errors:result.errors.length}));
})().catch(error => { console.error(error); process.exitCode=1; });
