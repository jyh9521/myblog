const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('health report attributes public missing assets/links and never serializes private titles',async()=>{
  assert.ok(fs.existsSync('scripts/build-maintenance-health.cjs'),'health generator exists');
  const {buildHealth}=require('./build-maintenance-health.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-health-'));
  try {
    for(const d of ['content/posts','content/games','reports','public/uploads'])fs.mkdirSync(path.join(root,d),{recursive:true});
    fs.writeFileSync(path.join(root,'content/posts/a.md'),'---\ntitle: Public\nattachment: /uploads/missing.zip\n---\n![pic](/uploads/missing.png)\n[link](https://example.test/gone)\n![reference][pic]\n\n[pic]: /uploads/reference.png');
    fs.writeFileSync(path.join(root,'content/posts/secret.md'),'---\ntitle: SecretTitle\naccess: {mode: unlisted}\n---\nSecretBody');
    fs.writeFileSync(path.join(root,'reports/link-audit.json'),JSON.stringify([{url:'https://example.test/gone',state:'broken',status:404}]));
    fs.writeFileSync(path.join(root,'content/games/g.md'),'---\ntitle: Game\n---\n');
    const r=await buildHealth(root);assert.ok(r.issues.some(x=>x.message.includes("missing.zip")));assert.ok(r.issues.some(x=>x.message.includes("reference.png")));assert.ok(r.issues.some(x=>x.kind==='missing-asset'&&x.href==='/posts/a/'));assert.ok(r.issues.some(x=>x.kind==='broken-link'));
    assert.ok(r.issues.some(x=>x.kind==='game-fields'));assert.equal(JSON.stringify(r).includes('Secret'),false);assert.equal(r.backup.state,'unverified');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
