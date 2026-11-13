const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const waits = [30000, 60000];
function isRetryable(result) {
  if (result.status !== 1 || result.signal || result.error) return false;
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  const errors = output.split(/\[ERROR\]/).slice(1);
  if (errors.length !== 1) return false;
  const codes = [...errors[0].matchAll(/\[code:\s*(\d+)\]/g)];
  return /A request to the Cloudflare API \([^)]+\) failed\./.test(errors[0]) &&
    codes.length === 1 && codes[0][1] === '10013';
}
function runWrangler(log) {
  return spawnSync(process.execPath, [
    'workers/static-preview/node_modules/wrangler/bin/wrangler.js',
    'deploy', '--config', 'workers/static-host/wrangler.jsonc',
  ], {
    env: { ...process.env, WRANGLER_LOG_PATH: log, WRANGLER_LOG_SANITIZE: 'true' },
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
}
async function deploy({
  dir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'blog-wrangler-deploy'),
  now = () => new Date().toISOString(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  print = line => console.log(line),
  run = runWrangler,
} = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i <= waits.length; i++) {
    const attempt = i + 1;
    const startedAt = now();
    const result = run(path.join(dir, 'wrangler-' + attempt + '.log'));
    const finishedAt = now();
    const retryable = isRetryable(result);
    const status = result.status ?? 1;
    fs.appendFileSync(path.join(dir, 'attempts.jsonl'), JSON.stringify({
      attempt, startedAt, finishedAt, status, signal: result.signal ?? null,
      cloudflareCode: retryable ? 10013 : null,
    }) + '\n');
    if (result.stdout) print(result.stdout);
    if (result.stderr) print(result.stderr);
    if (result.error) print(result.error.message);
    if (status === 0) return 0;
    print('Wrangler attempt ' + attempt + ' failed at ' + finishedAt + ' (UTC).');
    if (!retryable || i === waits.length) return status;
    print('Cloudflare 10013; retrying in ' + waits[i] / 1000 + ' seconds.');
    await sleep(waits[i]);
  }
}
if (require.main === module) deploy().then(status => { process.exitCode = status; }).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { deploy };
