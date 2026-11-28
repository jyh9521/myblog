// Real pinned CMS and real test-repo backend. All non-local requests are blocked.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const config={load_config_file:false,backend:{name:'test-repo'},locale:'en',media_folder:'uploads',public_folder:'/uploads',collections:[{name:'post',label:'Articles',folder:'content/posts',create:true,fields:[{name:'title',label:'Title',widget:'string'},{name:'body',label:'Body',widget:'markdown',editor_components:['r2-image','multiline-code-block','game-card']}]}]};
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><body><script>window.CMS_MANUAL_INIT=true;</script><script src="/sveltia/admin-auth.js"></script><script src="/sveltia/sveltia-cms-0.256.1-draft-slug.js"></script><script src="/sveltia/r2-media.js"></script><script src="/sveltia/custom.js"></script><script>CMS.init({config:${JSON.stringify(config)}});</script></body></html>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}const file=path.resolve('public','.'+url.pathname);if(!file.startsWith(path.resolve('public')+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin);await page.getByRole('button',{name:'Work with Test Repository'}).click();
  await page.getByRole('button',{name:'Create New Entry'}).first().click(); await page.getByRole('textbox',{name:'Title',exact:true}).fill('Roundtrip fixture');
  await page.getByRole('button',{name:'Edit in Markdown',exact:true}).click();
  const sample='## Fixture heading\n\n7. First item\n8. Second item\n\n![Fixture image](/uploads/fixture.png "Caption")\n\n```js\nconst text = "日本語";\n\n  console.log(text);\n```\n\n[gframe]fixture-game||[/gframe]\n\nFinal paragraph.';
  await page.locator('textarea:visible').fill(sample);
  await page.getByRole('button',{name:'Edit in Markdown',exact:true}).click();
  await page.locator('[contenteditable="true"]:visible').waitFor();
  assert.ok((await page.locator('[contenteditable="true"]:visible').innerText()).includes('First item'));
  await page.getByRole('button',{name:'Edit in Markdown',exact:true}).click();
  const roundtrip=await page.locator('textarea:visible').inputValue();
  assert.equal(roundtrip,sample);
  assert.match(roundtrip,/7\. First item/);assert.match(roundtrip,/8\. Second item/);assert.match(roundtrip,/!\[Fixture image\]\(\/uploads\/fixture.png "Caption"\)/);assert.match(roundtrip,/const text = "日本語";/);
  // Real browser auth/resource adapters with an isolated HTTP failure backend.
  await page.evaluate(()=>localStorage.setItem('sveltia-cms.user',JSON.stringify({backendName:'github',token:'fixture-cms-token-1234567890'})));
  let actions=0,sessions=0,mode='expiry';
  await page.route('**/ns/api/**',route=>{
    if(route.request().url().endsWith('/accounts/session')){sessions++;return route.fulfill({json:{}});}
    actions++;
    if(mode==='expiry'&&actions===1)return route.fulfill({status:401,json:{error:'ADMIN_LOGIN_REQUIRED'}});
    if(mode==='conflict')return route.fulfill({status:409,json:{error:'RESOURCE_CHANGED'}});
    if(mode==='outage')return route.fulfill({status:503,json:{error:'UNAVAILABLE'}});
    return route.fulfill({json:{path:'/uploads/fixture-upload.png'}});
  });
  const upload=()=>page.evaluate(async()=>{try{return{ok:true,result:await BlogResources.upload(new File(['fixture'],'fixture.txt',{type:'text/plain'}))};}catch(error){return{ok:false,status:error.status};}});
  assert.equal((await upload()).ok,true);assert.equal(actions,2);assert.equal(sessions,2);
  for(const [next,status] of [['conflict',409],['outage',503]]){mode=next;const before=actions;assert.equal((await upload()).status,status);assert.equal(actions,before+1);assert.equal(await page.locator('textarea:visible').inputValue(),roundtrip);}
  await page.evaluate(()=>localStorage.removeItem('sveltia-cms.user'));
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>!document.body.innerText.includes('Saving…'));await page.waitForFunction(()=>!document.body.innerText.includes('Creating ⁨Articles⁩'),null,{timeout:15000});await page.waitForURL('**/#/collections/post');await page.getByText('Roundtrip fixture',{exact:true}).dblclick();await page.getByRole('textbox',{name:'Title',exact:true}).waitFor();await page.getByRole('button',{name:'Edit in Markdown',exact:true}).click();assert.equal(await page.locator('textarea:visible').inputValue(),roundtrip);console.log('EDITOR_BROWSER PASS: real pinned CMS Markdown/rich-text/list/code/image/game-card/save/reopen/auth-expiry/upload-503/conflict-409; isolated OPFS');
  fs.mkdirSync('reports/editor-browser',{recursive:true});await page.screenshot({path:'reports/editor-browser/reopened.png'});
  assert.equal(errors.length,0,errors.join('\n'));
}catch(error){console.log('FAILURE STATE',page.url(),await page.locator('body').innerText());throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
