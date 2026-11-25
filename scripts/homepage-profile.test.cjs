const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function profile() {
  assert.ok(fs.existsSync('scripts/homepage-profile.cjs'), 'homepage profiling implementation exists');
  return require('./homepage-profile.cjs');
}

test('CLS uses the maximum session window rather than accumulating unrelated shifts', () => {
  const result = profile().layoutShiftSummary([
    { startTime: 100, value: 0.1, hadRecentInput: false },
    { startTime: 800, value: 0.2, hadRecentInput: false },
    { startTime: 900, value: 0.8, hadRecentInput: true },
    { startTime: 2200, value: 0.15, hadRecentInput: false },
  ]);
  assert.ok(Math.abs(result.cls - 0.3) < 0.000001);
  assert.ok(Math.abs(result.cumulativeWithoutRecentInput - 0.45) < 0.000001);
  assert.equal(result.eligibleEntries, 3);
});

test('CLS starts another session after five seconds even while shifts remain frequent', () => {
  const entries = Array.from({ length: 7 }, (_, index) => ({ startTime: 100 + index * 900, value: 0.1, hadRecentInput: false }));
  assert.ok(Math.abs(profile().layoutShiftSummary(entries).cls - 0.6) < 0.000001);
  assert.deepEqual(profile().layoutShiftSummary([]), { cls: 0, cumulativeWithoutRecentInput: 0, eligibleEntries: 0 });
});

test('trace counters count complete renderer-main spans and do not double-count other threads', () => {
  const result = profile().summarizeTrace({ traceEvents: [
    { ph: 'M', name: 'thread_name', pid: 10, tid: 1, args: { name: 'CrRendererMain' } },
    { ph: 'M', name: 'thread_name', pid: 10, tid: 2, args: { name: 'Compositor' } },
    { ph: 'X', name: 'Layout', pid: 10, tid: 1, dur: 2000 },
    { ph: 'X', name: 'Paint', pid: 10, tid: 1, dur: 1500 },
    { ph: 'X', name: 'Paint', pid: 10, tid: 2, dur: 9000 },
    { ph: 'B', name: 'Layout', pid: 10, tid: 1 },
    { ph: 'E', name: 'Layout', pid: 10, tid: 1 },
  ] });
  assert.equal(result.rendererMainThreads, 1);
  assert.deepEqual(result.layout, { count: 1, totalMs: 2 });
  assert.deepEqual(result.paint, { count: 1, totalMs: 1.5 });
});

test('missing renderer metadata remains explicit instead of reporting unrelated process events', () => {
  const result = profile().summarizeTrace({ traceEvents: [{ ph: 'X', name: 'Layout', dur: 5000 }] });
  assert.equal(result.rendererMainThreads, 0);
  assert.equal(result.layout.count, 0);
});
