const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/sveltia/admin-auth.js','utf8');
const KEY='sveltia-cms.user',TOKEN='fixture-cms-token-1234567890',SESSION='/ns/api/accounts/session';
const response=(value={},status=200)=>new Response(JSON.stringify(value),{status});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({user={backendName:'github',token:TOKEN},handler=()=>response()}={}) {
  const values=new Map(user===null?[]:[[KEY,JSON.stringify(user)]]),calls=[],writes=[],events={};let poll;
  const localStorage={getItem:key=>values.get(key)||null,setItem(key,value){writes.push(key);values.set(key,value);},removeItem(key){writes.push(key);values.delete(key);}};
  const window={addEventListener:(type,callback)=>events[type]=callback};
  vm.runInNewContext(source,{window,localStorage,fetch:async(path,options)=>{calls.push({path,options});return handler(path,options,calls);},URL,Headers,AbortSignal,location:{origin:'https://blog.test'},setInterval:callback=>{poll=callback;return 1;},clearInterval(){}});
  return {auth:window.BlogAdminAuth,values,calls,writes,events,poll:()=>poll()};
}
test('one CMS login serves uploads, reopened reference scans, folders, private posts and accounts',async()=>{
  const {auth,calls,writes}=setup();
  const paths=['/ns/api/resources/upload?name=x.png','/ns/api/resources/references','/ns/api/resources/references','/ns/api/resources/delete','/ns/api/resources/folders','/ns/api/posts/admin/'+('a'.repeat(32)),'/ns/api/accounts'];
  for(const path of paths)await auth.request(path,{headers:{'X-GitHub-Read-Token':'caller-must-not-override'}});
  assert.equal(calls.filter(c=>c.path===SESSION).length,1);
  assert.equal(JSON.parse(calls[0].options.body).token,TOKEN);
  for(const {path,options} of calls.slice(1)) {
    assert.equal(options.headers.get('X-GitHub-Read-Token'),['/ns/api/resources/references','/ns/api/resources/delete'].includes(path)?TOKEN:null);
    assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  }
  assert.deepEqual(writes,[]);
});
test('parallel actions share a single credential exchange',async()=>{
  const {auth,calls}=setup();
  await Promise.all(Array.from({length:8},()=>auth.request('/ns/api/accounts')));
  assert.equal(calls.filter(c=>c.path===SESSION).length,1);
});
test('absent, malformed and other-backend caches never authorize or ask for a second token',async()=>{
  for(const user of [null,{}, {backendName:'github',token:'short'}, {backendName:'gitlab',token:TOKEN},{backendName:'github',token:TOKEN+'\n'}]) {
    const {auth,calls}=setup({user});await assert.rejects(auth.request('/ns/api/accounts'),{code:'CMS_LOGIN_REQUIRED'});assert.equal(calls.length,0);
  }
  const {auth,values}=setup();values.set(KEY,'{broken');await assert.rejects(auth.request('/ns/api/accounts'),{code:'CMS_LOGIN_REQUIRED'});
});
test('expired admin cookie silently renews once, preserving the mutation body',async()=>{
  let actions=0;
  const {auth,calls}=setup({handler:path=>path===SESSION?response():++actions===1?response({error:'ADMIN_LOGIN_REQUIRED'},401):response({ok:true})});
  const file=new Blob(['test image']);
  assert.equal((await auth.request('/ns/api/resources/upload',{method:'PUT',body:file})).status,200);
  assert.equal(calls.filter(c=>c.path===SESSION).length,2);assert.equal(actions,2);
  assert.equal(calls[1].options.body,file);assert.equal(calls[3].options.body,file);
});
test('simultaneously expired requests share one renewal and a repeated 401 stops',async()=>{
  let actions=0;
  const {auth,calls}=setup({handler:path=>path===SESSION?response():++actions<=3?response({error:'ADMIN_LOGIN_REQUIRED'},401):response()});
  await Promise.all(Array.from({length:3},()=>auth.request('/ns/api/accounts')));
  assert.equal(calls.filter(c=>c.path===SESSION).length,2);assert.equal(actions,6);
  const blocked=setup({handler:path=>path===SESSION?response():response({error:'ADMIN_LOGIN_REQUIRED'},401)});
  assert.equal((await blocked.auth.request('/ns/api/accounts')).status,401);assert.equal(blocked.calls.length,4);
});
test('non-owner, revoked credential and rate limit never reach the requested operation',async()=>{
  for(const [error,status] of [['ADMIN_ONLY',403],['ADMIN_LOGIN_FAILED',401],['LOGIN_RATE_LIMIT',429]]) {
    const {auth,calls}=setup({handler:()=>response({error,token:TOKEN},status)});
    await assert.rejects(auth.request('/ns/api/resources/delete'),e=>e.code===error&&!e.message.includes(TOKEN));assert.equal(calls.length,1);
  }
});
test('only known same-origin admin routes receive credentials; redirects are refused',async()=>{
  const {auth,calls}=setup();
  for(const path of ['https://evil.test/ns/api/accounts','//evil.test/ns/api/resources/delete','/ns/api/posts/public/id','/ns/api/accounts-other','/uploads/file','https://name:password@blog.test/ns/api/accounts'])await assert.rejects(auth.request(path));
  assert.equal(calls.length,0);
});
test('conflicts, upstream failures, unrelated 401s and network errors never replay mutations',async()=>{
  for(const status of [401,403,409,500,503]) {
    const {auth,calls}=setup({handler:path=>path===SESSION?response():response({error:'NOT_ADMIN_EXPIRY'},status)});
    assert.equal((await auth.request('/ns/api/resources/delete',{method:'POST',body:'{}'})).status,status);assert.equal(calls.length,2);
  }
  const {auth,calls}=setup({handler:path=>{if(path===SESSION)return response();throw Error('network');}});
  await assert.rejects(auth.request('/ns/api/resources/delete',{method:'POST'}),/network/);assert.equal(calls.length,2);
});
test('CMS logout in this tab or another tab revokes the cookie and subsequent actions stop',async()=>{
  for(const viaStorage of [false,true]) {
    const {auth,values,calls,events,poll}=setup();await auth.request('/ns/api/accounts');values.set(KEY,'{}');
    if(viaStorage)events.storage({key:KEY});else poll();await tick();
    assert.equal(calls.at(-1).options.method,'DELETE');
    await assert.rejects(auth.request('/ns/api/accounts'),{code:'CMS_LOGIN_REQUIRED'});assert.equal(calls.length,3);
  }
});
test('logout waits for a pending exchange, then clears its late cookie without running the action',async()=>{
  let finish;
  const {auth,calls,values}=setup({handler:(path,options)=>options.method==='POST'?new Promise(resolve=>finish=()=>resolve(response())):response()});
  const action=assert.rejects(auth.request('/ns/api/accounts'),{code:'CMS_LOGIN_CHANGED'});await tick();
  const logout=auth.signOut();finish();await action;await logout;
  assert.equal(values.get(KEY),'{}');assert.deepEqual(calls.map(c=>[c.path,c.options.method]),[[SESSION,'POST'],[SESSION,'DELETE']]);
});
test('account switching revokes the old cookie before verifying the new account',async()=>{
  const nextToken='fixture-other-user-token-1234567890';
  const {auth,values,calls}=setup({handler:(path,options)=>path===SESSION&&options.method==='POST'&&JSON.parse(options.body).token===nextToken?response({error:'ADMIN_ONLY'},403):response()});
  await auth.request('/ns/api/accounts');values.set(KEY,JSON.stringify({backendName:'github',token:nextToken}));
  await assert.rejects(auth.request('/ns/api/resources/delete'),{code:'ADMIN_ONLY'});
  assert.equal(calls[2].options.method,'DELETE');assert.equal(calls[3].options.method,'POST');assert.equal(calls.length,4);
});
test('all admin entry pages load the adapter first and CMS compatibility version is pinned',()=>{
  for(const file of ['index.html','accounts.html','resources.html']) {
    const html=fs.readFileSync('public/sveltia/'+file,'utf8');assert.match(html,/<script src="\/sveltia\/admin-auth\.js\?v=/);
    assert.equal(html.match(/<script[^>]+src="([^"]+)/)[1].split('?')[0],'/sveltia/admin-auth.js');
    assert.doesNotMatch(html,/github-token|login-form/);
  }
  assert.match(fs.readFileSync('public/sveltia/index.html','utf8'),/@sveltia\/cms@0\.256\.1\/dist/);
  for(const file of ['r2-media.js','article-access.js','accounts.js'])assert.match(fs.readFileSync('public/sveltia/'+file,'utf8'),/window\.BlogAdminAuth\.request/);
  assert.doesNotMatch(fs.readFileSync('public/sveltia/r2-media.js','utf8'),/token\.type|readToken|requestLogin/);
});
