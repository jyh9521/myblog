const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function widget(fetcher) {
  const types = {};
  const window = { h: () => null, createClass: x => x, CMS: { registerFieldType: (name, field) => { types[name] = field; } } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/hltb.js', 'utf8'), { window, URL, AbortController, fetch: fetcher });
  const field = types['hltb-game']; let value = { main: 55 };
  const instance = { ...field, state: field.getInitialState(), props: { value, onChange: next => { value = next; instance.props.value = next; } }, setState(patch) { Object.assign(this.state, patch); } };
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
