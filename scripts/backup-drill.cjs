// Disposable, offline rehearsal. Never reads or imports production databases.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite'),{createSnapshot,restoreSnapshot}=require('./backup-snapshot.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'blog-recovery-drill-'));
try{
  const repo=path.join(root,'repo'),staging=path.join(root,'staging');fs.mkdirSync(repo);
  const git=(args,cwd=repo)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(['init']);git(['config','user.name','Recovery Fixture']);git(['config','user.email','fixture@example.invalid']);fs.writeFileSync(path.join(repo,'article.md'),'恢复样例');git(['add','article.md']);git(['commit','-m','Fixture']);
  for(const part of ['git','r2','d1'])fs.mkdirSync(path.join(staging,part),{recursive:true});
  git(['bundle','create',path.join(staging,'git/repo.bundle'),'--all']);
  fs.writeFileSync(path.join(staging,'r2/image.txt'),'synthetic resource bytes');
  fs.writeFileSync(path.join(staging,'d1/example.sql'),"CREATE TABLE example(id INTEGER PRIMARY KEY, body TEXT); INSERT INTO example VALUES(1,'恢复样例');");
  const snapshot=path.join(root,'snapshot'),restored=path.join(root,'restored');createSnapshot(staging,snapshot,{scope:'fixture',sourceRevision:git(['rev-parse','HEAD']).trim()});const status=restoreSnapshot(snapshot,restored);
  git(['bundle','verify',path.join(restored,'git/repo.bundle')]);const clone=path.join(root,'clone');git(['clone',path.join(restored,'git/repo.bundle'),clone]);assert.equal(fs.readFileSync(path.join(clone,'article.md'),'utf8'),'恢复样例');
  const database=new DatabaseSync(':memory:');database.exec(fs.readFileSync(path.join(restored,'d1/example.sql'),'utf8'));assert.equal(database.prepare('SELECT body FROM example WHERE id=1').get().body,'恢复样例');database.close();assert.equal(fs.readFileSync(path.join(restored,'r2/image.txt'),'utf8'),'synthetic resource bytes');
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/recovery-drill.json',JSON.stringify({...status,fixtureChecks:['git-bundle-clone','r2-byte-equality','sqlite-import-query']},null,2));
  console.log('RECOVERY_DRILL fixture Git clone + R2 bytes + SQLite import/query PASS; production not tested');
}finally{fs.rmSync(root,{recursive:true,force:true});}
