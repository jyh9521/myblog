const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const platforms = require('../public/sveltia/game-platforms.js');

test('platform aliases collapse equivalent provider labels but preserve distinct systems', () => {
  assert.deepEqual(platforms.normalizePlatformList(['PC', 'PC Windows', 'Windows', 'PC (Microsoft Windows)']), ['PC']);
  assert.deepEqual(platforms.normalizePlatformList(['PS2', 'PlayStation 2', 'PS5', 'Sony PlayStation 5']), ['PlayStation 2', 'PlayStation 5']);
  assert.deepEqual(platforms.normalizePlatformList(['Super Nintendo', 'SNES', 'Super Famicom', 'Super Nintendo MSU-1']), ['SNES', 'SNES MSU-1']);
  assert.deepEqual(platforms.normalizePlatformList(['Windows', 'Mac OS X', 'Linux', 'MS-DOS', 'PC-98', 'Unknown future console']), ['PC', 'macOS', 'Linux', 'DOS', 'PC-98', 'Unknown future console']);
  for (const name of ['NES', 'SNES', 'Super Nintendo', 'NDS', 'GBA']) assert.equal(platforms.platformFamily(name), 'nintendo');
});

test('browser catalog uses the same canonical names as server/provider imports', () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync('public/sveltia/game-platforms.js', 'utf8'), browser);
  assert.equal(browser.GamePlatforms.normalizePlatform('PC Windows'), 'PC');
  assert.equal(browser.GamePlatforms.normalizePlatform('Super Nintendo'), 'SNES');
  const html = fs.readFileSync('public/sveltia/index.html', 'utf8');
  assert.ok(html.indexOf('game-platforms.js') < html.indexOf('custom.js'));
});

test('saved legacy dossier platforms normalize and deduplicate without rewriting source files', () => {
  const files = {
    'one.md': '---\ntitle: RAWG record\ngameMetadata:\n  platforms: [PC]\n  selectedPlatforms: [PC]\n---\n',
    'two.md': '---\ntitle: ScreenScraper record\ngameMetadata:\n  platforms: [PC Windows]\n  selectedPlatforms: [PC Windows]\n---\n',
    'three.md': '---\ntitle: Retro record\ngameMetadata:\n  platforms: [Super Nintendo, SNES]\n  selectedPlatforms: [Super Nintendo, SNES]\n---\n',
    'four.md': '---\ntitle: Manual record\nplatforms:\n  - platformChoice: {family: pc, platform: PC Windows}\n  - platformChoice: {family: pc, platform: PC}\n---\n',
  };
  const fakeFs = { existsSync: () => true, readdirSync: () => Object.keys(files), readFileSync: file => files[path.basename(file)] };
  const code = ts.transpileModule(fs.readFileSync('lib/games.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const context = { exports: {}, process, URL, require: name => name === 'node:fs' ? fakeFs
    : name === '../public/sveltia/game-platforms.js' ? platforms : name === './game-time' ? { normalizePlayTime: () => null, normalizeCompletionTimes: () => null, normalizePersonalRating: () => null } : name === './game-projects' ? { normalizeProjects: () => [] } : name === './game-status' ? { normalizeGameStatus: value => value || '' } : require(name) };
  vm.runInNewContext(code, context);
  const games = context.exports.getGames();
  const options = [...new Set(games.flatMap(game => game.platforms.map(p => `${p.store}:${p.platform}`)))].sort();
  assert.deepEqual(options, ['nintendo:SNES', 'pc:PC']);
  assert.ok(games.every(game => game.platforms.length === 1));
  assert.ok(files['two.md'].includes('PC Windows')); // Read-time compatibility, not a data migration.
});

test('CMS refresh preserves a legacy platform selection when a provider returns its alias', async () => {
  const fields = {};
  const window = { GamePlatforms: platforms, h: () => null, createClass: x => x, CMS: {
    getFieldType: () => ({ control: () => null }), registerEditorComponent: () => {}, registerFieldType: (name, field) => { fields[name] = field; },
  } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js', 'utf8'), { window, fetch: async () => Response.json({
    id: 'screenscraper:1', title: 'Example', platforms: ['PC'], sources: { screenscraper: { id: '1', systemId: '135' } },
  }) });
  let changed;
  const field = fields['game-metadata'];
  const instance = { ...field, state: field.getInitialState(), props: { value: { id: 'old', platforms: ['PC Windows'], selectedPlatforms: ['PC Windows'], sources: {} }, onChange: x => { changed = x; } }, setState(x) { Object.assign(this.state, x); } };
  await instance.selectGame({ title: 'Example' }, true);
  assert.equal(changed, undefined);
  instance.applyRefresh();
  assert.deepEqual([...changed.platforms], ['PC']);
  assert.deepEqual([...changed.selectedPlatforms], ['PC']);
});
