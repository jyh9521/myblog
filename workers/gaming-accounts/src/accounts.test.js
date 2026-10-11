import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{route,syncAccount,publicProfile,errorCode,providerEnv} from './index.js';
import {b64,seal,open,readJson} from './security.js';
import {begin,complete,collect,configured,durationMinutes,nintendoSnapshot,snapshot} from './providers.js';
const KEY=b64(new Uint8Array(32).fill(7)),SITE='https://blog.blfy.cc',BASE=SITE+'/ns/api/accounts';
function env(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_configuration.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0003_store_links.sql',import.meta.url),'utf8'));
  const prepare=sql=>{let values=[];const s=db.prepare(sql);return {bind(...args){values=args;return this;},async first(){return s.get(...values)||null;},async all(){return {results:s.all(...values)};},async run(){return {meta:s.run(...values)};}};};
  return {DB:{prepare,async batch(statements){db.exec('BEGIN');try{const v=await Promise.all(statements.map(s=>s.run()));db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}},CREDENTIAL_KEY:KEY,SITE_ORIGIN:SITE,ADMIN_GITHUB_LOGIN:'owner',MICROSOFT_CLIENT_ID:'client',MICROSOFT_CLIENT_SECRET:'test-client-secret',STEAM_API_KEY:'test-key'};
}
function req(path='',method='GET',body,cookie='',origin=SITE){return new Request(BASE+path,{method,headers:{Origin:origin,'X-Gaming-Admin':'1',Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
async function cookie(e){return '__Host-gaming_admin='+await seal({login:'owner',expires:Date.now()+3600000},KEY,'admin-session');}
const context={waitUntil(){}};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
async function saved(e,platform='steam'){
  const credential=await seal({steamid:'76561198000000000'},KEY,`account:${platform}`);
  const data={platform,accountId:'76561198000000000',displayName:'Member',games:2,countKind:'owned',recent:[],timeComplete:true,minutes:10};
  await e.DB.prepare('INSERT INTO gaming_accounts(platform,account_id,display_name,credential,bound_at,last_success_at,public_json) VALUES(?,?,?,?,?,?,?)').bind(platform,data.accountId,'Member',credential,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',JSON.stringify(data)).run();
  return credential;
}
test('credentials use authenticated encryption, platform binding and fresh IV',async()=>{const a=await seal({refresh_token:'secret'},KEY,'account:xbox'),b=await seal({refresh_token:'secret'},KEY,'account:xbox');assert.notEqual(a,b);assert.ok(!a.includes('secret'));assert.equal((await open(a,KEY,'account:xbox')).refresh_token,'secret');await assert.rejects(open(a,KEY,'account:steam'));await assert.rejects(open(a.slice(0,-8)+'AAAAAAAA',KEY,'account:xbox'));});
test('request input is bounded before JSON parse',async()=>{await assert.rejects(readJson(new Response('x'.repeat(40)),16),/INPUT_TOO_LARGE/);});
test('six platform configuration does not advertise an unconfigured Xbox web client',()=>{assert.deepEqual(configured('xbox',{MICROSOFT_CLIENT_ID:'id'}),['MICROSOFT_CLIENT_SECRET']);assert.deepEqual(configured('nintendo',{}),[]);});
test('Xbox authorization uses registered canonical callback and PKCE',async()=>{const d=await begin('xbox','state','verifier',env());const u=new URL(d.url);assert.equal(u.searchParams.get('redirect_uri'),SITE+'/api/auth/xbox/callback');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(u.searchParams.get('scope').includes('offline_access'));assert.equal(d.mode,'redirect');});
test('Xbox code exchange uses secret and canonical callback; returns XUID',async()=>{
  const calls=[];const fetcher=async(url,o)=>{calls.push([url,o]);if(url.includes('oauth2'))return json({access_token:'a',refresh_token:'r',expires_in:3600});if(url.includes('user.auth'))return json({Token:'u'});return json({Token:'x',DisplayClaims:{xui:[{xid:'123',uhs:'456'}]}});};
  const t=await complete('xbox','code',{id:'state',verifier:'proof'},env(),fetcher);assert.equal(t.xuid,'123');const body=new URLSearchParams(calls[0][1].body);assert.equal(body.get('client_secret'),'test-client-secret');assert.equal(body.get('code_verifier'),'proof');assert.equal(body.get('redirect_uri'),SITE+'/api/auth/xbox/callback');
});
test('Steam OpenID verification rejects forged return URL before upstream request',async()=>{let calls=0;await assert.rejects(complete('steam',SITE+'/api/auth/steam/callback?openid.return_to=https://evil.invalid',{id:'a'},env(),async()=>{calls++;}),/INVALID_CALLBACK/);assert.equal(calls,0);});
test('Nintendo login uses matching challenge state and custom callback',async()=>{const d=await begin('nintendo','state','proof',env());const u=new URL(d.url);assert.equal(u.searchParams.get('state'),'state');assert.equal(u.searchParams.get('response_type'),'session_token_code');assert.equal(d.mode,'assisted');await assert.rejects(complete('nintendo','npf5c38e31cd085304b://auth#state=bad&session_token_code=a',{id:'state',verifier:'proof'},env()),/INVALID_CALLBACK/);});
test('Nintendo missing dates do not invent recent games; zero time remains valid',()=>{const d=nintendoSnapshot({playHistories:[{titleId:'one',titleName:'Game',totalPlayedMinutes:0}]},{id:'member',nickname:'M'});assert.equal(d.minutes,0);assert.equal(d.recent.length,0);assert.equal(d.games,1);});
test('malformed Nintendo records fail instead of clearing cache',()=>{assert.throws(()=>nintendoSnapshot({},{}),/INVALID_HISTORY_RESPONSE/);});
test('PS duration supports hours, minutes and seconds, unknown is not zero',()=>{assert.equal(durationMinutes('PT3H48M'),228);assert.equal(durationMinutes('PT30S'),0.5);assert.equal(durationMinutes('PT0S'),0);assert.equal(durationMinutes(''),undefined);});
test('snapshots deduplicate IDs, limit recent covers to six, mark incomplete time',()=>{const games=Array.from({length:10},(_,i)=>({id:String(i),title:'Game',lastPlayed:`2026-10-${String(i+1).padStart(2,'0')}T00:00:00Z`,...(i?{minutes:1}:{})}));const d=snapshot('steam','member','M',[...games,games[0]]);assert.equal(d.games,10);assert.equal(d.recent.length,6);assert.equal(d.timeComplete,false);assert.equal(d.minutes,9);});
test('unauthenticated admin reads are rejected, public reads work',async()=>{const e=env();assert.equal((await route(req(),e,context)).status,401);assert.deepEqual(await (await route(req('/public'),e,context)).json(),{version:2,accounts:[]});});
test('cross-origin mutations are rejected before login',async()=>{assert.equal((await route(req('/session','POST',{token:'x'.repeat(30)},'','https://evil.invalid'),env(),context)).status,403);});
test('admin login checks GitHub owner; cookie is HttpOnly, Secure, host-only and Lax',async()=>{const e=env();assert.equal((await route(req('/session','POST',{token:'x'.repeat(30)}),e,context,async()=>json({login:'other'}))).status,403);const r=await route(req('/session','POST',{token:'x'.repeat(30)}),e,context,async()=>json({login:'owner'}));assert.equal(r.status,200);assert.match(r.headers.get('Set-Cookie'),/__Host-gaming_admin=.*Path=\/; HttpOnly; Secure; SameSite=Lax/);assert.ok(!(await r.text()).includes('xxxxx'));});
test('login throttle stops repeated provider calls',async()=>{const e=env();let calls=0;for(let i=0;i<11;i++){const r=await route(req('/session','POST',{token:'x'.repeat(30)}),e,context,async()=>{calls++;return json({login:'owner'});});if(i===10)assert.equal(r.status,429);}assert.equal(calls,10);});
test('expired admin session is rejected',async()=>{const e=env(),c='__Host-gaming_admin='+await seal({login:'owner',expires:1},KEY,'admin-session');assert.equal((await route(req('','GET',null,c),e,context)).status,401);});
test('public response strips identity IDs, credentials, sync errors and warnings',async()=>{const e=env();await saved(e);const d=await publicProfile(e),body=JSON.stringify(d);assert.ok(!body.includes('credential'));assert.ok(!body.includes('76561198000000000'));assert.ok(!body.includes('accountId'));assert.equal(d.accounts[0].minutes,10);});
test('admin listing includes six platforms and timestamps but never credentials',async()=>{const e=env();await saved(e);const d=await(await route(req('','GET',null,await cookie(e)),e,context)).json();assert.equal(d.accounts.length,6);assert.ok(d.accounts.find(a=>a.platform==='steam').bound_at);assert.ok(!JSON.stringify(d).includes('credential'));});
test('binding state is encrypted, expires and cannot be reused',async()=>{const e=env(),c=await cookie(e);const d=await(await route(req('/bind/nintendo','POST',{},c),e,context)).json();const state=await e.DB.prepare('SELECT * FROM gaming_auth_states WHERE id=?').bind(d.state).first();assert.ok(state.verifier.startsWith('v1.'));assert.ok(state.expires_at>Date.now());const input=`npf5c38e31cd085304b://auth#state=${d.state}&session_token_code=code`;let calls=0;const fetcher=async()=>{calls++;return new Response('{}',{status:401});};await assert.rejects(route(req('/complete/nintendo','POST',{state:d.state,input},c),e,context,fetcher));const reused=await route(req('/complete/nintendo','POST',{state:d.state,input},c),e,context,fetcher);assert.equal(reused.status,400);assert.equal(calls,1);});
test('Steam private library is not mistaken for a genuinely empty library',async()=>{await assert.rejects(collect('steam',{steamid:'id'},env(),async()=>json({response:{}})),/STEAM_LIBRARY_PRIVATE/);const d=await collect('steam',{steamid:'id'},env(),async url=>json(url.includes('GetOwnedGames')?{response:{game_count:0}}:{response:{players:[{personaname:'M'}]}}));assert.equal(d.games,0);});
test('upstream failure retains public cache and previous success timestamp',async()=>{const e=env();await saved(e);const r=await syncAccount('steam',e,async()=>new Response('private secret body',{status:403}));assert.equal(r.status,'failed');const row=await e.DB.prepare('SELECT * FROM gaming_accounts').first();assert.equal(row.status,'error');assert.equal(row.last_success_at,'2026-10-01T00:00:00Z');assert.equal(JSON.parse(row.public_json).games,2);assert.equal(row.sync_lock_until,0);assert.equal(row.error_code,'UPSTREAM_HTTP_403');});
test('successful sync updates timestamp, count and history',async()=>{const e=env();await saved(e);await syncAccount('steam',e,async url=>json(url.includes('GetOwnedGames')?{response:{game_count:1,games:[{appid:1,name:'Game',playtime_forever:228,rtime_last_played:1791000000}]}}:{response:{players:[{personaname:'M'}]}}));const row=await e.DB.prepare('SELECT * FROM gaming_accounts').first();assert.equal(row.status,'connected');assert.equal(JSON.parse(row.public_json).minutes,228);assert.notEqual(row.last_success_at,'2026-10-01T00:00:00Z');assert.equal((await e.DB.prepare('SELECT * FROM gaming_sync_runs').first()).status,'success');});
test('active synchronization lease blocks duplicates',async()=>{const e=env();await saved(e);await e.DB.prepare('UPDATE gaming_accounts SET sync_lock_until=?').bind(Date.now()+30000).run();let calls=0;assert.equal((await syncAccount('steam',e,async()=>{calls++;})).status,'busy');assert.equal(calls,0);});
test('disconnect removes credentials, cache and history',async()=>{const e=env();await saved(e);await route(req('/disconnect/steam','POST',{},await cookie(e)),e,context);assert.equal(await e.DB.prepare('SELECT * FROM gaming_accounts').first(),null);assert.equal((await publicProfile(e)).accounts.length,0);});
test('unknown upstream errors are redacted',()=>{assert.equal(errorCode(Error('refresh_token=SECRET')),'SYNC_FAILED');});
test('canonical Xbox callback routes through protected account controller',async()=>{const r=await worker.fetch(new Request(SITE+'/api/auth/xbox/callback?code=secret&state=bad'),env(),context);assert.equal(r.status,401);assert.ok(!(await r.text()).includes('secret'));});
test('GOG and Epic lack of playtime is explicitly represented, not synthesized',async()=>{
  const e=env();const gog=await collect('gog',{access_token:'t'},e,async url=>json(url.includes('userData')?{userId:'1',username:'M'}:{owned:[1,1,2]}));assert.equal(gog.games,2);assert.equal(gog.minutes,undefined);assert.deepEqual(gog.recent,[]);
  const epic=await collect('epic',{access_token:'t',account_id:'1'},e,async()=>json({records:[{appName:'one'},{appName:'one'}],responseMetadata:{}}));assert.equal(epic.games,1);assert.equal(epic.minutes,undefined);
});
test('Steam key configuration is owner-only, encrypted and never returned to frontend',async()=>{
 const e=env();delete e.STEAM_API_KEY;const key='a'.repeat(32),auth=await cookie(e);
 assert.equal((await route(req('/configuration/steam','POST',{apiKey:key}),e,context)).status,401);
 assert.equal((await route(req('/configuration/steam','POST',{apiKey:'bad'},auth),e,context)).status,400);
 assert.equal((await route(req('/configuration/steam','POST',{apiKey:key},auth),e,context)).status,200);
 const stored=await e.DB.prepare('SELECT value FROM gaming_configuration WHERE name=?').bind('STEAM_API_KEY').first();
 assert.ok(!stored.value.includes(key));assert.equal((await providerEnv(e)).STEAM_API_KEY,key);
 const listing=await(await route(req('','GET',undefined,auth),e,context)).json();assert.deepEqual(listing.accounts.find(a=>a.platform==='steam').missing,[]);
 assert.ok(!JSON.stringify(listing).includes(key));assert.ok(!JSON.stringify(await publicProfile(e)).includes(key));
});


test('Xbox fresh authorization does not immediately rotate its refresh token',async()=>{
 const {renew}=await import('./providers.js');const c={access_token:'a',xsts:'x',expiresAt:Date.now()+3600000,xstsExpiresAt:Date.now()+3600000};let calls=0;assert.equal(await renew('xbox',c,env(),async()=>{calls++;}),c);assert.equal(calls,0);
});
test('Sony redirect with or without trailing slash extracts the authorization code',async()=>{
 const {psnLogin}=await import('./psn.js');for(const slash of ['', '/']){let calls=0;const c=await psnLogin('fixture',async(url,options)=>{calls++;if(url.includes('authorize'))return new Response(null,{status:302,headers:{Location:'com.scee.psxandroid.scecompcall://redirect'+slash+'?code=valid'}});assert.equal(new URLSearchParams(options.body).get('code'),'valid');return json({access_token:'a',refresh_token:'r',expires_in:3600});});assert.equal(c.accessToken,'a');assert.equal(calls,2);}
});
test('Sony invalid authorization/token results have separate redacted errors',async()=>{
 const {psnLogin}=await import('./psn.js');await assert.rejects(psnLogin('fixture',async()=>json({error:'secret'})),/PSN_AUTHORIZE_FAILED/);await assert.rejects(psnLogin('fixture',async url=>url.includes('authorize')?new Response(null,{status:302,headers:{Location:'com.scee.psxandroid.scecompcall://redirect?code=x'}}):json({error:'secret'})),/PSN_TOKEN_FAILED/);
});
test('Sony history uses bounded native requests and stable authenticated identity',async()=>{
 const d=await collect('psn',{accessToken:'a',accountId:'123'},env(),async url=>json(url.includes('gamelist')?{titles:[{titleId:'g',name:'Game',playDuration:'PT1H',lastPlayedDateTime:'2026-10-01T00:00:00Z'}],totalItemCount:1}:{onlineId:'Member'}));assert.equal(d.accountId,'123');assert.equal(d.minutes,60);
});
test('Steam enriches only recent six achievements and optional failures preserve library',async()=>{
 let requests=0;const games=Array.from({length:10},(_,i)=>({appid:i+1,name:'Game',playtime_forever:1,rtime_last_played:1791000000+i}));const d=await collect('steam',{steamid:'id'},env(),async url=>{if(url.includes('GetPlayerAchievements')){requests++;return json({playerstats:{success:true,achievements:[{achieved:1},{achieved:0}]}});}return json(url.includes('GetOwnedGames')?{response:{game_count:10,games}}:{response:{players:[{personaname:'M'}]}});});assert.equal(requests,6);assert.equal(d.games,10);assert.equal(d.recent[0].earned,1);assert.equal(d.recent[0].total,2);
});
test('Epic playtime uses artifact IDs and seconds, never acquisition dates',async()=>{
 const {epicSnapshot}=await import('./providers.js');const d=epicSnapshot([{appName:'game',metadata:{title:'Game'},acquisitionDate:'2026-10-10'}],[{artifactId:'game',totalTime:3600,lastPlayed:'2026-10-01T00:00:00Z'}],{account_id:'1',displayName:'M'});assert.equal(d.minutes,60);assert.equal(d.recent.length,1);assert.equal(d.recent[0].title,'Game');assert.equal(epicSnapshot([{appName:'game'}],[],{account_id:'1'}).recent.length,0);
});
test('Xbox HTTP failures return to admin with stage, never echo authorization code',async()=>{
 const e=env(),c=await cookie(e);const d=await(await route(req('/bind/xbox','POST',{},c),e,context)).json();const r=await route(new Request(SITE+'/api/auth/xbox/callback?state='+d.state+'&code=private-code',{headers:{Cookie:c}}),e,context,async()=>new Response('private secret response',{status:400}));assert.equal(r.status,303);assert.match(r.headers.get('Location'),/error=XBOX_TOKEN_UPSTREAM_HTTP_400/);assert.ok(!r.headers.get('Location').includes('private'));assert.equal((await e.DB.prepare('SELECT * FROM gaming_sync_runs').first()).error_code,'XBOX_TOKEN_UPSTREAM_HTTP_400');
});
test('assisted binding failure records history and keeps previous binding',async()=>{
 const e=env(),c=await cookie(e);await saved(e);const d=await(await route(req('/bind/psn','POST',{},c),e,context)).json();await assert.rejects(route(req('/complete/psn','POST',{state:d.state,input:'a'.repeat(64)},c),e,context,async()=>json({})));assert.equal((await e.DB.prepare('SELECT * FROM gaming_sync_runs').first()).status,'failed');assert.equal((await e.DB.prepare('SELECT * FROM gaming_accounts').first()).platform,'steam');
});

test('Xbox title history includes required locale and correct service contract',async()=>{
 const d=await collect('xbox',{xuid:'123',userHash:'hash',xsts:'ticket'},env(),async(url,options)=>{assert.equal(options.headers['Accept-Language'],'en-US');assert.equal(options.headers['x-xbl-contract-version'],'2');if(url.includes('titlehub'))return json({titles:[{titleId:'one',name:'Game',titleHistory:{lastTimePlayed:'2026-10-01T00:00:00Z'}}]});return json({profileUsers:[{settings:[{id:'Gamertag',value:'Member'}]}]});});assert.equal(d.games,1);assert.equal(d.displayName,'Member');
});

test('PS profile uses numeric token identity and unwraps profile response',async()=>{
 const calls=[];const data=await collect('psn',{accessToken:'a',accountId:'123'},env(),async url=>{calls.push(url);if(url.includes('gamelist'))return json({titles:[],totalItemCount:0});if(url.includes('/users/me/profiles'))return new Response('{}',{status:400});assert.ok(url.endsWith('/users/123/profiles'));return json({profile:{onlineId:'Member'}});});assert.equal(data.displayName,'Member');assert.equal(data.accountId,'123');assert.equal(calls.length,2);
});
test('PS missing identity fails before calling a guessed profile',async()=>{
 let calls=0;await assert.rejects(collect('psn',{accessToken:'a'},env(),async()=>{calls++;return json({});}),/PSN_IDENTITY_FAILED/);assert.equal(calls,0);
});
test('PS first data failure retains encrypted verified authorization for retry',async()=>{
 const e=env(),c=await cookie(e);const binding=await(await route(req('/bind/psn','POST',{},c),e,context)).json();
 const jwt='header.'+b64(new TextEncoder().encode(JSON.stringify({sub:'123'})))+'.signature';
 const fetcher=async url=>{if(url.includes('/authorize?'))return new Response(null,{status:302,headers:{Location:'com.scee.psxandroid.scecompcall://redirect?code=test'}});if(url.endsWith('/token'))return json({access_token:jwt,refresh_token:'fixture-refresh',expires_in:3600});if(url.includes('gamelist'))return json({titles:[],totalItemCount:0});return new Response('{}',{status:400});};
 await assert.rejects(route(req('/complete/psn','POST',{state:binding.state,input:'a'.repeat(64)},c),e,context,fetcher),/PSN_PROFILE_UPSTREAM_HTTP_400/);
 const row=await e.DB.prepare('SELECT * FROM gaming_accounts WHERE platform=?').bind('psn').first();assert.equal(row.account_id,'123');assert.equal(row.status,'error');assert.equal(row.public_json,null);assert.ok(!row.credential.includes('fixture-refresh'));assert.equal((await open(row.credential,KEY,'account:psn')).refreshToken,'fixture-refresh');
 const result=await syncAccount('psn',e,async url=>json(url.includes('gamelist')?{titles:[],totalItemCount:0}:{profile:{onlineId:'Member'}}));assert.equal(result.status,'success');assert.equal((await e.DB.prepare('SELECT * FROM gaming_accounts WHERE platform=?').bind('psn').first()).status,'connected');
});

 test('Nintendo history sends locale and never requests the retired origin',async()=>{
  const calls=[];const d=await collect('nintendo',{access_token:'access',id_token:'identity'},env(),async(url,o)=>{
    calls.push(url);if(url.includes('api.accounts'))return json({id:'n-account',nickname:'Player'});
    assert.equal(new Headers(o.headers).get('Gentry-Locale'),'ja-JP');assert.equal(new Headers(o.headers).get('Accept'),'application/json');
    assert.equal(url,'https://app-api.znej.nintendo.com/api/v2.0/users/me/play_histories');
    return json({playHistories:[{titleId:'1',titleName:'Game',totalPlayedMinutes:120,lastPlayedAt:'2026-10-10T00:00:00Z'}]});
  });assert.equal(d.minutes,120);assert.equal(d.games,1);assert.equal(calls.length,2);
 });
 test('Nintendo retries rejected access token once with ID token',async()=>{
  const tokens=[];const d=await collect('nintendo',{access_token:'access',id_token:'identity'},env(),async(url,o)=>{
    if(url.includes('api.accounts'))return json({id:'account'});
    const token=new Headers(o.headers).get('Authorization');tokens.push(token);
    return token==='Bearer access'?new Response('{}',{status:401}):json({playHistories:[]});
  });assert.deepEqual(tokens,['Bearer access','Bearer identity']);assert.equal(d.games,0);
 });
 test('Nintendo history outages retain verified identity and a redacted stage error without retry',async()=>{
  let calls=0;await assert.rejects(collect('nintendo',{access_token:'a',id_token:'b'},env(),async url=>{
    calls++;return url.includes('api.accounts')?json({id:'verified',nickname:'Member'}):new Response('private',{status:530});
  }),e=>e.message==='NINTENDO_HISTORY_UPSTREAM_HTTP_530'&&e.verifiedNintendoIdentity.id==='verified');assert.equal(calls,2);
  assert.equal(errorCode(Error('NINTENDO_HISTORY_UPSTREAM_HTTP_530')),'NINTENDO_HISTORY_UPSTREAM_HTTP_530');
 });
 test('Nintendo verified binding survives history failure and later sync succeeds',async()=>{
  const e=env(),c=await cookie(e);const d=await(await route(req('/bind/nintendo','POST',{},c),e,context)).json();
  const input=`npf5c38e31cd085304b://auth#state=${d.state}&session_token_code=fixture`;
  const fetcher=async url=>url.includes('/session_token')?json({session_token:'private-session'}):url.includes('/api/token')?json({access_token:'access',id_token:'identity',expires_in:3600}):url.includes('api.accounts')?json({id:'verified-account',nickname:'Member'}):new Response('{}',{status:503});
  await assert.rejects(route(req('/complete/nintendo','POST',{state:d.state,input},c),e,context,fetcher),/NINTENDO_HISTORY_UPSTREAM_HTTP_503/);
  const row=await e.DB.prepare('SELECT * FROM gaming_accounts WHERE platform=?').bind('nintendo').first();
  assert.equal(row.account_id,'verified-account');assert.equal(row.display_name,'Member');assert.ok(!row.credential.includes('private-session'));assert.equal(row.public_json,null);
  assert.equal((await open(row.credential,KEY,'account:nintendo')).session_token,'private-session');
  const result=await syncAccount('nintendo',e,async(url,o)=>url.includes('play_histories')?json({playHistories:[{titleId:'1',titleName:'Game',totalPlayedMinutes:30,lastPlayedAt:'2026-10-10T00:00:00Z'}]}):fetcher(url,o));
  assert.equal(result.status,'success');const updated=await e.DB.prepare('SELECT * FROM gaming_accounts WHERE platform=?').bind('nintendo').first();assert.equal(JSON.parse(updated.public_json).minutes,30);assert.ok(updated.last_success_at);
 });

test('Xbox batches library playtime beyond the six recent games and sums each SCID once',async()=>{
 const titles=Array.from({length:8},(_,i)=>({titleId:String(i),name:'Game '+i,serviceConfigId:'scid'+i,titleHistory:{lastTimePlayed:`2026-10-${String(i+1).padStart(2,'0')}T00:00:00Z`}}));let batches=0;
 const d=await collect('xbox',{xuid:'owner',userHash:'h',xsts:'t'},env(),async(url,o)=>{
  if(url.includes('titlehub'))return json({titles:[...titles,{...titles[0],titleId:'shared'}]});
  if(url.endsWith('/batch')){batches++;const body=JSON.parse(o.body);assert.equal(body.stats.length,8);assert.deepEqual(body.groups,[]);assert.deepEqual(body.xuids,['owner']);return json({statlistscollection:[{stats:[{xuid:'other',scid:'scid0',name:'MinutesPlayed',value:999},...body.stats.map(x=>({...x,xuid:'owner',value:'60'}))]}]});}
  return json({profileUsers:[{settings:[{id:'Gamertag',value:'Member'}]}]});
 });assert.equal(batches,1);assert.equal(d.minutes,480);assert.equal(d.recent.length,6);assert.equal(d.timeComplete,true);
});
test('GOG paginated owner stats preserve ownership count, minutes and genuine recent dates',async()=>{
 let pages=0;const d=await collect('gog',{access_token:'t'},env(),async url=>{
  if(url.includes('userData'))return json({userId:'owner',username:'Member'});
  if(url.includes('/user/data'))return json({owned:['1','2','dlc']});
  pages++;const page=new URL(url).searchParams.get('page');return json({pages:2,_embedded:{items:[{game:{id:page,title:'Game '+page,url:'/en/game/game_'+page,image:'https://example.com/cover.png'},stats:{owner:{playtime:Number(page)*60,lastSession:`2026-10-0${page}T00:00:00Z`},other:{playtime:999}}}]}});
 });assert.equal(pages,2);assert.equal(d.games,3);assert.equal(d.minutes,180);assert.equal(d.timeComplete,false);assert.equal(d.recent[0].id,'2');assert.equal(d.recent[0].url,'https://www.gog.com/en/game/game_2');
});
test('GOG stats failure never fabricates zero playtime or erases ownership',async()=>{
 const d=await collect('gog',{access_token:'t'},env(),async url=>url.includes('userData')?json({userId:'owner',username:'M'}):url.includes('/user/data')?json({owned:[1,2]}):new Response('{}',{status:403}));assert.equal(d.games,2);assert.equal(d.minutes,undefined);assert.deepEqual(d.recent,[]);
});

test('GOG resolves legacy profile IDs without reading another user stats',async()=>{
 const d=await collect('gog',{access_token:'t'},env(),async url=>{
  if(url.includes('userData'))return json({userId:'legacy',username:'Member'});
  if(url.includes('/user/data'))return json({owned:['1']});
  if(url.includes('/games/stats'))return json({pages:1,_embedded:{items:[{game:{id:'1',title:'Game'},stats:{'12345678901234567':{playtime:248,lastSession:'2026-10-08T00:00:00Z'},other:{playtime:999}}}]}});
  return new Response('window.profilesData.profileUser = {"username":"Member","userId":"12345678901234567"};');
 });assert.equal(d.minutes,248);assert.equal(d.recent.length,1);
});

test('GOG failed time refresh retains previously recorded playtime and recent games',async()=>{
 const e=env();await saved(e,'gog');const credential=await seal({access_token:'a',refresh_token:'r',expiresAt:Date.now()+3600000},KEY,'account:gog');await e.DB.prepare('UPDATE gaming_accounts SET credential=? WHERE platform=?').bind(credential,'gog').run();
 const d=await syncAccount('gog',e,async url=>url.includes('userData')?json({userId:'76561198000000000',username:'Member'}):url.includes('/user/data')?json({owned:[1]}):new Response('{}',{status:403}));assert.equal(d.status,'failed');const row=await e.DB.prepare('SELECT * FROM gaming_accounts WHERE platform=?').bind('gog').first();assert.equal(row.error_code,'PLAYTIME_SYNC_FAILED');assert.equal(JSON.parse(row.public_json).minutes,10);assert.equal(row.last_success_at,'2026-10-01T00:00:00Z');
});

test('store-link endpoints require owner session and validate regional URLs',async()=>{
 const e=env();await saved(e,'xbox');const old=await e.DB.prepare('SELECT public_json FROM gaming_accounts WHERE platform=?').bind('xbox').first();const d=JSON.parse(old.public_json);d.recent=[{id:'1792227428',title:'Game',platform:'xbox'}];await e.DB.prepare('UPDATE gaming_accounts SET public_json=? WHERE platform=?').bind(JSON.stringify(d),'xbox').run();
 assert.equal((await route(req('/store-links/xbox'),e,context)).status,401);
 const c=await cookie(e);assert.equal((await route(req('/store-links/xbox','POST',{gameId:'1792227428',url:'https://evil.invalid/'},c),e,context)).status,400);
 const url='https://www.xbox.com/zh-TW/games/store/game/9N8FQ28Z6QX3';const r=await route(req('/store-links/xbox','POST',{gameId:'1792227428',url},c),e,context);assert.equal(r.status,200);assert.equal((await r.json()).games[0].manual,true);assert.equal((await publicProfile(e)).accounts[0].recent[0].url,url);
 const last=await e.DB.prepare('SELECT last_success_at FROM gaming_accounts WHERE platform=?').bind('xbox').first();assert.equal(last.last_success_at,'2026-10-01T00:00:00Z');
 const reset=await route(req('/store-links/xbox','POST',{gameId:'1792227428',url:''},c),e,context,async u=>json(u.includes('/lookup')?{Products:[]}:{Results:[]}));assert.equal(reset.status,200);assert.equal((await reset.json()).games[0].manual,false);assert.equal((await publicProfile(e)).accounts[0].recent[0].url,undefined);
});
test('link-only refresh keeps account timestamps and rejects cross-origin mutation',async()=>{
 const e=env();await saved(e,'psn');assert.equal((await route(req('/store-links/refresh','POST',{platform:'psn'},await cookie(e),'https://evil.invalid'),e,context)).status,403);const r=await route(req('/store-links/refresh','POST',{platform:'psn'},await cookie(e)),e,context);assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'refreshed',linked:0,total:0});assert.equal((await e.DB.prepare('SELECT last_success_at FROM gaming_accounts WHERE platform=?').bind('psn').first()).last_success_at,'2026-10-01T00:00:00Z');
});
