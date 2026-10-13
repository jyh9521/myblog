const fs=require('node:fs'),path=require('node:path');
function resourceCatalog(root=process.cwd()) {
  const file=path.join(root,'public/sveltia/r2-assets.json');
  if(!fs.existsSync(file))return {files:[]};
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(value.schema!==1||!Array.isArray(value.files))throw Error('Invalid resource catalog');
  return value;
}
function resourceFor(url,root=process.cwd()) {
  if(typeof url!=='string'||!url.startsWith('/uploads/'))return null;
  let pathname;try{pathname=decodeURIComponent(url.split(/[?#]/)[0]);}catch{return null;}
  if(pathname.split('/').some(p=>p==='.'||p==='..')||/[\\\x00-\x1f]/.test(pathname))return null;
  return resourceCatalog(root).files.find(f=>decodeURIComponent(f.path)===pathname)||null;
}
module.exports={resourceCatalog,resourceFor};
