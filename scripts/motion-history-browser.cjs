const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),engines=require('playwright');
const origin=process.env.MOTION_ORIGIN||'http://127.0.0.1:4173',out=path.resolve(process.env.MOTION_OUTPUT||'reports/sitewide-motion-20261125/history');fs.mkdirSync(out,{recursive:true});
(async()=>{const results=[];for(const engine of (process.env.MOTION_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await engines[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,...(engine==='firefox'?{}:{isMobile:true})});
  await page.goto(origin+'/games/',{waitUntil:'networkidle'});await page.waitForTimeout(700);
  const card=page.locator('.game-shelf-item').nth(2),link=card.locator('.game-platform-link');
  await link.scrollIntoViewIfNeeded();await page.waitForTimeout(500);
  const before=await card.evaluate(e=>({top:e.getBoundingClientRect().top,y:scrollY,slug:e.dataset.gameSlug}));
  const href=await link.getAttribute('href');await link.tap();await page.waitForURL('**'+href);await page.waitForTimeout(700);
  await page.goBack();await page.waitForURL('**/games/**');await card.waitFor();await page.waitForTimeout(1200);
  const after=await card.evaluate(e=>({top:e.getBoundingClientRect().top,y:scrollY,slug:e.dataset.gameSlug}));
  const delta=after.top-before.top;results.push({engine,before,after,delta});assert.equal(after.slug,before.slug);assert.ok(Math.abs(delta)<3,`${engine} history position drift=${delta}px`);
  console.log(`${engine}: HISTORY_POSITION PASS delta=${delta.toFixed(3)}px`);
 }catch(e){results.push({engine,error:String(e)});console.error(String(e));process.exitCode=1;}finally{await browser.close();}
}fs.writeFileSync(path.join(out,'history-results.json'),JSON.stringify(results,null,2));})();
