const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const ts=require('typescript');
const {validateChronology}=require('../lib/chronology-schema.cjs');
const data=require('../content/chronologies/metroid.json');
function load(file){
 const context={exports:{},require,process};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
 return context.exports;
}
test('Metroid expanded chronology validates with traceable per-event citations',()=>{
 assert.deepEqual(validateChronology(data),[]);
 assert.equal(data.works.length,12);assert.ok(data.events.length>=95);
 for(const event of data.events){assert.ok(event.citations.length);assert.ok(event.citations.some(c=>c.supports==='event'));}
 for(const source of data.sources){assert.equal(new URL(source.url).protocol,'https:');assert.ok(source.scope);assert.ok(source.family);}
});
test('remakes share one work and official Chinese names replace invented translations',()=>{
 assert.ok(data.works.find(w=>w.id==='zero').originalTitle.includes('Zero Mission'));
 assert.ok(data.works.find(w=>w.id==='returns').originalTitle.includes('Samus Returns'));
 assert.match(data.works.find(w=>w.id==='prime').title,/复刻版/);
 assert.match(data.works.find(w=>w.id==='beyond').title,/穿越未知/);
 assert.match(data.terms.find(t=>t.id==='phazon').title,/费原子/);
 assert.doesNotMatch(JSON.stringify(data),/菲增强物质|究极4 超越|究极 重制版|尚未逐场引证|当前为主干版/);
 assert.ok(data.events.some(e=>e.summary.includes('费原子')));
 for(const term of ['雷文毕克','魁特罗布','苏哈族','麦欧金族'])assert.ok(data.terms.some(t=>t.title===term));
 assert.doesNotMatch(JSON.stringify(data.events),/鸟喙|静袍|索哈|玛乌金|马克肯齐|托卡比|阿姆斯特朗|时之塔|心灵能力/);
});
test('Beyond belongs after Super and before Fusion without inventing an Other M ordering',()=>{
 const era=data.eras.find(e=>e.id==='post-super');assert.ok(era);
 assert.match(era.note,/先后未明|先后.*未.*明确/);
 assert.ok(data.eras.findIndex(e=>e.id==='zebes')<data.eras.indexOf(era));
 assert.ok(data.eras.indexOf(era)<data.eras.findIndex(e=>e.id==='x'));
 assert.ok(data.events.filter(e=>e.works.includes('beyond')).every(e=>e.era===era.id));
 assert.ok(data.events.filter(e=>e.works.includes('other')).every(e=>e.era===era.id));
 assert.ok(data.sources.some(s=>s.id==='beyond-timeline'&&new URL(s.url).hostname==='www.famitsu.com'));
 for(const work of ['other','beyond'])assert.ok(data.events.filter(e=>e.works.includes(work)).some(e=>e.citations.some(c=>c.source==='beyond-timeline'&&c.supports==='date')));
});
test('every narrative work has verified opening, development and ending coverage',()=>{
 const coverage=JSON.parse(fs.readFileSync('content/research/metroid-coverage.json','utf8'));
 assert.deepEqual(coverage.works.map(w=>w.id).sort(),data.works.map(w=>w.id).sort());
 for(const w of coverage.works){
  assert.ok(data.events.filter(e=>e.works.includes(w.id)).length>=5,w.id);
  for(const stage of ['opening','development','ending']){
   assert.ok(w[stage].length,`${w.id} ${stage}`);
   for(const id of w[stage]){const e=data.events.find(e=>e.id===id);assert.ok(e?.works.includes(w.id),`${w.id} ${id}`);}
  }
  for(const id of w.ending){const e=data.events.find(e=>e.id===id);assert.ok(e.spoilerWorks.includes(w.id));assert.ok(e.citations.some(c=>c.supports==='event'&&['game-transcript','game-capture','firsthand-guide','official-publication'].includes(c.medium)));}
 }
});
test('existing public deep links survive the expansion',()=>{
 for(let i=1;i<=24;i++)assert.ok(data.events.some(e=>e.id==='metroid-'+String(i).padStart(3,'0')));
});
test('final revelations and cross-work retrospectives are spoiler gated before searching',()=>{
 const logic=load('lib/chronology.ts');
 const coverage=JSON.parse(fs.readFileSync('content/research/metroid-coverage.json','utf8'));
 for(const w of coverage.works)for(const id of w.ending){assert.ok(!logic.readableEvents(data,[]).some(e=>e.id===id));assert.ok(logic.readableEvents(data,data.works.map(w=>w.id)).some(e=>e.id===id));}
 const cross=data.events.find(e=>e.id==='metroid-chozo-creation');
 assert.ok(cross.spoilerWorks.includes('dread'));assert.ok(cross.spoilerWorks.includes('returns'));
 assert.equal(logic.filterChronology(data,['returns'],[],'苏哈').some(e=>e.id===cross.id),false);
});
test('directly attested cosmic years retain their own sources without interpolating other events',()=>{
 for(const [id,year,source]of [['metroid-023','20X9','beyond-cn-story'],['metroid-009','20X6','force-official-story']]){
  const e=data.events.find(e=>e.id===id);assert.ok(e.year.includes(year));assert.equal(e.dateStatus,'single-source');assert.ok(e.citations.some(c=>c.source===source&&c.supports==='date'));
 }
 const other=data.events.filter(e=>e.works.includes('other'));assert.ok(other.every(e=>e.dateStatus==='undated'));
 assert.ok(other.every(e=>e.citations.some(c=>c.source==='other-timeline'&&c.supports==='date')));
});
test('ending conditions do not fabricate alternate story branches or confirmed deaths',()=>{
 const beyond=data.events.find(e=>e.id==='metroid-beyond-extra');
 assert.match(beyond.note,/不.*全员|不是.*新.*结局/);
 assert.match(data.events.find(e=>e.id==='metroid-beyond-farewell').note,/未.*确认|没有.*确认/);
 assert.match(data.events.find(e=>e.id==='metroid-dread-escape').note,/未.*解释|不.*断言/);
 assert.ok(data.events.find(e=>e.id==='metroid-prime-stinger').spoilerWorks.includes('echoes'));
 assert.ok(data.events.find(e=>e.id==='metroid-006').spoilerWorks.includes('echoes'));
 assert.doesNotMatch(data.events.find(e=>e.id==='metroid-prime-ending').detail,/泽贝斯/);
 assert.doesNotMatch(JSON.stringify(data.events.find(e=>e.id==='metroid-009')),/法兹毁灭/);
 const farewell=data.events.find(e=>e.id==='metroid-beyond-farewell');
 assert.ok(farewell.citations.some(c=>c.source==='beyond-sylux'&&c.supports==='event'));
 assert.ok(farewell.citations.some(c=>c.source==='beyond-dream'&&c.supports==='event'));
});
test('existing Genesis chronology remains available alongside Metroid',()=>{
 const ids=fs.readdirSync('content/chronologies').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync('content/chronologies/'+f)).id);
 assert.ok(ids.includes('genesis'));assert.ok(ids.includes('metroid'));
 const page=fs.readFileSync('app/chronicles/[slug]/page.tsx','utf8');
 assert.doesNotMatch(page,/创世纪战 · 系列历史档案/);
 assert.match(page,/section-kicker">系列历史档案/);
 const component=fs.readFileSync('app/chronicles/chronology.tsx','utf8');
 assert.match(component,/人物、原文名称、地点或年份/);
 assert.doesNotMatch(component,/韩文原名/);
});
