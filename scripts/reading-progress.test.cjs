const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('reading progress defers resize layout reads and coalesces them before painting', () => {
  let effect, observer, reads = 0, height = 2000, id = 0, disconnected = false;
  const frames = new Map(), events = new Map(), bar = { style: {} };
  const context = {
    exports: {},
    require: name => name === 'react' ? {
      useEffect: fn => { effect = fn; }, useRef: () => ({ current: bar }),
    } : name === 'react/jsx-runtime' ? { jsx: () => null } : {},
    document: { body: {}, documentElement: { get scrollHeight() { reads++; return height; } } },
    innerHeight: 1000, scrollY: 500,
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: key => frames.delete(key),
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name),
    ResizeObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { disconnected = true; } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/site-enhancements.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  context.exports.ReadingProgress();
  const cleanup = effect();
  const tick = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); };
  assert.equal(reads, 0, 'mount does not synchronously force layout');
  observer(); observer();
  assert.equal(reads, 0, 'ResizeObserver callback does not force another layout cycle');
  assert.equal(frames.size, 1);
  tick(); assert.equal(reads, 1); assert.equal(bar.style.transform, 'scaleX(0.5)');
  events.get('scroll')(); tick(); assert.equal(reads, 1, 'scroll reuses the measured range');
  height = 3000; observer(); events.get('resize')(); tick();
  assert.equal(reads, 2); assert.equal(bar.style.transform, 'scaleX(0.25)');
  observer(); cleanup();
  assert.equal(frames.size, 0); assert.equal(events.size, 0); assert.ok(disconnected);
});
