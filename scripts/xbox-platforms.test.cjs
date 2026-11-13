const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlatformList } = require('../public/sveltia/game-platforms.js');

test('Xbox Series aliases deduplicate while Xbox One stays separate', () => {
  assert.deepEqual(normalizePlatformList([
    'Xbox Series X|S', 'Xbox Series S/X', 'Microsoft Xbox Series S | X',
    'Microsoft Xbox Series X/S', 'Xbox One',
  ]), ['Xbox Series X|S', 'Xbox One']);
});

test('RAWG and ScreenScraper normalize incoming Xbox Series labels', async () => {
  const { normalizeRawgGame, normalizeScreenScraperGame } = await import('../workers/ns-counter/src/game-providers.js');
  const rawg = normalizeRawgGame({id: 1, name: 'Hi-Fi Rush', platforms: [
    {platform: {name: 'Xbox Series S/X'}, released_at: '2023-01-25'},
    {platform: {name: 'Xbox Series X|S'}},
  ]});
  const screen = normalizeScreenScraperGame({id: 2, systeme: {id: 1, text: 'Xbox Series S/X'}});
  assert.deepEqual(rawg.platforms, ['Xbox Series X|S']);
  assert.deepEqual(screen.platforms, ['Xbox Series X|S']);
});
