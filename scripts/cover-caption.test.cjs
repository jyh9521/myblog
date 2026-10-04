const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('Cover parallax is clipped independently of its wrapping caption',()=>{
 const jsx=fs.readFileSync('app/posts/post-content.tsx','utf8');
 const css=fs.readFileSync('app/style.css','utf8');
 assert.match(jsx, /className="article-cover-viewport"><RetryableImage[^\n]+imageClass="cover cover-parallax"[^\n]+\/><\/span><span className="article-image-caption">/);
 assert.match(css,/\.article-cover-viewport\{[^}]*overflow:hidden[^}]*\}/);
 assert.match(css,/\.article-cover-button \.cover\{margin:0\}/);
 assert.match(css,/\.article-cover-button \.article-image-caption\{[^}]*overflow-wrap:anywhere/);
});
