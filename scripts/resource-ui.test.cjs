const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function control(fetcher){let component;const context={window:{CMS:{registerFieldType:(name,value)=>component=value,registerEditorComponent(){},registerEventListener(){}},createClass:c=>c,h:(tag,props,...children)=>({tag,props,children})},File,Blob,AbortSignal,fetch:fetcher,createImageBitmap:async()=>({width:1,height:1,close(){}})};context.window.BlogAdminAuth={request:context.fetch};vm.runInNewContext(fs.readFileSync('public/sveltia/r2-media.js','utf8'),context);const instance={...component,props:{field:{get:k=>k==='widget'?'r2-image':''},value:'/uploads/old.png',onChange:v=>instance.value=v},state:component.getInitialState(),setState:value=>Object.assign(instance.state,value)};return instance;}
test('field directly uploads image, preserves old reference on error and blocks non-image drops',async()=>{
 let calls=0;const c=control(async(url,options)=>{calls++;assert.equal(options.method,'PUT');return {ok:true,json:async()=>({path:'/uploads/new.png'})};});
 await c.sendFile(new File(['image'],'fixture.png',{type:'image/png'}));assert.equal(c.value,'/uploads/new.png');assert.equal(c.state.busy,false);
 await c.sendFile(new File(['pdf'],'fixture.pdf',{type:'application/pdf'}));assert.equal(calls,1);assert.equal(c.value,'/uploads/new.png');assert.match(c.state.message,/图片/);
 const failure=control(async()=>({ok:false,status:503,json:async()=>({error:'test upload failure'})}));await failure.sendFile(new File(['image'],'fixture.png',{type:'image/png'}));assert.equal(failure.value,undefined);assert.equal(failure.props.value,'/uploads/old.png');assert.equal(failure.state.busy,false);
});
test('field offers upload, existing-image selection, paste/drop and folded link editing',()=>{
 const c=control();const node=c.render();assert.equal(typeof node.props.onDrop,'function');assert.equal(typeof node.props.onPaste,'function');const text=JSON.stringify(node);assert.ok(text.includes('上传图片'));assert.ok(text.includes('选择已有图片'));assert.ok(text.includes('链接 / 外部地址'));assert.ok(!text.includes('浏览 / 上传 R2'));assert.ok(text.includes('details'));
});

test('linked article upload and game screenshot batch use scoped destinations and preserve order',async()=>{
 const components={},urls=[];
 const fetcher=async(url)=>{const query=new URL(url,'https://fixture.test').searchParams;urls.push(query);
   return {ok:true,json:async()=>({path:'/uploads/'+query.get('name'),folder:query.get('folder')})};};
 const context={window:{CMS:{registerFieldType:(name,value)=>components[name]=value,registerEditorComponent(){},registerEventListener(){}},createClass:c=>c,h:(tag,props,...children)=>({tag,props,children}),BlogAdminAuth:{request:fetcher}},File,Blob,AbortSignal};
 vm.runInNewContext(fs.readFileSync('public/sveltia/r2-media.js','utf8'),context);
 const mount=(type,value,collection,data)=>{
   const c=components[type],instance={...c,state:c.getInitialState(),props:{field:{get:()=>type},value,entry:{get:k=>k==='collection'?collection:'',getIn:([,k])=>data[k]},onChange:v=>instance.props.value=v},setState:patch=>Object.assign(instance.state,patch)};
   return instance;
 };
 const article=mount('r2-image','', 'post',{resourceFolder:'Articles/My Article'});
 await article.sendFile(new File(['1'],'cover.png',{type:'image/png'}));
 assert.equal(article.props.value,'/uploads/cover.png');
 assert.equal(urls[0].get('folder'),'Articles/My Article');assert.equal(urls[0].get('destination'),'entry');
 const gallery=mount('screenshot-gallery',{enabled:true,images:[]},'games',{title:'伊苏 IX',gameMetadata:{title:'Ys IX: Monstrum Nox'}});
 gallery.props.value.images=['/uploads/manually-ordered.png','/uploads/20260909120000_1.jpg'];
 await gallery.addFiles([
   new File(['3'],'20261024152054_1.jpg',{lastModified:1000}),
   new File(['1'],'2025091011152800_c.jpg',{lastModified:3000}),
   new File(['2'],'2025-09-10_11-15-29.png',{lastModified:2000}),
   new File(['bad'],'invalid.pdf',{lastModified:4000}),
 ]);
 assert.deepEqual(urls.slice(1).map(q=>q.get('name')),['2025091011152800_c.jpg','2025-09-10_11-15-29.png','20261024152054_1.jpg']);
 assert.deepEqual(Array.from(gallery.props.value.images),[
   '/uploads/manually-ordered.png','/uploads/2025091011152800_c.jpg','/uploads/2025-09-10_11-15-29.png','/uploads/20260909120000_1.jpg','/uploads/20261024152054_1.jpg',
 ]);
 assert.equal(gallery.props.value.folder,'Game Dossiers/Ys IX - Monstrum Nox');
 assert.equal(urls[1].get('folder'),gallery.props.value.folder);
 assert.equal(urls[2].get('destination'),'entry');assert.equal(urls.length,4);
 assert.match(gallery.state.message,/invalid.pdf/);
 const fallback=mount('screenshot-gallery',{enabled:true,images:[]},'games',{title:'Fixture'});
 await fallback.addFiles([
   new File(['x'],'20250230120000_1.jpg',{lastModified:3000}),
   new File(['x'],'custom-name.png',{lastModified:1000}),
 ]);
 assert.deepEqual(Array.from(fallback.props.value.images),['/uploads/custom-name.png','/uploads/20250230120000_1.jpg']);
});

test('game screenshot destination follows the draft slug until a folder is saved',async()=>{
 const components={},folders=[];
 const context={window:{CMS:{registerFieldType:(name,value)=>components[name]=value,registerEditorComponent(){},registerEventListener(){}},createClass:c=>c,h:(tag,props,...children)=>({tag,props,children}),BlogAdminAuth:{request:async url=>{
   const folder=new URL(url,'https://fixture.test').searchParams.get('folder');folders.push(folder);
   return {ok:true,json:async()=>({path:'/uploads/shot.png',folder})};
 }}},File,Blob,AbortSignal};
 vm.runInNewContext(fs.readFileSync(process.env.R2_MEDIA_SOURCE||'public/sveltia/r2-media.js','utf8'),context);
 let slug='split-fiction';
 const entry={get:key=>key==='slug'?'original-slug':key==='collection'?'games':undefined,getIn:([,key])=>({gameMetadata:{title:'Split Fiction'},screenshotGallery:g.props.value})[key]};
 const mount=(type,value)=>{
   const c=components[type],instance={...c,state:c.getInitialState(),props:{field:{get:()=>type},entry,get draftSlug(){return slug;},value,onChange:v=>instance.props.value=v},setState:p=>Object.assign(instance.state,p)};
   return instance;
 };
 const g=mount('screenshot-gallery',{enabled:true,images:[]});
 const rendered=()=>JSON.stringify(g.render());
 assert.ok(rendered().includes('截图目录：Game Dossiers/split-fiction'),rendered().match(/截图目录：[^"]+/)?.[0]);
 slug='split-fiction-pc';
 assert.ok(rendered().includes('截图目录：Game Dossiers/split-fiction-pc'));
 g.update({englishName:'Co-op Album'});
 assert.ok(rendered().includes('截图目录：Game Dossiers/Co-op Album'));
 g.update({englishName:'  '});
 const image=mount('r2-image','');
 await image.sendFile(new File(['x'],'cover.png',{type:'image/png'}));
 await g.addFiles([new File(['x'],'shot.png',{type:'image/png'})]);
 assert.deepEqual(folders,['Game Dossiers/split-fiction-pc','Game Dossiers/split-fiction-pc']);
 assert.equal(g.props.value.folder,'Game Dossiers/split-fiction-pc');
 slug='another-slug';
 assert.ok(rendered().includes('截图目录：Game Dossiers/split-fiction-pc'));
 g.update({folder:'Game Dossiers/Existing Album'});
 assert.ok(rendered().includes('截图目录：Game Dossiers/Existing Album'));
});

function screenshotUploadHarness(respond){
 const components={},calls=[],waits=[];
 const window={
   CMS:{registerFieldType:(name,component)=>components[name]=component,registerEditorComponent(){},registerEventListener(){}},
   createClass:c=>c,h:(tag,props,...children)=>({tag,props,children}),
   BlogAdminAuth:{request:async(url,options)=>{
     const query=new URL(url,'https://fixture.test').searchParams;
     calls.push({name:query.get('name'),folder:query.get('folder'),destination:query.get('destination'),body:options.body});
     return respond(query,calls.length);
   }},
 };
 const context={window,File,Blob,AbortSignal,setTimeout:(next,ms)=>{waits.push(ms);next();}};
 vm.runInNewContext(fs.readFileSync(process.env.R2_MEDIA_SOURCE||'public/sveltia/r2-media.js','utf8'),context);
 const component=components['screenshot-gallery'];
 let slug='upload-fixture';
 const gallery={...component,state:component.getInitialState(),props:{
   value:{enabled:true,images:[]},get draftSlug(){return slug;},onChange:v=>gallery.props.value=v,
 },setState:patch=>Object.assign(gallery.state,patch)};
 return {gallery,calls,waits,setSlug:value=>{slug=value;}};
}
const shot=name=>new File(['fixture'],name,{type:'image/png',lastModified:1});
const uploadOK=query=>Response.json({path:'/uploads/'+encodeURIComponent(query.get('name')),folder:query.get('folder')});

test('screenshot upload recovers from a plain HTTP 503 without reselecting the file',async()=>{
 const {gallery,calls,waits}=screenshotUploadHarness((q,n)=>n===1
   ?new Response('Service Unavailable',{status:503,headers:{'Retry-After':'3'}}):uploadOK(q));
 const file=shot('浪人崛起_20250329111459.png');
 await gallery.addFiles([file]);
 assert.equal(calls.length,2,'HTTP 503 must retry the same screenshot');
 assert.equal(calls[0].body,file);assert.equal(calls[1].body,file);
 assert.deepEqual(calls.map(c=>c.destination),['entry','entry']);
 assert.equal(waits.length,1);assert.ok(waits[0]>=3000);
 assert.deepEqual(Array.from(gallery.props.value.images),['/uploads/'+encodeURIComponent(file.name)]);
 assert.match(gallery.state.message,/上传完成/);
});

test('screenshot upload pauses a sustained outage, keeps the successes and resumes only the pending files',async()=>{
 let recovered=false;
 const {gallery,calls,waits,setSlug}=screenshotUploadHarness((q,n)=>n===1||recovered
   ?uploadOK(q):new Response('Service Unavailable',{status:503,headers:{'cf-ray':'fixture-ray'}}));
 const files=['one.png','two.png','three.png'].map(shot);
 await gallery.addFiles(files);
 assert.deepEqual(calls.map(c=>c.name),['one.png','two.png','two.png','two.png','two.png']);
 assert.deepEqual(Array.from(gallery.props.value.images),['/uploads/one.png']);
 assert.match(gallery.state.message,/已暂停/);assert.match(gallery.state.message,/fixture-ray/);assert.equal(waits.length,3);
 const retry=gallery.render().children[1].children[2].children.find(node=>node?.children?.[0]==='继续上传（2 张）');
 assert.equal(typeof retry?.props?.onClick,'function');
 setSlug('another-slug');recovered=true;
 await retry.props.onClick();
 assert.deepEqual(calls.slice(5).map(c=>c.name),['two.png','three.png']);
 assert.ok(calls.every(c=>c.folder==='Game Dossiers/upload-fixture'));
 assert.deepEqual(Array.from(gallery.props.value.images),files.map(file=>'/uploads/'+file.name));
 assert.match(gallery.state.message,/上传完成/);
});

test('screenshot upload does not retry permanent validation errors or replay other resource mutations',async()=>{
 const {gallery,calls,waits}=screenshotUploadHarness((q,n)=>n===1
   ?Response.json({error:'INVALID_FILE_TYPE'},{status:400}):uploadOK(q));
 await gallery.addFiles([shot('invalid.png'),shot('good.png')]);
 assert.deepEqual(calls.map(c=>c.name),['invalid.png','good.png']);assert.equal(waits.length,0);
 assert.match(gallery.state.message,/invalid.png/);
 assert.deepEqual(Array.from(gallery.props.value.images),['/uploads/good.png']);
 const offline=control(async()=>{calls.push('single');return new Response('Service Unavailable',{status:503});});
 await offline.sendFile(shot('unscoped.png'));
 assert.equal(calls.length,3);
});
