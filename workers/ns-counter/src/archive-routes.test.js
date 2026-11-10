import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchDossierEditions, searchTheGamesDB, detailTheGamesDB, steamGridDBRoute } from './archive-routes.js';

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
  e.cache.get('thegamesdb:search:v3:fixture & test').cached_at = 0;
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
