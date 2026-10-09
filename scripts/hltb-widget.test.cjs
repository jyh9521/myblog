const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function widget(fetcher, realWait = false) {
  const types = {};
  const window = { h: () => null, createClass: x => x, CMS: { registerFieldType: (name, field) => { types[name] = field; } } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/hltb.js', 'utf8'), { window, URL, AbortController, setTimeout, clearTimeout, fetch: fetcher });
  const field = types['hltb-game']; let value = { main: 55 };
  const instance = { ...field, state: field.getInitialState(), props: { value, onChange: next => { value = next; instance.props.value = next; } }, setState(patch) { Object.assign(this.state, patch); } };
  if (!realWait) instance.waitForRetry = async () => {};
  return { instance, value: () => value };
}
test('CMS search does not auto-associate and explicit selection saves ID/snapshot preserving overrides', async () => {
  const game = { id: 68151, title: 'Elden Ring', url: 'https://howlongtobeat.com/game/68151' };
  const requests = [];
  const control = widget(async url => { requests.push(url); return Response.json(url.includes('/search') ? { results: [game] } : { ...game, main: 60.12, extras: 101.4, completionist: 136.2, cache: 'fresh', updatedAt: '2026-10-08T00:00:00Z' }); });
  control.instance.state.query = 'Elden Ring'; await control.instance.search();
  assert.equal(control.value().id, undefined);
  await control.instance.select(game);
  assert.equal(control.value().id, 68151); assert.equal(control.value().main, 55); assert.equal(control.value().snapshot.main, 60.12);
  control.instance.link('https://howlongtobeat.com/game/10270');
  assert.equal(control.value().id, 10270); assert.equal(control.value().snapshot, undefined);
  assert.equal(requests.length, 2);
});
test('CMS source failure reports status without modifying saved values', async () => {
  const control = widget(async () => Response.json({ error: 'Unavailable' }, { status: 503 }));
  control.instance.state.query = 'Test'; await control.instance.search();
  assert.equal(control.instance.state.message, 'Unavailable'); assert.equal(control.instance.state.busy, false); assert.equal(control.value().main, 55);
});
test('CMS shows retry seconds on cooldown without overwriting saved reference fields', async () => {
  const control = widget(async () => Response.json({ error: '暂时无法获取 HLTB 数据。', retryAfter: 60 }, { status: 503 }));
  control.instance.state.query = "Assassin's Creed Black Flag Resynced"; await control.instance.search();
  assert.equal(control.instance.state.message, '暂时无法获取 HLTB 数据。 请在 60 秒后重试。');
  assert.equal(control.value().main, 55); assert.equal(control.instance.state.busy, false);
});

test('CMS retries a source cooldown once using the identical name, without changing saved identity', async () => {
  const game = { id: 16630, title: 'Danganronpa: Trigger Happy Havoc' }; const urls = []; const waits = [];
  const control = widget(async url => { urls.push(url); return urls.length === 1 ? Response.json({ code: 'HLTB_RETRY_COOLDOWN', error: 'HLTB 请求正在等待重试，不是游戏名称匹配失败。', retryAfter: 60 }, { status: 503 }) : Response.json({ results: [game] }); });
  control.instance.waitForRetry = async seconds => { waits.push(seconds); assert.ok(control.instance.state.message.includes('不是名称匹配失败')); };
  control.instance.state.query = game.title;
  await control.instance.search();
  assert.deepEqual(waits, [60]); assert.equal(urls.length, 2); assert.equal(urls[0], urls[1]);
  assert.equal(control.instance.state.results[0].id, 16630); assert.equal(control.value().id, undefined);
  assert.equal(control.instance.state.busy, false);
});
test('CMS stops after one retry and distinguishes empty matches from failed requests', async () => {
  let calls = 0;
  const down = widget(async () => { calls++; return Response.json({ error: 'HLTB 数据请求本次失败，不是游戏名称匹配失败。', retryAfter: 60 }, { status: 503 }); });
  down.instance.state.query = 'Danganronpa'; await down.instance.search();
  assert.equal(calls, 2); assert.ok(down.instance.state.message.includes('不是游戏名称匹配失败')); assert.equal(down.value().main, 55);
  calls = 0;
  const empty = widget(async () => { calls++; return Response.json({ results: [] }); });
  empty.instance.state.query = 'Danganronpa'; await empty.instance.search();
  assert.equal(calls, 1); assert.ok(empty.instance.state.message.includes('没有找到游戏'));
});
test('aborting the cooldown cancels retry and leaves saved data unchanged', async () => {
  let calls = 0;
  const control = widget(async () => { calls++; return Response.json({ error: 'Cooldown', retryAfter: 60 }, { status: 503 }); });
  control.instance.waitForRetry = async () => control.instance.controller.abort();
  control.instance.state.query = 'Danganronpa'; await control.instance.search();
  assert.equal(calls, 1); assert.equal(control.value().main, 55); assert.equal(control.instance.state.busy, false);
});
test('detail retry verifies the exact ID and retains manual reference overrides', async () => {
  let calls = 0;
  const control = widget(async () => ++calls === 1 ? Response.json({ error: 'Cooldown', retryAfter: 1 }, { status: 503 }) : Response.json({ id: 16630, main: 25, cache: 'fresh' }));
  await control.instance.select({ id: 16630, title: 'Danganronpa', url: 'https://howlongtobeat.com/game/16630' });
  assert.equal(calls, 2); assert.equal(control.value().id, 16630); assert.equal(control.value().main, 55); assert.equal(control.value().snapshot.main, 25);
});

test('the actual retry timer resolves and abort clears a pending long wait', async () => {
  const control = widget(async () => Response.json({ results: [] }), true);
  const controller = new AbortController();
  await control.instance.waitForRetry(0, controller.signal);
  const pending = control.instance.waitForRetry(60, controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});
