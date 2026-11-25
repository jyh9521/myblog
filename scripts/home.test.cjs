const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, replacements = {}) {
  const absolute = path.resolve(file);
  const localRequire = createRequire(absolute);
  const context = { exports: {}, process, URL, Date, require(name) {
    if (name.endsWith('.css')) return {};
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name.startsWith('.')) {
      const relative = path.resolve(path.dirname(absolute), name);
      for (const extension of ['.ts', '.tsx']) {
        const candidate = `${relative}${extension}`;
        if (replacements[candidate]) return replacements[candidate];
        if (fs.existsSync(candidate)) return load(candidate, replacements);
      }
    }
    return localRequire(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context, { filename: absolute });
  return context.exports;
}

function renderHome(posts, { games = [], chronologies = [] } = {}) {
  const replacements = {
    [path.resolve('lib/posts.ts')]: { ...load('lib/posts.ts'), getAllPosts: () => posts },
    [path.resolve('lib/games.ts')]: { getGames: () => games },
    [path.resolve('lib/chronologies.ts')]: { getChronologies: () => chronologies },
  };
  return renderToStaticMarkup(React.createElement(load('app/page.tsx', replacements).default));
}

function post(slug, changes = {}) {
  return {
    slug, visibility: 'public', privateId: '', title: slug, date: '2026-11-01', updatedAt: '',
    updateNote: '', gameSlug: '', description: '', cover: 'https://example.test/cover.jpg',
    tags: [], pinned: false, body: '', audio: '', video: '', attachment: '', ...changes,
  };
}

test('single covered article leads the homepage once without a duplicate feed or daily pick', () => {
  const html = renderHome([post('sample', { title: '示例文章', tags: ['日常'], description: '文章摘要' })]);
  assert.doesNotMatch(html, /博客成就|MILESTONES|achievement|data-daily-pick|PICK UP|主推|精选/);
  assert.match(html, /最新文章/);
  assert.equal((html.match(/data-motion-cover="sample"/g) || []).length, 1);
  assert.equal((html.match(/class="post-card"/g) || []).length, 0);
  assert.equal((html.match(/>示例文章</g) || []).length, 1);
  assert.match(html, /href="\/posts\/sample\/"/);
  assert.match(html, /文章摘要/);
  assert.match(html, /href="\/posts\/\?tag=%E6%97%A5%E5%B8%B8"/);
});

test('homepage renders one latest covered article, three updates and a separate chronological feed', () => {
  const html = renderHome([
    post('old-pinned', { title: '早期置顶文章', date: '2026-01-01', pinned: true }),
    post('newest', { title: '最新带图文章', date: '2026-11-26', description: '最新文章摘要' }),
    post('maintained', { title: '补丁维护记录', date: '2026-02-01', updatedAt: '2026-11-27', updateNote: '修正字幕说明' }),
    post('second', { title: '第二篇新文章', date: '2026-11-25' }),
    post('third', { title: '第三篇新文章', date: '2026-11-24' }),
    post('older', { title: '较早的文章', date: '2026-11-23' }),
  ]);
  assert.match(html, /近期更新/);
  assert.equal((html.match(/class="post-card"/g) || []).length, 2);
  for (const title of ['早期置顶文章', '最新带图文章', '补丁维护记录', '第二篇新文章', '第三篇新文章', '较早的文章']) {
    assert.equal((html.match(new RegExp(`>${title}<`, 'g')) || []).length, 1, `${title} is shown once`);
  }
  assert.match(html, /修正字幕说明/);
  assert.ok(html.indexOf('补丁维护记录') < html.indexOf('第二篇新文章'));
  assert.ok(html.indexOf('第二篇新文章') < html.indexOf('第三篇新文章'));
  assert.ok(html.indexOf('较早的文章') < html.indexOf('早期置顶文章'));
});

test('homepage exposes real tag links and a GET article search', () => {
  const html = renderHome([
    post('translation', { tags: ['汉化', '工具'] }),
    post('tool', { tags: ['工具', '独有标签'] }),
  ]);
  assert.match(html, /<form\b[^>]*action="\/posts\/"/);
  assert.match(html, /<form\b[^>]*method="[gG][eE][tT]"/);
  assert.match(html, /<input\b[^>]*name="q"/);
  for (const tag of ['汉化', '工具', '独有标签']) {
    assert.ok(html.includes(`href="/posts/?tag=${encodeURIComponent(tag)}"`));
  }
  assert.doesNotMatch(html, /href="\/posts\/\?tag=%E6%97%A5%E5%B8%B8"/);
});

test('public locked entries remain readable as listings while unlisted content stays absent', () => {
  const html = renderHome([
    post('public', { title: '公开文章', date: '2026-11-26' }),
    post('locked', { title: '密码文章', visibility: 'password', body: '', date: '2026-11-25' }),
    post('hidden', { title: '隐藏标题', visibility: 'unlisted', description: '隐藏摘要', body: '隐藏正文', tags: ['隐藏标签'] }),
  ]);
  assert.match(html, /href="\/posts\/locked\/"/);
  assert.match(html, /密码/);
  assert.match(html, /全部 2 篇文章/);
  assert.doesNotMatch(html, /隐藏标题|隐藏摘要|隐藏正文|隐藏标签|\/posts\/hidden\//);
});

test('game and chronology entry cards use loaded records instead of hardcoded examples', () => {
  const game = {
    id: 'test-game', slug: 'test-game', title: '实际游戏档案', status: '', summary: '',
    metadata: { id: 'test-game', title: '实际游戏档案', localizedName: '实际游戏档案', originalName: '', alternativeNames: [], description: '', releaseDate: '2026-01-01', developers: [], publishers: [], platforms: [], selectedPlatforms: [], genres: [], cover: 'https://example.test/game.jpg', screenshots: [], website: '', sources: {}, fieldSources: {}, updatedAt: '' },
    screenshots: [], manual: { officialStores: [], availabilityStatus: 'unknown', notes: '' }, platforms: [], events: [], projects: [],
  };
  const chronology = { id: 'test-timeline', title: '实际系列时间线', description: '时间线介绍', calendarNote: '', works: [], eras: [], sources: [], events: [], cover: { src: 'https://example.test/timeline.jpg', alt: '时间线封面', width: 800, height: 450, works: [], spoilerWorks: [] } };
  const html = renderHome([], { games: [game], chronologies: [chronology] });
  assert.match(html, /href="\/games\/test-game\/"/);
  assert.match(html, /实际游戏档案/);
  assert.match(html, /href="\/chronicles\/test-timeline\/"/);
  assert.match(html, /实际系列时间线/);
});

test('empty home retains its empty state without achievements or daily pick', () => {
  const html = renderHome([]);
  assert.match(html, /文章即将发布/);
  assert.doesNotMatch(html, /博客成就|MILESTONES|achievement|data-daily-pick|post-card/);
});

test('blog achievement component and CSS are removed while game dark styles remain', () => {
  assert.equal(fs.existsSync('app/achievements.tsx'), false);
  const css = fs.readFileSync('app/style.css', 'utf8');
  assert.doesNotMatch(css, /\.achievements?\b/);
  assert.match(css, /:root\[data-theme="dark"\] \.game-shelf-item,:root\[data-theme="dark"\] \.game-timeline,:root\[data-theme="dark"\] \.game-related\{background:#1c2027/);
});
