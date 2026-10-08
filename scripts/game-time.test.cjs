const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const yaml = require('js-yaml');
function load(file, imports = {}) {
  const context = { exports: {}, URL, process, require: name => imports[name] || require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
const time = load('lib/game-time.ts');
test('personal records and HLTB estimates render in separate named groups', () => {
  const React = require('react');
  const Component = load('app/games/game-time.tsx', { '../../lib/game-time': time }).default;
  const render = game => require('react-dom/server').renderToStaticMarkup(React.createElement(Component, { game }));
  const html = render({ playTime: time.normalizePlayTime({ hours: 4 }), personalRating: time.normalizePersonalRating(6.5), completionTimes: time.normalizeCompletionTimes({ url: 'https://howlongtobeat.com/game/1', main: 3.8, extras: 4.6, completionist: 4.9 }) });
  const personal = html.slice(html.indexOf('game-time-personal-heading'), html.indexOf('class="game-time-group game-time-reference"'));
  const reference = html.slice(html.indexOf('class="game-time-group game-time-reference"'));
  assert.match(personal, /我的记录/); assert.match(personal, /4\.0/); assert.match(personal, /6\.50/);
  assert.doesNotMatch(personal, /主线参考时间|全收集参考时间/);
  for (const value of ['3.8', '4.6', '4.9']) assert.ok(reference.includes(value));
  assert.doesNotMatch(reference, /我的评分|我的游玩时长/);
  assert.doesNotMatch(render({ completionTimes: time.normalizeCompletionTimes({ url: 'https://howlongtobeat.com/game/1', main: 3.8 }) }), /我的记录/);
  assert.doesNotMatch(render({ playTime: time.normalizePlayTime({ hours: 4 }) }), /参考通关时间/);
  const css = fs.readFileSync('app/style.css', 'utf8');
  assert.match(css, /\.game-time-personal-grid\{grid-template-columns:repeat\(2/);
  assert.match(css, /\.game-time-reference-grid\{grid-template-columns:repeat\(3/);
});
test('dossier summary renders GFM and line breaks, with safe external links', async () => {
  const React = require('react');
  const markdown = await import('react-markdown');
  const gfm = await import('remark-gfm');
  const breaks = await import('remark-breaks');
  const Component = load('app/games/game-summary.tsx', {
    'react-markdown': markdown.default, 'remark-gfm': gfm.default, 'remark-breaks': breaks.default,
    '../../lib/external-links': load('lib/external-links.ts'),
  }).default;
  const render = summary => require('react-dom/server').renderToStaticMarkup(React.createElement(Component, { summary }));
  const html = render('## 简介\n\n**加粗**和*斜体*\n下一行\n\n- 列表\n\n~~删除~~\n\n[外链](https://example.com) [内链](/games/)\n\n| 项目 | 数值 |\n| --- | --- |\n| 时间 | 4 |\n\n<script>alert(1)</script>');
  for (const tag of ['h2', 'strong', 'em', 'br', 'ul', 'del', 'table']) assert.match(html, new RegExp('<' + tag + '[ >/]'));
  assert.match(html, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\/games\/">内链/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(render('  '), '');
  assert.match(render('Plain text'), /<p>Plain text<\/p>/);
  assert.match(fs.readFileSync('app/games/[slug]/page.tsx', 'utf8'), /<GameSummary summary=\{game.summary\}/);
});
test('personal time preserves minutes and rounds only for display', () => {
  assert.equal(time.normalizePlayTime({ hours: 12, minutes: 30 }).totalMinutes, 750);
  assert.equal(time.formatPlayHours(750), '12.5');
  assert.equal(time.formatPlayHours(61), '1.0');
  assert.equal(time.formatPlayHours(119), '2.0');
  assert.equal(time.normalizePlayTime({ minutes: '45' }).hours, 0);
  assert.equal(time.normalizePlayTime({ hours: 0, minutes: 0 }).totalMinutes, 0);
  assert.equal(time.normalizePlayTime({ hours: null, minutes: 30 }).totalMinutes, 30);
  assert.equal(time.normalizePlayTime({ hours: ' ' }), null);
  for (const input of [undefined, {}, { hours: '' }, { hours: -1 }, { minutes: 60 }, { minutes: 1.5 }, { hours: Infinity }, { hours: 'bad' }, { hours: 1, minutes: -1 }]) assert.equal(time.normalizePlayTime(input), null);
});
test('saved dossier fields flow into frontend records without modifying source', () => {
  const source = '---\ntitle: Test fixture\npersonalRating: 8.12\nplayTime: {hours: 12, minutes: 30}\nhltb: {url: "https://howlongtobeat.com/game/10270", main: 25.5}\n---\n';
  const games = load('lib/games.ts', {
    'node:fs': { existsSync: () => true, readdirSync: () => ['fixture.md'], readFileSync: () => source },
    './game-time': time,
    './game-projects': { normalizeProjects: () => [] },
    './game-status': { normalizeGameStatus: () => '想玩' },
    '../public/sveltia/game-platforms.js': require('../public/sveltia/game-platforms.js'),
  }).getGames();
  assert.equal(games[0].playTime.totalMinutes, 750);
  assert.equal(games[0].personalRating.score, 8.12);
  assert.equal(games[0].personalRating.percent, 81.2);
  assert.equal(games[0].completionTimes.main, 25.5);
  assert.equal(games[0].completionTimes.url, 'https://howlongtobeat.com/game/10270');
});
test('HLTB accepts only verified game URL shapes and positive reference times', () => {
  const result = time.normalizeCompletionTimes({ url: 'https://www.howlongtobeat.com/game.php?id=10270', main: '25.5', extras: 0, completionist: -1 });
  assert.equal(result.url, 'https://howlongtobeat.com/game/10270');
  assert.equal(result.main, 25.5);
  assert.equal(result.extras, undefined);
  assert.equal(result.completionist, undefined);
  for (const url of ['javascript:alert(1)', 'https://howlongtobeat.com.evil.test/game/1', 'https://evil.test/game/1', 'http://howlongtobeat.com/game/1', 'https://me:pw@howlongtobeat.com/game/1', 'https://howlongtobeat.com/game/0', 'https://howlongtobeat.com/']) assert.equal(time.normalizeCompletionTimes({ url, main: 20 }), null);
  assert.equal(time.normalizeCompletionTimes({ main: 20 }), null);
});
test('CMS uses optional independent fields with integer minute bounds', () => {
  const fields = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8')).collections.find(c => c.name === 'games').fields;
  const personal = fields.find(f => f.name === 'playTime');
  assert.equal(personal.required, false);
  assert.equal(personal.fields[1].max, 59);
  assert.equal(personal.fields[0].value_type, 'float');
  assert.equal(personal.fields[1].value_type, 'int');
  const hltb = fields.find(f => f.name === 'hltb');
  assert.equal(hltb.widget, 'hltb-game');
  assert.equal(hltb.required, false);
  const rating = fields.find(f => f.name === 'personalRating');
  assert.equal(rating.widget, 'number'); assert.equal(rating.value_type, 'float');
  assert.equal(rating.min, 0); assert.equal(rating.max, 10); assert.equal(rating.step, 0.01); assert.equal(rating.required, false);
});
test('fractional hours are preserved and combine with optional integer minutes', () => {
  for (const hours of [3.8, '3.8']) {
    const result = time.normalizePlayTime({ hours });
    assert.equal(result.hours, 3.8); assert.equal(result.minutes, 0);
    assert.equal(time.formatPlayHours(result.totalMinutes), '3.8');
  }
  assert.equal(time.normalizePlayTime({ hours: 3.75 }).totalMinutes, 225);
  assert.equal(time.formatPlayHours(time.normalizePlayTime({ hours: 3.8, minutes: 12 }).totalMinutes), '4.0');
  assert.ok(time.normalizePlayTime({ hours: 0.001 }).totalMinutes > 0);
  assert.equal(time.normalizePlayTime({ hours: Number.MAX_VALUE }), null);
  assert.equal(time.normalizePlayTime({ hours: 3.8, minutes: 0.5 }), null);
  const React = require('react');
  const Component = load('app/games/game-time.tsx', { '../../lib/game-time': time }).default;
  const html = require('react-dom/server').renderToStaticMarkup(React.createElement(Component, { game: { playTime: time.normalizePlayTime({ hours: 3.8 }) } }));
  assert.match(html, /3\.8/); assert.match(html, /我的游玩时长/);
});
test('personal ratings round to hundredths and convert into exact tenths of a percent', () => {
  for (const [input, score, percent] of [[8, 8, 80], ['8.12', 8.12, 81.2], [7.99, 7.99, 79.9], [8.125, 8.13, 81.3], [0, 0, 0], [10, 10, 100]]) {
    const rating = time.normalizePersonalRating(input);
    assert.equal(rating.score, score); assert.equal(rating.percent, percent);
  }
  for (const input of [undefined, null, '', ' ', -1, 10.01, Infinity, NaN, true, {}, 'invalid']) assert.equal(time.normalizePersonalRating(input), null);
});
test('rating-only dossiers render two decimals, an accessible percentage meter, and no invented playtime', () => {
  const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  const Component = load('app/games/game-time.tsx', { '../../lib/game-time': time }).default;
  const render = score => renderToStaticMarkup(React.createElement(Component, { game: { personalRating: time.normalizePersonalRating(score) } }));
  assert.equal(render(undefined), '');
  assert.match(render(8), /8\.00/); assert.match(render(8), /80%/); assert.match(render(8), /aria-valuenow="80"/);
  assert.match(render(8.12), /81\.2%/); assert.match(render(0), /0\.00/); assert.match(render(10), /10\.00/);
  assert.doesNotMatch(render(8), /我的游玩时长|参考时间|HowLongToBeat/);
  assert.match(render(8), /不是玩家群体好评率/);
});
test('content validation accepts blank and bounded personal ratings but rejects invalid scores', async () => {
  const path = require('node:path'); const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-rating-'));
  try {
    fs.mkdirSync(path.join(root, 'public/sveltia'), { recursive: true });
    fs.mkdirSync(path.join(root, 'content/games'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public/sveltia/config.yml'), 'backend: {name: github, repo: jyh9521/myblog, branch: main}\ncollections: []\n');
    const { validateRepository } = require('./validate-content.cjs');
    for (const [score, valid] of [[0, true], [8.12, true], [10, true], ['', true], [null, true], [10.01, false], [-1, false], [true, false], ['invalid', false]]) {
      fs.writeFileSync(path.join(root, 'content/games/test.md'), `---\ntitle: Test\npersonalRating: ${JSON.stringify(score)}\n---\n`);
      assert.equal((await validateRepository(root)).errors.length === 0, valid);
    }
  } finally {
    const resolved = fs.realpathSync(root);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep + 'personal-rating-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
test('automatic snapshot is ID-bound and never replaces manual override', () => {
  const data = time.normalizeCompletionTimes({ url: 'https://howlongtobeat.com/game/68151', main: 55, snapshot: { id: 68151, main: 60.12, updatedAt: '2026-10-08T00:00:00Z' } });
  assert.equal(data.id, 68151); assert.equal(data.main, 55); assert.equal(data.snapshot.main, 60.12); assert.equal(data.auto, true);
  assert.equal(time.normalizeCompletionTimes({ url: data.url, snapshot: { id: 1, main: 60, updatedAt: '2026-10-08T00:00:00Z' } }).snapshot, undefined);
  const React = require('react');
  const html = require('react-dom/server').renderToStaticMarkup(React.createElement(load('app/games/game-time.tsx', { '../../lib/game-time': time }).default, { game: { completionTimes: data } }));
  assert.match(html, /55\.0/); assert.doesNotMatch(html, /60\.1/);
});
test('detail UI hides absent values, renders decimal hours and safe source link', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Component = load('app/games/game-time.tsx', { '../../lib/game-time': time }).default;
  assert.equal(renderToStaticMarkup(React.createElement(Component, { game: {} })), '');
  const html = renderToStaticMarkup(React.createElement(Component, { game: { playTime: time.normalizePlayTime({ hours: 12, minutes: 30 }), completionTimes: time.normalizeCompletionTimes({ url: 'https://howlongtobeat.com/game/10270', main: 25 }) } }));
  assert.match(html, /12\.5/);
  assert.match(html, /25\.0/);
  assert.match(html, /noopener noreferrer/);
  assert.match(html, /手动记录/);
  assert.doesNotMatch(html, /全收集参考时间/);
});
