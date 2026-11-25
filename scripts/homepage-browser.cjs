// Content-first homepage acceptance against the real static export, not fixture DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const origin = process.env.HOME_ORIGIN || 'http://127.0.0.1:4173';
const output = path.resolve(process.env.HOME_OUTPUT || 'reports/home-content-20261126/modified-browser');
fs.mkdirSync(output, { recursive: true });
const cases = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  narrow: { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true },
  dark: { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  nojs: { viewport: { width: 390, height: 844 }, javaScriptEnabled: false },
  reduced: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' },
};

async function inspectLayout(page) {
  return page.evaluate(() => {
    const rect = el => el ? { top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, height: el.getBoundingClientRect().height } : null;
    const articleLinks = root => [...root.querySelectorAll('a[href]')].map(el => el.getAttribute('href')).filter(href => /^\/posts\/[^/?#]+\/$/.test(href));
    const feature = document.querySelector('.m3-feature');
    const updates = document.querySelector('.home-updates');
    const updateLinks = updates ? [...updates.querySelectorAll('a[href]')].filter(el => /^\/posts\/[^/?#]+\/$/.test(el.getAttribute('href'))) : [];
    const feed = [...document.querySelectorAll('.home-feed .post-card')];
    return {
      viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth - innerWidth,
      title: document.querySelector('h1')?.textContent.trim(), intro: rect(document.querySelector('.home-intro')),
      searchInput: rect(document.querySelector('.home-search input')),
      feature: rect(feature), featureHref: feature?.getAttribute('href'),
      featureTitle: rect(feature?.querySelector('h2,h3,strong')), featureDescription: rect(feature?.querySelector('p')),
      updates: rect(updates), updateLinks: updateLinks.map(el => ({ href: el.getAttribute('href'), text: el.textContent.trim(), ...rect(el) })),
      featureArticles: feature ? [feature.getAttribute('href')] : [], updateArticles: updates ? [...new Set(articleLinks(updates))] : [],
      feedArticles: feed.map(card => [...new Set(articleLinks(card))]),
      obsolete: document.querySelectorAll('main .hero-button,main .m3-quick,main .daily-pick').length,
      categories: [...document.querySelectorAll('.home-categories a')].map(el => ({ href: el.getAttribute('href'), text: el.textContent.trim() })),
      explore: [...document.querySelectorAll('.home-explore a')].map(el => ({ href: el.getAttribute('href'), text: el.textContent.trim() })),
      theme: document.documentElement.dataset.theme,
    };
  });
}

async function verifyFeaturedReturn(page, reduced) {
  const feature = page.locator('.m3-feature');
  const image = feature.locator('[data-motion-cover]');
  await image.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await page.waitForTimeout(650);
  const before = await image.evaluate(el => ({ top: el.getBoundingClientRect().top, y: scrollY, slug: el.dataset.motionCover }));
  const href = await feature.getAttribute('href');
  await feature.click(); await page.waitForURL('**' + href); await page.waitForTimeout(850);
  assert.ok(await page.locator('.article-header h1').isVisible(), 'featured article opens');
  await page.locator('[data-motion-cover]').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.__homeReturnFrames = []; let count = 0;
    const sample = () => { const el = document.querySelector('[data-motion-return]'); window.__homeReturnFrames.push({ phase: el?.dataset.motionReturn, rect: el?.getBoundingClientRect().toJSON() }); if (++count < 110) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  await page.goBack(); await page.waitForURL(origin + '/'); await page.mouse.move(0, 0); await page.waitForTimeout(1800);
  const after = await image.evaluate(el => ({ top: el.getBoundingClientRect().top, y: scrollY, slug: el.dataset.motionCover }));
  const frames = await page.evaluate(() => window.__homeReturnFrames);
  const moving = frames.filter(frame => frame.phase === 'moving');
  assert.equal(after.slug, before.slug); assert.ok(Math.abs(after.top - before.top) < 3, 'Back restores the featured cover position');
  if (reduced) assert.equal(moving.length, 0, 'reduced motion does not animate a return cover');
  else {
    assert.ok(moving.length >= 3, 'Back animates the actual featured cover');
    assert.ok(new Set(moving.map(frame => [frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height].map(Math.round).join(','))).size > 2, 'return cover travels through distinct positions');
  }
  assert.equal(await page.locator('[data-motion-return]').count(), 0, 'temporary cover removed');
  assert.equal(await page.locator('[data-motion-cover][style*="visibility: hidden"]').count(), 0, 'real covers revealed');
  return { before, after, movingFrames: moving.length, frames };
}

async function run(browser, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  const result = { name, checks: [], errors };
  const check = (label, fn) => { try { fn(); result.checks.push({ label, pass: true }); } catch (error) { result.checks.push({ label, pass: false, error: error.message }); } };
  try {
    await page.goto(origin + '/', { waitUntil: 'networkidle' });
    if (options.javaScriptEnabled !== false) await page.waitForFunction(() => document.body.dataset.motion === 'ready');
    await page.waitForTimeout(700);
    result.layout = await inspectLayout(page); const layout = result.layout;
    await page.screenshot({ path: path.join(output, name + '-first-fold.png') });
    check('content appears in the first fold', () => {
      assert.ok(layout.feature, 'featured article exists');
      assert.ok(layout.featureTitle && layout.featureTitle.top >= 0 && layout.featureTitle.bottom <= layout.viewport.height, 'featured title is visible without scrolling');
      assert.ok(layout.featureDescription && layout.featureDescription.bottom <= layout.viewport.height, 'featured description is visible without scrolling');
      assert.equal(layout.updateArticles.length, 3, 'three actual recent articles are immediately discoverable');
      if (layout.viewport.width >= 1000) {
        assert.ok(layout.feature.bottom <= layout.viewport.height, 'desktop featured card fits the first fold');
        assert.ok(layout.updateLinks.every(link => link.top >= 0 && link.bottom <= layout.viewport.height), 'desktop three update entries fit the first fold');
      } else assert.ok(layout.updates && layout.updates.top < layout.viewport.height - 24, 'mobile next content begins before the fold');
    });
    check('articles do not repeat across editorial slots', () => {
      assert.equal(layout.featureArticles.length, 1); assert.equal(layout.updateArticles.length, 3); assert.ok(layout.feedArticles.length > 0, 'remaining posts form the feed');
      assert.ok(layout.feedArticles.every(links => links.length === 1), 'each card names one article');
      const all = [...layout.featureArticles, ...layout.updateArticles, ...layout.feedArticles.flat()];
      assert.equal(new Set(all).size, all.length, 'featured, updates and feed articles are unique');
    });
    check('focused layout and narrow viewport', () => {
      assert.ok(layout.title); assert.equal(layout.obsolete, 0); assert.ok(layout.overflow <= 1, `horizontal overflow ${layout.overflow}px`);
      assert.ok(layout.searchInput && layout.searchInput.height >= 44, `search input touch target is ${layout.searchInput?.height}px tall; expected at least 44px`);
    });
    check('categories and real game previews', () => {
      assert.ok(layout.categories.length > 0 && layout.categories.every(link => link.text && /^\/posts\/\?tag=.+/.test(link.href)), 'categories filter real articles');
      assert.ok(layout.explore.some(link => /^\/games\/(?!timelines(?:\/|$))[^/?#]+\/$/.test(link.href) && link.text), 'real game preview links to a detail');
      assert.ok(layout.explore.some(link => /^\/chronicles\/[^/?#]+\/$/.test(link.href) && link.text), 'real timeline preview links to a detail');
    });
    if (name === 'dark') check('dark theme applies', () => assert.equal(layout.theme, 'dark'));
    if (result.checks.some(item => !item.pass)) return result;

    if (name === 'desktop' || name === 'nojs') {
      const links = [...new Set([layout.featureHref, ...layout.updateArticles, ...layout.feedArticles.flat(), ...layout.categories.map(link => link.href), ...layout.explore.map(link => link.href)])];
      result.links = [];
      for (const href of links) { const response = await context.request.get(origin + href); result.links.push({ href, status: response.status() }); assert.ok(response.ok(), `${href} returns ${response.status()}`); }
      const query = 'zzzz-no-matching-home-article';
      await page.locator('.home-search input[type="search"]').fill(query);
      await page.locator('.home-search button').click();
      await page.waitForURL(url => url.pathname === '/posts/' && url.searchParams.get('q') === query);
      if (options.javaScriptEnabled !== false) {
        await page.locator('.archive-search input').waitFor(); assert.equal(await page.locator('.archive-search input').inputValue(), query); await page.getByText('没有找到匹配的文章').waitFor();
        await page.locator('.tag-filters button').nth(1).click();
        assert.equal(new URL(page.url()).searchParams.get('q'), query, 'category selection retains the search');
        assert.ok(new URL(page.url()).searchParams.has('tag'), 'category is represented in the URL');
        await page.locator('.archive-empty button').click();
        await page.waitForURL(url => !url.searchParams.has('q') && !url.searchParams.has('tag'));
        assert.equal(await page.locator('.archive-search input').inputValue(), '');
        const restoredCount = await page.locator('.post-card').count();
        assert.equal(restoredCount, layout.featureArticles.length + layout.updateArticles.length + layout.feedArticles.length, 'clearing filters restores the full article list');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.locator('.archive-search input').inputValue(), '');
        assert.equal(await page.locator('.post-card').count(), restoredCount, 'refresh keeps the cleared full archive');
      }
      else assert.ok(await page.locator('h1').isVisible(), 'search GET reaches a usable archive without JS');
      result.checks.push({ label: 'real link targets and GET search', pass: true });
      await page.goto(origin + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    }
    if (['desktop', 'mobile', 'reduced'].includes(name)) {
      result.return = await verifyFeaturedReturn(page, name === 'reduced');
      result.checks.push({ label: 'featured navigation and Back restoration', pass: true });
    }
    if (name === 'nojs') { await page.locator('.m3-feature').click(); assert.ok(await page.locator('.article-header h1').isVisible(), 'no-JS featured navigation works'); result.checks.push({ label: 'no-JS article navigation', pass: true }); }
    check('no runtime errors', () => assert.deepEqual(errors, []));
  } catch (error) { result.checks.push({ label: 'browser interaction', pass: false, error: error.stack }); }
  finally { await context.close(); }
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const results = [];
  try {
    for (const name of (process.env.HOME_CASES || Object.keys(cases).join(',')).split(',')) {
      assert.ok(cases[name], 'known homepage scenario');
      const result = await run(browser, name, cases[name]); results.push(result);
      const failures = result.checks.filter(item => !item.pass);
      console.log(`HOMEPAGE ${name}: ${failures.length ? 'FAIL ' + failures.map(item => item.label + ': ' + item.error).join('; ') : 'PASS'}`);
      if (failures.length) process.exitCode = 1;
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
