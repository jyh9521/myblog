const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(tag,text=''){this.tag=tag;this.children=[];this.textContent=text;this.value='';this.classList={add(){},remove(){},toggle(){}};this.style={};}
 append(...items){this.children.push(...items);} prepend(...items){this.children.unshift(...items);} replaceChildren(...items){this.children=items;} setAttribute(){} removeAttribute(){} focus(){} select(){} showModal(){} close(){this.onclose?.();} remove(){}
}
function setup({failAt=0}={}){
 const body=new Element('body'),calls=[],confirmed=[];let live=[{key:'used.png',folder:'',path:'/uploads/used.png',image:true,sha256:'u',bytes:100,references:[{}]},{key:'unused.png',folder:'',path:'/uploads/unused.png',image:true,sha256:'a',bytes:200,references:[]},{key:'nested/unused.png',folder:'nested',path:'/uploads/nested/unused.png',image:true,sha256:'b',bytes:300,references:[]}],deletes=0;
 const context={document:{body,createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text)},AbortSignal,window:{matchMedia:()=>({matches:false}),confirm:text=>{confirmed.push(text);return true;},CMS:{registerFieldType(){},registerEditorComponent(){},registerEventListener(){}},createClass:c=>c,h(){}},fetch:async(url,options={})=>{calls.push({url,options});if(url.includes('/session'))return {ok:true};if(url.endsWith('/delete')){deletes++;if(deletes===failAt)return {ok:false,status:409,json:async()=>({error:'REFERENCE_SOURCE_CHANGED'})};const input=JSON.parse(options.body);assert.notEqual(input.key,'used.png');assert.equal(input.commit,'current');live=live.filter(f=>f.key!==input.key);return {ok:true,json:async()=>({key:input.key,trashKey:'trash/'+input.key})};}return {ok:true,json:async()=>({files:live.map(f=>({...f})),folders:['nested'],commit:url.endsWith('/references')?'current':''})};}};
 vm.runInNewContext(fs.readFileSync(process.env.MEDIA_SCRIPT||'public/sveltia/r2-media.js','utf8'),context);context.window.BlogResources.picker('all',{manage:true});
 const all=(e=body)=>[e,...e.children.flatMap(c=>all(c))];const find=text=>{const e=all().find(e=>e.textContent===text);assert.ok(e,'missing control: '+text);return e;};
 const click=async text=>{await find(text).onclick();await new Promise(r=>setImmediate(r));};
 const login=async()=>{const form=all().find(e=>e.tag==='form');form.children[0].value='test-token';await form.onsubmit({preventDefault(){}});};
 return {all,find,click,login,calls,confirmed};
}
test('multi-selection exposes deletion and fresh references skip used files; batch can be restored',async()=>{
 const ui=setup();await new Promise(r=>setImmediate(r));await ui.click('多选');await ui.click('全选当前文件');await ui.click('删除所选文件（2）');await ui.login();
 assert.equal(ui.calls.filter(c=>c.url.endsWith('/delete')).length,1);assert.match(ui.confirmed[0],/跳过 1/);assert.ok(ui.calls.find(c=>c.url.endsWith('/references')));await ui.click('恢复本次删除');assert.equal(ui.calls.filter(c=>c.url.endsWith('/restore')).length,1);
});
test('scan collects unused images across folders then one-click delete and restore work',async()=>{
 const ui=setup();await new Promise(r=>setImmediate(r));await ui.click('扫描未引用图片');await ui.login();assert.equal(ui.find('删除所选文件（2）').disabled,false);await ui.click('一键删除未引用图片');assert.equal(ui.calls.filter(c=>c.url.endsWith('/delete')).length,2);await ui.click('恢复本次删除');assert.equal(ui.calls.filter(c=>c.url.endsWith('/restore')).length,2);
});
test('partial batch failure retains restore receipts and stops further deletion',async()=>{
 const ui=setup({failAt:2});await new Promise(r=>setImmediate(r));await ui.click('扫描未引用图片');await ui.login();await ui.click('一键删除未引用图片');assert.equal(ui.find('恢复本次删除').hidden,false);await ui.click('恢复本次删除');assert.equal(ui.calls.filter(c=>c.url.endsWith('/restore')).length,1);
});
