const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const observerState = {};
class Observer {
  constructor(callback) { observerState.callback = callback; }
  observe(root, options) { observerState.options = options; }
  disconnect() { observerState.disconnected = true; }
}
const context = { exports: {}, URL, MutationObserver: Observer };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/external-links.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
const { isExternalWebLink, externalLinkProps, installExternalLinkPolicy } = context.exports;
test('web links distinguish external origins from internal pages and non-web protocols', () => {
  for (const href of ['https://github.com/jyh9521', '//example.com', 'http://example.com', 'https://blog.blfy.cc.example.com']) assert.equal(isExternalWebLink(href), true, href);
  for (const href of [undefined, '', '#heading', '/games/', '../about/', 'https://blog.blfy.cc/posts/test/', '//blog.blfy.cc/games/', 'mailto:someone@example.com', 'tel:123', 'javascript:void(0)', 'data:text/plain,test', 'https://[invalid']) assert.equal(isExternalWebLink(href), false, href);
});
test('external attributes enforce blank and safe rel while retaining nofollow/ugc', () => {
  const props = externalLinkProps('https://example.com', 'nofollow ugc opener noopener');
  assert.equal(props.target, '_blank');
  assert.equal(props.rel, 'nofollow ugc noopener noreferrer');
  assert.equal(Object.keys(externalLinkProps('/posts/')).length, 0);
});
class Anchor {
  constructor(href, extra = {}) { this.attrs = { href, ...extra }; this.nodeType = 1; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  matches() { return 'href' in this.attrs; }
  querySelectorAll() { return []; }
  closest() { return this; }
}
test('global policy covers existing/dynamic links, href changes, clicks and cleanup', () => {
  const external = new Anchor('https://example.com', { target: '_self', rel: 'nofollow' });
  const internal = new Anchor('/games/');
  const events = {};
  const doc = { body: {}, querySelectorAll: () => [external, internal], addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener: name => { delete events[name]; } };
  const cleanup = installExternalLinkPolicy(doc, 'https://blog.blfy.cc/posts/test/');
  assert.equal(external.attrs.target, '_blank'); assert.equal(external.attrs.rel, 'nofollow noopener noreferrer');
  assert.equal(internal.attrs.target, undefined);
  assert.equal(observerState.options.attributeFilter.join(','), 'href,target,rel');
  const inserted = new Anchor('//steamcommunity.com');
  observerState.callback([{ type: 'childList', addedNodes: [inserted] }]);
  assert.equal(inserted.attrs.target, '_blank');
  const clicked = new Anchor('https://gog.com');
  events.click({ target: clicked }); assert.equal(clicked.attrs.target, '_blank');
  external.setAttribute('href', '/posts/');
  observerState.callback([{ type: 'attributes', target: external }]);
  assert.equal(external.attrs.target, '_self'); assert.equal(external.attrs.rel, 'nofollow');
  cleanup(); assert.equal(observerState.disconnected, true); assert.equal(Object.keys(events).length, 0);
});
test('both Markdown renderers and root layout enable the shared policy', () => {
  for (const file of ['app/posts/post-content.tsx', 'app/about/page.tsx']) assert.match(fs.readFileSync(file, 'utf8'), /externalLinkProps\(href\)/);
  assert.match(fs.readFileSync('app/layout.tsx', 'utf8'), /<ExternalLinks \/>/);
  assert.match(fs.readFileSync('app/external-links.tsx', 'utf8'), /useEffect\(\(\) => installExternalLinkPolicy/);
});
