const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const elements = [], closed = [], hooks = new Map(), timers = new Map();
  let records = [{ collectionName: 'post', slug: 'saved', timestamp: new Date(0) }], nextTimer = 0;
  class Element {
    constructor(tag) { this.tagName = tag; this.open = false; this.children = []; this.dataset = {}; this.isConnected = false; }
    setAttribute() {}
    append(...items) { this.children.push(...items); items.forEach(item => { if (item instanceof Element) item.isConnected = true; }); }
    replaceChildren(...items) { this.children = items; }
    remove() { this.isConnected = false; }
    addEventListener() {}
    showModal() { this.open = true; }
    close() { this.open = false; closed.push(() => this.onclose?.()); }
    focus() {}
    querySelector() { return new Element('stub'); }
  }
  const document = { body: new Element('body'), activeElement: null, createElement: tag => { const element = new Element(tag); elements.push(element); return element; }, createTextNode: text => ({ textContent: text }), addEventListener() {} };
  const window = {
    BlogPublishingCore: { readDrafts: async () => records, canImportAt: () => true, publishedEntryPath: () => null },
    CMS: { registerEventListener: ({ name, handler }) => hooks.set(name, handler) }, addEventListener() {},
  };
  vm.runInNewContext(fs.readFileSync('public/sveltia/publishing-experience.js', 'utf8'), {
    window, document, Date, HTMLElement: Element, AbortController,
    AbortSignal: { any: values => values[0], timeout: () => new AbortController().signal },
    location: { hash: '#/collections/post' }, fetch: () => new Promise(() => {}),
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id),
  });
  return { window, elements, closed, hooks, setRecords: value => { records = value; }, async flush() { [...timers.values()].forEach(callback => callback()); timers.clear(); await new Promise(resolve => setImmediate(resolve)); } };
}

test('native postSave refreshes the local draft badge without navigation or a second save', async () => {
  const f = fixture(); await f.flush();
  assert.match(f.elements[0].textContent, /1 份/);
  f.setRecords([]);
  assert.equal(typeof f.hooks.get('postSave'), 'function', 'observe the public CMS postSave hook');
  f.hooks.get('postSave')(); await f.flush();
  assert.match(f.elements[0].textContent, /没有待恢复草稿/);
  assert.deepEqual([...f.hooks.keys()], ['postSave'], 'never intercept or replace the save protocol');
});

test('a deferred close event only removes its own publishing dialog', () => {
  const f = fixture(); f.window.BlogPublishing.open();
  const first = f.elements.find(element => element.tagName === 'dialog');
  first.close(); f.window.BlogPublishing.open();
  const second = f.elements.filter(element => element.tagName === 'dialog')[1];
  f.closed.shift()();
  assert.equal(second.isConnected, true, 'old close must not remove the reopened dialog');
  assert.equal(second.open, true);
  assert.equal(first.isConnected, false, 'old dialog must not leak into the DOM');
});
