const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS});
const motion={exports:{}};vm.runInNewContext(compile('lib/motion.ts'),motion);
function fixture({offscreen=false,loaded=true,nested=false,duplicate=false,clipped=false}={}){
 let rafId=0,timerId=0,current,layer;const raf=new Map(),timers=new Map(),listeners=new Map(),animations=[];
 class Element{
  constructor(){this.style={visibility:'',transform:'',borderTopLeftRadius:'12px',objectFit:'cover'};this.dataset={motionCover:'demo'};this.rect={x:20,y:50,width:800,height:450};this.children=[];}
  getBoundingClientRect(){return {...this.rect};}querySelector(){return this.children[0]||null;}closest(selector){return selector==='.post-visual'?this.clip||null:null;}append(e){this.children.push(e);}setAttribute(){}removeAttribute(){}remove(){this.removed=true;}
  animate(frames,options){let resolve,reject;const a={frames,options,finished:new Promise((a,b)=>{resolve=a;reject=b;}),cancel(){reject();},finish(){resolve();}};animations.push(a);return a;}
 }
 class Image extends Element{constructor(){super();this.complete=loaded;this.naturalWidth=1600;this.naturalHeight=900;}cloneNode(){return new Image();}}
 const source=new Image();source.style.visibility='visible';if(offscreen)source.rect.y=-600;
 const marker=nested?new Element():source;if(nested){marker.children=[source];marker.rect={...source.rect,height:800};}
 const target=new Image();target.rect={x:80,y:300,width:300,height:200};current=marker;
 const clip=new Element();clip.rect={...target.rect};clip.style.borderTopLeftRadius='16px';if(clipped){target.clip=clip;target.rect={x:76,y:297,width:308,height:206};}
 const other=new Image();other.rect.y=-900;
 const sandbox={exports:{},require:()=>motion.exports,HTMLImageElement:Image,innerHeight:844,innerWidth:1000,
  getComputedStyle:e=>e.style,document:{documentElement:{style:{scrollBehavior:''}},querySelectorAll:()=>current?(duplicate&&current===target?[other,current]:[current]):[],createElement:()=>new Element(),body:{append:e=>{layer=e;}}},
  window:{addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{raf.set(++rafId,fn);return rafId;},cancelAnimationFrame:id=>raf.delete(id)};
 vm.runInNewContext(compile('app/article-return-motion.ts'),sandbox);
 return {root:sandbox.document.documentElement,hold:sandbox.exports.holdHistoryScroll,source:marker,image:source,target,animations,listeners,timers,raf,get layer(){return layer;},capture:()=>sandbox.exports.captureArticleReturn('demo'),arrive:()=>{current=target;},missing:()=>{current=null;},tick:()=>{const jobs=[...raf.values()];raf.clear();jobs.forEach(fn=>fn());}};
}
test('return bridge hides destination before paint, moves crop without stretching, and releases both images',async()=>{
 const h=fixture(),job=h.capture();assert.equal(h.source.style.visibility,'hidden');h.arrive();job.arrive();assert.equal(h.target.style.visibility,'hidden');
 for(let i=0;i<3;i++)h.tick();assert.equal(h.animations.length,2);assert.equal(h.layer.dataset.motionReturn,'moving');
 const outer=h.animations[0].frames,inner=h.animations[1].frames;assert.equal(outer.length,61);assert.match(outer.at(-1).transform,/translate\(80px,300px\) scale\(1,1\)/);
 const sx=800/300,sy=450/200;const values=inner[0].transform.match(/scale\(([^,]+),([^\)]+)\)/);assert.ok(Math.abs(Number(values[1])*sx-Number(values[2])*sy)<1e-9,'net image scale is uniform');
 h.animations[0].finish();await Promise.resolve();assert.equal(h.source.style.visibility,'visible');assert.equal(h.target.style.visibility,'');assert.equal(h.layer.removed,true);assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
});
for(const event of ['wheel','touchstart','resize','keydown'])test(`user ${event} cancels captured geometry and restores inline visibility`,()=>{const h=fixture(),job=h.capture();h.listeners.get(event)();job.arrive();assert.equal(h.layer.removed,true);assert.equal(h.source.style.visibility,'visible');assert.equal(h.animations.length,0);assert.equal(h.raf.size,0);});
test('missing destination and slow commit cannot leave a cover hidden',()=>{for(const missing of [true,false]){const h=fixture(),job=h.capture();if(missing){h.missing();job.arrive();h.tick();}else [...h.timers.values()][0]();assert.equal(h.layer.removed,true);assert.equal(h.source.style.visibility,'visible');}});
test('offscreen and undecoded source do not fabricate a flying cover',()=>{assert.equal(fixture({offscreen:true}).capture(),null);assert.equal(fixture({loaded:false}).capture(),null);});
test('restoration is observed until stable, without writing scroll or history',()=>{const h=fixture(),job=h.capture();h.arrive();job.arrive();h.tick();h.target.rect.y=420;h.tick();h.tick();assert.equal(h.animations.length,0);h.tick();assert.equal(h.animations.length,2);job.cancel();});
test('nested max-height image captures actual pixels, not the taller aspect-ratio placeholder',()=>{const h=fixture({nested:true}),job=h.capture();assert.equal(h.layer.style.height,'450px');job.cancel();});
test('duplicate homepage cover chooses the visible occurrence and respects its clipping radius',()=>{const h=fixture({duplicate:true,clipped:true}),job=h.capture();h.arrive();job.arrive();for(let i=0;i<3;i++)h.tick();const last=h.animations[0].frames.at(-1);assert.equal(last.transform,'translate(80px,300px) scale(1,1)');assert.equal(last.borderRadius,'16px 16px 16px 16px / 16px 16px 16px 16px');job.cancel();});
test('history scroll settlement survives cancellation of its optional cover',()=>{const h=fixture();h.root.style.scrollBehavior='smooth';const release=h.hold(),cover=h.capture();cover.cancel();assert.equal(h.root.style.scrollBehavior,'auto');release();assert.equal(h.root.style.scrollBehavior,'smooth');assert.equal(h.timers.size,0);});
test('forward/offscreen history also suppresses queued smooth scrolling, then releases on input or timeout',()=>{for(const event of ['pointerdown','wheel','keydown','timeout']){const h=fixture({offscreen:true});h.hold();assert.equal(h.capture(),null);assert.equal(h.root.style.scrollBehavior,'auto');if(event==='timeout')[...h.timers.values()][0]();else h.listeners.get(event)();assert.equal(h.root.style.scrollBehavior,'');assert.equal(h.listeners.size,0);}});
