
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { detailTheGamesDB, searchDossierEditions } from '../../ns-counter/src/archive-routes.js';
import { dossierBriefRoute } from '../../ns-counter/src/dossier-brief-route.js';

const root = process.cwd();
const matter = createRequire(resolve(root, 'package.json'))('gray-matter');
const bundleUrl = 'https://unpkg.com/@sveltia/cms@0.256.1/dist/sveltia-cms.js';
const bundle = process.env.SVELTIA_BUNDLE ? await readFile(process.env.SVELTIA_BUNDLE) : await (await fetch(bundleUrl)).text();
const out = process.env.DOSSIER_SCREENSHOTS;
const baseline = process.argv.includes('--baseline');
if (out) await mkdir(out, { recursive: true });
const seed = [
  '---', 'title: 旧档案', 'status: [想玩]', 'summary: 已有手写简介。', 'playTime: {hours: 3.8}',
  'personalRating: 8.12', 'manual: {availabilityStatus: physical-only, notes: 保留原版渠道}',
  'hltb: {url: https://howlongtobeat.com/game/2500, main: 5}', 'events: [{title: 开始游戏, note: 旧记录}]', '---',
].join('\n');
const original = 'In Harbor, you follow the clues left by a missing crew and work with island residents to repair a ship.';
const draft = '在《港湾手记》中，你将循着失踪船员留下的线索走访岛上的居民。调查途中，你要收集修理船只所需的零件，并和居民协作修复船体。寻找船员与修复船只构成故事的两条线索，随着调查与修理的推进逐渐交织。';
const oldGame = { id: 35, game_title: 'Harbor', release_date: '2004-04-19', platform: 24, developers: [12], overview: original };
const newGame = { ...oldGame, id: 36, release_date: '2023-01-03', platform: 25, developers: [13] };
const gamePlatforms = { 24: { id: 24, name: 'PlayStation 2' }, 25: { id: 25, name: 'PlayStation 5' } };
const env = { THEGAMESDB_API_KEY: 'local-fixture', GEMINI_API_KEY: 'local-fixture',
  GAME_ADMIN: { fetch: async () => new Response('') },
};
const dataRequests = [];
let aiCalls = 0;
async function provider(url, options) {
  if (url.hostname === 'generativelanguage.googleapis.com') {
    aiCalls++;
    assert.equal(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text).originalText, original);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: draft }] } }] });
  }
  assert.equal(url.hostname, 'api.thegamesdb.net');
  const endpoint = url.pathname.split('/').at(-1);
  if (endpoint === 'Developers') return Response.json({ code: 200, data: { developers: {
    12: { id: 12, name: 'Original Studio' }, 13: { id: 13, name: 'New Studio' },
  } } });
  const games = endpoint === 'ByGameID' ? [oldGame, newGame].filter(game => String(game.id) === url.searchParams.get('id')) : [oldGame, newGame];
  return Response.json({ code: 200, data: { games }, include: { platform: gamePlatforms } });
}
const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    const respond = (body, type = 'application/json; charset=utf-8') => {
      res.setHeader('content-type', type);
      res.end(body);
    };
    if (pathname === '/fixture-cover.svg') return respond('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#234fa5"/><path d="M12 72h48L46 54l-12 5-10-14z" fill="#dceaff"/></svg>', 'image/svg+xml');
    if (pathname === '/cms-bundle.js') return respond(bundle, 'text/javascript');
    if (pathname === '/seed/manifest.json') return respond(JSON.stringify({ files: ['content/games/legacy-entry.md'] }));
    if (pathname === '/seed/content/games/legacy-entry.md') return respond(seed, 'text/plain; charset=utf-8');
    if (pathname === '/ns/api/accounts/session') return respond('{}');
    if (pathname.startsWith('/ns/api/games/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
      const request = new Request('http://' + req.headers.host + req.url, {
        method: req.method, body, headers: { ...req.headers, cookie: '__Host-gaming_admin=local-fixture' },
      });
      const data = body ? JSON.parse(body) : null;
      dataRequests.push({ pathname, body: data });
      const url = new URL(request.url);
      const reply = pathname.endsWith('/search') ? await searchDossierEditions(request, env, url.searchParams.get('q'), provider)
        : pathname.endsWith('/detail') ? await detailTheGamesDB(request, env, data, provider)
          : await dossierBriefRoute(request, env, provider);
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      return res.end(await reply.text());
    }
    if (!/^\/sveltia\/(?:[a-z0-9._-]+)?$/i.test(pathname)) { res.statusCode = 404; return res.end(); }
    const name = pathname.split('/').at(-1) || 'index.html';
    const source = await readFile(resolve(root, 'public/sveltia', name), 'utf8');
    if (name === 'config.yml') return respond(source.replace(/^backend:[\s\S]+?(?=\n# Built-in)/m, 'backend:\n  name: test-repo\n'), 'text/yaml; charset=utf-8');
    if (name === 'index.html') return respond(source.replace(bundleUrl, '/cms-bundle.js').replace('</head>', '<link rel="cms-seed-url" href="/seed/manifest.json" /></head>'), 'text/html; charset=utf-8');
    return respond(source, name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'application/json; charset=utf-8');
  } catch (error) { console.error(error.message); res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    // Pinned Sveltia lazily loads React DOM/Immutable.js and theme assets.
    return url.origin === origin || (url.protocol === 'https:' && ['unpkg.com', 'cdn.jsdelivr.net'].includes(url.hostname))
      ? route.continue() : route.abort();
  });
  const screenshot = name => out ? page.screenshot({ path: resolve(out, name + '.png'), animations: 'disabled' }) : Promise.resolve();
  await page.goto(origin + '/sveltia/');
  await page.getByRole('button', { name: /开始演示|开始体验|Start Demo|测试仓库|test repository/i }).click();
  await page.getByRole('button', { name: /Get Started|开始使用/ }).click();
  await page.getByText('游戏档案', { exact: true }).first().click();
  await page.getByText('旧档案', { exact: true }).first().click();
  if (baseline) {
    await page.getByLabel('搜索游戏资料', { exact: true }).waitFor();
    await page.getByRole('button', { name: '搜索并选择 HLTB 游戏', exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: '游戏档案编辑分区' }).count(), 0);
    await screenshot('baseline-desktop');
    console.log('BASELINE_UI search=visible hltb=visible dossier-tabs=0');
  } else {
    const nav = page.getByRole('navigation', { name: '游戏档案编辑分区' });
    const section = view => nav.getByRole('button', { name: view, exact: true });
    const edit = page.locator('[data-mode="edit"]');
    const field = name => edit.locator('[data-key-path="' + name + '"]');
    const summary = field('summary').locator('textarea').first();
    await nav.waitFor().catch(async error => {
      console.error('EDITOR:', (await page.locator('body').innerText()).slice(0, 2800));
      console.error('UI state:', await page.evaluate(() => [...document.querySelectorAll('[data-field-type^="game-"]')].map(node => ({
        type: node.dataset.fieldType, key: node.dataset.keyPath, html: node.innerHTML.slice(0, 200), parent: node.parentElement.className,
      }))), errors);
      throw error;
    });
    const entryUrl = page.url();
    assert.equal(await nav.getByRole('button').count(), 3);
    assert.equal(await field('playTime').isVisible(), false);
    assert.equal(await field('manual').isVisible(), false);
    assert.equal(await summary.inputValue(), '已有手写简介。');
    const preview = page.frameLocator('iframe').getByRole('article', { name: '游戏档案预览' });
    await preview.getByRole('heading', { name: '旧档案' }).waitFor();
    await screenshot('dossier-desktop');

    await section('资料与渠道').click();
    assert.equal(await summary.isVisible(), false);
    assert.equal(await field('manual').locator('textarea').inputValue(), '保留原版渠道');
    assert.equal(await page.getByRole('button', { name: '搜索 SteamGridDB 封面' }).isVisible(), false);
    await page.getByText('封面与截图', { exact: true }).click();
    await page.getByLabel('封面图片 URL').fill(origin + '/fixture-cover.svg');
    await page.getByText('封面与截图 · 已设封面', { exact: true }).click();

    await section('游玩与项目').click();
    assert.equal(await field('personalRating').isVisible(), true);
    assert.equal(await field('manual').isVisible(), false);
    assert.equal(await page.getByRole('button', { name: '搜索并选择 HLTB 游戏' }).isVisible(), false);
    assert.equal(await field('events').isVisible(), true);

    await section('档案与简介').click();
    const loginBefore = await page.evaluate(() => {
      const old = localStorage.getItem('sveltia-cms.user');
      localStorage.setItem('sveltia-cms.user', JSON.stringify({ backendName: 'github', token: 'not-a-real-token-local-fixture' }));
      return old;
    });
    await page.getByLabel('游戏原名或别名').fill('Harbor');
    await page.getByText('按年份、平台或开发商筛选').click();
    await page.getByLabel('发行年份', { exact: true }).fill('2023');
    await page.getByLabel('平台', { exact: true }).fill('PS5');
    await page.getByRole('button', { name: '查找版本', exact: true }).click();
    await page.getByRole('button', { name: /Harbor.*2023.*TheGamesDB #36.*较高匹配/ }).waitFor();
    assert.equal(dataRequests.filter(request => request.pathname.endsWith('/detail')).length, 0);
    assert.equal(await page.getByRole('button', { name: /Harbor.*2004.*TheGamesDB #35.*不同/ }).count(), 1);
    await page.getByRole('button', { name: /Harbor.*2023.*TheGamesDB #36.*较高匹配/ }).click();
    await page.getByText('已关联版本', { exact: true }).waitFor();
    assert.equal(dataRequests.find(request => request.pathname.endsWith('/detail')).body.sources.thegamesdb.id, '36');
    assert.equal(await summary.inputValue(), '已有手写简介。');

    await page.getByRole('button', { name: '从资料源准备简介' }).click();
    await page.getByText('英文', { exact: true }).waitFor();
    assert.equal(aiCalls, 0);
    await page.getByRole('button', { name: '翻译为简体中文' }).click();
    const review = page.getByLabel('待审核草稿');
    await review.waitFor();
    assert.equal(await review.inputValue(), draft);
    assert.equal(await summary.inputValue(), '已有手写简介。');
    assert.equal(aiCalls, 1);
    await page.getByRole('button', { name: '用此草稿替换简介' }).scrollIntoViewIfNeeded();
    await screenshot('dossier-review');
    const final = draft + '（审核）';
    await review.fill(final);
    await page.getByRole('button', { name: '用此草稿替换简介' }).click();
    assert.equal(await summary.inputValue(), final);
    await page.getByRole('link', { name: /参考：TheGamesDB/ }).waitFor();
    await page.evaluate(value => value ? localStorage.setItem('sveltia-cms.user', value) : localStorage.removeItem('sveltia-cms.user'), loginBefore);
    await page.getByRole('button', { name: /^(保存|Save)$/ }).click();
    const savedHandle = await page.waitForFunction(async expected => {
      const dir = await navigator.storage.getDirectory();
      async function scan(folder) {
        for await (const [name, handle] of folder.entries()) {
          if (handle.kind === 'directory') {
            const found = await scan(handle);
            if (found) return found;
          } else if (name === 'legacy-entry.md') {
            const text = await (await handle.getFile()).text();
            if (text.includes(expected)) return text;
          }
        }
        return null;
      }
      return scan(dir);
    }, final);
    const raw = await savedHandle.jsonValue(), { data } = matter(raw);
    assert.equal(data.summary.text, final);
    assert.equal(data.summary.source.edition, 'thegamesdb:36:');
    assert.equal(data.summary.source.url, 'https://thegamesdb.net/game.php?id=36');
    assert.equal(data.gameMetadata.cover, origin + '/fixture-cover.svg');
    assert.equal(data.manual.notes, '保留原版渠道');
    assert.equal(data.playTime.hours, 3.8);
    assert.equal(data.personalRating, 8.12);
    assert.equal(data.hltb.main, 5);
    assert.equal(data.events[0].note, '旧记录');
    assert.doesNotMatch(raw, /_dossierNav|In Harbor|local-fixture|officialTitle/);

    const reopened = await context.newPage();
    reopened.on('pageerror', error => errors.push(error.message));
    await reopened.goto(entryUrl, { waitUntil: 'domcontentloaded' });
    const reopenedEdit = reopened.locator('[data-mode="edit"]');
    const reopenedSummary = reopenedEdit.locator('[data-key-path="summary"] textarea').first();
    await reopenedSummary.waitFor({ timeout: 15000 }).catch(async error => {
      console.error('REOPEN:', new URL(reopened.url()).hash, (await reopened.locator('body').innerText()).slice(0, 1600));
      throw error;
    });
    assert.equal(await reopenedSummary.inputValue(), final);
    assert.equal(await reopenedEdit.locator('[data-key-path="manual"]').isVisible(), false);
    await reopened.setViewportSize({ width: 390, height: 840 });
    const mobileNav = reopened.getByRole('navigation', { name: '游戏档案编辑分区' });
    await mobileNav.waitFor();
    assert.equal(await mobileNav.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    assert.equal(await reopened.locator('.blog-admin-launcher:visible').count(), 0);
    if (out) await reopened.screenshot({ path: resolve(out, 'dossier-mobile.png'), animations: 'disabled' });
    console.log('MODIFIED_UI tabs=3 manual/HLTB=hidden-by-default edition=TheGamesDB#36 draft=review-only save+reload=ok legacy-fields=preserved mobile=390px ai-calls=1');
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.close();
}
