const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

function prepare(directory, release) {
  if (!/^[a-f0-9]{40}$/.test(release)) throw Error('Expected full Git release SHA');
  for (const file of ['index.html', '404.html', 'sveltia/index.html']) {
    if (!fs.existsSync(path.join(directory, file))) throw Error('Missing export: ' + file);
  }
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw Error('Symlink in export: ' + name);
      if (entry.isDirectory()) walk(name);
      else {
        const relative = path.relative(directory, name).split(path.sep).join('/');
        if (['_headers', 'hosting.json'].includes(relative)) continue;
        const bytes = fs.readFileSync(name);
        if (bytes.length > 25 * 1024 * 1024) throw Error('Asset exceeds 25 MiB: ' + relative);
        files.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  walk(directory);
  if (files.length + 1 > 20000) throw Error('Asset count exceeds free-plan ceiling');
  fs.writeFileSync(path.join(directory, '_headers'), `/*\n  X-Blog-Hosting: workers-static-assets\n  X-Blog-Release: ${release}\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n/sveltia/*\n  Cache-Control: no-cache\n/hosting.json\n  Cache-Control: no-store\n`);
  fs.writeFileSync(path.join(directory, 'hosting.json'), JSON.stringify({ release, files }, null, 2) + '\n');
  return files;
}
if (require.main === module) {
  const release = process.env.BLOG_RELEASE || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log('STATIC_EXPORT files=' + prepare(path.resolve('out'), release).length + ' release=' + release);
}
module.exports = { prepare };
