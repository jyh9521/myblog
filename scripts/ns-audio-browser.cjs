const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.NS_AUDIO_ORIGIN||'https://blog.blfy.cc';
const out=path.resolve(process.env.NS_AUDIO_OUTPUT||'reports/ns-audio-20261125');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();const states=[];
 await page.addInitScript(()=>{
  window.__audioNodes=[];window.__audioEvents=[];
  const track=node=>{if(!(node instanceof HTMLAudioElement)||window.__audioNodes.includes(node))return;window.__audioNodes.push(node);for(const type of ['play','pause','playing','emptied','ended'])node.addEventListener(type,()=>window.__audioEvents.push({type,connected:node.isConnected,time:node.currentTime,path:location.pathname}));};
  const create=document.createElement.bind(document);document.createElement=function(...args){const node=create(...args);track(node);return node;};
  new MutationObserver(()=>document.querySelectorAll('audio').forEach(track)).observe(document,{subtree:true,childList:true});
 });
 const snapshot=async label=>{const state=await page.evaluate(()=>({path:location.pathname,nodes:window.__audioNodes.map(a=>({connected:a.isConnected,paused:a.paused,time:a.currentTime,src:a.currentSrc||a.src,autoplay:a.autoplay})),events:window.__audioEvents}));states.push({label,...state});console.log(label,JSON.stringify(state.nodes));return state;};
 try{
  await page.goto(origin+'/',{waitUntil:'networkidle'});
  await page.locator('.site-header nav a[href="/ns/"]').click();await page.waitForURL('**/ns/');
  await page.waitForFunction(()=>document.querySelector('.ns-music-card audio')?.readyState>=2);await page.waitForTimeout(1000);
  const entered=await snapshot('entered');
  const player=page.locator('.ns-music-card audio');await player.scrollIntoViewIfNeeded();const box=await player.boundingBox();await page.mouse.click(box.x+20,box.y+box.height/2);await page.waitForTimeout(600);
  const paused=await snapshot('native-pause');
  await player.evaluate(a=>a.pause());await page.waitForTimeout(300);await snapshot('api-pause');
  await player.evaluate(a=>a.play());await page.waitForTimeout(300);
  await page.locator('.site-header nav a[href="/posts/"]').click();await page.waitForURL('**/posts/');await page.waitForTimeout(1000);
  const left=await snapshot('left');
  assert.equal(paused.nodes.filter(a=>!a.paused).length,0,'native pause silences every NS audio instance');
  assert.equal(left.nodes.filter(a=>!a.paused).length,0,'leaving the route stops every retained/detached audio');
  assert.equal(entered.nodes.filter(a=>!a.paused).length,1,'only the committed player autoplays');
  for(let i=0;i<3;i++){
   await page.locator('.site-header nav a[href="/ns/"]').click();await page.waitForURL('**/ns/');await page.waitForFunction(()=>document.querySelector('audio')&&!document.querySelector('audio').paused);
   assert.equal((await snapshot('reentered-'+i)).nodes.filter(a=>!a.paused).length,1);
   await page.locator('audio').evaluate(a=>a.pause());await page.locator('.theme-toggle').click();await page.waitForTimeout(400);
   assert.equal((await snapshot('paused-theme-'+i)).nodes.filter(a=>!a.paused).length,0,'theme changes never resume paused music');
   await page.locator('.site-header nav a[href="/posts/"]').click();await page.waitForURL('**/posts/');
   assert.equal((await snapshot('repeat-left-'+i)).nodes.filter(a=>!a.paused).length,0);
  }
  await page.goBack();await page.waitForURL('**/ns/');await page.waitForTimeout(400);assert.equal((await snapshot('history-back')).nodes.filter(a=>!a.paused).length,1);
  await page.goForward();await page.waitForURL('**/posts/');await page.waitForTimeout(400);assert.equal((await snapshot('history-forward')).nodes.filter(a=>!a.paused).length,0);
  console.log('NS_AUDIO PASS');
 }finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(states,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
