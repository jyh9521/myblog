import {FOLDER_STATE_KEY,folderPath,folderLayout,planFolders} from './resource-folders.js';
const ROOT='/ns/api/resources', MAX_UPLOAD=20*1024*1024;
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',pdf:'application/pdf',mp3:'audio/mpeg',mp4:'video/mp4',ogg:'audio/ogg',wav:'audio/wav',zip:'application/zip',gz:'application/gzip',txt:'text/plain; charset=utf-8'};
export function publicKey(pathname) {
  if(!pathname.startsWith('/uploads/'))return null;
  try {const key=decodeURIComponent(pathname.slice(9));
    if(!key||new TextEncoder().encode(key).length>1024||/[\\\x00-\x1f\x7f?#]/.test(key)||key.split('/').some(p=>!p||p.startsWith('.')||p==='..'))return null;
    return key;
  }catch{return null;}
}
export const publicUrl=key=>'/uploads/'+key.split('/').map(encodeURIComponent).join('/');
export function byteRange(value,size) {
  if(!value)return null;
  const m=value.match(/^bytes=(\d*)-(\d*)$/);
  if(!m||(!m[1]&&!m[2])||size===0)return false;
  let start,end;
  if(!m[1]){const tail=Number(m[2]);if(!Number.isSafeInteger(tail)||tail<=0)return false;start=Math.max(0,size-tail);end=size-1;}
  else {start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;}
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start?{offset:start,length:end-start+1}:false;
}
function metadataHeaders(object,key) {
  const headers=new Headers();object.writeHttpMetadata(headers);
  headers.set('ETag',object.httpEtag);headers.set('Last-Modified',object.uploaded.toUTCString());
  headers.set('X-Content-Type-Options','nosniff');headers.set('Accept-Ranges','bytes');headers.set('X-Resource-Storage','r2');
  headers.set('Content-Length',String(object.size));
  headers.set('Cache-Control',key.startsWith('cms/')?'public, max-age=31536000, immutable':'public, max-age=300');
  if(object.customMetadata?.sha256)headers.set('X-Resource-SHA256',object.customMetadata.sha256);
  if(!/^(image\/|audio\/|video\/|application\/pdf)/.test(headers.get('Content-Type')||''))headers.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(key.split('/').pop()));
  return headers;
}
async function fallback(request,env,key) {
  if(await env.PUBLIC_UPLOADS.head('.deleted/'+key))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  if(env.ASSETS&&env.RESOURCE_STATIC_FALLBACK==='1') {
    const response=await env.ASSETS.fetch(request),r=new Response(response.body,response);r.headers.set('X-Resource-Storage','static-fallback');return r;
  }
  return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
}
export async function servePublicResource(request,env) {
  const key=publicKey(new URL(request.url).pathname);if(!key)return new Response('Not found',{status:404});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  if(!env.PUBLIC_UPLOADS)return env.ASSETS?env.ASSETS.fetch(request):json({error:'RESOURCE_STORAGE_NOT_CONFIGURED'},503);
  const metadata=await env.PUBLIC_UPLOADS.head(key);if(!metadata)return fallback(request,env,key);
  const headers=metadataHeaders(metadata,key),tag=request.headers.get('If-None-Match');
  if(tag&&(tag==='*'||tag.split(',').some(v=>v.trim().replace(/^W\//,'')===metadata.httpEtag))) {headers.delete('Content-Length');return new Response(null,{status:304,headers});}
  if(!tag&&request.headers.get('If-Modified-Since')&&Math.floor(metadata.uploaded.getTime()/1000)<=Math.floor(Date.parse(request.headers.get('If-Modified-Since'))/1000)){headers.delete('Content-Length');return new Response(null,{status:304,headers});}
  if(request.method==='HEAD')return new Response(null,{headers});
  const ifRange=request.headers.get('If-Range');
  const useRange=!ifRange||ifRange===metadata.httpEtag||Date.parse(ifRange)>=Math.floor(metadata.uploaded.getTime()/1000)*1000;
  const range=useRange?byteRange(request.headers.get('Range'),metadata.size):null;
  if(range===false){headers.set('Content-Range','bytes */'+metadata.size);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
  const object=await env.PUBLIC_UPLOADS.get(key,{onlyIf:{etagMatches:metadata.etag},...(range?{range}:{})});
  if(!object?.body)return json({error:'RESOURCE_CHANGED_RETRY'},503);
  if(range){headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${metadata.size}`);headers.set('Content-Length',String(range.length));}
  return new Response(object.body,{status:range?206:200,headers});
}
async function readBounded(stream,max) {
  const reader=stream?.getReader();if(!reader)throw Error('EMPTY_BODY');const chunks=[];let length=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw Error('INPUT_TOO_LARGE');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function boundedJson(response,max=2*1024*1024) {return JSON.parse(new TextDecoder().decode(await readBounded(response.body,max)));}
async function readFolderState(env) {
  const object=await env.PUBLIC_UPLOADS.get(FOLDER_STATE_KEY);
  if(!object)return {state:{schema:1,folders:[],assignments:{}},revision:'none'};
  const state=await boundedJson(object);
  if(state.schema!==1||!Array.isArray(state.folders)||state.folders.length>2000||state.folders.some(f=>!f||folderPath(f)!==f)||!state.assignments||typeof state.assignments!=='object'||Array.isArray(state.assignments)||Object.keys(state.assignments).length>10000||Object.entries(state.assignments).some(([key,f])=>!publicKey(publicUrl(key))||folderPath(f)!==f))throw Error('INVALID_FOLDER_STATE');
  return {state,revision:object.etag};
}
async function writeFolderState(env,state,revision) {
  const content=JSON.stringify({...state,nonce:crypto.randomUUID()});
  if(new TextEncoder().encode(content).length>2*1024*1024)throw Error('FOLDER_LIMIT');
  const result=await env.PUBLIC_UPLOADS.put(FOLDER_STATE_KEY,content,{onlyIf:revision==='none'?{etagDoesNotMatch:'*'}:{etagMatches:revision},httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
  if(!result)throw Error('FOLDER_CHANGED');return result.etag;
}
export async function resourceCatalog(env,folderState) {
  const initialObject=await env.PUBLIC_UPLOADS.get('.catalog/initial.json');
  const initial=initialObject?await boundedJson(initialObject):{files:[]};
  const original=new Map(initial.files.map(f=>[f.key,f]));
  let cursor;const files=[];
  do {
    const page=await env.PUBLIC_UPLOADS.list({limit:1000,cursor,include:['httpMetadata','customMetadata']});
    for(const object of page.objects){if(!publicKey(publicUrl(object.key)))continue;
      const seed=original.get(object.key),match=seed&&seed.bytes===object.size&&seed.md5===object.etag;
      const meta=object.customMetadata||{};
      files.push({key:object.key,path:publicUrl(object.key),bytes:object.size,sha256:meta.sha256||(match?seed.sha256:undefined),contentType:object.httpMetadata?.contentType||'application/octet-stream',width:Number(meta.width)||(match?seed.width:undefined),height:Number(meta.height)||(match?seed.height:undefined),image:/^image\//.test(object.httpMetadata?.contentType||''),pdf:object.key.toLowerCase().endsWith('.pdf'),etag:object.etag,uploaded:object.uploaded.toISOString()});
    }
    if(files.length>10000)throw Error('CATALOG_TOO_LARGE');
    if(!page.truncated)break;
    if(!page.cursor||page.cursor===cursor)throw Error('CATALOG_PAGINATION_FAILED');cursor=page.cursor;
  }while(true);
  const groups=new Map();for(const f of files)if(f.sha256){if(!groups.has(f.sha256))groups.set(f.sha256,[]);groups.get(f.sha256).push(f.path);}
  for(const f of files)f.duplicates=f.sha256?groups.get(f.sha256).filter(p=>p!==f.path):[];
  const {state,revision}=folderState||await readFolderState(env);
  return {schema:1,storage:'r2',generatedAt:new Date().toISOString(),folderRevision:revision,...folderLayout(files,state)};
}
function fileSignature(bytes,extension) {
  const start=new TextDecoder().decode(bytes.slice(0,16));
  if(extension==='pdf')return start.startsWith('%PDF-');
  if(extension==='png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  if(['jpg','jpeg'].includes(extension))return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(extension==='gif')return /^GIF8[79]a/.test(start);
  if(extension==='webp')return start.startsWith('RIFF')&&start.slice(8,12)==='WEBP';
  if(extension==='avif')return start.slice(4,8)==='ftyp'&&/avif|avis/.test(start.slice(8));
  if(extension==='zip')return bytes[0]===80&&bytes[1]===75;
  if(extension==='gz')return bytes[0]===31&&bytes[1]===139;
  if(extension==='mp4')return start.slice(4,8)==='ftyp';
  if(extension==='mp3')return start.startsWith('ID3')||bytes[0]===255&&(bytes[1]&224)===224;
  if(extension==='wav')return start.startsWith('RIFF')&&start.slice(8,12)==='WAVE';
  if(extension==='ogg')return start.startsWith('OggS');
  return extension==='txt'&&!bytes.includes(0);
}
async function authenticated(request,env,accounts,ctx) {
  const url=new URL('/ns/api/accounts',env.SITE_ORIGIN);
  const probe=new Request(url,{headers:{Cookie:request.headers.get('Cookie')||''}});
  const response=await accounts.fetch(probe,env,ctx);return response.status===200;
}
export async function scanReferences(env,fetcher=fetch,token='') {
  const repo=env.RESOURCE_REPOSITORY,branch=env.RESOURCE_BRANCH;
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!branch)throw Error('REFERENCE_SOURCE_NOT_CONFIGURED');
  if(!token||token.length>512)throw Error('REFERENCE_TOKEN_REQUIRED');
  const base='https://api.github.com/repos/'+repo;
  const head=async()=>{const r=await fetcher(base+'/git/ref/heads/'+branch,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'Blog-Resources'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('REFERENCE_SOURCE_UNAVAILABLE');return (await boundedJson(r)).object.sha;};
  const commit=await head();if(!/^[a-f0-9]{40}$/.test(commit))throw Error('INVALID_REFERENCE_COMMIT');
  const treeResponse=await fetcher(base+'/git/trees/'+commit+'?recursive=1',{headers:{Authorization:'Bearer '+token,'User-Agent':'Blog-Resources'},signal:AbortSignal.timeout(20000)});
  if(!treeResponse.ok)throw Error('REFERENCE_SOURCE_UNAVAILABLE');const tree=await boundedJson(treeResponse,4*1024*1024);
  if(tree.truncated)throw Error('REFERENCE_TREE_TRUNCATED');
  const entries=tree.tree.filter(f=>f.type==='blob'&&(f.path.startsWith('content/')||/^(app|lib)\/.*\.(tsx?|jsx?|css|json)$/.test(f.path)||f.path==='public/sveltia/config.yml'));
  if(entries.length>1000)throw Error('REFERENCE_SCAN_TOO_LARGE');const texts=[];const [owner,name]=repo.split('/');
  // Fetch immutable blobs in batches, staying below the Worker subrequest limit.
  for(let offset=0;offset<entries.length;offset+=100) {
    const batch=entries.slice(offset,offset+100);
    const fields=batch.map((f,i)=>`b${i}:object(expression:${JSON.stringify(commit+':'+f.path)}){... on Blob{text isBinary byteSize}}`).join(' ');
    const response=await fetcher('https://api.github.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'Blog-Resources'},body:JSON.stringify({query:`query{repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){${fields}}}`}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('REFERENCE_CONTENT_UNAVAILABLE');const data=await boundedJson(response,8*1024*1024);
    if(data.errors||!data.data?.repository)throw Error('REFERENCE_CONTENT_UNAVAILABLE');
    for(const [i,file] of batch.entries()){const blob=data.data.repository['b'+i];if(!blob||blob.isBinary||blob.byteSize>2*1024*1024||typeof blob.text!=='string')throw Error('REFERENCE_CONTENT_UNAVAILABLE');let text=blob.text.replace(/\\u([a-f0-9]{4})/gi,(_,code)=>String.fromCharCode(parseInt(code,16))).replace(/(?:%[a-f0-9]{2})+/gi,value=>{try{return decodeURIComponent(value);}catch{return value;}});texts.push({file:file.path,text});}
  }
  if(await head()!==commit)throw Error('REFERENCE_SOURCE_CHANGED');
  return {commit,texts};
}
export function referencesFor(key,snapshot) {
  const path='/uploads/'+key,name=key.split('/').pop();
  return snapshot.texts.filter(f=>f.text.includes(path)||f.text.includes(name)).map(f=>({file:f.file}));
}
export async function resourceAdminRoute(request,env,ctx,accounts,fetcher=fetch) {
  if(!env.PUBLIC_UPLOADS)return json({error:'RESOURCE_STORAGE_NOT_CONFIGURED'},503);
  const url=new URL(request.url),path=url.pathname.slice(ROOT.length);
  if(path==='/catalog'&&request.method==='GET')return json(await resourceCatalog(env));
  if(!['GET','POST','PUT'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
  if(request.method!=='GET'&&(request.headers.get('Origin')!==env.SITE_ORIGIN||request.headers.get('X-Gaming-Admin')!=='1'))return json({error:'INVALID_ORIGIN'},403);
  if(!await authenticated(request,env,accounts,ctx))return json({error:'ADMIN_LOGIN_REQUIRED'},401);
  try {
    if(path==='/folders'&&request.method==='POST') {
      const input=await boundedJson(request,128*1024),snapshot=await readFolderState(env);
      if(typeof input.revision!=='string'||input.revision!==snapshot.revision)return json({error:'FOLDER_CHANGED'},409);
      const catalog=await resourceCatalog(env,snapshot),next=planFolders(input,catalog.files,snapshot.state);
      const revision=await writeFolderState(env,next,snapshot.revision);
      return json({...catalog,folderRevision:revision,...folderLayout(catalog.files,next)});
    }
    if(path==='/references'&&request.method==='GET') {
      const [catalog,snapshot]=await Promise.all([resourceCatalog(env),scanReferences(env,fetcher,request.headers.get('X-GitHub-Read-Token'))]);
      return json({...catalog,commit:snapshot.commit,files:catalog.files.map(f=>({...f,references:referencesFor(f.key,snapshot)}))});
    }
    if(path==='/upload'&&request.method==='PUT') {
      const target=url.searchParams.get('folder'),folder=target===null?null:folderPath(target);let folderSnapshot;
      if(target!==null){if(folder===null)return json({error:'INVALID_FOLDER'},400);folderSnapshot=await readFolderState(env);const catalog=await resourceCatalog(env,folderSnapshot);if(folder&&!catalog.folders.includes(folder))return json({error:'FOLDER_NOT_FOUND'},409);}
      if(Number(request.headers.get('Content-Length'))>MAX_UPLOAD)return json({error:'INPUT_TOO_LARGE'},413);
      const name=String(url.searchParams.get('name')||'').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').slice(0,150),extension=name.split('.').pop().toLowerCase();
      if(!types[extension]||!name||!name.includes('.'))return json({error:'INVALID_FILE_TYPE'},400);
      const bytes=await readBounded(request.body,MAX_UPLOAD);if(!bytes.length||!fileSignature(bytes,extension))return json({error:'INVALID_FILE_TYPE'},400);
      const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=hex(digest),key='cms/'+sha256+'/'+name;
      const width=Number(request.headers.get('X-Image-Width')),height=Number(request.headers.get('X-Image-Height'));
      const dimensions=Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=50000&&height<=50000?{width:String(width),height:String(height)}:{};
      const object=await env.PUBLIC_UPLOADS.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256:digest,httpMetadata:{contentType:types[extension]},customMetadata:{sha256,name,...dimensions}});
      if(!object&&!(await env.PUBLIC_UPLOADS.head(key)))throw Error('UPLOAD_CONFLICT');
      // A duplicate upload reuses its existing location; moving it is explicit.
      let folderWarning;
      if(object&&target!==null)try{const state={...folderSnapshot.state,assignments:{...folderSnapshot.state.assignments,[key]:folder}};await writeFolderState(env,state,folderSnapshot.revision);}catch(error){if(error.message!=='FOLDER_CHANGED')throw error;folderWarning='FOLDER_CHANGED';}
      await env.PUBLIC_UPLOADS.delete('.deleted/'+key);
      return json({key,path:publicUrl(key),bytes:bytes.length,sha256,contentType:types[extension],reused:!object,folderWarning,...dimensions});
    }
    if(path==='/delete'&&request.method==='POST') {
      const input=await boundedJson(request,8192),key=publicKey(publicUrl(String(input.key||'')));
      if(!key||!/^[a-f0-9]{64}$/.test(input.sha256||'')||!/^[a-f0-9]{40}$/.test(input.commit||''))return json({error:'INVALID_INPUT'},400);
      const [catalog,snapshot]=await Promise.all([resourceCatalog(env),scanReferences(env,fetcher,request.headers.get('X-GitHub-Read-Token'))]);
      if(snapshot.commit!==input.commit)return json({error:'REFERENCE_SOURCE_CHANGED'},409);
      if(referencesFor(key,snapshot).length)return json({error:'RESOURCE_REFERENCED'},409);
      const file=catalog.files.find(f=>f.key===key);if(!file||file.sha256!==input.sha256)return json({error:'RESOURCE_CHANGED'},409);
      const object=await env.PUBLIC_UPLOADS.get(key,{onlyIf:{etagMatches:file.etag}});if(!object?.body)return json({error:'RESOURCE_CHANGED'},409);
      const trashKey='.trash/'+new Date().toISOString().replace(/[:.]/g,'-')+'/'+key;
      await env.PUBLIC_UPLOADS.put(trashKey,object.body,{httpMetadata:object.httpMetadata,customMetadata:{...object.customMetadata,originalKey:key,sha256:input.sha256}});
      await env.PUBLIC_UPLOADS.put('.deleted/'+key,JSON.stringify({trashKey,commit:snapshot.commit}),{httpMetadata:{contentType:'application/json'}});
      await env.PUBLIC_UPLOADS.delete(key);return json({status:'archived',key,trashKey});
    }
    if(path==='/restore'&&request.method==='POST') {
      const input=await boundedJson(request,8192),key=publicKey(publicUrl(String(input.key||'')));
      if(!key||!String(input.trashKey).startsWith('.trash/'))return json({error:'INVALID_INPUT'},400);
      const backup=await env.PUBLIC_UPLOADS.get(input.trashKey);
      if(!backup?.body||backup.customMetadata.originalKey!==key)return json({error:'BACKUP_NOT_FOUND'},404);
      const restored=await env.PUBLIC_UPLOADS.put(key,backup.body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:backup.httpMetadata,customMetadata:backup.customMetadata});
      if(!restored)return json({error:'RESTORE_CONFLICT'},409);
      await env.PUBLIC_UPLOADS.delete('.deleted/'+key);return json({status:'restored',key,path:publicUrl(key)});
    }
    return json({error:'NOT_FOUND'},404);
  }catch(error){const conflicts=new Set(['FOLDER_CHANGED','FOLDER_EXISTS','FOLDER_NOT_FOUND','FOLDER_NOT_EMPTY','RESOURCE_CHANGED']),invalid=new Set(['INVALID_FOLDER','INVALID_SELECTION','INVALID_FOLDER_ACTION','FOLDER_LIMIT']);const codes=new Set(['INPUT_TOO_LARGE','EMPTY_BODY','UPLOAD_CONFLICT','REFERENCE_TOKEN_REQUIRED','REFERENCE_SOURCE_NOT_CONFIGURED','REFERENCE_SOURCE_UNAVAILABLE','INVALID_REFERENCE_COMMIT','REFERENCE_TREE_TRUNCATED','REFERENCE_SCAN_TOO_LARGE','REFERENCE_CONTENT_UNAVAILABLE','REFERENCE_SOURCE_CHANGED',...conflicts,...invalid]);return json({error:codes.has(error.message)?error.message:'RESOURCE_OPERATION_FAILED'},error.message==='INPUT_TOO_LARGE'?413:conflicts.has(error.message)?409:invalid.has(error.message)?400:503);}
}
