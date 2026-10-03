/* Sample the unmodified, real-time opening; never seek its animation clock. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Usage: check-hero-motion.cjs <url> <evidence-dir>');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BINARY });
  const result = { views: [], errors: [], postAttempts: 0 };
  try {
    for (const preference of ['no-preference', 'reduce']) for (const width of [320, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: preference });
      await context.route('**/*', route => {
        if (route.request().method() !== 'GET') { result.postAttempts++; return route.abort(); }
        return new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort();
      });
      await context.addInitScript(() => {
        window.heroSamples = [];
        let start, last = -100;
        function sample(now) {
          const h = document.querySelector('.hero h1.play');
          if (h) {
            if (start === undefined) start = now;
            const t = now - start;
            if (t - last >= 40) {
              const strike = h.querySelector('.strike'), type = h.querySelector('.type'), caret = h.querySelector('.caret');
              const range = document.createRange(); range.selectNodeContents(type);
              const c = getComputedStyle(caret);
              window.heroSamples.push({ t, strike: parseFloat(getComputedStyle(strike, '::after').width) / strike.getBoundingClientRect().width,
                type: type.getBoundingClientRect().width / range.getBoundingClientRect().width,
                caret: c.display === 'none' ? 0 : +c.opacity });
              last = t;
            }
            if (t >= 4300) { window.heroComplete = true; return; }
          }
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      const page = await context.newPage();
      page.on('pageerror', e => result.errors.push(e.message));
      await page.goto(base);
      await page.waitForFunction(() => window.heroComplete);
      const samples = await page.evaluate(() => window.heroSamples);
      const during = (from, to, test) => samples.some(s => s.t >= from && s.t <= to && test(s));
      assert(during(0, 300, s => s.strike < 0.02 && s.type < 0.02), 'Opening starts unstruck, with the second line hidden');
      assert(during(520, 820, s => s.strike > 0.05 && s.strike < 1), 'Original strike grows naturally');
      assert(during(1100, 1700, s => s.strike >= 1 && s.type > 0.05 && s.type < 0.98), 'Typing follows the completed strike');
      assert(during(2000, 2500, s => s.type >= 0.99), 'Whole author line and final dot appear');
      assert(during(4050, 4300, s => s.caret === 0), 'Cursor disappears after three blinks');
      if (width < 768) assert(samples.every(s => s.caret === 0), 'Mobile keeps the original hidden cursor');
      assert.equal(await page.locator('.motion-toggle,.motion-tools').count(), 0);
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
      await page.screenshot({ path: path.join(out, `hero-${preference}-${width}.jpg`), quality: 75 });
      result.views.push({ width, preference, status: 'PASS', clockManipulation: false, samples });
      await context.close();
    }
    assert.equal(result.postAttempts, 0); assert.deepEqual(result.errors, []); result.status = 'PASS';
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, 'hero-check.json'), JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify({ status: result.status, views: result.views.length, errors: result.errors }));
})().catch(e => { console.error(e); process.exitCode = 1; });
