const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function harness(request) {
  const listeners = {}, historyState = { __NA: true, preserved: { value: 1 } };
  const browser = { location: new URL('https://example.test/search/?q=Metroid&source=home#results'),
    history: { state: historyState, replaceState(state, unused, url) { this.state = state; browser.location = new URL(url, browser.location); } },
    addEventListener(name, callback) { listeners[name] = callback; }, removeEventListener(name) { delete listeners[name]; } };
  const modules = new Map();
  function load(file) {
    assert.ok(fs.existsSync(file), `${file} implements the search view`);
    const absolute = path.resolve(file), localRequire = createRequire(absolute);
    if (modules.has(absolute)) return modules.get(absolute);
    const context = { exports: {}, URL, URLSearchParams, window: browser, AbortController, setTimeout, clearTimeout, fetch: request, require(name) {
      if (name.endsWith('.css')) return {};
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
      if (name.startsWith('.')) for (const extension of ['.ts', '.tsx']) {
        const relative = path.resolve(path.dirname(absolute), name + extension);
        if (fs.existsSync(relative)) return load(relative);
      }
      return localRequire(name);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, context, { filename: absolute });
    modules.set(absolute, context.exports); return context.exports;
  }
  return { Search: load('app/site-search-panel.tsx').default, browser, listeners, historyState };
}
const index = { version: 1, entries: [{ id: 'post:metroid', kind: 'post', href: '/posts/metroid/', title: 'Metroid', description: '探索日志', aliases: [], keywords: [], body: '探索星球' }] };
const response = () => ({ ok: true, json: async () => index });

test('opening a dialog panel focuses its input after the native dialog layout effect, while full page does not steal focus', async () => {
  const { Search } = harness(async () => response());
  let focused = 0, view;
  await act(async () => { view = create(React.createElement(Search, { active: true }), { createNodeMock: element => element.type === 'input' ? { focus: () => focused++ } : null }); });
  assert.equal(focused, 1);
  act(() => view.unmount());
  await act(async () => { view = create(React.createElement(Search, { active: true, fullPage: true }), { createNodeMock: element => element.type === 'input' ? { focus: () => focused++ } : null }); });
  assert.equal(focused, 1, 'full page leaves route focus ownership intact');
  act(() => view.unmount());
});

test('Escape in a nonempty native search input closes its dialog instead of only clearing the input', async t => {
  const { Search } = harness(async () => response());
  let view, closed = 0, prevented = 0;
  await act(async () => { view = create(React.createElement(Search, { active: true, onClose: () => closed++ })); });
  t.after(() => act(() => view.unmount()));
  act(() => view.root.findByType('input').props.onChange({ target: { value: 'Metroid' } }));
  const event = { key: 'Escape', isDefaultPrevented: () => false, nativeEvent: { isComposing: false }, preventDefault: () => prevented++, stopPropagation() {} };
  act(() => view.root.findByType('input').props.onKeyDown(event));
  assert.equal(closed, 1);
  assert.equal(prevented, 1);
  assert.equal(view.root.findByType('input').props.value, 'Metroid');
});

test('closed panels do not download; the active panel loads once and renders normal grouped links', async t => {
  let calls = 0;
  const { Search } = harness(async () => { calls++; return response(); });
  let view;
  await act(async () => { view = create(React.createElement(Search, { active: false })); });
  t.after(() => act(() => view.unmount()));
  assert.equal(calls, 0);
  await act(async () => { view.update(React.createElement(Search, { active: true })); });
  assert.equal(calls, 1);
  act(() => view.root.findByType('input').props.onChange({ target: { value: 'Metroid' } }));
  const link = view.root.findAllByType('a').find(item => item.props.href === '/posts/metroid/');
  assert.ok(link, 'results are real links');
  assert.ok(link.props['data-overlay-navigate'], 'overlay navigation can retire its history entry first');
  assert.equal(link.props.role, undefined, 'normal links do not masquerade as listbox options');
});

test('full page reads, updates and restores URL q without overwriting Next history or unrelated URL data', async t => {
  const { Search, browser, listeners, historyState } = harness(async () => response());
  let view;
  await act(async () => { view = create(React.createElement(Search, { active: true, fullPage: true })); });
  t.after(() => act(() => view.unmount()));
  assert.equal(view.root.findByType('input').props.value, 'Metroid');
  act(() => view.root.findByType('input').props.onChange({ target: { value: '探索' } }));
  assert.equal(browser.location.searchParams.get('q'), '探索');
  assert.equal(browser.location.searchParams.get('source'), 'home');
  assert.equal(browser.location.hash, '#results');
  assert.equal(browser.history.state, historyState);
  browser.location = new URL('https://example.test/search/?q=back');
  act(() => listeners.popstate());
  assert.equal(view.root.findByType('input').props.value, 'back');
});

test('pending download completion does not reopen a closed view and a remount consumes the shared response', async t => {
  let resolve, calls = 0;
  const { Search } = harness(() => { calls++; return new Promise(done => { resolve = done; }); });
  let view;
  await act(async () => { view = create(React.createElement(Search, { active: true })); });
  await act(async () => { view.update(React.createElement(Search, { active: false })); resolve(response()); });
  await act(async () => { view.update(React.createElement(Search, { active: true, fullPage: true })); });
  t.after(() => act(() => view.unmount()));
  assert.equal(calls, 1);
  assert.ok(view.root.findAllByType('a').some(link => link.props.href === '/posts/metroid/'));
});

test('network failure exposes retry and the unchanged query produces results after retry', async t => {
  let calls = 0;
  const { Search } = harness(async () => { if (++calls === 1) throw new Error('offline'); return response(); });
  let view;
  await act(async () => { view = create(React.createElement(Search, { active: true, fullPage: true })); });
  t.after(() => act(() => view.unmount()));
  assert.ok(view.root.findAllByProps({ role: 'alert' }).length);
  const retry = view.root.findAllByType('button').find(button => button.children.join('') === '重新加载');
  assert.ok(retry);
  await act(async () => retry.props.onClick());
  assert.equal(view.root.findByType('input').props.value, 'Metroid');
  assert.ok(view.root.findAllByType('a').some(link => link.props.href === '/posts/metroid/'));
  assert.equal(calls, 2);
});
