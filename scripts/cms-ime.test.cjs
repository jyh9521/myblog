const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(name, value = {}) {
  const fields = {};
  const window = { h: (type, props, ...children) => ({ type, props: props || {}, children }), createClass: spec => spec,
    CMS: { getFieldType: () => ({ control() {} }), registerEditorComponent() {}, registerFieldType: (name, spec) => fields[name] = spec } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js', 'utf8'), { window });
  const changes = [];
  const field = { ...fields[name], props: { value, onChange(next) { changes.push(next); field.props.value = next; } }, setState(next) { Object.assign(this.state, next); } };
  field.state = field.getInitialState();
  function walk(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of (Array.isArray(node) ? node : node.children || [])) { const found = walk(child, predicate); if (found) return found; }
  }
  function input(label) {
    const node = walk(field.render(), node => node.type === 'label' && node.children[0]?.children?.[0] === label);
    assert.ok(node, label);
    const element = node.children[1];
    const instance = { ...element.type, props: element.props, setState(next) { Object.assign(this.state, next); } };
    instance.state = instance.getInitialState();
    return instance;
  }
  return { field, changes, input };
}
const event = (value, composing = false) => ({ target: { value }, nativeEvent: { isComposing: composing } });
function compose(input, value) {
  input.render().props.onFocus();
  input.render().props.onCompositionStart();
  input.render().props.onChange(event('zhong', true));
  input.render().props.onChange(event(value, true));
}
test('metadata keeps Chinese IME drafts local and publishes confirmed text exactly once', () => {
  const { input, changes } = setup('game-metadata');
  const control = input('中文本地化名称');
  compose(control, '中文游戏');
  assert.equal(changes.length, 0);
  assert.equal(control.render().props.value, '中文游戏');
  control.render().props.onCompositionEnd(event('中文游戏'));
  control.render().props.onChange(event('中文游戏'));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].localizedName, '中文游戏');
  assert.ok(changes[0].manualFields.includes('localizedName'));
});
test('manual notes and store fields preserve Chinese composition and line breaks', () => {
  for (const label of ['人工备注', '渠道名称', '地区（可选）', '备注（可选）']) {
    const { input, changes } = setup('game-manual', { officialStores: [{ name: 'Steam', url: '' }] });
    const control = input(label);
    compose(control, '中文\n第二行');
    assert.equal(changes.length, 0);
    control.render().props.onCompositionEnd(event('中文\n第二行'));
    assert.equal(changes.length, 1);
    assert.ok(JSON.stringify(changes[0]).includes('中文\\n第二行'));
  }
});
test('comma separated aliases retain editing draft while saving parsed Chinese names', () => {
  const { input, changes } = setup('game-metadata');
  const control = input('别名 / Alternative Names');
  compose(control, '中文，别名');
  assert.equal(changes.length, 0);
  control.render().props.onCompositionEnd(event('中文，别名'));
  assert.equal(JSON.stringify(changes[0].alternativeNames), '["中文","别名"]');
  control.render().props.onChange(event('中文，别名，'));
  assert.equal(control.render().props.value, '中文，别名，');
});
test('ordinary typing, Chinese paste and external resets remain editable', () => {
  const { input, changes } = setup('game-metadata');
  const control = input('中文本地化名称');
  control.render().props.onChange(event('中文'));
  assert.equal(changes[0].localizedName, '中文');
  const previous = control.props;
  control.props = { ...previous, value: '刷新名称' };
  control.componentDidUpdate(previous);
  assert.equal(control.render().props.value, '刷新名称');
  control.render().props.onChange(event('中文'));
  assert.equal(changes.length, 2);
});
test('IME key events do not bubble into CMS keyboard shortcuts', () => {
  const { input } = setup('game-metadata');
  const control = input('中文本地化名称');
  let stopped = 0;
  control.render().props.onKeyDown({ key: 'Enter', keyCode: 229, stopPropagation() { stopped++; } });
  assert.equal(stopped, 1);
  control.render().props.onChange(event('候选', true));
  assert.equal(control.render().props.value, '候选');
});

test('real React rerenders preserve the IME draft and commit across CMS prop updates', () => {
  const React = require('react');
  const { create, act } = require('react-test-renderer');
  const fields = {};
  const window = { h: React.createElement, createClass(spec) {
    class Control extends React.Component {
      constructor(props) {
        super(props);
        for (const [name, method] of Object.entries(spec)) if (typeof method === 'function') this[name] = method.bind(this);
        this.state = this.getInitialState?.() || {};
      }
      render() { return null; }
    }
    return Control;
  }, CMS: { getFieldType: () => ({ control() { return null; } }), registerEditorComponent() {}, registerFieldType: (name, type) => fields[name] = type } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js', 'utf8'), { window });
  const changes = [];
  function Editor() {
    const [value, setValue] = React.useState({});
    return React.createElement(fields['game-metadata'], { value, onChange(next) { changes.push(next); setValue(next); } });
  }
  let renderer;
  act(() => { renderer = create(React.createElement(Editor)); });
  const host = () => renderer.root.findAllByType('label').find(label => label.findByType('span').children[0] === '中文本地化名称').findByType('input');
  act(() => { host().props.onFocus(); host().props.onCompositionStart(); });
  act(() => { host().props.onChange(event('zhong', true)); });
  assert.equal(host().props.value, 'zhong');
  assert.equal(changes.length, 0);
  act(() => { host().props.onCompositionEnd(event('中文')); });
  act(() => { host().props.onChange(event('中文')); });
  assert.equal(host().props.value, '中文');
  assert.equal(changes.length, 1);
  act(() => { host().props.onBlur(event('中文')); });
  assert.equal(changes.length, 1);
  act(() => renderer.unmount());
});
