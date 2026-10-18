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

test('standalone corpus preserves the six original works and extends into separately identified versions',()=>{
 assert.deepEqual(validateChronology(data),[]);assert.ok(data.events.length>315);assert.ok(data.works.length>6);
 for(const id of ['genesis-1','genesis-2','zephyr','tempest','genesis-3-p1','genesis-3-p2'])assert.ok(data.works.some(w=>w.id===id));
 assert.equal(load('lib/chronologies.ts').getChronologies()[0].id,'genesis');
 assert.match(data.events.find(e=>e.id==='event-l2008').summary,/奥德赛|安塔利亚/);
 assert.equal(data.events.filter(e=>e.era==='part-two').length,79);
});
test('coverage is exact once for all 897 source facts plus two explicitly separate branches',()=>{
 const actual=data.events.flatMap(e=>e.sourceLines||[]).sort((a,b)=>a-b);
 assert.equal(actual.length,897);assert.equal(new Set(actual).size,897);
 assert.deepEqual(actual,coverage.expectedSourceLines);assert.deepEqual(coverage.missing,[]);assert.deepEqual(coverage.duplicates,[]);
 for(const e of coverage.events)assert.deepEqual(data.events.find(x=>x.id===e.id).sourceLines,e.sourceLines);
 for(const e of data.events.filter(e=>!coverage.events.some(x=>x.id===e.id)))assert.deepEqual(e.sourceLines,[]);
 assert.equal(data.events.filter(e=>e.id.startsWith('zephyr-route-')).length,2);assert.match(coverage.sourceSha256,/^[a-f0-9]{64}$/);
});
test('sources have page-specific locators, scope and common-family provenance without inflating independence',()=>{
 assert.ok(data.sources.length>0);assert.equal(new Set(data.sources.map(s=>s.url)).size,data.sources.length);
 assert.ok(data.sources.every(s=>s.scope&&s.family&&s.kind));assert.ok(new Set(data.sources.map(s=>s.family)).size<data.sources.length);
 for(const e of data.events){assert.ok(e.citations.length);assert.ok(e.citations.every(c=>c.locator&&c.supports));if(e.verification==='crosschecked')assert.ok(e.citations.some(c=>c.source!=='arestes2'&&c.supports==='event'));}
});
test('single-source dates, conflicts and genuinely uncorroborated events remain visible as uncertainty',()=>{
 assert.ok(data.events.filter(e=>e.dateStatus==='single-source').length>200);
 for(const e of data.events.filter(e=>e.verification==='conflict'))assert.ok(e.note&&e.citations.length);
 for(const e of data.events.filter(e=>e.verification==='single-source'))assert.ok(e.note||e.citations.some(c=>c.source==='arestes2'));
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
 assert.ok(html.includes(`当前显示 ${data.events.length} / ${data.events.length}`));assert.match(html,/为目的地命名安塔利亚/);
 assert.match(html,/knowing-passion.tistory.com\/768/);assert.match(html,/剧情依据|纪年依据/);
 assert.match(html,/id="chronology-genesis-event-event-l2008"/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(match[1]));
});
test('work choices, search and spoiler revocation update the standalone view',()=>{
 let app;renderer.act(()=>{app=renderer.create(React.createElement(Component,{data}));});
 const text=()=>JSON.stringify(app.toJSON());assert.ok(text().includes('为目的地命名安塔利亚'));
 renderer.act(()=>app.root.findAllByType('button').find(n=>n.children.join('')==='隐藏全部剧透').props.onClick());assert.ok(!text().includes('为目的地命名安塔利亚'));
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
 assert.ok(c.fields.some(f=>f.name==='terms'));assert.ok(c.fields.some(f=>f.name==='terminologyNote'));
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

test('every public chronology field is Chinese and original terms remain only searchable metadata',()=>{
 const {auditChronologyLanguage}=require('../lib/chronology-language.cjs');assert.deepEqual(auditChronologyLanguage(data),[]);
 const bad=clone();bad.events[0].summary+=' Inferno';assert.ok(auditChronologyLanguage(bad).some(s=>s.includes('summary')));
 const also=clone();also.events[0].citations[0].locator='chapter Brain Empty';assert.ok(auditChronologyLanguage(also).length);
 const html=renderToStaticMarkup(React.createElement(Component,{data}));const text=html.replace(/<[^>]*>/g,' ').replace(/&(?:[a-z]+|#\d+);/gi,' ');assert.doesNotMatch(text,/[A-Za-z가-힣ぁ-んァ-ン]/u);
 assert.doesNotMatch(html,/>原名与检索词：/);assert.ok(logic.filterChronology(data,all,[],'G.S').length>0);assert.ok(logic.filterChronology(data,all,[],'시라노').length>0);
 assert.doesNotMatch(fs.readFileSync('app/chronicles/[slug]/page.tsx','utf8'),/THE WAR OF GENESIS/);
});
test('canonical names and editions are consistent without replacing story-stage aliases with true identities',()=>{
 for(const e of data.events){assert.doesNotMatch(e.title+e.summary,/西拉诺|西罗诺|伊欧林|比佛洛斯特|赛鲁普斯|西拉普斯|达卡玛|梅尔塞德斯|光明使者|安格拉·麦纽/);}
 assert.ok(data.events.some(e=>e.summary.includes('希拉诺')));assert.ok(data.events.some(e=>e.summary.includes('铁假面')));assert.ok(data.events.some(e=>e.summary.includes('夏恩霍斯特')));
 assert.ok(data.works.some(w=>w.title.includes('第一篇章')));assert.ok(data.works.some(w=>w.title.includes('第二篇章')));
 const terms=require('../content/research/genesis-terminology.json');assert.ok(terms.terms.length>=35);assert.ok(terms.terms.every(t=>t.canonical&&t.note&&t.status));
});
test('a claimed original-game correction requires a directly identified original medium',()=>{
 const d=clone();d.events[0].verification='corrected';d.events[0].citations.forEach(c=>delete c.medium);assert.ok(validateChronology(d).some(s=>s.includes('原作订正')));
 d.events[0].citations[0].medium='game-capture';assert.ok(!validateChronology(d).some(s=>s.includes('原作订正')));d.events[0].citations[0].medium='unverified';assert.ok(validateChronology(d).length);
});

test('primary game evidence fixes the false revival and deity identity statements',()=>{
 const arrival=data.events.find(e=>e.id==='event-l47'),awakening=data.events.find(e=>e.id==='event-l65'),erich=data.events.find(e=>e.id==='event-l476');
 assert.match(arrival.summary,/75人.*假死/);assert.doesNotMatch(arrival.summary,/死亡|死去/);assert.match(awakening.summary,/休眠/);assert.doesNotMatch(awakening.summary,/死者复活/);assert.match(erich.summary,/格里玛/);assert.doesNotMatch(erich.summary,/显露暗黑神身份/);
 for(const e of [arrival,awakening,erich])assert.equal(e.verification,'corrected');
});
test('the original date card overrides the opening year without promoting all later dates',()=>{
 const e=data.events.find(e=>e.id==='event-l1297');assert.equal(e.year,'1281年');assert.equal(e.day,'第20日');assert.equal(e.dateStatus,'crosschecked');assert.ok(e.citations.some(c=>c.medium==='game-capture'&&c.supports==='date'));
 assert.equal(data.events.find(e=>e.id==='event-l1772').dateStatus,'conflict');assert.equal(data.events.find(e=>e.id==='event-l1381').dateStatus,'single-source');
});
test('destination naming precedes launch and the reporters rescue is no longer an unsupported release claim',()=>{
 const list=logic.filterChronology(data,all,[],'');assert.ok(list.findIndex(e=>e.id==='event-l2008')<list.findIndex(e=>e.id==='event-l1986'));
 const rescued=data.events.find(e=>e.id==='event-l1932');assert.match(rescued.summary,/阿塞拉斯.*带回/);assert.match(rescued.summary,/洗脑/);assert.equal(rescued.verification,'corrected');
 for(const id of ['event-l1936','event-l1962']){const e=data.events.find(e=>e.id===id);assert.ok(e.citations.some(c=>c.medium==='game-capture'));assert.equal(e.dateStatus,'single-source');}
});
test('misattached affection-guide and general-transcript citations are removed rather than retained as proof',()=>{
 for(const id of [1192,1194,1195,1196,1197,1198,1199]){const e=data.events.find(e=>e.id==='event-l'+id);assert.ok(!e.citations.some(c=>c.source==='source-34'));assert.equal(e.verification,'single-source');}
 for(const id of [463,481]){const e=data.events.find(e=>e.id==='event-l'+id);assert.ok(!e.citations.some(c=>c.source==='source-11'));assert.equal(e.verification,'single-source');}
 for(const e of data.events.filter(e=>e.verification==='corrected'))assert.ok(e.citations.some(c=>c.source!=='arestes2'&&['game-capture','game-transcript','manual-scan'].includes(c.medium)));
});

test('new editions have sourced story boundaries and stay separate from the original 315 events',()=>{
 const originalIds=new Set(coverage.events.map(e=>e.id));assert.equal(originalIds.size,315);
 const originalEras=new Set(['myth','early','war','interwar','zephyr-era','succession','tempest-era','aftermath','part-one','transition','part-two']);
 const added=data.events.filter(e=>!originalIds.has(e.id));assert.ok(added.length>0);
 for(const e of added){assert.ok(!originalEras.has(e.era));assert.ok(e.citations.length);assert.ok(e.works.every(w=>!['genesis-1','genesis-2','zephyr','tempest','genesis-3-p1','genesis-3-p2'].includes(w)));assert.ok(e.spoilerWorks.length);assert.deepEqual(e.sourceLines,[]);}
 for(const w of data.works.slice(6)){assert.ok(w.continuity&&w.synopsis&&w.coverageNote&&w.sources.length);assert.ok(data.events.some(e=>e.works.includes(w.id))||/待|未|目录|改编|复述/.test(w.coverageNote));}
 assert.ok(data.works.some(w=>w.title.includes('灰色的残影')));
});

test('edition guide and official-story evidence survive CMS and language validation',()=>{
 const fields=config.collections.find(c=>c.name==='chronologies').fields;
 for(const n of ['continuity','synopsis','coverageNote','sources','originalTitle'])assert.ok(fields.find(f=>f.name==='works').fields.some(f=>f.name===n));
 const opts=fields.find(f=>f.name==='events').fields.find(f=>f.name==='citations').fields.find(f=>f.name==='medium').options;
 for(const value of ['official-publication','creator-interview'])assert.ok(opts.some(o=>o.value===value));
 const d=clone();d.works[6].synopsis='English leak';assert.ok(require('../lib/chronology-language.cjs').auditChronologyLanguage(d).length);
 const invalid=clone();invalid.works[6].sources=['missing'];assert.ok(validateChronology(invalid).length);
 const html=renderToStaticMarkup(React.createElement(Component,{data}));assert.match(html,/重制与衍生作品/);assert.match(html,/发行年份不作为故事年份/);
});

test('new works filter and hide without leaking their event titles into unrelated editions',()=>{
 for(const work of data.works.slice(6)){
  const own=logic.filterChronology(data,all,[work.id],'');assert.ok(own.every(e=>e.works.includes(work.id)));
  const hidden=logic.filterChronology(data,all.filter(w=>w!==work.id),[work.id],'');assert.ok(hidden.every(e=>!e.spoilerWorks.includes(work.id)));
 }
});

test('version-scoped eras reject events borrowed from another continuity',()=>{
 const d=clone();const scoped=d.eras.find(e=>e.works?.length);assert.ok(scoped);const event=d.events.find(e=>e.era===scoped.id);assert.ok(event);event.works.push('genesis-2');assert.ok(validateChronology(d).some(s=>s.includes('其他版本')));
 for(const e of data.eras.filter(e=>e.works))assert.ok(e.note&&e.calendar);
});

test('official announcements and creator interviews do not masquerade as direct game corrections',()=>{
 for(const medium of ['official-publication','creator-interview']){
  const d=clone();d.events[0].verification='corrected';d.events[0].citations.forEach(c=>c.medium=medium);assert.ok(validateChronology(d).some(s=>s.includes('原作订正')));
 }
 const d=clone();d.eras[0].works=['not-a-work'];assert.ok(validateChronology(d).some(s=>s.includes('分线作品')));
});

test('extension manifest preserves the exact original corpus and records all additions',()=>{
 const m=require('../content/research/genesis-extensions.json'),crypto=require('crypto');const original=data.events.filter(e=>coverage.events.some(c=>c.id===e.id));assert.equal(original.length,315);assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),m.originalEventsSha256);
 assert.deepEqual(data.events.slice(315).map(e=>e.id),m.addedEvents.map(e=>e.id));assert.equal(data.events.length,m.counts.events);assert.equal(data.sources.length,m.counts.sources);assert.equal(data.works.length,m.counts.works);
 const g4=data.events.filter(e=>e.id==='later-g4-02a'||e.id==='later-g4-02b');assert.equal(g4.length,2);assert.equal(g4[0].yearOrder,g4[1].yearOrder);assert.ok(g4.every(e=>e.note.includes('并列')));
 for(const e of data.events.slice(315))assert.equal(e.dateStatus,'undated');
 assert.ok(data.events.filter(e=>e.era==='mobile-crossovers').every(e=>e.note.includes('联动')));
});
