import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {repo} from './resource-manifest.mjs';
const worker=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),bucket=args[0],manifestPath=resolve(args[1]||resolve(repo,'../r2-migration-evidence/source-manifest.json'));
if(!['blog-public-assets-preview','blog-public-assets'].includes(bucket)||bucket==='blog-public-assets'&&!args.includes('--production'))throw Error('Explicit preview bucket, or --production for production bucket, required');
const mode=args.includes('--local')?'--local':'--remote';
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const evidence=resolve(repo,'../r2-migration-evidence',bucket);mkdirSync(evidence,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');
async function cli(options,allowMissing=false) {
  const result=await new Promise((done,fail)=>{const child=spawn(process.execPath,[resolve(worker,'node_modules/wrangler/bin/wrangler.js'),'r2','object',...options,mode],{cwd:worker,windowsHide:true});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);child.on('error',fail);child.on('close',code=>done({code,log}));});
  if(result.code!==0&&!(allowMissing&&result.log.includes('The specified key does not exist.')))throw Error(result.log);
  return result;
}
let cursor=0;const results=[];
await Promise.all(Array.from({length:2},async()=>{
  while(cursor<manifest.files.length){const file=manifest.files[cursor++],source=resolve(repo,file.source),destination=resolve(evidence,hash(Buffer.from(file.key))+'.bin');
    if(!source.startsWith(resolve(repo,'public/uploads')+'/')&&!source.startsWith(resolve(repo,'public/uploads')+'\\'))throw Error('Source escaped uploads');
    const bytes=readFileSync(source);if(hash(bytes)!==file.sha256||bytes.length!==file.bytes)throw Error('Source changed after manifest: '+file.key);
    const existing=await cli(['get',bucket+'/'+file.key,'--file',destination],true);let action='already-identical';
    if(existing.code===0){if(hash(readFileSync(destination))!==file.sha256)throw Error('Existing bucket object differs, no overwrite: '+file.key);}
    else {await cli(['put',bucket+'/'+file.key,'--file',source,'--content-type',file.contentType,'--cache-control','public, max-age=300']);action='copied';}
    await cli(['get',bucket+'/'+file.key,'--file',destination]);const downloaded=readFileSync(destination);
    if(hash(downloaded)!==file.sha256||downloaded.length!==file.bytes)throw Error('Downloaded object mismatch: '+file.key);
    results.push({key:file.key,bytes:file.bytes,sha256:file.sha256,action,verified:true});
    writeFileSync(resolve(evidence,'copy-results.json'),JSON.stringify({bucket,mode,complete:results.length===manifest.files.length,sourceCommit:manifest.sourceCommit,results},null,2));
    console.log('R2_COPY '+results.length+'/'+manifest.files.length+' '+file.key+' '+action+' sha256=verified');
  }
}));
await cli(['put',bucket+'/.catalog/initial.json','--file',manifestPath,'--content-type','application/json','--cache-control','no-store']);
console.log('R2_COPY_RESULT bucket='+bucket+' files='+results.length+' bytes='+manifest.totalBytes+' mismatches=0 mode='+mode);
