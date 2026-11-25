const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

function load(file) {
  const absolute = path.resolve(file);
  const localRequire = createRequire(absolute);
  const context = { exports: {}, process, URL, Date, require(name) {
    const relative = name.startsWith('.') && path.resolve(path.dirname(absolute), name);
    if (relative && fs.existsSync(`${relative}.ts`)) return load(`${relative}.ts`);
    return localRequire(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, context, { filename: absolute });
  return context.exports;
}

function home() {
  assert.ok(fs.existsSync('lib/home-content.ts'), 'homepage content grouping is implemented');
  return load('lib/home-content.ts');
}

function post(slug, changes = {}) {
  return {
    slug, visibility: 'public', privateId: '', title: slug,
    date: '2026-11-01', updatedAt: '', updateNote: '', gameSlug: '',
    description: '', cover: 'https://example.test/cover.jpg', tags: [],
    pinned: false, body: '# Body is not a listing summary', audio: '', video: '', attachment: '',
    ...changes,
  };
}

function slugs(posts) { return Array.from(posts, item => item.slug); }

test('empty content has no feature, updates, or feed', () => {
  const result = home().buildHomeContent([]);
  assert.equal(result.featured, null);
  assert.deepEqual(slugs(result.updates), []);
  assert.deepEqual(slugs(result.feed), []);
});

test('newest published article with a cover is not repeated in updates or feed', () => {
  const posts = [
    post('recent-one', { date: '2026-11-25' }),
    post('latest-covered', { date: '2026-11-26' }),
    post('recent-two', { date: '2026-11-24' }),
    post('recent-three', { date: '2026-11-23' }),
    post('older', { date: '2026-11-22' }),
  ];
  const result = home().buildHomeContent(posts);
  assert.equal(result.featured, posts[1]);
  assert.deepEqual(slugs(result.updates), ['recent-one', 'recent-two', 'recent-three']);
  assert.deepEqual(slugs(result.feed), ['older']);
});

test('real update dates outrank publication dates and pinned order', () => {
  const posts = [
    post('pinned', { date: '2026-01-01', pinned: true }),
    post('new', { date: '2026-11-24' }),
    post('maintained', { date: '2026-02-01', updatedAt: '2026-11-25' }),
    post('featured', { date: '2026-11-26' }),
    post('third', { date: '2026-11-23' }),
  ];
  const result = home().buildHomeContent(posts);
  assert.deepEqual(slugs(result.updates), ['maintained', 'new', 'third']);
  assert.deepEqual(slugs(result.feed), ['pinned']);
});

test('few posts occupy only available groups without repetition', () => {
  const api = home();
  const single = api.buildHomeContent([post('only')]);
  assert.equal(single.featured.slug, 'only');
  assert.equal(single.updates.length, 0);
  assert.equal(single.feed.length, 0);
  const pair = api.buildHomeContent([post('only'), post('second')]);
  assert.deepEqual(slugs(pair.updates), ['second']);
  assert.equal(pair.feed.length, 0);
});

test('all groups are deduplicated by slug even if the input repeats a post', () => {
  const api = home();
  const feature = post('feature');
  const update = post('update');
  const result = api.buildHomeContent([feature, update, feature, post('second'), update, post('third'), post('fourth')]);
  assert.equal(result.featured.slug, 'feature');
  assert.deepEqual(slugs(result.updates), ['fourth', 'second', 'third']);
  assert.deepEqual(slugs(result.feed), ['update']);
});

test('date ties have deterministic slug order regardless of incoming pinned order', () => {
  const api = home();
  const posts = [post('zulu'), post('bravo'), post('alpha'), post('feature', { date: '2026-11-02' })];
  assert.deepEqual(slugs(api.buildHomeContent(posts).updates), ['alpha', 'bravo', 'zulu']);
  assert.deepEqual(slugs(api.buildHomeContent([...posts].reverse()).updates), ['alpha', 'bravo', 'zulu']);
  const tied = [post('zulu'), post('alpha')];
  assert.equal(api.buildHomeContent(tied).featured.slug, 'alpha');
  assert.equal(api.buildHomeContent([...tied].reverse()).featured.slug, 'alpha');
});

test('locked, hidden, and unusable-cover articles never become the latest covered article', () => {
  const api = home();
  const posts = [
    post('hidden', { visibility: 'unlisted', date: '2026-11-26', body: 'UNLISTED BODY' }),
    post('locked', { visibility: 'password', date: '2026-11-25', body: '' }),
    post('no-cover', { cover: '', date: '2026-11-24' }),
    post('missing-cover', { cover: '/uploads/nonexistent-home-cover.jpg', date: '2026-11-23' }),
    post('unsafe-cover', { cover: 'javascript:alert(1)', date: '2026-11-22' }),
    post('fallback', { date: '2026-11-21' }),
    post('older', { date: '2026-01-01', pinned: true }),
  ];
  const result = api.buildHomeContent(posts);
  assert.equal(result.featured.slug, 'fallback');
  assert.deepEqual(slugs(result.updates), ['locked', 'no-cover', 'missing-cover']);
  assert.deepEqual(slugs(result.feed), ['unsafe-cover', 'older']);
  assert.ok(!JSON.stringify(result).includes('UNLISTED BODY'));
});

test('an old article updated more recently never replaces the newest published covered article', () => {
  const result = home().buildHomeContent([
    post('old-maintained', { date: '2026-01-01', updatedAt: '2026-11-26', pinned: true }),
    post('latest-published', { date: '2026-11-25' }),
    post('new-no-cover', { date: '2026-11-26', cover: '' }),
  ]);
  assert.equal(result.featured.slug, 'latest-published');
  assert.deepEqual(slugs(result.updates), ['new-no-cover', 'old-maintained']);
});

test('public password listings survive without becoming the featured story', () => {
  const result = home().buildHomeContent([
    post('locked', { visibility: 'password', body: '', privateId: 'a'.repeat(32) }),
    post('hidden', { visibility: 'unlisted' }),
  ]);
  assert.equal(result.featured, null);
  assert.deepEqual(slugs(result.updates), ['locked']);
  assert.deepEqual(slugs(result.feed), []);
});

test('no usable covers leaves all public listings available in updates and feed', () => {
  const result = home().buildHomeContent(['one', 'two', 'three', 'four'].map(slug => post(slug, { cover: '' })));
  assert.equal(result.featured, null);
  assert.deepEqual(slugs(result.updates), ['four', 'one', 'three']);
  assert.deepEqual(slugs(result.feed), ['two']);
});

test('undated articles cannot be called the newest publication, even with a valid update date', () => {
  const api = home();
  for (const dates of [
    { date: '', updatedAt: '' },
    { date: 'invalid', updatedAt: '' },
    { date: '2026-02-30', updatedAt: '2026-11-25' },
  ]) {
    const result = api.buildHomeContent([post('undated', dates)]);
    assert.equal(result.featured, null);
    assert.deepEqual(slugs(result.updates), ['undated']);
    assert.deepEqual(slugs(result.feed), []);
  }
});

test('sorting and grouping never mutate the array, posts, or metadata', () => {
  const posts = Object.freeze([
    Object.freeze(post('zulu', { date: '2026-11-02', tags: Object.freeze(['game']) })),
    Object.freeze(post('alpha', { tags: Object.freeze(['project']) })),
  ]);
  const before = JSON.stringify(posts);
  const result = home().buildHomeContent(posts);
  assert.equal(JSON.stringify(posts), before);
  assert.equal(result.featured, posts[0]);
  assert.equal(result.updates[0], posts[1]);
});

test('date helper uses only valid recorded calendar dates and never invents freshness', () => {
  const { homePostDate } = home();
  const cases = [
    [{ date: '2026-11-01', updatedAt: '2026-11-25' }, '2026-11-25'],
    [{ date: '2026-11-25', updatedAt: '2026-11-01' }, '2026-11-25'],
    [{ date: '2026-11-01', updatedAt: '' }, '2026-11-01'],
    [{ date: '2026-11-01', updatedAt: 'not-a-date' }, '2026-11-01'],
    [{ date: '2026-02-01', updatedAt: '2026-02-30' }, '2026-02-01'],
    [{ date: '', updatedAt: '2024-02-29' }, '2024-02-29'],
    [{ date: '2026-02-30', updatedAt: '' }, ''],
    [{ date: '', updatedAt: '' }, ''],
  ];
  for (const [dates, expected] of cases) assert.equal(homePostDate(post('date', dates)), expected);
  const result = home().buildHomeContent([
    post('unknown', { date: 'invalid', cover: '' }),
    post('recorded', { date: '2026-11-01', cover: '' }),
  ]);
  assert.deepEqual(slugs(result.updates), ['recorded', 'unknown']);
});

test('update summaries prefer authored metadata and never expose article body', () => {
  const { updateSummary } = home();
  assert.equal(updateSummary(post('note', { updateNote: '  修正字幕与安装说明  ', description: '旧摘要' })), '修正字幕与安装说明');
  assert.equal(updateSummary(post('summary', { updateNote: '  ', description: '  项目介绍  ' })), '项目介绍');
  assert.equal(updateSummary(post('plain', { body: 'DO NOT EXTRACT BODY' })), '阅读全文，查看完整内容。');
  assert.equal(updateSummary(post('locked', { visibility: 'password', updateNote: 'PRIVATE NOTE', description: 'PRIVATE SUMMARY', body: 'PRIVATE BODY' })), '这篇文章需要密码访问。');
});

test('listing summaries flatten authored Markdown blockquotes without pulling article text', () => {
  const { updateSummary } = home();
  assert.equal(updateSummary(post('bilingual', { description: '> English patch\n> 中文汉化补丁\n> 适用于游戏韩版', body: 'BODY MUST STAY PRIVATE' })), 'English patch 中文汉化补丁 适用于游戏韩版');
  assert.equal(updateSummary(post('note', { updateNote: ' > 更新说明\r\n> > 修正字幕\n\n  补充安装方法  ' })), '更新说明 修正字幕 补充安装方法');
  assert.equal(updateSummary(post('literal', { description: '版本要求 > 1.0' })), '版本要求 > 1.0');
  assert.equal(updateSummary(post('empty-quote', { updateNote: '>  \n> ', description: '> 有效摘要' })), '有效摘要');
});
