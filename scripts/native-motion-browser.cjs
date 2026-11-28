// Perceptual evidence: real input, frame samples and a browser-recorded video.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin=process.env.MOTION_ORIGIN||'http://127.0.0.1:4173';
const out=path.resolve(process.env.MOTION_OUTPUT||'reports/native-motion-20261125/modified');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:out,size:{width:1280,height:900}}});
 const page=await context.newPage(),video=page.video(),results=[];
 try {
  await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.dataset.motion==='ready');
  // Pointer marker exists only in the evidence video, never in production code.
  await page.evaluate(()=>{const dot=document.createElement('div');dot.id='evidence-pointer';dot.style.cssText='position:fixed;width:12px;height:12px;border:2px solid #2962ff;border-radius:50%;pointer-events:none;z-index:2147483647;left:-30px;top:-30px';document.body.append(dot);addEventListener('pointermove',e=>{dot.style.left=e.clientX-6+'px';dot.style.top=e.clientY-6+'px';});});
  for(const selector of ['.site-search-trigger','.home-categories a','.m3-feature','.site-header nav a[href="/posts/"]']){
   const target=page.locator(selector).first();await target.scrollIntoViewIfNeeded();await page.mouse.move(5,5);await page.waitForTimeout(450);
   await target.evaluate(e=>{window.__nativeFrames=[];const start=performance.now();const sample=t=>{const s=getComputedStyle(e),before=getComputedStyle(e,'::before'),after=getComputedStyle(e,'::after');window.__nativeFrames.push({time:t-start,scale:s.scale,lift:s.translate,shade:before.opacity,elevation:after.opacity});if(t-start<850)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
   await target.hover();await page.waitForTimeout(900);
   results.push({selector,frames:await page.evaluate(()=>window.__nativeFrames)});
   await target.screenshot({path:path.join(out,'hover-'+results.length+'.png')});
   // Prevent activation for press evidence only; leave native input semantics intact.
   await page.evaluate(()=>{window.__holdEvidenceClick=e=>{e.preventDefault();e.stopImmediatePropagation();};window.addEventListener('click',window.__holdEvidenceClick,true);});
   await target.hover();await page.mouse.down();await page.waitForTimeout(180);await page.mouse.up();await page.waitForTimeout(650);
   for(let i=0;i<4;i++){await page.mouse.move(5,5);await page.waitForTimeout(65);await target.hover();await page.waitForTimeout(65);}
   await page.mouse.move(5,5);await page.waitForTimeout(850);
   await page.evaluate(()=>window.removeEventListener('click',window.__holdEvidenceClick,true));
   results.at(-1).settled=await target.evaluate(e=>({scale:e.style.scale,lift:e.style.translate,shade:e.style.getPropertyValue('--motion-shade')}));
  }
  if(!process.argv.includes('--capture-only')){
   await page.evaluate(()=>{const fixture=document.createElement('section');fixture.id='nested-motion-fixture';fixture.className='game-shelf-item';fixture.style.cssText='position:fixed;top:100px;left:100px;width:300px;height:220px;z-index:9999;background:white;padding:30px';fixture.innerHTML='<button class="game-platform-link" style="margin-top:100px">nested control</button>';document.body.append(fixture);});
   const fixture=page.locator('#nested-motion-fixture'),child=fixture.locator('button');
   await fixture.hover({position:{x:10,y:10}});await page.waitForTimeout(650);
   assert.equal(await child.evaluate(e=>getComputedStyle(e,'::before').opacity),'0','card hover never leaks to its unhovered child');
   await child.hover();await page.waitForTimeout(150);await child.evaluate(e=>{e.disabled=true;});await page.waitForTimeout(50);
   assert.equal(await child.evaluate(e=>getComputedStyle(e,'::before').opacity),'0','disabling a nested control clears its own state');
   assert.equal(await child.evaluate(e=>e.style.scale),'');
   await page.emulateMedia({reducedMotion:'reduce'});await child.hover();
   assert.equal(await child.evaluate(e=>getComputedStyle(e,'::before').opacity),'0','reduced-motion fallback respects disabled');
   await child.evaluate(e=>{e.disabled=false;e.setAttribute('aria-disabled','true');});
   assert.equal(await child.evaluate(e=>getComputedStyle(e,'::before').opacity),'0','ARIA-disabled fallback stays neutral');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await fixture.evaluate(e=>e.remove());
  }
  await page.locator('.m3-feature').click();await page.waitForURL('**/posts/**');await page.waitForTimeout(900);
  const cover=page.locator('.article-cover-viewport button').first();
  if(await cover.count()){
   await cover.click();await page.waitForTimeout(650);
   const arrow=page.locator('.lightbox-arrow').first();
   if(await arrow.count()&&!process.argv.includes('--capture-only')){const before=await arrow.evaluate(e=>getComputedStyle(e).transform);await arrow.hover();await page.waitForTimeout(400);assert.equal(await arrow.evaluate(e=>getComputedStyle(e).transform),before,'hover preserves the arrow layout transform');}
   await page.keyboard.press('Escape');await page.waitForTimeout(650);
  }
  await page.locator('.theme-toggle').scrollIntoViewIfNeeded();
  await page.locator('.theme-toggle').click();await page.waitForTimeout(600);
  await page.locator('.theme-toggle').click();await page.waitForTimeout(600);
  if(!process.argv.includes('--capture-only')){
   for(const {selector,frames,settled} of results){
    assert.ok(frames.some(f=>parseFloat(f.lift.split(' ').at(-1))< -1),selector+' has visible hover lift');
    assert.ok(frames.some(f=>Number(f.scale)>1.005)||selector==='.m3-feature',selector+' has visible hover expansion');
    if(selector!=='.m3-feature')assert.ok(frames.some(f=>f.time<180&&Number(f.shade)>0&&Number(f.shade)<.095),selector+' develops its state layer');
    assert.equal(settled.scale,'');assert.equal(settled.lift,'');assert.equal(settled.shade,'');
   }
   assert.ok(results[0].frames.some(f=>Number(f.elevation)>.8),'soft shadow visibly fades in');
   console.log('NATIVE_MOTION PASS: hover/press/reversal/settlement, route and dialog video');
  }else console.log('NATIVE_MOTION capture complete');
 }finally{
  fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify(results,null,2));
  await context.close();await video.saveAs(path.join(out,'interaction.webm'));await video.delete();await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
