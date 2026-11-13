const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

test('desktop shelf fills both columns on page 2 and paginates without gaps', () => {
  const context = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync('lib/game-shelf-state.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  const { shelfPagination } = context.exports;
  const total = 181;
  const second = shelfPagination(total, '2');
  assert.equal(second.end - second.start, 16, 'page 2 should display 16 cards');
  assert.equal(second.pages, 12);
  let end = 0;
  for (let page = 1; page <= second.pages; page++) {
    const range = shelfPagination(total, String(page));
    assert.equal(range.start, end);
    assert.equal(range.end - range.start, page === second.pages ? 5 : 16);
    end = range.end;
  }
  assert.equal(end, total);
});
