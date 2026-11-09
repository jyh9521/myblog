import test from 'node:test';
import assert from 'node:assert/strict';
import { areSameGame, combineCandidates, mergeMetadata, normalizeRawgGame, normalizeScreenScraperGame, ScreenScraperProvider, screenScraperMedia } from './game-providers.js';

test('RAWG records are normalized without leaking provider field shape', () => {
  const game = normalizeRawgGame({
    id: 42, slug: 'resident-evil-2', name: 'Resident Evil 2', name_original: 'Biohazard 2', released: '1998-01-21',
    description_raw: 'A survival horror game.', developers: [{ name: 'Capcom' }],
    publishers: [{ name: 'Capcom' }], platforms: [{ platform: { name: 'PlayStation' } }],
    genres: [{ name: 'Action' }], background_image: 'https://example.test/cover.jpg', website: 'https://example.test',
    short_screenshots: [{ id: 1, image: 'https://example.test/screenshot.jpg' }],
  });
  assert.equal(game.id, 'rawg:42');
  assert.equal(game.originalName, 'Biohazard 2');
  assert.deepEqual(game.platforms, ['PlayStation']);
  assert.deepEqual(game.developers, ['Capcom']);
  assert.equal(game.cover, 'https://example.test/cover.jpg');
  assert.deepEqual(game.screenshots, ['https://example.test/screenshot.jpg']);
  assert.equal(game.sources.rawg.id, '42');
  assert.equal(game.sources.rawg.url, 'https://rawg.io/games/42');
});

test('ScreenScraper names, synopsis, dates, credits and media normalize from API shape', () => {
  const game = normalizeScreenScraperGame({
    id: 123, nom: 'Biohazard 2',
    noms: { nom_cn: '生化危机 2', nom_jp: 'バイオハザード2', nom_us: 'Resident Evil 2' },
    dates: { date_jp: '1998-01-29', date_us: '1998-01-21' },
    developpeur: 'Capcom', editeur: 'Capcom',
    synopsis: { synopsis_zhcn: '中文简介', synopsis_en: 'English synopsis' },
    medias: { media_box2d: [{ url: 'https://example.test/box.png' }], media_screenshot: [{ url: 'https://example.test/shot.png' }] },
    systeme: { id: '1', nom: 'PlayStation' },
  });
  assert.equal(game.title, '生化危机 2');
  assert.equal(game.localizedName, '生化危机 2');
  assert.equal(game.originalName, 'Biohazard 2');
  assert.equal(game.description, '中文简介');
  assert.equal(game.cover, 'https://example.test/box.png');
  assert.deepEqual(game.screenshots, ['https://example.test/shot.png']);
  assert.deepEqual(game.platforms, ['PlayStation']);
  assert.equal(game.sources.screenscraper.systemId, '1');
  assert.equal(game.sources.screenscraper.url, 'https://www.screenscraper.fr/index.php?gameid=123&plateforme=1');
});

test('same-title localized/alias records merge, but different release years stay distinct', () => {
  const rawg = normalizeRawgGame({ id: 1, name: 'Resident Evil 2', name_original: 'Resident Evil 2', released: '1998-01-21', platforms: [{ platform: { name: 'PlayStation' } }] });
  const ss = normalizeScreenScraperGame({ id: 9, nom: 'Biohazard 2', noms: { nom_jp: 'バイオハザード2', nom_cn: '生化危机 2' }, dates: { date: '1998-01-29' }, systeme: { id: 1, nom: 'PlayStation' }, developpeur: 'Capcom' });
  assert.equal(areSameGame(rawg, ss), true);
  const merged = combineCandidates([rawg], [ss]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.rawg.id, '1');
  assert.equal(merged[0].sources.screenscraper.id, '9');
  assert.equal(merged[0].localizedName, '生化危机 2');

  const remake = { ...ss, releaseDate: '2019-01-25' };
  assert.equal(areSameGame(rawg, remake), false);
  assert.equal(combineCandidates([rawg], [remake]).length, 2);
});

test('secondary provider fills missing fields but does not replace primary data', () => {
  const primary = { title: 'Example', localizedName: '', cover: '', description: 'Existing', sources: { rawg: { id: '1' } }, fieldSources: {} };
  const secondary = { title: '例子', localizedName: '例子', cover: 'cover', description: 'Replacement', sources: { screenscraper: { id: '2' } }, fieldSources: {} };
  const result = mergeMetadata(primary, secondary);
  assert.equal(result.localizedName, '例子');
  assert.equal(result.cover, 'cover');
  assert.equal(result.description, 'Existing');
  assert.equal(result.fieldSources.cover, 'screenscraper');
});

test('ScreenScraper search accepts its wrapped JSON list response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ response: { jeux: { jeu: [
    { id: '7', nom: 'Example', systeme: { id: '1', nom: 'PC-98' }, dates: { date_jp: '1992-01-01' } },
  ] } } });
  try {
    const results = await new ScreenScraperProvider({ SCREENSCRAPER_DEV_ID: 'dev', SCREENSCRAPER_DEV_PASSWORD: 'pass' }).search('Example');
    assert.equal(results.length, 1);
    assert.equal(results[0].sources.screenscraper.id, '7');
    assert.equal(results[0].platforms[0], 'PC-98');
  } finally { globalThis.fetch = originalFetch; }
});

test('RAWG and ScreenScraper use canonical platform names before matching and merging', () => {
  const rawg = normalizeRawgGame({ id: 1, name: 'Example', released: '2002-01-01', platforms: [{ platform: { name: 'PC' } }] });
  const ss = normalizeScreenScraperGame({ id: '2', nom: 'Example', dates: { us: '2002-06-07' }, systeme: { id: '135', text: 'PC Windows' } });
  assert.deepEqual(rawg.platforms, ['PC']);
  assert.deepEqual(ss.platforms, ['PC']);
  const candidates = combineCandidates([rawg], [ss]);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].platforms, ['PC']);
  assert.equal(candidates[0].sources.screenscraper.systemId, '135');
});

test('ScreenScraper platform variants keep their own detail IDs', () => {
  const a = normalizeScreenScraperGame({ id: '1', nom: 'Example', systeme: { id: '4', text: 'Super Nintendo' } });
  const b = normalizeScreenScraperGame({ id: '2', nom: 'Example', systeme: { id: '210', text: 'Super Nintendo MSU-1' } });
  const results = combineCandidates([], [a, b]);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(game => game.sources.screenscraper.systemId), ['4', '210']);
});

test('ScreenScraper live array fields yield names, platform, synopsis and private-media proxies', () => {
  const game = normalizeScreenScraperGame({ id: '422436',
    noms: [{ region: 'ss', text: 'Chrono Trigger' }, { region: 'cn', text: '时空之轮' }],
    systeme: { id: '3', text: 'NES' }, synopsis: [{ langue: 'de', text: 'Deutsch' }, { langue: 'en', text: 'English' }],
    dates: [{ region: 'us', text: '1995-08-11' }],
    genres: [{ noms: [{ langue: 'fr', text: 'Jeu de rôle' }, { langue: 'en', text: 'RPG' }] }],
    medias: [{ type: 'box-2D', url: 'https://neoclone.screenscraper.fr/api2/mediaJeu.php?devid=fixture&devpassword=PRIVATE&systemeid=3&jeuid=422436&media=box-2D(ss)' },
      { type: 'ss', url: 'https://neoclone.screenscraper.fr/api2/mediaJeu.php?devpassword=PRIVATE&systemeid=3&jeuid=422436&media=ss(wor)' }],
  });
  assert.equal(game.title, '时空之轮');
  assert.equal(game.originalName, 'Chrono Trigger');
  assert.equal(game.description, 'English');
  assert.deepEqual(game.platforms, ['NES']);
  assert.deepEqual(game.genres, ['RPG']);
  assert.equal(game.releaseDate, '1995-08-11');
  assert.equal(game.screenshots.length, 1);
  assert.ok(game.cover.startsWith('https://blog.blfy.cc/ns/api/games/media?'));
  assert.ok(!JSON.stringify(game).includes('PRIVATE'));
  assert.ok(!JSON.stringify(game).includes('devpassword'));
});

test('ScreenScraper request uses server credentials, longer timeout and sanitized errors', async () => {
  const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout;
  const provider = new ScreenScraperProvider({ SCREENSCRAPER_DEV_ID: 'fixture', SCREENSCRAPER_DEV_PASSWORD: 'PRIVATE' }, (...args) => globalThis.fetch(...args));
  try {
    AbortSignal.timeout = ms => { assert.equal(ms, 75000); return new AbortController().signal; };
    globalThis.fetch = async url => {
      assert.equal(url.searchParams.get('devid'), 'fixture');
      assert.equal(url.searchParams.get('devpassword'), 'PRIVATE');
      return Response.json({ response: { jeux: [] } });
    };
    assert.deepEqual(await provider.search('Example'), []);
    globalThis.fetch = async () => new Response('PRIVATE invalid developer', { status: 200 });
    await assert.rejects(provider.search('Example'), error => !error.message.includes('PRIVATE') && error.message.includes('ScreenScraper'));
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});

test('media proxy accepts only bounded image identifiers and never forwards upstream errors', async () => {
  const originalFetch = globalThis.fetch;
  const env = { SCREENSCRAPER_DEV_ID: 'fixture', SCREENSCRAPER_DEV_PASSWORD: 'PRIVATE' };
  const request = new Request('https://blog.blfy.cc/ns/api/games/media?systemeid=3&jeuid=422436&media=box-2D(ss)');
  try {
    globalThis.fetch = async url => {
      assert.equal(url.hostname, 'api.screenscraper.fr');
      assert.equal(url.searchParams.get('devpassword'), 'PRIVATE');
      return new Response('image-fixture', { headers: { 'Content-Type': 'image/png' } });
    };
    const image = await screenScraperMedia(request, env);
    assert.equal(image.status, 200);
    assert.equal(await image.text(), 'image-fixture');
    assert.equal((await screenScraperMedia(new Request('https://blog.blfy.cc/ns/api/games/media?systemeid=3&jeuid=1&media=https://evil.test'), env)).status, 400);
    globalThis.fetch = async () => new Response('PRIVATE', { headers: { 'Content-Type': 'text/plain' } });
    const failed = await screenScraperMedia(request, env);
    assert.equal(failed.status, 502);
    assert.equal(await failed.text(), 'Media unavailable');
  } finally { globalThis.fetch = originalFetch; }
});
