// Real-browser regression checks. Playwright is a development tool, not a shipped dependency.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engines=require('playwright');
const origin=process.env.MOTION_ORIGIN||'http://127.0.0.1:4173';
const output=path.resolve(process.env.MOTION_OUTPUT||'../motion-system-evidence-20261125');
const results=[];
async function run(engine){
 const browser=await engines[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(engine,'PAGEERROR',e.message);});
 await page.addInitScript(()=>{window.__transitions=[];if(document.startViewTransition){const native=document.startViewTransition.bind(document);document.startViewTransition=update=>{const record={before:[...document.querySelectorAll('[data-motion-cover]')].filter(x=>x.style.viewTransitionName==='article-cover').length};window.__transitions.push(record);const t=native(async()=>{await update();record.after=[...document.querySelectorAll('[data-motion-cover]')].filter(x=>x.style.viewTransitionName==='article-cover').length;});t.ready.then(()=>record.ready=true,e=>record.error=e.name);return t;};}});
 await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.dataset.motion==='ready',{},{timeout:30000});
 const homeTitle=await page.title();assert.ok(homeTitle.includes('伯翎飞云'));
 const source=page.locator('.m3-feature'),href=await source.getAttribute('href');
 await source.click();await page.waitForURL('**'+href);await page.locator('.article-header h1').waitFor();await page.waitForTimeout(800);
 assert.equal(await page.locator('#site-content').evaluate(e=>document.activeElement===e),true);
 let snapshots=await page.evaluate(()=>window.__transitions);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,engine+'-snapshots.json'),JSON.stringify(snapshots,null,2));if(await page.evaluate(()=>!!document.startViewTransition)){
  // A cold route can intentionally exceed the input-suppression budget. Prove
  // that it remains functional, then require a real shared pair on the warm route.
  if(!snapshots.some(x=>x.before===1&&x.after===1&&x.ready)&&snapshots.every(x=>x.error==='AbortError')){
    await page.goBack();await page.waitForURL(origin+'/');await page.waitForTimeout(800);
    await source.click();await page.waitForURL('**'+href);await page.locator('.article-header h1').waitFor();await page.waitForTimeout(800);
    snapshots=await page.evaluate(()=>window.__transitions);fs.writeFileSync(path.join(output,engine+'-snapshots.json'),JSON.stringify(snapshots,null,2));
  }
  assert.ok(snapshots.some(x=>x.before===1&&x.after===1&&x.ready),'shared cover snapshot pair on a ready route');
  assert.ok(!snapshots.some(x=>x.error&&x.error!=='AbortError'),'no unexpected rejected snapshot');
}
 await page.evaluate(()=>scrollTo({top:900,behavior:'instant'}));await page.waitForTimeout(200);
 assert.equal(await page.locator('.reading-progress span').evaluate(e=>e.style.width),'');
 assert.match(await page.locator('.reading-progress span').evaluate(e=>e.style.transform),/scaleX\(0\./);
 // Unmount/reopen during exit, Escape, focus restoration and focus trap.
 const cover=page.locator('.article-cover-viewport button').first();
 if(await cover.count()){
  await cover.click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(60);await cover.click();await page.waitForTimeout(500);assert.equal(await page.getByRole('dialog').count(),1);await page.keyboard.press('Shift+Tab');assert.ok(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)));await page.keyboard.press('Escape');await page.locator('.image-lightbox').waitFor({state:'detached',timeout:1500});assert.equal(await page.locator('.image-lightbox').count(),0);assert.ok(await cover.evaluate(e=>document.activeElement===e));
 }
 const initial=await page.evaluate(()=>document.documentElement.dataset.theme);
 await page.evaluate(()=>{const button=document.querySelector('.theme-toggle');let count=0;return new Promise(resolve=>{const timer=setInterval(()=>{button.click();if(++count===8){clearInterval(timer);resolve();}},25);});});await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),initial);
 // Native pointer input must also reach the live control, not a frozen snapshot.
 await page.locator('.theme-toggle').scrollIntoViewIfNeeded();await page.waitForTimeout(350);
 await page.evaluate(()=>{window.__nativeThemeHits=0;document.addEventListener('click',e=>{if(e.target.closest?.('.theme-toggle'))window.__nativeThemeHits++;},true);});
 const toggle=await page.locator('.theme-toggle').boundingBox();
 for(let i=0;i<6;i++){await page.mouse.click(toggle.x+toggle.width/2,toggle.y+toggle.height/2);await page.waitForTimeout(70);}
 await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__nativeThemeHits),6,'every rapid physical click reaches the theme button');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),initial);
 // Real observer batch: delayed cards must not flash fully visible before starting.
 await page.evaluate(()=>{const host=document.createElement('section');host.id='motion-reveal-fixture';host.style.cssText='position:fixed;top:70vh;left:0;width:90px;z-index:100';for(let i=0;i<5;i++){const card=document.createElement('article');card.className='post-card';card.style.cssText='height:20px;margin:0';host.append(card);}document.body.append(host);});
 await page.waitForFunction(()=>document.querySelector('#motion-reveal-fixture')?.lastElementChild.getAnimations().length>0);
 const delayed=await page.locator('#motion-reveal-fixture').evaluate(e=>{const item=e.lastElementChild,a=item.getAnimations()[0];return {fill:a.effect.getTiming().fill,delay:a.effect.getTiming().delay,time:a.currentTime,opacity:getComputedStyle(item).opacity};});assert.equal(delayed.fill,'backwards');assert.equal(delayed.delay,140);if(delayed.time<delayed.delay)assert.equal(Number(delayed.opacity),0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#motion-reveal-fixture').getAnimations({subtree:true}).every(a=>a.playState!=='running'),{},{timeout:1000});assert.equal(await page.locator('#motion-reveal-fixture').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);await page.locator('#motion-reveal-fixture').evaluate(e=>e.remove());await page.emulateMedia({reducedMotion:'no-preference'});
 // Hover/press retarget and cancel on a live accessibility preference change.
 await page.locator('.theme-toggle').hover();await page.mouse.down();await page.waitForTimeout(80);await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.up();await page.waitForTimeout(100);assert.equal(await page.locator('.theme-toggle').evaluate(e=>e.style.scale),'');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.site-header nav a[href="/posts/"]').click();await page.waitForURL('**/posts/');await page.locator('.archive-search input').fill('zzzz-no-matching-article');await page.getByText('没有找到匹配的文章').waitFor();await page.locator('.search-clear').click();assert.ok(await page.locator('.post-card').count()>0);
 const count=await page.locator('.post-card').count();await page.locator('.tag-filters button').nth(1).click();assert.ok(await page.locator('.post-card').count()<=count);await page.locator('.tag-filters button').first().click();
 await page.locator('.site-header nav').scrollIntoViewIfNeeded();
 const aboutBox=await page.locator('.site-header nav a[href="/about/"]').boundingBox(),gamesBox=await page.locator('.site-header nav a[href="/games/"]').boundingBox();
 await page.mouse.click(aboutBox.x+aboutBox.width/2,aboutBox.y+aboutBox.height/2);await page.waitForTimeout(50);await page.mouse.click(gamesBox.x+gamesBox.width/2,gamesBox.y+gamesBox.height/2);
 await page.waitForURL('**/games/');await page.waitForTimeout(800);assert.equal(await page.locator('[style*="view-transition-name: article-cover"]').count(),0);assert.ok(await page.locator('main').isVisible());
 await page.goBack();await page.waitForTimeout(1000);assert.ok(await page.locator('main').isVisible());
 // Engine without View Transitions still gets functional router/content.
 await page.addInitScript(()=>{Object.defineProperty(document,'startViewTransition',{value:undefined,configurable:true});});
 await page.goto(origin,{waitUntil:'networkidle'});await page.locator('.site-header nav a[href="/posts/"]').click();await page.waitForURL('**/posts/');assert.ok(await page.locator('.archive-search').isVisible());await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(30);assert.equal(await page.locator('#site-content').evaluate(e=>e.getAnimations().filter(a=>a.playState==='running').length),0,'fallback animation cancels live');
 assert.deepEqual(errors,[],'no uncaught runtime errors');await page.screenshot({path:path.join(output,engine+'-archive.png')});
 const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference'}),mp=await mobile.newPage();await mp.goto(origin+href,{waitUntil:'networkidle'});await mp.locator('.toc-toggle').waitFor();
 for(let i=0;i<5;i++){await mp.locator('.toc-toggle').click();await mp.waitForTimeout(45);}await mp.waitForTimeout(350);assert.equal(await mp.locator('.toc-toggle').getAttribute('aria-expanded'),'true');assert.ok(await mp.locator('.post-toc-list').isVisible());await mp.locator('.toc-toggle').click();await mp.waitForTimeout(350);assert.equal(await mp.locator('.toc-disclosure').evaluate(e=>Math.round(e.getBoundingClientRect().height)),0);assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await mp.screenshot({path:path.join(output,engine+'-mobile.png')});
 const nojs=await browser.newContext({javaScriptEnabled:false}),np=await nojs.newPage();await np.goto(origin);assert.ok(await np.locator('h1').isVisible());assert.ok(await np.locator('.post-card').first().isVisible());await np.locator('.post-visual').first().click();assert.ok(await np.locator('.article-header h1').isVisible());
 results.push({engine,version:browser.version(),result:'PASS',sharedTransition:snapshots,checks:['shared cover','route focus','progress transform','dialog reversal/focus','rapid theme','live reduced motion','search/tag','rapid routes/back','no API','touch disclosure','no JS SEO'],errors});
 console.log(engine+': PASS');
 }finally{await browser.close();}
}
(async()=>{fs.mkdirSync(output,{recursive:true});for(const engine of (process.env.MOTION_ENGINES||'chromium,firefox,webkit').split(',')){try{await run(engine);}catch(e){results.push({engine,result:'FAIL',error:String(e.stack)});console.error(engine,e);process.exitCode=1;}}fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));})();
