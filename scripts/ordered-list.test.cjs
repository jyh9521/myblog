const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { patch, loadSource, build } = require('./build-sveltia.cjs');
const loadRuntime = require('./helpers/sveltia-test-runtime.cjs');

let source, original, fixed;
before(async () => {
  source = await loadSource();
  original = loadRuntime(source);
  fixed = loadRuntime(patch(source));
  await build();
});

function editor(api, start = 7, type = 'number') {
  const transformers = [...api.transformers, api.tableTransformer()];
  const nodes = [...new Set(transformers.flatMap(t => t.dependencies || []))];
  const ed = api.createEditor({ nodes, onError(error) { throw error; } });
  api.registerRichText(ed);
  api.registerLists(ed, ['numbered-list', 'bulleted-list']);
  const update = action => ed.update(action, { discrete: true });
  update(() => {
    const list = api.list(type, start);
    api.root().append(list);
    list.append(...['ZAR and XEX', 'DLC', 'Next step'].map(text => api.item().append(api.text(text))));
    list.getFirstChild().selectEnd();
  });
  const enter = () => update(() => assert.equal(ed.dispatchCommand(api.enter), true));
  const table = () => update(() => assert.equal(api.insertTable(3, 2), true));
  const json = () => JSON.parse(JSON.stringify(ed.getEditorState().toJSON()));
  const markdown = () => ed.read(() => api.exportMarkdown(transformers));
  return { api, ed, update, enter, table, json, markdown, transformers };
}

function lists(context) {
  return context.json().root.children.filter(node => node.type === 'list')
    .map(node => ({ start: node.start, values: node.children.map(item => item.value) }));
}

test('reproduces both reported failures in the unpatched pinned editor', () => {
  const direct = editor(original);
  direct.table();
  assert.deepEqual(lists(direct), [{ start: 7, values: [7] }, { start: 7, values: [7, 8] }]);
  const blank = editor(original);
  blank.enter();
  blank.enter();
  blank.table();
  assert.deepEqual(lists(blank), [{ start: 7, values: [7] }, { start: 1, values: [1, 2] }]);
});

test('inserting a table after item 7 continues at 8', () => {
  const context = editor(fixed);
  context.table();
  assert.deepEqual(lists(context), [{ start: 7, values: [7] }, { start: 8, values: [8, 9] }]);
});

test('Enter creates an empty item; exiting it and inserting a table continues at 8', () => {
  const context = editor(fixed);
  context.enter();
  context.enter();
  assert.deepEqual(lists(context), [{ start: 7, values: [7] }, { start: 8, values: [8, 9] }]);
  context.table();
  assert.deepEqual(lists(context), [{ start: 7, values: [7] }, { start: 8, values: [8, 9] }]);
});

test('a table inserted directly on the new empty list item continues at 8', () => {
  const context = editor(fixed);
  context.enter();
  context.table();
  assert.deepEqual(lists(context), [{ start: 7, values: [7] }, { start: 8, values: [8, 9] }]);
});

test('block insertion counts every preceding item for custom and default starts', () => {
  for (const start of [0, 1, 5, 42]) {
    const context = editor(fixed, start);
    context.update(() => fixed.root().getFirstChild().getChildAtIndex(1).selectEnd());
    context.table();
    assert.deepEqual(lists(context), [
      { start, values: [start, start + 1] }, { start: start + 2, values: [start + 2] },
    ]);
  }
});

test('inserting at the beginning of the next item does not increment it twice', () => {
  const context = editor(fixed);
  context.update(() => fixed.root().getFirstChild().getChildAtIndex(1).selectStart());
  context.table();
  assert.deepEqual(lists(context), [{ start: 7, values: [7] }, { start: 8, values: [8, 9] }]);
});

test('nested sublists do not consume a parent ordinal', () => {
  const context = editor(fixed);
  context.update(() => {
    const list = fixed.root().getFirstChild();
    const nested = fixed.item().append(fixed.list('number').append(fixed.item().append(fixed.text('Nested'))));
    list.getFirstChild().insertAfter(nested);
    list.getChildAtIndex(2).selectEnd();
  });
  context.table();
  assert.deepEqual(lists(context), [{ start: 7, values: [7, 8, 8] }, { start: 9, values: [9] }]);
});

test('bulleted lists and separate numbered lists retain their types and starts', () => {
  const context = editor(fixed, 1, 'bullet');
  context.table();
  assert.deepEqual(context.json().root.children.filter(n => n.type === 'list').map(n => n.listType), ['bullet', 'bullet']);
  context.update(() => fixed.root().append(fixed.paragraph().append(fixed.text('Separate procedure')),
    fixed.list('number').append(fixed.item().append(fixed.text('Start at one')))));
  assert.equal(lists(context).at(-1).start, 1);
});

test('Markdown save/reopen retains the table and continued numbering for both paths', () => {
  for (const blank of [false, true]) {
    const context = editor(fixed);
    if (blank) { context.enter(); context.enter(); }
    context.table();
    const markdown = context.markdown();
    assert.match(markdown, /8\. DLC/);
    context.update(() => fixed.importMarkdown(markdown, context.transformers));
    assert.deepEqual(lists(context), [{ start: 7, values: [7] }, { start: 8, values: [8, 9] }]);
    assert.equal(context.json().root.children.filter(n => n.type === 'table').length, 1);
    assert.equal(context.markdown(), markdown);
  }
});

test('undo/redo restores the same list numbering and table in one edit', () => {
  const context = editor(fixed);
  const history = fixed.createHistory();
  fixed.registerHistory(context.ed, history, 1000);
  context.update(() => fixed.root().getFirstChild().getFirstChild().getFirstChild().setTextContent('ZAR / XEX'));
  const before = context.json();
  context.ed.update(() => fixed.insertTable(3, 2), { discrete: true, tag: 'history-push' });
  const after = context.json();
  context.update(() => context.ed.dispatchCommand(fixed.undo));
  assert.deepEqual(context.json(), before);
  context.update(() => context.ed.dispatchCommand(fixed.redo));
  assert.deepEqual(context.json(), after);
});

test('patches fail closed when upstream code changes and the CMS URL invalidates old caches', () => {
  assert.throws(() => patch(source.replace('()=>Dfe(),2)', '()=>Dfe(false),2)')), /empty item exit/);
  assert.throws(() => patch(source.replace('o.insert(t(n).splice(0,0,r))', 'o.insert(t(n))')), /block split/);
  assert.match(fs.readFileSync('public/sveltia/index.html', 'utf8'), /draft-slug\.js\?v=list-numbering-20261116/);
});
