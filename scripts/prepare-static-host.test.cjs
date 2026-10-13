const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare } = require('./prepare-static-host.cjs');
test('static export validates release, hashes content and applies scoped cache rules', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-static-'));
  try {
    fs.mkdirSync(path.join(directory, 'sveltia'));
    for (const name of ['index.html', '404.html', 'sveltia/index.html']) fs.writeFileSync(path.join(directory, name), '<html>fixture</html>');
    assert.throws(() => prepare(directory, 'bad'), /SHA/);
    const files = prepare(directory, 'a'.repeat(40));
    assert.equal(files.length, 3); assert.equal(files[0].sha256.length, 64);
    assert.equal(prepare(directory, 'a'.repeat(40)).length, 3);
    const headers = fs.readFileSync(path.join(directory, '_headers'), 'utf8');
    assert.match(headers, /X-Blog-Release: a{40}/);
    assert.match(headers, /\/_next\/static\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
    assert.match(headers, /\/sveltia\/\*\n  Cache-Control: no-cache/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'hosting.json'))).release, 'a'.repeat(40));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('incomplete export fails before writing deployment metadata', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-static-'));
  try { assert.throws(() => prepare(directory, 'a'.repeat(40)), /Missing export/); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
