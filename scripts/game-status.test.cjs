const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const matter = require('gray-matter');
const yaml = require('js-yaml');

const code = ts.transpileModule(fs.readFileSync('lib/game-status.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(code, context);
const { gameStatuses, normalizeGameStatus, normalizeGameStatuses, matchesGameStatus } = context.exports;

test('CMS and runtime use the same seven multi-select states', () => {
  const config = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8'));
  const field = config.collections.flatMap(collection => collection.fields || []).find(field => field.name === 'status');
  assert.equal(field.widget, 'select');
  assert.deepEqual(field.default, ['想玩']);
  assert.equal(field.multiple, true);
  assert.equal(field.min, 1);
  assert.deepEqual(field.options, Array.from(gameStatuses));
  assert.deepEqual(Array.from(gameStatuses), ['想玩', '正在玩', '已通关', '暂时搁置', 'AFK', '考虑制作补丁', '已制作补丁']);
  for (const state of gameStatuses) assert.equal(normalizeGameStatus(state), state);
});

test('legacy composite statuses normalize without inventing dated events', () => {
  assert.equal(normalizeGameStatus('已通关、已发布汉化补丁'), '已通关、已制作补丁');
  assert.equal(normalizeGameStatus('已弃玩'), 'AFK');
  assert.equal(normalizeGameStatus('已弃坑'), 'AFK');
  assert.equal(normalizeGameStatus('afk'), 'AFK');
  assert.equal(normalizeGameStatus('已制作补丁'), '已制作补丁');
  assert.equal(normalizeGameStatus('搁置'), '暂时搁置');
  assert.equal(normalizeGameStatus(undefined), '想玩');
});

test('saved dossiers use allowed states and retain patch-release timeline entries', () => {
  for (const file of fs.readdirSync('content/games').filter(file => file.endsWith('.md'))) {
    const { data } = matter(fs.readFileSync(`content/games/${file}`, 'utf8'));
    assert.ok(Array.isArray(data.status) && data.status.length > 0 && data.status.every(status => gameStatuses.includes(status)), `${file}: ${data.status}`);
    if (file.startsWith('bloodrayne')) assert.ok(data.events.some(event => event.title === '已发布汉化补丁'));
  }
});

test('multiple statuses deduplicate and all selected states match archive filters', () => {
  const selected = ['已制作补丁', '已通关', '已通关'];
  assert.deepEqual(Array.from(normalizeGameStatuses(selected)), ['已通关', '已制作补丁']);
  assert.equal(normalizeGameStatus(selected), '已通关、已制作补丁');
  assert.equal(matchesGameStatus(selected, '已通关'), true);
  assert.equal(matchesGameStatus(selected, '已制作补丁'), true);
  assert.equal(matchesGameStatus(selected, '正在玩'), false);
  assert.equal(matchesGameStatus(selected, 'all'), true);
  assert.equal(matchesGameStatus(normalizeGameStatus(selected), '已制作补丁'), true);
  assert.equal(normalizeGameStatus(['已弃坑', '考虑制作补丁']), 'AFK、考虑制作补丁');
  assert.equal(normalizeGameStatus([]), '想玩');
  assert.equal(normalizeGameStatus(['unknown']), '想玩');
});