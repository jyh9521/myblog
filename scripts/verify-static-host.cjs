const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
async function verify(site, release) {
  assert.match(release, /^[a-f0-9]{40}$/);
  const get = url => fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
  let marker;
  for (let attempt = 0; attempt < 12; attempt++) {
    marker = await get(site + '/hosting.json?release=' + release);
    if (marker.status === 200 && marker.headers.get('x-blog-release') === release) break;
    if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert.equal(marker.status, 200);
  assert.equal(marker.headers.get('x-blog-hosting'), 'workers-static-assets');
  const manifest = await marker.json();
  assert.equal(manifest.release, release);
  const paths = ['index.html', 'sveltia/index.html', 'sveltia/resources.html', 'sveltia/r2-media.js'];
  for (const suffix of ['.css', '.js']) {
    const asset = manifest.files.find(f => f.path.startsWith('_next/static/') && f.path.endsWith(suffix));
    assert.ok(asset, 'Missing fingerprinted ' + suffix); paths.push(asset.path);
  }
  for (const name of paths) {
    const expected = manifest.files.find(f => f.path === name); assert.ok(expected, name);
    const url = name === 'index.html' ? '/' : name === 'sveltia/index.html' ? '/sveltia/' : '/' + name;
    const response = await get(site + url + '?release=' + release);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get('x-blog-release'), release, url);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), expected.sha256, url);
  }
  assert.equal((await get(site + '/__static_missing_' + release + '/')).status, 404);
  console.log('STATIC_LIVE release=' + release + ' hashes=' + paths.length + ' missing=404 PASS');
}
if (require.main === module) verify(process.argv[2], process.env.BLOG_RELEASE).catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { verify };
