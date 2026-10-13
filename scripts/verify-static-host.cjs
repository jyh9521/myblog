const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
async function verify(site, release, { fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  assert.match(release, /^[a-f0-9]{40}$/);
  const get = url => fetcher(url, { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
  // Release propagation is per request/edge, not guaranteed by one fresh manifest.
  const released = async (url, hash) => {
    let response;
    for (let attempt = 0; attempt < 12; attempt++) {
      response = await get(url);
      if (response.status === 200 && response.headers.get('x-blog-release') === release) {
        const bytes = Buffer.from(await response.clone().arrayBuffer());
        if (createHash('sha256').update(bytes).digest('hex') === hash) return response;
      }
      if (attempt < 11) await sleep(5000);
    }
    return response; // The assertions below still fail for persistent mismatches.
  };
  let marker;
  for (let attempt = 0; attempt < 12; attempt++) {
    marker = await get(site + '/hosting.json?release=' + release);
    if (marker.status === 200 && marker.headers.get('x-blog-release') === release) break;
    if (attempt < 11) await sleep(5000);
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
    const response = await released(site + url + '?release=' + release, expected.sha256);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get('x-blog-release'), release, url);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), expected.sha256, url);
  }
  assert.equal((await get(site + '/__static_missing_' + release + '/')).status, 404);
  console.log('STATIC_LIVE release=' + release + ' hashes=' + paths.length + ' missing=404 PASS');
}
if (require.main === module) verify(process.argv[2], process.env.BLOG_RELEASE).catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { verify };
