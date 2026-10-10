const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, overrides = {}) {
  const context = { exports: {}, require, URLSearchParams, process, ...overrides };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
test('updated sort uses actual dossier edits rather than provider refresh and compares time zones correctly', () => {
  const shelf = load('lib/game-shelf-state.ts');
  const games = [
    { title: 'Old', updatedAt: '2026-10-07T00:00:00Z', metadata: { updatedAt: '2026-10-08' }, platforms: [] },
    { title: 'New', updatedAt: '2026-10-08T01:00:00Z', metadata: { updatedAt: '2020-01-01' }, platforms: [] },
    { title: 'Middle', updatedAt: '2026-10-08T09:30:00+09:00', metadata: null, platforms: [] },
  ];
  assert.deepEqual(Array.from(shelf.sortShelfGames(games, 'updated'), g => g.title), ['New', 'Middle', 'Old']);
  assert.equal(require('js-yaml').load(fs.readFileSync('.github/workflows/pages.yml', 'utf8')).jobs.build.steps[0].with['fetch-depth'], 0);
});
test('timeline keeps CMS order including undated records and preserves literal line breaks', () => {
  const source = '---\ntitle: Test\nevents:\n  - {date: 2020-03-14, title: Start}\n  - title: AFK\n    note: |-\n      First line\n      Second line\n  - {date: 2019-01-01, title: Last}\n---\n';
  const games = load('lib/games.ts', { require: name => name === 'node:fs' ? { existsSync: () => true, readdirSync: () => ['fixture.md'], readFileSync: () => source } : name === 'node:child_process' ? { execFileSync: () => 'DATE:2026-10-08T01:00:00Z\ncontent/games/fixture.md\n' } : name === './game-status' ? { normalizeGameStatus: () => 'AFK' } : name === './game-projects' ? { normalizeProjects: () => [] } : name === './game-time' ? load('lib/game-time.ts') : name === '../public/sveltia/game-platforms.js' ? require('../public/sveltia/game-platforms.js') : require(name) }).getGames();
  assert.deepEqual(Array.from(games[0].events, e => e.title), ['Start', 'AFK', 'Last']);
  assert.equal(games[0].events[1].note, 'First line\nSecond line');
  assert.equal(games[0].updatedAt, '2026-10-08T01:00:00Z');
  const page = fs.readFileSync('app/games/[slug]/page.tsx', 'utf8');
  assert.match(page, /game.events.map/); assert.doesNotMatch(page, /\.reverse\(/);
  assert.match(fs.readFileSync('app/style.css', 'utf8'), /\.game-event-note\{white-space:pre-wrap/);
});
test('back restoration tracks card offset across async layout shifts and stops on user scroll', () => {
  let y = 900, cardTop = 1000, onResize, nextFrame, timer, disconnected = false;
  const listeners = {};
  const card = { dataset: { gameSlug: 'example' }, getBoundingClientRect: () => ({ top: cardTop - y, bottom: cardTop - y + 200 }) };
  const history = { state: { next: 'keep' }, replaceState: value => { history.state = value; } };
  const window = { get scrollY() { return y; }, scrollTo: value => { y = value.top; }, addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: name => { delete listeners[name]; } };
  const scroll = load('lib/game-shelf-scroll.ts', { history, window, document: { querySelectorAll: () => [card], documentElement: {} }, ResizeObserver: class { constructor(fn) { onResize = fn; } observe() {} disconnect() { disconnected = true; } }, requestAnimationFrame: fn => { nextFrame = fn; return 1; }, cancelAnimationFrame() {}, setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {} });
  assert.equal(typeof scroll.restoreShelfPosition(), 'function');
  scroll.saveShelfPosition(); assert.equal(history.state.next, 'keep'); assert.equal(history.state.gameShelfPosition.offset, 100);
  y = 0; const stop = scroll.restoreShelfPosition(); assert.equal(y, 900);
  cardTop = 1300; onResize(); nextFrame(); assert.equal(y, 1200);
  listeners.wheel(); assert.equal(disconnected, true); y = 100; nextFrame(); assert.equal(y, 100);
  stop(); timer(); assert.equal(Object.keys(listeners).length, 0);
});

test('pagination defaults to 15, clamps empty/end pages and persists page in URL',()=>{
 const shelf=load('lib/game-shelf-state.ts');
 assert.equal(shelf.shelfPageSize,15);
 for(const [total,input,page,start,end] of [[107,'1',1,0,15],[107,'2',2,15,30],[107,'8',8,105,107],[107,'999',8,105,107],[0,'2',1,0,0],[16,'bad',1,0,15],[15,'2',1,0,15]]){
  const result=shelf.shelfPagination(total,input);assert.equal(result.page,page);assert.equal(result.start,start);assert.equal(result.end,end);
 }
 const params=shelf.writeShelfState({...shelf.shelfDefaults,page:'3',q:'死亡搁浅'});
 assert.equal(shelf.readShelfState(params).page,'3');assert.equal(shelf.readShelfState(params).q,'死亡搁浅');
 for(const invalid of ['-1','0','1.5','Infinity','9007199254740992'])assert.equal(shelf.readShelfState(new URLSearchParams({page:invalid})).page,'1');
 const ui=fs.readFileSync('app/games/game-shelf.tsx','utf8');assert.match(ui,/filteredGames\.slice\(pagination.start, pagination.end\)/);assert.match(ui,/page: key === 'page' \? value : '1'/);
});
