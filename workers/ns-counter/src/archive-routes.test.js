import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchDossierEditions, searchTheGamesDB, detailTheGamesDB, steamGridDBRoute } from './archive-routes.js';
import { groupTheGamesDBVersions } from './thegamesdb-versions.js';

const root = 'https://blog.example/ns/api/games';
const auth = { 'X-Gaming-Admin': '1', Cookie: 'other=do-not-forward; __Host-gaming_admin=fixture-session' };
function env(adminStatus = 200) {
  const cache = new Map();
  return { cache, THEGAMESDB_API_KEY: 'tg-fixture-key', STEAMGRIDDB_API_KEY: 'sg-fixture-key',
    GAME_ADMIN: { async fetch(request) {
      assert.equal(request.url, 'https://blog.example/ns/api/accounts');
      assert.equal(request.headers.get('Cookie'), '__Host-gaming_admin=fixture-session');
      return Response.json({}, { status: adminStatus });
    } },
    DB: { prepare(sql) { return { bind(key, payload, cached_at) { return {
      async first() { assert.match(sql, /SELECT/); return cache.get(key); },
      async run() { assert.match(sql, /INSERT/); cache.set(key, { payload, cached_at }); },
    }; } }; } },
  };
}

const tgRecord = { id: 97, game_title: 'Fixture & Test', release_date: '2004-02-29', platform: 24,
  developers: [7], publishers: [8], genres: [9, 9], overview: 'Fixture synopsis', alternates: ['別名', { name: 'Alternate' }],
  cover: 'https://not-used.invalid/cover.png', boxart: [{ filename: 'skip' }], screenshots: ['skip'] };
const catalog = {
  Developers: ['developers', 7, 'Fixture Dev'], Publishers: ['publishers', 8, 'Fixture Pub'],
  Genres: ['genres', 9, 'RPG'], Platforms: ['platforms', 24, 'Sony PlayStation 2'],
};
function tgMock(calls) {
  return async (url, options) => {
    assert.equal(url.origin, 'https://api.thegamesdb.net');
    assert.equal(url.searchParams.get('apikey'), 'tg-fixture-key');
    assert.equal(options.redirect, 'manual');
    const endpoint = url.pathname.split('/').at(-1); calls.push(endpoint);
    if (endpoint === 'ByGameName' || endpoint === 'ByGameID') {
      assert.equal(url.searchParams.get(endpoint === 'ByGameName' ? 'name' : 'id'), endpoint === 'ByGameName' ? 'Fixture & Test' : '97');
      assert.equal(url.searchParams.get('include'), 'platform');
      assert.equal(url.searchParams.get('fields'), endpoint === 'ByGameID' ? 'overview,genres,publishers,alternates' : 'genres,publishers,alternates');
      return Response.json({ code: 200, data: { games: [tgRecord] }, pages: { next: url.href },
        ...(endpoint === 'ByGameName' ? { include: { platform: { 24: { id: 24, name: 'Sony PlayStation 2' } } } } : {}) });
    }
    const [field, id, name] = catalog[endpoint];
    return Response.json({ code: 200, data: { [field]: { [id]: { id, name } } } });
  };
}

test('TheGamesDB normalizes names, dates, aliases and platform; detail uses ID and reuses catalogs', async () => {
  const e = env(), calls = [], fetcher = tgMock(calls);
  const request = new Request(root + '/search', { headers: auth });
  const first = await searchTheGamesDB(request, e, 'Fixture & Test', fetcher);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('Access-Control-Allow-Origin'), null);
  const { results: [item], cache } = await first.json();
  assert.equal(cache, 'miss');
  assert.equal(item.id, 'thegamesdb:97');
  assert.equal(item.releaseDate, '2004-02-29');
  assert.deepEqual(item.platforms, ['PlayStation 2']);
  assert.deepEqual(item.developers, ['Fixture Dev']);
  assert.deepEqual(item.publishers, ['Fixture Pub']);
  assert.deepEqual(item.genres, ['RPG']);
  assert.deepEqual(item.alternativeNames, ['別名', 'Alternate']);
  assert.equal(item.fieldSources.developers, 'thegamesdb');
  assert.equal(item.description, undefined);
  assert.equal(item.cover, undefined);
  assert.equal(item.screenshots, undefined);
  assert.equal(item.sources.thegamesdb.url, 'https://thegamesdb.net/game.php?id=97');
  assert.equal((await (await searchTheGamesDB(request, e, 'Fixture & Test', fetcher)).json()).cache, 'fresh');
  assert.equal(calls.length, 4);
  const detail = await detailTheGamesDB(new Request(root + '/detail', { method: 'POST', headers: auth }), e,
    { sources: item.sources }, fetcher);
  assert.equal(detail.status, 200);
  assert.deepEqual((await detail.json()).platforms, ['PlayStation 2']);
  assert.deepEqual(calls.slice(4), ['ByGameID', 'Platforms']);
  assert.ok([...e.cache.values()].every(row => !row.payload.includes('tg-fixture-key') && !row.payload.includes('boxart')));
});

test('TheGamesDB cross-platform releases group across pages, keep IDs and recheck details', async () => {
  const e = env(), calls = [], title = 'Fixture Quest';
  const row = (id, platform, release_date, developers = [7], game_title = title) =>
    ({ id, platform, release_date, developers, game_title, overview: 'Reference prose is not imported' });
  const pages = [
    [row(201, 51, '2021-03-01'), row(204, 51, '2009-02-05'),
      row(205, 52, '2021-03-01', [7], title + ' [Remastered]'), row(206, 1, '2020-09-10', [12])],
    [row(202, 1, '2020-09-10'), row(203, 51, '2021-03-01'), row(207, 52, '2021-03-01')],
  ];
  const platforms = { 1: { name: 'PC' }, 51: { name: 'Sony Playstation 5' }, 52: { name: 'Microsoft Xbox Series X' } };
  const fetcher = async url => {
    assert.equal(url.origin, 'https://api.thegamesdb.net', 'never follow the upstream next URL');
    const endpoint = url.pathname.split('/').at(-1);
    if (endpoint === 'ByGameName') {
      assert.equal(url.searchParams.get('name'), title);
      const page = Number(url.searchParams.get('page') || 1);
      calls.push('search:' + page);
      return Response.json({ code: 200, data: { games: pages[page - 1] }, include: { platform: { data: platforms } },
        pages: { next: page === 1 ? 'https://unused.example/?page=2&apikey=private-next-url' : '' } });
    }
    if (endpoint === 'Developers') return Response.json({ code: 200, data: { developers: {
      7: { id: 7, name: 'Fixture Dev' }, 12: { id: 12, name: 'Other Studio' },
    } } });
    assert.equal(endpoint, 'ByGameID');
    const ids = url.searchParams.get('id').split(',');
    calls.push('detail:' + ids.join(','));
    return Response.json({ code: 200, data: { games: pages.flat().filter(game => ids.includes(String(game.id))) }, include: { platform: platforms } });
  };
  const request = (platform, year) => new Request(root + '/search?' + new URLSearchParams({ platform, year, developer: 'Fixture Dev' }), { headers: auth });
  const pcResponse = await searchTheGamesDB(request('PC', '2020'), e, title, fetcher);
  assert.equal(pcResponse.status, 200);
  const pc = await pcResponse.json();
  assert.equal(pc.results.length, 4, 'one contemporary group; earlier title, other studio and remaster stay separate');
  const [group] = pc.results;
  assert.equal(group.id, 'thegamesdb:202');
  assert.equal(group.releaseDate, '2020-09-10');
  assert.deepEqual(new Set(group.platforms), new Set(['PC', 'PlayStation 5', 'Xbox Series X|S']));
  const versions = group.sources.thegamesdb.versions;
  assert.deepEqual(versions, [
    { id: '202', platform: 'PC', releaseDate: '2020-09-10' },
    { id: '201', platform: 'PlayStation 5', releaseDate: '2021-03-01' },
    { id: '203', platform: 'PlayStation 5', releaseDate: '2021-03-01' },
    { id: '207', platform: 'Xbox Series X|S', releaseDate: '2021-03-01' },
  ]);
  assert.equal(group.match.confidence, 'high');
  assert.deepEqual(calls, ['search:1', 'search:2']);
  const ps = await (await searchTheGamesDB(request('PS5', '2021'), e, title, fetcher)).json();
  assert.equal(ps.cache, 'fresh');
  assert.equal(ps.results[0].sources.thegamesdb.id, '201');
  assert.equal(ps.results[0].releaseDate, '2021-03-01');
  assert.deepEqual(ps.results[0].sources.thegamesdb.versions, versions);
  assert.deepEqual(calls, ['search:1', 'search:2']);
  const combined = await (await searchDossierEditions(request('PC', '2020'), e, title, fetcher)).json();
  assert.equal(combined.results[0].sources.thegamesdb.id, '202');
  assert.deepEqual(combined.results[0].sources.thegamesdb.versions, versions);

  const detail = await detailTheGamesDB(new Request(root + '/detail', { method: 'POST', headers: auth }), e, {
    sources: { thegamesdb: { id: '202', versions: [...versions, { id: '204', platform: 'PC', releaseDate: '2020-09-10' }] } },
    refresh: true,
  }, fetcher);
  assert.equal(detail.status, 200);
  const confirmed = await detail.json();
  assert.equal(confirmed.sources.thegamesdb.id, '202');
  assert.deepEqual(confirmed.sources.thegamesdb.versions, versions);
  assert.match(confirmed.warnings.join(), /部分平台记录/);
  assert.ok(!confirmed.description);
  assert.ok([...e.cache.values()].every(row => !/private-next-url|Reference prose/.test(row.payload)));
  assert.equal(calls.filter(call => call.startsWith('detail:')).length, 1);
});

test('cover search and paged grids are SteamGridDB-only and return public, portrait artwork', async () => {
  const e = env(), queries = [];
  const fetcher = async (url, options) => {
    assert.equal(url.origin, 'https://www.steamgriddb.com');
    assert.equal(options.headers.Authorization, 'Bearer sg-fixture-key');
    queries.push(url);
    if (url.pathname.includes('/autocomplete/')) return Response.json({ success: true, data: [
      { id: 40, name: 'Fixture / Test?', release_date: 1100000000 }, { id: 0, name: 'Invalid ID' }, { id: 41, name: 'No date', release_date: 0 },
    ] });
    const good = { id: 1234, width: 600, height: 900, mime: 'image/png', url: 'https://cdn2.steamgriddb.com/grid/image.png',
      thumb: 'https://cdn2.steamgriddb.com/thumb/thumb.png', author: { name: 'Fixture Artist' } };
    return Response.json({ success: true, total: 44, data: [good,
      { ...good, id: 1235, url: 'https://cdn2.steamgriddb.com.evil.invalid/grid/image.png' },
      { ...good, id: 1236, url: good.url + '?key=sg-fixture-key' },
      { ...good, id: 1237, height: 320 }, { ...good, id: 1238, nsfw: true }, { ...good, id: 1239, mime: 'image/gif' },
    ] });
  };
  const search = new Request(root + '/covers/search?q=' + encodeURIComponent('Fixture / Test?'), { headers: auth });
  const found = await (await steamGridDBRoute(search, e, fetcher)).json();
  assert.deepEqual(found.results, [{ id: '40', title: 'Fixture / Test?', year: 2004 }, { id: '41', title: 'No date', year: null }]);
  assert.equal(queries[0].pathname, '/api/v2/search/autocomplete/Fixture%20%2F%20Test%3F');
  const grid = new Request(root + '/covers?gameId=40&page=1', { headers: auth });
  const result = await (await steamGridDBRoute(grid, e, fetcher)).json();
  assert.equal(queries[1].pathname, '/api/v2/grids/game/40');
  assert.equal(queries[1].searchParams.get('types'), 'static');
  assert.equal(queries[1].searchParams.get('page'), '1');
  assert.equal(queries[1].searchParams.get('limit'), '18');
  assert.deepEqual(result, { page: 1, hasMore: true, cache: 'miss', results: [{ id: '1234', width: 600, height: 900,
    url: 'https://cdn2.steamgriddb.com/grid/image.png', thumb: 'https://cdn2.steamgriddb.com/thumb/thumb.png', author: 'Fixture Artist' }] });
  assert.equal((await (await steamGridDBRoute(grid, e, fetcher)).json()).cache, 'fresh');
  assert.equal(queries.length, 2);
});

test('TheGamesDB caps title pagination and retains earlier results if a later page fails', async () => {
  const req = new Request(root + '/search', { headers: auth });
  for (const interrupted of [false, true]) {
    const calls = [];
    const response = await searchTheGamesDB(req, env(), 'Fixture', async url => {
      const page = Number(url.searchParams.get('page') || 1);
      calls.push(page);
      if (interrupted && page === 2) return Response.json({ error: 'private' }, { status: 429 });
      return Response.json({ code: 200, data: { games: [{ id: page, game_title: 'Fixture ' + page, platform: 1 }] },
        include: { platform: { 1: { name: 'PC' } } }, pages: { next: '?page=' + (page + 1) } });
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(calls, interrupted ? [1, 2] : [1, 2, 3, 4]);
    assert.equal(body.results.length, interrupted ? 1 : 4);
    assert.match(body.warnings.join(), interrupted ? /后续结果暂不可用/ : /前 4 页/);
    assert.doesNotMatch(JSON.stringify(body), /private|apikey/);
  }
});

test('new endpoints reject missing admin, cross-origin, invalid ID and unsupported method before provider calls', async () => {
  const fetcher = () => assert.fail('provider should not be called');
  const request = (path, headers = auth, method = 'GET') => new Request(root + path, { headers, method });
  assert.equal((await steamGridDBRoute(request('/covers?gameId=1', {}), env(), fetcher)).status, 403);
  assert.equal((await steamGridDBRoute(request('/covers?gameId=1', { 'X-Gaming-Admin': '1' }), env(), fetcher)).status, 401);
  assert.equal((await steamGridDBRoute(request('/covers?gameId=1', { ...auth, Origin: 'https://else.invalid' }), env(), fetcher)).status, 403);
  assert.equal((await steamGridDBRoute(request('/covers?gameId=1'), env(401), fetcher)).status, 401);
  assert.equal((await steamGridDBRoute(request('/covers?gameId=1', auth, 'POST'), env(), fetcher)).status, 405);
  assert.equal((await steamGridDBRoute(request('/covers?gameId=1&page=999'), env(), fetcher)).status, 400);
  assert.equal((await detailTheGamesDB(request('/detail', auth, 'POST'), env(), { sources: { thegamesdb: { id: '123/456' } } }, fetcher)).status, 400);
  assert.equal((await detailTheGamesDB(request('/detail', auth, 'POST'), env(), { sources: { thegamesdb: { id: '123', versions: [{ id: '456/789' }] } } }, fetcher)).status, 400);
});

test('provider failure returns stale data or a redacted error, never an authenticated upstream URL', async () => {
  const e = env(), req = new Request(root + '/search', { headers: auth });
  const fetcher = () => { throw new Error('sensitive https://api.thegamesdb.net/?apikey=tg-fixture-key'); };
  let response = await searchTheGamesDB(req, e, 'Fixture & Test', fetcher);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /tg-fixture-key|apikey/);
  await searchTheGamesDB(req, e, 'Fixture & Test', tgMock([]));
  e.cache.get('thegamesdb:search:v7:fixture & test').cached_at = 0;
  response = await searchTheGamesDB(req, e, 'Fixture & Test', fetcher);
  assert.equal(response.status, 200);
  const stale = await response.json();
  assert.equal(stale.cache, 'stale');
  assert.match(stale.warning, /TheGamesDB/);
  assert.doesNotMatch(JSON.stringify(stale), /tg-fixture-key|apikey/);
});

test('redirects are not followed or exposed to the CMS', async () => {
  let calls = 0;
  const response = await steamGridDBRoute(new Request(root + '/covers/search?q=Fixture', { headers: auth }), env(), async (_, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    return Response.redirect('https://else.invalid/?key=sg-fixture-key', 302);
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /else\.invalid|sg-fixture-key/);
});


test('Ys IX groups the standard releases without swallowing explicitly named editions', async () => {
  const title = 'Ys IX: Monstrum Nox';
  const rows = [
    [76875, 1, '2021-02-02', [2984]], [100236, 2, '2021-07-06', []],
    [100811, 3, '2021-07-06', [2796, 6010]], [130079, 4, '2021-07-16', [6010]],
    [77801, 4, '2021-06-30', [6010], ' '], [109105, 5, '2023-05-30', [6010], ' [Deluxe Edition]'],
    [128402, 1, '2019-09-26', [2984], " [Limited Edition Collector's Box]"],
    [84546, 1, '2021-02-06', [2984], ' [Pact Edition]'],
  ].map(([id, platform, release_date, developers, suffix = '']) => ({
    id, platform, release_date, developers, game_title: title + suffix,
  }));
  const platforms = Object.fromEntries(['PlayStation 4', 'Stadia', 'PC', 'Nintendo Switch', 'PlayStation 5']
    .map((name, index) => [index + 1, { name }]));
  const request = new Request(root + '/search', { headers: auth });
  const e = env();
  // The pre-fix cache had already stored separate cards.
  e.cache.set('thegamesdb:search:v3:' + title.toLowerCase(), { cached_at: Date.now(),
    payload: JSON.stringify({ results: [{ id: 'thegamesdb:76875', title, platforms: ['PlayStation 4'] }], warnings: [] }) });
  const fetcher = async url => {
    const endpoint = url.pathname.split('/').at(-1);
    if (endpoint === 'Developers') return Response.json({ code: 200, data: { developers: {
      2984: { name: 'Falcom' }, 6010: { name: 'Nihon Falcom Corp.' }, 2796: { name: 'Engine Software' },
    } } });
    assert.ok(['ByGameName', 'ByGameID'].includes(endpoint));
    const ids = url.searchParams.get('id')?.split(',');
    return Response.json({ code: 200, data: { games: ids ? rows.filter(row => ids.includes(String(row.id))) : rows },
      include: { platform: platforms } });
  };
  for (const context of [env(), e]) {
    const result = await (await searchTheGamesDB(request, context, title, fetcher)).json();
    assert.equal(result.results.length, 4);
    const [group] = result.results;
    assert.equal(group.title, title);
    assert.deepEqual(new Set(group.platforms), new Set(['PlayStation 4', 'Stadia', 'PC', 'Nintendo Switch']));
    assert.deepEqual(group.sources.thegamesdb.versions.map(v => v.id).sort(), ['100236', '100811', '130079', '76875', '77801']);
    const detail = await detailTheGamesDB(request, context, { sources: group.sources }, fetcher);
    assert.equal(detail.status, 200);
    assert.deepEqual((await detail.json()).sources.thegamesdb.versions, group.sources.thegamesdb.versions);
  }
});


test('TheGamesDB keeps a corroborated core and attaches a sparse release without bridging different editions', async () => {
  const title = 'Ys: The Oath in Felghana';
  const rows = [
    [9464, 1, '2012-03-19', [6010]], [13220, 2, '2010-11-02', [2984]], [62612, 3, '2010-11-02', []],
    [114646, 4, '2023-04-26', [], 'Ys Memoire: The Oath in Felghana'],
    [63221, 2, '2010-11-02', [2984], title + ' [Premium Edition]'],
  ].map(([id, platform, release_date, developers, game_title = title]) => ({ id, platform, release_date, developers, game_title }));
  const platforms = { 1: { name: 'PC' }, 2: { name: 'Sony Playstation Portable' }, 3: { name: 'Sony Playstation Vita' }, 4: { name: 'Nintendo Switch' } };
  const request = new Request(root + '/search?platform=PS+Vita&year=2010', { headers: auth });
  const e = env();
  const fetcher = async url => {
    const endpoint = url.pathname.split('/').at(-1);
    if (endpoint === 'Developers') return Response.json({ code: 200, data: { developers: {} } });
    assert.ok(['ByGameName', 'ByGameID'].includes(endpoint));
    const ids = url.searchParams.get('id')?.split(',');
    return Response.json({ code: 200, data: { games: ids ? rows.filter(row => ids.includes(String(row.id))).reverse() : rows },
      include: { platform: platforms } });
  };
  const result = await (await searchTheGamesDB(request, e, title, fetcher)).json();
  assert.equal(result.results.length, 3);
  const standard = result.results.find(row => row.title === title);
  assert.deepEqual(new Set(standard.platforms), new Set(['PC', 'PSP', 'PS Vita']));
  assert.equal(standard.sources.thegamesdb.id, '62612');
  const detail = await (await detailTheGamesDB(request, e, { sources: standard.sources }, fetcher)).json();
  assert.deepEqual(detail.sources.thegamesdb.versions, standard.sources.thegamesdb.versions);
});

test('an ambiguous sparse row cannot bridge or dissolve either same-title studio group', () => {
  const make = (id, platform, releaseDate, studio) => ({
    game: { title: 'Unrelated Shared Name', platforms: [platform], releaseDate, sources: { thegamesdb: { id } } },
    credits: studio ? [studio] : [],
  });
  const rows = [
    make('1', 'PC', '2020-03-01', 'id:11'),
    make('2', 'PS4', '2019-03-01', 'id:11'),
    make('3', 'PC', '2020-03-01', 'id:12'),
    make('4', 'Xbox One', '2021-03-01', 'id:12'),
    make('5', 'Nintendo Switch', '2020-03-01'),
  ];
  const ids = input => groupTheGamesDBVersions(input).map(game => {
    const source = game.sources.thegamesdb;
    return (source.versions?.map(row => row.id) || [source.id]).sort().join(',');
  }).sort();
  assert.deepEqual(ids(rows), ['1,2', '3,4', '5']);
  assert.deepEqual(ids([...rows].reverse()), ids(rows));
});

test('all-source search fans out concurrently, anchors to catalog versions, and verifies detail before supplementing', { timeout: 3000 }, async () => {
  const e = { ...env(), RAWG_API_KEY: 'rawg-fixture', SCREENSCRAPER_DEV_ID: 'ss-fixture', SCREENSCRAPER_DEV_PASSWORD: 'ss-fixture' };
  const title = 'Archive Coast', calls = new Set();
  let release, mismatch = false;
  const started = new Promise(resolve => { release = resolve; });
  const base = [
    { id: 31, game_title: title, platform: 1, release_date: '2010-05-12', developers: [7], genres: [9] },
    { id: 32, game_title: title, platform: 2, release_date: '2012-06-20', developers: [7], genres: [9] },
  ];
  const raw = { id: 41, name: title, released: '2010-04-01', website: 'https://example.org/',
    platforms: [{ platform: { name: 'PC' }, released_at: '2012-06-20' }, { platform: { name: 'Linux' } }],
    genres: [{ name: 'Adventure' }], description_raw: 'Never import source prose' };
  const screen = { id: 51, nom: title, noms: { cn: '海岸档案' }, dates: { us: '2010-05-12' },
    systeme: { id: 4, text: 'Xbox 360' }, developpeur: 'Fixture Dev', editeur: 'Supplement Pub' };
  const fetcher = async url => {
    const endpoint = url.pathname.split('/').at(-1);
    if (['ByGameName', 'games', 'jeuRecherche.php'].includes(endpoint)) {
      calls.add(endpoint);
      if (calls.size === 3) release();
      await started;
    }
    if (endpoint === 'ByGameName' || endpoint === 'ByGameID') return Response.json({ code: 200, data: { games: base },
      include: { platform: { 1: { name: 'Xbox 360' }, 2: { name: 'PC' } } } });
    if (endpoint === 'Developers') return Response.json({ code: 200, data: { developers: { 7: { id: 7, name: 'Fixture Dev' } } } });
    if (endpoint === 'Genres') return Response.json({ code: 200, data: { genres: { 9: { id: 9, name: 'Action' } } } });
    if (endpoint === 'games') return Response.json({ results: [raw, { ...raw, id: 42, released: '2024-10-04',
      platforms: [{ platform: { name: 'PC' }, released_at: '2024-10-04' }] }] });
    if (endpoint === '41') return Response.json(raw);
    if (endpoint === 'screenshots') return Response.json({ results: [] });
    if (endpoint === 'jeuRecherche.php') return Response.json({ response: { jeux: [screen] } });
    if (endpoint === 'jeuInfos.php') return Response.json({ response: { jeu: mismatch ? { ...screen, dates: { us: '2024-03-03' } } : screen } });
    assert.fail('unexpected request: ' + endpoint);
  };
  const request = new Request(root + '/search?platform=PC&year=2012', { headers: auth });
  const response = await searchDossierEditions(request, e, title, fetcher);
  assert.equal(response.status, 200);
  const { results, providers } = await response.json();
  assert.deepEqual(providers, { thegamesdb: 'ok', rawg: 'ok', screenscraper: 'ok' });
  assert.equal(results.length, 2);
  const [game, separate] = results;
  assert.equal(game.id, 'thegamesdb:32');
  assert.equal(game.title, title);
  assert.equal(separate.id, 'rawg:42');
  assert.deepEqual(Object.keys(game.sources), ['thegamesdb', 'rawg', 'screenscraper']);
  assert.deepEqual(game.genres, ['Action', 'Adventure']);
  assert.deepEqual(game.platforms, ['PC', 'Xbox 360', 'Linux']);
  assert.equal(game.fieldSources.website, 'rawg');
  assert.equal(game.fieldSources.publishers, 'screenscraper');
  assert.equal(game.description, undefined);
  const detailRequest = new Request(root + '/detail', { method: 'POST', headers: auth });
  const detail = async () => (await detailTheGamesDB(detailRequest, e, { sources: game.sources, refresh: true }, fetcher, true)).json();
  assert.deepEqual((await detail()).sources, game.sources);
  mismatch = true;
  const rejected = await detail();
  assert.equal(rejected.sources.screenscraper, undefined);
  assert.equal(rejected.localizedName, undefined);
  assert.match(rejected.warnings.join(), /ScreenScraper 详情未通过版本核对/);
  assert.equal(rejected.id, 'thegamesdb:32');
  assert.ok([...e.cache.values()].every(row => !row.payload.includes('Never import source prose')));
});

test('all-source search retains available candidates and reports unavailable providers', async () => {
  const e = { ...env(), RAWG_API_KEY: 'rawg-fixture', SCREENSCRAPER_DEV_ID: 'ss-fixture', SCREENSCRAPER_DEV_PASSWORD: 'ss-fixture' };
  const fetcher = async url => url.hostname === 'api.screenscraper.fr' ? Response.json({ response: { jeux: [
    { id: 21, nom: 'Fallback Title', dates: { us: '2004-03-01' }, systeme: { id: 4, text: 'PlayStation 2' } },
  ] } }) : new Response('private upstream error', { status: 503 });
  const request = new Request(root + '/search', { headers: auth });
  const response = await searchDossierEditions(request, e, 'Fallback Title', fetcher);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.results.map(item => item.id), ['screenscraper:21']);
  assert.deepEqual(result.providers, { thegamesdb: 'unavailable', rawg: 'unavailable', screenscraper: 'ok' });
  assert.deepEqual(result.warnings, ['TheGamesDB 暂不可用', 'RAWG 暂不可用']);
});

test('TUNIC production catalog: verified 2022 ports group, unrelated and later editions stay separate', async () => {
  const records = [
    [66459, 'TUNIC', '2022-03-16', 1, null],
    [99191, 'Tunic', '2022-03-16', 4920, null],
    [104354, 'Tunic', '2022-03-16', 4981, null],
    [104890, 'Tunic', '2022-09-27', 4971, [10838]],
    [106641, 'Tunic', '2022-09-27', 4980, null],
    [117590, 'Tunic', '2023-08-11', 4971, [10838]],
    [123537, 'Tunic', '2023-01-20', 41, null],
    [123708, 'Tunic', '2023-01-29', 41, null],
    [999991, 'Tunic Deluxe Edition', '2022-09-27', 4971, [10838]],
  ].map(([id, game_title, release_date, platform, developers]) => ({ id, game_title, release_date, platform, developers }));
  const names = { 1: 'PC', 4920: 'Microsoft Xbox One', 4981: 'Microsoft Xbox Series X', 4971: 'Nintendo Switch', 4980: 'Sony PlayStation 5', 41: 'Nintendo Game Boy Color' };
  const e = env();
  const fetcher = async url => {
    if (url.pathname.endsWith('/Developers')) return Response.json({code:200,data:{developers:{10838:{id:10838,name:'Isometricorp Games'}}}});
    if (url.pathname.endsWith('/ByGameName') || url.pathname.endsWith('/ByGameID')) {
      const ids = url.searchParams.get('id')?.split(',');
      return Response.json({code:200,data:{games:ids?records.filter(r=>ids.includes(String(r.id))):records},
        include:{platform:Object.fromEntries(Object.entries(names).map(([id,name])=>[id,{name}]))}});
    }
    return Response.json({error:'fixture: supplemental source unavailable'}, {status:503});
  };
  const request = new Request(root+'/search?platform=PC', {headers:auth});
  const stale = {cached_at:Date.now(), payload:JSON.stringify({results:[],warnings:[]})};
  e.cache.set('thegamesdb:search:v6:tunic', stale);
  e.cache.set('dossier:all:v2:tunic', stale);
  const expected = ['104354','104890','106641','66459','99191'];
  const check = result => {
    const candidates = result.results.filter(game => game.sources?.thegamesdb);
    const group = candidates.find(game=>game.sources.thegamesdb.versions?.some(v=>v.id==='66459'));
    assert.deepEqual(group?.sources.thegamesdb.versions.map(v=>v.id).sort(), expected);
    assert.deepEqual(group.platforms.slice().sort(), ['Nintendo Switch','PC','PlayStation 5','Xbox One','Xbox Series X|S'].sort());
    for (const id of ['117590','123537','123708','999991']) {
      const separate = candidates.find(game=>game.sources.thegamesdb.id===id);
      assert.ok(separate, id);
      assert.equal(separate.sources.thegamesdb.versions, undefined);
    }
    assert.equal(candidates.length,5);
    return group;
  };
  const first = await (await searchTheGamesDB(request,e,'Tunic',fetcher)).json();
  assert.equal(first.cache,'miss');
  const group = check(first);
  assert.equal((await (await searchTheGamesDB(request,e,'TUNIC',fetcher)).json()).cache,'fresh');
  check(await (await searchDossierEditions(request,e,'Tunic',fetcher)).json());
  const detail = await (await detailTheGamesDB(request,e,{sources:{thegamesdb:{...group.sources.thegamesdb,
    versions:[...group.sources.thegamesdb.versions,...['117590','123537','123708','999991'].map(id=>({id}))]}}},fetcher)).json();
  assert.deepEqual(detail.sources.thegamesdb.versions.map(v=>v.id).sort(),expected);
  assert.ok(detail.warnings.some(w=>w.includes('未通过核对')));
});

test('a unique same-day credited cross-platform release breaks ambiguity for any title, but conflicting evidence does not', () => {
  const row = (id, platform, releaseDate, credits = [], publishers = []) => ({credits,game:{
    title:'Ordinary Harbor',platforms:[platform],releaseDate,publishers,sources:{thegamesdb:{id}},
  }});
  const early = row('9001','PC','2022-09-27',['id:1'],['Original publisher']);
  const late = row('9002','PC','2023-08-11',['id:1']);
  const port = row('9003','PlayStation 5','2022-09-27');
  const distant = row('9004','Game Boy Color','2023-01-20');
  const members = (rows, id) => groupTheGamesDBVersions(rows).find(game => game.sources.thegamesdb.id === id)?.sources.thegamesdb.versions?.map(v=>v.id).sort();
  assert.deepEqual(members([early,late,port,distant],'9001'),['9001','9003']);
  assert.equal(members([early,late,port,distant],'9002'),undefined);
  assert.equal(members([early,late,port,distant,row('9005','Xbox One','2022-09-27',['id:2'])],'9001'),undefined);
  assert.equal(members([early,late,{...port,game:{...port.game,publishers:['Different publisher']}}],'9001'),undefined);
  assert.equal(members([early,late,port,row('9006','PlayStation 5','2022-09-27')],'9001'),undefined);
});
