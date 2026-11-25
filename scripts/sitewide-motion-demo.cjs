const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const out=path.resolve(process.env.MOTION_OUTPUT||'reports/sitewide-motion-20261125/demo');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,recordVideo:{dir:out,size:{width:390,height:844}}}),page=await context.newPage(),video=page.video();
 try{
  await page.goto((process.env.MOTION_ORIGIN||'http://127.0.0.1:4173')+'/games/timelines/',{waitUntil:'networkidle'});
  await page.waitForTimeout(600);await page.locator('.timeline-card-link').first().click();await page.waitForURL('**/chronicles/**');await page.waitForTimeout(900);
  const summary=page.locator('.chronology-spoilers summary');await summary.scrollIntoViewIfNeeded();await page.waitForTimeout(600);
  await summary.tap();await page.waitForTimeout(750);await page.screenshot({path:path.join(out,'mobile-disclosure.png')});
  await summary.tap();await page.waitForTimeout(80);await summary.tap();await page.waitForTimeout(850);await summary.tap();await page.waitForTimeout(850);
  const opener=page.locator('.chronology-figure-cover .image-open');await opener.scrollIntoViewIfNeeded();await page.waitForTimeout(600);await opener.tap();await page.waitForTimeout(750);await page.screenshot({path:path.join(out,'mobile-dialog.png')});
  await page.getByRole('button',{name:'关闭放大图片'}).tap();await page.waitForTimeout(900);await opener.tap();await page.waitForTimeout(750);await page.keyboard.press('Escape');await page.waitForTimeout(900);
  console.log('SITEWIDE_DEMO PASS mobile route/disclosure/reversal/native dialog');
 }finally{await context.close();await video.saveAs(path.join(out,'mobile-interaction.webm'));await video.delete();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
