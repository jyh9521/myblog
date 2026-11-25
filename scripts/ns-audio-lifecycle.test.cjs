const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),renderer=require('react-test-renderer'),ts=require('typescript');
function component(){const file=path.join(__dirname,'../app/ns/ns-audio.tsx');assert.ok(fs.existsSync(file),'a committed-lifecycle audio component exists');const context={exports:{},require};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);return context.exports.default;}
test('speculative/server audio markup never requests native autoplay',()=>{const Audio=component();const html=require('react-dom/server').renderToStaticMarkup(React.createElement(Audio));assert.match(html,/<audio[^>]*controls/);assert.match(html,/src="\/ns\/audio\/changhuijiakankan.mp3"/);assert.doesNotMatch(html,/autoplay/i);});
test('only committed connected audio plays once; rerenders do not undo a user pause; unmount releases it',async()=>{
 const Audio=component();const calls=[];const node={isConnected:true,src:'',play(){calls.push('play');return Promise.resolve();},pause(){calls.push('pause');},removeAttribute(name){calls.push('remove:'+name);},load(){calls.push('load');}};
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Audio),{createNodeMock:()=>node});});assert.deepEqual(calls,['play']);assert.match(node.src,/changhuijiakankan\.mp3$/);
 node.pause();renderer.act(()=>tree.update(React.createElement(Audio)));assert.deepEqual(calls,['play','pause']);renderer.act(()=>tree.unmount());assert.deepEqual(calls,['play','pause','pause','remove:src','load']);
});
test('discarded disconnected render and denied autoplay never create retries',async()=>{
 const Audio=component();let plays=0;const node={isConnected:false,play(){plays++;return Promise.reject(new Error('NotAllowedError'));},pause(){},removeAttribute(){},load(){}};
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Audio),{createNodeMock:()=>node});});assert.equal(plays,0);renderer.act(()=>tree.unmount());
 node.isConnected=true;await renderer.act(async()=>{tree=renderer.create(React.createElement(Audio),{createNodeMock:()=>node});});assert.equal(plays,1);renderer.act(()=>tree.update(React.createElement(Audio)));assert.equal(plays,1);renderer.act(()=>tree.unmount());
});
test('hydration respects a native play/pause interaction that already happened',async()=>{
 const Audio=component();let plays=0;const node={isConnected:true,currentTime:12,paused:true,src:'existing',play(){plays++;return Promise.resolve();},pause(){},removeAttribute(){},load(){}};
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Audio),{createNodeMock:()=>node});});assert.equal(plays,0);assert.equal(node.src,'existing');renderer.act(()=>tree.unmount());
});
