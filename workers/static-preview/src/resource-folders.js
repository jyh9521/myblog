// Logical directories never rename public object keys. One conditional metadata
// write makes a multi-file move or recursive rename atomic across administrators.
export const FOLDER_STATE_KEY='.catalog/folders.json';
export function folderPath(value) {
  if(typeof value!=='string'||value.length>512||/[\\\x00-\x1f\x7f?:*"<>|#]/.test(value))return null;
  if(value==='')return '';
  const parts=value.split('/');if(parts.length>12||parts.some(p=>!p||p.startsWith('.')||p.trim()!==p||p.length>100))return null;
  return value.normalize('NFC');
}
export const defaultFolder=key=>key.startsWith('cms/')?'上传文件':key.split('/').slice(0,-1).join('/');
export function folderLayout(files,state={folders:[],assignments:{}}) {
  const folders=new Set(state.folders);
  const rows=files.map(file=>({...file,folder:Object.hasOwn(state.assignments,file.key)?state.assignments[file.key]:defaultFolder(file.key)}));
  for(const file of rows)if(file.folder)folders.add(file.folder);
  for(const folder of [...folders]){const parts=folder.split('/');for(let n=1;n<parts.length;n++)folders.add(parts.slice(0,n).join('/'));}
  return {files:rows,folders:[...folders].sort((a,b)=>a.localeCompare(b))};
}
export function planFolders(input,files,state) {
  const layout=folderLayout(files,state),known=new Set(['',...layout.folders]),folders=new Set(layout.folders),assignments={...state.assignments};
  const destination=folderPath(input.destination);
  if(input.action==='create') {
    if(destination===null||!destination)throw Error('INVALID_FOLDER');
    if(known.has(destination))throw Error('FOLDER_EXISTS');
    const parent=destination.split('/').slice(0,-1).join('/');if(!known.has(parent))throw Error('FOLDER_NOT_FOUND');
    folders.add(destination);
  }else if(input.action==='rename') {
    const source=folderPath(input.source);
    if(!source||destination===null||!destination)throw Error('INVALID_FOLDER');
    if(!known.has(source))throw Error('FOLDER_NOT_FOUND');
    if(known.has(destination)||destination.startsWith(source+'/'))throw Error('FOLDER_EXISTS');
    if(source.split('/').slice(0,-1).join('/')!==destination.split('/').slice(0,-1).join('/'))throw Error('INVALID_FOLDER');
    const beneath=value=>value===source||value.startsWith(source+'/');
    for(const folder of [...folders])if(beneath(folder)){folders.delete(folder);folders.add(destination+folder.slice(source.length));}
    for(const file of layout.files)if(beneath(file.folder))assignments[file.key]=destination+file.folder.slice(source.length);
    // Archived assignments are retained too, so restoring a file respects rename.
    for(const [key,folder] of Object.entries(assignments))if(beneath(folder))assignments[key]=destination+folder.slice(source.length);
  }else if(input.action==='delete') {
    const source=folderPath(input.source);if(!source||!known.has(source))throw Error('FOLDER_NOT_FOUND');
    if(layout.files.some(f=>f.folder===source||f.folder.startsWith(source+'/'))||layout.folders.some(f=>f.startsWith(source+'/')))throw Error('FOLDER_NOT_EMPTY');
    folders.delete(source);
  }else if(input.action==='move') {
    if(destination===null||!known.has(destination))throw Error('FOLDER_NOT_FOUND');
    if(!Array.isArray(input.keys)||!input.keys.length||input.keys.length>500||input.keys.some(k=>typeof k!=='string')||new Set(input.keys).size!==input.keys.length)throw Error('INVALID_SELECTION');
    const active=new Set(files.map(f=>f.key));if(input.keys.some(key=>!active.has(key)))throw Error('RESOURCE_CHANGED');
    for(const key of input.keys)assignments[key]=destination;
  }else throw Error('INVALID_FOLDER_ACTION');
  if(folders.size>2000||Object.keys(assignments).length>10000)throw Error('FOLDER_LIMIT');
  return {schema:1,folders:[...folders],assignments};
}
