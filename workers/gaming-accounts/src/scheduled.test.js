import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from './index.js';

const cron='0,5,10,15,20,25 0 * * *';
const schedules={0:'nintendo',5:'psn',10:'xbox',15:'steam',20:'gog',25:'epic'};
function fixture(){
 const attempts=[];let cleanups=0;
 const env={STEAM_API_KEY:'fixture',DB:{
  prepare(sql){let values=[];return {bind(...v){values=v;return this;},async all(){return {results:Object.values(schedules).map(platform=>({platform}))};},async first(){if(sql.startsWith('UPDATE gaming_accounts'))attempts.push(values[2]);return null;},async run(){return {};}};},
  async batch(){cleanups++;return [];}
 }};
 return {env,attempts,get cleanups(){return cleanups;}};
}
for(const [minute,platform] of Object.entries(schedules))test('scheduled invocation isolates '+platform+' request budget',async()=>{
 const f=fixture();await worker.scheduled({cron,scheduledTime:Date.UTC(2026,9,13,0,Number(minute))},f.env,{});
 assert.deepEqual(f.attempts,[platform]);
 assert.equal(f.cleanups,platform==='nintendo'?1:0);
});
test('unknown cron never fans out across all accounts',async()=>{
 const f=fixture();await worker.scheduled({cron:'* * * * *',scheduledTime:Date.UTC(2026,9,13)},f.env,{});
 assert.deepEqual(f.attempts,[]);assert.equal(f.cleanups,0);
});
test('deployed cron configuration matches daily isolated platform events',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.deepEqual(config.triggers.crons,[cron]);
});
test('invalid or unexpected scheduled time never synchronizes accounts',async()=>{
 for(const scheduledTime of [undefined,NaN,Date.UTC(2026,9,13,1,10),Date.UTC(2026,9,13,0,1)]){
  const f=fixture();await worker.scheduled({cron,scheduledTime},f.env,{});
  assert.deepEqual(f.attempts,[]);assert.equal(f.cleanups,0);
 }
});
