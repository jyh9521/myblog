const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const ts = require('typescript'), vm = require('node:vm');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const profile = require('./gaming-profile-module.cjs');
const { collect, save } = require('./update-exophase.cjs');
const summary = { displayname: 'Test Profile', playtime: 10, gamesplayed: 20, total_awards: 8, progress: '12.5',
  email: 'excluded', secret_key: 'excluded', services: [
    { env: 'psn', gamesplayed: 3, total_awards: 1200 }, { env: 'nintendo', gamesplayed: 2 },
    { env: 'blizzard', gamesplayed: 0 }, { env: 'gog', gamesplayed: 1 },
  ] };
function game(id, extra = {}) { return { master_id: id, privacy: 'game-visible', lastplayed_utc: 1700000000 + id,
  earned_awards: 1, total_awards: 4, percent: 25, playtimeUnits: { hours: 2, minutes: 3 },
  meta: { title: `Game ${id}`, environment_slug: 'psn', platforms: [{ name: 'PS5' }], supports: { awards: 1, playtime: 1 },
    featured_image: 'https://m.exophase.com/test.png', endpoint_overview: 'https://www.exophase.com/game/test/' }, ...extra }; }
const stamp = '2026-10-07T00:00:00.000Z';
const fixture = () => profile.normalizeProfile(summary, { games: [game(1)] }, stamp);
const escaped = value => JSON.stringify(JSON.stringify(value)).slice(1, -1).replace(/'/g, '\\u0027');
const html = `<script>window.playerProfileId = '345';window.currentPlayerSummary = '${escaped(summary)}';window.playerGames = '${escaped({games:[game(1)]})}';</script>`;

test('public ID resolves dynamically and escaped payload parsing never evaluates JavaScript', () => {
  assert.equal(profile.resolvePlayerId(html), '345');
  assert.deepEqual(profile.embeddedJson(html, 'currentPlayerSummary'), summary);
  assert.throws(() => profile.resolvePlayerId('<title>challenge</title>'));
  assert.throws(() => profile.embeddedJson("window.playerGames = 'process.exit()'", 'playerGames'));
});
test('normalizer distinguishes game counts from awards and excludes unknown/empty platforms and private fields', () => {
  const data = fixture();
  assert.equal(data.platforms.find(p => p.id === 'psn').games, 3);
  assert.equal(data.platforms.length, 3);
  assert.equal(data.stats.completion, 12.5);
  assert.ok(!JSON.stringify(data).includes('excluded'));
  assert.ok(!JSON.stringify(data).includes('master_playerid'));
  assert.throws(() => profile.normalizeProfile({}, {}, stamp));
});
test('recent games are newest six public records with no guessed Nintendo achievements/platforms', () => {
  const games = Array.from({length:9}, (_,i)=>game(i+1));
  games.push(game(40, {privacy:'game-hidden'}));
  games.push(game(10, {meta:{ title:'Switch game', environment_slug:'nintendo', platforms:[{name:'Switch'},{name:'Switch 2'}], supports:{playtime:1, awards:0} }}));
  const data = profile.normalizeProfile(summary, {games}, stamp);
  assert.equal(data.recent.length, 6); assert.equal(data.recent[0].title, 'Switch game');
  assert.equal(data.recent[0].platform, 'Switch / Switch 2');
  assert.equal(data.recent[0].earned, undefined); assert.equal(data.recent[0].completion, undefined);
  assert.equal(data.recent[1].minutes, 123); assert.equal(data.recent[1].earned, 1);
  assert.ok(!data.recent.some(g=>g.id.endsWith('-40')));
});
test('cache validation handles missing optional metrics and rejects malformed identity/platforms and unsafe URLs', () => {
  const value = fixture(); value.stats = {};
  value.recent[0].cover = 'javascript:alert(1)'; value.recent[0].url = 'https://evil.test/game';
  const data = profile.parseGamingProfile(value);
  assert.equal(data.recent[0].cover, undefined); assert.equal(data.recent[0].url, undefined);
  assert.equal(data.stats.hours, undefined);
  assert.throws(()=>profile.parseGamingProfile({...value,username:'other'}));
  assert.throws(()=>profile.parseGamingProfile({...value,platforms:[{id:'toString',games:3}]}));
  assert.throws(()=>profile.parseGamingProfile({...value,updatedAt:'bad'}));
});
test('collector uses resolved API endpoint and falls back to real embedded game payload on API failure', async () => {
  const calls=[];
  const data = await collect(async url=>{calls.push(url); return url===profile.EXOPHASE_URL ? new Response(html) : new Response('denied',{status:403});});
  assert.equal(calls[1], 'https://api.exophase.com/public/player/345/games?page=1');
  assert.equal(data.recent.length, 1);
  const viaApi = await collect(async url=> url===profile.EXOPHASE_URL ? new Response(html) : new Response(JSON.stringify({games:[game(8)]})));
  assert.equal(viaApi.recent[0].title, 'Game 8');
  await assert.rejects(collect(async()=>new Response('blocked',{status:403})), /403/);
});
test('unchanged timestamps do not rewrite cache; failed collection leaves previous bytes intact', async () => {
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'gaming-profile-')), file=path.join(dir,'exophase.json');
  assert.equal(await save(fixture(),file),true);
  const before=await fsp.readFile(file,'utf8');
  assert.equal(await save({...fixture(),updatedAt:'2026-10-08T00:00:00Z'},file),false);
  await assert.rejects(collect(async()=>new Response('blocked',{status:403})), /403/);
  assert.equal(await fsp.readFile(file,'utf8'),before);
  await assert.rejects(save({...fixture(),version:99},file));
  assert.equal(await fsp.readFile(file,'utf8'),before);
});
function loadTs(file) {
  const exports={}, context={exports,require: name=>name.startsWith('.') ? loadTs(path.resolve(path.dirname(file),name)+ (name.includes('i18n') || name.endsWith('gaming-profile') && name.startsWith('../../lib') ? '.ts' : '.tsx')) : require(name), AbortController, fetch, setTimeout, clearTimeout};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  return exports;
}
test('UI renders Chinese/Japanese metrics, lazy covers, fixed slots, empty state and safe detail links', () => {
  const {GamingProfileContent}=loadTs(path.resolve('app/about/gaming-profile.tsx'));
  const data=fixture();
  const rendered=renderToStaticMarkup(React.createElement(GamingProfileContent,{data}));
  assert.ok(rendered.includes('总游戏时间')); assert.ok(rendered.includes('loading="lazy"'));
  assert.ok(rendered.includes('noopener noreferrer')); assert.ok(rendered.includes('gaming-cover'));
  data.recent=[]; data.stats={};
  const japanese=renderToStaticMarkup(React.createElement(GamingProfileContent,{data,locale:'ja'}));
  assert.ok(japanese.includes('公開ゲーム記録はありません')); assert.ok(!japanese.includes('総プレイ時間'));
});
test('About position, translations and maintenance workflow keep feature isolated and scheduled', () => {
  const about=fs.readFileSync('app/about/page.tsx','utf8');
  assert.ok(about.indexOf('<GamingProfile />')<about.indexOf('<GitHubContributionCalendar />'));
  const workflow=fs.readFileSync('.github/workflows/exophase.yml','utf8');
  assert.ok(workflow.includes('17 */6 * * *')); assert.ok(workflow.includes('workflow_dispatch:'));
  assert.ok(workflow.includes('gh workflow run pages.yml')); assert.ok(!workflow.includes('--force'));
  const cache=profile.parseGamingProfile(JSON.parse(fs.readFileSync('public/data/exophase.json','utf8')));
  assert.ok(cache.recent.length<=6); assert.ok(fs.statSync('public/data/exophase.json').size<15000);
});
test('browser cache access is same-origin and rejects failed or malformed responses', async () => {
  const original = global.fetch, controller = new AbortController();
  try {
    global.fetch = async (url, options) => { assert.equal(url, '/data/exophase.json'); assert.equal(options.signal, controller.signal); return new Response(JSON.stringify(fixture())); };
    assert.equal((await profile.loadGamingProfile(controller.signal)).username, profile.EXOPHASE_USERNAME);
    global.fetch = async () => new Response('missing', {status:404});
    await assert.rejects(profile.loadGamingProfile(controller.signal), /404/);
    global.fetch = async () => new Response('{}');
    await assert.rejects(profile.loadGamingProfile(controller.signal), /Invalid/);
  } finally { global.fetch = original; }
});
test('broken covers have a placeholder, stale data stays visible, and initial state is loading', () => {
  const renderer = require('react-test-renderer');
  const { default: GamingProfile, GamingProfileContent } = loadTs(path.resolve('app/about/gaming-profile.tsx'));
  const data=fixture(); data.updatedAt='2020-01-01T00:00:00Z';
  const view=renderer.create(React.createElement(GamingProfileContent,{data}));
  assert.ok(JSON.stringify(view.toJSON()).includes('当前展示最近一次成功获取的数据'));
  renderer.act(()=>view.root.findByType('img').props.onError());
  assert.equal(view.root.findAllByType('img').length,0);
  assert.ok(JSON.stringify(view.toJSON()).includes('暂无封面'));
  view.unmount();
  const loading=renderToStaticMarkup(React.createElement(GamingProfile));
  assert.ok(loading.includes('正在加载游戏档案')); assert.ok(loading.includes('aria-busy="true"'));
});
