// Regression harness for navigation intent vs optional View Transition capture.
// Runs the actual MotionProvider source with narrow React/browser boundary mocks.
// No live server, browser, production source edits, or generated artifacts needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = path.resolve(__dirname, '../app/motion-provider.tsx');
const compiled = ts.transpile(fs.readFileSync(source, 'utf8'), { module: ts.ModuleKind.CommonJS });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness(callbackDelayMs, reduced = false) {
  const effects = [], cleanup = [], pushes = [], callbacks = [];
  let click, popstate;const captures=[];
  const noop = () => {};
  class Element { closest() { return this.link; } }
  const document = {
    body: {}, documentElement: { dataset: {} },
    querySelectorAll: () => [], getElementById: () => null,
    addEventListener: (name, fn) => { if (name === 'click') click = fn; },
    removeEventListener: noop, startViewTransition: noop,
  };
  const react = {
    startTransition: fn => fn(), useEffect: fn => effects.push(fn),
    useLayoutEffect: noop, useRef: value => ({ current: value }),
  };
  const runtime = {
    installMotion: noop, reducedMotion: () => reduced, skipTransition: noop,
    transition: update => {
      // Delaying the callback models old-state capture not reaching the update
      // callback before the app's 180ms capture deadline. skipTransition does not
      // discard the update callback; the platform still runs it.
      const finished = new Promise(resolve => {
        setTimeout(() => { callbacks.push(true); resolve(update()); }, callbackDelayMs);
      });
      return { finished, ready: Promise.resolve(), skipTransition: noop };
    },
  };
  const sandbox = {
    exports: {}, require: name => name === 'react' ? react
      : name === 'next/navigation' ? { usePathname: () => '/posts/demo/', useRouter: () => ({ push: p => pushes.push(p) }) }
      : name === './article-return-motion' ? {captureArticleReturn: slug => {captures.push(slug);return {cancel:noop,arrive:noop};}}
      : name === './motion-runtime' ? runtime : {},
    document, window: { addEventListener: (name,fn)=>{if(name==='popstate')popstate=fn;}, removeEventListener: noop },
    Element, URL, location: { origin: 'https://blog.test', pathname: '/', href: 'https://blog.test/' },
    setTimeout, clearTimeout,
    matchMedia: () => ({ addEventListener: noop, removeEventListener: noop }),
  };
  vm.runInNewContext(compiled, sandbox, { filename: source });
  sandbox.exports.default();
  effects.forEach(fn => { const dispose = fn(); if (dispose) cleanup.push(dispose); });
  return {
    pushes, callbacks,captures,pop:ua=>popstate({hasUAVisualTransition:ua}),
    click: pathname => {
      const target = new Element();
      target.link = { href: 'https://blog.test' + pathname, target: '', hasAttribute: () => false,
        querySelector: () => null, closest: () => null };
      let prevented = false;
      click({ target, button: 0, preventDefault: () => { prevented = true; } });
      assert.equal(prevented, true, 'fixture follows the intercepted SPA route branch');
    },
    close: () => cleanup.forEach(fn => fn()),
  };
}

test('capture deadline still navigates once when update callback arrives after 180ms', async () => {
  const h = harness(230);
  try {
    h.click('/posts/demo/');
    await wait(360);
    assert.equal(h.callbacks.length, 1);
    assert.deepEqual(h.pushes, ['/posts/demo/'], 'late capture must neither swallow nor duplicate navigation');
  } finally { h.close(); }
});

test('browser-owned swipe transition and reduced motion do not receive a second cover animation',()=>{
  const native=harness(0),reduced=harness(0,true),ordinary=harness(0);
  try{native.pop(true);reduced.pop(false);ordinary.pop(false);assert.deepEqual(native.captures,[]);assert.deepEqual(reduced.captures,[]);assert.deepEqual(ordinary.captures,['demo']);}
  finally{native.close();reduced.close();ordinary.close();}
});

test('fast update and later capture deadline navigate exactly once', async () => {
  const h = harness(0);
  try {
    h.click('/posts/demo/');
    await wait(260);
    assert.deepEqual(h.pushes, ['/posts/demo/']);
  } finally { h.close(); }
});

test('late stale callback cannot replace a newer ordinary-route navigation', async () => {
  const h = harness(230);
  try {
    h.click('/posts/obsolete/');
    await wait(40);
    h.click('/games/');
    await wait(320);
    assert.equal(h.callbacks.length, 1);
    assert.deepEqual(h.pushes, ['/games/']);
  } finally { h.close(); }
});

test('latest delayed shared route survives while an older delayed callback is ignored', async () => {
  const h = harness(230);
  try {
    h.click('/posts/obsolete/');
    await wait(40);
    h.click('/posts/latest/');
    await wait(360);
    assert.equal(h.callbacks.length, 2);
    assert.deepEqual(h.pushes, ['/posts/latest/']);
  } finally { h.close(); }
});
