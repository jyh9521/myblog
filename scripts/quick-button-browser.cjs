// Real CSS/media/input regression for homepage article-category links.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engines = require('playwright');
const origin = process.env.HERO_ORIGIN || 'http://127.0.0.1:4173';
const output = process.env.HERO_OUTPUT || 'reports/quick-button';
fs.mkdirSync(output, { recursive: true });
// Suppress navigation only while exercising press/release. Actual links are tested below.
function holdNavigation() {
  window.__holdQuickNavigation = true;
  window.addEventListener('click', e => { if (window.__holdQuickNavigation && e.target.closest?.('.home-categories a')) e.preventDefault(); }, true);
}
async function run(engine) {
  const browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const observations = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(holdNavigation);
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.motion === 'ready');
    const destinations = await page.locator('.home-categories a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert.ok(destinations.length > 0, 'article categories exist');
    assert.ok(destinations.every(href => /^\/posts\/\?tag=.+/.test(href)), 'each category opens a real article filter');
    const testedCount = Math.min(3, destinations.length);
    for (let i = 0; i < testedCount; i++) {
      const button = page.locator('.home-categories a').nth(i);
      assert.equal(await button.getAttribute('href'), destinations[i]);
      const state = async label => {
        const result = await button.evaluate(e => {
          const s = getComputedStyle(e), p = getComputedStyle(e, '::before');
          return { shadow: s.boxShadow, radius: s.borderRadius, scale: s.scale, opacity: Number(p.opacity), width: e.offsetWidth, height: e.offsetHeight };
        });
        observations.push({ button: i, label, ...result }); return result;
      };
      await page.mouse.move(1, 1); await button.scrollIntoViewIfNeeded();
      const idle = await state('idle');
      await button.evaluate(e => {
        window.__quickFade = [];
        e.addEventListener('pointerenter', () => {
          const start = performance.now();
          const sample = t => { window.__quickFade.push(Number(getComputedStyle(e, '::before').opacity)); if (t - start < 200) requestAnimationFrame(sample); };
          requestAnimationFrame(sample);
        }, { once: true });
      });
      await button.hover(); await page.waitForTimeout(250);
      const hover = await state('hover');
      await page.locator('.home-categories').screenshot({ path: path.join(output, engine + '-quick-' + i + '.png') });
      assert.equal(hover.shadow, 'none', 'quick-entry hover must not introduce an inset shadow');
      assert.equal(hover.radius, idle.radius);
      assert.ok(hover.opacity > .09 && hover.opacity <= .1);
      const samples = await page.evaluate(() => window.__quickFade);
      observations.push({ button: i, label: 'fade-samples', values: samples });
      assert.ok(samples.some(x => x > 0 && x < .079), 'state layer fades instead of appearing instantly');
      // Element screenshots can scroll the nav in Firefox; reacquire the target.
      await button.hover(); await page.mouse.down(); await page.waitForTimeout(120);
      const pressed = await state('press');
      assert.equal(pressed.radius, idle.radius, 'press retains the capsule shape');
      assert.ok(Number(pressed.scale) < 1 && Number(pressed.scale) > .94);
      await page.mouse.up();
      for (let n = 0; n < 5; n++) { await page.mouse.move(1, 1); await button.hover(); await page.waitForTimeout(25); }
      await page.mouse.move(1, 1); await page.waitForTimeout(800);
      const settled = await state('settled');
      assert.equal(settled.opacity, 0); assert.equal(settled.scale, 'none');
      assert.equal(settled.width, idle.width); assert.equal(settled.height, idle.height);
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await button.hover(); await page.waitForTimeout(250);
      assert.equal((await state('dark')).shadow, 'none');
      await page.mouse.move(1, 1); await page.keyboard.press('Tab'); await button.focus();
      assert.notEqual(await button.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
      await page.emulateMedia({ reducedMotion: 'reduce' }); await button.hover(); await page.mouse.down();
      assert.equal((await state('reduced')).scale, 'none');
      await page.mouse.up(); await page.mouse.move(1, 1);
      await button.evaluate(e => e.blur()); await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    }
    const touch = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    const mobile = await touch.newPage(); await mobile.addInitScript(holdNavigation);
    await mobile.goto(origin, { waitUntil: 'networkidle' });
    for (let i = 0; i < testedCount; i++) {
      const button = mobile.locator('.home-categories a').nth(i); await button.tap();
      await mobile.waitForFunction(index => Number(getComputedStyle(document.querySelectorAll('.home-categories a')[index], '::before').opacity) === 0, i, { timeout: 1500 });
      assert.equal(await button.evaluate(e => getComputedStyle(e).boxShadow), 'none');
    }
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await nojs.newPage(); await fallback.goto(origin);
    for (let i = 0; i < testedCount; i++) {
      const button = fallback.locator('.home-categories a').nth(i); await button.hover();
      assert.equal(await button.evaluate(e => getComputedStyle(e).boxShadow), 'none');
    }
    // Release the test-only input gate and verify the real router destinations.
    for (let i = 0; i < testedCount; i++) {
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.__holdQuickNavigation = false; });
      await page.locator('.home-categories a').nth(i).click();
      const expected = new URL(destinations[i], origin);
      await page.waitForURL(url => url.pathname === expected.pathname && url.searchParams.get('tag') === expected.searchParams.get('tag'));
      assert.equal(await page.locator('.tag-filters button[aria-pressed="true"]').textContent(), expected.searchParams.get('tag'));
      assert.ok(await page.locator('.post-card').count() > 0, 'category yields its articles');
      assert.ok(await page.locator('main').isVisible());
    }
    console.log(engine + ': HOME_CATEGORIES PASS (' + testedCount + ' links)');
  } finally {
    fs.writeFileSync(path.join(output, engine + '-quick.json'), JSON.stringify(observations, null, 2));
    await browser.close();
  }
}
(async () => { for (const engine of (process.env.HERO_ENGINES || 'chromium,firefox,webkit').split(',')) await run(engine); })().catch(e => { console.error(e); process.exitCode = 1; });
