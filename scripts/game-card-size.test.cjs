const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('Archive cards have uniform responsive sizes and show proportional, uncropped covers',()=>{
 const css=fs.readFileSync('app/style.css','utf8');
 assert.match(css,/\.game-shelf-item\{[^}]*height:240px;min-height:0/);
 assert.match(css,/\.game-shelf-art img\{position:absolute;inset:0;[^}]*height:100%;min-height:0;object-fit:contain}/);
 assert.match(css,/@media\(max-width:700px\)\{\.game-shelf-item\{[^}]*grid-template-rows:160px minmax\(0,1fr\)[^}]*height:420px/);
 assert.match(css,/\.game-shelf-copy\{[^}]*min-height:0;overflow:auto/);
});
