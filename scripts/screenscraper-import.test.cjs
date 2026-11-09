const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const matter = require('gray-matter');
const yaml = require('js-yaml');

test('CMS ScreenScraper search, import and Markdown round-trip preserve manual fields', async () => {
  const fields = {};
  const metadata = { id: 'screenscraper:123', title: 'Chrono Trigger', originalName: 'Chrono Trigger',
    description: 'Imported synopsis', platforms: ['Super Nintendo'],
    cover: 'https://blog.blfy.cc/ns/api/games/media?systemeid=4&jeuid=123&media=box-2D(us)',
    sources: { screenscraper: { id: '123', systemId: '4' } }, screenshots: [], genres: ['RPG'] };
  const window = { h: () => null, createClass: value => value, CMS: {
    getFieldType: () => ({ control: () => null }), registerFieldType: (name, field) => { fields[name] = field; }, registerEditorComponent: () => {},
  } };
  const calls = [];
  vm.runInNewContext(fs.readFileSync('public/sveltia/game-dossier.js', 'utf8'), { window, fetch: async (url, options) => {
    calls.push([url, options]);
    return Response.json(options ? metadata : { results: [metadata], warnings: [] });
  } });
  const field = fields['game-metadata'];
  let imported;
  const instance = { ...field, state: { ...field.getInitialState(), query: 'Chrono Trigger', dataSource: 'screenscraper' },
    props: { value: { description: 'My own notes', manualFields: ['description'] }, onChange: value => { imported = value; } },
    setState(value) { Object.assign(this.state, value); } };
  await instance.searchGames();
  assert.equal(instance.state.results.length, 1);
  await instance.selectGame(instance.state.results[0]);
  assert.ok(calls[0][0].endsWith('source=screenscraper'));
  assert.equal(JSON.parse(calls[1][1].body).sources.screenscraper.systemId, '4');
  assert.equal(imported.description, 'My own notes');
  assert.equal(imported.cover, metadata.cover);
  imported.selectedPlatforms = ['Super Nintendo'];
  const saved = matter(matter.stringify('', { title: '时空之轮', status: ['想玩'], gameMetadata: JSON.parse(JSON.stringify(imported)) }));
  assert.equal(saved.data.title, '时空之轮');
  assert.equal(saved.data.gameMetadata.sources.screenscraper.id, '123');
  assert.deepEqual(saved.data.gameMetadata.selectedPlatforms, ['Super Nintendo']);
});

test('published article slug remains editable separately from title', () => {
  const post = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8')).collections.find(c => c.name === 'post');
  assert.equal(post.slug.editable, true);
  assert.ok(post.slug.hint.includes('/posts/'));
  const pattern = new RegExp(post.slug.pattern[0]);
  assert.ok(pattern.test('my-wish-list'));
  assert.ok(!pattern.test('../invalid'));
  assert.equal(post.folder, '/content/posts');
});
