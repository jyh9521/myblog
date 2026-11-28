const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.MOTION_ORIGIN||'http://127.0.0.1:4173';
(async()=>{const browser=await chromium.launch({headless:true});try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'}),page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));let eventRequests=0;
  page.on('request',request=>{if(request.url().includes('/event-search-index.json'))eventRequests++;});
  await page.goto(origin+'/topics/');await page.getByRole('heading',{name:'专题导读',exact:true}).waitFor();
  await page.getByRole('link',{name:'真名法典 · 汉化与游玩资料',exact:true}).click();await page.getByRole('heading',{name:'推荐阅读顺序'}).waitFor();assert.equal(await page.locator('.topic-reading li').count(),3);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  fs.mkdirSync('reports/content-experience',{recursive:true});await page.screenshot({path:`reports/content-experience/topics-${width}.png`,fullPage:true});
  await page.goto(origin+'/search/?q=QAUniqueEvent');await page.getByRole('searchbox').waitFor();assert.equal(eventRequests,0);
  await page.route('**/event-search-index.json',route=>route.fulfill({json:{version:1,entries:[{id:'genesis:fixture',title:'QAUniqueEvent',series:'Fixture',body:'event body',href:'/chronicles/genesis/#chronology-genesis-event-fixture'}]}}));
  await page.getByRole('checkbox',{name:/同时检索/}).check();await page.getByRole('link',{name:/QAUniqueEvent/}).waitFor();
  await page.getByRole('searchbox').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator(':focus').getAttribute('href'),'/chronicles/genesis/#chronology-genesis-event-fixture');
  await page.getByRole('checkbox',{name:/同时检索/}).uncheck();assert.equal(await page.getByRole('link',{name:/QAUniqueEvent/}).count(),0);
  await page.unroute('**/event-search-index.json');const actual=(await (await page.request.get(origin+'/event-search-index.json')).json()).entries[0];await page.goto(origin+'/search/?q='+encodeURIComponent(actual.title));await page.getByRole('checkbox',{name:/同时检索/}).check();const eventLink=page.locator('.event-results a').filter({hasText:actual.title}).first();await eventLink.click();await page.locator('[id='+JSON.stringify(actual.href.split('#')[1])+']').waitFor();
  await page.goto(origin+'/posts/magna-carta-2-cn/');const copy=page.getByRole('button',{name:'复制段落链接',exact:true}).first();await copy.waitFor();const id=await copy.locator('..').getAttribute('id');await copy.click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),origin+'/posts/magna-carta-2-cn/#'+id);await page.goto(origin+'/posts/magna-carta-2-cn/#'+id);await page.locator('#'+id).waitFor();
  await page.goto(origin+'/sveltia/maintenance.html');await page.getByText(/构建清单：/).waitFor();assert.ok(await page.getByText(/生产完整恢复：尚未验证/).count());
  await page.screenshot({path:`reports/content-experience/maintenance-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await context.close();console.log(`CONTENT_BROWSER width=${width} topics/search-consent/keyboard/paragraph/maintenance PASS`);
 }
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
