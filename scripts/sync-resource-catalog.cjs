const fs=require('node:fs'),path=require('node:path');
async function sync(root=process.cwd()) {
  const file=path.join(root,'resources.config.json');const config=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{enabled:false};
  if(!config.enabled){console.log('RESOURCE_SYNC disabled');return;}
  const url=new URL(config.catalogUrl);if(url.protocol!=='https:'||url.pathname!=='/ns/api/resources/catalog')throw Error('Invalid resource catalog URL');
  const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Resource catalog HTTP '+r.status);
  const content=await r.text();if(Buffer.byteLength(content)>8*1024*1024)throw Error('Catalog too large');const catalog=JSON.parse(content);
  if(catalog.schema!==1||catalog.storage!=='r2'||!Array.isArray(catalog.files)||catalog.files.some(f=>!f.path?.startsWith('/uploads/')||!Number.isSafeInteger(f.bytes)||f.bytes<0))throw Error('Invalid resource catalog');
  const target=path.join(root,'public/sveltia/r2-assets.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(catalog));
  console.log('RESOURCE_SYNC files='+catalog.files.length+' storage=r2');
}
module.exports={sync};if(require.main===module)sync().catch(e=>{console.error(e.message);process.exitCode=1;});
