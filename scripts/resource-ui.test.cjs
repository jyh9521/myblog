const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function control(fetcher){let component;const context={window:{CMS:{registerFieldType:(name,value)=>component=value,registerEditorComponent(){},registerEventListener(){}},createClass:c=>c,h:(tag,props,...children)=>({tag,props,children})},File,Blob,AbortSignal,fetch:fetcher,createImageBitmap:async()=>({width:1,height:1,close(){}})};vm.runInNewContext(fs.readFileSync('public/sveltia/r2-media.js','utf8'),context);const instance={...component,props:{field:{get:k=>k==='widget'?'r2-image':''},value:'/uploads/old.png',onChange:v=>instance.value=v},state:component.getInitialState(),setState:value=>Object.assign(instance.state,value)};return instance;}
test('field directly uploads image, preserves old reference on error and blocks non-image drops',async()=>{
 let calls=0;const c=control(async(url,options)=>{calls++;assert.equal(options.method,'PUT');return {ok:true,json:async()=>({path:'/uploads/new.png'})};});
 await c.sendFile(new File(['image'],'fixture.png',{type:'image/png'}));assert.equal(c.value,'/uploads/new.png');assert.equal(c.state.busy,false);
 await c.sendFile(new File(['pdf'],'fixture.pdf',{type:'application/pdf'}));assert.equal(calls,1);assert.equal(c.value,'/uploads/new.png');assert.match(c.state.message,/图片/);
 const failure=control(async()=>({ok:false,status:503,json:async()=>({error:'test upload failure'})}));await failure.sendFile(new File(['image'],'fixture.png',{type:'image/png'}));assert.equal(failure.value,undefined);assert.equal(failure.props.value,'/uploads/old.png');assert.equal(failure.state.busy,false);
});
test('field offers upload, existing-image selection, paste/drop and folded link editing',()=>{
 const c=control();const node=c.render();assert.equal(typeof node.props.onDrop,'function');assert.equal(typeof node.props.onPaste,'function');const text=JSON.stringify(node);assert.ok(text.includes('上传图片'));assert.ok(text.includes('选择已有图片'));assert.ok(text.includes('链接 / 外部地址'));assert.ok(!text.includes('浏览 / 上传 R2'));assert.ok(text.includes('details'));
});
