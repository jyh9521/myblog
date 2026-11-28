const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
const React = require('react'), renderer = require('react-test-renderer');
function load(file, imports = {}, globals = {}) {
  assert.ok(fs.existsSync(file), 'reading tools expose real preset controls and an accessible mobile TOC');
  const context = { exports: {}, console, ...globals, require: name => name in imports ? imports[name] : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
function fixture({ failStorage = false, readingKey = '/posts/example/' } = {}) {
  const data = new Map(), events = new Map(); let id = 0;
  const window = { get localStorage() { if (failStorage) throw Error('denied'); return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; }, location: { pathname: '/posts/example/', hash: '' }, scrollY: 0, innerHeight: 800, addEventListener: (n, f) => events.set(n, f), removeEventListener: (n, f) => { if (events.get(n) === f) events.delete(n); }, setTimeout: () => ++id, clearTimeout() {} };
  const document = { body: { style: {} }, documentElement: { scrollHeight: 5000, style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {}, getElementById: () => null };
  const { default: ReadingTools } = load('app/posts/reading-tools.tsx', {
    '../../lib/reading-state': load('lib/reading-state.ts'),
    './reading-tools.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    '../motion-dialog': { __esModule: true, default: ({ open, children, label }) => open ? React.createElement('dialog', { 'aria-label': label }, children) : null },
  }, { window, document, performance: { getEntriesByType: () => [] }, requestAnimationFrame: () => ++id, cancelAnimationFrame() {}, IntersectionObserver: class { observe() {} disconnect() {} } });
  const bodyRef = { current: { style: {}, getBoundingClientRect: () => ({ top: 0, bottom: 5000, height: 5000 }), querySelectorAll: () => [] } };
  let tree; renderer.act(() => { tree = renderer.create(React.createElement(ReadingTools, { bodyRef, readingKey, textLength: 5000, headings: [{ id: 'part-1', text: '第一节', level: 2 }], activeHeading: 'part-1' })); });
  return { tree, data, bodyRef, cleanup: () => renderer.act(() => tree.unmount()) };
}
test('reading settings offer native radio groups, apply presets, and remember explicit choices', () => {
  const f = fixture();
  renderer.act(() => f.tree.root.findByProps({ 'aria-label': '打开阅读偏好' }).props.onClick({ currentTarget: {} }));
  assert.equal(f.tree.root.findAllByType('select').length, 0);
  assert.equal(f.tree.root.findAllByType('input').filter(x => x.props.type === 'radio').length, 6);
  const radio = f.tree.root.findByProps({ name: 'reading-font-size', value: 2 });
  renderer.act(() => radio.props.onChange());
  assert.equal(f.bodyRef.current.style.fontSize, '21px');
  const prefs = JSON.parse(f.data.get('blog:reading-preferences:v1'));
  assert.equal(prefs.fontSize, 2); assert.equal(prefs.rememberPosition, false);
  renderer.act(() => f.tree.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }));
  assert.equal(JSON.parse(f.data.get('blog:reading-preferences:v1')).rememberPosition, true);
  f.cleanup();
});
test('storage denial keeps controls usable and reports session-only preferences', () => {
  const f = fixture({ failStorage: true });
  renderer.act(() => f.tree.root.findByProps({ 'aria-label': '打开阅读偏好' }).props.onClick({ currentTarget: {} }));
  renderer.act(() => f.tree.root.findByProps({ name: 'reading-line-spacing', value: 2 }).props.onChange());
  assert.equal(f.bodyRef.current.style.lineHeight, '2.2');
  assert.match(JSON.stringify(f.tree.toJSON()), /本次阅读/);
  f.cleanup();
});
test('protected or unlisted articles expose no position persistence opt-in', () => {
  const f = fixture({ readingKey: null });
  renderer.act(() => f.tree.root.findByProps({ 'aria-label': '打开阅读偏好' }).props.onClick({ currentTarget: {} }));
  assert.equal(f.tree.root.findAllByProps({ type: 'checkbox' }).length, 0);
  assert.equal([...f.data.keys()].some(x => x.startsWith('blog:reading-position:')), false);
  f.cleanup();
});
