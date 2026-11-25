const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=require('playwright');
const origin=process.env.MOTION_ORIGIN||'http://127.0.0.1:4173';
const out=path.resolve(process.env.MOTION_OUTPUT||'reports/sitewide-motion-20261125');
fs.mkdirSync(out,{recursive:true});
const results=[];
async function run(engine,touch){
 const browser=await engines[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch});
 const page=await context.newPage(),errors=[],checks=[],screens=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(name,fn)=>{try{fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}};
 const visit=async p=>{await page.goto(origin+p,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.motion==='ready');await page.waitForTimeout(350);};
 try{
  await visit('/');const article=await page.locator('.m3-feature').getAttribute('href');
  await visit('/games/');const game=await page.locator('.game-shelf-art').first().getAttribute('href');
  await visit('/games/timelines/');const chronicle=await page.locator('.timeline-card-link').first().getAttribute('href');
  const routes=['/','/posts/',article,'/games/',game,'/games/timelines/',chronicle,'/about/','/ns/'];
  for(const route of routes){
   await visit(route);
   const state=await page.evaluate(()=>({title:document.title,h1:!!document.querySelector('h1'),overflow:document.documentElement.scrollWidth-innerWidth}));
   check(route+' content and viewport',()=>{assert.ok(state.h1);assert.ok(state.overflow<=1,`horizontal overflow ${state.overflow}px`);});screens.push({route,...state});
   if(touch){await page.setViewportSize({width:360,height:780});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);check(route+' narrow layout',()=>assert.ok(overflow<=1,`overflow ${overflow}`));await page.setViewportSize({width:390,height:844});}
  }
  await visit(chronicle);
  const disclosure=page.locator('.chronology-spoilers'),summary=disclosure.locator('summary');
  await summary.scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  const collapsed=await disclosure.evaluate(e=>e.getBoundingClientRect().height);
  await disclosure.evaluate(e=>{window.__heights=[];const start=performance.now();const sample=t=>{window.__heights.push({t:t-start,h:e.getBoundingClientRect().height});if(t-start<650)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await summary.click();await page.waitForTimeout(700);
  const expanded=await disclosure.evaluate(e=>e.getBoundingClientRect().height),frames=await page.evaluate(()=>window.__heights);
  check('details visible intermediate heights',()=>assert.ok(frames.filter(f=>f.h>collapsed+1&&f.h<expanded-1).length>=3,JSON.stringify({collapsed,expanded,frames})));
  await summary.click();await page.waitForTimeout(55);await summary.click();await page.waitForTimeout(850);
  const reversed=await disclosure.evaluate(e=>({open:e.open,height:e.getBoundingClientRect().height}));
  check('details reverse to fully open',()=>assert.ok(reversed.open&&Math.abs(reversed.height-expanded)<2));
  await summary.click();await page.waitForTimeout(850);assert.equal(await disclosure.evaluate(e=>e.open),false);
  if(await disclosure.locator('.motion-details-clip').count()){
   const inert=await disclosure.locator('.motion-details-clip').evaluate(e=>e.inert);check('closed details retain browser search',()=>assert.equal(inert,false));
  }
  // Keyboard, external-open and reduced-motion changes must remain native/usable.
  await summary.focus();await page.keyboard.press('Enter');await page.waitForTimeout(850);assert.ok(await disclosure.evaluate(e=>e.open));
  if(await disclosure.locator('.motion-details-content').count()){
   await disclosure.locator('.motion-details-content').evaluate(e=>{const p=document.createElement('p');p.id='motion-resize-fixture';p.textContent='动态内容 '.repeat(200);e.append(p);});
   await page.waitForTimeout(900);const natural=await disclosure.locator('.motion-details-clip').evaluate(e=>({inline:e.style.height,height:e.getBoundingClientRect().height,content:e.firstElementChild.getBoundingClientRect().height}));
   check('dynamic disclosure settles to natural height',()=>{assert.equal(natural.inline,'');assert.ok(Math.abs(natural.height-natural.content)<1);});
   await page.locator('#motion-resize-fixture').evaluate(e=>e.remove());await page.waitForTimeout(900);
  }
  await summary.click();await page.waitForTimeout(40);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(60);assert.equal(await disclosure.evaluate(e=>e.open),false);await page.emulateMedia({reducedMotion:'no-preference'});
  await page.emulateMedia({reducedMotion:'reduce'});await summary.click();
  if(await disclosure.locator('.motion-details-content').count()){
   await disclosure.locator('.motion-details-content').evaluate(e=>{const p=document.createElement('p');p.id='motion-reduced-fixture';p.textContent='减少动态内容 '.repeat(100);e.append(p);});
   await page.waitForTimeout(80);const inline=await disclosure.locator('.motion-details-clip').evaluate(e=>e.style.height);check('reduced motion dynamic resize stays immediate',()=>assert.equal(inline,''));
   await page.locator('#motion-reduced-fixture').evaluate(e=>e.remove());
  }
  await summary.click();await page.emulateMedia({reducedMotion:'no-preference'});
  const minTouch=await page.locator('.chronology-choices button').first().evaluate(e=>e.getBoundingClientRect().height);
  if(touch)check('chronology touch target >=44px',()=>assert.ok(minTouch>=44,`height=${minTouch}`));
  if(touch){const height=await summary.evaluate(e=>e.getBoundingClientRect().height);check('disclosure touch target >=44px',()=>assert.ok(height>=44,`height=${height}`));}
  const opener=page.locator('.chronology-figure-cover .image-open').first();await opener.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const i=document.querySelector('.chronology-figure-cover img');return i?.complete&&i.naturalWidth>0;},{},{timeout:30000});
  await opener.click();await page.waitForTimeout(45);
  const dialog=page.locator('.chronology-image-dialog');
  const entering=await dialog.evaluate(e=>({open:e.open,opacity:+getComputedStyle(e).opacity}));
  check('chronology dialog has entry frames',()=>assert.ok(entering.open&&entering.opacity>0&&entering.opacity<1,JSON.stringify(entering)));
  if(touch){const center=await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2);});check('mobile modal centers in full viewport',()=>assert.ok(center<2,`offset=${center}`));}
  await page.waitForTimeout(700);await page.keyboard.press('Escape');await page.waitForTimeout(45);
  const closing=await dialog.evaluateAll(es=>es.map(e=>({open:e.open,opacity:+getComputedStyle(e).opacity})));
  check('chronology dialog retains exit frames',()=>assert.ok(closing.some(x=>x.open&&x.opacity>0&&x.opacity<1),JSON.stringify(closing)));
  await page.waitForTimeout(850);const restored=await opener.evaluate(e=>e===document.activeElement);check('chronology restores focus',()=>assert.ok(restored));
  await opener.click();await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Escape');await page.waitForTimeout(80);
  assert.equal(await dialog.evaluateAll(es=>es.some(e=>e.open)),false);await page.emulateMedia({reducedMotion:'no-preference'});
  await opener.click();await page.waitForTimeout(700);await dialog.evaluate(e=>e.close());await page.waitForTimeout(100);
  const overflow=await page.evaluate(()=>document.body.style.overflow);check('native close releases body scroll lock',()=>assert.notEqual(overflow,'hidden'));
  // Actual internal link navigation across the other route templates, not goto-only.
  await visit('/');await page.evaluate(()=>window.__sitewideNavigation=true);
  for(const href of ['/posts/','/games/','/games/timelines/',chronicle,'/about/','/ns/']){
   const link=page.locator(`a[href="${href}"]:visible`).first();await link.click();await page.waitForURL('**'+href);await page.waitForTimeout(650);
   const sameDocument=await page.evaluate(()=>window.__sitewideNavigation===true);check('SPA route '+href,()=>assert.ok(sameDocument));
  }
  await visit('/games/');const card=page.locator('.game-shelf-item').first();await card.scrollIntoViewIfNeeded();
  if(touch&&engine==='chromium'){
   const box=await card.boundingBox(),cdp=await context.newCDPSession(page),x=box.x+20,y=Math.min(600,box.y+50);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(90);
   const scale=await card.evaluate(e=>+getComputedStyle(e).scale);check('touch scale response',()=>assert.ok(scale<1));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-130}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(900);
   const settled=await card.evaluate(e=>e.style.scale);check('scroll cancels press and hover',()=>assert.equal(settled,''));
  }else if(!touch){await card.hover();await page.waitForTimeout(700);assert.ok(await card.evaluate(e=>parseFloat(e.style.translate.split(' ').at(-1))< -3));}
  const href=await card.locator('.game-shelf-art').getAttribute('href');await card.locator('.game-shelf-art').click();await page.waitForURL('**'+href);await page.goBack();await page.waitForURL('**/games/**');await page.waitForTimeout(900);
  if(touch){
   await visit(article);await page.locator('.article-cover-viewport .image-open').click();await page.waitForTimeout(700);
   const lightbox=page.locator('.image-lightbox'),count=page.locator('.lightbox-count'),before=await count.textContent();
   assert.ok(Number(before.split('/')[1])>1,'swipe fixture has multiple images');
   await lightbox.dispatchEvent('touchstart',{touches:[{identifier:0,clientX:220,clientY:260}]});
   await lightbox.dispatchEvent('touchend',{changedTouches:[{identifier:0,clientX:140,clientY:520}]});
   const after=await count.textContent();check('vertical swipe intent',()=>assert.equal(after,before));
   await lightbox.dispatchEvent('touchstart',{touches:[{identifier:0,clientX:220,clientY:260}]});
   await lightbox.dispatchEvent('touchcancel');
   await lightbox.dispatchEvent('touchend',{changedTouches:[{identifier:0,clientX:80,clientY:260}]});
   const cancelled=await count.textContent();check('cancelled swipe stays put',()=>assert.equal(cancelled,after));await page.keyboard.press('Escape');
  }
  await page.screenshot({path:path.join(out,engine+(touch?'-touch':'-desktop')+'.png')});
  check('no runtime errors',()=>assert.deepEqual(errors,[]));
  const nojs=await browser.newContext({javaScriptEnabled:false}),np=await nojs.newPage();await np.goto(origin+chronicle,{waitUntil:'domcontentloaded'});
  await np.locator('.chronology-spoilers summary').click();assert.equal(await np.locator('.chronology-spoilers').evaluate(e=>e.open),true);assert.ok(await np.locator('h1').isVisible());await nojs.close();
  const result={engine,touch,routes:screens,checks,errors,disclosure:{collapsed,expanded,frames},dialog:{entering,closing}};results.push(result);
  const failures=checks.filter(x=>!x.pass);console.log(`${engine} ${touch?'touch':'desktop'}: ${failures.length?'FAIL '+failures.map(x=>x.name).join('; '):'PASS'} routes=${routes.length}`);
  if(failures.length)process.exitCode=1;
 }catch(e){results.push({engine,touch,error:e.stack,checks,errors});console.error(engine,touch,e);process.exitCode=1;}finally{await browser.close();}
}
(async()=>{for(const e of (process.env.MOTION_ENGINES||'chromium,firefox,webkit').split(','))for(const t of [false,true])await run(e,t);fs.writeFileSync(path.join(out,'sitewide-results.json'),JSON.stringify(results,null,2));})();
