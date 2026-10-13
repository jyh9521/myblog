const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { verify } = require('./verify-static-host.cjs');
test('publication verification retries individual stale edges, not only the manifest', async () => {
  const release = 'a'.repeat(40), body = 'current export';
  const sha256 = createHash('sha256').update(body).digest('hex');
  const files = ['index.html','sveltia/index.html','sveltia/resources.html','sveltia/r2-media.js','_next/static/a.css','_next/static/a.js'].map(path=>({path,sha256}));
  let rootCalls = 0, sleeps = 0;
  await verify('https://fixture.test', release, {
    sleep: async () => { sleeps++; },
    fetcher: async url => {
      const path = new URL(url).pathname;
      if (path === '/hosting.json') return Response.json({release,files},{headers:{'x-blog-hosting':'workers-static-assets','x-blog-release':release}});
      if (path.startsWith('/__static_missing_')) return new Response('',{status:404});
      // First response has old headers, second has new headers with stale bytes.
      if(path === '/' && ++rootCalls <= 2) return new Response('old export',{headers:{'x-blog-release':rootCalls===1?'b'.repeat(40):release}});
      return new Response(body,{headers:{'x-blog-release':release}});
    }
  });
  assert.equal(rootCalls,3); assert.equal(sleeps,2);
});
