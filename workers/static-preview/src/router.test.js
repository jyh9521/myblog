import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backendFor, dispatch} from './router.js';
import {readFileSync} from 'node:fs';

test('API dispatch is exact, static assets remain asset-first', () => {
  for (const path of ['/ns/api/posts/a', '/api/auth/xbox/callback', '/ns/api/accounts', '/ns/api/accounts/session']) assert.equal(backendFor(path),'accounts');
  assert.equal(backendFor('/ns/api/accounts/public'),'public-accounts');
  assert.equal(backendFor('/ns/api/accountspoof'),'metadata');
  assert.equal(backendFor('/ns/api/counter'),'metadata');
  assert.equal(backendFor('/posts/example/'),'assets');
});
test('only public read reaches production, without credentials or caller query', async () => {
  let calls=0;
  const env={PUBLIC_ACCOUNTS:{async fetch(r){calls++;assert.equal(r.url,'https://blog.blfy.cc/ns/api/accounts/public');assert.equal(r.headers.get('cookie'),null);assert.equal(r.headers.get('authorization'),null);return Response.json({accounts:[]});}}};
  const r=await dispatch(new Request('https://preview.example/ns/api/accounts/public?force=1',{headers:{cookie:'secret',authorization:'Bearer secret'}}),env,{},{});
  assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);
  assert.equal((await dispatch(new Request('https://preview.example/ns/api/accounts/public',{method:'POST'}),env,{},{})).status,405);
  assert.equal(calls,1);
});
test('mutations use isolated backend with original origin and cookie', async () => {
  const env={DB:{fixture:true}};
  const r=await dispatch(new Request('https://preview.example/ns/api/posts/admin/a',{method:'POST',headers:{origin:'https://preview.example',cookie:'preview'}}),env,{}, {accounts:{async fetch(r,e){assert.equal(e,env);assert.equal(r.headers.get('origin'),'https://preview.example');assert.equal(r.headers.get('cookie'),'preview');return Response.json({saved:true});}}});
  assert.deepEqual(await r.json(),{saved:true});
});
test('preview has no production route, database, scheduled sync or all-path Worker execution', () => {
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.name,'blog-static-preview');assert.equal(config.routes,undefined);assert.equal(config.triggers,undefined);
  assert.equal(config.d1_databases[0].database_name,'blog-static-preview');
  assert.ok(!['a7893bd2-c1d8-4b2f-9349-9907c4717080','0c74164d-d224-420b-bebc-af05b8648073'].includes(config.d1_databases[0].database_id));
  assert.deepEqual(config.assets.run_worker_first,['/ns/api/*','/api/auth/*']);
  assert.equal(config.assets.html_handling,'auto-trailing-slash');
});
