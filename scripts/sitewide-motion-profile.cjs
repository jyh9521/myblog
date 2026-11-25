// Actual CDP trace for long chronology pages and bounded disclosure reflow.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const origin=process.argv[2]||'http://127.0.0.1:4173',out=path.resolve(process.argv[3]||'reports/sitewide-motion-20261125/performance');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),cdp=await page.context().newCDPSession(page);
  await page.goto(origin+'/chronicles/genesis/',{waitUntil:'networkidle'});await page.waitForTimeout(1000);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
  const summary=page.locator('.chronology-spoilers summary');await summary.scrollIntoViewIfNeeded();await page.waitForTimeout(500);
  const before=await metrics();await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReturnAsStream'});
  await page.evaluate(()=>{window.__frameTimes=[];window.__recordFrames=true;let last=performance.now();function tick(t){window.__frameTimes.push(t-last);last=t;if(window.__recordFrames)requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  for(let i=0;i<6;i++){await summary.click();await page.waitForTimeout(i%2?850:65);}await page.waitForTimeout(900);
  const settled=await metrics();await page.waitForTimeout(1000);const idle=await metrics();
  const frames=await page.evaluate(()=>{window.__recordFrames=false;return window.__frameTimes.slice(3).sort((a,b)=>a-b);});
  const completed=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await completed;let trace='';for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.data;if(part.eof)break;}await cdp.send('IO.close',{handle:stream});fs.writeFileSync(path.join(out,'disclosure-trace.json'),trace);
  const report={origin,viewport:'390x844 touch',interactions:6,frameP95:frames[Math.floor(frames.length*.95)],framesOver34ms:frames.filter(x=>x>34).length,activeLayouts:settled.LayoutCount-before.LayoutCount,idleLayouts:idle.LayoutCount-settled.LayoutCount,idleStyleRecalcs:idle.RecalcStyleCount-settled.RecalcStyleCount,finalOpen:await page.locator('.chronology-spoilers').evaluate(e=>e.open),note:'Height animation intentionally reflows this one disclosure. Headless timings are not phone hardware acceptance; sample includes test-driver time.'};
  fs.writeFileSync(path.join(out,'disclosure-profile.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(report.finalOpen||report.idleLayouts>1||report.idleStyleRecalcs>1)throw Error('Disclosure failed to settle');console.log('SITEWIDE_PROFILE PASS bounded disclosure, no idle layout loop');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
