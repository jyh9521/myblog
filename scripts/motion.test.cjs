const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const source=require('node:path').join(__dirname,'../lib/motion.ts');
function core(){assert.ok(fs.existsSync(source),'motion core exists');const m={exports:{}};new Function('exports','module',ts.transpile(fs.readFileSync(source,'utf8'),{module:ts.ModuleKind.CommonJS}))(m.exports,m);return m.exports;}
test('spatial spring converges identically at 60, 120 and 144 Hz',()=>{const {stepSpring,motion}=core();const states=[60,120,144].map(hz=>{let s={value:0,velocity:0};for(let i=0;i<hz;i++)s=stepSpring(s,1,1/hz,motion.spatial.default);return s;});for(const s of states){assert.ok(Math.abs(s.value-1)<0.0001);assert.ok(Math.abs(s.value-states[0].value)<1e-10);}});
test('effects stay monotonic while expressive fast spatial overshoots',()=>{const {stepSpring,motion}=core();let e={value:0,velocity:0},s={...e},max=0;for(let i=0;i<120;i++){const next=stepSpring(e,1,1/120,motion.effects.fast);assert.ok(next.value>=e.value&&next.value<=1);e=next;s=stepSpring(s,1,1/120,motion.spatial.fast);max=Math.max(max,s.value);}assert.ok(max>1.05&&max<1.12);});
test('reversal preserves position and momentum instead of restarting',()=>{const {stepSpring,motion}=core();const s=stepSpring({value:0,velocity:0},1,.04,motion.spatial.fast);const reversed=stepSpring(s,0,.001,motion.spatial.fast);assert.ok(reversed.value>s.value);assert.ok(Math.abs(reversed.value-s.value)<.03);const end=stepSpring(reversed,0,2,motion.spatial.fast);assert.ok(Math.abs(end.value)<.00001);});
test('zero elapsed is an identity and stagger is capped',()=>{const {stepSpring,motion,staggerDelay}=core();assert.deepEqual(stepSpring({value:.3,velocity:4},1,0,motion.spatial.fast),{value:.3,velocity:4});assert.equal(staggerDelay(0),0);assert.equal(staggerDelay(1),35);assert.equal(staggerDelay(999),140);});
