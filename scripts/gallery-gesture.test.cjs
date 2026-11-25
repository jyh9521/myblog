const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(){const m={exports:{}};new Function('exports','module',ts.transpile(fs.readFileSync(require('node:path').join(__dirname,'../lib/gallery-gesture.ts'),'utf8'),{module:ts.ModuleKind.CommonJS}))(m.exports,m);return m.exports.gallerySwipe;}
test('gallery accepts deliberate horizontal swipes, not vertical, diagonal, short or cancelled gestures',()=>{
 const swipe=load();
 assert.equal(swipe({x:200,y:200},{x:100,y:210}),1);
 assert.equal(swipe({x:200,y:200},{x:300,y:190}),-1);
 assert.equal(swipe({x:220,y:260},{x:140,y:520}),0);
 assert.equal(swipe({x:200,y:200},{x:140,y:260}),0);
 assert.equal(swipe({x:200,y:200},{x:160,y:200}),0);
 assert.equal(swipe(null,{x:0,y:200}),0);
});
