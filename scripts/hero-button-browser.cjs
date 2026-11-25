// Focused real-browser regression for CTA hover, press, reversal and accessibility.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engines = require('playwright');
const origin = process.env.HERO_ORIGIN || 'http://127.0.0.1:4173';
const output = process.env.HERO_OUTPUT || 'reports/hero-button';
fs.mkdirSync(output, { recursive: true });
async function run(engine) {
  const browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const observations = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.motion === 'ready');
    const button = page.locator('.m3-home .hero-button');
    await button.scrollIntoViewIfNeeded();
    const state = async label => {
      const value = await button.evaluate(e => {
        const s = getComputedStyle(e), layer = getComputedStyle(e, '::before');
        return { shadow: s.boxShadow, radius: s.borderRadius, transform: s.transform, scale: s.scale, opacity: Number(layer.opacity), transition: layer.transitionProperty, width: e.offsetWidth, height: e.offsetHeight };
      });
      observations.push({ label, ...value }); return value;
    };
    const idle = await state('idle');
    await button.evaluate(e => {
      window.__heroFade = [];
      e.addEventListener('pointerenter', () => {
        const start = performance.now();
        const sample = time => { window.__heroFade.push(Number(getComputedStyle(e, '::before').opacity)); if (time - start < 200) requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
      }, { once: true });
    });
    await button.hover(); await page.waitForTimeout(250);
    const hover = await state('hover');
    const box = await button.boundingBox();
    await page.screenshot({ path: path.join(output, engine + '-hover.png'), clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: box.width + 48, height: box.height + 48 } });
    assert.equal(hover.shadow, 'none', 'hover must not resurrect the solid red 3D base');
    assert.equal(hover.transform, 'none');
    assert.equal(hover.radius, idle.radius);
    assert.ok(hover.opacity > 0 && hover.opacity <= .1, 'hover uses a restrained state layer');
    assert.match(hover.transition, /opacity/);
    const fade = await page.evaluate(() => window.__heroFade);
    observations.push({ label: 'fade-samples', values: fade });
    assert.ok(fade.some(value => value > 0 && value < .079), 'hover fades through intermediate opacity values');
    await page.mouse.down(); await page.waitForTimeout(120);
    const pressed = await state('pressed');
    assert.equal(pressed.radius, idle.radius, 'press preserves the capsule silhouette');
    assert.ok(Number(pressed.scale) < 1 && Number(pressed.scale) > .94);
    await page.mouse.up(); await page.mouse.move(1, 1);
    // Rapid reversals must converge instead of accumulating visual state.
    for (let i = 0; i < 6; i++) { await button.hover(); await page.waitForTimeout(25); await page.mouse.move(1, 1); }
    await page.waitForTimeout(800);
    const settled = await state('settled');
    assert.equal(settled.opacity, 0); assert.equal(settled.scale, 'none');
    assert.equal(settled.width, idle.width); assert.equal(settled.height, idle.height);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await button.hover(); await page.waitForTimeout(250);
    assert.equal((await state('dark-hover')).shadow, 'none');
    await page.mouse.move(1, 1); await page.keyboard.press('Tab'); await button.focus();
    assert.notEqual(await button.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await button.hover(); await page.mouse.down();
    const reduced = await state('reduced'); assert.equal(reduced.scale, 'none'); assert.equal(reduced.shadow, 'none');
    await page.mouse.up(); await page.mouse.move(1, 1);
    const touch = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    const mobile = await touch.newPage(); await mobile.goto(origin, { waitUntil: 'networkidle' });
    const mobileButton = mobile.locator('.m3-home .hero-button'); await mobileButton.tap();
    await mobile.waitForFunction(() => Number(getComputedStyle(document.querySelector('.m3-home .hero-button'), '::before').opacity) === 0, {}, { timeout: 1500 });
    assert.equal(await mobileButton.evaluate(e => getComputedStyle(e).boxShadow), 'none');
    assert.equal(await mobileButton.evaluate(e => Number(getComputedStyle(e, '::before').opacity)), 0, 'touch does not latch desktop hover');
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await nojs.newPage(); await fallback.goto(origin);
    const fallbackButton = fallback.locator('.m3-home .hero-button'); await fallbackButton.hover();
    assert.equal(await fallbackButton.evaluate(e => getComputedStyle(e).boxShadow), 'none', 'flat fallback before hydration');
    console.log(engine + ': HERO_BUTTON PASS');
  } finally {
    fs.writeFileSync(path.join(output, engine + '.json'), JSON.stringify(observations, null, 2));
    await browser.close();
  }
}
(async () => { for (const engine of (process.env.HERO_ENGINES || 'chromium,firefox,webkit').split(',')) await run(engine); })().catch(e => { console.error(e); process.exitCode = 1; });
