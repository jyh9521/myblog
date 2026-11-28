// Opt-in reading tools against the built static site, without touching article content.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), engines = require('playwright');
const origin = process.env.MOTION_ORIGIN || 'http://127.0.0.1:4173';
const output = path.resolve(process.env.READING_OUTPUT || 'reports/experience-20261128/reading-browser');
const article = '/posts/magna-carta-2-cn/';
fs.mkdirSync(output, { recursive: true });
async function ready(page) { await page.waitForFunction(() => Number.isFinite(parseFloat(document.querySelector('.article-content:not(.article-content-compact) .body')?.style.fontSize || ''))); }
async function closeDialog(page, name) { await page.keyboard.press('Escape'); await page.getByRole('dialog', { name, exact: true }).waitFor({ state: 'detached' }); }
async function settleScroll(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    let previous = scrollY, stable = 0;
    const timeout = setTimeout(() => reject(Error('scroll did not settle')), 5000);
    const frame = () => { stable = Math.abs(scrollY - previous) < .5 ? stable + 1 : 0; previous = scrollY; if (stable >= 6) { clearTimeout(timeout); resolve(); } else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }));
}
async function scrollBody(page, fraction = .15) {
  await page.evaluate(fraction => { const body = document.querySelector('.article-content .body'); const rect = body.getBoundingClientRect(); scrollTo({ top: rect.top + scrollY + rect.height * fraction, behavior: 'instant' }); }, fraction);
  await page.locator('[aria-label="阅读工具"]').waitFor({ state: 'visible' });
}
(async () => {
  const results = [];
  for (const engine of (process.env.MOTION_ENGINES || 'chromium,firefox,webkit').split(',')) {
    const browser = await engines[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    let failedPage;
    try {
      for (const reduced of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }), reducedMotion: reduced ? 'reduce' : 'no-preference' });
        const page = await context.newPage(), errors = []; failedPage = page;
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(origin + article); await ready(page);
        await page.getByRole('button', { name: '打开阅读偏好', exact: true }).click();
        const settings = page.getByRole('dialog', { name: '阅读偏好', exact: true });
        await settings.waitFor({ state: 'visible' });
        assert.equal(await settings.locator('select').count(), 0);
        assert.equal(await settings.locator('input[type="radio"]').count(), 6);
        await settings.locator('input[name="reading-font-size"][value="2"]').check();
        await settings.locator('input[name="reading-line-spacing"][value="2"]').check();
        assert.equal(await settings.getByRole('checkbox').isChecked(), false);
        await page.screenshot({ path: path.join(output, `${engine}-${reduced ? 'reduced' : 'motion'}-preferences.png`) });
        await closeDialog(page, '阅读偏好');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '打开阅读偏好');
        await page.reload(); await ready(page);
        assert.deepEqual(await page.locator('.article-content .body').evaluate(el => ({ size: el.style.fontSize, spacing: el.style.lineHeight })), { size: '21px', spacing: '2.2' });
        assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('blog:reading-position:')).length), 0, 'reading positions are not recorded before opt-in');

        await scrollBody(page);
        const tocButton = page.locator('[aria-label="阅读工具"]').getByRole('button', { name: '目录', exact: true });
        await tocButton.click();
        const toc = page.getByRole('dialog', { name: '文章目录', exact: true }); await toc.waitFor({ state: 'visible' });
        await page.waitForTimeout(reduced ? 50 : 700);
        const box = await toc.boundingBox(); assert.ok(Math.abs(box.y + box.height - 844) < 3, 'mobile TOC is a bottom sheet');
        const links = toc.getByRole('link'), destination = links.nth(Math.min(2, await links.count() - 1)), href = await destination.getAttribute('href');
        await page.screenshot({ path: path.join(output, `${engine}-${reduced ? 'reduced' : 'motion'}-toc.png`) });
        await destination.click();
        await toc.waitFor({ state: 'detached' }); await page.waitForURL(url => url.hash === href);
        await page.waitForFunction(id => document.activeElement?.id === id, decodeURIComponent(href.slice(1)));
        await settleScroll(page);
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        await tocButton.click(); await toc.waitFor({ state: 'visible' }); const tocUrl = page.url();
        await page.goBack(); await toc.waitFor({ state: 'detached' }); assert.equal(page.url(), tocUrl, 'Back closes TOC before navigating');

        await page.goto(origin + article); await ready(page);
        await page.getByRole('button', { name: '打开阅读偏好', exact: true }).click();
        await settings.getByRole('checkbox').check(); await closeDialog(page, '阅读偏好');
        await scrollBody(page, .4); await page.waitForTimeout(1100);
        const record = await page.evaluate(article => JSON.parse(localStorage.getItem(`blog:reading-position:v1:${encodeURIComponent(article)}`) || 'null'), article);
        assert.ok(record?.scrollY > 200); assert.equal(record.path, article); assert.equal(record.body, undefined); assert.equal(record.title, undefined);
        await page.goto(origin + '/posts/'); await page.goto(origin + article); await ready(page);
        const prompt = page.getByRole('complementary', { name: '继续阅读提示' }); await prompt.waitFor({ state: 'visible' });
        assert.ok(await page.evaluate(() => scrollY) <= 80, 'resume never jumps automatically');
        await page.screenshot({ path: path.join(output, `${engine}-${reduced ? 'reduced' : 'motion'}-resume.png`) });
        await prompt.getByRole('button', { name: '继续上次阅读' }).click();
        await page.waitForFunction(() => scrollY > 200); await settleScroll(page);
        const resumedY = await page.evaluate(() => scrollY);
        await page.goto(origin + '/posts/'); await page.goBack(); await ready(page); await page.waitForTimeout(800);
        assert.equal(await prompt.count(), 0, 'native Back restoration suppresses resume');
        const restoredY = await page.evaluate(() => scrollY);
        if (Math.abs(restoredY - resumedY) >= 12) {
          const diagnostics = await page.evaluate(() => ({ scrollY, navigation: performance.getEntriesByType('navigation')[0]?.type, body: document.querySelector('.article-content .body')?.getBoundingClientRect().toJSON(), fontSize: document.querySelector('.article-content .body')?.style.fontSize, restoration: history.scrollRestoration, hash: location.hash }));
          fs.writeFileSync(path.join(output, `${engine}-history-failure.json`), JSON.stringify({ resumedY, restoredY, record, diagnostics }, null, 2));
          await page.screenshot({ path: path.join(output, `${engine}-history-failure.png`) });
        }
        assert.ok(Math.abs(restoredY - resumedY) < 12, `native Back restores the prior viewport: before=${resumedY}, after=${restoredY}`);
        await page.goto(origin + article + (record.heading ? `#${encodeURIComponent(record.heading)}` : href)); await ready(page); await page.waitForTimeout(500);
        assert.equal(await prompt.count(), 0, 'URL fragment takes priority over the saved position');
        assert.ok(new URL(page.url()).hash);

        // Cover lightbox adds one overlay entry, not a replacement route entry.
        await page.goto(origin + '/posts/');
        await page.locator(`a[href="${article}"]`).first().click(); await page.waitForURL(origin + article); await ready(page);
        if (await prompt.count()) await prompt.getByRole('button', { name: '从头阅读' }).click();
        await page.locator('.article-cover-button button[aria-label^="放大封面图片"]').click();
        await page.getByRole('dialog', { name: '文章图片浏览器' }).waitFor({ state: 'visible' });
        await page.goBack(); await page.getByRole('dialog', { name: '文章图片浏览器' }).waitFor({ state: 'detached' });
        assert.equal(new URL(page.url()).pathname, article);
        await page.goBack(); await page.waitForURL(origin + '/posts/');
        assert.deepEqual(errors, []);
        results.push({ engine, reduced, status: 'PASS', savedY: record.scrollY, resumedY, errors });
        console.log(`${engine} ${reduced ? 'reduced' : 'motion'}: READING PASS presets+mobileTOC+resume+anchor+history+gallery`);
        await context.close();
      }
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage denied', 'SecurityError'); } }); });
      const page = await context.newPage(); await page.goto(origin + article); await ready(page);
      await page.getByRole('button', { name: '打开阅读偏好', exact: true }).click();
      const settings = page.getByRole('dialog', { name: '阅读偏好', exact: true });
      await settings.locator('input[name="reading-font-size"][value="1"]').check();
      assert.match(await settings.getByRole('status').textContent(), /本次阅读/);
      assert.equal(await page.locator('.article-content .body').evaluate(el => el.style.fontSize), '19px');
      await closeDialog(page, '阅读偏好');
      console.log(`${engine}: STORAGE_DENIED PASS`); results.push({ engine, storageDenied: 'PASS' }); await context.close();
    } catch (error) {
      if (failedPage && !failedPage.isClosed()) {
        await failedPage.screenshot({ path: path.join(output, `${engine}-failure.png`) });
        fs.writeFileSync(path.join(output, `${engine}-failure.json`), JSON.stringify(await failedPage.evaluate(() => ({ href: location.href, y: scrollY, active: { tag: document.activeElement?.tagName, id: document.activeElement?.id }, body: document.querySelector('.article-content .body')?.getBoundingClientRect().toJSON(), dialogs: [...document.querySelectorAll('dialog')].map(x => ({ open: x.open, label: x.getAttribute('aria-label') })), tools: Boolean(document.querySelector('[aria-label="阅读工具"]')) })), null, 2));
      }
      results.push({ engine, error: String(error) }); console.error(`${engine}: ${error.stack}`); process.exitCode = 1;
    }
    finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); }
  }
})();
