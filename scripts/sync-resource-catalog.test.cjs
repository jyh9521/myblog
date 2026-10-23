const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sync}=require(process.env.CATALOG_SYNC_MODULE||'./sync-resource-catalog.cjs');
const catalog={schema:1,storage:'r2',files:[{path:'/uploads/test.png',bytes:4}]};
async function fixture(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-sync-'));
  const original=global.fetch;
  fs.writeFileSync(path.join(root,'resources.config.json'),JSON.stringify({enabled:true,catalogUrl:'https://example.com/ns/api/resources/catalog'}));
  const target=path.join(root,'public/sveltia/r2-assets.json');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'previous catalog');
  try{await run(root,target);}finally{global.fetch=original;fs.rmSync(root,{recursive:true,force:true});}
}
const options={wait:async()=>{}};
test('transient timeout retries then writes the fresh catalog',()=>fixture(async(root,target)=>{
  let calls=0;global.fetch=async()=>{if(++calls===1)throw new DOMException('The operation was aborted due to timeout','TimeoutError');return Response.json(catalog);};
  await sync(root,options);assert.equal(calls,2);assert.deepEqual(JSON.parse(fs.readFileSync(target)),catalog);
}));
test('response-body timeout retries the entire request',()=>fixture(async(root,target)=>{
  let calls=0;global.fetch=async()=>++calls===1?new Response(new ReadableStream({start(c){c.error(new DOMException('body timeout','TimeoutError'));}})):Response.json(catalog);
  await sync(root,options);assert.equal(calls,2);assert.deepEqual(JSON.parse(fs.readFileSync(target)),catalog);
}));
test('temporary HTTP errors retry; success retains no-cache request',()=>fixture(async(root)=>{
  let calls=0;global.fetch=async(url,init)=>{assert.equal(init.headers['Cache-Control'],'no-cache');assert.ok(init.signal);return ++calls<3?new Response(null,{status:503}):Response.json(catalog);};
  await sync(root,options);assert.equal(calls,3);
}));
test('exhausted timeouts fail without replacing the previous catalog',()=>fixture(async(root,target)=>{
  let calls=0;global.fetch=async()=>{calls++;throw new DOMException('timeout','TimeoutError');};
  await assert.rejects(sync(root,options),/3 attempts.*timeout/);assert.equal(calls,3);assert.equal(fs.readFileSync(target,'utf8'),'previous catalog');
}));
test('permanent HTTP and invalid catalogs fail immediately without replacing the previous catalog',()=>fixture(async(root,target)=>{
  for(const response of [()=>new Response(null,{status:403}),()=>Response.json({...catalog,schema:2}),()=>new Response('not json')]){
    let calls=0;global.fetch=async()=>{calls++;return response();};
    await assert.rejects(sync(root,options));assert.equal(calls,1);assert.equal(fs.readFileSync(target,'utf8'),'previous catalog');
  }
}));
