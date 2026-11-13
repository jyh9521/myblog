const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deploy } = require('./deploy-static-host.cjs');
const cloudflare = code => '✘ [ERROR] A request to the Cloudflare API (/accounts/test/workers/scripts/blog-static-host/versions) failed.\n  An unknown error has occurred. [code: '+code+']';
async function fixture(t, results) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-retry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const waits = [], calls = [];
  const status = await deploy({ dir, now: () => '2026-11-13T15:30:24.000Z', sleep: async ms => waits.push(ms), print() {},
    run(log) {
      calls.push(log);
      const result = results.shift();
      fs.writeFileSync(log, 'sanitized Wrangler diagnostic');
      return result;
    },
  });
  return { status, waits, calls, logs: fs.readdirSync(dir), summary: fs.readFileSync(path.join(dir, 'attempts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) };
}
const failed = stderr => ({ status: 1, stderr });
test('10013 retries after 30 and 60 seconds, then succeeds', async t => {
  const r = await fixture(t, [failed(cloudflare(10013)), failed(cloudflare(10013)), { status: 0 }]);
  assert.equal(r.status, 0);
  assert.deepEqual(r.waits, [30000, 60000]);
  assert.equal(new Set(r.calls).size, 3);
  assert.deepEqual(r.summary.map(row => row.status), [1, 1, 0]);
});
test('persistent 10013 fails and retains per-attempt logs and UTC failure time', async t => {
  const r = await fixture(t, Array.from({length:3}, () => failed(cloudflare(10013))));
  assert.equal(r.status, 1);
  assert.equal(r.calls.length, 3);
  assert.equal(r.logs.filter(file => /^wrangler-\d+\.log$/.test(file)).length, 3);
  assert.ok(r.summary.every(row => row.finishedAt === '2026-11-13T15:30:24.000Z'));
});
test('other, unrelated, mixed or signalled failures stop immediately', async t => {
  for (const failure of [failed(cloudflare(10000)), failed('Uploaded 10013 files'), failed(cloudflare(10013)+'\n'+cloudflare(10000)), {status:null,signal:'SIGTERM',stderr:cloudflare(10013)}]) {
    const r = await fixture(t, [failure]);
    assert.equal(r.status, 1);
    assert.deepEqual(r.waits, []);
    assert.equal(r.calls.length, 1);
  }
});
