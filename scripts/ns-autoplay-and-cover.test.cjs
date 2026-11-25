const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('NS uses the lifecycle-scoped player and retains the existing MP3',()=>{
 const page=fs.readFileSync('app/ns/page.tsx','utf8');
 assert.match(page,/<NsAudio\s*\/>/);
 assert.ok(fs.statSync('public/ns/audio/changhuijiakankan.mp3').size>0);
});
test('dossier keeps URL and SteamGridDB but not direct cover upload',()=>{
 const widget=fs.readFileSync('public/sveltia/game-dossier.js','utf8');
 assert.doesNotMatch(widget,/coverBusy|coverMessage|上传游戏封面/);
 assert.match(widget,/field\('cover',/);
 assert.match(widget,/h\(GameCoverPicker,/);
});
