const {spawn}=require('node:child_process'),net=require('node:net');
async function run(script,env){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{stdio:'inherit',env});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${script}: exit ${code}`)));});}
(async()=>{
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const env={...process.env,PORT:String(port),MOTION_ORIGIN:`http://127.0.0.1:${port}`,SEARCH_ORIGIN:`http://127.0.0.1:${port}`,SEARCH_ENGINES:'chromium',MOTION_ENGINES:'chromium',PUBLISHING_BROWSER:'chromium'};
 const server=spawn(process.execPath,['scripts/serve-motion-test.cjs','out'],{env,stdio:['ignore','pipe','inherit']});
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.once('exit',code=>reject(Error(`test server exit ${code}`)));server.stdout.once('data',resolve);});
  for(const script of ['editor-browser','site-search-browser','reading-browser','publishing-browser','content-experience-browser'])await run(`scripts/${script}.cjs`,env);
  console.log('BROWSER_REGRESSION 5 suites PASS');
 }finally{server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
