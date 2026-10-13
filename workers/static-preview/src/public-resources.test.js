import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicKey,publicUrl,byteRange,servePublicResource,resourceAdminRoute,scanReferences,referencesFor,resourceCatalog} from './public-resources.js';
const SITE='https://preview.test',SHA='a'.repeat(40);
class Bucket {
  map=new Map();
  async head(key){const row=this.map.get(key);return row?this.object(key,row):null;}
  object(key,row){return {key,size:row.data.length,etag:row.etag,httpEtag:'"'+row.etag+'"',uploaded:row.uploaded,httpMetadata:row.httpMetadata,customMetadata:row.customMetadata,writeHttpMetadata(headers){for(const [k,v]of Object.entries(row.httpMetadata)){if(k==='contentType')headers.set('Content-Type',v);if(k==='cacheControl')headers.set('Cache-Control',v);}}};}
  async get(key,options={}){const row=this.map.get(key);if(!row)return null;const object=this.object(key,row);if(options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==row.etag)return object;const data=options.range?row.data.subarray(options.range.offset,options.range.offset+options.range.length):row.data;return {...object,body:new Response(data).body};}
  async put(key,value,options={}){if(options.onlyIf?.etagDoesNotMatch==='*'&&this.map.has(key)||options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==this.map.get(key)?.etag)return null;const data=Buffer.from(value?.getReader?await new Response(value).arrayBuffer():value instanceof ArrayBuffer?new Uint8Array(value):value);const row={data,etag:createHash('md5').update(data).digest('hex'),uploaded:new Date('2026-10-13T00:00:00Z'),httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}};this.map.set(key,row);return this.object(key,row);}
  async delete(key){this.map.delete(key);}
  async list(){return {objects:[...this.map].map(([key,row])=>this.object(key,row)),truncated:false};}
}
const accounts={fetch:async r=>Response.json({}, {status:r.headers.get('Cookie')==='admin'?200:401})};
const env=()=>({PUBLIC_UPLOADS:new Bucket(),SITE_ORIGIN:SITE,RESOURCE_REPOSITORY:'owner/repo',RESOURCE_BRANCH:'preview',RESOURCE_STATIC_FALLBACK:'1',ASSETS:{fetch:async()=>new Response('legacy asset')}});
const req=(path,method='GET',body,extra={})=>new Request(SITE+path,{method,headers:{Origin:SITE,'X-Gaming-Admin':'1',Cookie:'admin','X-GitHub-Read-Token':'test-token',...extra},...(body!==undefined?{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}:{})});
function github(text='',changed=false){let heads=0;return async(url,options)=>{if(url.includes('/git/ref/heads/'))return Response.json({object:{sha:changed&&heads++?'b'.repeat(40):SHA}});if(url.includes('/git/trees/'))return Response.json({truncated:false,tree:[{type:'blob',path:'content/posts/demo.md'}]});if(url==='https://api.github.com/graphql'){assert.equal(options.headers.Authorization,'Bearer test-token');return Response.json({data:{repository:{b0:{text,isBinary:false,byteSize:text.length}}}});}throw Error('Unexpected fetch '+url);};}
async function pdf(e,key='source.pdf'){await e.PUBLIC_UPLOADS.put(key,'%PDF-1.4\nfixture',{httpMetadata:{contentType:'application/pdf'},customMetadata:{sha256:'b'.repeat(64)}});}
test('file rename requires authentication, enforces CAS, survives reload and leaves referenced bytes intact',async()=>{
 const e=env();await pdf(e,'folder/source.pdf');const call=r=>resourceAdminRoute(r,e,{},accounts);const before=await resourceCatalog(e);
 const input={action:'rename-file',key:'folder/source.pdf',name:'新名称.pdf',revision:before.folderRevision};
 assert.equal((await call(req('/ns/api/resources/folders','POST',input,{Cookie:''}))).status,401);
 assert.equal((await call(req('/ns/api/resources/folders','POST',input,{Origin:'https://foreign.test'}))).status,403);
 const response=await call(req('/ns/api/resources/folders','POST',input));assert.equal(response.status,200);assert.equal((await response.json()).files[0].name,'新名称.pdf');
 assert.equal((await call(req('/ns/api/resources/folders','POST',input))).status,409);
 const updated=await resourceCatalog(e);assert.equal(updated.files[0].name,'新名称.pdf');assert.equal(updated.files[0].path,before.files[0].path);assert.equal(updated.files[0].sha256,before.files[0].sha256);
 assert.equal(await (await servePublicResource(req('/uploads/folder/source.pdf'),e)).text(),'%PDF-1.4\nfixture');
 const invalid=await call(req('/ns/api/resources/folders','POST',{...input,name:'script.html',revision:updated.folderRevision}));assert.equal(invalid.status,400);assert.equal((await invalid.json()).error,'RESOURCE_EXTENSION_CHANGED');
 const renameFolder=await call(req('/ns/api/resources/folders','POST',{action:'rename',source:'folder',destination:'renamed',revision:updated.folderRevision}));assert.equal(renameFolder.status,200);assert.equal((await renameFolder.json()).files[0].name,'新名称.pdf');
});
test('public keys preserve Unicode/space paths and reject hidden, traversal, encoded separators and control paths',()=>{
  assert.equal(publicKey('/uploads/'+encodeURIComponent('说明 文档.pdf')),'说明 文档.pdf');
  for(const path of ['/private/a','/uploads/.trash/a','/uploads/a/%2e%2e/b','/uploads/a%5Cb','/uploads/a%00.pdf','/uploads/a%3F.pdf','/uploads/%XX'])assert.equal(publicKey(path),null,path);
  assert.equal(publicKey(publicUrl('folder/菜单.pdf')),'folder/菜单.pdf');
});
test('single HTTP ranges support bounded, open-ended, suffix, overflow and invalid forms',()=>{
  assert.deepEqual(byteRange('bytes=0-4',10),{offset:0,length:5});assert.deepEqual(byteRange('bytes=6-',10),{offset:6,length:4});assert.deepEqual(byteRange('bytes=-4',10),{offset:6,length:4});assert.deepEqual(byteRange('bytes=0-99',10),{offset:0,length:10});
  for(const value of ['bytes=10-','bytes=-0','bytes=2-1','bytes=0-1,3-4','bytes=-','bytes=9999999999999999999-'])assert.equal(byteRange(value,10),false);
});
test('public PDF GET/HEAD, ETag 304 and first/suffix Range stream exact bytes',async()=>{
  const e=env();await pdf(e);const full=await servePublicResource(req('/uploads/source.pdf'),e);assert.equal(full.status,200);assert.equal(full.headers.get('x-resource-storage'),'r2');assert.equal(await full.text(),'%PDF-1.4\nfixture');
  const head=await servePublicResource(req('/uploads/source.pdf','HEAD'),e);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-type'),'application/pdf');
  assert.equal((await servePublicResource(req('/uploads/source.pdf','GET',undefined,{'If-None-Match':head.headers.get('etag')}),e)).status,304);
  const range=await servePublicResource(req('/uploads/source.pdf','GET',undefined,{Range:'bytes=0-4'}),e);assert.equal(range.status,206);assert.equal(await range.text(),'%PDF-');
  assert.equal((await servePublicResource(req('/uploads/source.pdf','GET',undefined,{Range:'bytes=500-'}),e)).status,416);
  assert.equal((await servePublicResource(req('/uploads/source.pdf','POST','x'),e)).status,405);
});
test('If-Range mismatch serves the complete representation and tombstones suppress legacy fallback',async()=>{
  const e=env();await pdf(e);assert.equal((await servePublicResource(req('/uploads/source.pdf','GET',undefined,{Range:'bytes=0-4','If-Range':'"wrong"'}),e)).status,200);
  const fallback=await servePublicResource(req('/uploads/missing.pdf'),e);assert.equal(await fallback.text(),'legacy asset');
  await e.PUBLIC_UPLOADS.put('.deleted/missing.pdf','{}');assert.equal((await servePublicResource(req('/uploads/missing.pdf'),e)).status,404);
});
test('admin uploads require session and same origin, reject executable types and fake signatures',async()=>{
  const e=env();const call=r=>resourceAdminRoute(r,e,{},accounts);
  assert.equal((await call(req('/ns/api/resources/upload?name=a.pdf','PUT','%PDF-test',{Cookie:''}))).status,401);
  assert.equal((await call(req('/ns/api/resources/upload?name=a.pdf','PUT','%PDF-test',{Origin:'https://foreign.test'}))).status,403);
  assert.equal((await call(req('/ns/api/resources/upload?name=a.html','PUT','<script>'))).status,400);
  assert.equal((await call(req('/ns/api/resources/upload?name=a.pdf','PUT','fake'))).status,400);
  assert.equal((await call(req('/ns/api/resources/upload?name=a.pdf','PUT','%PDF-1.4',{ 'Content-Length':String(21*1024*1024)}))).status,413);
});
test('immutable uploads deduplicate same filename/content and catalog does not expose archives',async()=>{
  const e=env();const a=await resourceAdminRoute(req('/ns/api/resources/upload?name='+encodeURIComponent('说明.pdf'),'PUT','%PDF-1.4\nfile'),e,{},accounts);assert.equal(a.status,200);const file=await a.json();assert.ok(file.key.startsWith('cms/'+file.sha256+'/'));assert.equal((await resourceAdminRoute(req('/ns/api/resources/upload?name='+encodeURIComponent('说明.pdf'),'PUT','%PDF-1.4\nfile'),e,{},accounts)).status,200);
  await e.PUBLIC_UPLOADS.put('.trash/backup','secret');const catalog=await resourceCatalog(e);assert.equal(catalog.files.length,1);assert.equal(catalog.files[0].sha256,file.sha256);
});
test('folder operations authenticate, reject stale revisions and move without changing public bytes or ETag',async()=>{
 const e=env();await pdf(e);const call=(body,extra={})=>resourceAdminRoute(req('/ns/api/resources/folders','POST',body,extra),e,{},accounts);
 assert.equal((await call({action:'create',destination:'文档',revision:'none'},{Cookie:''})).status,401);
 const created=await call({action:'create',destination:'文档',revision:'none'});assert.equal(created.status,200);const catalog=await created.json();assert.ok(catalog.folders.includes('文档'));
 assert.equal((await call({action:'rename',source:'文档',destination:'资料',revision:'none'})).status,409);
 const before=await e.PUBLIC_UPLOADS.head('source.pdf');const moved=await call({action:'move',keys:['source.pdf'],destination:'文档',revision:catalog.folderRevision});assert.equal(moved.status,200);assert.equal((await moved.json()).files[0].folder,'文档');assert.equal((await e.PUBLIC_UPLOADS.head('source.pdf')).etag,before.etag);assert.equal(await(await servePublicResource(req('/uploads/source.pdf'),e)).text(),'%PDF-1.4\nfixture');
});
test('a conditional folder write loses a concurrent race cleanly, preserving the winning state',async()=>{
 const e=env();await pdf(e);const create=await resourceAdminRoute(req('/ns/api/resources/folders','POST',{action:'create',destination:'first',revision:'none'}),e,{},accounts);const version=(await create.json()).folderRevision;
 const put=e.PUBLIC_UPLOADS.put.bind(e.PUBLIC_UPLOADS);let raced=false;e.PUBLIC_UPLOADS.put=async(key,data,options)=>{if(key==='.catalog/folders.json'&&!raced){raced=true;const state=JSON.parse(e.PUBLIC_UPLOADS.map.get(key).data);state.folders.push('concurrent');await put(key,JSON.stringify(state));}return put(key,data,options);};
 const loser=await resourceAdminRoute(req('/ns/api/resources/folders','POST',{action:'rename',source:'first',destination:'lost',revision:version}),e,{},accounts);assert.equal(loser.status,409);const catalog=await resourceCatalog(e);assert.ok(catalog.folders.includes('concurrent'));assert.ok(catalog.folders.includes('first'));assert.ok(!catalog.folders.includes('lost'));
});
test('upload goes into requested directory; a duplicate upload never silently relocates existing files',async()=>{
 const e=env();const created=await resourceAdminRoute(req('/ns/api/resources/folders','POST',{action:'create',destination:'文档',revision:'none'}),e,{},accounts);assert.equal(created.status,200);
 const upload=await resourceAdminRoute(req('/ns/api/resources/upload?name=a.pdf&folder='+encodeURIComponent('文档'),'PUT','%PDF-1.4\nfolder'),e,{},accounts);assert.equal(upload.status,200);const file=await upload.json();assert.equal((await resourceCatalog(e)).files[0].folder,'文档');
 const duplicate=await resourceAdminRoute(req('/ns/api/resources/upload?name=a.pdf&folder=','PUT','%PDF-1.4\nfolder'),e,{},accounts);assert.equal((await duplicate.json()).reused,true);assert.equal((await resourceCatalog(e)).files[0].folder,'文档');assert.equal(file.path,(await resourceCatalog(e)).files[0].path);
 assert.equal((await resourceAdminRoute(req('/ns/api/resources/upload?name=b.pdf&folder=missing','PUT','%PDF-file'),e,{},accounts)).status,409);
});
test('hidden or hash-containing upload names become public-safe before folder metadata is written',async()=>{const e=env();const response=await resourceAdminRoute(req('/ns/api/resources/upload?folder=&name='+encodeURIComponent('.参考#文档.pdf'),'PUT','%PDF-1.4\nname'),e,{},accounts);assert.equal(response.status,200);const file=await response.json();assert.ok(file.key.endsWith('_参考_文档.pdf'));assert.equal((await servePublicResource(req(file.path),e)).status,200);assert.equal((await resourceCatalog(e)).files[0].folder,'');});
test('reference scanner uses pinned Git blobs, current head checks and requires ephemeral read token',async()=>{
  await assert.rejects(()=>scanReferences(env(),github(''),''),/REFERENCE_TOKEN_REQUIRED/);
  const snapshot=await scanReferences(env(),github('![a](/uploads/source.pdf)'),'test-token');assert.equal(snapshot.commit,SHA);assert.equal(referencesFor('source.pdf',snapshot).length,1);
  await assert.rejects(()=>scanReferences(env(),github('',true),'test-token'),/REFERENCE_SOURCE_CHANGED/);
});
test('referenced resources are protected; unreferenced deletion archives and restoration restores exact bytes',async()=>{
  const e=env();await pdf(e);const data={key:'source.pdf',sha256:'b'.repeat(64),commit:SHA};
  const denied=await resourceAdminRoute(req('/ns/api/resources/delete','POST',data),e,{},accounts,github('/uploads/source.pdf'));assert.equal(denied.status,409);assert.equal((await denied.json()).error,'RESOURCE_REFERENCED');
  const deleted=await resourceAdminRoute(req('/ns/api/resources/delete','POST',data),e,{},accounts,github(''));assert.equal(deleted.status,200);const receipt=await deleted.json();assert.equal((await servePublicResource(req('/uploads/source.pdf'),e)).status,404);
  const restored=await resourceAdminRoute(req('/ns/api/resources/restore','POST',{key:data.key,trashKey:receipt.trashKey}),e,{},accounts);assert.equal(restored.status,200);assert.equal(await(await servePublicResource(req('/uploads/source.pdf'),e)).text(),'%PDF-1.4\nfixture');
});
test('stale reference commit cannot delete or overwrite a changed object',async()=>{
  const e=env();await pdf(e);const r=await resourceAdminRoute(req('/ns/api/resources/delete','POST',{key:'source.pdf',sha256:'b'.repeat(64),commit:'c'.repeat(40)}),e,{},accounts,github(''));assert.equal(r.status,409);assert.ok(await e.PUBLIC_UPLOADS.head('source.pdf'));
});
