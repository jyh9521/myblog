const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),renderer=require('react-test-renderer'),ts=require('typescript'),yaml=require('js-yaml');
const {renderToStaticMarkup}=require('react-dom/server');
const {validateChronology}=require('../lib/chronology-schema.cjs');
const data=require('../content/chronologies/genesis.json');
const coverage=require('../content/research/genesis-coverage.json');
function load(file,overrides={}){
 const context={exports:{},process,URL,URLSearchParams,Response,require:name=>overrides[name]||(name.startsWith('.')?name.endsWith('.cjs')?require(path.resolve(path.dirname(file),name)):load(path.resolve(path.dirname(file),name)+'.ts'):require(name))};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);return context.exports;
}
const logic=load('lib/chronology.ts'),Component=load('app/chronicles/chronology.tsx').default;
const clone=()=>JSON.parse(JSON.stringify(data));const all=data.works.map(w=>w.id);
const config=yaml.load(fs.readFileSync('public/sveltia/config.yml','utf8'));

test('standalone corpus validates six works and covers the complete original including Part II ending',()=>{
 assert.deepEqual(validateChronology(data),[]);assert.equal(data.events.length,315);assert.equal(data.works.length,6);
 assert.equal(load('lib/chronologies.ts').getChronologies()[0].id,'genesis');
 assert.match(data.events.find(e=>e.id==='event-l2008').summary,/奥德赛|安塔利亚/);
 assert.equal(data.events.filter(e=>e.era==='part-two').length,79);
});
test('coverage is exact once for all 897 source facts plus two explicitly separate branches',()=>{
 const actual=data.events.flatMap(e=>e.sourceLines).sort((a,b)=>a-b);
 assert.equal(actual.length,897);assert.equal(new Set(actual).size,897);
 assert.deepEqual(actual,coverage.expectedSourceLines);assert.deepEqual(coverage.missing,[]);assert.deepEqual(coverage.duplicates,[]);
 for(const e of data.events)assert.deepEqual(e.sourceLines,coverage.events.find(x=>x.id===e.id).sourceLines);
 assert.equal(data.events.filter(e=>e.id.startsWith('zephyr-route-')).length,2);assert.match(coverage.sourceSha256,/^[a-f0-9]{64}$/);
});
test('sources have page-specific locators, scope and common-family provenance without inflating independence',()=>{
 assert.ok(data.sources.length>=50);assert.equal(new Set(data.sources.map(s=>s.url)).size,data.sources.length);
 assert.ok(data.sources.every(s=>s.scope&&s.family&&s.kind));assert.ok(new Set(data.sources.map(s=>s.family)).size<data.sources.length);
 for(const e of data.events){assert.ok(e.citations.length);assert.ok(e.citations.every(c=>c.locator&&c.supports));if(e.verification==='crosschecked')assert.ok(e.citations.some(c=>c.source!=='arestes2'&&c.supports==='event'));}
});
test('single-source dates, conflicts and genuinely uncorroborated events remain visible as uncertainty',()=>{
 assert.ok(data.events.filter(e=>e.dateStatus==='single-source').length>200);
 assert.ok(data.events.filter(e=>e.verification==='conflict').length>=5);
 for(const line of [1908,1936,1962]){const e=data.events.find(e=>e.sourceLines.includes(line));assert.equal(e.verification,'single-source');}
 assert.equal(data.events.find(e=>e.id==='event-l1816').year,'跨纪年／数万年后');
});
test('mutually exclusive Zephyr endings are not asserted as simultaneous dated history',()=>{
 for(const id of ['zephyr-route-two','zephyr-route-three']){const e=data.events.find(e=>e.id===id);assert.match(e.note,/不是.*同时发生/);assert.equal(e.dateStatus,'undated');}
});
test('schema fails closed on invalid metadata, source locators and unsafe URLs',()=>{
 for(const mutate of [d=>delete d.events[0].spoilerWorks,d=>d.events[0].spoilerWorks=['missing'],d=>d.events[0].works=[],d=>d.events[0].sources=['bad'],d=>d.events[0].related=['bad'],d=>d.events[0].yearOrder='1200',d=>d.events[0].era='bad',d=>d.sources[0].url='javascript:alert(1)',d=>d.works.push(d.works[0]),d=>d.events[0].evidence='official',d=>d.events[0].keywords=[{}],d=>d.events[0].detail={},d=>d.events[0].citations[0].source='bad',d=>d.events[0].citations[0].locator='',d=>d.events[0].citations[0].supports='proof',d=>d.events[0].verification='official',d=>d.events[0].dateStatus='official']){const v=clone();mutate(v);assert.ok(validateChronology(v).length);}
});
test('filter gates every required work before search and accepts original Korean terms',()=>{
 assert.equal(logic.filterChronology(data,[],[],'시라노').length,0);
 assert.ok(logic.filterChronology(data,all,['zephyr'],'시라노').length>0);
 assert.ok(!logic.readableEvents(data,['genesis-2']).some(e=>e.id==='event-l47'));
 assert.ok(logic.readableEvents(data,all).some(e=>e.id==='event-l47'));
});
test('calendar ordering is era-scoped and does not numerically interleave the two calendars',()=>{
 const copy=clone();copy.events.find(e=>e.era==='part-two').yearOrder=-999999;
 const e=logic.filterChronology(copy,all,[],'');assert.ok(e.findIndex(x=>x.era==='part-two')>e.findIndex(x=>x.era==='part-one'));
});
test('SSR contains complete readable chronology, stable deep links and specific citations',()=>{
 const html=renderToStaticMarkup(React.createElement(Component,{data}));
 assert.match(html,/当前显示 315 \/ 315/);assert.match(html,/新世界被命名为安塔利亚/);
 assert.match(html,/knowing-passion.tistory.com\/768/);assert.match(html,/剧情依据|纪年依据/);
 assert.match(html,/id="chronology-genesis-event-event-l2008"/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(match[1]));
});
test('work choices, search and spoiler revocation update the standalone view',()=>{
 let app;renderer.act(()=>{app=renderer.create(React.createElement(Component,{data}));});
 const text=()=>JSON.stringify(app.toJSON());assert.ok(text().includes('新世界被命名为安塔利亚'));
 renderer.act(()=>app.root.findAllByType('button').find(n=>n.children.join('')==='隐藏全部剧透').props.onClick());assert.ok(!text().includes('新世界被命名为安塔利亚'));
 renderer.act(()=>app.root.findAllByType('button').find(n=>n.children.join('')==='显示完整年表').props.onClick());
 const search=app.root.findAllByType('input').find(n=>n.props.type==='search');renderer.act(()=>search.props.onChange({target:{value:'不存在的查询XYZ'}}));assert.ok(text().includes('没有匹配事件'));
 renderer.act(()=>app.unmount());
});
test('ordinary dossier schema remains unchanged and has no chronology insertion widget',()=>{
 const games=config.collections.find(c=>c.name==='games');assert.ok(!games.fields.some(f=>f.name==='body'));
 const js=fs.readFileSync('public/sveltia/custom.js','utf8');assert.doesNotMatch(js,/chronology-reference|chronology-catalog|id: 'chronology'/);
 assert.doesNotMatch(fs.readFileSync('app/games/[slug]/page.tsx','utf8'),/DossierBody|Chronology|game.body/);
 assert.ok(!fs.existsSync('lib/chronology-blocks.cjs'));assert.ok(!fs.existsSync('app/chronology-catalog.json/route.ts'));
});
test('CMS maintains sources, citation purposes and scope on the independent timeline',()=>{
 const c=config.collections.find(c=>c.name==='chronologies');assert.equal(c.format,'json');assert.match(c.preview_path,/chronicles/);
 const f=c.fields.find(f=>f.name==='events').fields;for(const name of ['citations','verification','dateStatus','sourceLines'])assert.ok(f.some(f=>f.name===name));
 const s=c.fields.find(f=>f.name==='sources').fields;for(const name of ['kind','family','scope'])assert.ok(s.some(f=>f.name===name));
});
test('new static route has canonical URL and no forced nav or automatic dossier insertion',()=>{
 const page=fs.readFileSync('app/chronicles/[slug]/page.tsx','utf8');assert.match(page,/generateStaticParams/);assert.match(page,/canonical/);assert.match(page,/chronicles/);
 assert.doesNotMatch(fs.readFileSync('app/layout.tsx','utf8'),/chronicles/);assert.doesNotMatch(fs.readFileSync('lib/games.ts','utf8'),/chronology|chronicles/);
});
test('content link validator registers standalone chronology pages as normal internal links',()=>{
 assert.match(fs.readFileSync('scripts/validate-content.cjs','utf8'),/routes.add\(`\/chronicles\//);
});
test('share code preserves filtered views and event anchors with clipboard fallback',()=>{
 const source=fs.readFileSync('app/chronicles/chronology.tsx','utf8');
 for(const key of ['works','q','spoilers'])assert.ok(source.includes(`searchParams.set('${key}'`));
 assert.match(source,/clipboard.writeText/);assert.match(source,/setShareFallback\(url.href\)/);assert.match(source,/url.hash = eventId/);
});
