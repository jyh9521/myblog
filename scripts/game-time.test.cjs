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
  const source = '---\ntitle: Test fixture\nplayTime: {hours: 12, minutes: 30}\nhltb: {url: "https://howlongtobeat.com/game/10270", main: 25.5}\n---\n';
  const games = load('lib/games.ts', {
    'node:fs': { existsSync: () => true, readdirSync: () => ['fixture.md'], readFileSync: () => source },
    './game-time': time,
    './game-projects': { normalizeProjects: () => [] },
    './game-status': { normalizeGameStatus: () => '想玩' },
    '../public/sveltia/game-platforms.js': require('../public/sveltia/game-platforms.js'),
  }).getGames();
  assert.equal(games[0].playTime.totalMinutes, 750);
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
  assert.equal(hltb.fields.length, 4);
  assert.equal(hltb.required, false);
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
