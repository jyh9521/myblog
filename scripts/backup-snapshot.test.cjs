const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('snapshot restores all components, rejects corruption/traversal and refuses nonempty targets',()=>{
  assert.ok(fs.existsSync('scripts/backup-snapshot.cjs'),'backup command exists');
  const {createSnapshot,verifySnapshot,restoreSnapshot}=require('./backup-snapshot.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-snapshot-'));
  try{
    const source=path.join(root,'source');for(const part of ['git','r2','d1'])fs.mkdirSync(path.join(source,part),{recursive:true});
    fs.writeFileSync(path.join(source,'git/repo.bundle'),'fixture git bytes');fs.writeFileSync(path.join(source,'r2/图片.png'),'fixture image');fs.writeFileSync(path.join(source,'d1/accounts.sql'),'CREATE TABLE example(id INTEGER);');
    const output=path.join(root,'snapshot');createSnapshot(source,output,{scope:'fixture',sourceRevision:'a'.repeat(40)});
    assert.equal(verifySnapshot(output).files.length,3);const restored=path.join(root,'restored');const status=restoreSnapshot(output,restored);
    assert.equal(status.scope,'fixture');assert.equal(status.integrity,'verified');assert.equal(fs.readFileSync(path.join(restored,'r2/图片.png'),'utf8'),'fixture image');assert.throws(()=>restoreSnapshot(output,restored),/empty/);
    fs.appendFileSync(path.join(output,'files/r2/图片.png'),'corrupt');assert.throws(()=>restoreSnapshot(output,path.join(root,'bad')),/checksum/);assert.equal(fs.existsSync(path.join(root,'bad')),false);
    const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));manifest.files[0].path='../escape';fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest));assert.throws(()=>verifySnapshot(output),/path/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
