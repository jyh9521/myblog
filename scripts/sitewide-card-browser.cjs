// Verify actual non-home card families, not just their shared selector/model.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),engines=require('playwright');
const origin=process.env.MOTION_ORIGIN||'http://127.0.0.1:4173',out=path.resolve(process.env.MOTION_OUTPUT||'reports/sitewide-motion-20261125/cards');fs.mkdirSync(out,{recursive:true});
(async()=>{const results=[];for(const engine of (process.env.MOTION_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await engines[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  for(const [route,selector] of [['/posts/','.post-card'],['/games/','.game-shelf-item'],['/games/timelines/','.timeline-directory-card'],['/about/','.social-link-card']]){
   await page.goto(origin+route,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.motion==='ready');
   const card=page.locator(selector).first();await card.scrollIntoViewIfNeeded();await page.mouse.move(2,2);await page.waitForTimeout(800);
   await card.hover();await page.waitForTimeout(700);const hovered=await card.evaluate(e=>({lift:parseFloat(e.style.translate.split(' ').at(-1)),elevation:+e.style.getPropertyValue('--motion-elevation')}));
   assert.ok(hovered.lift< -3&&hovered.elevation>.9,selector+' smooth elevation');
   await page.evaluate(()=>{window.__holdCardClick=e=>e.preventDefault();window.addEventListener('click',window.__holdCardClick,true);});
   await page.mouse.down();await page.waitForTimeout(100);const pressed=await card.evaluate(e=>+getComputedStyle(e).scale);assert.ok(pressed<1,selector+' press feedback');
   await page.mouse.up();await page.mouse.move(2,2);await page.waitForTimeout(900);assert.equal(await card.evaluate(e=>e.style.scale),'');assert.equal(await card.evaluate(e=>e.style.translate),'');
   await page.evaluate(()=>window.removeEventListener('click',window.__holdCardClick,true));results.push({engine,route,selector,hovered,pressed});
  }
  console.log(engine+': SITEWIDE_CARDS PASS post/game/timeline/social');
 }catch(e){results.push({engine,error:String(e)});console.error(e);process.exitCode=1;}finally{await browser.close();}
}fs.writeFileSync(path.join(out,'card-results.json'),JSON.stringify(results,null,2));})();
