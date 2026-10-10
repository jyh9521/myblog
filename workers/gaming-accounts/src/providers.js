import { upstream, challenge, safeUrl } from './security.js';
import { exchangeNpssoForAccessCode, exchangeAccessCodeForAuthTokens, exchangeRefreshTokenForAuthTokens, getUserPlayedGames, getProfileFromAccountId, getProfileFromUserName } from 'psn-api';

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
const tokenExpiry=t=>({...t,expiresAt:Date.now()+Math.max(0,Number(t.expires_in||t.expiresIn||0))*1000});
function requireToken(t) {if(!t.access_token) throw new Error('INVALID_TOKEN_RESPONSE');return tokenExpiry(t);}
async function xboxIdentity(t,fetcher) {
  const user=await upstream('https://user.auth.xboxlive.com/user/authenticate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:`d=${t.access_token}`},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'})},fetcher);
  const xsts=await upstream('https://xsts.auth.xboxlive.com/xsts/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Properties:{SandboxId:'RETAIL',UserTokens:[user.Token]},RelyingParty:'http://xboxlive.com',TokenType:'JWT'})},fetcher);
  const claim=xsts.DisplayClaims?.xui?.[0];
  if(!claim?.xid || !claim?.uhs || !xsts.Token) throw new Error('INVALID_XBOX_IDENTITY');
  return {...t,xuid:claim.xid,userHash:claim.uhs,xsts:xsts.Token};
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
    const t=await formToken('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{client_id:env.MICROSOFT_CLIENT_ID,grant_type:'authorization_code',code:input,redirect_uri:callback(env,platform),code_verifier:state.verifier,scope:'XboxLive.signin offline_access',...(env.MICROSOFT_CLIENT_SECRET?{client_secret:env.MICROSOFT_CLIENT_SECRET}:{})},{},fetcher);
    return xboxIdentity(t,fetcher);
  }
  if(platform==='nintendo') {
    const u=new URL(input),p=new URLSearchParams(u.hash.slice(1));
    if(u.protocol!==`npf${NA_CLIENT}:` || u.hostname!=='auth' || p.get('state')!==state.id || !p.get('session_token_code')) throw new Error('INVALID_CALLBACK');
    const t=await upstream('https://accounts.nintendo.com/connect/1.0.0/api/session_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':NA_UA},body:new URLSearchParams({client_id:NA_CLIENT,session_token_code:p.get('session_token_code'),session_token_code_verifier:state.verifier}).toString()},fetcher);
    if(!t.session_token) throw new Error('INVALID_TOKEN_RESPONSE');return {session_token:t.session_token};
  }
  if(platform==='psn') {
    if(!/^[a-zA-Z0-9_-]{40,256}$/.test(input)) throw new Error('INVALID_INPUT');
    // Library errors may embed upstream credentials: never expose their messages.
    try {return tokenExpiry(await exchangeAccessCodeForAuthTokens(await exchangeNpssoForAccessCode(input)));}catch {throw new Error('PSN_LOGIN_FAILED');}
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
    const t=requireToken(await upstream('https://accounts.nintendo.com/connect/1.0.0/api/token',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':NA_UA},body:JSON.stringify({client_id:NA_CLIENT,session_token:credential.session_token,grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token'})},fetcher));
    return {...t,session_token:credential.session_token};
  }
  if(platform==='psn') {
    if(credential.expiresAt>Date.now()+60000)return credential;
    try{return tokenExpiry(await exchangeRefreshTokenForAuthTokens(credential.refreshToken));}catch {throw new Error('AUTH_EXPIRED');}
  }
  if(credential.expiresAt>Date.now()+60000 && platform!=='xbox')return credential;
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
    return snapshot(platform,c.steamid,info.response?.players?.[0]?.personaname,games,'owned');
  }
  if(platform==='nintendo') {
    const identity=await upstream('https://api.accounts.nintendo.com/2.0.0/users/me',{headers:{Authorization:`Bearer ${c.access_token}`,'User-Agent':NA_UA}},fetcher);
    let data;
    try {data=await upstream('https://app-api.znej.nintendo.com/api/v2.0/users/me/play_histories',{headers:{Authorization:`Bearer ${c.access_token}`,'User-Agent':NA_UA}},fetcher);}
    catch(e){if(e.message==='AUTH_EXPIRED')throw e;data=await upstream('https://mypage-api.entry.nintendo.co.jp/api/v1/users/me/play_histories',{headers:{Authorization:`Bearer ${c.access_token}`,'User-Agent':NA_UA}},fetcher);}
    if(!identity.id)throw new Error('INVALID_IDENTITY');
    return nintendoSnapshot(data,identity);
  }
  if(platform==='psn') {
    try {
      const games=[];let offset=0,total;
      for(let page=0;page<20;page++) {
        const d=await getUserPlayedGames(c,'me',{limit:100,offset});
        if(!Array.isArray(d.titles))throw new Error('INVALID_HISTORY_RESPONSE');
        games.push(...d.titles);total=d.totalItemCount;offset+=d.titles.length;
        if(offset>=total||!d.titles.length)break;
      }
      if(total>offset)throw new Error('PAGINATION_LIMIT');
      const p=await getProfileFromAccountId(c,'me');
      const identity=await getProfileFromUserName(c,p.onlineId);
      if(!identity.profile?.accountId)throw new Error('INVALID_IDENTITY');
      return snapshot(platform,identity.profile.accountId,p.onlineId,games.map(g=>normalizedGame(g.titleId,g.localizedName||g.name,platform,{cover:g.localizedImageUrl||g.imageUrl,lastPlayed:g.lastPlayedDateTime,minutes:durationMinutes(g.playDuration)})));
    }catch(e){if(e.message==='PAGINATION_LIMIT')throw e;throw new Error('PSN_SYNC_FAILED');}
  }
  if(platform==='xbox') {
    const headers={Authorization:`XBL3.0 x=${c.userHash};${c.xsts}`,'x-xbl-contract-version':'2'};
    const d=await upstream(`https://titlehub.xboxlive.com/users/xuid(${c.xuid})/titles/titlehistory/decoration/achievement,image,scid?maxItems=10000`,{headers},fetcher);
    if(!Array.isArray(d.titles))throw new Error('INVALID_HISTORY_RESPONSE');
    const latest=[...d.titles].sort((a,b)=>Date.parse(b.titleHistory?.lastTimePlayed||0)-Date.parse(a.titleHistory?.lastTimePlayed||0)).slice(0,6);
    const minutes=new Map();const warnings=[];
    // Fetch only six detailed stats; library counts do not pretend to be ownership.
    for(const g of latest){if(!g.serviceConfigId)continue;try {
      const s=await upstream(`https://userstats.xboxlive.com/users/xuid(${c.xuid})/scids/${g.serviceConfigId}/stats/MinutesPlayed`,{headers},fetcher);
      const n=Number(s.statlistscollection?.[0]?.stats?.find(s=>s.name==='MinutesPlayed')?.value);
      if(Number.isFinite(n)&&n>=0)minutes.set(String(g.titleId),n);
    }catch{warnings.push('SOME_PLAYTIME_MISSING');}}
    const p=await upstream(`https://profile.xboxlive.com/users/xuid(${c.xuid})/profile/settings?settings=Gamertag`,{headers},fetcher);
    const result=snapshot(platform,c.xuid,p.profileUsers?.[0]?.settings?.find(s=>s.id==='Gamertag')?.value,d.titles.map(g=>normalizedGame(g.titleId,g.name,platform,{cover:g.displayImage,lastPlayed:g.titleHistory?.lastTimePlayed,minutes:minutes.get(String(g.titleId)),earned:numeric(g.achievement?.currentAchievements)})));
    // Six-game stats are not the account's total playtime.
    delete result.minutes;result.timeComplete=false;result.warnings=warnings;return result;
  }
  if(platform==='gog') {
    const headers={Authorization:`Bearer ${c.access_token}`};
    const [identity,library]=await Promise.all([upstream('https://embed.gog.com/userData.json',{headers},fetcher),upstream('https://embed.gog.com/user/data/games',{headers},fetcher)]);
    if(!Array.isArray(library.owned)||!identity.userId)throw new Error('INVALID_LIBRARY_RESPONSE');
    // Ownership has no reliable last-played timestamp: do not invent recent activity.
    return {platform,accountId:String(identity.userId),displayName:String(identity.username||identity.userId),games:new Set(library.owned).size,countKind:'owned',timeComplete:false,recent:[],warnings:['PLAYTIME_NOT_AVAILABLE']};
  }
  const headers={Authorization:`Bearer ${c.access_token}`};let records=[],cursor='';const seen=new Set();
  for(let page=0;page<20;page++) {
    const d=await upstream('https://library-service.live.use1a.on.epicgames.com/library/api/public/items?'+new URLSearchParams({includeMetadata:'true',...(cursor?{cursor}:{})}),{headers},fetcher);
    if(!Array.isArray(d.records))throw new Error('INVALID_LIBRARY_RESPONSE');records.push(...d.records);cursor=d.responseMetadata?.nextCursor||'';
    if(!cursor)break;if(seen.has(cursor))throw new Error('INVALID_PAGINATION');seen.add(cursor);
  }
  if(cursor)throw new Error('PAGINATION_LIMIT');
  return {platform,accountId:String(c.account_id),displayName:String(c.displayName||c.account_id),games:new Set(records.map(r=>r.appName).filter(Boolean)).size,countKind:'owned',timeComplete:false,recent:[],warnings:['PLAYTIME_NOT_AVAILABLE']};
}
