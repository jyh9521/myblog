const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

function load(file) {
  assert.ok(fs.existsSync(file), `${file} implements public search`);
  const absolute = path.resolve(file), localRequire = createRequire(absolute);
  const context = { exports: {}, process, URL, URLSearchParams, Date, AbortController, setTimeout, clearTimeout, require(name) {
    const relative = name.startsWith('.') && path.resolve(path.dirname(absolute), name);
    if (relative && fs.existsSync(`${relative}.ts`)) return load(`${relative}.ts`);
    return localRequire(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, context, { filename: absolute });
  return context.exports;
}
const core = () => load('lib/site-search.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const post = (slug, overrides = {}) => ({ slug, visibility: 'public', title: slug, description: '', body: '', tags: [], ...overrides });
const game = (slug, overrides = {}) => ({ slug, title: slug, platforms: [], metadata: null, ...overrides });
const chronology = (id, overrides = {}) => ({ id, title: id, works: [], ...overrides });

test('public index excludes protected and unlisted articles, including their titles and identifiers', () => {
  const index = core().buildSiteSearchIndex({ posts: [
    post('public', { title: '公开文章', body: 'A public body' }),
    post('hidden-slug', { visibility: 'unlisted', title: 'HIDDEN_TITLE', body: 'HIDDEN_BODY' }),
    post('locked-slug', { visibility: 'password', title: 'LOCKED_TITLE', body: 'LOCKED_BODY', privateId: 'SECRET_PRIVATE_ID' }),
    post('unknown-slug', { visibility: 'invalid', body: 'INVALID_BODY' }),
  ], games: [], chronologies: [] });
  assert.deepEqual(plain(index.entries.map(item => item.href)), ['/posts/public/']);
  assert.match(JSON.stringify(index), /A public body/);
  assert.doesNotMatch(JSON.stringify(index), /HIDDEN|LOCKED|SECRET|INVALID|hidden-slug|locked-slug|unknown-slug/);
});

test('game aliases and platform metadata are indexed without copying private notes or events', () => {
  const index = core().buildSiteSearchIndex({ posts: [], chronologies: [], games: [game('sample', {
    title: '永恒传说', metadata: { title: 'Tales of Eternia', localizedName: '永恒传说', originalName: 'テイルズ オブ エターニア', alternativeNames: ['Tales of Destiny II'], genres: ['RPG'], developers: ['Namco'] },
    platforms: [{ platform: 'PSP' }], events: [{ title: 'PLAY_SECRET', note: 'EVENT_SECRET' }], manual: { notes: 'MANUAL_SECRET' }, summary: 'SUMMARY_SECRET',
  })] });
  for (const q of ['永恒', 'Tales of Destiny II', 'テイルズ', 'PSP', 'Namco']) assert.equal(core().searchSiteIndex(index, q).total, 1, q);
  assert.doesNotMatch(JSON.stringify(index), /SECRET/);
});

test('chronology searches titles and original work names but never story fields or event titles', () => {
  const index = core().buildSiteSearchIndex({ posts: [], games: [], chronologies: [chronology('series', {
    title: '银河战士时间线', description: 'DESCRIPTION_SPOILER', calendarNote: 'CALENDAR_SPOILER',
    works: [{ title: '银河战士', originalTitle: 'Metroid', synopsis: 'WORK_SPOILER', continuity: 'CONTINUITY_SPOILER' }],
    events: [{ title: 'EVENT_SPOILER', summary: 'SUMMARY_SPOILER', spoilerWorks: [] }], terms: [{ title: 'TERM_SPOILER' }],
  })] });
  assert.equal(core().searchSiteIndex(index, 'Metroid').groups[2].results[0].href, '/chronicles/series/');
  assert.doesNotMatch(JSON.stringify(index), /SPOILER/);
});

test('plain text extraction drops code, embeds and HTML attributes from public article snippets', () => {
  const index = core().buildSiteSearchIndex({ games: [], chronologies: [], posts: [post('markup', {
    title: 'Text', body: 'Visible **words** <img data-secret="ATTRIBUTE" />\n```\nCODE_ONLY\n```\n[gframe]EMBED_ONLY[/gframe]\n[link](https://hidden.test/URL_ONLY)',
  })] });
  assert.equal(core().searchSiteIndex(index, 'Visible words').total, 1);
  assert.doesNotMatch(JSON.stringify(index), /ATTRIBUTE|CODE_ONLY|EMBED_ONLY|URL_ONLY/);
});

test('exact title and alias matches outrank prefixes, descriptions and body mentions', () => {
  const api = core();
  const index = api.buildSiteSearchIndex({ games: [], chronologies: [], posts: [
    post('body', { title: 'Another', body: 'Metroid' }),
    post('description', { title: 'Other', description: 'Metroid' }),
    post('prefix', { title: 'Metroid guide' }),
    post('exact', { title: 'Metroid' }),
  ] });
  assert.deepEqual(plain(api.searchSiteIndex(index, 'Metroid').groups[0].results.map(item => item.id)), ['post:exact', 'post:prefix', 'post:description', 'post:body']);
});

test('all query terms must match and matching normalizes full width letters and case', () => {
  const api = core(), index = api.buildSiteSearchIndex({ posts: [post('one', { title: 'METROID Guide', body: '星球 探索' })], games: [], chronologies: [] });
  assert.equal(api.searchSiteIndex(index, 'ｍｅｔｒｏｉｄ 星球').total, 1);
  assert.equal(api.searchSiteIndex(index, 'metroid missing').total, 0);
  assert.equal(api.searchSiteIndex(index, '   ').total, 0);
});

test('groups retain full counts while bounding rendered results and using deterministic ties', () => {
  const api = core(), posts = Array.from({ length: 40 }, (_, n) => post(`sample-${String(n).padStart(2, '0')}`, { title: 'Match' }));
  const index = api.buildSiteSearchIndex({ posts: posts.reverse(), games: [game('g', { title: 'Match' })], chronologies: [chronology('c', { title: 'Match' })] });
  const result = api.searchSiteIndex(index, 'match');
  assert.equal(result.total, 42);
  assert.deepEqual(plain(result.groups.map(group => [group.kind, group.total, group.results.length])), [['post', 40, 6], ['game', 1, 1], ['chronology', 1, 1]]);
  assert.equal(result.groups[0].results[0].id, 'post:sample-00');
  assert.equal(api.searchSiteIndex(index, 'match', 999).groups[0].results.length, 20);
  assert.equal(api.searchSiteIndex(index, 'match', -5).groups[0].results.length, 1);
});

test('malformed slugs are rejected and duplicate destinations never produce repeated results', () => {
  const api = core(), index = api.buildSiteSearchIndex({ posts: [post('../bad'), post('valid'), post('valid')], games: [game('https://bad.test')], chronologies: [chronology('bad/id')] });
  assert.equal(index.entries.length, 1);
  assert.equal(index.entries[0].href, '/posts/valid/');
});

test('query length is bounded and query URLs preserve a literal search rather than HTML', () => {
  const api = core();
  assert.equal(api.cleanSiteQuery('a'.repeat(300)).length, 160);
  assert.equal(api.siteSearchHref('A&B 汉化'), '/search/?q=A%26B+%E6%B1%89%E5%8C%96');
  assert.equal(api.siteSearchHref(''), '/search/');
});

test('search shortcut ignores typing, composition, repeats, modifiers and other native dialogs', () => {
  const { isSiteSearchShortcut } = core();
  const event = { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false };
  const body = { tagName: 'BODY', isContentEditable: false, closest: () => null };
  assert.equal(isSiteSearchShortcut(event, body, false), true);
  assert.equal(isSiteSearchShortcut({ ...event, ctrlKey: false, metaKey: true }, body, false), true);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(isSiteSearchShortcut(event, { ...body, tagName }, false), false);
  assert.equal(isSiteSearchShortcut(event, { ...body, isContentEditable: true }, false), false);
  assert.equal(isSiteSearchShortcut(event, body, true), false);
  for (const flag of ['repeat', 'isComposing', 'altKey', 'shiftKey', 'defaultPrevented']) assert.equal(isSiteSearchShortcut({ ...event, [flag]: true }, body, false), false, flag);
});

test('index loader is lazy, shares pending requests, and caches only validated success', async () => {
  const { createSiteSearchLoader } = load('lib/site-search-client.ts');
  let calls = 0, resolve;
  const index = core().buildSiteSearchIndex({ posts: [post('hello')], games: [], chronologies: [] });
  const loader = createSiteSearchLoader((url, options) => { calls++; assert.equal(url, '/search-index.json'); assert.ok(options.signal); return new Promise(done => { resolve = done; }); });
  assert.equal(calls, 0);
  const first = loader(), second = loader();
  assert.equal(calls, 1);
  resolve({ ok: true, json: async () => index });
  assert.deepEqual(plain(await first), plain(index));
  assert.equal(await first, await second);
  assert.equal(await loader(), await first);
  assert.equal(calls, 1);
});

test('failed network and bad index responses can be retried without caching failure', async () => {
  const { createSiteSearchLoader } = load('lib/site-search-client.ts');
  let calls = 0;
  const valid = core().buildSiteSearchIndex({ posts: [post('ok')], games: [], chronologies: [] });
  const loader = createSiteSearchLoader(async () => {
    calls++;
    if (calls === 1) throw new Error('offline');
    if (calls === 2) return { ok: false, status: 503 };
    if (calls === 3) return { ok: true, json: async () => ({ version: 1, entries: [{ href: 'javascript:alert(1)' }] }) };
    return { ok: true, json: async () => valid };
  });
  await assert.rejects(loader(), /offline/);
  await assert.rejects(loader(), /503/);
  await assert.rejects(loader(), /index/i);
  assert.equal((await loader()).entries[0].href, '/posts/ok/');
  assert.equal(calls, 4);
});

test('timed out downloads terminate and leave a usable retry path', async () => {
  const { createSiteSearchLoader } = load('lib/site-search-client.ts');
  let calls = 0;
  const loader = createSiteSearchLoader((url, { signal }) => {
    calls++;
    if (calls > 1) return Promise.resolve({ ok: true, json: async () => ({ version: 1, entries: [] }) });
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  }, 5);
  await assert.rejects(loader(), /aborted/);
  assert.equal((await loader()).entries.length, 0);
});
