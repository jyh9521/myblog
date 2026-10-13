import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {buildAssetIndex}=require('../../../scripts/build-asset-index.cjs');
const {imageSize}=require('../../../node_modules/image-size');
export const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const mimeFor=key=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',svg:'image/svg+xml',pdf:'application/pdf',mp3:'audio/mpeg',mp4:'video/mp4',ogg:'audio/ogg',wav:'audio/wav',zip:'application/zip',txt:'text/plain; charset=utf-8'}[key.split('.').pop().toLowerCase()]||'application/octet-stream');
export async function resourceManifest(root=repo) {
  const index=await buildAssetIndex(root);
  const files=index.files.filter(f=>existsSync(resolve(root,'public'+decodeURIComponent(f.path)))).map(f=>{
    const key=decodeURIComponent(f.path).slice('/uploads/'.length);
    if(!key||key.split('/').some(p=>p==='.'||p==='..'||!p)||/[\\\x00-\x1f?#]/.test(key))throw Error('Invalid source asset key: '+key);
    const source='public'+decodeURIComponent(f.path),data=readFileSync(resolve(root,source));
    let width,height;try{if(f.image){const s=imageSize(data);width=s.width;height=s.height;}}catch{}
    return {...f,key,source,contentType:mimeFor(key),md5:createHash('md5').update(data).digest('hex'),width,height};
  });
  return {schema:1,sourceCommit:index.commit,generatedAt:index.generatedAt,totalBytes:files.reduce((n,f)=>n+f.bytes,0),files};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const output=resolve(process.argv[2]||resolve(repo,'../r2-migration-evidence/source-manifest.json'));
  const manifest=await resourceManifest();mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(manifest,null,2));
  console.log('RESOURCE_MANIFEST files='+manifest.files.length+' bytes='+manifest.totalBytes+' path='+output);
}
