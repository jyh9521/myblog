const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source='public/sveltia/publishing-core.js';
const core=fs.existsSync(source)?require('../'+source):{};
const sha='a'.repeat(40),config='b'.repeat(64);
const draft=(extra={})=>({collectionName:'posts',slug:'article',timestamp:new Date('2026-11-28T00:00:00Z'),cmsConfigVersion:'fixture-config',currentLocales:{en:true},currentSlugs:{en:'article'},currentValues:{en:{title:'文章',body:'![待上传](blob:test)'}},files:{},pendingEntries:[],...extra});
test('draft codec preserves pending file bytes, dates, Maps, typed data and undefined',async()=>{
 assert.equal(typeof core.exportDrafts,'function','draft export must exist');
 const file=new File([new Uint8Array([0,1,128,255])],'图.png',{type:'image/png',lastModified:123});
 const original=draft({files:{'blob:test':{file,folder:undefined,replace:false,nameTemplate:{randomValues:new Map([['id','ABC']]),dateTimeParts:{year:2026}}}},pendingEntries:[{data:new Uint16Array([1,65535]),map:new Map([[1,new Set(['x'])]]),date:new Date(0),blob:new Blob(['你好'])}]});
 const encoded=await core.exportDrafts([original],config);
 const [actual]=await core.parseDrafts(encoded,config);
 assert.equal(actual.timestamp.toISOString(),'2026-11-28T00:00:00.000Z');assert.equal(actual.files['blob:test'].file.name,'图.png');
 assert.equal(actual.files['blob:test'].file.type,'image/png');assert.equal(actual.files['blob:test'].file.lastModified,123);
 assert.deepEqual([...new Uint8Array(await actual.files['blob:test'].file.arrayBuffer())],[0,1,128,255]);
 assert.equal(actual.files['blob:test'].nameTemplate.randomValues.get('id'),'ABC');
 assert.ok(Object.hasOwn(actual.files['blob:test'],'folder'));assert.equal(actual.files['blob:test'].folder,undefined);
 assert.deepEqual([...actual.pendingEntries[0].data],[1,65535]);assert.ok(actual.pendingEntries[0].map.get(1).has('x'));assert.equal(await actual.pendingEntries[0].blob.text(),'你好');
});
test('only draft store schema exports; credentials and other storage records are rejected',async()=>{
 assert.equal(typeof core.exportDrafts,'function');
 for(const extra of [{token:'not-exportable'},{user:{token:'not-exportable'}},{authorization:'not-exportable'}]) await assert.rejects(core.exportDrafts([draft(extra)],config));
 const result=await core.exportDrafts([draft()],config);assert.ok(!result.includes('sveltia-cms.user'));
});
test('malformed, duplicate, incompatible and prototype-bearing imports fail before writes',async()=>{
 assert.equal(typeof core.parseDrafts,'function');
 const encoded=await core.exportDrafts([draft()],config);
 await assert.rejects(core.parseDrafts(encoded,'c'.repeat(64)),/配置/);
 for(const value of ['{}','null','{"format":"other"}',encoded.replace('blog-sveltia-drafts','unknown')])await assert.rejects(core.parseDrafts(value,config));
 await assert.rejects(core.exportDrafts([draft(),draft()],config),/重复/);
 await assert.rejects(core.exportDrafts([draft({timestamp:'yesterday'})],config));
 await assert.rejects(core.exportDrafts([draft({currentValues:JSON.parse('{"__proto__":{"x":1}}')})],config));
 const envelope=JSON.parse(encoded);envelope.records[0]=['bogus'];await assert.rejects(core.parseDrafts(JSON.stringify(envelope),config));
});
test('fallback failure never overrides matching current primary readback',()=>{
 assert.equal(typeof core.deploymentState,'function');
 const state=core.deploymentState({sha,live:{release:sha,hosting:'workers-static-assets'},run:{head_sha:sha,status:'completed',conclusion:'failure'},jobs:[{name:'deploy',status:'completed',conclusion:'failure'}]});
 assert.equal(state.repository.kind,'success');assert.equal(state.primary.kind,'success');assert.equal(state.fallback.kind,'error');
});
test('old successful workflows, unexpected hosting and stale live releases do not prove fresh primary success',()=>{
 assert.equal(typeof core.deploymentState,'function');
 for(const live of [null,{release:'c'.repeat(40),hosting:'workers-static-assets'},{release:sha,hosting:''}]){
 const state=core.deploymentState({sha,live,run:{head_sha:'c'.repeat(40),status:'completed',conclusion:'success'},jobs:[{name:'deploy',status:'completed',conclusion:'success'}]});
 assert.notEqual(state.primary.kind,'success');assert.notEqual(state.fallback.kind,'success');
 }
});
test('primary step evidence and Pages job are independent even when upload artifact fails later',()=>{
 assert.equal(typeof core.deploymentState,'function');
 const state=core.deploymentState({sha,run:{head_sha:sha,status:'completed',conclusion:'failure'},jobs:[{name:'build',conclusion:'failure',steps:[{name:'Verify primary release',conclusion:'success'}]},{name:'deploy',status:'completed',conclusion:'skipped'}]});
 assert.equal(state.primary.kind,'verified');assert.equal(state.fallback.kind,'error');assert.match(state.primary.label,/回读/);
});
test('safe import routes reject open editors and unknown screens',()=>{
 assert.equal(typeof core.canImportAt,'function');
 for(const hash of ['#/collections/posts/entries/a','#/collections/posts/new','#/collections/posts/entries/a?x=1','#/workflow'])assert.equal(core.canImportAt(hash),false);
 for(const hash of ['#/collections','#/collections/posts','#/collections/posts?search=hello'])assert.equal(core.canImportAt(hash),true);
});

test('entry links use actual collection route and only paths present in the live manifest',()=>{
 assert.equal(typeof core.publishedEntryPath,'function');
 const files=[{path:'posts/existing/index.html'},{path:'games/existing/index.html'},{path:'chronicles/existing/index.html'}];
 assert.equal(core.publishedEntryPath('#/collections/post/entries/existing',files),'/posts/existing/');
 assert.equal(core.publishedEntryPath('#/collections/games/entries/existing?locale=en',files),'/games/existing/');
 assert.equal(core.publishedEntryPath('#/collections/chronologies/entries/existing',files),'/chronicles/existing/');
 for(const hash of ['#/collections/post/new','#/collections/post/entries/unpublished','#/collections/post/entries/..%2Fexisting','#/collections/unknown/entries/existing'])assert.equal(core.publishedEntryPath(hash,files),null);
});
