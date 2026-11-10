import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const worker = new URL('../../ns-counter/', import.meta.url);
const title = 'BloodRayne 2: Terminal Cut';
const date = '2020-11-20';
const rawgGame = {
  id: 31001, name: title, released: date, platforms: [{ platform: { name: 'PC' } }],
};
const ssGame = {
  id: '32001', nom: title, dates: { date_us: date }, systeme: { id: '135', text: 'PC Windows' },
};
const keys = { RAWG_API_KEY: 'test-rawg', SCREENSCRAPER_DEV_ID: 'test-dev', SCREENSCRAPER_DEV_PASSWORD: 'test-pass' };

test('the game lookup Worker searches and reads both sources with native fetch', { timeout: 20000 }, async t => {
  const config = await readFile(new URL('wrangler.toml', worker), 'utf8');
  const compatibilityDate = config.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(compatibilityDate);
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL('src/index.js', worker))],
    bundle: true, platform: 'neutral', format: 'esm', external: ['cloudflare:workers'], write: false,
  });
  // Keep the actual Workerd fetch function. Stub its outbound HTTP service, not
  // the providers or global fetch, so receiver errors cannot pass this test.
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate, cf: false,
    bindings: keys, d1Databases: { DB: 'game-lookup-runtime-test' },
    outboundService: async request => {
      const { hostname, pathname, searchParams } = new URL(request.url);
      if (hostname === 'api.rawg.io' && searchParams.get('key') === keys.RAWG_API_KEY) {
        if (pathname === '/api/games' && searchParams.get('search') === title) return Response.json({ results: [rawgGame] });
        if (pathname === '/api/games/31001') return Response.json(rawgGame);
        if (pathname === '/api/games/31001/screenshots') return Response.json({ results: [] });
      }
      if (hostname === 'api.screenscraper.fr' && searchParams.get('devid') === keys.SCREENSCRAPER_DEV_ID
          && searchParams.get('devpassword') === keys.SCREENSCRAPER_DEV_PASSWORD) {
        if (pathname === '/api2/jeuRecherche.php' && searchParams.get('recherche') === title) {
          return Response.json({ response: { jeux: [ssGame] } });
        }
        if (pathname === '/api2/jeuInfos.php' && searchParams.get('gameid') === ssGame.id
            && searchParams.get('systemeid') === ssGame.systeme.id) return Response.json({ response: { jeu: ssGame } });
      }
      return new Response('Unexpected test subrequest', { status: 502 });
    },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migration = await readFile(new URL('migrations/0002_game_metadata_cache.sql', worker), 'utf8');
  await db.batch(migration.split(';').filter(statement => statement.trim()).map(statement => db.prepare(statement)));
  const base = 'https://blog.test/ns/api/games';
  for (const [source, id] of [['rawg', String(rawgGame.id)], ['screenscraper', ssGame.id]]) {
    await t.test(source, async () => {
      const search = await mf.dispatchFetch(base + '/search?' + new URLSearchParams({ q: title, source }));
      const data = await search.json();
      assert.deepEqual(
        { status: search.status, provider: data.providers?.[source], titles: data.results?.map(game => game.title), warnings: data.warnings },
        { status: 200, provider: 'ok', titles: [title], warnings: [] },
      );
      const [match] = data.results;
      assert.equal(match.sources[source].id, id);
      assert.equal(match.releaseDate, date);
      assert.deepEqual(match.platforms, ['PC']);
      const detail = await mf.dispatchFetch(base + '/detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataSource: source, sources: match.sources, refresh: true }),
      });
      const game = await detail.json();
      assert.equal(detail.status, 200, JSON.stringify(game));
      assert.equal(game.title, title);
      assert.equal(game.sources[source].id, id);
      assert.equal(game.cache, 'miss');
    });
  }
});
