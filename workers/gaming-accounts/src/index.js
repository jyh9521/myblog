import { random, seal, open, upstream, readJson } from './security.js';
import { platforms, names, configured, begin, complete, renew, collect } from './providers.js';
import { enrichStoreLinks, regionalProductUrl } from './store-links.js';
const ROOT='/ns/api/accounts';
const COOKIE='__Host-gaming_admin';
const now=()=>new Date().toISOString();
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const errorCodes=new Set(['PLAYTIME_SYNC_FAILED','INVALID_CALLBACK','INVALID_INPUT','INPUT_TOO_LARGE','INVALID_TOKEN_RESPONSE','INVALID_XBOX_IDENTITY','AUTH_EXPIRED','PSN_LOGIN_FAILED','PSN_SYNC_FAILED','STEAM_LIBRARY_PRIVATE','PROVIDER_NOT_CONFIGURED','PAGINATION_LIMIT','INVALID_HISTORY_RESPONSE','INVALID_LIBRARY_RESPONSE','UPSTREAM_NETWORK','ENCRYPTION_NOT_CONFIGURED']);
export function errorCode(error) {return errorCodes.has(error?.message)||/^(?:UPSTREAM_HTTP_\d{3}|(?:XBOX_(?:TOKEN|USER_AUTH|XSTS|HISTORY|PROFILE)|PSN_(?:AUTHORIZE|TOKEN|HISTORY|PROFILE|IDENTITY)|NINTENDO_(?:SESSION|TOKEN|PROFILE|HISTORY))_(?:UPSTREAM_HTTP_\d{3}|AUTH_EXPIRED|UPSTREAM_NETWORK|FAILED)(?:_(?:MAXITEMS|DECORATION|SIGNATURE|CONTRACT|XUID))?)$/.test(error?.message)?error.message:'SYNC_FAILED';}
async function admin(request,env) {
  try {
    const value=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!value)return null;
    const session=await open(value,env.CREDENTIAL_KEY,'admin-session');
    return session.login===env.ADMIN_GITHUB_LOGIN && session.expires>Date.now()?session:null;
  }catch{return null;}
}
function stateOrigin(request,env) {return request.headers.get('Origin')===env.SITE_ORIGIN && request.headers.get('X-Gaming-Admin')==='1';}
export async function providerEnv(env) {
  if(env.STEAM_API_KEY)return env;
  const row=await env.DB.prepare('SELECT value FROM gaming_configuration WHERE name=?').bind('STEAM_API_KEY').first();
  if(!row)return env;
  return {...env,STEAM_API_KEY:await open(row.value,env.CREDENTIAL_KEY,'configuration:STEAM_API_KEY')};
}
async function stateRow(id,platform,owner,env) {
  if(!/^[a-zA-Z0-9_-]{43}$/.test(id||''))return null;
  return env.DB.prepare('SELECT * FROM gaming_auth_states WHERE id=? AND platform=? AND owner=? AND expires_at>?').bind(id,platform,owner,Date.now()).first();
}
async function finishBinding(platform,input,state,env,fetcher) {
  const claimed=await env.DB.prepare('DELETE FROM gaming_auth_states WHERE id=? AND expires_at>? RETURNING id').bind(state.id,Date.now()).first();
  if(!claimed)throw new Error('INVALID_CALLBACK');
  const verifier=await open(state.verifier,env.CREDENTIAL_KEY,`state:${state.id}`);
  const credential=await complete(platform,input,{...state,verifier},env,fetcher);
  // Validate identity and data before replacing any existing binding.
  const fresh=await renew(platform,credential,env,fetcher);
  let data;
  try{data=await collect(platform,fresh,env,fetcher);}catch(e){
    // A validated identity remains bound even if a subsequent data request fails.
    // Do not replace an existing binding or its cache with an incomplete new one.
    const verifiedId=platform==='xbox'?fresh.xuid:platform==='psn'&&/^\d+$/.test(fresh.accountId||'')?fresh.accountId:platform==='nintendo'?e.verifiedNintendoIdentity?.id:null;
    if(verifiedId){const timestamp=now();await env.DB.prepare("INSERT INTO gaming_accounts(platform,account_id,display_name,credential,bound_at,last_attempt_at,status,error_code) VALUES(?,?,?,?,?,?,'error',?) ON CONFLICT(platform) DO NOTHING").bind(platform,verifiedId,platform==='nintendo'?(e.verifiedNintendoIdentity.name||names[platform]):names[platform],await seal(fresh,env.CREDENTIAL_KEY,`account:${platform}`),timestamp,timestamp,errorCode(e)).run();}
    throw e;
  }
  if(!data.accountId || data.accountId==='undefined')throw new Error('INVALID_TOKEN_RESPONSE');
  await enrichStoreLinks(data,env,fetcher);
  const timestamp=now(),encrypted=await seal(fresh,env.CREDENTIAL_KEY,`account:${platform}`);
  await env.DB.prepare('INSERT INTO gaming_accounts(platform,account_id,display_name,credential,bound_at,last_attempt_at,last_success_at,status,public_json) VALUES(?,?,?,?,?,?,?,\'connected\',?) ON CONFLICT(platform) DO UPDATE SET account_id=excluded.account_id,display_name=excluded.display_name,credential=excluded.credential,bound_at=excluded.bound_at,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,status=\'connected\',error_code=NULL,public_json=excluded.public_json,sync_lock_until=0')
    .bind(platform,data.accountId,data.displayName,encrypted,timestamp,timestamp,timestamp,JSON.stringify(data)).run();
  await recordRun(env,platform,timestamp,'success',null,data.games);
}
async function recordRun(env,platform,started,status,code,games=null) {
  await env.DB.prepare('INSERT INTO gaming_sync_runs(platform,started_at,finished_at,status,error_code,games) VALUES(?,?,?,?,?,?)').bind(platform,started,now(),status,code,games).run();
}
export async function syncAccount(platform,env,fetcher=fetch) {
  const started=now(),lock=Date.now()+300000;
  const row=await env.DB.prepare('UPDATE gaming_accounts SET sync_lock_until=?,last_attempt_at=?,status=\'syncing\' WHERE platform=? AND sync_lock_until<? RETURNING *').bind(lock,started,platform,Date.now()).first();
  if(!row)return {status:'busy'};
  let encrypted=row.credential;
  try {
    const credential=await open(row.credential,env.CREDENTIAL_KEY,`account:${platform}`);
    const fresh=await renew(platform,credential,env,fetcher);
    encrypted=await seal(fresh,env.CREDENTIAL_KEY,`account:${platform}`);
    // Persist rotated refresh tokens even when the subsequent data request fails.
    await env.DB.prepare('UPDATE gaming_accounts SET credential=? WHERE platform=? AND sync_lock_until=? AND credential=?').bind(encrypted,platform,lock,row.credential).run();
    const data=await collect(platform,fresh,env,fetcher);
    if(data.accountId!==row.account_id)throw new Error('INVALID_TOKEN_RESPONSE');
    if(['xbox','gog'].includes(platform)&&row.public_json){
      const previous=JSON.parse(row.public_json);
      if(previous.minutes!==undefined&&data.warnings?.some(code=>['PLAYTIME_NOT_AVAILABLE','SOME_PLAYTIME_MISSING'].includes(code)))throw new Error('PLAYTIME_SYNC_FAILED');
    }
    await enrichStoreLinks(data,env,fetcher);
    await env.DB.prepare('UPDATE gaming_accounts SET public_json=?,display_name=?,last_success_at=?,status=\'connected\',error_code=NULL,sync_lock_until=0 WHERE platform=? AND sync_lock_until=? AND credential=?').bind(JSON.stringify(data),data.displayName,now(),platform,lock,encrypted).run();
    await recordRun(env,platform,started,'success',null,data.games);return {status:'success'};
  }catch(error) {
    const code=errorCode(error);
    await env.DB.prepare('UPDATE gaming_accounts SET status=?,error_code=?,sync_lock_until=0 WHERE platform=? AND sync_lock_until=? AND credential=?').bind(code==='AUTH_EXPIRED'?'expired':'error',code,platform,lock,encrypted).run();
    await recordRun(env,platform,started,'failed',code);return {status:'failed',error:code};
  }
}
export async function publicProfile(env) {
  const {results}=await env.DB.prepare('SELECT platform,public_json,last_success_at FROM gaming_accounts WHERE public_json IS NOT NULL ORDER BY platform').all();
  const accounts=results.map(row=>{
    const d=JSON.parse(row.public_json);
    // Explicit allowlist: credentials, account IDs, internal errors never leave the admin API.
    return {platform:row.platform,displayName:d.displayName,games:d.games,countKind:d.countKind,minutes:d.minutes,timeComplete:d.timeComplete,updatedAt:row.last_success_at,recent:d.recent};
  });
  return {version:2,accounts};
}
export async function route(request,env,ctx,fetcher=fetch) {
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/auth\/(xbox|steam|psn|nintendo|gog|epic)\/callback$/,ROOT+'/callback/$1');
  if(request.method==='GET'&&path===ROOT+'/public')return json(await publicProfile(env));
  if(!['GET','POST','DELETE'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
  if(request.method!=='GET'&&!stateOrigin(request,env))return json({error:'INVALID_ORIGIN'},403);
  if(path===ROOT+'/session'&&request.method==='POST') {
    // Login throttling applies before contacting GitHub.
    const bucket=(request.headers.get('CF-Connecting-IP')||'local')+':'+Math.floor(Date.now()/60000);
    const attempt=await env.DB.prepare('INSERT INTO gaming_login_attempts(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket).first();
    if(attempt.count>10)return json({error:'LOGIN_RATE_LIMIT'},429);
    const body=await readJson(request);
    if(typeof body.token!=='string'||body.token.length<20||body.token.length>512)return json({error:'INVALID_INPUT'},400);
    let identity;
    try {identity=await upstream('https://api.github.com/user',{headers:{Authorization:`Bearer ${body.token}`,Accept:'application/vnd.github+json','User-Agent':'Blog-Gaming-Accounts'}},fetcher);}catch{return json({error:'ADMIN_LOGIN_FAILED'},401);}
    if(identity.login!==env.ADMIN_GITHUB_LOGIN)return json({error:'ADMIN_ONLY'},403);
    const value=await seal({login:identity.login,expires:Date.now()+8*3600000},env.CREDENTIAL_KEY,'admin-session');
    const response=json({login:identity.login});response.headers.set('Set-Cookie',`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);return response;
  }
  const session=await admin(request,env);
  if(!session)return json({error:'ADMIN_LOGIN_REQUIRED'},401);
  if(path===ROOT+'/configuration/steam'&&request.method==='POST') {
    const body=await readJson(request);
    if(typeof body.apiKey!=='string'||!/^[a-fA-F0-9]{32}$/.test(body.apiKey))return json({error:'INVALID_INPUT'},400);
    const value=await seal(body.apiKey,env.CREDENTIAL_KEY,'configuration:STEAM_API_KEY');
    await env.DB.prepare('INSERT INTO gaming_configuration(name,value,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('STEAM_API_KEY',value,now()).run();
    return json({status:'configured'});
  }
  env=await providerEnv(env);
  const storeMatch=path.match(/^\/ns\/api\/accounts\/store-links\/(xbox|psn|nintendo)$/);
  if(storeMatch&&['GET','POST'].includes(request.method)){
    const platform=storeMatch[1];
    const row=await env.DB.prepare('SELECT public_json FROM gaming_accounts WHERE platform=? AND public_json IS NOT NULL').bind(platform).first();
    if(!row)return json({error:'NOT_CONNECTED'},409);
    const data=JSON.parse(row.public_json);
    if(request.method==='POST'){
      const body=await readJson(request);
      const game=data.recent.find(g=>g.id===body.gameId);
      if(!game||typeof body.url!=='string'||body.url.length>2048)return json({error:'INVALID_INPUT'},400);
      if(body.url.trim()){
        const url=regionalProductUrl(platform,body.url.trim());
        if(!url)return json({error:'INVALID_STORE_URL'},400);
        await env.DB.prepare('INSERT INTO gaming_store_links(platform,game_id,title,url,cover,source,checked_at,expires_at) VALUES(?,?,?,?,?,\'manual\',?,?) ON CONFLICT(platform,game_id) DO UPDATE SET title=excluded.title,url=excluded.url,source=excluded.source,checked_at=excluded.checked_at,expires_at=excluded.expires_at').bind(platform,game.id,game.title,url,null,Date.now(),9999999999999).run();
        game.url=url;
      }else{
        await env.DB.prepare('DELETE FROM gaming_store_links WHERE platform=? AND game_id=?').bind(platform,game.id).run();
        delete game.url;await enrichStoreLinks(data,env,fetcher);
      }
      await env.DB.prepare('UPDATE gaming_accounts SET public_json=? WHERE platform=? AND public_json=?').bind(JSON.stringify(data),platform,row.public_json).run();
    }
    const {results}=await env.DB.prepare('SELECT game_id,url,source FROM gaming_store_links WHERE platform=?').bind(platform).all();
    return json({games:data.recent.map(g=>({id:g.id,title:g.title,url:g.url||'',manual:results.find(r=>r.game_id===g.id)?.source==='manual'}))});
  }
  if(path===ROOT+'/store-links/refresh'&&request.method==='POST') {
    const body=await readJson(request);
    if(!['xbox','psn','nintendo'].includes(body.platform))return json({error:'INVALID_INPUT'},400);
    const row=await env.DB.prepare('SELECT public_json FROM gaming_accounts WHERE platform=? AND public_json IS NOT NULL').bind(body.platform).first();
    if(!row)return json({error:'NOT_CONNECTED'},409);
    const data=JSON.parse(row.public_json);
    await enrichStoreLinks(data,env,fetcher);
    // A link-only refresh does not claim that gameplay data was synchronized.
    await env.DB.prepare('UPDATE gaming_accounts SET public_json=? WHERE platform=? AND public_json=?').bind(JSON.stringify(data),body.platform,row.public_json).run();
    return json({status:'refreshed',linked:data.recent.filter(g=>g.url).length,total:data.recent.length});
  }
  if(path===ROOT+'/session'&&request.method==='DELETE') {const response=json({status:'signed_out'});response.headers.set('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return response;}
  if(path===ROOT&&request.method==='GET') {
    const {results}=await env.DB.prepare('SELECT platform,display_name,bound_at,last_attempt_at,last_success_at,status,error_code FROM gaming_accounts').all();
    const histories=await env.DB.prepare('SELECT platform,started_at,finished_at,status,error_code,games FROM gaming_sync_runs ORDER BY id DESC LIMIT 30').all();
    return json({accounts:platforms.map(platform=>({platform,name:names[platform],missing:configured(platform,env),...(results.find(r=>r.platform===platform)||{status:'disconnected'})})),history:histories.results});
  }
  const match=path.match(/^\/ns\/api\/accounts\/(bind|complete|sync|disconnect|callback)\/(nintendo|psn|xbox|steam|gog|epic)$/);
  if(!match)return json({error:'NOT_FOUND'},404);
  const [,action,platform]=match;
  if(action==='callback'&&request.method==='GET') {
    const state=await stateRow(url.searchParams.get('state'),platform,session.login,env);
    const back=code=>new Response(null,{status:303,headers:{Location:`${env.SITE_ORIGIN}/sveltia/accounts.html?${code?'error='+encodeURIComponent(code)+'&platform='+platform:'connected='+platform}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    if(!state)return back('INVALID_CALLBACK');
    const input=platform==='steam'?url.href:url.searchParams.get('code');
    if(!input)return back('AUTH_CANCELLED');
    try {await finishBinding(platform,input,state,env,fetcher);}catch(e){const code=errorCode(e);await recordRun(env,platform,now(),'failed',code);return back(code);}
    return back(null);
  }
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(action==='bind') {
    const id=random(),verifier=random();const result=await begin(platform,id,verifier,env);
    await env.DB.prepare('DELETE FROM gaming_auth_states WHERE expires_at<? OR (platform=? AND owner=?)').bind(Date.now(),platform,session.login).run();
    await env.DB.prepare('INSERT INTO gaming_auth_states(id,platform,owner,verifier,expires_at) VALUES(?,?,?,?,?)').bind(id,platform,session.login,await seal(verifier,env.CREDENTIAL_KEY,`state:${id}`),Date.now()+600000).run();
    return json({state:id,...result});
  }
  if(action==='complete') {
    const body=await readJson(request),state=await stateRow(body.state,platform,session.login,env);
    if(!state||typeof body.input!=='string')return json({error:'INVALID_CALLBACK'},400);
    try{await finishBinding(platform,body.input,state,env,fetcher);}catch(e){await recordRun(env,platform,now(),'failed',errorCode(e));throw e;}return json({status:'connected'});
  }
  if(action==='sync') {
    const row=await env.DB.prepare('SELECT last_attempt_at,sync_lock_until FROM gaming_accounts WHERE platform=?').bind(platform).first();
    if(!row)return json({error:'NOT_CONNECTED'},409);
    if(row.sync_lock_until>Date.now()||Date.now()-Date.parse(row.last_attempt_at||'1970-01-01')<60000)return json({error:'SYNC_COOLDOWN'},429);
    ctx.waitUntil(syncAccount(platform,env,fetcher));return json({status:'queued'},202);
  }
  if(action==='disconnect') {
    await env.DB.batch([env.DB.prepare('DELETE FROM gaming_accounts WHERE platform=?').bind(platform),env.DB.prepare('DELETE FROM gaming_auth_states WHERE platform=?').bind(platform),env.DB.prepare('DELETE FROM gaming_sync_runs WHERE platform=?').bind(platform)]);
    return json({status:'disconnected'});
  }
  return json({error:'NOT_FOUND'},404);
}
export default {
  async fetch(request,env,ctx) {
    try{return await route(request,env,ctx);}catch(e){return json({error:errorCode(e)},e?.message==='INPUT_TOO_LARGE'?413:503);}
  },
  async scheduled(event,env,ctx) {
    env=await providerEnv(env);
    const {results}=await env.DB.prepare('SELECT platform FROM gaming_accounts').all();
    // Each platform is isolated: failure cannot stop later platforms or replace their cache.
    for(const row of results)await syncAccount(row.platform,env);
    await env.DB.batch([env.DB.prepare('DELETE FROM gaming_auth_states WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM gaming_sync_runs WHERE finished_at<?').bind(new Date(Date.now()-30*86400000).toISOString()),env.DB.prepare('DELETE FROM gaming_login_attempts')]);
  }
};
