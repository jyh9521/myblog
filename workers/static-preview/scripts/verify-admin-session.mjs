// Read-only browser acceptance. Uses an existing local GitHub credential in an
// ephemeral browser context; never saves browser storage, tokens or HTTP bodies.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {githubToken} from './github.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const site=process.env.BLOG_SITE||'https://blog.blfy.cc';
const evidence=resolve(process.env.BLOG_EVIDENCE_DIR||resolve(root,'workers/static-preview/.wrangler/admin-session'));
const overlay=process.argv.includes('--local-code'),token=githubToken();
mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
let step='start';
try {
  const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}});
  const paths=new Set(['index.html','resources.html','accounts.html','admin-auth.js','r2-media.js','article-access.js','accounts.js']);
  async function prepare(ctx) {
    if(overlay)await ctx.route(site+'/sveltia/**',route=>{
      const path=new URL(route.request().url()).pathname.replace('/sveltia/','')||'index.html';
      if(paths.has(path))return route.fulfill({body:readFileSync(resolve(root,'public/sveltia',path)),contentType:path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
      return route.continue();
    });
  }
  await prepare(context);
  let exchanges=0,writes=0,referenceRequests=0;
  context.on('request',request=>{
    const u=new URL(request.url());if(u.origin!==site)return;
    if(u.pathname==='/ns/api/accounts/session'&&request.method()==='POST')exchanges++;
    if(u.pathname==='/ns/api/resources/references')referenceRequests++;
    if(u.pathname.startsWith('/ns/api/')&&u.pathname!=='/ns/api/accounts/session'&&!['GET','HEAD','OPTIONS'].includes(request.method()))writes++;
  });
  const cms=await context.newPage();step='CMS login';
  await cms.goto(site+'/sveltia/',{waitUntil:'domcontentloaded',timeout:60000});
  await cms.getByRole('button',{name:'使用访问令牌登录',exact:true}).click({timeout:60000});
  await cms.locator('input').first().fill(token);
  await cms.getByRole('button',{name:'登录',exact:true}).click();
  await cms.waitForFunction(()=>{try{const u=JSON.parse(localStorage.getItem('sveltia-cms.user')||'null');return u?.backendName==='github'&&typeof u.token==='string';}catch{return false;}},{},{timeout:60000});
  const resources=await context.newPage();step='resources';
  await resources.goto(site+'/sveltia/resources.html',{waitUntil:'domcontentloaded'});
  const dialog=resources.getByRole('dialog',{name:'资源库',exact:true});
  const scan=async()=>{
    await dialog.getByRole('button',{name:'扫描未引用图片',exact:true}).click();
    await resources.waitForFunction(()=>document.querySelector('.blog-media-status')?.textContent.startsWith('扫描完成：'),{},{timeout:180000});
    assert.equal(await dialog.locator('input[type=password]').count(),0);
  };
  await scan();assert.equal(exchanges,1);
  step='reopen';await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await resources.getByRole('button',{name:'打开资源库',exact:true}).click();
  await scan();assert.equal(exchanges,1);
  step='expired cookie';await context.clearCookies();await scan();assert.equal(exchanges,2);
  await resources.screenshot({path:resolve(evidence,(overlay?'local':'live')+'-resources.png')});
  const accounts=await context.newPage();step='accounts';
  await accounts.goto(site+'/sveltia/accounts.html',{waitUntil:'domcontentloaded'});
  await accounts.getByRole('button',{name:'退出管理员登录',exact:true}).waitFor({timeout:60000});
  assert.equal(await accounts.locator('#accounts > article').count(),6);
  assert.equal(await accounts.locator('#github-token').count(),0);assert.equal(exchanges,3);
  step='logout';await accounts.getByRole('button',{name:'退出管理员登录',exact:true}).click();
  await accounts.waitForURL(site+'/sveltia/');
  await resources.waitForFunction(()=>!JSON.parse(localStorage.getItem('sveltia-cms.user')||'null')?.token);
  assert.equal((await context.cookies()).filter(c=>c.name==='__Host-gaming_admin').length,0);
  const anonymous=await browser.newContext({locale:'zh-CN'});await prepare(anonymous);
  const guest=await anonymous.newPage();step='anonymous';
  await guest.goto(site+'/sveltia/resources.html',{waitUntil:'domcontentloaded'});
  await guest.getByRole('button',{name:'扫描未引用图片',exact:true}).click();
  await guest.getByText('请先在编辑后台登录，再回来继续操作。',{exact:true}).waitFor();
  assert.equal(await guest.locator('input[type=password]').count(),0);
  assert.equal(writes,0);assert.equal(referenceRequests,4);
  const result={status:'PASS',mode:overlay?'local-code':'live',manualLogins:1,scans:3,referenceRequests,sessionExchanges:exchanges,reopen:'PASS',renewal:'PASS',accounts:'PASS',logout:'PASS',anonymous:'PASS',tokenPrompts:0,writeOperations:writes};
  writeFileSync(resolve(evidence,(overlay?'local':'live')+'-browser.json'),JSON.stringify(result,null,2)+'\n');
  console.log('CMS_SESSION_BROWSER PASS mode='+result.mode+' manualLogins=1 scans=3 reopen=PASS renewal=PASS accounts=PASS logout=PASS anonymous=PASS tokenPrompts=0 writeOperations=0');
} catch(error) {
  console.error('CMS_SESSION_BROWSER FAIL step='+step+' '+String(error.message).replaceAll(token,'<REDACTED>'));process.exitCode=1;
} finally {await browser.close();}
