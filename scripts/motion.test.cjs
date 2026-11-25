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

test('coupled hover has visible spatial and effects response without a snap',()=>{
 const {createInteraction,stepInteraction,interactionVisuals}=core();
 let s=createInteraction();
 const first=interactionVisuals(stepInteraction(s,{hover:1,press:0},1/144));
 assert.ok(first.lift<0&&first.lift>-.1);assert.ok(first.elevation>0&&first.elevation<.1);
 s=stepInteraction(s,{hover:1,press:0},.18);const visible=interactionVisuals(s);
 assert.ok(visible.lift < -1.5);assert.ok(visible.scale>1.008);assert.ok(visible.elevation>.8&&visible.elevation<1);
});
test('hover/press channels preserve momentum and return to hovered then idle',()=>{
 const {createInteraction,stepInteraction,interactionVisuals}=core();
 let s=stepInteraction(createInteraction(),{hover:1,press:0},.08);
 const reverse=stepInteraction(s,{hover:0,press:0},.001);
 assert.ok(reverse.hover.value>s.hover.value);assert.ok(reverse.hoverEffect.value>s.hoverEffect.value);
 s=stepInteraction(s,{hover:1,press:1},.3);assert.ok(interactionVisuals(s).scale<.97);
 s=stepInteraction(s,{hover:1,press:0},2);let v=interactionVisuals(s);
 assert.ok(Math.abs(v.scale-1.012)<.0001);assert.ok(Math.abs(v.lift+2)<.0001);
 s=stepInteraction(s,{hover:0,press:0},2);v=interactionVisuals(s);
 assert.ok(Math.abs(v.scale-1)<.0001);assert.ok(Math.abs(v.lift)<.0001);
});
test('coupled interaction is refresh independent and effects stay bounded',()=>{
 const {createInteraction,stepInteraction,interactionVisuals}=core();
 const end=[60,120,144].map(hz=>{let s=createInteraction();for(let i=0;i<hz;i++){s=stepInteraction(s,{hover:1,press:1},1/hz);const v=interactionVisuals(s);assert.ok(v.shade>=0&&v.shade<=.14);assert.ok(v.elevation>=0&&v.elevation<=1);}return s;});
 for(const s of end)for(const k of ['hover','press','hoverEffect','pressEffect'])assert.ok(Math.abs(s[k].value-end[0][k].value)<1e-10);
});
test('token verification accepts Windows checkout line endings but rejects token drift',()=>{
 const path=require('node:path'),os=require('node:os'),cp=require('node:child_process');const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-motion-tokens-'));
 try{
  for(const f of ['lib/motion.ts','scripts/build-motion-tokens.cjs','app/motion-tokens.css']){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r?\n/g,'\r\n'));}
  const args=[path.join(root,'scripts/build-motion-tokens.cjs'),'--check'],options={encoding:'utf8',env:{...process.env,NODE_PATH:path.resolve(__dirname,'../node_modules')}};
  assert.match(cp.execFileSync(process.execPath,args,options),/Motion tokens match the physical model/);
  fs.appendFileSync(path.join(root,'app/motion-tokens.css'),'/* drift */');assert.notEqual(cp.spawnSync(process.execPath,args,options).status,0);
 }finally{if(!root.startsWith(path.join(os.tmpdir(),'blog-motion-tokens-')))throw Error('Unexpected fixture path');fs.rmSync(root,{recursive:true,force:true});}
});
