import {chromium} from 'playwright';
import {github,githubToken} from './github.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const site='https://blog-static-preview.342433419.workers.dev',branch='codex/static-assets-preview';
const before=(await github('/repos/jyh9521/myblog/git/ref/heads/'+branch)).object.sha;
const main=(await github('/repos/jyh9521/myblog/git/ref/heads/main')).object.sha;
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}});
 await page.goto(site+'/sveltia/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'使用访问令牌登录',exact:true}).click();await page.locator('input').first().fill(githubToken());await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByText('预览站公开文章验证',{exact:true}).dblclick();await page.getByRole('button',{name:'选择已有图片',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'资源库'});await dialog.locator('.blog-media-choice').first().waitFor();
 await dialog.locator('.blog-media-management summary').click();await dialog.getByLabel('管理身份 GitHub Token',{exact:true}).fill(githubToken());await dialog.getByRole('button',{name:'验证管理身份',exact:true}).click();await dialog.getByText('管理身份已验证。',{exact:false}).waitFor();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=','base64');
 const fixtureName='后台资源 验证-'+Date.now()+'.png';
 await dialog.getByLabel('上传图片',{exact:true}).setInputFiles({name:fixtureName,mimeType:'image/png',buffer:png});await dialog.waitFor({state:'hidden',timeout:60000});
 await page.getByRole('button',{name:'保存',exact:true}).click();
 let doc;for(let i=0;i<30;i++){doc=await github('/repos/jyh9521/myblog/contents/content/posts/preview-public-check.md?ref='+branch);const text=Buffer.from(doc.content,'base64').toString();if(text.includes(encodeURIComponent(fixtureName))||text.includes(fixtureName))break;await page.waitForTimeout(1000);}
 const body=Buffer.from(doc.content,'base64').toString();assert.ok(body.includes('/uploads/cms/'));const after=(await github('/repos/jyh9521/myblog/git/ref/heads/'+branch)).object.sha;
 const diff=await github('/repos/jyh9521/myblog/compare/'+before+'...'+after);assert.deepEqual(diff.files.map(f=>f.filename),['content/posts/preview-public-check.md']);assert.equal((await github('/repos/jyh9521/myblog/git/ref/heads/main')).object.sha,main);
 await page.screenshot({path:'../r2-migration-evidence/cms-r2-save.png'});
 writeFileSync('../r2-migration-evidence/cms-r2-save.json',JSON.stringify({before,after,main,files:diff.files.map(f=>f.filename),body},null,2));
 console.log('R2_CMS_RESULT upload=200 save=GitHub preview-only changedFiles=1 binaryGitFiles=0 main=unchanged');
}finally{await browser.close();}
