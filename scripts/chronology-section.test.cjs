const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const React=require('react'),renderer=require('react-test-renderer'),ts=require('typescript'),yaml=require('js-yaml');
const {renderToStaticMarkup}=require('react-dom/server');
const {validateChronology}=require('../lib/chronology-schema.cjs');
const {auditChronologyLanguage}=require('../lib/chronology-language.cjs');
const genesis=require('../content/chronologies/genesis.json'),metroid=require('../content/chronologies/metroid.json');
function load(file,overrides={}) {
 const context={exports:{},process,URL,URLSearchParams,require:name=>overrides[name]||(name.startsWith('.')?name.endsWith('.cjs')?require(path.resolve(path.dirname(file),name)):load(path.resolve(path.dirname(file),name)+(fs.existsSync(path.resolve(path.dirname(file),name)+'.ts')?'.ts':'.tsx'),overrides):require(name))};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);return context.exports;
}
const clone=value=>JSON.parse(JSON.stringify(value));
const example={src:'/uploads/example.png',alt:'测试画面',caption:'配图说明',credit:'图片作者',sourceUrl:'https://example.com/image',width:640,height:480,works:['zero'],spoilerWorks:[]};

test('both timelines have real illustrated covers, era images and event images without changing story counts',()=>{
 for(const d of [genesis,metroid]){assert.deepEqual(validateChronology(d),[]);assert.ok(d.cover.src.startsWith('/uploads/'));assert.ok(d.excerpt);assert.ok(d.eras.filter(e=>e.image).length>=3);assert.ok(d.events.some(e=>e.images?.length));}
 assert.equal(genesis.events.length,359);assert.equal(metroid.events.length,106);assert.deepEqual(auditChronologyLanguage(genesis),[]);
});

test('legacy timelines remain valid without any optional gallery fields',()=>{
 const d=clone(metroid);delete d.cover;delete d.excerpt;d.eras.forEach(e=>delete e.image);d.events.forEach(e=>delete e.images);assert.deepEqual(validateChronology(d),[]);
});

test('image schema fails closed for unsafe URLs, dimensions, missing alt and unknown spoiler or work metadata',()=>{
 for(const mutate of [i=>delete i.spoilerWorks,i=>i.spoilerWorks=['missing'],i=>i.works=[],i=>i.works=['missing'],i=>i.works=['zero','zero'],i=>i.alt='',i=>delete i.width,i=>i.height=0,i=>i.width='640',i=>i.sourceUrl='javascript:alert(1)',i=>delete i.credit]){
  const d=clone(metroid);d.cover=clone(example);mutate(d.cover);assert.ok(validateChronology(d).length);
 }
 for(const src of ['javascript:alert(1)','data:image/png;base64,aaa','blob:https://example.com/id','//example.com/a.png','http://example.com/a.png','https://user:pass@example.com/a.png','/secret.png','/uploads/../secret','/uploads/%2e%2e/secret','/uploads/%5csecret','/uploads/a.png#x','https://example.com/a\n.png']){const d=clone(metroid);d.cover={...example,src};assert.ok(validateChronology(d).length,src);}
 for(const src of ['/uploads/%E6%B5%8B%E8%AF%95%20%E5%9B%BE.png','https://cdn.example.com/image.webp?v=1']){const d=clone(metroid);d.cover={...example,src};assert.deepEqual(validateChronology(d),[]);}
});

test('public covers forbid spoiler imagery; optional event image arrays are bounded and validated',()=>{
 const d=clone(metroid);d.cover={...example,spoilerWorks:['zero']};assert.ok(validateChronology(d).some(x=>x.includes('无剧透')));
 for(const images of [[],Array(5).fill(example),[null],[{...example,spoilerWorks:['missing']}]]){const v=clone(metroid);v.events[0].images=images;assert.ok(validateChronology(v).length);}
});

test('Chinese audit includes cover, era and event image captions, alt and credit',()=>{
 for(const place of ['cover','era','event']){const d=clone(genesis),i={...example,alt:'Untranslated'};if(place==='cover')d.cover=i;else if(place==='era')d.eras[0].image=i;else d.events[0].images=[i];assert.ok(auditChronologyLanguage(d).some(x=>x.includes('alt')));}
});

test('image reading requires every spoiler work and the selected work, independently from event permission',()=>{
 const {readableImage}=load('lib/chronology.ts'),i={...example,works:['zero'],spoilerWorks:['zero','prime']};
 assert.equal(readableImage(i,['zero'],[]),false);assert.equal(readableImage(i,['zero','prime'],['prime']),false);assert.equal(readableImage(i,['zero','prime'],['zero']),true);assert.equal(readableImage(undefined,[],[]),false);
});

test('UI removes hidden image URLs, captions, credits and an open dialog when a spoiler work is unchecked',()=>{
 const Component=load('app/chronicles/chronology.tsx').default;
 const image={...example,src:'https://example.com/secret-picture.jpg',caption:'独立图注秘密',credit:'独立图片署名',works:['a'],spoilerWorks:['b']};
 const d={id:'sample',title:'示例年表',description:'简介',calendarNote:'纪年',works:[{id:'a',title:'甲'},{id:'b',title:'乙'}],eras:[{id:'era',title:'时代',calendar:'纪年',image}],sources:[{id:'source',title:'资料',url:'https://example.com/'}],events:[{id:'one',era:'era',year:'一年',yearOrder:1,order:1,title:'可读事件',summary:'可读摘要',works:['a','b'],spoilerWorks:['a'],sources:['source'],evidence:'game',images:[image]}]};
 let tree;renderer.act(()=>{tree=renderer.create(React.createElement(Component,{data:d}));});assert.match(JSON.stringify(tree.toJSON()),/secret-picture/);
 renderer.act(()=>{tree.root.findAllByType('button').find(b=>String(b.props['aria-label']||'').startsWith('放大图片')).props.onClick();});assert.equal(tree.root.findAllByType('dialog').length,1);
 renderer.act(()=>{tree.root.findAllByType('input').filter(x=>x.props.type==='checkbox')[1].props.onChange();});
 const hidden=JSON.stringify(tree.toJSON());assert.match(hidden,/可读事件/);assert.doesNotMatch(hidden,/secret-picture|独立图注秘密|独立图片署名/);assert.equal(tree.root.findAllByType('dialog').length,0);
 renderer.act(()=>{tree.root.findAllByType('input').filter(x=>x.props.type==='checkbox')[1].props.onChange();});
 renderer.act(()=>{tree.root.findAllByType('button').find(b=>b.children.join('')==='乙').props.onClick();});assert.doesNotMatch(JSON.stringify(tree.toJSON()),/secret-picture|独立图注秘密/);renderer.act(()=>tree.unmount());
});

test('timeline directory is a game archive subsection with illustrated cards and preserved detail URLs',()=>{
 const Page=load('app/games/timelines/page.tsx').default,html=renderToStaticMarkup(React.createElement(Page));
 assert.match(html,/游戏档案子板块/);assert.match(html,/href="\/games\/"/);assert.match(html,/href="\/chronicles\/genesis\/"/);assert.match(html,/href="\/chronicles\/metroid\/"/);assert.match(html,/359 条事件/);assert.match(html,/106 条事件/);assert.equal((html.match(/<img /g)||[]).length,2);
 assert.ok(html.includes('aria-current="page">游戏时间线'));
 assert.match(fs.readFileSync('app/games/page.tsx','utf8'),/GameSectionNav active="library"/);
 assert.doesNotMatch(fs.readFileSync('app/layout.tsx','utf8'),/href="\/games\/timelines\//);
});

test('details return to the timeline section rather than home and retain old static params/canonicals',async()=>{
 const page=load('app/chronicles/[slug]/page.tsx');
 for(const d of [genesis,metroid]){const props={params:Promise.resolve({slug:d.id})},html=renderToStaticMarkup(await page.default(props));assert.match(html,/href="\/games\/timelines\/">← 返回游戏时间线/);assert.match(html,/aria-label="面包屑"/);assert.ok(html.includes('chronology-figure-cover'));assert.equal((await page.generateMetadata(props)).alternates.canonical,`/chronicles/${d.id}/`);}
 assert.deepEqual(Array.from(page.generateStaticParams(),p=>p.slug),['genesis','metroid']);
});

test('CMS exposes shared R2 uploader for all three image placements while keeping the six personal event labels',()=>{
 const cfg=yaml.load(fs.readFileSync('public/sveltia/config.yml','utf8')),collection=cfg.collections.find(c=>c.name==='chronologies');
 const fields=collection.fields,cover=fields.find(f=>f.name==='cover'),era=fields.find(f=>f.name==='eras').fields.find(f=>f.name==='image'),events=fields.find(f=>f.name==='events').fields.find(f=>f.name==='images');
 for(const group of [cover,era,events]){assert.equal(group.fields.find(f=>f.name==='src').widget,'r2-image');assert.equal(group.fields.find(f=>f.name==='alt').widget,'string');assert.ok(group.fields.find(f=>f.name==='spoilerWorks'));}
 assert.equal(events.max,4);assert.match(collection.label,/游戏时间线/);
 assert.deepEqual(cfg.collections.find(c=>c.name==='games').fields.find(f=>f.name==='events').fields.find(f=>f.name==='title').options,['开始游戏','通关游戏','开始汉化工作','开始测试汉化','已发布汉化补丁','AFK']);
});

test('asset index tracks nested chronology JSON references once per page, including Unicode paths',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'chronology-resources-'));
 try{
  for(const folder of ['content/chronologies','public/uploads'])fs.mkdirSync(path.join(root,folder),{recursive:true});
  fs.writeFileSync(path.join(root,'public/uploads/测试 图.png'),'fixture');fs.writeFileSync(path.join(root,'resources.config.json'),'{"enabled":false}');
  const src='/uploads/%E6%B5%8B%E8%AF%95%20%E5%9B%BE.png';fs.writeFileSync(path.join(root,'content/chronologies/sample.json'),JSON.stringify({id:'sample',title:'示例年表',cover:{src},eras:[{image:{src}}],events:[{images:[{src}]}]}));
  const result=await require('./build-asset-index.cjs').buildAssetIndex(root),image=result.files[0];assert.equal(image.references.length,1);assert.deepEqual(image.references[0],{file:'content/chronologies/sample.json',title:'示例年表',url:'/chronicles/sample/'});assert.deepEqual(image.duplicates,[]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('server-side R2 cleanup protects chronology JSON image references without changing worker code',async()=>{
 const {scanReferences,referencesFor}=await import('../workers/static-preview/src/public-resources.js'),sha='a'.repeat(40),text=JSON.stringify({cover:{src:'/uploads/chronology.png'}});
 const fetcher=async(url)=>url.includes('/git/ref/')?Response.json({object:{sha}}):url.includes('/git/trees/')?Response.json({truncated:false,tree:[{type:'blob',path:'content/chronologies/sample.json'}]}):Response.json({data:{repository:{b0:{text,isBinary:false,byteSize:text.length}}}});
 const snapshot=await scanReferences({RESOURCE_REPOSITORY:'owner/repo',RESOURCE_BRANCH:'main'},fetcher,'fixture-token');assert.deepEqual(referencesFor('chronology.png',snapshot),[{file:'content/chronologies/sample.json'}]);
});
