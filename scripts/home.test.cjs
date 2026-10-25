const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function renderHome(posts) {
  const context = { exports: {}, require(name) {
    if (name === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name === '../lib/posts') return { getAllPosts: () => posts, hasLocalAsset: () => false };
    if (name === './site-enhancements') return { DailyPick: ({ items }) => React.createElement('aside', { 'data-daily-pick': true }, items.map(item => React.createElement('a', { key: item.href, href: item.href }, item.title))) };
    return require(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/page.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, context);
  return renderToStaticMarkup(React.createElement(context.exports.default));
}

test('home retains articles and daily pick without blog achievements', () => {
  const html = renderHome([{ slug: 'sample', title: '示例文章', date: '2026-01-01', tags: ['日常'], description: '文章摘要' }]);
  assert.doesNotMatch(html, /博客成就|MILESTONES|achievement/);
  assert.match(html, /好奇心/);
  assert.match(html, /最新文章/);
  assert.match(html, /共 1 篇/);
  assert.match(html, /data-daily-pick="true"/);
  assert.equal((html.match(/class="post-card"/g) || []).length, 1);
  assert.match(html, /href="\/posts\/sample\/"/);
  assert.match(html, /文章摘要/);
  assert.match(html, /href="\/posts\/\?tag=/);
});

test('empty home retains its empty state without achievements or daily pick', () => {
  const html = renderHome([]);
  assert.match(html, /最新文章/);
  assert.match(html, /文章即将发布/);
  assert.doesNotMatch(html, /博客成就|MILESTONES|achievement|data-daily-pick|post-card/);
});

test('blog achievement component and CSS are removed while game dark styles remain', () => {
  assert.equal(fs.existsSync('app/achievements.tsx'), false);
  const css = fs.readFileSync('app/style.css', 'utf8');
  assert.doesNotMatch(css, /\.achievements?\b/);
  assert.match(css, /:root\[data-theme="dark"\] \.game-shelf-item,:root\[data-theme="dark"\] \.game-timeline,:root\[data-theme="dark"\] \.game-related\{background:#1c2027/);
});
