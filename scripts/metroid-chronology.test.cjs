const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {validateChronology}=require('../lib/chronology-schema.cjs');
const data=require('../content/chronologies/metroid.json');
test('Metroid main chronology validates with official per-event citations',()=>{
 assert.deepEqual(validateChronology(data),[]);
 assert.equal(data.works.length,12);assert.equal(data.events.length,24);
 for(const event of data.events){assert.equal(event.dateStatus,'undated');assert.ok(event.citations.length);assert.equal(event.verification,'single-source');}
 for(const source of data.sources)assert.match(new URL(source.url).hostname,/(^|\.)nintendo\.(com|co\.jp|net)$/);
});
test('remakes share one work and Beyond is not presented as a sequel to Dread',()=>{
 assert.ok(data.works.find(w=>w.id==='zero').originalTitle.includes('Zero Mission'));
 assert.ok(data.works.find(w=>w.id==='returns').originalTitle.includes('Samus Returns'));
 assert.match(data.eras.find(e=>e.id==='beyond').note,/不表示发生在/);
 assert.match(data.events.find(e=>e.works.includes('beyond')).citations[0].locator,/物语/);
});
test('existing Genesis chronology remains available alongside Metroid',()=>{
 const ids=fs.readdirSync('content/chronologies').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync('content/chronologies/'+f)).id);
 assert.ok(ids.includes('genesis'));assert.ok(ids.includes('metroid'));
});
