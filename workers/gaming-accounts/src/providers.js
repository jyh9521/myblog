import { upstream, challenge, safeUrl } from './security.js';
import {psnLogin,psnToken,psnRequest} from './psn.js';

export const platforms = ['nintendo','psn','xbox','steam','gog','epic'];
export const names = {nintendo:'Nintendo',psn:'PlayStation',xbox:'Xbox',steam:'Steam',gog:'GOG',epic:'Epic Games'};
const NA_CLIENT='5c38e31cd085304b';
const NA_UA='com.nintendo.znej/1.13.0 (Android/7.1.2)';
export function configured(platform, env) {
  const needed = {steam:['STEAM_API_KEY'],xbox:['MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET'],gog:['GOG_CLIENT_ID','GOG_CLIENT_SECRET'],epic:['EPIC_CLIENT_ID','EPIC_CLIENT_SECRET'],nintendo:[],psn:[]};
  return needed[platform].filter(name=>!env[name]);
}
function callback(env, platform) {return `${env.SITE_ORIGIN}/api/auth/${platform}/callback`;}
export async function begin(platform, state, verifier, env) {
  if(configured(platform,env).length) throw new Error('PROVIDER_NOT_CONFIGURED');
  if(platform==='steam') {
    const u=new URL('https://steamcommunity.com/openid/login');
    const returnTo=`${callback(env,platform)}?state=${state}`;
    for(const [k,v] of Object.entries({'ns':'http://specs.openid.net/auth/2.0','mode':'checkid_setup','return_to':returnTo,'realm':env.SITE_ORIGIN,'identity':'http://specs.openid.net/auth/2.0/identifier_select','claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'})) u.searchParams.set(`openid.${k}`,v);
    return {url:u.href,mode:'redirect'};
  }
  if(platform==='xbox') return {mode:'redirect',url:'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?'+new URLSearchParams({client_id:env.MICROSOFT_CLIENT_ID,response_type:'code',redirect_uri:callback(env,platform),scope:'XboxLive.signin offline_access',state,code_challenge:await challenge(verifier),code_challenge_method:'S256',response_mode:'query'})};
  if(platform==='nintendo') return {mode:'assisted',input:'callback',url:'https://accounts.nintendo.com/connect/1.0.0/authorize?'+new URLSearchParams({state,client_id:NA_CLIENT,redirect_uri:`npf${NA_CLIENT}://auth`,scope:'openid user user.mii user.email user.links[].id',response_type:'session_token_code',session_token_code_challenge:await challenge(verifier),session_token_code_challenge_method:'S256',theme:'login_form'})};
  if(platform==='psn') return {mode:'assisted',input:'npsso',url:'https://www.playstation.com/',helperUrl:'https://ca.account.sony.com/api/v1/ssocookie'};
  if(platform==='gog') return {mode:'assisted',input:'callback',url:'https://auth.gog.com/auth?'+new URLSearchParams({client_id:env.GOG_CLIENT_ID,redirect_uri:'https://embed.gog.com/on_login_success?origin=client',response_type:'code',layout:'client2',state})};
  return {mode:'assisted',input:'code',url:'https://www.epicgames.com/id/login?redirectUrl='+encodeURIComponent('https://www.epicgames.com/id/api/redirect?'+new URLSearchParams({clientId:env.EPIC_CLIENT_ID,responseType:'code'}))};
}
async function stage(name, operation) {try{return await operation();}catch(e){const code=/^(?:UPSTREAM_HTTP_\d{3}|AUTH_EXPIRED|UPSTREAM_NETWORK)$/.test(e.message)?e.message:'FAILED';throw new Error(name+'_'+code+(e.reason?'_'+e.reason:''));}}
const tokenExpiry=t=>({...t,expiresAt:Date.now()+Math.max(0,Number(t.expires_in||t.expiresIn||0))*1000});
function requireToken(t) {if(!t.access_token) throw new Error('INVALID_TOKEN_RESPONSE');return tokenExpiry(t);}
async function xboxIdentity(t,fetcher) {
  const user=await stage('XBOX_USER_AUTH',()=>upstream('https://user.auth.xboxlive.com/user/authenticate',{method:'POST',headers:{'Content-Type':'application/json','x-xbl-contract-version':'1'},body:JSON.stringify({Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:`d=${t.access_token}`},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'})},fetcher));
  const xsts=await stage('XBOX_XSTS',()=>upstream('https://xsts.auth.xboxlive.com/xsts/authorize',{method:'POST',headers:{'Content-Type':'application/json','x-xbl-contract-version':'1'},body:JSON.stringify({Properties:{SandboxId:'RETAIL',UserTokens:[user.Token]},RelyingParty:'http://xboxlive.com',TokenType:'JWT'})},fetcher));
  const claim=xsts.DisplayClaims?.xui?.[0];
  if(!claim?.xid || !claim?.uhs || !xsts.Token) throw new Error('INVALID_XBOX_IDENTITY');
  return {...t,xuid:claim.xid,userHash:claim.uhs,xsts:xsts.Token,xstsExpiresAt:Date.parse(xsts.NotAfter||'')||Date.now()+3600000};
}
async function formToken(url,body,headers,fetcher) {return requireToken(await upstream(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body).toString()},fetcher));}
async function gogToken(body,env,fetcher) {
  return requireToken(await upstream('https://auth.gog.com/token?'+new URLSearchParams({client_id:env.GOG_CLIENT_ID,client_secret:env.GOG_CLIENT_SECRET,...body}),{},fetcher));
}
async function epicToken(body,env,fetcher) {return formToken('https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token',body,{Authorization:'Basic '+btoa(`${env.EPIC_CLIENT_ID}:${env.EPIC_CLIENT_SECRET}`)},fetcher);}
export async function complete(platform, input, state, env, fetcher=fetch) {
  if(platform==='steam') {
    const u=new URL(input),expected=`${callback(env,platform)}?state=${state.id}`;
    if(u.searchParams.get('openid.return_to')!==expected || u.searchParams.get('openid.op_endpoint')!=='https://steamcommunity.com/openid/login' || u.searchParams.get('openid.mode')!=='id_res') throw new Error('INVALID_CALLBACK');
    const claim=u.searchParams.get('openid.claimed_id')||'';
    if(!/^https:\/\/steamcommunity\.com\/openid\/id\/\d{17}$/.test(claim) || u.searchParams.get('openid.identity')!==claim) throw new Error('INVALID_CALLBACK');
    const body=new URLSearchParams([...u.searchParams].filter(([k])=>k.startsWith('openid.')));body.set('openid.mode','check_authentication');
    const result=await fetcher('https://steamcommunity.com/openid/login',{method:'POST',body,signal:AbortSignal.timeout(15000)});
    if(!result.ok || !(await result.text()).split(/\r?\n/).includes('is_valid:true')) throw new Error('INVALID_CALLBACK');
    return {steamid:claim.split('/').pop()};
  }
  if(platform==='xbox') {
    const t=await stage('XBOX_TOKEN',()=>formToken('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{client_id:env.MICROSOFT_CLIENT_ID,grant_type:'authorization_code',code:input,redirect_uri:callback(env,platform),code_verifier:state.verifier,scope:'XboxLive.signin offline_access',...(env.MICROSOFT_CLIENT_SECRET?{client_secret:env.MICROSOFT_CLIENT_SECRET}:{})},{},fetcher));
    return xboxIdentity(t,fetcher);
  }
  if(platform==='nintendo') {
    const u=new URL(input),p=new URLSearchParams(u.hash.slice(1));
    if(u.protocol!==`npf${NA_CLIENT}:` || u.hostname!=='auth' || p.get('state')!==state.id || !p.get('session_token_code')) throw new Error('INVALID_CALLBACK');
    const t=await stage('NINTENDO_SESSION',()=>upstream('https://accounts.nintendo.com/connect/1.0.0/api/session_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':NA_UA},body:new URLSearchParams({client_id:NA_CLIENT,session_token_code:p.get('session_token_code'),session_token_code_verifier:state.verifier}).toString()},fetcher));
    if(!t.session_token) throw new Error('INVALID_TOKEN_RESPONSE');return {session_token:t.session_token};
  }
  if(platform==='psn') {
    if(!/^[a-zA-Z0-9_-]{40,256}$/.test(input)) throw new Error('INVALID_INPUT');
    // Library errors may embed upstream credentials: never expose their messages.
    return psnLogin(input,fetcher);
  }
  if(platform==='gog') {
    const u=new URL(input);
    if(u.origin!=='https://embed.gog.com' || u.pathname!=='/on_login_success' || !u.searchParams.get('code')) throw new Error('INVALID_CALLBACK');
    if(u.searchParams.has('state') && u.searchParams.get('state')!==state.id) throw new Error('INVALID_CALLBACK');
    return gogToken({grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:'https://embed.gog.com/on_login_success?origin=client'},env,fetcher);
  }
  let code=input;
  if(input.startsWith('{')) {try {code=JSON.parse(input).authorizationCode;}catch {throw new Error('INVALID_INPUT');}}
  if(typeof code!=='string' || !/^[a-zA-Z0-9_-]{16,256}$/.test(code)) throw new Error('INVALID_INPUT');
  return epicToken({grant_type:'authorization_code',code,token_type:'eg1'},env,fetcher);
}
export async function renew(platform,credential,env,fetcher=fetch) {
  if(platform==='steam') return credential;
  if(platform==='nintendo') {
    const t=requireToken(await stage('NINTENDO_TOKEN',()=>upstream('https://accounts.nintendo.com/connect/1.0.0/api/token',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':NA_UA},body:JSON.stringify({client_id:NA_CLIENT,session_token:credential.session_token,grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token'})},fetcher)));
    return {...t,session_token:credential.session_token};
  }
  if(platform==='psn') {
    if(credential.expiresAt>Date.now()+60000)return credential;
    return psnToken({refresh_token:credential.refreshToken,grant_type:'refresh_token',scope:'psn:mobile.v2.core psn:clientapp'},fetcher);
  }
  if(credential.expiresAt>Date.now()+60000 && (platform!=='xbox'||credential.xstsExpiresAt>Date.now()+60000))return credential;
  if(platform==='xbox') {
    const t=await formToken('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{client_id:env.MICROSOFT_CLIENT_ID,grant_type:'refresh_token',refresh_token:credential.refresh_token,scope:'XboxLive.signin offline_access',...(env.MICROSOFT_CLIENT_SECRET?{client_secret:env.MICROSOFT_CLIENT_SECRET}:{})},{},fetcher);
    return xboxIdentity({...t,refresh_token:t.refresh_token||credential.refresh_token},fetcher);
  }
  const t=platform==='gog'? await gogToken({grant_type:'refresh_token',refresh_token:credential.refresh_token},env,fetcher):await epicToken({grant_type:'refresh_token',refresh_token:credential.refresh_token,token_type:'eg1'},env,fetcher);
  return {...t,refresh_token:t.refresh_token||credential.refresh_token};
}
export const numeric=v=>typeof v==='number' && Number.isFinite(v) && v>=0 ? v : undefined;
export function iso(v) {if(typeof v!=='string' || !v || !Number.isFinite(Date.parse(v)))return undefined;return new Date(v).toISOString();}
export function durationMinutes(value) {
  if(typeof value!=='string')return undefined;
  const m=value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m && m.slice(1).some(Boolean)?Number(m[1]||0)*60+Number(m[2]||0)+Number(m[3]||0)/60:undefined;
}
function normalizedGame(id,title,platform,fields={}) {
  if(!id || typeof title!=='string' || !title.trim())return null;
  return {id:String(id),title:title.slice(0,300),platform,...fields,cover:safeUrl(fields.cover),url:safeUrl(fields.url),minutes:numeric(fields.minutes),lastPlayed:iso(fields.lastPlayed)};
}
export function snapshot(platform,accountId,displayName,games,countKind='played',warnings=[]) {
  const valid=games.filter(Boolean),unique=[...new Map(valid.map(g=>[g.id,g])).values()];
  const recorded=unique.filter(g=>g.minutes!==undefined);
  const recent=unique.filter(g=>g.lastPlayed).sort((a,b)=>Date.parse(b.lastPlayed)-Date.parse(a.lastPlayed)).slice(0,6);
  return {platform,accountId:String(accountId),displayName:String(displayName||accountId).slice(0,150),games:unique.length,countKind,minutes:recorded.length?recorded.reduce((sum,g)=>sum+g.minutes,0):undefined,timeComplete:unique.length>0 && recorded.length===unique.length,recent,warnings};
}
export function nintendoSnapshot(data,identity) {
  if(!Array.isArray(data.playHistories))throw new Error('INVALID_HISTORY_RESPONSE');
  return snapshot('nintendo',identity.id,identity.nickname||identity.name,data.playHistories.map(g=>normalizedGame(g.titleId,g.titleName,'nintendo',{cover:g.imageUrl,minutes:g.totalPlayedMinutes,lastPlayed:g.lastPlayedAt})));
}
export async function collect(platform,c,env,fetcher=fetch) {
  if(platform==='steam') {
    const base='https://api.steampowered.com';
    const library=await upstream(base+'/IPlayerService/GetOwnedGames/v0001/?'+new URLSearchParams({key:env.STEAM_API_KEY,steamid:c.steamid,include_appinfo:'true',include_played_free_games:'true',include_extended_appinfo:'true'}),{},fetcher);
    if(!Number.isInteger(library.response?.game_count) || (library.response.game_count>0 && !Array.isArray(library.response.games)))throw new Error('STEAM_LIBRARY_PRIVATE');
    const info=await upstream(base+'/ISteamUser/GetPlayerSummaries/v0002/?'+new URLSearchParams({key:env.STEAM_API_KEY,steamids:c.steamid}),{},fetcher);
    const games=(library.response.games||[]).map(g=>normalizedGame(g.appid,g.name,'steam',{minutes:g.playtime_forever,lastPlayed:g.rtime_last_played>0?new Date(g.rtime_last_played*1000).toISOString():undefined,cover:`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,url:`https://store.steampowered.com/app/${g.appid}/`}));
    const result=snapshot(platform,c.steamid,info.response?.players?.[0]?.personaname,games,'owned');
    await Promise.all(result.recent.map(async g=>{try{const d=await upstream(base+'/ISteamUserStats/GetPlayerAchievements/v0001/?'+new URLSearchParams({key:env.STEAM_API_KEY,steamid:c.steamid,appid:g.id}),{},fetcher);if(d.playerstats?.success&&Array.isArray(d.playerstats.achievements)){g.total=d.playerstats.achievements.length;g.earned=d.playerstats.achievements.filter(a=>a.achieved===1).length;}}catch{result.warnings.push('SOME_ACHIEVEMENTS_MISSING');}}));return result;
  }
  if(platform==='nintendo') {
    const identity=await stage('NINTENDO_PROFILE',()=>upstream('https://api.accounts.nintendo.com/2.0.0/users/me',{headers:{Authorization:`Bearer ${c.access_token}`,'User-Agent':NA_UA,Accept:'application/json'}},fetcher));
    if(typeof identity.id!=='string'||!identity.id)throw new Error('NINTENDO_PROFILE_FAILED');
    const history=token=>upstream('https://app-api.znej.nintendo.com/api/v2.0/users/me/play_histories',{headers:{Authorization:`Bearer ${token}`,'User-Agent':NA_UA,Accept:'application/json','Gentry-Locale':'ja-JP'}},fetcher);
    try {
      const data=await stage('NINTENDO_HISTORY',async()=>{
        try{return await history(c.access_token);}catch(e){
          // Current app releases may require the ID token. Retry once only for
          // authorization/request rejection, never against the retired API host.
          if(c.id_token && c.id_token!==c.access_token && ['AUTH_EXPIRED','UPSTREAM_HTTP_400'].includes(e.message))return history(c.id_token);
          throw e;
        }
      });
      return nintendoSnapshot(data,identity);
    }catch(e){
      // Identity was verified by Nintendo, not inferred from the pasted callback.
      e.verifiedNintendoIdentity={id:identity.id,name:identity.nickname||identity.name};
      throw e;
    }
  }
  if(platform==='psn') {
    try {
      // Unlike the game-list endpoint, profile lookup requires a numeric account ID.
      const id=c.accountId;
      if(typeof id!=='string'||!/^\d+$/.test(id))throw new Error('PSN_IDENTITY_FAILED');
      const games=[];let offset=0,total;
      for(let page=0;page<20;page++) {
        const d=await stage('PSN_HISTORY',()=>psnRequest(`/gamelist/v2/users/me/titles?limit=100&offset=${offset}`,c,fetcher));
        if(!Array.isArray(d.titles))throw new Error('INVALID_HISTORY_RESPONSE');
        games.push(...d.titles);total=d.totalItemCount;offset+=d.titles.length;
        if(offset>=total||!d.titles.length)break;
      }
      if(total>offset)throw new Error('PAGINATION_LIMIT');
      const p=await stage('PSN_PROFILE',()=>psnRequest(`/userProfile/v1/internal/users/${id}/profiles`,c,fetcher));
      const profile=p.profile||p;
      if(typeof profile.onlineId!=='string'||!profile.onlineId.trim())throw new Error('PSN_PROFILE_FAILED');
      return snapshot(platform,id,profile.onlineId,games.map(g=>normalizedGame(g.titleId,g.localizedName||g.name,platform,{cover:g.localizedImageUrl||g.imageUrl,lastPlayed:g.lastPlayedDateTime,minutes:durationMinutes(g.playDuration)})));
    }catch(e){if(e.message==='PAGINATION_LIMIT'||e.message.startsWith('PSN_'))throw e;throw new Error('PSN_SYNC_FAILED');}
  }
  if(platform==='xbox') {
    const headers={Authorization:`XBL3.0 x=${c.userHash};${c.xsts}`,'x-xbl-contract-version':'2','Accept-Language':'en-US'};
    const d=await stage('XBOX_HISTORY',()=>upstream(`https://titlehub.xboxlive.com/users/xuid(${c.xuid})/titles/titlehistory/decoration/achievement,image,scid?maxItems=1000`,{headers:{...headers,'x-xbl-client-name':'XboxApp','x-xbl-client-type':'UWA','x-xbl-client-version':'39.39.22001.0'}},fetcher));
    if(d.pagingInfo?.continuationToken)throw new Error('PAGINATION_LIMIT');
    if(!Array.isArray(d.titles))throw new Error('INVALID_HISTORY_RESPONSE');
    const minutes=new Map(),warnings=[];
    const scids=[...new Set(d.titles.map(g=>g.serviceConfigId).filter(Boolean))];
    // Batch all available title statistics, not just the six recent games.
    for(let offset=0;offset<scids.length;offset+=50){
      const batch=scids.slice(offset,offset+50);
      try {
        const stats=await upstream('https://userstats.xboxlive.com/batch',{method:'POST',headers:{...headers,'x-xbl-contract-version':'2','Content-Type':'application/json'},body:JSON.stringify({arrangebyfield:'xuid',xuids:[c.xuid],groups:[],stats:batch.map(scid=>({scid,name:'MinutesPlayed'}))})},fetcher);
        if(!Array.isArray(stats.statlistscollection))throw new Error('INVALID_STATS_RESPONSE');
        for(const list of stats.statlistscollection){
          for(const stat of list.stats||[]){
            if(String(stat.xuid)!==String(c.xuid)||stat.name!=='MinutesPlayed'||!batch.includes(stat.scid))continue;
            const v=stat.value,n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):undefined;
            if(numeric(n)!==undefined)minutes.set(stat.scid,n);
          }
        }
      }catch(e){warnings.push('SOME_PLAYTIME_MISSING', 'XBOX_PLAYTIME_'+(/^(UPSTREAM_HTTP_\d{3}|AUTH_EXPIRED|UPSTREAM_NETWORK|INVALID_STATS_RESPONSE)$/.test(e.message)?e.message:'FAILED')+(e.reason?'_'+e.reason:''));}
    }
    // Keep useful recent-game time if a batch is rejected; at most six requests.
    const latest=[...d.titles].sort((a,b)=>Date.parse(b.titleHistory?.lastTimePlayed||0)-Date.parse(a.titleHistory?.lastTimePlayed||0)).slice(0,6);
    for(const g of latest){if(!g.serviceConfigId||minutes.has(g.serviceConfigId))continue;try{
      const stats=await upstream(`https://userstats.xboxlive.com/users/xuid(${c.xuid})/scids/${g.serviceConfigId}/stats/MinutesPlayed`,{headers},fetcher);
      const v=(stats.statlistscollection?.flatMap(x=>x.stats||[])||stats.stats||[]).find(stat=>stat.name==='MinutesPlayed')?.value;
      const n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):undefined;
      if(numeric(n)!==undefined)minutes.set(g.serviceConfigId,n);
    }catch{warnings.push('SOME_PLAYTIME_MISSING');}}
    const p=await upstream(`https://profile.xboxlive.com/users/xuid(${c.xuid})/profile/settings?settings=Gamertag`,{headers},fetcher);
    const result=snapshot(platform,c.xuid,p.profileUsers?.[0]?.settings?.find(s=>s.id==='Gamertag')?.value,d.titles.map(g=>normalizedGame(g.titleId,g.name,platform,{cover:g.displayImage,lastPlayed:g.titleHistory?.lastTimePlayed,minutes:minutes.get(g.serviceConfigId),earned:numeric(g.achievement?.currentAchievements)})));
    // Shared SCIDs describe one statistic: count it only once in the total.
    result.minutes=minutes.size?[...minutes.values()].reduce((sum,n)=>sum+n,0):undefined;
    result.warnings=[...new Set(warnings)];return result;
  }
  if(platform==='gog') {
    const headers={Authorization:`Bearer ${c.access_token}`};
    const [identity,library]=await Promise.all([upstream('https://embed.gog.com/userData.json',{headers},fetcher),upstream('https://embed.gog.com/user/data/games',{headers},fetcher)]);
    if(!Array.isArray(library.owned)||!identity.userId)throw new Error('INVALID_LIBRARY_RESPONSE');
    const base={platform,accountId:String(identity.userId),displayName:String(identity.username||identity.userId),games:new Set(library.owned).size,countKind:'owned',timeComplete:false,recent:[],warnings:[]};
    // GOG's profile statistics contain minutes and lastSession, unlike ownership.
    const items=[];let pages=1,statsUserId=String(identity.userId);
    try{
      if(typeof identity.username!=='string'||!identity.username)throw new Error('INVALID_IDENTITY');
      for(let page=1;page<=pages;page++){
        const data=await upstream(`https://embed.gog.com/u/${encodeURIComponent(identity.username)}/games/stats?sort=recent_playtime&order=desc&page=${page}`,{headers},fetcher);
        if(!Array.isArray(data._embedded?.items)||!Number.isInteger(data.pages)||data.pages<0||data.pages>40)throw new Error('INVALID_HISTORY_RESPONSE');
        if(page===1)pages=Math.max(1,data.pages);else if(data.pages!==pages)throw new Error('INVALID_HISTORY_RESPONSE');
        items.push(...data._embedded.items);
      }
    }catch(e){return {...base,warnings:['PLAYTIME_NOT_AVAILABLE','GOG_STATS_'+(/^(UPSTREAM_HTTP_\d{3}|AUTH_EXPIRED|UPSTREAM_NETWORK|INVALID_HISTORY_RESPONSE)$/.test(e.message)?e.message:'FAILED')]};}
    // Legacy userData IDs can differ from the profile's canonical string ID.
    // Resolve it from GOG's own profile JSON and verify the exact login username.
    if(items.some(item=>Object.keys(item.stats||{}).length)&&!items.some(item=>item.stats?.[statsUserId])){
      try{
        const response=await fetcher(`https://embed.gog.com/u/${encodeURIComponent(identity.username)}/games`,{headers,signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('INVALID_IDENTITY');
        const bytes=await response.arrayBuffer();if(bytes.byteLength>1024*1024)throw new Error('INPUT_TOO_LARGE');
        const match=new TextDecoder().decode(bytes).match(/window\.profilesData\.profileUser\s*=\s*(\{[^\r\n]+?\});/);
        const profile=match?JSON.parse(match[1]):null;
        if(profile?.username!==identity.username||!/^\d+$/.test(profile.userId||''))throw new Error('INVALID_IDENTITY');
        statsUserId=profile.userId;
      }catch{return {...base,warnings:['PLAYTIME_NOT_AVAILABLE','GOG_PROFILE_ID_UNAVAILABLE']};}
    }
    const games=items.map(item=>{
      const stat=item.stats?.[statsUserId],game=item.game||{};
      const url=typeof game.url==='string'&&/^\/(?:[a-z]{2}\/)?game\//.test(game.url)?'https://www.gog.com'+game.url:undefined;
      return normalizedGame(game.id,game.title,platform,{minutes:numeric(stat?.playtime),lastPlayed:stat?.lastSession,cover:game.image,url});
    });
    const stats=snapshot(platform,identity.userId,base.displayName,games,'owned');
    return {...base,minutes:stats.minutes,recent:stats.recent,timeComplete:stats.timeComplete&&stats.games===base.games,warnings:stats.minutes===undefined?['PLAYTIME_NOT_AVAILABLE']:[]};
  }
  const headers={Authorization:`Bearer ${c.access_token}`};let records=[],cursor='';const seen=new Set();
  for(let page=0;page<20;page++) {
    const d=await upstream('https://library-service.live.use1a.on.epicgames.com/library/api/public/items?'+new URLSearchParams({includeMetadata:'true',...(cursor?{cursor}:{})}),{headers},fetcher);
    if(!Array.isArray(d.records))throw new Error('INVALID_LIBRARY_RESPONSE');records.push(...d.records);cursor=d.responseMetadata?.nextCursor||'';
    if(!cursor)break;if(seen.has(cursor))throw new Error('INVALID_PAGINATION');seen.add(cursor);
  }
  if(cursor)throw new Error('PAGINATION_LIMIT');
  let activity;try{activity=await upstream('https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/'+encodeURIComponent(c.account_id)+'/all',{headers},fetcher);}catch{return {platform,accountId:String(c.account_id),displayName:String(c.displayName||c.account_id),games:new Set(records.map(r=>r.appName).filter(Boolean)).size,countKind:'owned',timeComplete:false,recent:[],warnings:['PLAYTIME_NOT_AVAILABLE']};}
  if(!Array.isArray(activity))return {platform,accountId:String(c.account_id),displayName:String(c.displayName||c.account_id),games:new Set(records.map(r=>r.appName).filter(Boolean)).size,countKind:'owned',timeComplete:false,recent:[],warnings:['PLAYTIME_NOT_AVAILABLE']};
  const result=epicSnapshot(records,activity,c);if(!result.recent.length)result.warnings.push('LAST_PLAYED_NOT_AVAILABLE');return result;
}

export function epicSnapshot(records,activity,c) {
  const times=new Map(activity.map(a=>[a.artifactId,a]));
  const games=records.map(r=>{const a=times.get(r.appName),meta=r.metadata||{};return normalizedGame(r.appName,meta.title||r.title||r.appName,'epic',{minutes:typeof a?.totalTime==='number'?numeric(a.totalTime/60):undefined,lastPlayed:a?.lastPlayed,cover:meta.keyImages?.find(i=>i.type==='DieselGameBoxWide')?.url});});
  return snapshot('epic',c.account_id,c.displayName,games,'owned');
}
