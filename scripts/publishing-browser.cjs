// Isolated fixture only: no production origin, account or CMS writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
assert.ok(fs.existsSync('public/sveltia/publishing-experience.js'),'publishing panel must exist');
const {chromium,firefox,webkit}=require('playwright');
const output=path.resolve('reports/experience-20261128/publishing');
const engine=process.env.PUBLISHING_BROWSER||'chromium';
const sha='a'.repeat(40),old='c'.repeat(40);
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/sveltia/publishing-experience.css"></head><body><h1>CMS isolated fixture</h1><button id="fixture-open" onclick="BlogPublishing.open(this)">发布状态</button><script>window.fixtureHooks={};window.CMS={registerEventListener:({name,handler})=>fixtureHooks[name]=handler};</script><script src="/sveltia/publishing-core.js"></script><script src="/sveltia/publishing-experience.js"></script></body></html>`;
const server=http.createServer((req,res)=>{
 if(req.url==='/sveltia/config.yml'){res.end('backend: fixture\n');return;}
 if(req.url.startsWith('/hosting.json')){res.setHeader('Content-Type','application/json');res.setHeader('X-Blog-Hosting','workers-static-assets');res.end(JSON.stringify({release:sha,files:[{path:'posts/existing/index.html'}]}));return;}
 if(req.url.startsWith('/sveltia/publishing-')){const file=path.join(process.cwd(),'public',req.url.split('?')[0]);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
});
(async()=>{fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;const launch={headless:true,...(process.env.PUBLISHING_EXECUTABLE?{executablePath:process.env.PUBLISHING_EXECUTABLE}:{})};
// Windows WebKit's ephemeral context rejects native File/Blob IDB writes. A
// brand-new disposable persistent profile exercises the normal storage engine.
const profile=engine==='webkit'?fs.mkdtempSync(path.join(output,'fixture-profile-')):null;
const persistent=profile?await webkit.launchPersistentContext(profile,{...launch,viewport:{width:390,height:844},acceptDownloads:true}):null;
const browser=persistent?{newContext:async()=>persistent,close:()=>persistent.close()}:await ({chromium,firefox,webkit}[engine]).launch(launch);
try{
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const page=await context.newPage();const requests=[];let rejectLive=false;
 await page.route('https://api.github.com/**',route=>{requests.push(route.request().url());const url=route.request().url();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.includes('/commits/')?{sha,commit:{message:'fixture saved article',committer:{date:'2026-11-28T00:00:00Z'}}}:url.includes('/jobs')?{jobs:[{name:'build',status:'completed',conclusion:'success',steps:[{name:'Verify primary release',conclusion:'success'}]},{name:'deploy',status:'completed',conclusion:'failure'}]}:{workflow_runs:[{id:1,run_attempt:2,head_sha:sha,status:'completed',conclusion:'failure'}]})});});
 await page.route('**/hosting.json*',route=>rejectLive?route.abort():route.continue());
 await page.goto(origin+'/#/collections/posts');
 const dbResult=await page.evaluate(async()=>{
 const core=BlogPublishingCore,config=await BlogPublishing.configHash();
 const seed=(slug)=>({collectionName:'posts',slug,timestamp:new Date('2026-11-28T00:00:00Z'),cmsConfigVersion:'fixture',currentLocales:{en:true},currentSlugs:{en:slug},currentValues:{en:{body:'![x](blob:pending)'}},files:{'blob:pending':{file:new File([new Uint8Array([0,128,255])],'中文.png',{type:'image/png',lastModified:456}),nameTemplate:{randomValues:new Map([['uuid','test-id']])}}},pendingEntries:[]});
 const empty=await core.readDrafts();
 const exported=await core.exportDrafts([seed('existing')],config);let absentRejected=false;
 try{await core.importDrafts(exported,config)}catch{absentRejected=true}
 if(!absentRejected)throw Error('import must not invent an uninitialized CMS database schema');
 await new Promise((resolve,reject)=>{const request=indexedDB.open(core.DATABASE,1);request.onupgradeneeded=()=>{request.result.createObjectStore(core.STORE,{keyPath:['collectionName','slug']});request.result.createObjectStore('fixture-existing-store')};request.onsuccess=()=>{request.result.close();resolve()};request.onerror=()=>reject(request.error)});
 await core.importDrafts(exported,config);
 const stored=(await core.readDrafts())[0];
 const conflict=await core.exportDrafts([seed('new-first'),seed('existing')],config);let conflictMessage='';try{await core.importDrafts(conflict,config)}catch(error){conflictMessage=error.message}
 const afterConflict=await core.readDrafts();
 const malformed=JSON.parse(exported);malformed.records.push(['bogus']);let malformedRejected=false;try{await core.importDrafts(JSON.stringify(malformed),config)}catch{malformedRejected=true}
 localStorage.setItem('sveltia-cms.user',JSON.stringify({token:'NEVER_EXPORT_FIXTURE_TOKEN'}));
 window.fixtureExport=await core.exportDrafts([seed('imported')],config);
 return {empty:empty.length,storedName:stored.files['blob:pending'].file.name,bytes:[...new Uint8Array(await stored.files['blob:pending'].file.arrayBuffer())],map:stored.files['blob:pending'].nameTemplate.randomValues.get('uuid'),conflictMessage,after:afterConflict.map(r=>r.slug),malformedRejected,secretExcluded:!exported.includes('NEVER_EXPORT_FIXTURE_TOKEN')};
 });
 assert.deepEqual(dbResult,{empty:0,storedName:'中文.png',bytes:[0,128,255],map:'test-id',conflictMessage:'已有同名本地草稿，整批导入已撤销；现有草稿保持不变。',after:['existing'],malformedRejected:true,secretExcluded:true});
 await page.getByRole('button',{name:'发布状态',exact:true}).click();
 await page.getByText('主站：已回读当前 main aaaaaaa',{exact:true}).waitFor();await page.getByText('Pages 回退：此提交失败；不代表主站失败',{exact:true}).waitFor();
 await page.getByText(/本地备份：1 份/).first().waitFor();await page.getByText(/fixture saved article/).waitFor();
 assert.equal(requests.length,3);await page.waitForTimeout(900);assert.equal(requests.length,3,'does not poll network');
 rejectLive=true;await page.getByRole('button',{name:'刷新发布状态',exact:true}).click();await page.getByText(/实时回读待确认/).waitFor();assert.equal(await page.getByText('主站：已回读当前 main aaaaaaa',{exact:true}).count(),0,'stale success cleared');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出本地草稿',exact:true}).click();const download=await downloadPromise;await download.saveAs(path.join(output,'fixture-download-'+engine+'.json'));const downloaded=fs.readFileSync(path.join(output,'fixture-download-'+engine+'.json'),'utf8');assert.ok(!downloaded.includes('NEVER_EXPORT_FIXTURE_TOKEN'));assert.equal(JSON.parse(downloaded).records.length,1);
 const exported=await page.evaluate(()=>fixtureExport);await page.locator('input[type=file]').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:Buffer.from(exported)});await page.getByText(/待导入 1 份/).waitFor();
 assert.equal(await page.evaluate(async()=>(await BlogPublishingCore.readDrafts()).length),1,'selection does not write');
 await page.getByRole('button',{name:'确认合并导入',exact:true}).click();await page.getByText(/已导入 1 份/).waitFor();assert.equal(await page.evaluate(async()=>(await BlogPublishingCore.readDrafts()).length),2);assert.equal(page.url(),origin+'/#/collections/posts','no automatic reload/navigation');
 const choices=await page.evaluate(async()=>{const config=await BlogPublishing.configHash(),draft=(await BlogPublishingCore.readDrafts())[0];return Promise.all(['old-selection','new-selection'].map(slug=>BlogPublishingCore.exportDrafts([{...draft,slug}],config)))});
 let selectionRequests=0;await page.route('**/sveltia/config.yml',async route=>{if(++selectionRequests===1)await new Promise(resolve=>setTimeout(resolve,500));await route.continue()});
 await page.locator('input[type=file]').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(choices[0])});
 await page.waitForFunction(()=>document.querySelector('input[type=file]').files[0].name==='old.json');await page.waitForTimeout(80);
 await page.locator('input[type=file]').setInputFiles({name:'new.json',mimeType:'application/json',buffer:Buffer.from(choices[1])});await page.waitForTimeout(750);
 await page.getByRole('button',{name:'确认合并导入',exact:true}).click();await page.getByText(/已导入 1 份/).waitFor();
 assert.deepEqual(await page.evaluate(async()=>(await BlogPublishingCore.readDrafts()).map(r=>r.slug)),['existing','imported','new-selection'],'late validation must not import an older file selection');
 await page.unroute('**/sveltia/config.yml');
 rejectLive=false;await page.getByRole('button',{name:'刷新发布状态',exact:true}).click();await page.getByText('主站：已回读当前 main aaaaaaa',{exact:true}).waitFor();await page.evaluate(()=>location.hash='#/collections/post/entries/existing');await page.getByRole('link',{name:'查看当前条目的已发布版本',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'查看当前条目的已发布版本',exact:true}).getAttribute('href'),'/posts/existing/');await page.evaluate(()=>location.hash='#/collections/posts/entries/unsaved');await page.waitForTimeout(50);assert.equal(await page.locator('input[type=file]').isDisabled(),true,'open editor blocks import');
 await page.screenshot({path:path.join(output,'fixture-mobile-'+engine+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('#fixture-open').evaluate(el=>el===document.activeElement),true,'dialog returns focus');
 await page.waitForTimeout(1100); // Drain earlier input/hash refreshes before the save-only scenario.
 const lifecycle=await page.evaluate(async()=>{
   const core=BlogPublishingCore;
   await new Promise((resolve,reject)=>{const request=indexedDB.open(core.DATABASE);request.onsuccess=()=>{const db=request.result,tx=db.transaction(core.STORE,'readwrite');tx.objectStore(core.STORE).clear();tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};request.onerror=()=>reject(request.error)});
   fixtureHooks.postSave?.();
   await new Promise(resolve=>setTimeout(resolve,1100));
   const savedBadge=document.querySelector('.blog-draft-status').textContent;
   BlogPublishing.open();const old=document.querySelector('dialog');old.close();BlogPublishing.open();
   await new Promise(resolve=>setTimeout(resolve,100));
   return {savedBadge,open:document.querySelectorAll('dialog[open]').length,stale:document.querySelectorAll('dialog:not([open])').length};
 });
 assert.deepEqual(lifecycle,{savedBadge:'本地备份：当前没有待恢复草稿',open:1,stale:0},'native postSave and deferred close preserve current status/dialog');
 await page.getByText('主站：已回读当前 main aaaaaaa',{exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await context.close();
 console.log('PUBLISHING_BROWSER '+engine+' PASS: real IndexedDB file/Map roundtrip; malformed/conflicting import atomicity; manual import; no credential export; independent primary/fallback; stale clearing; no polling; mobile; focus; native postSave refresh; deferred close/reopen');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(profile&&path.dirname(path.resolve(profile))===output&&path.basename(profile).startsWith('fixture-profile-'))fs.rmSync(profile,{recursive:true,force:true});}})().catch(error=>{console.error(error);server.close();process.exitCode=1});
