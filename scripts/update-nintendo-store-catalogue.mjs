import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizedTitle} from '../workers/gaming-accounts/src/store-links.js';
export function compactCatalogue(source){
  const byId={},byTitle={};
  for(const row of Object.values(source)){
    if(typeof row?.id!=='string'||!/^[a-f0-9]{16}$/i.test(row.id)||typeof row.name!=='string'||!row.name.trim()||!/^\d{14}$/.test(String(row.nsuId))||row.isDemo)continue;
    const entry={id:row.id.toLowerCase(),title:row.name,nsuid:String(row.nsuId)};
    (byId[entry.id]??=[]).push([entry.nsuid,entry.title]);
    (byTitle[normalizedTitle(entry.title)]??=[]).push([entry.nsuid,entry.id]);
  }
  const stable=map=>Object.fromEntries(Object.keys(map).sort().map(key=>[key,map[key].sort((a,b)=>a[0].localeCompare(b[0]))]));
  return {version:1,source:'https://github.com/blawar/titledb',byId:stable(byId),byTitle:stable(byTitle)};
}
async function update(){
  const response=await fetch('https://raw.githubusercontent.com/blawar/titledb/master/JP.ja.json',{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Catalogue HTTP ${response.status}`);
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024*1024)throw Error('Catalogue exceeds size limit');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const result=compactCatalogue(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if(Object.keys(result.byId).length<1000)throw Error('Catalogue unexpectedly incomplete');
  const content=JSON.stringify(result)+'\n';if(Buffer.byteLength(content)>5*1024*1024)throw Error('Compact catalogue exceeds Worker limit');
  const path=new URL('../public/data/nintendo-store-catalogue.json',import.meta.url);
  let previous;try{previous=await readFile(path,'utf8');}catch{}
  if(previous===content){console.log('Nintendo store catalogue unchanged');return;}
  await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
  const temporary=fileURLToPath(path)+'.tmp';await writeFile(temporary,content);await rename(temporary,path);
  console.log(`Nintendo store catalogue updated: ${Object.keys(result.byId).length} title IDs, ${Buffer.byteLength(content)} bytes`);
}
if(process.argv[1]===fileURLToPath(import.meta.url))update().catch(e=>{console.error(e.message);process.exitCode=1;});
