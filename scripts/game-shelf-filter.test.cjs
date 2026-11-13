const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('game shelf exposes one platform filter, the dropdown', () => {
  const shelf = readFileSync(process.env.SHELF_SOURCE || 'app/games/game-shelf.tsx', 'utf8');
  assert.doesNotMatch(shelf, /m3-platform-row|quickPlatforms/, 'duplicate platform shortcut row');
  assert.equal([...shelf.matchAll(/select\('平台', platformFilter, platformOptions, value => update\('platform', value\)\)/g)].length, 1);
});

test('removed genre filter is ignored and stripped from old links', () => {
  const { runInNewContext } = require('node:vm');
  const ts = require('typescript');
  const context = { exports: {}, URLSearchParams };
  runInNewContext(ts.transpileModule(readFileSync('lib/game-shelf-state.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  const params = new URLSearchParams('genre=RPG&year=2024&ref=bookmark');
  const state = context.exports.readShelfState(params);
  assert.equal(state.genre, undefined);
  assert.equal(state.year, '2024');
  assert.equal(context.exports.writeShelfState(state, params).toString(), 'year=2024&ref=bookmark');
  assert.doesNotMatch(readFileSync(process.env.SHELF_SOURCE || 'app/games/game-shelf.tsx', 'utf8'), /genreFilter|select\('类型'/);
});
