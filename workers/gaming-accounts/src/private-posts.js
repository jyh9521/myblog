import { b64, unb64, seal, open, readJson, challenge } from './security.js';
const ROOT='/ns/api/posts', ID=/^[a-f0-9]{32}$/, MAX_BODY=512*1024, MAX_FILE=5*1024*1024;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const cookieName=id=>'__Host-article_'+id;
export async function passwordHash(password,salt) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:100000},key,256));
}
function same(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function authorized(request,row,env) {
  try {const token=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(row.id)+'='))?.slice(cookieName(row.id).length+1);
    if(!token)return false;const data=await open(token,env.CREDENTIAL_KEY,'article:'+row.id);
    return data.id===row.id&&data.revision===row.revision&&data.expires>Date.now();
  } catch{return false;}
}
function signature(bytes,mime) {
  if(mime==='application/pdf')return new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
  if(mime==='image/png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/gif')return new TextDecoder().decode(bytes.slice(0,6)).match(/^GIF8[79]a$/);
  if(mime==='image/webp')return new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  return false;
}
export async function privatePostsRoute(request,env,admin) {
  const path=new URL(request.url).pathname;
  if(!path.startsWith(ROOT+'/'))return reply({error:'NOT_FOUND'},404);
  if(!['GET','POST','DELETE'].includes(request.method))return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(request.method!=='GET'&&request.headers.get('Origin')!==env.SITE_ORIGIN)return reply({error:'INVALID_ORIGIN'},403);
  const parts=path.slice(ROOT.length+1).split('/'), owner=parts[0]==='admin';
  if(owner&&(!await admin(request,env)||request.method!=='GET'&&request.headers.get('X-Gaming-Admin')!=='1'))return reply({error:'ADMIN_LOGIN_REQUIRED'},401);
  if(owner) {
    const id=parts[1];if(!ID.test(id||''))return reply({error:'INVALID_INPUT'},400);
    const row=await env.DB.prepare('SELECT * FROM private_posts WHERE id=?').bind(id).first();
    if(parts.length===2&&request.method==='GET')return row?reply({body:await open(row.body,env.CREDENTIAL_KEY,'post-body:'+id),revision:row.revision}):reply({error:'NOT_FOUND'},404);
    if(parts.length===2&&request.method==='DELETE') {
      if(!row)return reply({error:'NOT_FOUND'},404);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM private_post_asset_chunks WHERE asset_id IN (SELECT id FROM private_post_assets WHERE post_id=?)').bind(id),
        env.DB.prepare('DELETE FROM private_post_assets WHERE post_id=?').bind(id),
        env.DB.prepare('DELETE FROM private_posts WHERE id=?').bind(id)
      ]);return reply({status:'deleted'});
    }
    if(parts.length===2&&request.method==='POST') {
      const input=await readJson(request,MAX_BODY+4096);
      if(typeof input.body!=='string'||new TextEncoder().encode(input.body).length>MAX_BODY||!input.body.trim())return reply({error:'INVALID_BODY'},400);
      if(typeof input.password!=='string'||input.password.length>128||(!row||input.password)&&input.password.length<6)return reply({error:'INVALID_PASSWORD'},400);
      if(row&&input.revision!==row.revision)return reply({error:'EDIT_CONFLICT'},409);
      const salt=input.password?b64(crypto.getRandomValues(new Uint8Array(16))):row.salt;
      const hash=input.password?await passwordHash(input.password,salt):row.password_hash;
      const body=await seal(input.body,env.CREDENTIAL_KEY,'post-body:'+id),timestamp=new Date().toISOString();
      if(row) {
        const saved=await env.DB.prepare('UPDATE private_posts SET body=?,salt=?,password_hash=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision').bind(body,salt,hash,timestamp,id,row.revision).first();
        if(!saved)return reply({error:'EDIT_CONFLICT'},409);
        return reply({revision:saved.revision,updatedAt:timestamp});
      }
      const saved=await env.DB.prepare('INSERT INTO private_posts(id,body,salt,password_hash,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING revision').bind(id,body,salt,hash,timestamp).first();
      return saved?reply({revision:1,updatedAt:timestamp}):reply({error:'EDIT_CONFLICT'},409);
    }
    if(parts[2]==='assets'&&parts.length===3&&request.method==='GET') {
      const {results}=await env.DB.prepare('SELECT id,name,mime,size FROM private_post_assets WHERE post_id=? ORDER BY name').bind(id).all();return reply({assets:results});
    }
    if(parts[2]==='assets'&&parts.length===3&&request.method==='POST') {
      if(!row)return reply({error:'SAVE_POST_FIRST'},409);
      const declared=Number(request.headers.get('Content-Length'));
      if(declared>MAX_FILE+8192)return reply({error:'INPUT_TOO_LARGE'},413);
      // Bounded multipart read; never trust Content-Length alone.
      const reader=request.body?.getReader();if(!reader)return reply({error:'INVALID_INPUT'},400);
      const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_FILE+8192){await reader.cancel();return reply({error:'INPUT_TOO_LARGE'},413);}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
      const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData(),file=form.get('file');
      if(!(file instanceof File)||file.size>MAX_FILE||file.size===0)return reply({error:'INVALID_FILE'},400);
      const content=new Uint8Array(await file.arrayBuffer());if(!signature(content,file.type))return reply({error:'INVALID_FILE_TYPE'},400);
      const asset=crypto.randomUUID().replaceAll('-',''),name=file.name.replace(/[\x00-\x1f"\\/]/g,'_').slice(0,150);
      const statements=[env.DB.prepare('INSERT INTO private_post_assets(id,post_id,name,mime,size) VALUES(?,?,?,?,?)').bind(asset,id,name,file.type,file.size)];
      for(let offset=0,part=0;offset<content.length;offset+=262144,part++)statements.push(env.DB.prepare('INSERT INTO private_post_asset_chunks(asset_id,part,bytes) VALUES(?,?,?)').bind(asset,part,content.slice(offset,offset+262144).buffer));
      await env.DB.batch(statements);return reply({id:asset,name,mime:file.type,size:file.size,url:ROOT+'/assets/'+id+'/'+asset});
    }
    if(parts[2]==='assets'&&ID.test(parts[3]||'')&&parts.length===4&&request.method==='DELETE') {
      const asset=await env.DB.prepare('SELECT id FROM private_post_assets WHERE id=? AND post_id=?').bind(parts[3],id).first();if(!asset)return reply({error:'NOT_FOUND'},404);
      await env.DB.batch([env.DB.prepare('DELETE FROM private_post_asset_chunks WHERE asset_id=?').bind(asset.id),env.DB.prepare('DELETE FROM private_post_assets WHERE id=?').bind(asset.id)]);return reply({status:'deleted'});
    }
    return reply({error:'NOT_FOUND'},404);
  }
  if(parts[0]==='assets'&&parts.length===3&&ID.test(parts[1])&&ID.test(parts[2])&&request.method==='GET') {
    const row=await env.DB.prepare('SELECT id,revision FROM private_posts WHERE id=?').bind(parts[1]).first();
    if(!row||!await authorized(request,row,env))return reply({error:'PASSWORD_REQUIRED'},401);
    const asset=await env.DB.prepare('SELECT * FROM private_post_assets WHERE id=? AND post_id=?').bind(parts[2],parts[1]).first();if(!asset)return reply({error:'NOT_FOUND'},404);
    const {results}=await env.DB.prepare('SELECT bytes FROM private_post_asset_chunks WHERE asset_id=? ORDER BY part').bind(asset.id).all();
    const data=new Uint8Array(asset.size);let offset=0;for(const part of results){const chunk=new Uint8Array(part.bytes);data.set(chunk,offset);offset+=chunk.length;}
    if(offset!==asset.size)return reply({error:'ASSET_UNAVAILABLE'},503);
    const headers={'Content-Type':asset.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Accept-Ranges':'bytes','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`};
    const range=request.headers.get('Range');if(range){const m=range.match(/^bytes=(\d+)-(\d*)$/);if(!m)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${data.length}`}});const start=Number(m[1]),end=Math.min(m[2]?Number(m[2]):data.length-1,data.length-1);if(start>end)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${data.length}`}});return new Response(data.slice(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':String(end-start+1)}});}
    return new Response(data,{headers:{...headers,'Content-Length':String(data.length)}});
  }
  const id=parts[0];if(!ID.test(id||'')||parts.length>2||parts.length===2&&parts[1]!=='unlock')return reply({error:'NOT_FOUND'},404);
  const row=await env.DB.prepare('SELECT * FROM private_posts WHERE id=?').bind(id).first();
  if(!row)return reply({error:'NOT_FOUND'},404);
  if(parts[1]==='unlock'&&request.method==='POST') {
    const ip=await challenge(request.headers.get('CF-Connecting-IP')||'local'),bucket=id+':'+ip+':'+Math.floor(Date.now()/600000);
    const attempts=await env.DB.prepare('INSERT INTO private_post_attempts(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,Date.now()+600000).first();
    if(attempts.count>5){const r=reply({error:'TOO_MANY_ATTEMPTS'},429);r.headers.set('Retry-After','600');return r;}
    const input=await readJson(request,2048);
    if(typeof input.password!=='string'||input.password.length>128||!same(await passwordHash(input.password,row.salt),row.password_hash))return reply({error:'WRONG_PASSWORD'},401);
    const token=await seal({id,revision:row.revision,expires:Date.now()+12*3600000},env.CREDENTIAL_KEY,'article:'+id);
    const response=reply({body:await open(row.body,env.CREDENTIAL_KEY,'post-body:'+id)});
    response.headers.set('Set-Cookie',`${cookieName(id)}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);return response;
  }
  if(parts.length===1&&request.method==='GET')return await authorized(request,row,env)?reply({body:await open(row.body,env.CREDENTIAL_KEY,'post-body:'+id)}):reply({error:'PASSWORD_REQUIRED'},401);
  return reply({error:'METHOD_NOT_ALLOWED'},405);
}
