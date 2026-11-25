// Real history traversal: preserve the restored list viewport AND reverse the cover.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),engines=require('playwright');
const origin=process.env.MOTION_ORIGIN||'http://127.0.0.1:4173';
const out=path.resolve(process.env.MOTION_OUTPUT||'reports/return-motion-20261125/browser');fs.mkdirSync(out,{recursive:true});
(async()=>{const results=[];for(const engine of (process.env.MOTION_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await engines[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{for(const scenario of (process.env.MOTION_CASES||'desktop,hover,mobile,home,no-api,reduced,interrupt,rapid,offscreen').split(',')){
  const mobile=!['desktop','hover'].includes(scenario);
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,...(engine==='firefox'?{}:{isMobile:mobile}),recordVideo:{dir:out}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  if(scenario==='reduced')await page.emulateMedia({reducedMotion:'reduce'});
  if(scenario==='no-api')await page.addInitScript(()=>{document.startViewTransition=undefined;});
  const listPath=scenario==='home'?'/':'/posts/';
  await page.goto(origin+listPath,{waitUntil:'networkidle'});await page.waitForTimeout(750);
  const featured=scenario==='home'?await page.locator('.m3-feature [data-motion-cover]').getAttribute('data-motion-cover'):null;
  const card=scenario==='home'?page.locator('.post-card').filter({has:page.locator(`[data-motion-cover="${featured}"]`)}):page.locator('.post-card').filter({has:page.locator('[data-motion-cover]')}).nth(2),image=card.locator('[data-motion-cover]');
  await image.scrollIntoViewIfNeeded();await page.waitForTimeout(650);
  const before=await image.evaluate(e=>({top:e.getBoundingClientRect().top,y:scrollY,slug:e.dataset.motionCover}));
  await card.locator('a').first().click();await page.waitForURL('**/posts/'+before.slug+'/');await page.waitForTimeout(800);
  const hero=page.locator('[data-motion-cover]').first();await hero.scrollIntoViewIfNeeded();await page.waitForTimeout(450);
  const source=await hero.locator('img').boundingBox();
  if(scenario==='offscreen'){await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await page.waitForTimeout(150);}
  await page.evaluate(()=>{window.addEventListener('popstate',e=>{const el=document.querySelector('[data-motion-cover]'),img=el?.matches('img')?el:el?.querySelector('img');window.__pop={ua:e.hasUAVisualTransition,rect:el?.getBoundingClientRect().toJSON(),loaded:img?.complete,layer:document.querySelector('[data-motion-return]')?.outerHTML};},{once:true});});
  await page.evaluate(()=>{window.__returnFrames=[];let count=0;function sample(){const e=document.querySelector('[data-motion-return]');window.__returnFrames.push({t:performance.now(),phase:e?.getAttribute('data-motion-return'),rect:e?JSON.parse(JSON.stringify(e.getBoundingClientRect())):null,hidden:[...document.querySelectorAll('[data-motion-cover]')].filter(e=>e.style.visibility==='hidden').length,mainOpacity:getComputedStyle(document.getElementById('site-content')).opacity});if(++count<110)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  await page.goBack();await page.waitForURL(origin+listPath);if(scenario!=='hover')await page.mouse.move(0,0);
  if(scenario==='interrupt'){await page.waitForTimeout(100);await page.touchscreen.tap(5,400);}
  if(scenario==='rapid'){await page.waitForTimeout(100);await page.goForward();await page.waitForURL('**/posts/'+before.slug+'/');await page.waitForTimeout(100);await page.goBack();await page.waitForURL(origin+listPath);}
  await page.waitForTimeout(1800);
  const after=await image.evaluate(e=>({top:e.getBoundingClientRect().top,y:scrollY,slug:e.dataset.motionCover}));
  const frames=await page.evaluate(()=>window.__returnFrames),active=frames.filter(f=>f.phase==='moving');
  await page.screenshot({path:path.join(out,`${engine}-${scenario}-returned.png`)});
  const pop=await page.evaluate(()=>window.__pop);
  const clean=await page.evaluate(()=>({hidden:[...document.querySelectorAll('[data-motion-cover]')].filter(e=>e.style.visibility==='hidden').length,overlays:document.querySelectorAll('[data-motion-return]').length,scrollBehavior:document.documentElement.style.scrollBehavior}));
  const result={engine,scenario,mobile,before,source,after,delta:after.top-before.top,movingFrames:active.length,pop,frames,errors,clean,video:await page.video().path()};results.push(result);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  await context.close();
  assert.ok(Math.abs(scenario==='hover'?after.y-before.y:result.delta)<3,`list position drift ${result.delta}px`);
  if(['reduced','offscreen'].includes(scenario)){assert.equal(active.length,0,'no invented/disabled cover animation');}
  else {assert.ok(active.length>=3,`reverse cover missing: ${active.length} moving frames`);assert.ok(new Set(active.map(f=>[f.rect.x,f.rect.y,f.rect.width,f.rect.height].map(Math.round).join(','))).size>2,'cover must travel, not just fade');}
  const captured=frames.find(f=>f.phase==='captured');if(captured&&scenario!=='offscreen')for(const key of ['x','y','width','height'])assert.ok(Math.abs(captured.rect[key]-source[key])<1,`source ${key} jumps`);
  assert.equal(frames.at(-1).hidden,0,'destination revealed after settling');assert.equal(frames.at(-1).phase,undefined,'overlay removed');assert.deepEqual(errors,[]);
  assert.deepEqual(clean,{hidden:0,overlays:0,scrollBehavior:''});
  console.log(`${engine} ${scenario}: RETURN_COVER PASS delta=${result.delta.toFixed(3)}px frames=${active.length}`);
 }}catch(e){results.push({engine,error:String(e)});console.error(`${engine}: ${e}`);process.exitCode=1;}finally{await browser.close();}
}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));})();
