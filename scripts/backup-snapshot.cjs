const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const parts=['git','r2','d1'],sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function regular(file){if(!fs.lstatSync(file).isFile())throw Error('Expected regular file, not symlink: '+file);}
function safe(relative){if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.includes(':')||relative.split('/').some(part=>!part||part==='.'||part==='..'||/[\x00-\x1f]/.test(part))||!parts.includes(relative.split('/')[0]))throw Error('Invalid snapshot path');return relative;}
function noSymlinks(file){let current=path.resolve(file);while(true){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Symlink path is not allowed');const parent=path.dirname(current);if(parent===current)break;current=parent;}}
function emptyDestination(destination){noSymlinks(destination);if(fs.existsSync(destination)&&(!fs.statSync(destination).isDirectory()||fs.readdirSync(destination).length))throw Error('Destination must be empty');}
function walk(root,prefix=''){return fs.readdirSync(path.join(root,prefix),{withFileTypes:true}).flatMap(item=>{const relative=(prefix?prefix+'/':'')+item.name;if(item.isSymbolicLink())throw Error('Symlink source is not allowed');if(item.isDirectory())return walk(root,relative);regular(path.join(root,relative));return[relative];});}
function createSnapshot(source,destination,{scope='fixture',sourceRevision}={}) {
  source=path.resolve(source);destination=path.resolve(destination);noSymlinks(source);emptyDestination(destination);
  if(destination===source||destination.startsWith(source+path.sep)||source.startsWith(destination+path.sep))throw Error('Source and destination must not overlap');
  if(!['fixture','production'].includes(scope)||!/^[a-f0-9]{40}$/.test(sourceRevision||''))throw Error('Scope and sourceRevision required');
  const files=walk(source).map(relative=>{safe(relative);const bytes=fs.readFileSync(path.join(source,relative));return{path:relative,bytes:bytes.length,sha256:sha(bytes)};});
  for(const part of parts)if(!files.some(file=>file.path.startsWith(part+'/')))throw Error('Missing component: '+part);
  const manifest={version:1,scope,sourceRevision,createdAt:new Date().toISOString(),files};
  for(const file of files){const target=path.join(destination,'files',file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,file.path),target);}
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));verifySnapshot(destination);return manifest;
}
function verifySnapshot(directory) {
  noSymlinks(directory);regular(path.join(directory,'manifest.json'));const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1||!['fixture','production'].includes(manifest.scope)||!/^[a-f0-9]{40}$/.test(manifest.sourceRevision)||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Invalid manifest');
  const seen=new Set();for(const file of manifest.files){safe(file.path);const key=file.path.toLowerCase();if(seen.has(key))throw Error('Duplicate path');seen.add(key);const absolute=path.join(directory,'files',file.path);noSymlinks(absolute);regular(absolute);const bytes=fs.readFileSync(absolute);if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Snapshot checksum mismatch: '+file.path);}
  for(const part of parts)if(!manifest.files.some(file=>file.path.startsWith(part+'/')))throw Error('Missing component: '+part);
  return manifest;
}
function restoreSnapshot(source,destination) {
  const manifest=verifySnapshot(source);emptyDestination(destination);
  const absoluteSource=path.resolve(source),absoluteTarget=path.resolve(destination);if(absoluteTarget===absoluteSource||absoluteTarget.startsWith(absoluteSource+path.sep)||absoluteSource.startsWith(absoluteTarget+path.sep))throw Error('Source and destination must not overlap');
  for(const file of manifest.files){const target=path.join(destination,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,'files',file.path),target);if(sha(fs.readFileSync(target))!==file.sha256)throw Error('Restored checksum mismatch');}
  const status={version:1,scope:manifest.scope,integrity:'verified',restoredAt:new Date().toISOString(),snapshotAt:manifest.createdAt,sourceRevision:manifest.sourceRevision,files:manifest.files.length,components:parts,level:'file-restore-only'};
  fs.writeFileSync(path.join(destination,'RESTORE_STATUS.json'),JSON.stringify(status,null,2));return status;
}
module.exports={createSnapshot,verifySnapshot,restoreSnapshot};
if(require.main===module){try{const [command,source,destination,revision,scope]=process.argv.slice(2);let result;if(command==='create'&&destination)result=createSnapshot(source,destination,{sourceRevision:revision,scope});else if(command==='verify')result=verifySnapshot(source);else if(command==='restore'&&destination)result=restoreSnapshot(source,destination);else throw Error('Usage: backup-snapshot.cjs create STAGING SNAPSHOT REVISION fixture|production | verify SNAPSHOT | restore SNAPSHOT EMPTY_DIRECTORY');console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
