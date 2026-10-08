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
  assert.equal(personal.fields[0].value_type, 'int');
  const hltb = fields.find(f => f.name === 'hltb');
  assert.equal(hltb.widget, 'hltb-game');
  assert.equal(hltb.required, false);
  const rating = fields.find(f => f.name === 'personalRating');
  assert.equal(rating.widget, 'number'); assert.equal(rating.value_type, 'float');
  assert.equal(rating.min, 0); assert.equal(rating.max, 10); assert.equal(rating.step, 0.01); assert.equal(rating.required, false);
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
