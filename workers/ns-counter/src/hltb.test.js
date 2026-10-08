import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { cachedHltb, hltbRoute, HltbProvider, normalizeHltb, DETAIL_TTL, SEARCH_TTL } from './hltb.js';
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../migrations/0003_hltb_cache.sql', import.meta.url), 'utf8'));
  return { prepare(query) { let args; return { bind(...values) { args = values; return this; }, async first() { return sql.prepare(query).get(...args); }, async run() { return sql.prepare(query).run(...args); } }; } };
}
test('actual SQLite migration, cache TTL and atomic lease suppress duplicate upstream work', async () => {
  const db = database(); let calls = 0;
  const producer = async () => { calls++; return { id: 68151, main: 60 }; };
  assert.equal(DETAIL_TTL / 86400000, 14); assert.equal(SEARCH_TTL / 86400000, 7);
  const first = await cachedHltb(db, 'game:68151', DETAIL_TTL, producer, 10000000);
  assert.equal(first.cache, 'miss');
  assert.equal((await cachedHltb(db, 'game:68151', DETAIL_TTL, producer, 10000001)).cache, 'fresh');
  assert.equal(calls, 1);
  const expired = 10000000 + DETAIL_TTL + 1;
  const stale = await cachedHltb(db, 'game:68151', DETAIL_TTL, async () => { calls++; throw new Error('HLTB HTTP 403'); }, expired);
  assert.equal(stale.cache, 'stale'); assert.equal(stale.updatedAt, first.updatedAt);
  assert.equal((await cachedHltb(db, 'game:68151', DETAIL_TTL, producer, expired + 1)).cache, 'stale');
  assert.equal(calls, 2);
});
test('no-cache source failure stays an error and respects retry cooldown', async () => {
  const db = database(); let calls = 0;
  const fail = async () => { calls++; throw new Error('HLTB HTTP 503'); };
  await assert.rejects(cachedHltb(db, 'game:1', DETAIL_TTL, fail, 1000));
  await assert.rejects(cachedHltb(db, 'game:1', DETAIL_TTL, fail, 1001));
  assert.equal(calls, 1);
  await assert.rejects(cachedHltb(db, 'game:1', DETAIL_TTL, fail, 60999));
  assert.equal(calls, 1);
  assert.equal((await cachedHltb(db, 'game:1', DETAIL_TTL, async () => ({ id: 1, main: 10 }), 61000)).cache, 'miss');
});
test('transient source error retries once; permanent errors do not retry', async () => {
  let calls = 0;
  const recovered = new HltbProvider(async () => ++calls === 1 ? new Response('', { status: 503 }) : new Response('Recovered'));
  assert.equal(await recovered.read('/'), 'Recovered'); assert.equal(calls, 2);
  calls = 0;
  const denied = new HltbProvider(async () => { calls++; return new Response('', { status: 403 }); });
  await assert.rejects(denied.read('/'), /HLTB HTTP 403/); assert.equal(calls, 1);
  calls = 0;
  const down = new HltbProvider(async () => { calls++; return new Response('', { status: 503 }); });
  await assert.rejects(down.read('/'), /HLTB HTTP 503/); assert.equal(calls, 2);
});
test('no-cache route errors expose bounded retry time and preserve failure status', async () => {
  const env = { DB: database() }; let calls = 0;
  const provider = { search: async () => { calls++; throw new Error('HLTB HTTP 503'); } };
  const request = new Request('https://blog.blfy.cc/ns/api/hltb/search?q=Assassin%27s%20Creed');
  const first = await hltbRoute(request, env, provider);
  assert.equal(first.status, 503);
  const data = await first.json();
  assert.ok(data.retryAfter > 0 && data.retryAfter <= 60);
  assert.equal(first.headers.get('Retry-After'), String(data.retryAfter));
  const second = await hltbRoute(request, env, provider);
  assert.equal(second.status, 503); assert.equal(calls, 1);
});
test('ID detail extracts exact embedded record; malformed source and IDs do not display wrong game', async () => {
  const page = { props: { pageProps: { game: { data: { game: [{ game_id: 68151, game_name: 'Elden Ring', comp_main: 216432, comp_plus: 365040, comp_100: 490320 }] } } } } };
  let requests = 0;
  const provider = new HltbProvider(async () => { requests++; return new Response(`<script id="__NEXT_DATA__">${JSON.stringify(page)}</script>`); });
  const game = await provider.detail(68151); assert.equal(game.main, 60.12); assert.equal(requests, 1);
  await assert.rejects(provider.detail(1));
  assert.equal(normalizeHltb({ game_id: 1, game_name: 'Test', comp_main: 0 }).main, null);
  assert.equal(normalizeHltb({ game_id: -1, game_name: 'Test' }), null);
});
test('routes validate queries and methods and reuse persisted ID cache', async () => {
  const env = { DB: database() }; let calls = 0;
  const provider = { detail: async id => { calls++; return { id, title: 'Elden Ring', main: 60.12 }; } };
  const req = id => new Request(`https://blog.blfy.cc/ns/api/hltb/detail?id=${id}`);
  assert.equal((await hltbRoute(req('bad'), env, provider)).status, 400);
  assert.equal((await hltbRoute(new Request(req(1), { method: 'POST' }), env, provider)).status, 405);
  assert.equal((await (await hltbRoute(req(68151), env, provider)).json()).cache, 'miss');
  assert.equal((await (await hltbRoute(req(68151), env, provider)).json()).cache, 'fresh');
  assert.equal(calls, 1);
});
