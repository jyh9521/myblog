const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resourceCatalog,resourceFor}=require('./resource-catalog.cjs');
test('R2-only resource resolves Unicode aliases and rejects traversal; disabled config ignores stale catalog',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-r2-test-'));
 try{fs.mkdirSync(path.join(root,'public/sveltia'),{recursive:true});
 fs.writeFileSync(path.join(root,'resources.config.json'),JSON.stringify({enabled:true}));
 fs.writeFileSync(path.join(root,'public/sveltia/r2-assets.json'),JSON.stringify({schema:1,storage:'r2',files:[{path:'/uploads/中文 图.png',width:7,height:9}]}));
 assert.equal(resourceFor('/uploads/%E4%B8%AD%E6%96%87%20%E5%9B%BE.png',root).width,7);
 assert.equal(resourceFor('/uploads/../secret',root),null);assert.equal(resourceFor('/uploads/%zz',root),null);
 fs.writeFileSync(path.join(root,'resources.config.json'),JSON.stringify({enabled:false}));assert.deepEqual(resourceCatalog(root),{files:[]});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('old Git cleanup never accepts R2 cleanup manifests',async()=>{
 const module=require('../public/sveltia/asset-delete.js');
 await assert.rejects(module.deleteAssets({storage:'r2'},'fixture-token'),/R2/);
});
test('CMS preSave replaces native blob drafts with R2 aliases and leaves private entries untouched',async()=>{
 const vm=require('node:vm');let handler,uploads=0;const fields=[];
 const context={window:{CMS:{registerFieldType:name=>fields.push(name),registerEditorComponent(){},registerEventListener:event=>handler=event.handler},createClass:x=>x,h(){}},File,Blob,AbortSignal,setInterval,clearInterval,createImageBitmap:async()=>({width:1,height:1,close(){}}),fetch:async(url,options)=>{
   if(url.startsWith('blob:'))return {blob:async()=>new Blob(['test'],{type:'image/png'})};
   uploads++;assert.equal(options.method,'PUT');assert.ok(options.body instanceof File);return {ok:true,json:async()=>({path:'/uploads/cms/fixture/upload.png'})};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/sveltia/r2-media.js'),'utf8'),context);
 assert.deepEqual(fields,['r2-image','r2-file']);
 const make=data=>({get:key=>key==='data'?{toJS:()=>data}:undefined,getIn:keys=>keys.reduce((v,k)=>v?.[k],{data}),setIn:keys=>{throw Error('unexpected');}});
 const data={body:'![image](blob:https://blog.blfy.cc/fixture)',cover:'blob:https://blog.blfy.cc/fixture'};const entry=make(data);entry.setIn=(keys,value)=>{data[keys[1]]=value;return entry;};
 await handler({entry});assert.equal(uploads,1);assert.equal(data.cover,'/uploads/cms/fixture/upload.png');assert.ok(!data.body.includes('blob:'));
 const privateEntry=make({access:{mode:'password'},body:'blob:https://blog.blfy.cc/private'});assert.equal(await handler({entry:privateEntry}),privateEntry);assert.equal(uploads,1);
});
