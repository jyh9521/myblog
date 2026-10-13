import {test} from 'node:test';import assert from 'node:assert/strict';import {folderPath,folderLayout,planFolders} from './resource-folders.js';
const empty={folders:[],assignments:{}},files=[{key:'games/A/cover.png',path:'/uploads/games/A/cover.png'},{key:'games/A/sub/a.png',path:'/uploads/games/A/sub/a.png'},{key:'cms/hash/a.pdf',path:'/uploads/cms/hash/a.pdf'}];
test('directories derive from original keys; new hash uploads are grouped without hash folders',()=>{const layout=folderLayout(files,empty);assert.deepEqual(layout.folders,['games','games/A','games/A/sub','上传文件']);assert.equal(layout.files[2].folder,'上传文件');for(const p of ['../a','/root','x//a','x\\a','.catalog',' a','a/..','x?y'])assert.equal(folderPath(p),null);assert.equal(folderPath('中文/截图'),'中文/截图');assert.equal(folderPath(''),'');});
test('create, nested rename and bulk move preserve public keys/URLs and archive locations',()=>{
 let state=planFolders({action:'create',destination:'games/中文'},files,empty);state.assignments['old/deleted.png']='games/A/sub';
 state=planFolders({action:'rename',source:'games/A',destination:'games/B'},files,state);let result=folderLayout(files,state);assert.ok(result.folders.includes('games/B/sub'));assert.ok(!result.folders.includes('games/A'));assert.equal(state.assignments['old/deleted.png'],'games/B/sub');assert.deepEqual(result.files.map(f=>f.path),files.map(f=>f.path));
 state=planFolders({action:'move',keys:files.slice(0,2).map(f=>f.key),destination:'games/中文'},files,state);result=folderLayout(files,state);assert.equal(result.files[0].folder,'games/中文');assert.equal(result.files[1].folder,'games/中文');
});
test('invalid or partial bulk mutations fail without modifying the original folder state',()=>{const frozen=JSON.stringify(empty);for(const input of [{action:'create',destination:'missing/sub'},{action:'create',destination:'games/A'},{action:'rename',source:'games/A',destination:'games/A/sub'},{action:'move',keys:['games/A/cover.png','missing'],destination:''},{action:'move',keys:['games/A/cover.png','games/A/cover.png'],destination:''}])assert.throws(()=>planFolders(input,files,empty));assert.equal(JSON.stringify(empty),frozen);});
test('empty folder deletion preserves archived assignments, but files and child folders block deletion',()=>{const state={folders:['empty'],assignments:{'archive/old.png':'empty'}};const next=planFolders({action:'delete',source:'empty'},files,state);assert.ok(!next.folders.includes('empty'));assert.equal(next.assignments['archive/old.png'],'empty');assert.throws(()=>planFolders({action:'delete',source:'games/A'},files,empty),/FOLDER_NOT_EMPTY/);assert.throws(()=>planFolders({action:'delete',source:''},files,empty));});
test('file rename persists across folder rename/move and restores original name without changing URL or hash',()=>{
 const source=files.map(f=>({...f,sha256:'a'.repeat(64)}));
 let state=planFolders({action:'rename-file',key:files[0].key,name:'新封面.png'},source,empty);
 state=planFolders({action:'rename',source:'games/A',destination:'games/B'},source,state);
 state=planFolders({action:'move',keys:[files[0].key],destination:'上传文件'},source,state);
 const row=folderLayout(source,state).files[0];assert.equal(row.name,'新封面.png');assert.equal(row.path,files[0].path);assert.equal(row.sha256,source[0].sha256);assert.equal(row.folder,'上传文件');
 state=planFolders({action:'rename-file',key:files[0].key,name:'cover.png'},source,state);assert.equal(state.names[files[0].key],undefined);assert.equal(folderLayout(source,state).files[0].name,'cover.png');
});
test('file rename rejects missing keys, path names, extension changes and same-folder name conflicts',()=>{
 const source=[...files,{key:'games/A/second.png',path:'/uploads/games/A/second.png'}];const frozen=JSON.stringify(empty);
 for(const name of ['../a.png','a/b.png','x\\a.png',' a.png','.hidden.png','x#y.png','x\n.png','x'.repeat(151)+'.png'])assert.throws(()=>planFolders({action:'rename-file',key:files[0].key,name},source,empty),/INVALID_RESOURCE_NAME/);
 assert.throws(()=>planFolders({action:'rename-file',key:files[0].key,name:'cover.pdf'},source,empty),/RESOURCE_EXTENSION_CHANGED/);
 assert.throws(()=>planFolders({action:'rename-file',key:files[0].key,name:'SECOND.png'},source,empty),/RESOURCE_NAME_EXISTS/);
 assert.throws(()=>planFolders({action:'rename-file',key:'missing',name:'a.png'},source,empty),/RESOURCE_CHANGED/);
 assert.equal(JSON.stringify(empty),frozen);
});
