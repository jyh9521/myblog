import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {githubToken} from './github.mjs';
import {fixturePdf} from './fixture-pdf.mjs';
const worker=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(readFileSync(resolve(worker,'wrangler.jsonc'),'utf8'));
const site=config.vars.SITE_ORIGIN;
const production='https://blog.blfy.cc';
const evidence=resolve(worker,'.wrangler/evidence');mkdirSync(evidence,{recursive:true});
const results=[];
async function check(name,run) {try{const data=await run();results.push({name,status:'PASS',...data});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.log('FAIL '+name+' '+e.message);}}
async function request(path,options={}) {return fetch(site+path,{...options,signal:AbortSignal.timeout(30000)});}
await check('production public profile equals preview',async()=>{
  const [a,b]=await Promise.all([fetch(production+'/ns/api/accounts/public'),request('/ns/api/accounts/public')]);assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(await a.json(),await b.json());return {http:200};
});
await check('all prepared asset paths resolve',async()=>{
  const files=JSON.parse(readFileSync(resolve(worker,'.wrangler/asset-manifest.json'),'utf8')).files.filter(f=>f.path!=='_headers');
  const failures=[];let next=0;
  await Promise.all(Array.from({length:8},async()=>{while(next<files.length){const f=files[next++];try{const r=await request('/'+f.path.split('/').map(encodeURIComponent).join('/'),{method:'HEAD'});if(r.status!==200)failures.push({path:f.path,http:r.status});}catch(e){failures.push({path:f.path,error:e.message});}}}));
  writeFileSync(resolve(evidence,'asset-paths.json'),JSON.stringify({checked:files.length,failures},null,2));assert.equal(failures.length,0);return {checked:files.length};
});
await check('Unicode resources and JS/PDF bytes retain source hashes',async()=>{
  const manifest=JSON.parse(readFileSync(resolve(worker,'.wrangler/asset-manifest.json'),'utf8'));
  const files=[manifest.files.find(f=>f.path.endsWith('/主菜单.png')),manifest.files.find(f=>f.path.endsWith('.pdf')),manifest.files.find(f=>f.path.startsWith('_next/')&&f.path.endsWith('.js')),manifest.files.find(f=>f.path==='sveltia/article-access.js')].filter(Boolean);
  assert.equal(files.length,4);
  for(const f of files){const r=await request('/'+f.path.split('/').map(encodeURIComponent).join('/'));assert.equal(r.status,200);const hash=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');assert.equal(hash,f.sha256);}
  return {checked:files.map(f=>f.path)};
});
await check('404, canonical slash and preview noindex',async()=>{
  const missing=await request('/this-path-does-not-exist/');assert.equal(missing.status,404);
  const r=await request('/posts',{redirect:'manual'});assert.equal(r.status,307);assert.match(r.headers.get('location'),/\/posts\/$/);
  const h=await request('/');assert.match(h.headers.get('x-robots-tag'),/noindex/);
  return {missing:404,slash:307,noindex:true};
});
let adminCookie='';
await check('real GitHub identity login sets secure preview session',async()=>{
  const r=await request('/ns/api/accounts/session',{method:'POST',headers:{Origin:site,'X-Gaming-Admin':'1','Content-Type':'application/json'},body:JSON.stringify({token:githubToken()})});
  assert.equal(r.status,200);assert.equal((await r.json()).login,'jyh9521');
  const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);adminCookie=cookie.split(';')[0];return {http:200,cookieFlags:'HttpOnly; Secure; SameSite=Lax',host:site};
});
const headers={Origin:site,'X-Gaming-Admin':'1','Content-Type':'application/json'};
const id='0123456789abcdef0123456789abcdef';
await check('private body save, conflict, password, session and private PDF Range',async()=>{
  assert.ok(adminCookie);const owner={...headers,Cookie:adminCookie};
  const root='/ns/api/posts/admin/'+id;
  let old=await request(root,{headers:owner});let revision=old.status===200?(await old.json()).revision:undefined;
  const body='# 预览迁移测试正文\n\n独立数据库验证成功。';
  const saved=await request(root,{method:'POST',headers:owner,body:JSON.stringify({body,password:'preview-validation-2026',revision})});assert.equal(saved.status,200);revision=(await saved.json()).revision;
  const conflict=await request(root,{method:'POST',headers:owner,body:JSON.stringify({body:'stale',password:'',revision:revision-1})});assert.equal(conflict.status,409);
  const unauth=await request('/ns/api/posts/'+id);assert.equal(unauth.status,401);
  const wrong=await request('/ns/api/posts/'+id+'/unlock',{method:'POST',headers,body:JSON.stringify({password:'wrong'})});assert.equal(wrong.status,401);
  const unlocked=await request('/ns/api/posts/'+id+'/unlock',{method:'POST',headers,body:JSON.stringify({password:'preview-validation-2026'})});assert.equal(unlocked.status,200);assert.equal((await unlocked.json()).body,body);assert.match(unlocked.headers.get('cache-control'),/no-store/);
  const visitor=unlocked.headers.get('set-cookie').split(';')[0];
  const form=new FormData();form.append('file',new File([fixturePdf()],'私密 验证.pdf',{type:'application/pdf'}));
  const upload=await request(root+'/assets',{method:'POST',headers:{Origin:site,'X-Gaming-Admin':'1',Cookie:adminCookie},body:form});assert.equal(upload.status,200);const asset=await upload.json();
  assert.equal((await request(asset.url)).status,401);
  const pdf=await request(asset.url,{headers:{Cookie:visitor,Range:'bytes=0-4'}});assert.equal(pdf.status,206);assert.equal(await pdf.text(),'%PDF-');
  const renewed=await request('/ns/api/posts/'+id,{headers:{Cookie:visitor}});assert.equal(renewed.status,200);
  const edited=await request(root,{method:'POST',headers:owner,body:JSON.stringify({body,password:'',revision})});assert.equal(edited.status,200);
  assert.equal((await request('/ns/api/posts/'+id,{headers:{Cookie:visitor}})).status,401);
  // A fixture-only private PDF is kept for the subsequent browser rendering check.
  writeFileSync(resolve(evidence,'private-fixture.json'),JSON.stringify({id,asset:asset.url,password:'preview-validation-2026'}));
  return {save:200,conflict:409,locked:401,wrongPassword:401,unlock:200,pdfRange:206,revokedOldSession:401};
});
await check('foreign origins rejected and counter writes stay in preview',async()=>{
  const foreign=await request('/ns/api/accounts/session',{method:'POST',headers:{...headers,Origin:production},body:JSON.stringify({token:'invalid-test-token-000000'})});assert.equal(foreign.status,403);
  const before=await (await request('/ns/api/counter')).json();
  const r=await request('/ns/api/counter',{method:'POST',headers,body:JSON.stringify({visitorId:'preview-fixture-2026'})});assert.equal(r.status,200);const after=await r.json();assert.equal(after.pageViews,before.pageViews+1);
  return {foreignOrigin:403,previewCounterDelta:1,database:config.d1_databases[0].database_id};
});
await check('private fixture body absent from all published text assets',async()=>{
  const manifest=JSON.parse(readFileSync(resolve(worker,'.wrangler/asset-manifest.json'),'utf8'));
  const files=manifest.files.filter(f=>/\.(html|txt|json|xml|js)$/.test(f.path));
  for(const f of files)assert.ok(!readFileSync(resolve(worker,'.wrangler/site',f.path),'utf8').includes('独立数据库验证成功。'),f.path);
  return {checked:files.length,leakedBodies:0};
});
await check('OAuth callback routes preserve auth rejection, not static fallback',async()=>{
  for(const platform of ['steam','xbox','psn','nintendo','gog','epic']){const r=await request('/api/auth/'+platform+'/callback?state=invalid',{headers:{Cookie:adminCookie},redirect:'manual'});assert.equal(r.status,303);assert.ok(r.headers.get('location').startsWith(site+'/sveltia/accounts.html?error=INVALID_CALLBACK'));}
  return {platforms:6,http:303,externalProviderTokenExchange:'not exercised'};
});
await check('alternating same-client homepage latency samples',async()=>{
  const samples=[];
  for(let i=0;i<6;i++)for(const origin of i%2?[site,production]:[production,site]){const start=performance.now();const r=await fetch(origin+'/',{signal:AbortSignal.timeout(30000)});const ttfb=performance.now()-start;assert.equal(r.status,200);const bytes=(await r.arrayBuffer()).byteLength;samples.push({origin,ttfbMs:Math.round(ttfb),totalMs:Math.round(performance.now()-start),bytes});}
  writeFileSync(resolve(evidence,'latency.json'),JSON.stringify({client:'local execution host, not multi-region RUM',samples},null,2));return {samples:samples.length};
});
writeFileSync(resolve(evidence,'live-results.json'),JSON.stringify({site,production,results},null,2));
console.log('LIVE_RESULT pass='+results.filter(r=>r.status==='PASS').length+' fail='+results.filter(r=>r.status==='FAIL').length);
process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
