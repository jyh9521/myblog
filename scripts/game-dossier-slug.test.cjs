const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const yaml = require('js-yaml');

test('the games Slug template follows the catalog title and remains editable', async () => {
  const games = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8')).collections.find(c => c.name === 'games');
  assert.equal(games.slug.template, '{{gameMetadata.title | game_dossier_slug}}');
  assert.equal(games.slug.editable, true);
  const transformations = {};
  const fields = {};
  const window = {
    h() {},
    createClass: spec => spec,
    BlogAdminAuth: { request: async () => Response.json({
      id: 'thegamesdb:35', title: 'Dynasty Warriors: Origins', sources: { thegamesdb: { id: '35' } },
    }) },
    CMS: {
      registerFieldType(name, spec) { fields[name] = spec; },
      registerStringTransformation(name, transform) { transformations[name] = transform; },
    },
  };
  vm.runInNewContext(fs.readFileSync('public/sveltia/game-dossier.js', 'utf8'), { window });
  const getSlug = transformations.game_dossier_slug;
  assert.equal(typeof getSlug, 'function');
  const widget = {
    ...fields['game-metadata'],
    props: { value: {}, onChange(next) { widget.props.value = next; } },
    setState(next) { Object.assign(this.state, next); },
  };
  widget.state = widget.getInitialState();
  await widget.selectGame({ title: 'Search candidate', sources: { thegamesdb: { id: '35' } } });
  assert.equal(getSlug(widget.props.value.title), 'dynasty-warriors-origins');
  for (const [title, slug] of [
    ["Super Mario Bro's", 'super-mario-bros'],
    ['Bro\u2018s  Quest', 'bros-quest'],
    ['Bro\u2019s\tQuest', 'bros-quest'],
    ['  Pok\u00e9mon  -  Version 2  ', 'pokemon-version-2'],
  ]) {
    assert.equal(getSlug(title), slug);
    assert.match(slug, new RegExp(games.slug.pattern[0]));
  }
  assert.equal(getSlug(undefined), '');
});
