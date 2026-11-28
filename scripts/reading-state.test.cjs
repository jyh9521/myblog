const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = require('node:path').join(__dirname, '../lib/reading-state.ts');
function api() {
  assert.ok(fs.existsSync(file), 'reading-state validates preferences and persisted resume positions');
  const module = { exports: {} };
  new Function('exports', 'module', ts.transpile(fs.readFileSync(file, 'utf8'), { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }))(module.exports, module);
  return module.exports;
}
function storage() { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
const now = 1800000000000, path = '/posts/example/';
const position = { version: 1, path, heading: 'section-2', scrollY: 1500, progress: .4, updatedAt: now };

test('preference presets clamp invalid ranges and resume remains opt-in', () => {
  const { clampReadingPreferences: clamp } = api();
  assert.deepEqual(clamp(null), { fontSize: 0, lineSpacing: 1, rememberPosition: false });
  assert.deepEqual(clamp({ fontSize: 99, lineSpacing: -3, rememberPosition: true }), { fontSize: 2, lineSpacing: 0, rememberPosition: true });
  assert.deepEqual(clamp({ fontSize: '2', lineSpacing: NaN, rememberPosition: 'true' }), { fontSize: 0, lineSpacing: 1, rememberPosition: false });
  assert.deepEqual(clamp({ fontSize: 1.8, lineSpacing: Infinity }), { fontSize: 2, lineSpacing: 1, rememberPosition: false });
});

test('preferences round-trip only supported fields and tolerate malformed storage', () => {
  const a = api(), s = storage();
  assert.equal(a.writeReadingPreferences(s, { fontSize: 1, lineSpacing: 2, rememberPosition: true, secret: 'never' }), true);
  assert.deepEqual(a.readReadingPreferences(s), { fontSize: 1, lineSpacing: 2, rememberPosition: true });
  assert.equal([...s.data.values()].some(x => x.includes('secret')), false);
  s.setItem(a.READING_PREFERENCES_KEY, '{');
  assert.deepEqual(a.readReadingPreferences(s), { fontSize: 0, lineSpacing: 1, rememberPosition: false });
});

test('unavailable and full browser storage never prevents reading', () => {
  const a = api(), denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  assert.deepEqual(a.readReadingPreferences(denied), { fontSize: 0, lineSpacing: 1, rememberPosition: false });
  assert.equal(a.writeReadingPreferences(denied, {}), false);
  assert.equal(a.readReadingPosition(denied, path, now), null);
  assert.equal(a.writeReadingPosition(denied, position), false);
  assert.equal(a.removeReadingPosition(denied, path), false);
});

test('resume position serialization never includes article text or arbitrary fields', () => {
  const a = api(), s = storage();
  assert.equal(a.writeReadingPosition(s, { ...position, body: 'private text', title: 'private title' }), true);
  assert.deepEqual(a.readReadingPosition(s, path, now), position);
  assert.equal([...s.data.values()].some(x => x.includes('private')), false);
  assert.equal(a.removeReadingPosition(s, path), true);
  assert.equal(a.readReadingPosition(s, path, now), null);
});

test('resume rejects mismatched routes, malformed values, expired and future positions', () => {
  const a = api(), s = storage();
  for (const bad of [{ ...position, scrollY: -1 }, { ...position, scrollY: Infinity }, { ...position, progress: 3 }, { ...position, version: 2 }, { ...position, path: '/posts/example/#private' }, { ...position, path: 'https://other.test/posts/a/' }]) assert.equal(a.writeReadingPosition(s, bad), false);
  a.writeReadingPosition(s, position);
  assert.equal(a.readReadingPosition(s, '/posts/other/', now), null);
  assert.equal(a.readReadingPosition(s, path, now + 31 * 86400000), null);
  assert.equal(a.readReadingPosition(s, path, now - 60000), null);
});

test('resume prompt is opt-in, long-article only and never supersedes fragments or native history', () => {
  const a = api(), state = { position, path, hash: '', navigationType: 'navigate', historyRestored: false, longArticle: true, enabled: true, scrollY: 0 };
  assert.equal(a.shouldOfferReadingResume(state), true);
  for (const override of [{ enabled: false }, { longArticle: false }, { hash: '#section-1' }, { path: '/posts/other/' }, { navigationType: 'back_forward' }, { historyRestored: true }, { scrollY: 300 }, { position: null }, { position: { ...position, scrollY: 80 } }, { position: { ...position, progress: .99 } }]) assert.equal(a.shouldOfferReadingResume({ ...state, ...override }), false, JSON.stringify(override));
});

test('pre-paint preference bootstrap validates storage without touching browser scroll restoration', () => {
  const { readingPreferencesBootstrap } = api();
  assert.equal(typeof readingPreferencesBootstrap, 'string');
  for (const [raw, expected] of [['null', ['17px', '1.95']], ['{"fontSize":2,"lineSpacing":2}', ['21px', '2.2']], ['{"fontSize":99,"lineSpacing":-4}', ['21px', '1.7']], ['{"fontSize":"2","lineSpacing":null}', ['17px', '1.95']]]) {
    const values = new Map();
    require('node:vm').runInNewContext(readingPreferencesBootstrap, { localStorage: { getItem: () => raw }, document: { documentElement: { style: { setProperty: (key, value) => values.set(key, value) } } }, scrollTo: () => assert.fail('bootstrap must not restore a position') });
    assert.deepEqual([values.get('--reading-font-size'), values.get('--reading-line-spacing')], expected);
  }
  assert.doesNotThrow(() => require('node:vm').runInNewContext(readingPreferencesBootstrap, { get localStorage() { throw Error('denied'); } }));
});
