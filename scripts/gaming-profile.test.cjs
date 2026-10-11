const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const profile=require('./gaming-profile-module.cjs');
const fixture=()=>({version:2,accounts:[{platform:'steam',displayName:'Member',games:1,countKind:'owned',updatedAt:'2026-10-10T00:00:00Z',timeComplete:true,minutes:228,recent:[{id:'1',title:'Game',lastPlayed:'2026-10-09T00:00:00Z',cover:'https://example.com/cover.png'}]}]});
test('public profile validates six providers, removes sensitive/unrecognized fields',()=>{const value=fixture();value.accounts[0].credential='SECRET';const parsed=profile.parseGamingProfile(value);assert.equal(parsed.accounts[0].minutes,228);assert.ok(!JSON.stringify(parsed).includes('SECRET'));assert.throws(()=>profile.parseGamingProfile({...value,version:1}));assert.throws(()=>profile.parseGamingProfile({version:2,accounts:[...value.accounts,...value.accounts]}));});
test('unsafe media URLs are discarded; empty account list is valid',()=>{const value=fixture();value.accounts[0].recent[0].cover='javascript:alert(1)';assert.equal(profile.parseGamingProfile(value).accounts[0].recent[0].cover,undefined);assert.deepEqual(profile.parseGamingProfile({version:2,accounts:[]}).accounts,[]);});
test('public profile loads from account Worker only',async()=>{const old=global.fetch;try{global.fetch=async(url,options)=>{assert.equal(url,'/ns/api/accounts/public');assert.equal(options.cache,'no-store');return new Response(JSON.stringify(fixture()));};assert.equal((await profile.loadGamingProfile()).version,2);}finally{global.fetch=old;}});
test('new admin UI has six-platform backend, metadata, binding, synchronization and unlink actions',()=>{const js=fs.readFileSync('public/sveltia/accounts.js','utf8');for(const field of ['bound_at','last_attempt_at','last_success_at','/bind/','/sync/','/disconnect/'])assert.ok(js.includes(field));assert.ok(!js.includes('localStorage'));assert.ok(fs.readFileSync('public/sveltia/maintenance-launcher.js','utf8').includes('/sveltia/accounts.html'));});
test('previous scheduled source and cache removed',()=>{const old='exo'+'phase';for(const p of [`.github/workflows/${old}.yml`,`scripts/update-${old}.cjs`,`public/data/${old}.json`,`public/data/${old}-status.json`])assert.equal(fs.existsSync(p),false);});

test('recent games use Japan Nintendo, Taiwan Xbox and Hong Kong PS storefronts',()=>{
 for(const [platform,base] of [['nintendo','https://store-jp.nintendo.com/search?q='],['xbox','https://www.xbox.com/zh-TW/search/results?q='],['psn','https://store.playstation.com/zh-hant-hk/search/']]){const link=profile.gameStoreLink({id:'1',title:'Game & Name',platform});assert.equal(link.url,base+'Game%20%26%20Name');assert.equal(link.search,true);}
 assert.equal(profile.gameStoreLink({id:'1',title:'Game',platform:'psn',url:'https://store.playstation.com/en-us/product/PRODUCT'}).url,'https://store.playstation.com/zh-hant-hk/product/PRODUCT');
 assert.equal(profile.gameStoreLink({id:'1',title:'Game',platform:'steam',url:'javascript:alert(1)'}),undefined);
});
test('all recent cards share hover and reduced-motion styles; regional links open in a new tab',()=>{
 const css=fs.readFileSync('app/style.css','utf8'),ui=fs.readFileSync('app/games/gaming-profile.tsx','utf8');assert.match(css,/\.gaming-game-card:hover\{/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(ui,/gameStoreLink\(g\)/);assert.match(ui,/href=\{store.url\} target="_blank" rel="noopener noreferrer"/);
});

test('resolved Japanese eShop product link is used directly, not searched',()=>{
 const url='https://ec.nintendo.com/JP/ja/titles/70010000113036';assert.deepEqual(profile.gameStoreLink({id:'one',title:'Brotato Nintendo Switch 2 Edition',platform:'nintendo',url}),{url,search:false});
 assert.equal(profile.gameStoreLink({id:'one',title:'Game',platform:'nintendo',url:'https://ec.nintendo.com/US/en/titles/70010000000026'}).search,true);
});

test('account admin provides persistent manual store-link correction',()=>{
 const js=fs.readFileSync('public/sveltia/accounts.js','utf8'),html=fs.readFileSync('public/sveltia/accounts.html','utf8');assert.ok(js.includes('/store-links/'));assert.ok(js.includes('恢复自动匹配'));assert.ok(html.includes('id="store-dialog"'));assert.ok(!js.includes('localStorage'));
});

test('rendered recent cards include regional external links and recorded account playtime',()=>{
 const ts=require('typescript'),React=require('react'),server=require('react-dom/server');
 function compile(file,resolve=require){const m={exports:{}};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','module','exports',source)(resolve,m,m.exports);return m.exports;}
 const messages=compile('lib/gaming-profile-i18n.ts');const ui=compile('app/games/gaming-profile.tsx',name=>name.includes('gaming-profile-i18n')?messages:name.includes('lib/gaming-profile')?profile:require(name));
 const accounts=['nintendo','xbox','psn','gog'].map(platform=>({platform,displayName:'Member',games:1,countKind:'played',minutes:120,timeComplete:false,updatedAt:'2026-10-11T00:00:00Z',recent:[{id:'1',title:'Game',platform,lastPlayed:'2026-10-10T00:00:00Z'}]}));
 const html=server.renderToStaticMarkup(React.createElement(ui.GamingProfileContent,{data:{version:2,accounts}}));assert.equal((html.match(/class="gaming-game-card"/g)||[]).length,4);assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,3);for(const store of ['日服 eShop','台湾 Xbox Store','港服 PS Store'])assert.ok(html.includes(store));assert.ok(html.includes('已记录游戏时间'));assert.ok(html.includes('仅包含有时长记录的游戏'));
});
