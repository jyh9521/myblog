const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const React=require('react'),renderer=require('react-test-renderer'),ts=require('typescript'),yaml=require('js-yaml');
const {renderToStaticMarkup}=require('react-dom/server');
const {validateChronology}=require('../lib/chronology-schema.cjs');
const {dossierBlocks}=require('../lib/chronology-blocks.cjs');
const {validateRepository}=require('./validate-content.cjs');
const {buildAssetIndex}=require('./build-asset-index.cjs');
const data=require('../content/chronologies/genesis.json');
function load(file,overrides={}){
  const context={exports:{},process,URL,Response,require:name=>overrides[name]||(name.startsWith('.')?name.endsWith('.cjs')?require(path.resolve(path.dirname(file),name)):load(path.resolve(path.dirname(file),name)+'.ts'):require(name))};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
  return context.exports;
}
const logic=load('lib/chronology.ts');
const Component=load('app/games/chronology.tsx').default;
const clone=()=>JSON.parse(JSON.stringify(data));
const config=yaml.load(fs.readFileSync('public/sveltia/config.yml','utf8'));
function cms(extra={}){
  const fields={},components=[];
  const window={h:React.createElement,createClass:value=>value,CMS:{getFieldType:()=>({control:()=>null}),registerFieldType:(id,value)=>fields[id]=value,registerEditorComponent:value=>components.push(value)}};
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js','utf8'),{window,...extra});return {fields,components};
}

test('chronology seed is a validated 22-node six-work source-attributed index, not claimed as full translation',()=>{
  assert.deepEqual(validateChronology(data),[]);assert.equal(data.events.length,22);assert.equal(data.works.length,6);
  assert.match(data.description,/非原文逐条全译/);assert.ok(data.events.every(event=>event.evidence==='compiled'));
  assert.equal(load('lib/chronologies.ts').getChronologies()[0].id,'genesis');
});
test('schema fails closed for missing spoiler metadata, invalid refs, dates, URLs and duplicate IDs',()=>{
  for(const mutate of [d=>delete d.events[0].spoilerWorks,d=>d.events[0].spoilerWorks=['missing'],d=>d.events[0].works=[],d=>d.events[0].sources=['bad'],d=>d.events[0].related=['bad'],d=>d.events[0].yearOrder='1200',d=>d.events[0].era='bad',d=>d.sources[0].url='javascript:alert(1)',d=>d.works.push(d.works[0]),d=>d.events[0].evidence='official',d=>d.events[0].keywords=[{}],d=>d.events[0].detail={}]){
    const value=clone();mutate(value);assert.ok(validateChronology(value).length);
  }
});
test('standalone insertion round-trips while code, inline examples and indents remain literal',()=>{
  const source='## 历史\n\n[chronology]genesis|zephyr[/chronology]\n\n结尾';
  const blocks=dossierBlocks(source);assert.equal(blocks.length,3);assert.equal(blocks[1].work,'zephyr');
  for(const source of ['```md\n[chronology]genesis[/chronology]\n```','~~~\n[chronology]genesis[/chronology]\n~~~','    [chronology]genesis[/chronology]','正文 [chronology]genesis[/chronology]','````\n```\n[chronology]genesis[/chronology]\n````']) assert.ok(dossierBlocks(source).every(block=>block.type==='markdown'));
  assert.equal(dossierBlocks('[chronology]genesis[/chronology]')[0].work,'');
});
test('filter gates spoilers before searching, supports Korean names and overlapping works',()=>{
  assert.equal(logic.filterChronology(data,[],[],'G.S').length,0);
  assert.equal(logic.filterChronology(data,['genesis-2'],['genesis-2'],'G.S').length,1);
  assert.equal(logic.filterChronology(data,['genesis-2'],['genesis-1'],'G.S').length,0);
  assert.equal(logic.filterChronology(data,['zephyr'],['zephyr'],'시라노').length,2);
  assert.equal(logic.filterChronology(data,['zephyr'],['zephyr'],'1263 시라노').length,1);
  assert.equal(logic.filterChronology(data,[],[],'贝拉莫德').length,0);
});
test('cross-work revelations require every listed work and calendars never compare globally',()=>{
  assert.ok(!logic.readableEvents(data,['genesis-2','tempest']).some(event=>event.id==='myth-war'));
  const all=data.works.map(work=>work.id),copy=clone();copy.events.find(event=>event.id==='part-two-opens').yearOrder=-999999;
  const events=logic.filterChronology(copy,all,[],'');assert.ok(events.findIndex(e=>e.id==='part-two-opens')>events.findIndex(e=>e.id==='part-one-ends'));
  assert.equal(logic.readableEvents(data,[]).length,2);
});
test('SSR hides locked titles, details, links and nonvisible era navigation; repeated embeds have unique anchors',()=>{
  const html=renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(Component,{data}),React.createElement(Component,{data})));
  assert.doesNotMatch(html,/G\.S|贝拉莫德|硫黄洞调查|href="#[^"]*myth/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(match[1]));
  assert.match(html,/默认隐藏所有剧情/);assert.match(html,/原文含全系列剧透/);
});
test('interactive work filters do not grant spoilers, search is gated and revocation unmounts revealed details',()=>{
  let app;renderer.act(()=>{app=renderer.create(React.createElement(Component,{data,defaultWork:'genesis-2'}));});
  const text=()=>JSON.stringify(app.toJSON());assert.ok(!text().includes('硫黄洞调查'));
  const check=()=>app.root.findAllByType('input').filter(node=>node.props.type==='checkbox');
  renderer.act(()=>check()[1].props.onChange());assert.ok(text().includes('硫黄洞调查'));
  const search=app.root.findAllByType('input').find(node=>node.props.type==='search');
  renderer.act(()=>search.props.onChange({target:{value:'贝拉莫德'}}));assert.ok(!text().includes('后续篇章'));
  renderer.act(()=>search.props.onChange({target:{value:''}}));
  renderer.act(()=>app.root.findAllByType('button').find(node=>node.children.join('')==='隐藏全部剧透').props.onClick());assert.ok(!text().includes('硫黄洞调查'));
  renderer.act(()=>app.unmount());
});
test('related links are omitted when their target is locked or excluded by work/search',()=>{
  const copy=clone();const event=copy.events.find(e=>e.id==='calendar-origin');event.related=['part-two-later'];
  const html=renderToStaticMarkup(React.createElement(Component,{data:copy}));assert.doesNotMatch(html,/关联事件：|后续篇章/);
});
test('CMS exposes insertion only in optional dossier body, retaining existing article and play-event editors',()=>{
  const games=config.collections.find(c=>c.name==='games'),posts=config.collections.find(c=>c.name==='post');
  const body=games.fields.find(f=>f.name==='body'),article=posts.fields.find(f=>f.name==='body');
  assert.equal(body.widget,article.widget);assert.equal(body.required,false);assert.ok(body.editor_components.includes('chronology'));
  assert.deepEqual(body.editor_components.filter(id=>id!=='chronology'),article.editor_components);
  const collection=config.collections.find(c=>c.name==='chronologies');assert.equal(collection.format,'json');assert.ok(!collection.preview_path);
  const spoilers=collection.fields.find(f=>f.name==='events').fields.find(f=>f.name==='spoilerWorks');assert.equal(spoilers.required,true);assert.deepEqual(spoilers.default,[]);
});
test('CMS shortcode serializer handles plain and immutable selections and rejects path/markup payloads',()=>{
  const component=cms().components.find(c=>c.id==='chronology');
  for(const block of ['[chronology]genesis[/chronology]','[chronology]genesis|zephyr[/chronology]'])assert.equal(component.toBlock(component.fromBlock(block.match(component.pattern))),block);
  assert.equal(component.toBlock({selection:{toJS:()=>({timeline:'genesis',work:'zephyr'})}}),'[chronology]genesis|zephyr[/chronology]');
  for(const timeline of ['../bad','<script>','x|y','a/b'])assert.equal(component.toBlock({selection:{timeline}}),'');
  assert.doesNotMatch(component.toPreview({selection:{timeline:'<img>',work:'"bad"'}}),/<|>|"/);
});
test('CMS reference widget uses direct radio choices, records default work and reports fetch failures',async()=>{
  const {fields}=cms({fetch:async()=>({ok:true,json:async()=>[{id:data.id,title:data.title,works:data.works}]})});
  let saved;const definition=fields['chronology-reference'];const picker={...definition,props:{forID:'picker',value:{timeline:'genesis',work:'zephyr'},onChange:value=>saved=value},state:definition.getInitialState(),setState(next){Object.assign(this.state,next);}};
  await definition.componentDidMount.call(picker);
  let app;renderer.act(()=>{app=renderer.create(definition.render.call(picker));});
  assert.equal(app.root.findAllByType('select').length,0);assert.equal(app.root.findAllByType('input').length,8);
  renderer.act(()=>app.root.findAllByType('input').at(-1).props.onChange());assert.equal(saved.work,'genesis-3-p2');
  definition.componentWillUnmount.call(picker);assert.equal(picker.alive,false);renderer.act(()=>app.unmount());
  const broken=cms({fetch:async()=>({ok:false})}).fields['chronology-reference'];picker.state=broken.getInitialState();await broken.componentDidMount.call(picker);assert.match(picker.state.error,/读取失败/);
});
test('CMS catalog exports titles and work IDs without event spoilers',async()=>{
  const route=load('app/chronology-catalog.json/route.ts',{'../../lib/chronologies':{getChronologies:()=>[data]}});
  const body=await route.GET().text();assert.match(body,/genesis-3-p2/);assert.doesNotMatch(body,/贝拉莫德|硫黄洞|events|spoilerWorks/);
});
test('dossier loader preserves Markdown body without altering old event ordering',()=>{
  const source='---\ntitle: Fixture\nevents: []\n---\n## 历史\n\n[chronology]genesis|zephyr[/chronology]\n';
  const games=load('lib/games.ts',{'node:fs':{existsSync:()=>true,readdirSync:()=>['fixture.md'],readFileSync:()=>source},'node:child_process':{execFileSync:()=>''},'../public/sveltia/game-platforms.js':require('../public/sveltia/game-platforms.js')}).getGames();
  assert.equal(games[0].body,'## 历史\n\n[chronology]genesis|zephyr[/chronology]');assert.equal(games[0].events.length,0);
});
test('content validation checks JSON and dossier references; new body images remain tracked',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-chronology-'));
  try{
    for(const dir of ['content/games','content/chronologies','public/uploads','public/sveltia'])fs.mkdirSync(path.join(root,dir),{recursive:true});
    for(const file of ['config.yml','custom.js','r2-media.js','article-access.js','hltb.js'])fs.copyFileSync('public/sveltia/'+file,path.join(root,'public/sveltia',file));
    fs.writeFileSync(path.join(root,'content/chronologies/genesis.json'),JSON.stringify(data));fs.writeFileSync(path.join(root,'public/uploads/test.png'),'fixture');
    const game=path.join(root,'content/games/fixture.md');fs.writeFileSync(game,'---\ntitle: 测试\n---\n![图](/uploads/test.png)\n\n[chronology]genesis|zephyr[/chronology]');
    assert.deepEqual((await validateRepository(root)).errors,[]);
    const assets=await buildAssetIndex(root);assert.equal(assets.files[0].references[0].url,'/games/fixture/');
    fs.appendFileSync(game,'\n\n[chronology]genesis|bad[/chronology]\n\n[chronology]missing[/chronology]');
    assert.equal((await validateRepository(root)).errors.filter(e=>e.includes('年表或默认作品不存在')).length,2);
    const invalid=clone();delete invalid.events[0].spoilerWorks;fs.writeFileSync(path.join(root,'content/chronologies/genesis.json'),JSON.stringify(invalid));assert.ok((await validateRepository(root)).errors.some(e=>e.includes('spoilerWorks')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('feature adds neither a public chronology page nor navigation entry or automatic dossier insertions',()=>{
  assert.ok(!fs.existsSync('app/chronologies/page.tsx'));assert.ok(!fs.existsSync('app/chronology/page.tsx'));
  assert.doesNotMatch(fs.readFileSync('app/layout.tsx','utf8'),/chronolog/);
  assert.doesNotMatch(fs.readFileSync('lib/games.ts','utf8'),/\[chronology\]/);
  const page=fs.readFileSync('app/games/[slug]/page.tsx','utf8');assert.match(page,/game.body && <DossierBody/);
});
