const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const matter = require('gray-matter');

function instance(def, props) {
  return { ...def, state: def.getInitialState(), props, setState(change) { Object.assign(this.state, change); } };
}
function descendants(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.children || []).flat(Infinity).flatMap(descendants)];
}
function cms(value, request) {
  const fields = {};
  const window = {
    h: (type, props, ...children) => ({ type, props: props || {}, children }), createClass: spec => spec,
    GamePlatforms: require('../public/sveltia/game-platforms.js'), BlogAdminAuth: { request },
    CMS: { registerEditorComponent() {}, getFieldType: () => ({ control: () => null }), registerFieldType: (name, spec) => { fields[name] = spec; } },
  };
  vm.runInNewContext(fs.readFileSync('public/sveltia/game-dossier.js', 'utf8'), { window, fetch() { assert.fail('new sources use the CMS admin session'); } });
  let updates = 0;
  const field = instance(fields['game-metadata'], { value, onChange(next) { field.props.value = next; updates++; } });
  const nodes = descendants(field.render());
  const cover = nodes.find(node => node.props.className === 'game-cover-field');
  assert.ok(cover);
  const picker = descendants(cover).find(node => node.type?.loadGrids);
  return { field, picker: instance(picker.type, picker.props), updates: () => updates, nodes };
}

const originalCover = 'https://example.com/original.png';
const selectedCover = 'https://cdn2.steamgriddb.com/grid/test.png';
const game = { id: 'thegamesdb:35', title: 'Fixture Quest', originalName: 'Fixture Quest', description: 'Upstream summary',
  releaseDate: '2011-04-19', platforms: ['PC'], developers: ['Fixture Dev'], publishers: ['Fixture Pub'], genres: ['Puzzle'],
  sources: { thegamesdb: { id: '35' } }, fieldSources: { title: 'thegamesdb' }, cover: 'must-not-be-used', screenshots: ['must-not-be-used'] };

test('CMS entry loads the versioned cover styles and updated admin/field scripts', () => {
  const html = fs.readFileSync('public/sveltia/index.html', 'utf8');
  assert.match(html, /game-cover-search\.css\?v=20261109/);
  assert.match(html, /admin-auth\.js\?v=game-brief-20261109/);
  assert.match(html, /game-dossier\.js\?v=brief-direct-20261109/);
});

test('TheGamesDB option imports and refreshes game fields only, including after reopening', async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, body: options && JSON.parse(options.body) });
    if (!options) return Response.json({ results: [game] });
    return Response.json(options.body.includes('"refresh":true') ? { ...game, releaseDate: '2011-04-20', developers: [] } : game);
  };
  const c = cms({ cover: originalCover, description: 'Manual summary', localizedName: '手写名称',
    selectedPlatforms: ['Nintendo Switch'], screenshots: ['https://example.com/keep.png'], fieldSources: { cover: 'rawg', description: 'manual' }, manualFields: ['description'] }, request);
  assert.ok(c.nodes.some(node => node.type === 'option' && node.props.value === 'thegamesdb' && node.children[0] === 'TheGamesDB'));
  c.field.state.dataSource = 'thegamesdb'; c.field.state.query = 'Fixture Quest';
  await c.field.searchGames();
  assert.equal(c.updates(), 0);
  await c.field.selectGame(c.field.state.results[0]);
  assert.equal(calls[0].path, '/ns/api/games/search?q=Fixture%20Quest&source=thegamesdb');
  assert.equal(calls[1].body.sources.thegamesdb.id, '35');
  assert.equal(calls[1].body.dataSource, 'thegamesdb');
  const data = c.field.props.value;
  assert.equal(data.title, 'Fixture Quest');
  assert.equal(data.description, 'Manual summary');
  assert.equal(data.localizedName, '手写名称');
  assert.equal(data.cover, originalCover);
  assert.deepEqual(data.screenshots, ['https://example.com/keep.png']);
  assert.equal(data.fieldSources.cover, 'rawg');
  assert.deepEqual(data.selectedPlatforms, ['Nintendo Switch']);
  const reopened = cms(matter(matter.stringify('', { gameMetadata: JSON.parse(JSON.stringify(data)) })).data.gameMetadata, request);
  await reopened.field.selectGame({ title: data.title, sources: data.sources }, true);
  assert.equal(calls[2].body.dataSource, 'thegamesdb', 'refresh follows the saved source, not the default dropdown');
  assert.deepEqual(Array.from(reopened.field.state.pendingRefresh.changes, x => x.key), ['releaseDate']);
  reopened.field.applyRefresh();
  assert.equal(reopened.field.props.value.releaseDate, '2011-04-20');
  assert.equal(reopened.field.props.value.cover, originalCover);
  assert.equal(reopened.field.props.value.developers[0], 'Fixture Dev', 'missing upstream values never erase old metadata');
});

test('SteamGridDB search and selection changes only the cover and protects it from later imports', async () => {
  const paths = [];
  const c = cms({ cover: originalCover, title: 'Fixture Quest', originalName: 'Fixture Quest', developers: ['Existing'] }, async path => {
    paths.push(path);
    if (path.includes('/covers/search')) return Response.json({ results: [{ id: '56', title: 'Fixture Quest', year: 2011 }] });
    if (path.includes('/covers?')) return Response.json({ results: [{ id: '9', url: selectedCover, thumb: selectedCover, width: 600, height: 900 }], page: 0, hasMore: true });
    return Response.json(game);
  });
  c.picker.toggle();
  assert.equal(c.picker.state.query, 'Fixture Quest');
  await c.picker.search();
  await c.picker.loadGrids(c.picker.state.games[0]);
  assert.equal(c.updates(), 0);
  assert.deepEqual(paths, ['/ns/api/games/covers/search?q=Fixture%20Quest', '/ns/api/games/covers?gameId=56&page=0']);
  const nodes = descendants(c.picker.render());
  assert.ok(nodes.some(node => node.type === 'img' && node.props.src === selectedCover));
  nodes.find(node => node.type === 'button' && node.props['aria-label']?.startsWith('选用封面')).props.onClick();
  assert.equal(c.updates(), 1);
  assert.equal(c.field.props.value.cover, selectedCover);
  assert.equal(c.field.props.value.fieldSources.cover, 'steamgriddb');
  assert.deepEqual(Array.from(c.field.props.value.manualFields), ['cover']);
  assert.deepEqual(c.field.props.value.developers, ['Existing']);
  c.field.update('cover', selectedCover); // blur without editing the URL
  assert.equal(c.field.props.value.fieldSources.cover, 'steamgriddb');
  c.field.state.dataSource = 'thegamesdb';
  await c.field.selectGame(game);
  assert.equal(c.field.props.value.cover, selectedCover);
  assert.equal(c.field.props.value.fieldSources.cover, 'steamgriddb');
  c.field.update('cover', 'https://example.com/replacement.png');
  assert.equal(c.field.props.value.fieldSources.cover, 'manual');
});

test('closing a pending cover search discards the late response and never edits the URL', async () => {
  let respond;
  const c = cms({ cover: originalCover, title: 'Fixture Quest' }, () => new Promise(resolve => { respond = resolve; }));
  c.picker.toggle();
  const pending = c.picker.search();
  c.picker.toggle();
  respond(Response.json({ results: [{ id: '99', title: 'Late' }] }));
  await pending;
  assert.equal(c.picker.state.open, false);
  assert.equal(c.picker.state.games.length, 0);
  assert.equal(c.updates(), 0);
});
