const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const yaml = require('js-yaml');

function separator() {
  const components = [];
  const window = { h: () => null, createClass: value => value, CMS: {
    getFieldType: () => ({ control: () => null }), registerFieldType() {},
    registerEditorComponent: value => components.push(value),
  } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js', 'utf8'), { window });
  return components.find(component => component.id === 'horizontal-rule');
}

test('separator is a direct toolbar button with no fields and standard Markdown output', () => {
  const component = separator();
  assert.ok(component);
  assert.equal(component.trigger, 'button');
  assert.equal(component.label, '插入分隔线');
  assert.equal(component.icon, 'horizontal_rule');
  assert.equal(component.fields.length, 0);
  assert.equal(component.toBlock({}), '\n\n---\n\n');
  assert.equal(component.toPreview({}), '<hr />');
  assert.ok(component.pattern.test('---'));
  const config = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8'));
  const body = config.collections.find(collection => collection.name === 'post').fields.find(field => field.name === 'body');
  for (const id of ['horizontal-rule', 'game-card', 'image-compare', 'code-block', 'r2-image']) assert.ok(body.editor_components.includes(id));
});

test('inserted separator renders an hr without turning adjacent paragraphs into headings', async () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { default: Markdown } = await import('react-markdown');
  const content = '项目背景正文' + separator().toBlock({}) + '## 技术说明\n\n后面的正文';
  const html = renderToStaticMarkup(React.createElement(Markdown, null, content));
  assert.ok(html.includes('<p>项目背景正文</p>'));
  assert.equal((html.match(/<hr\/>/g) || []).length, 1);
  assert.ok(html.includes('<h2>技术说明</h2>'));
  assert.ok(html.includes('<p>后面的正文</p>'));
});
