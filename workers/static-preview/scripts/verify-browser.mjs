import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {github,githubToken} from './github.mjs';
const worker=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const site=JSON.parse(readFileSync(resolve(worker,'wrangler.jsonc'),'utf8')).vars.SITE_ORIGIN;
const evidence=resolve(worker,'.wrangler/evidence');mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
const results=[];
async function check(name,fn){try{const data=await fn();results.push({name,status:'PASS',...data});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.log('FAIL '+name+' '+e.message);}}
const mode=process.argv[2]||'all';
if(mode!=='--render-only') await check('CMS browser login and save to isolated GitHub branch',async()=>{
  const before=await github('/repos/jyh9521/myblog/git/ref/heads/main');
  const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}});const page=await context.newPage();
  try {
    await page.goto(site+'/sveltia/',{waitUntil:'networkidle',timeout:60000});
    await page.getByRole('button',{name:'使用访问令牌登录',exact:true}).click();
    await page.locator('input').first().fill(githubToken());
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByText('预览站公开文章验证',{exact:true}).waitFor({timeout:30000});
    await page.getByText('预览站公开文章验证',{exact:true}).dblclick();
    await page.locator('textarea').first().waitFor();
    const marker='预览迁移后台保存验证成功。仅测试分支，正式文章保持不变。';
    // Force a meaningful edit on repeat runs without changing the fixture's semantics.
    const next=(await page.locator('textarea').first().inputValue()).endsWith(' ✓')?marker:marker+' ✓';
    await page.locator('textarea').first().fill(next);
    await page.getByRole('button',{name:'保存',exact:true}).click();
    // The success toast is transient; the immutable Git blob is the save evidence.
    let document;
    for(let attempt=0;attempt<15;attempt++) {
      document=await github('/repos/jyh9521/myblog/contents/content/posts/preview-public-check.md?ref=codex/static-assets-preview');
      if(Buffer.from(document.content,'base64').toString('utf8').includes('description: '+next+'\n'))break;
      await page.waitForTimeout(1000);
    }
    assert.ok(Buffer.from(document.content,'base64').toString('utf8').includes('description: '+next+'\n'));
    const after=await github('/repos/jyh9521/myblog/git/ref/heads/main');assert.equal(after.object.sha,before.object.sha);
    await page.screenshot({path:resolve(evidence,'cms-save.png')});
    return {branch:'codex/static-assets-preview',blob:document.sha,mainBefore:before.object.sha,mainAfter:after.object.sha,savedText:next};
  } finally {await context.close();}
});
if(mode!=='--cms-only') {
  await check('production and preview article/game layouts, desktop and mobile',async()=>{
    const paths=['/','/games/','/posts/nolf-cn/'];const rows=[];
    for(const mobile of [false,true])for(const [label,origin] of [['production','https://blog.blfy.cc'],['preview',site]]){
      const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},locale:'zh-CN'});const page=await ctx.newPage();
      try {for(const [i,path] of paths.entries()){
        const errors=[];const handler=e=>errors.push(e.message);page.on('pageerror',handler);
        const r=await page.goto(origin+path,{waitUntil:'networkidle',timeout:60000});assert.equal(r.status(),200);
        assert.ok((await page.locator('main').innerText()).length>100);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false);
        const h1=await page.locator('h1').allTextContents();rows.push({label,mobile,path,h1,errors});assert.equal(errors.length,0);
        await page.screenshot({path:resolve(evidence,`${label}-${mobile?'mobile':'desktop'}-${i}.png`)});page.off('pageerror',handler);
      }}finally{await ctx.close();}
    }
    for(const mobile of [false,true])for(const path of paths){const pair=rows.filter(r=>r.path===path&&r.mobile===mobile);assert.deepEqual(pair[0].h1,pair[1].h1);}
    return {pages:rows.length,rows};
  });
  await check('public Unicode image and actual PDF.js canvas rendering',async()=>{
    const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});const page=await ctx.newPage();
    try {
      await page.goto(site+'/posts/preview-public-check/',{waitUntil:'networkidle'});
      await page.getByText('预览迁移后台保存验证成功。仅测试分支，正式文章保持不变。',{exact:false}).first().waitFor();
      const image=page.getByRole('img',{name:'中文文件名',exact:true});await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.images].some(i=>i.alt==='中文文件名'&&i.complete&&i.naturalWidth>0));
      const frame=page.locator('iframe[title="PDF 阅读器：预览测试 PDF"]');await frame.scrollIntoViewIfNeeded();
      const viewer=page.frameLocator('iframe[title="PDF 阅读器：预览测试 PDF"]');
      await viewer.locator('.page[data-page-number="1"] canvas').waitFor({timeout:30000});
      await viewer.getByText('Static Assets Preview PDF',{exact:true}).waitFor({timeout:30000});
      await page.screenshot({path:resolve(evidence,'public-pdf-render.png')});
      return {pdfPages:1,renderedText:'Static Assets Preview PDF',unicodeImage:'loaded'};
    }finally{await ctx.close();}
  });
  await check('password article actual React unlock and reload',async()=>{
    const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});const page=await ctx.newPage();
    try {
      await page.goto(site+'/posts/preview-protected-check/',{waitUntil:'domcontentloaded',timeout:60000});
      await page.getByLabel('文章密码').fill('preview-validation-2026');
      await page.getByRole('button',{name:'解锁文章 →',exact:true}).click();
      await page.getByText('独立数据库验证成功。',{exact:true}).waitFor({timeout:30000});
      await page.reload({waitUntil:'domcontentloaded'});await page.getByText('独立数据库验证成功。',{exact:true}).waitFor();
      const html=await (await fetch(site+'/posts/preview-protected-check/')).text();assert.ok(!html.includes('独立数据库验证成功。'));
      await page.screenshot({path:resolve(evidence,'private-unlocked.png')});
      const fixture=JSON.parse(readFileSync(resolve(evidence,'private-fixture.json'),'utf8'));
      await page.goto(site+'/pdfjs/web/viewer.html?file='+encodeURIComponent(fixture.asset),{waitUntil:'networkidle'});
      await page.locator('.page[data-page-number="1"] canvas').waitFor({timeout:30000});
      await page.getByText('Static Assets Preview PDF',{exact:true}).waitFor({timeout:30000});
      await page.screenshot({path:resolve(evidence,'private-pdf-render.png')});
      return {unlock:'rendered',reload:'session retained',staticHtml:'no private body',privatePdf:'canvas and text rendered'};
    }finally{await ctx.close();}
  });
  await check('account admin browser login and callback return UI',async()=>{
    const ctx=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});const page=await ctx.newPage();
    try {
      await page.goto(site+'/sveltia/accounts.html',{waitUntil:'networkidle'});await page.getByLabel('GitHub Token',{exact:true}).fill(githubToken());
      await page.getByRole('button',{name:'验证管理员',exact:true}).click();
      await page.getByRole('button',{name:'退出管理员登录',exact:true}).waitFor();assert.equal(await page.locator('#github-token').inputValue(),'');
      await page.goto(site+'/api/auth/steam/callback?state=invalid',{waitUntil:'domcontentloaded'});
      // accounts.js deliberately removes callback query parameters after displaying them.
      await page.getByText('登录结果无效或已过期，请重新连接。',{exact:true}).waitFor();
      assert.equal(new URL(page.url()).origin,site);
      await page.screenshot({path:resolve(evidence,'callback-return.png')});return {login:'admin UI visible',callback:'returns to preview, invalid state rejected'};
    }finally{await ctx.close();}
  });
}
await browser.close();
writeFileSync(resolve(evidence,mode==='--cms-only'?'cms-results.json':'browser-results.json'),JSON.stringify({site,results},null,2));
console.log('BROWSER_RESULT pass='+results.filter(r=>r.status==='PASS').length+' fail='+results.filter(r=>r.status==='FAIL').length);
process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
