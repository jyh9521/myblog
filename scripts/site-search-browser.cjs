// Exercise the exported site; Playwright comes from the development runtime, not the shipped app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engines = require('playwright');
const origin = process.env.SEARCH_ORIGIN || process.env.MOTION_ORIGIN || 'http://127.0.0.1:4173';
const output = path.resolve(process.env.SEARCH_OUTPUT || 'reports/experience-20261128/search-browser');
const reports = [];

async function run(engine) {
  const browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let downloads = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/search-index.json') downloads++; });
    const response = await context.request.get(`${origin}/search-index.json`);
    assert.equal(response.status(), 200);
    const index = await response.json();
    const sample = index.entries.find(entry => entry.kind === 'post');
    assert.ok(sample, 'static export contains a public post');
    const query = sample.title;

    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(downloads, 0, 'ordinary homepage does not download search content');
    const trigger = page.getByRole('link', { name: '站内搜索', exact: true });
    await trigger.focus();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: '站内搜索' });
    await dialog.waitFor();
    const input = dialog.getByRole('searchbox');
    assert.equal(await input.evaluate(element => document.activeElement === element), true, 'opening focuses the search input');
    await input.fill(query);
    const result = dialog.locator(`a[data-search-result][href="${sample.href}"]`);
    await result.waitFor();
    assert.equal(downloads, 1);
    await input.press('ArrowDown');
    assert.equal(await result.evaluate(element => document.activeElement === element), true, 'Down moves to the best match as a real link');
    await page.keyboard.press('ArrowUp');
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate(element => document.activeElement === element), true, 'Escape returns focus');
    assert.equal(new URL(page.url()).pathname, '/');

    await trigger.click();
    await dialog.waitFor();
    await page.goBack();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/', 'Back closes the search before leaving the page');
    assert.equal(downloads, 1, 'reopening reuses the validated download');

    // Retarget the still-closing spring before the old native dialog is removed.
    await trigger.click();
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await trigger.evaluate(element => element.click());
    await dialog.waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.getByRole('dialog').count(), 1, 'rapid reopen retains a single live dialog');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/');

    await trigger.click();
    await dialog.getByRole('searchbox').fill(query);
    await dialog.locator(`a[data-search-result][href="${sample.href}"]`).click();
    await page.waitForURL(`**${sample.href}`);
    await page.locator('.article-header h1').waitFor();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#site-content').evaluate(element => document.activeElement === element || element.contains(document.activeElement)), true, 'late overlay exit does not steal destination content focus');
    await page.goBack();
    await page.waitForURL(`${origin}/`);
    assert.equal(await page.getByRole('dialog').count(), 0, 'navigation retires overlay history instead of resurrecting search');

    await page.goto(`${origin}/search/?q=${encodeURIComponent(query)}&source=browser#results`, { waitUntil: 'networkidle' });
    const fullInput = page.locator('main').getByRole('searchbox');
    assert.equal(await fullInput.inputValue(), query);
    await fullInput.focus();
    await page.keyboard.press('Control+k');
    assert.equal(await page.getByRole('dialog').count(), 0, 'shortcut does not steal a typing input');
    await fullInput.fill('not-present-search-token-xyz');
    await page.getByText('没有找到匹配的结果，试试其他关键词。').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('source'), 'browser');
    assert.equal(new URL(page.url()).hash, '#results');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await fullInput.inputValue(), 'not-present-search-token-xyz');
    await page.screenshot({ path: path.join(output, `${engine}-full-page.png`) });

    const retryContext = await browser.newContext();
    const retryPage = await retryContext.newPage();
    let attempts = 0;
    await retryPage.route('**/search-index.json', async route => {
      if (++attempts === 1) await route.fulfill({ status: 503, body: 'Unavailable' });
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(index) });
    });
    await retryPage.goto(`${origin}/search/?q=${encodeURIComponent(query)}`);
    await retryPage.locator('main').getByRole('alert').waitFor();
    await retryPage.getByRole('button', { name: '重新加载' }).click();
    await retryPage.locator(`a[data-search-result][href="${sample.href}"]`).waitFor();
    assert.equal(attempts, 2);
    await retryContext.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage();
    await mobile.goto(origin, { waitUntil: 'networkidle' });
    await mobile.getByRole('link', { name: '站内搜索', exact: true }).click();
    const mobileDialog = mobile.getByRole('dialog', { name: '站内搜索' });
    await mobileDialog.getByRole('searchbox').fill(query);
    await mobileDialog.locator('a[data-search-result]').first().waitFor();
    const bounds = await mobileDialog.boundingBox();
    assert.ok(Math.abs(bounds.width - 390) < 2 && Math.abs(bounds.height - 844) < 2, 'mobile search fills the viewport');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.screenshot({ path: path.join(output, `${engine}-mobile.png`) });
    await mobile.getByRole('button', { name: '关闭站内搜索' }).click();
    await mobileDialog.waitFor({ state: 'detached' });
    assert.notEqual(await mobile.evaluate(() => document.body.style.overflow), 'hidden');

    const noJsContext = await browser.newContext({ javaScriptEnabled: false });
    const noJsPage = await noJsContext.newPage();
    await noJsPage.goto(origin);
    await noJsPage.getByRole('link', { name: '站内搜索', exact: true }).click();
    await noJsPage.waitForURL('**/search/');
    assert.ok(await noJsPage.locator(`.site-search-nojs a[href="${sample.href}"]`).isVisible());
    assert.deepEqual(errors, []);
    reports.push({ engine, result: 'PASS', indexEntries: index.entries.length, checks: ['lazy index', 'keyboard/focus', 'Escape and Back', 'rapid reopen', 'overlay result navigation/focus', 'typing exclusion', 'URL reload', 'retry', 'mobile reduced motion fullscreen', 'no-JS directory'], errors });
    console.log(`${engine}: SEARCH PASS`);
  } finally { await browser.close(); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  for (const engine of (process.env.SEARCH_ENGINES || 'chromium,firefox,webkit').split(',')) {
    try { await run(engine); } catch (error) { reports.push({ engine, result: 'FAIL', error: error.stack }); console.error(engine, error); process.exitCode = 1; }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(reports, null, 2));
})();
