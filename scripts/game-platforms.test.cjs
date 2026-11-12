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
  assert.deepEqual(platforms.normalizePlatformList(['Microsoft Xbox Series X', 'Xbox Series S']), ['Xbox Series X|S']);
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
  assert.ok(html.indexOf('game-platforms.js') < html.indexOf('game-dossier.js'));
});

function readDossiers(files) {
  const fakeFs = { existsSync: () => true, readdirSync: () => Object.keys(files), readFileSync: file => files[path.basename(file)] };
  const code = ts.transpileModule(fs.readFileSync('lib/games.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const context = { exports: {}, process, URL, Date, require: name => name === 'node:fs' ? fakeFs
    : name === '../public/sveltia/game-platforms.js' ? platforms : name === './game-time' ? { normalizePlayTime: () => null, normalizeCompletionTimes: () => null, normalizePersonalRating: () => null } : name === './game-projects' ? { normalizeProjects: () => [] } : name === './game-status' ? { normalizeGameStatus: value => value || '' } : require(name) };
  vm.runInNewContext(code, context);
  return context.exports.getGames();
}

test('saved legacy dossier platforms normalize and deduplicate without rewriting source files', () => {
  const files = {
    'one.md': '---\ntitle: RAWG record\ngameMetadata:\n  platforms: [PC]\n  selectedPlatforms: [PC]\n---\n',
    'two.md': '---\ntitle: ScreenScraper record\ngameMetadata:\n  platforms: [PC Windows]\n  selectedPlatforms: [PC Windows]\n---\n',
    'three.md': '---\ntitle: Retro record\ngameMetadata:\n  platforms: [Super Nintendo, SNES]\n  selectedPlatforms: [Super Nintendo, SNES]\n---\n',
    'four.md': '---\ntitle: Manual record\nplatforms:\n  - platformChoice: {family: pc, platform: PC Windows}\n  - platformChoice: {family: pc, platform: PC}\n---\n',
  };
  const games = readDossiers(files);
  const options = [...new Set(games.flatMap(game => game.platforms.map(p => `${p.store}:${p.platform}`)))].sort();
  assert.deepEqual(options, ['nintendo:SNES', 'pc:PC']);
  assert.ok(games.every(game => game.platforms.length === 1));
  assert.ok(files['two.md'].includes('PC Windows')); // Read-time compatibility, not a data migration.
});

test('TheGamesDB grouped public cards use each selected platform date and link without overriding manual dates', () => {
  const yaml = `---
title: Fixture
gameMetadata:
  releaseDate: '2011-04-19'
  platforms: [PC, PlayStation 5, Xbox Series X|S]
  selectedPlatforms: [PC, PS5]
  fieldSources: {releaseDate: thegamesdb}
  sources:
    thegamesdb:
      id: '35'
      url: https://thegamesdb.net/game.php?id=35
      versions:
        - {id: '35', platform: PC, releaseDate: '2011-04-19'}
        - {id: '53', platform: PlayStation 5, releaseDate: '2012-06-30'}
---
`;
  const games = readDossiers({ 'catalog.md': yaml, 'manual.md': yaml.replace('releaseDate: thegamesdb', 'releaseDate: manual') });
  const [pc, ps] = games.find(game => game.slug === 'catalog').platforms;
  assert.equal(games.find(game => game.slug === 'catalog').platforms.length, 2);
  assert.equal(pc.releaseDate, '2011-04-19');
  assert.equal(pc.catalogSourceLinks[0].url, 'https://thegamesdb.net/game.php?id=35');
  assert.equal(ps.releaseDate, '2012-06-30');
  assert.equal(ps.catalogSourceLinks[0].url, 'https://thegamesdb.net/game.php?id=53');
  assert.equal(games.find(game => game.slug === 'manual').platforms[1].releaseDate, '2011-04-19');
});

test('CMS refresh preserves a legacy platform selection when a provider returns its alias', async () => {
  const fields = {};
  const window = { GamePlatforms: platforms, h: () => null, createClass: x => x, CMS: {
    getFieldType: () => ({ control: () => null }), registerEditorComponent: () => {}, registerFieldType: (name, field) => { fields[name] = field; },
  } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/game-dossier.js', 'utf8'), { window, fetch: async () => Response.json({
    id: 'screenscraper:1', title: 'Example', platforms: ['PC'], sources: { screenscraper: { id: '1', systemId: '135' } },
  }) });
  let changed;
  const field = fields['game-metadata'];
  const instance = { ...field, state: field.getInitialState(), props: { value: { id: 'old', platforms: ['PC Windows'], selectedPlatforms: ['PC Windows'], sources: { screenscraper: { id: '1', systemId: '135' } } }, onChange: x => { changed = x; } }, setState(x) { Object.assign(this.state, x); } };
  await instance.selectGame({ title: 'Example' }, true);
  assert.equal(changed, undefined);
  instance.applyRefresh();
  assert.deepEqual([...changed.platforms], ['PC']);
  assert.deepEqual([...changed.selectedPlatforms], ['PC']);
});

test('platform-scoped source uses its own official date and never links another platform record', () => {
  const yaml = `---
title: Fixture
gameMetadata:
  releaseDate: '2021-02-02'
  platforms: [PlayStation 4, PlayStation 5]
  selectedPlatforms: [PlayStation 4, PS5]
  sources:
    thegamesdb:
      id: '35'
      url: https://thegamesdb.net/game.php?id=35
      versions:
        - {id: '35', platform: PlayStation 4, releaseDate: '2021-02-02'}
    screenscraper:
      id: '53'
      systemId: '284'
      platformRelease: {platform: PlayStation 5, releaseDate: '2023-05-09', region: US, evidence: 'https://publisher.example/release'}
---
`;
  const [ps4, ps5] = readDossiers({ 'scoped.md': yaml })[0].platforms;
  assert.equal(ps4.releaseDate, '2021-02-02');
  assert.deepEqual(Array.from(ps4.catalogSourceLinks,x=>x.source), ['thegamesdb']);
  assert.equal(ps5.releaseDate, '2023-05-09');
  assert.equal(ps5.releaseRegion, 'US');
  assert.deepEqual(JSON.parse(JSON.stringify(ps5.catalogSourceLinks)), [
    {source:'screenscraper',url:'https://www.screenscraper.fr/index.php?gameid=53&plateforme=284'},
    {source:'officialRelease',url:'https://publisher.example/release'},
  ]);
});
