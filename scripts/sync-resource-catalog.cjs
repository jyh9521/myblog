const fs=require('node:fs'),path=require('node:path');
async function download(url,wait) {
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
      if(!r.ok){await r.body?.cancel();const error=Error('Resource catalog HTTP '+r.status);error.retryable=[408,429,500,502,503,504].includes(r.status);throw error;}
      const chunks=[];let bytes=0;
      for await(const chunk of r.body){bytes+=chunk.byteLength;if(bytes>8*1024*1024)throw Error('Catalog too large');chunks.push(Buffer.from(chunk));}
      return Buffer.concat(chunks).toString('utf8');
    }catch(error){
      const retryable=error.retryable||['TimeoutError','AbortError','TypeError'].includes(error.name);
      if(!retryable)throw error;
      if(attempt===3)throw Error('Resource catalog sync failed after 3 attempts: '+error.message,{cause:error});
      const delay=1000*2**(attempt-1);
      console.warn(`RESOURCE_SYNC retry=${attempt}/3 delay_ms=${delay}: ${error.message}`);
      await wait(delay);
    }
  }
}
async function sync(root=process.cwd(),{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  const file=path.join(root,'resources.config.json');const config=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{enabled:false};
  if(!config.enabled){console.log('RESOURCE_SYNC disabled');return;}
  const url=new URL(config.catalogUrl);if(url.protocol!=='https:'||url.pathname!=='/ns/api/resources/catalog')throw Error('Invalid resource catalog URL');
  const catalog=JSON.parse(await download(url,wait));
  if(catalog.schema!==1||catalog.storage!=='r2'||!Array.isArray(catalog.files)||catalog.files.some(f=>!f.path?.startsWith('/uploads/')||!Number.isSafeInteger(f.bytes)||f.bytes<0))throw Error('Invalid resource catalog');
  const target=path.join(root,'public/sveltia/r2-assets.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(catalog));
  console.log('RESOURCE_SYNC files='+catalog.files.length+' storage=r2');
}
module.exports={sync};if(require.main===module)sync().catch(e=>{console.error(e.message);process.exitCode=1;});
