const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function load(file, browser) {
  const absolute = path.resolve(file);
  const localRequire = createRequire(absolute);
  const context = { exports: {}, URL, URLSearchParams, window: browser, require(name) {
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name.startsWith('.')) {
      const relative = path.resolve(path.dirname(absolute), name);
      for (const extension of ['.ts', '.tsx']) {
        if (fs.existsSync(relative + extension)) return load(relative + extension, browser);
      }
    }
    return localRequire(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context, { filename: absolute });
  return context.exports;
}

function archive(t, search) {
  const initialState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['posts'], custom: { retained: true } };
  const stateSnapshot = JSON.stringify(initialState);
  const writes = [];
  const browser = {
    location: new URL(`https://example.test/posts/${search}`),
    history: {
      state: initialState,
      replaceState(state, unused, value) {
        this.state = state;
        browser.location = new URL(value, browser.location.href);
        writes.push({ state, url: browser.location.href });
      },
    },
  };
  const ArchiveSearch = load('app/posts/archive-search.tsx', browser).default;
  const posts = [{
    slug: 'sample', title: '汉化工程', description: 'Project notes', body: 'A complete sample article.',
    tags: ['汉化'], cover: '', date: '2026-11-01', updatedAt: '', updateNote: '', gameSlug: '',
    visibility: 'public', privateId: '', pinned: false, audio: '', video: '', attachment: '',
  }];
  let view;
  const mount = () => act(() => { view = create(React.createElement(ArchiveSearch, { posts })); });
  mount();
  t.after(() => act(() => view.unmount()));
  return {
    browser,
    writes,
    input: () => view.root.findByType('input'),
    button: label => view.root.findAllByType('button').find(button => button.props['aria-label'] === label || button.children.join('') === label),
    activeTag: () => view.root.findByProps({ className: 'tag-filters' }).findAllByType('button').find(button => button.props['aria-pressed']).children.join(''),
    remount() { act(() => view.unmount()); mount(); },
    assertHistoryPreserved() {
      assert.equal(browser.history.state, initialState, 'history metadata retains its identity');
      assert.equal(JSON.stringify(initialState), stateSnapshot, 'history metadata is not mutated');
      assert.ok(writes.every(write => write.state === initialState), 'every replaceState retains Next history metadata');
    },
  };
}

test('archive reads encoded query and tag from the URL on initial mount and reload', t => {
  const page = archive(t, '?q=%E6%B1%89%E5%8C%96&tag=%E6%B1%89%E5%8C%96#results');
  assert.equal(page.input().props.value, '汉化');
  assert.equal(page.activeTag(), '汉化');
  page.remount();
  assert.equal(page.input().props.value, '汉化');
  assert.equal(page.activeTag(), '汉化');
  assert.equal(page.writes.length, 0, 'reading the URL does not replace history');
  page.assertHistoryPreserved();
});

test('editing the query preserves tag, unrelated parameters, hash and Next history metadata', t => {
  const page = archive(t, '?tag=%E6%B1%89%E5%8C%96&source=home#results');
  act(() => page.input().props.onChange({ target: { value: 'Project notes' } }));
  assert.equal(page.input().props.value, 'Project notes');
  assert.equal(page.browser.location.searchParams.get('q'), 'Project notes');
  assert.equal(page.browser.location.searchParams.get('tag'), '汉化');
  assert.equal(page.browser.location.searchParams.get('source'), 'home');
  assert.equal(page.browser.location.hash, '#results');
  page.remount();
  assert.equal(page.input().props.value, 'Project notes');
  assert.equal(page.activeTag(), '汉化');
  page.assertHistoryPreserved();
});

test('query-only clear removes q while preserving the selected tag after reload', t => {
  const page = archive(t, '?q=missing&tag=%E6%B1%89%E5%8C%96#results');
  act(() => page.button('清空搜索').props.onClick());
  assert.equal(page.input().props.value, '');
  assert.equal(page.browser.location.searchParams.has('q'), false);
  assert.equal(page.browser.location.searchParams.get('tag'), '汉化');
  assert.equal(page.browser.location.hash, '#results');
  page.remount();
  assert.equal(page.input().props.value, '');
  assert.equal(page.activeTag(), '汉化');
  page.assertHistoryPreserved();
});

test('empty-result clear removes both q and tag and does not restore stale filters after reload', t => {
  const page = archive(t, '?q=missing&tag=%E6%B1%89%E5%8C%96&source=home#results');
  act(() => page.button('清除筛选').props.onClick());
  assert.equal(page.input().props.value, '');
  assert.equal(page.activeTag(), '全部');
  assert.equal(page.browser.location.searchParams.has('q'), false, 'clearing all filters removes the persisted query');
  assert.equal(page.browser.location.searchParams.has('tag'), false);
  assert.equal(page.browser.location.searchParams.get('source'), 'home');
  assert.equal(page.browser.location.hash, '#results');
  page.remount();
  assert.equal(page.input().props.value, '', 'reload does not restore the cleared query');
  assert.equal(page.activeTag(), '全部');
  page.assertHistoryPreserved();
});
