const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const yaml = require('js-yaml');
const { getSocialIcon, socialIconCatalog, validSocialUrl, validateSocialLinks } = require('../lib/social-links.cjs');

function component() {
  const external = { exports: {}, URL };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/external-links.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, external);
  const context = { exports: {}, require: name => name === 'react/jsx-runtime' ? require(name) : name.includes('social-links') ? require('../lib/social-links.cjs') : external.exports };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/about/social-wall.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports.default;
}
const links = [
  { platform: 'GitHub', nickname: '测试账号', url: 'https://github.com/example', icon: 'github' },
  { platform: '我的网站', nickname: '很长的昵称'.repeat(20), url: 'https://example.com' },
  { platform: 'Discord', nickname: '@example', url: 'https://discord.com/users/123', icon: 'discord' }
];
test('brand catalog covers all requested platforms, is unique and contains only SVG path data', () => {
  const catalog = socialIconCatalog();
  assert.ok(catalog.length > 500);
  assert.equal(new Set(catalog.map(x => x.slug)).size, catalog.length);
  for (const name of ['github','discord','youtube','bilibili','steam','playstation','xbox']) assert.ok(getSocialIcon(name), name);
  for (const icon of catalog) {
    assert.ok(icon.width > 0 && icon.height > 0);
    for (const d of icon.paths) assert.match(d, /^[a-zA-Z0-9.,\s-]+$/);
  }
  assert.equal(getSocialIcon('../../bad'), null);
});
test('URLs reject active protocols, malformed links and credentials', () => {
  for (const url of ['https://example.com/a?b=1#c', 'http://example.com']) assert.equal(validSocialUrl(url), true);
  for (const url of ['javascript:alert(1)','data:text/html,x','//example.com','/about/','https://','https://a:b@example.com',null]) assert.equal(validSocialUrl(url), false, url);
});
test('schema preserves optional old data and rejects invalid saved entries', () => {
  for (const value of [undefined, null, [], links]) assert.deepEqual(validateSocialLinks(value), []);
  for (const value of [{}, [null], [{}], [{ ...links[0], icon: 'missing' }], [{ ...links[0], platform: ' ' }], [{ ...links[0], nickname: 123 }]]) assert.ok(validateSocialLinks(value).length);
});
test('wall hides when empty; preserves order, duplicate accounts, escaping and accessible links', () => {
  const Wall = component();
  assert.equal(renderToStaticMarkup(React.createElement(Wall, {})), '');
  assert.equal(renderToStaticMarkup(React.createElement(Wall, { links: [] })), '');
  const html = renderToStaticMarkup(React.createElement(Wall, { links: [...links, {...links[0], nickname: '<script>bad</script>'}] }));
  assert.ok(html.indexOf('GitHub') < html.indexOf('我的网站'));
  assert.ok(html.indexOf('我的网站') < html.indexOf('Discord'));
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.equal((html.match(/class="social-link-card"/g) || []).length, 4);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /aria-labelledby="social-wall-title"/);
  assert.match(html, /<circle/);
  assert.throws(() => renderToStaticMarkup(React.createElement(Wall, { links: [{ ...links[0], url: 'javascript:alert(1)' }] })));
});
test('CMS exposes ordered list, independent platform and nickname, and searchable icon picker', () => {
  const config = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8'));
  const about = config.collections.find(x => x.name === 'pages').files.find(x => x.name === 'about');
  const social = about.fields.find(x => x.name === 'socialLinks');
  assert.equal(social.widget, 'list');
  assert.equal(social.required, false);
  assert.deepEqual(social.fields.map(x => x.name), ['platform', 'nickname', 'url', 'icon']);
  assert.equal(social.fields.find(x => x.name === 'icon').widget, 'social-icon');
  assert.match(fs.readFileSync('public/sveltia/index.html', 'utf8'), /social-icons.js/);
});
test('picker handles search, choice, remount and retry without changing stored value', async () => {
  let definition, control, fail = false, calls = 0;
  const context = { window: { CMS: { registerFieldType: (name, value) => { assert.equal(name, 'social-icon'); assert.equal(typeof value, 'function', 'Sveltia positional registerFieldType requires a component, not { control }'); control = value; } }, createClass: d => { definition = d; return Object.assign(function Control() {}, { definition: d }); }, h: (tag, props, ...children) => ({tag, props, children}) }, fetch: async () => { calls++; if (fail) throw Error('offline'); return {ok:true,json:async()=>socialIconCatalog()}; }, setInterval: () => {throw Error('unexpected polling');} };
  vm.runInNewContext(fs.readFileSync('public/sveltia/social-icons.js', 'utf8'), context);
  assert.equal(control.definition, definition);
  let changed;
  const instance = { ...definition, props: {value:'github',onChange:value => {changed=value;}}, state: definition.getInitialState(), setState(update) {Object.assign(this.state,update);} };
  instance.componentDidMount(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(instance.state.loaded,true);
  const walk = node => !node || typeof node !== 'object' ? [] : [node,...(node.children||[]).flat(Infinity).flatMap(walk)];
  let nodes = walk(instance.render());
  nodes.find(n=>n.tag==='input').props.onChange({target:{value:'哔哩'}});
  nodes = walk(instance.render());
  const choices = nodes.filter(n=>n.props?.className==='social-icon-choice');
  assert.equal(choices.length,2);
  choices[1].props.onClick(); assert.equal(changed,'bilibili');
  instance.componentWillUnmount();
  assert.equal(calls,1);
  // Failure and retry on a fresh page preserve the selected icon.
  vm.runInNewContext(fs.readFileSync('public/sveltia/social-icons.js','utf8'),context);
  fail=true; instance.loadIcons=definition.loadIcons; instance.componentDidMount();
  await new Promise(resolve=>setImmediate(resolve)); assert.match(instance.state.error,/加载失败/);
  fail=false; instance.loadIcons(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(instance.state.error,''); assert.equal(instance.props.value,'github');
});
