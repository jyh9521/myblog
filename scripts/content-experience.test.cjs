const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), load = require('./helpers/load-ts.cjs');
test('linked game aliases find public articles, never private records', () => {
  const core = load('lib/site-search.ts');
  const index = core.buildSiteSearchIndex({ posts: [{slug:'guide',title:'安装指南',visibility:'public',gameSlug:'game',tags:[],body:'正文'}, {slug:'secret',title:'私密',visibility:'password',gameSlug:'game',tags:[]}], games:[{slug:'game',title:'中文游戏',platforms:[],metadata:{originalName:'Original Game',alternativeNames:['別名']}}],chronologies:[]});
  assert.equal(core.searchSiteIndex(index,'Original Game').groups[0].total,1);
  assert.equal(JSON.stringify(index).includes('secret'),false);
});
test('event index is separate, validates anchors and matches normalized keywords', () => {
  assert.ok(fs.existsSync('lib/chronology-search.ts'), 'event search module exists');
  const core = load('lib/chronology-search.ts');
  const index = core.buildEventIndex([{id:'series',title:'系列',works:[{id:'a',title:'作品'}],events:[{id:'opening',title:'事件',summary:'角色回归',detail:'剧情详情',year:'100',keywords:['ＡＢＣ'],works:['a']}]}]);
  assert.equal(core.isEventIndex(index),true);
  assert.equal(core.searchEvents(index,'abc')[0].href,'/chronicles/series/#chronology-series-event-opening');
  assert.equal(core.searchEvents(index,'回归')[0].title,'事件');
  assert.equal(core.isEventIndex({version:1,entries:[{...index.entries[0],href:'https://evil.test'}]}),false);
  assert.equal(core.searchEvents(index,'   ').length,0);
});
test('topics retain editorial order and reject missing/private references', () => {
  assert.ok(fs.existsSync('lib/topics.ts'), 'topic resolver exists');
  const {resolveTopics}=load('lib/topics.ts');
  const posts=[{slug:'first',title:'第一篇',visibility:'public',date:'2026-01-01'},{slug:'second',title:'第二篇',visibility:'public',date:'2026-02-01'},{slug:'secret',visibility:'unlisted'}];
  const topic={slug:'guide',title:'指南',description:'介绍',readingOrder:['second','first'],games:[],chronologies:[]};
  const resolved=resolveTopics([topic],{posts,games:[],chronologies:[]});
  assert.equal(resolved[0].posts.map(x=>x.slug).join(','),'second,first');
  for(const slug of ['secret','missing'])assert.throws(()=>resolveTopics([{...topic,readingOrder:[slug]}],{posts,games:[],chronologies:[]}),/article/);
  assert.throws(()=>resolveTopics([topic,topic],{posts,games:[],chronologies:[]}),/duplicate/);
  assert.equal(resolveTopics([{slug:'empty',title:'Empty',description:'Optional lists omitted by CMS'}],{posts,games:[],chronologies:[]})[0].posts.length,0);
});
test('paragraph anchors are deterministic, unicode capable and duplicate-safe', () => {
  assert.ok(fs.existsSync('lib/paragraph-links.ts'), 'paragraph anchors exist');
  const {paragraphIds}=load('lib/paragraph-links.ts');
  const ids=paragraphIds(['第一段','第二段','第一段']);
  assert.equal(new Set(ids).size,3);
  assert.equal(ids[1],paragraphIds(['插入新段','第二段'])[1]);
  assert.match(ids[0],/^paragraph-[a-z0-9-]+$/);
});
test('paragraph plugin attaches anchors to top-level prose, not media or list items',()=>{
  const {remarkParagraphLinks}=load('lib/paragraph-links.ts');
  const tree={type:'root',children:[{type:'paragraph',children:[{type:'text',value:'正文'}]},{type:'paragraph',children:[{type:'image',url:'/x.png'}]},{type:'list',children:[{type:'paragraph',children:[{type:'text',value:'list text'}]}]}]};
  remarkParagraphLinks()(tree);assert.match(tree.children[0].data.hProperties.id,/^paragraph-/);assert.equal(tree.children[1].data,undefined);assert.equal(tree.children[2].children[0].data,undefined);
});
