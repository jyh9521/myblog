const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const yaml = require('js-yaml');

function loadCms(extra = {}) {
  const components = [];
  components.fieldTypes = {};
  const window = {
    h: (type, props, ...children) => ({ type, props: props || {}, children }), createClass: value => value,
    CMS: { getFieldType: () => ({ control: () => null }), registerFieldType(name, control) { components.fieldTypes[name] = control; }, registerEditorComponent: component => components.push(component) },
  };
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js', 'utf8'), { window, ...extra });
  return components;
}

function loadTs(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, URLSearchParams, Response, require: name => dependencies[name] || require(name) };
  vm.runInNewContext(code, context);
  return context.exports;
}

test('toolbar has one searchable local-game picker and uses manual title labels', () => {
  const components = loadCms();
  const gameButtons = components.filter(component => component.icon === 'sports_esports');
  assert.equal(gameButtons.length, 1);
  const [component] = gameButtons;
  assert.equal(component.id, 'game-card');
  assert.equal(component.label, '添加游戏');
  assert.equal(component.tooltip, '添加游戏');
  const field = component.fields.find(field => field.name === 'gameSlug');
  assert.equal(field.widget, 'game-archive-picker');
  assert.ok(components.fieldTypes[field.widget]);
  assert.equal(field.search_fields, undefined); // No undeclared nested relation paths.
  assert.equal(component.fields.find(field => field.name === 'title').widget, 'hidden');
  const config = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8'));
  const body = config.collections.find(collection => collection.name === 'post').fields.find(field => field.name === 'body');
  assert.ok(body.editor_components.includes(component.id));
  assert.ok(!body.editor_components.some(id => /^[pnxs]frame-card$/.test(id)));
});

test('new cards store stable slugs and legacy cards round-trip with platform and overrides intact', () => {
  const component = loadCms().find(component => component.id === 'game-card');
  assert.equal(component.toBlock({ gameSlug: 'onimusha-way-of-the-sword' }), '[gframe]onimusha-way-of-the-sword||[/gframe]');
  assert.equal(component.toBlock({ gameSlug: '../bad' }), '');
  for (const frame of ['g', 'p', 'n', 'x', 's']) {
    const block = `[${frame}frame]onimusha-way-of-the-sword|标题覆盖|已通关[/${frame}frame]`;
    const data = component.fromBlock(block.match(component.pattern));
    assert.equal(component.toBlock(data), block);
  }
});

test('article association reuses local picker and can clear an optional saved slug', () => {
  const config = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8'));
  const field = config.collections.find(collection => collection.name === 'post').fields.find(field => field.name === 'gameSlug');
  assert.equal(field.widget, 'game-archive-picker');
  assert.equal(field.required, false);
  const definition = loadCms().fieldTypes[field.widget];
  let saved = 'existing-game';
  const picker = { ...definition, props: { field: { get: key => field[key] }, value: saved, onChange: value => { saved = value; } },
    state: definition.getInitialState(), setState(next) { Object.assign(this.state, next); } };
  picker.state.entries = [{ slug: saved, title: '手动中文名称', names: ['Original Game'] }];
  assert.equal(picker.render().children[0].children[0], '手动中文名称');
  const clear = picker.render().children.find(child => child?.type === 'button' && child.children[0] === '取消关联');
  assert.ok(clear);
  clear.props.onClick();
  assert.equal(saved, '');
  picker.props.required = true;
  picker.props.field = { required: true };
  assert.ok(!picker.render().children.some(child => child?.type === 'button' && child.children[0] === '取消关联'));
});

test('Markdown recognizes generic and all legacy frames without mismatched closing tags', () => {
  const { remarkGameFrames } = loadTs('app/posts/game-frames.ts');
  for (const frame of ['g', 'p', 'n', 'x', 's']) {
    const tree = { children: [{ type: 'text', value: `前文[${frame}frame]onimusha-way-of-the-sword||[/${frame}frame]后文` }] };
    remarkGameFrames()(tree);
    assert.equal(tree.children[1].type, 'link');
    const link = new URL(tree.children[1].url);
    assert.equal(link.pathname, `/${frame}`);
    assert.equal(link.searchParams.get('slug'), 'onimusha-way-of-the-sword');
    assert.equal(tree.children[0].value, '前文');
    assert.equal(tree.children[2].value, '后文');
  }
  const tree = { children: [{ type: 'text', value: '[gframe]game[/pframe]' }] };
  remarkGameFrames()(tree);
  assert.equal(tree.children[0].type, 'text');
});

test('generic card takes the selected local platform and current manual title, not all provider platforms', () => {
  const { default: Card } = loadTs('app/games/game-frame-card.tsx', { './game-platform-card': { default: () => null } });
  const ps = { store: 'playstation', platform: 'PS5' };
  const pc = { store: 'pc', platform: 'PC' };
  const game = { title: '鬼武者：剑之道', status: '正在玩', slug: 'onimusha-way-of-the-sword', platforms: [ps, pc], metadata: { platforms: ['PC', 'PlayStation 5', 'Xbox Series X|S'] } };
  const card = Card({ frame: 'g', game });
  assert.equal(card.props.gameTitle, game.title);
  assert.equal(card.props.platform, ps);
  assert.equal(card.props.status, '正在玩');
  game.title = '手动修改后的名称';
  assert.equal(Card({ frame: 'g', game }).props.gameTitle, game.title);
  assert.equal(Card({ frame: 's', game }).props.platform, pc);
  assert.equal(Card({ frame: 'g', game, title: '旧的本文覆盖' }).props.gameTitle, game.title);
});

test('local picker opens a filterable dropdown, matches original names and saves only the slug', async () => {
  const requests = [];
  const entries = [{ slug: 'onimusha', title: '鬼武者：剑之道', names: ['Onimusha: Way of the Sword', '鬼武者：剑之道'] }];
  const components = loadCms({ fetch: async (...args) => { requests.push(args); return { ok: true, json: async () => entries }; } });
  const definition = components.fieldTypes['game-archive-picker'];
  let saved;
  const picker = { ...definition, props: { value: '', onChange: value => { saved = value; } }, state: definition.getInitialState(), alive: true,
    setState(next) { Object.assign(this.state, next); } };
  assert.equal(picker.state.open, false);
  await picker.loadEntries();
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/game-dossiers.json');
  let view = picker.render();
  view.children[0].props.onClick();
  assert.equal(picker.state.open, true);
  await picker.loadEntries();
  view = picker.render();
  const input = view.children[1].children[0];
  assert.equal(input.props.role, 'combobox');
  input.props.onChange({ target: { value: 'onimusha' } });
  assert.equal(picker.options().length, 1);
  for (const query of ['鬼武者', 'ONIMUSHA', 'way of the sword', 'Way-of-the-Sword']) {
    picker.state.query = query;
    assert.equal(picker.options()[0].title, '鬼武者：剑之道');
  }
  picker.state.query = '不存在';
  assert.equal(picker.options().length, 0);
  picker.choose(entries[0]);
  assert.equal(saved, 'onimusha');
  assert.equal(picker.state.open, false);
  assert.ok(requests.every(([url]) => url === '/game-dossiers.json')); // Never searches RAWG or ScreenScraper.
  assert.ok(!components.fieldTypes['game-metadata'], 'dossier editing is registered separately from the article picker');
});

test('local picker errors preserve selection and offer retry', async () => {
  const components = loadCms({ fetch: async () => ({ ok: false }) });
  const definition = components.fieldTypes['game-archive-picker'];
  const picker = { ...definition, props: { value: 'existing-game', onChange() { assert.fail('fetch error must not clear saved slug'); } },
    state: definition.getInitialState(), alive: true, setState(next) { Object.assign(this.state, next); } };
  await picker.loadEntries();
  assert.ok(picker.state.error);
  assert.equal(picker.state.loading, false);
  assert.equal(picker.props.value, 'existing-game');
});

test('local archive index includes search names but excludes secrets and manual notes', async () => {
  const { GET } = loadTs('app/game-dossiers.json/route.ts', { '../../lib/games': { getGames: () => [{ slug: 'onimusha', title: '鬼武者', manual: { notes: 'private note' }, metadata: { title: 'Onimusha', originalName: '鬼武者 原名', alternativeNames: ['Alias'] } }] } });
  const data = await GET().json();
  assert.deepEqual(Object.keys(data[0]), ['slug', 'title', 'names']);
  assert.equal(data[0].title, '鬼武者');
  assert.ok(data[0].names.includes('Onimusha'));
  assert.ok(data[0].names.includes('鬼武者 原名'));
  assert.ok(!JSON.stringify(data).includes('private note'));
});
