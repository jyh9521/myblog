const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const yaml = require('js-yaml');
const { validateRepository } = require('./validate-content.cjs');
const { auditLinks } = require('./audit-content-links.cjs');
function loadTs(file) {
  const context = { exports: {}, URL, URLSearchParams, require: name => require(name) };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, context); return context.exports;
}
function cms(value, game) {
  const fields = {};
  const window = { h: (type, props, ...children) => ({ type, props: props || {}, children }), createClass: x => x,
    GamePlatforms: require('../public/sveltia/game-platforms.js'), CMS: { getFieldType: () => ({ control: () => null }), registerEditorComponent: () => {}, registerFieldType: (name, field) => { fields[name] = field; } } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js', 'utf8'), { window, fetch: async () => Response.json(game) });
  let changes = 0;
  const field = fields['game-metadata'];
  const instance = { ...field, state: field.getInitialState(), props: { value, onChange: next => { instance.props.value = next; changes++; } }, setState(next) { Object.assign(this.state, next); } };
  return { instance, changes: () => changes };
}

test('refresh requires confirmation, applies only selected fields and preserves manual/latest edits', async () => {
  const old = { id: 'rawg:1', sources: { rawg: { id: '1' } }, cover: 'old-cover', description: 'manual description', releaseDate: '2001-01-01', platforms: ['PC'], selectedPlatforms: ['PC'], manualFields: ['description'] };
  const game = { ...old, cover: 'new-cover', description: 'provider description', releaseDate: '2002-01-01', fieldSources: { cover: 'rawg' } };
  const { instance, changes } = cms(old, game);
  await instance.selectGame({ title: 'Example' }, true);
  assert.equal(changes(), 0);
  assert.equal(instance.props.value.cover, 'old-cover');
  assert.ok(instance.state.pendingRefresh.changes.find(x => x.key === 'description').locked);
  instance.state.pendingRefresh.changes.find(x => x.key === 'releaseDate').selected = false;
  assert.ok(instance.render());
  instance.applyRefresh();
  assert.equal(changes(), 1);
  assert.equal(instance.props.value.cover, 'new-cover');
  assert.equal(instance.props.value.description, 'manual description');
  assert.equal(instance.props.value.releaseDate, '2001-01-01');
  const again = cms(old, game);
  await again.instance.selectGame({ title: 'Example' }, true);
  again.instance.props.value = { ...old, cover: 'edited during preview', manualFields: ['cover', 'description'] };
  again.instance.applyRefresh();
  assert.equal(again.instance.props.value.cover, 'edited during preview');
});

test('canceling preview or selecting no changes leaves original data untouched', async () => {
  const old = { id: 'rawg:1', sources: {}, title: 'Old', platforms: [] };
  const { instance, changes } = cms(old, { ...old, title: 'New' });
  await instance.selectGame({ title: 'Example' }, true);
  instance.state.pendingRefresh.changes.forEach(x => { x.selected = false; });
  instance.applyRefresh();
  assert.equal(changes(), 0);
  assert.equal(instance.props.value.title, 'Old');
  await instance.selectGame({ title: 'Example' }, true);
  const tree = instance.render();
  const nodes = []; const walk = node => { if (!node || typeof node !== 'object') return; nodes.push(node); (node.children || []).flat(Infinity).forEach(walk); }; walk(tree);
  nodes.find(node => node.type === 'button' && node.children[0] === '取消，保留原资料').props.onClick();
  assert.equal(instance.state.pendingRefresh, null);
  assert.equal(changes(), 0);
});

test('shelf URL roundtrip, defaults and deterministic ordering', () => {
  const shelf = loadTs('lib/game-shelf-state.ts');
  const state = { ...shelf.shelfDefaults, q: '吸血莱恩', platform: 'PC · PC', status: '已制作补丁', sort: 'release-old' };
  const params = shelf.writeShelfState(state, new URLSearchParams('other=keep'));
  assert.equal(params.get('other'), 'keep');
  assert.deepEqual(JSON.parse(JSON.stringify(shelf.readShelfState(params))), state);
  assert.equal(shelf.readShelfState(new URLSearchParams('sort=bad')).sort, 'updated');
  const games = [{ title: 'B', metadata: { releaseDate: '2001-01-01', updatedAt: '2026-01-01' }, platforms: [] }, { title: 'A', metadata: { releaseDate: '2002-01-01', updatedAt: '2026-02-01' }, platforms: [] }, { title: 'C', metadata: null, platforms: [] }];
  assert.deepEqual([...shelf.sortShelfGames(games, 'updated')].map(x => x.title), ['A', 'B', 'C']);
  assert.deepEqual([...shelf.sortShelfGames(games, 'release-old')].map(x => x.title), ['B', 'A', 'C']);
  assert.equal(shelf.writeShelfState(shelf.shelfDefaults).toString(), '');
});


test('content gate catches missing game references, assets, URLs and CMS search-field regressions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-validation-'));
  for (const dir of ['content/posts', 'content/games', 'public/sveltia']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'public/sveltia/config.yml'), 'backend: {name: github, repo: example/repo, branch: main}\ncollections:\n  - name: games\n    fields: [{name: title, widget: string}]\n  - name: post\n    fields:\n      - {name: related, widget: relation, collection: games, search_fields: [gameMetadata.title]}\n');
  fs.writeFileSync(path.join(root, 'content/games/example.md'), '---\ntitle: Example\n---\n');
  fs.writeFileSync(path.join(root, 'content/posts/test.md'), '---\ntitle: Test\ngameSlug: missing\n---\n![bad](/uploads/missing.png)\n[bad](/posts/gone/)\n[gframe]missing||[/gframe]\n');
  const report = await validateRepository(root);
  assert.ok(report.errors.some(x => x.includes('关联的游戏档案不存在')));
  assert.ok(report.errors.some(x => x.includes('/uploads/missing.png')));
  assert.ok(report.errors.some(x => x.includes('/posts/gone/')));
  assert.ok(report.errors.some(x => x.includes('未声明的检索字段')));
  assert.ok(report.errors.some(x => x.includes('卡片引用不存在')));
});

test('online audit distinguishes removed links from anti-bot/network uncertainty', async () => {
  const results = await auditLinks(['https://example.test/ok', 'https://example.test/missing', 'https://example.test/bot', 'https://blog.blfy.cc/ns/api/games/media?media=x'], async url => new Response('', { status: url.endsWith('ok') ? 200 : url.endsWith('missing') ? 404 : 403 }));
  assert.equal(results.find(x => x.url.endsWith('missing')).state, 'broken');
  assert.equal(results.find(x => x.url.endsWith('bot')).state, 'unknown');
  assert.equal(results.filter(x => x.state === 'dynamic-media').length, 1);
});

test('tags page/navigation removed, article tags retained and CI gates run before build', () => {
  assert.ok(!fs.existsSync('app/tags/page.tsx'));
  assert.ok(!fs.readFileSync('app/layout.tsx', 'utf8').includes('/tags/'));
  assert.ok(fs.readFileSync('app/posts/[slug]/page.tsx', 'utf8').includes('post.tags.map'));
  const runs = yaml.load(fs.readFileSync('.github/workflows/pages.yml', 'utf8')).jobs.build.steps.map(step => step.run).filter(Boolean);
  for (const gate of ['npm ci', 'npm test', 'npm run check', 'npm run validate']) assert.ok(runs.indexOf(gate) < runs.indexOf('npm run build'));
  assert.ok(!yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8')).collections.find(x => x.name === 'post').fields.some(x => x.name === 'patch'));
});
