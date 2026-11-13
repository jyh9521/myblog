(() => {
  const ROOT='/ns/api/resources';
  const errors={ADMIN_LOGIN_REQUIRED:'请返回编辑后台登录后继续。',REFERENCE_TOKEN_REQUIRED:'请返回编辑后台重新登录后继续。',INVALID_ORIGIN:'当前站点来源不匹配。',INPUT_TOO_LARGE:'单文件上限为 20 MiB。',INVALID_FILE_TYPE:'文件类型或内容无效。',RESOURCE_REFERENCED:'最新文章仍引用此文件。',REFERENCE_SOURCE_CHANGED:'文章已更新，请重新检查引用。',RESOURCE_CHANGED:'资源已变化，请刷新后重试。',FOLDER_CHANGED:'目录已被其他窗口更新，请刷新后重试。',FOLDER_EXISTS:'同名文件夹已经存在。',FOLDER_NOT_FOUND:'文件夹已变化，请刷新后重试。',FOLDER_NOT_EMPTY:'请先移出文件和子文件夹，再删除空文件夹。',INVALID_FOLDER:'文件夹名称无效。',INVALID_SELECTION:'请选择有效的文件。',FOLDER_LIMIT:'文件夹或归类数量达到上限。',INVALID_RESOURCE_NAME:'文件名称无效。',RESOURCE_EXTENSION_CHANGED:'请保留原文件扩展名。',RESOURCE_NAME_EXISTS:'当前文件夹已有同名文件。'};
  const element=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
  const dossierScreenshot=file=>file.image&&file.uploadFolder?.startsWith('Game Dossiers/');
  const fileName=file=>{if(file.name)return file.name;try{return decodeURIComponent(file.path.split('/').pop());}catch{return file.path.split('/').pop();}};
  const size=bytes=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
  const validateSelection=(file,mode)=>{if(mode==='image'&&!/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name))throw Error('请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。');if(mode==='pdf'&&!/\.pdf$/i.test(file.name))throw Error('请选择 PDF 文件。');};
  async function api(path,options={}) {const response=await (path==='/catalog'?fetch:window.BlogAdminAuth.request)(ROOT+path,{...options,credentials:'same-origin',cache:'no-store',headers:{'X-Gaming-Admin':'1',...options.headers},signal:AbortSignal.timeout(120000)});let data;try{data=await response.json();}catch{throw Error('资源服务返回了非 JSON 响应（HTTP '+response.status+'）。');}if(!response.ok){const error=Error(errors[data.error]||data.error||'操作失败');error.status=response.status;error.code=data.error;throw error;}return data;}
  const imageAccept='image/png,image/jpeg,image/webp,image/gif,image/avif';
  const get=(entry,key)=>{const value=entry?.getIn?.(['data',key]);return value?.toJS?.()??value;};
  const defaultGameFolder=(entry,gallery=get(entry,'screenshotGallery'))=>{
    const metadata=get(entry,'gameMetadata')||{};
    const english=[gallery?.englishName,metadata.title,metadata.originalName,get(entry,'title')].map(value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[\\/:*?"<>|#]/g,' - ').replace(/[^\x20-\x7e]/g,' ').replace(/^[. ]+|[. ]+$/g,'').replace(/\s+/g,' ').trim()).find(value=>/[a-z]/i.test(value));
    const slug=String(entry?.get?.('slug')||'').replace(/[^a-z0-9-]/gi,'');
    return english||slug ? 'Game Dossiers/'+(english||slug).slice(0,100).trim() : null;
  };
  const destination=entry=>{
    const folder=get(entry,'resourceFolder');
    if(typeof folder==='string'&&folder)return folder;
    if(entry?.get?.('collection')==='games'){
      const gallery=get(entry,'screenshotGallery');
      return gallery?.folder || (gallery?.enabled ? defaultGameFolder(entry) : null);
    }
    return null;
  };
  async function upload(file,folder=null,scoped=false) {
    if(file.size>20*1024*1024)throw Error(errors.INPUT_TOO_LARGE);
    let dimensions={};if(file.type.startsWith('image/'))try{const bitmap=await createImageBitmap(file);dimensions={'X-Image-Width':String(bitmap.width),'X-Image-Height':String(bitmap.height)};bitmap.close();}catch{}
    const send=()=>api('/upload?name='+encodeURIComponent(file.name)+(folder===null?'':'&folder='+encodeURIComponent(folder))+(scoped&&folder?'&destination=entry':''),{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream',...dimensions},body:file});
    const result=await send();
    if(scoped&&folder&&result.folder!==folder.normalize('NFC'))throw Error('资源服务未确认上传目录，请刷新后重试。');
    return result;
  }
  function picker(mode='all',options={}) {
    return new Promise(resolve=>{
      const dialog=element('dialog',undefined,'blog-media-dialog'),heading=element('div',undefined,'blog-media-heading'),title=element('h2',mode==='image'?'选择图片':mode==='pdf'?'选择 PDF':'选择文件'),status=element('p',undefined,'blog-media-status'),search=element('input'),filter=element('select'),list=element('div',undefined,'blog-media-grid'),count=element('p',undefined,'blog-media-count'),uploadInput=element('input'),uploadLabel=element('label',mode==='image'?'上传图片':'上传文件','blog-media-primary blog-media-upload'),tools=element('div',undefined,'blog-media-toolbar'),drop=element('div','也可以把文件拖到这里上传','blog-media-drop'),manage=element('details',undefined,'blog-media-management'),scan=element('button','检查最新引用'),close=element('button','关闭', 'blog-media-close'),browser=element('div',undefined,'blog-media-browser'),sidebar=element('details',undefined,'blog-media-sidebar'),tree=element('nav',undefined,'blog-media-tree'),content=element('div',undefined,'blog-media-content'),breadcrumbs=element('nav',undefined,'blog-media-breadcrumbs'),folderActions=element('div',undefined,'blog-media-folder-actions');
      dialog.setAttribute('aria-label','资源库');search.type='search';search.placeholder='搜索文件名';search.setAttribute('aria-label','搜索文件');filter.setAttribute('aria-label','文件类型');
      for(const [value,label] of [['all','全部类型'],['image','图片'],['pdf','PDF'],['audio','音频'],['video','视频']]){const option=element('option',label);option.value=value;filter.append(option);}filter.value=mode==='image'?'image':mode==='pdf'?'pdf':'all';
      uploadInput.type='file';uploadInput.multiple=!!options.manage;uploadInput.className='blog-media-file-input';uploadInput.setAttribute('aria-label',mode==='image'?'上传图片':'上传文件');if(mode==='image')uploadInput.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';if(mode==='pdf')uploadInput.accept='.pdf';uploadLabel.append(uploadInput);
      status.setAttribute('role','status');close.type=scan.type='button';let files=[],commit='',busy=false,selected=false,view='',folders=[],folderRevision='none',currentFolder=options.folder||'',selecting=false;const checked=new Set();let visibleFiles=[];
      const select=file=>{if(busy)return;selected=true;resolve(file.path);dialog.close();};
      const button=(label,action)=>{const b=element('button',label);b.type='button';b.onclick=action;return b;};
      sidebar.append(element('summary','文件夹'),tree);sidebar.open=!window.matchMedia('(max-width:600px)').matches;tree.setAttribute('aria-label','文件夹树');breadcrumbs.setAttribute('aria-label','当前位置');
      const navigate=folder=>{currentFolder=folder;view='';search.value='';render();};
      const applyCatalog=data=>{files=data.files;folders=data.folders||[];folderRevision=data.folderRevision||'none';commit=data.commit||'';if(!commit)view='';for(const key of checked)if(!files.some(f=>f.key===key))checked.delete(key);if(currentFolder&&!folders.includes(currentFolder)&&currentFolder!==options.folder)currentFolder='';};
      const mutateFolders=async input=>{const send=()=>api('/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,revision:folderRevision})});applyCatalog(await send());};
      const nameDialog=(label,initial,onSave,isFile=false)=>{if(busy)return;const modal=element('dialog',undefined,'blog-media-dialog blog-media-auth'),form=element('form'),input=element('input'),message=element('p'),save=element('button',isFile?'保存文件名':'保存文件夹','blog-media-primary');modal.setAttribute('aria-label',label);input.setAttribute('aria-label',isFile?'文件名称':'文件夹名称');input.value=initial;input.required=true;input.maxLength=isFile?150:100;save.type='submit';message.setAttribute('role','status');form.append(input,message,save,button('取消',()=>modal.close()));form.onsubmit=async e=>{e.preventDefault();const name=input.value.trim().normalize('NFC');if(!name||name.includes('/')){message.textContent=isFile?'请输入文件名称，不要包含路径。':'请输入单个文件夹名称。';return;}busy=true;save.disabled=true;try{await onSave(name);modal.close();status.textContent=isFile?'文件已改名，原有文章链接保持不变。':'文件夹已保存，原有文章链接保持不变。';}catch(error){message.textContent=error.message;if(error.code==='FOLDER_CHANGED')await load();}finally{busy=false;save.disabled=false;render();}};modal.onclose=()=>modal.remove();modal.append(element('h2',label),element('p','改名只更新资源库名称，文件地址和文章引用保持不变。','blog-media-rename-note'),form);document.body.append(modal);modal.showModal();input.focus();input.select();};
      const create=button('新建文件夹',()=>{const parent=currentFolder||'';nameDialog('新建文件夹','',async name=>{const destination=parent?parent+'/'+name:name;await mutateFolders({action:'create',destination});currentFolder=destination;});});
      const renameFolder=source=>nameDialog('重命名文件夹',source.split('/').pop(),async name=>{const parent=source.split('/').slice(0,-1).join('/'),destination=parent?parent+'/'+name:name,active=currentFolder;await mutateFolders({action:'rename',source,destination});if(active===source||active?.startsWith(source+'/'))currentFolder=destination+active.slice(source.length);});
      const rename=button('重命名文件夹',()=>renameFolder(currentFolder));
      const removeFolder=button('删除空文件夹',async()=>{if(busy||!currentFolder||!window.confirm('删除这个空文件夹？文件和子文件夹存在时不会删除。'))return;const source=currentFolder;busy=true;render();try{await mutateFolders({action:'delete',source});currentFolder=source.split('/').slice(0,-1).join('/');status.textContent='空文件夹已删除。';}catch(error){status.textContent=error.message;}finally{busy=false;render();}});
      const multi=button('多选',()=>{selecting=!selecting;if(!selecting)checked.clear();render();});
      const selectAll=button('全选当前文件',()=>{for(const file of visibleFiles)checked.add(file.key);render();});
      const clear=button('取消选择',()=>{checked.clear();render();});
      const move=button('移动所选文件',()=>{if(!checked.size||busy)return;const modal=element('dialog',undefined,'blog-media-dialog blog-media-auth'),form=element('form'),destination=element('select'),message=element('p'),save=element('button','确认移动','blog-media-primary');modal.setAttribute('aria-label','移动所选文件');destination.setAttribute('aria-label','目标文件夹');for(const folder of ['',...folders]){const option=element('option',folder||'根目录');option.value=folder;destination.append(option);}destination.value=currentFolder||'';save.type='submit';message.setAttribute('role','status');form.append(destination,message,save,button('取消',()=>modal.close()));form.onsubmit=async e=>{e.preventDefault();busy=true;save.disabled=true;try{await mutateFolders({action:'move',keys:[...checked],destination:destination.value});currentFolder=destination.value;checked.clear();modal.close();status.textContent='文件已移动，文章链接保持不变。';}catch(error){message.textContent=error.message;if(error.code==='FOLDER_CHANGED')await load();}finally{busy=false;save.disabled=false;render();}};modal.onclose=()=>modal.remove();modal.append(element('h2','移动 '+checked.size+' 个文件'),form);document.body.append(modal);modal.showModal();});
      // Explicit dossier screenshot recycling does not need a reference scan.
      const removed=[];
      const refreshReferences=async()=>{applyCatalog(await api('/references'));};
      const restoreRemoved=button('恢复本次删除',async()=>{if(busy)return;busy=true;render();let restored=0;try{while(removed.length){const item=removed[0];await api('/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:item.receipt.key,trashKey:item.receipt.trashKey})});removed.shift();restored++;}await load();status.textContent='已恢复 '+restored+' 个文件。';}catch(error){status.textContent='已恢复 '+restored+' 个文件；'+error.message;}finally{busy=false;render();}});
      const deleteCheckedReferences=async keys=>{if(busy||!keys.length)return;busy=true;render();let deleted=0;try{status.textContent='删除前正在检查最新引用…';await refreshReferences();const candidates=files.filter(f=>keys.includes(f.key)&&f.sha256&&!f.references?.length),skipped=keys.length-candidates.length;if(!candidates.length){status.textContent='所选文件均被引用或已变化，没有删除。';return;}if(!window.confirm('将 '+candidates.length+' 个未引用文件移至可恢复回收区'+(skipped?'；跳过 '+skipped+' 个已引用或已变化文件':'')+'？草稿和外部链接请自行核对。')){status.textContent='已取消删除。';return;}for(const file of candidates){const receipt=await api('/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:file.key,sha256:file.sha256,commit})});removed.push({receipt});files=files.filter(f=>f.key!==file.key);checked.delete(file.key);deleted++;}status.textContent='已删除 '+deleted+' 个文件（可恢复）'+(skipped?'，跳过 '+skipped+' 个已引用或已变化文件':'')+'。';}catch(error){status.textContent='已删除 '+deleted+' 个文件（可恢复）；'+error.message;}finally{busy=false;render();}};
      const recycleScreenshots=async shots=>{
        busy=true;render();let deleted=0,failed=0,lastError='';
        try{
          for(const file of shots){
            try{
              const receipt=await api('/recycle-screenshot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:file.key,sha256:file.sha256})});
              removed.push({receipt});files=files.filter(f=>f.key!==file.key);checked.delete(file.key);deleted++;
            }catch(error){failed++;lastError=error.message;}
          }
          status.textContent='已移至回收区 '+deleted+' 张截图（可恢复）'+(failed?'；'+failed+' 张失败：'+lastError:'。');
        }finally{busy=false;render();}
      };
      const deleteSelected=button('删除所选文件',async()=>{
        if(busy)return;
        const selection=files.filter(f=>checked.has(f.key));
        const shots=selection.filter(dossierScreenshot);
        if(shots.length)await recycleScreenshots(shots);
        const other=selection.filter(f=>!dossierScreenshot(f)).map(f=>f.key);
        if(other.length)await deleteCheckedReferences(other);
      });
      const scanUnused=button('扫描未引用图片',async()=>{if(busy)return;busy=true;render();status.textContent='正在扫描所有文件夹的最新文章引用…';try{await refreshReferences();currentFolder=null;search.value='';filter.value='image';view='unused';selecting=true;checked.clear();for(const file of files.filter(f=>f.image&&f.sha256&&!f.references?.length))checked.add(file.key);status.textContent='扫描完成：找到 '+checked.size+' 张未引用图片，可核对后点击一键删除。';}catch(error){status.textContent=error.message;}finally{busy=false;render();}});
      const deleteUnused=button('一键删除未引用图片',()=>deleteCheckedReferences(visibleFiles.filter(f=>f.image&&f.sha256&&!f.references?.length).map(f=>f.key)));
      folderActions.append(create,rename,removeFolder,multi,selectAll,clear,move,deleteSelected,scanUnused,deleteUnused,restoreRemoved);
      const renderFolders=()=>{tree.replaceChildren();breadcrumbs.replaceChildren();const item=(label,folder,depth=0)=>{const b=button(label,()=>navigate(folder));b.className='blog-media-tree-item';b.style.paddingLeft=(10+depth*14)+'px';b.setAttribute('aria-label',folder===null?'全部文件':folder===''?'资源库根目录':'打开文件夹 '+folder);if(currentFolder===folder)b.setAttribute('aria-current','page');b.disabled=busy;tree.append(b);};item('全部文件',null);item('根目录','');for(const folder of folders)item(folder.split('/').pop(),folder,folder.split('/').length);breadcrumbs.append(button('资源库',()=>navigate('')));if(currentFolder===null)breadcrumbs.append(element('span',' / 全部文件'));else{const parts=currentFolder?currentFolder.split('/'):[];parts.forEach((name,index)=>{breadcrumbs.append(element('span',' / '),button(name,()=>navigate(parts.slice(0,index+1).join('/'))));});}create.disabled=busy;rename.disabled=removeFolder.disabled=busy||!currentFolder;multi.disabled=busy;multi.textContent=selecting?'退出多选':'多选';selectAll.hidden=clear.hidden=move.hidden=!selecting;selectAll.disabled=busy||!visibleFiles.length;clear.disabled=busy||!checked.size;move.disabled=busy||!checked.size;deleteSelected.hidden=!selecting;deleteSelected.disabled=busy||!checked.size;deleteSelected.textContent='删除所选文件'+(checked.size?'（'+checked.size+'）':'');scanUnused.disabled=busy;deleteUnused.hidden=view!=='unused';deleteUnused.disabled=busy||!visibleFiles.some(f=>f.image&&f.sha256&&!f.references?.length);restoreRemoved.hidden=!removed.length;restoreRemoved.disabled=busy;move.textContent='移动所选文件'+(checked.size?'（'+checked.size+'）':'');};
      const render=()=>{
        list.replaceChildren();const query=search.value.toLocaleLowerCase();const visible=files.filter(f=>(currentFolder===null||(query?f.folder===currentFolder||f.folder?.startsWith(currentFolder?currentFolder+'/':''):f.folder===currentFolder))&&(mode!=='image'||f.image)&&(mode!=='pdf'||f.pdf)&&fileName(f).toLocaleLowerCase().includes(query)&&(filter.value==='all'||filter.value==='image'&&f.image||filter.value==='pdf'&&f.pdf||f.contentType?.startsWith(filter.value+'/'))&&(!view||view==='unused'&&commit&&!f.references?.length||view==='duplicates'&&f.duplicates?.length));
        visibleFiles=visible;renderFolders();count.textContent=`${visible.length} 个文件${view==='unused'?' · 最新文章未引用':view==='duplicates'?' · 内容重复':''}`;
        const children=!query&&currentFolder!==null?folders.filter(folder=>folder.split('/').slice(0,-1).join('/')===currentFolder):[];for(const folder of children){const tile=element('div',undefined,'blog-media-card blog-media-folder-tile'),card=button('',()=>navigate(folder));card.className='blog-media-folder-card';card.setAttribute('aria-label','进入文件夹 '+folder);card.disabled=busy;card.append(element('span','📁','blog-media-folder-icon'),element('strong',folder.split('/').pop()),element('span',files.filter(f=>f.folder===folder||f.folder?.startsWith(folder+'/')).length+' 个文件'));const actions=element('div',undefined,'blog-media-item-actions'),renameItem=button('改名',()=>renameFolder(folder));renameItem.setAttribute('aria-label','改名文件夹 '+folder);renameItem.disabled=busy;actions.append(renameItem);tile.append(card,actions);list.append(tile);}
        if(!visible.length&&!children.length)list.append(element('p',view==='unused'&&!commit?'请先在管理面板检查最新引用。':'没有匹配的文件。可以上传新文件，或换个关键词。','blog-media-empty'));
        for(const file of visible){const card=element('div',undefined,'blog-media-card'),choose=element('button',undefined,'blog-media-choice'),preview=element('div',undefined,'blog-media-thumb');choose.type='button';choose.setAttribute('aria-label','选择 '+fileName(file));choose.onclick=()=>{if(selecting){checked.has(file.key)?checked.delete(file.key):checked.add(file.key);render();}else if(options.manage)window.open(file.path,'_blank','noopener');else select(file);};choose.disabled=busy;
          if(file.image){const image=element('img');image.src=file.path;image.alt='';image.loading='lazy';preview.append(image);}else preview.append(element('span',file.pdf?'PDF':file.contentType?.startsWith('audio/')?'音频':file.contentType?.startsWith('video/')?'视频':'文件','blog-media-file-icon'));
          const name=element('strong',fileName(file),'blog-media-name');name.title=fileName(file);choose.append(preview,name,element('span',size(file.bytes),'blog-media-size'));card.append(choose);const actions=element('div',undefined,'blog-media-item-actions'),renameFile=button('改名',()=>nameDialog('重命名文件',fileName(file),async name=>mutateFolders({action:'rename-file',key:file.key,name}),true));renameFile.setAttribute('aria-label','改名文件 '+fileName(file));renameFile.disabled=busy;actions.append(renameFile);card.append(actions);if(selecting){const box=element('input');box.type='checkbox';box.checked=checked.has(file.key);box.disabled=busy;box.setAttribute('aria-label','选择文件 '+fileName(file));box.onchange=()=>{box.checked?checked.add(file.key):checked.delete(file.key);render();};card.prepend(box);card.classList.toggle('is-selected',checked.has(file.key));}
          if(dossierScreenshot(file)){const remove=button('移至回收区',()=>{if(!busy)void recycleScreenshots([file]);});remove.disabled=busy;card.append(remove);}
          if(manage.open){const info=element('details',undefined,'blog-media-file-info');info.append(element('summary','详细信息'),element('p',decodeURI(file.path)),element('p',file.sha256||'哈希待校验'));if(commit)info.append(element('p',file.references?.length?`引用 ${file.references.length} 处`:'当前文章未引用'));if(file.duplicates?.length)info.append(element('p',`相同内容：${file.duplicates.length} 项`));card.append(info);
            if(!dossierScreenshot(file)&&commit&&file.sha256&&!file.references?.length){const remove=element('button','移至回收区','blog-media-remove');remove.type='button';remove.disabled=busy;remove.onclick=async()=>{if(busy||!window.confirm('当前文章未引用此文件；草稿或外部链接可能仍在使用。移至可恢复回收区？'))return;busy=true;render();try{const result=await api('/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:file.key,sha256:file.sha256,commit})});files=files.filter(f=>f.key!==file.key);const restore=element('button','恢复刚移除的文件');restore.type='button';restore.onclick=async()=>{if(busy)return;busy=true;restore.disabled=true;try{await api('/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:result.key,trashKey:result.trashKey})});files.push(file);status.textContent='文件已恢复。';}catch(error){status.textContent=error.message;}finally{busy=false;render();}};status.replaceChildren(document.createTextNode('已移至回收区。 '),restore);}catch(error){status.textContent=error.message;}finally{busy=false;render();}};card.append(remove);}
          }list.append(card);
        }
      };
      const load=async()=>{status.textContent='正在加载文件…';try{applyCatalog(await api('/catalog'));status.textContent='';render();}catch(error){status.textContent=error.message;}};
      const sendFile=async file=>{if(!file||busy)return;busy=true;uploadInput.disabled=true;uploadLabel.setAttribute('aria-disabled','true');status.textContent='正在上传 '+file.name+'…';render();try{validateSelection(file,mode);const result=await upload(file,options.folder||currentFolder,!!options.folder);if(options.manage){await load();const stored=files.find(f=>f.key===result.key);status.textContent=result.folderWarning?'文件已上传，但目录同时发生了变化。请核对归类。':result.reused?'已复用已有文件，位于 '+(stored?.folder||'根目录')+'。':'上传完成：'+file.name+'。';}else{if(result.folderWarning)window.alert('文件已上传，但目录同时发生了变化。请刷新资源库后核对归类。');busy=false;select(result);}}catch(error){status.textContent=error.message;}finally{busy=false;uploadInput.disabled=false;uploadLabel.removeAttribute('aria-disabled');uploadInput.value='';render();}};
      uploadInput.onchange=async()=>{for(const file of [...uploadInput.files])await sendFile(file);};dialog.ondragover=e=>{e.preventDefault();drop.classList.add('is-dragging');};dialog.ondragleave=()=>drop.classList.remove('is-dragging');dialog.ondrop=async e=>{e.preventDefault();drop.classList.remove('is-dragging');const dropped=[...(e.dataTransfer?.files||[])];for(const file of options.manage?dropped:dropped.slice(0,1))await sendFile(file);};
      scan.onclick=async()=>{if(busy)return;busy=true;scan.disabled=true;status.textContent='正在检查最新文章引用…';try{const result=await api('/references');applyCatalog(result);status.textContent='引用检查完成：'+commit.slice(0,8)+'。';}catch(error){status.textContent=error.message;}finally{busy=false;scan.disabled=false;render();}};
      const showView=(label,value)=>{const button=element('button',label);button.type='button';button.onclick=()=>{view=value;render();};return button;};manage.append(element('summary','管理：引用、重复文件与回收'),element('p','管理操作使用当前后台登录身份，并检查最新文章引用。'),scan,showView('查看未引用','unused'),showView('查看重复','duplicates'),showView('显示全部',''));
      manage.ontoggle=render;search.oninput=render;filter.onchange=()=>{view='';render();};close.onclick=()=>dialog.close();dialog.onclose=()=>{if(!selected)resolve(null);dialog.remove();};
      heading.append(title,close);tools.append(search,filter,uploadLabel);content.append(breadcrumbs,folderActions,tools,drop,count,status,manage,list);browser.append(sidebar,content);dialog.append(heading,browser,element('p','此处文件为公开资源。密码文章请继续使用私密资源入口。','blog-media-note'));document.body.append(dialog);dialog.showModal();load();
    });
  }
  const register=()=>{
    if(!window.CMS?.registerFieldType||!window.createClass||!window.h)return false;
    const h=window.h;
    const button=(label,onClick,disabled=false)=>h('button',{type:'button',onClick,disabled},label);
    const FolderControl=window.createClass({
      getInitialState(){return {folders:[],message:''};},
      async load(){try{this.setState({folders:(await api('/catalog')).folders||[],message:''});}catch(error){this.setState({message:error.message});}},
      render(){
        const value=this.props.value||'';
        return h('div',{className:'blog-media-field'},
          h('label',null,'上传目标（以 / 分隔子目录）',
            h('input',{id:this.props.forID,value,placeholder:'例如 Articles/My Article',maxLength:512,onChange:e=>this.props.onChange(e.target.value)})),
          h('div',{className:'blog-media-field-actions'},
            button('载入现有文件夹',()=>this.load()),
            !!this.state.folders.length&&h('select',{'aria-label':'关联现有文件夹',value:this.state.folders.includes(value)?value:'',onChange:e=>this.props.onChange(e.target.value)},
              h('option',{value:''},'选择现有文件夹'),...this.state.folders.map(folder=>h('option',{key:folder,value:folder},folder))),
            value&&button('取消关联',()=>this.props.onChange(''))),
          this.state.message&&h('p',{role:'status'},this.state.message));
      }
    });
    const GalleryControl=window.createClass({
      getInitialState(){return {busy:false,message:''};},
      update(patch){this.props.onChange({...this.props.value,...patch});},
      async run(task){if(this.state.busy)return;this.setState({busy:true,message:''});try{await task();}catch(error){this.setState({message:error.message});}finally{this.setState({busy:false});}},
      async addFiles(files){
        if(!files.length)return;
        await this.run(async()=>{
          const gallery=this.props.value||{},folder=gallery.folder||defaultGameFolder(this.props.entry,gallery);
          if(!folder)throw Error('请先填写英文游戏名，或选择包含英文名称的游戏资料。');
          const images=[...(gallery.images||[])],errors=[];
          // Browsers expose lastModified, not the original file creation time.
          for(const file of [...files].sort((a,b)=>a.lastModified-b.lastModified)){
            try{
              validateSelection(file,'image');
              const result=await upload(file,folder,true);
              if(!images.includes(result.path))images.push(result.path);
            }catch(error){errors.push(file.name+'：'+error.message);}
          }
          if(images.length!==(gallery.images||[]).length)this.update({folder,images});
          this.setState({message:errors.length?errors.join('；'):'上传完成。保存档案后发布截图。'});
        });
      },
      render(){
        const gallery=this.props.value||{},images=gallery.images||[],folder=gallery.folder||defaultGameFolder(this.props.entry,gallery),busy=this.state.busy;
        const move=(index,to)=>{const next=[...images];[next[index],next[to]]=[next[to],next[index]];this.update({images:next});};
        return h('div',{className:'blog-media-field'},
          h('label',null,h('input',{id:this.props.forID,type:'checkbox',checked:!!gallery.enabled,disabled:busy,onChange:e=>this.update({enabled:e.target.checked})}),' 启用截图展示'),
          gallery.enabled&&h('div',{className:'blog-media-gallery-editor'},
            !gallery.folder&&h('label',null,'英文游戏名（可选，覆盖自动命名）',
              h('input',{value:gallery.englishName||'',maxLength:100,disabled:busy,onChange:e=>this.update({englishName:e.target.value})})),
            h('p',null,'截图目录：'+(folder||'请先填写英文游戏名')),
            h('div',{className:'blog-media-field-actions'},
              h('label',{className:'blog-media-primary blog-media-upload','aria-disabled':busy||!folder},'上传截图',h('input',{type:'file',multiple:true,accept:imageAccept,className:'blog-media-file-input','aria-label':'上传截图',disabled:busy||!folder,onChange:e=>{const files=[...e.target.files];e.target.value='';this.addFiles(files);}})),
              button('从资源库选择',()=>this.run(async()=>{const selected=await picker('image',{folder});if(selected&&!images.includes(selected))this.update({folder,images:[...images,selected]});}),busy||!folder)),
            !!images.length&&h('ol',{className:'blog-media-gallery-list'},...images.map((src,i)=>h('li',{key:src},
              h('img',{src,alt:'截图 '+(i+1),loading:'lazy'}),
              h('div',{className:'blog-media-field-actions'},
                button('上移',()=>move(i,i-1),busy||i===0),
                button('下移',()=>move(i,i+1),busy||i===images.length-1),
                button('移除引用',()=>this.update({images:images.filter(path=>path!==src)}),busy)))))),
          h('p',{role:'status'},busy?'正在处理截图…':this.state.message));
      }
    });
    window.CMS.registerFieldType('resource-folder',FolderControl,()=>null);
    window.CMS.registerFieldType('screenshot-gallery',GalleryControl,()=>null);
    const Control=window.createClass({
      getInitialState(){return {busy:false,message:''};},
      async sendFile(file){if(!file||this.state.busy)return;this.setState({busy:true,message:'正在上传 '+file.name+'…'});try{validateSelection(file,this.props.field.get('widget')==='r2-image'?'image':String(this.props.field.get('accept')||'').includes('pdf')?'pdf':'all');const folder=destination(this.props.entry);const result=await upload(file,folder,!!folder);this.props.onChange(result.path);this.setState({message:'上传完成'});}catch(error){this.setState({message:error.message});}finally{this.setState({busy:false});}},
      render(){const image=this.props.field.get('widget')==='r2-image',pdf=String(this.props.field.get('accept')||'').includes('pdf'),value=this.props.value||'',uploadLabel=image?'上传图片':pdf?'上传 PDF':'上传文件';return h('div',{className:'blog-media-field',onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();this.sendFile(e.dataTransfer?.files?.[0]);},onPaste:e=>{if(e.clipboardData?.files?.length){e.preventDefault();this.sendFile(e.clipboardData.files[0]);}}},image&&value?h('img',{src:value,alt:'图片预览',className:'blog-media-field-preview'}):value?h('p',{className:'blog-media-current-file'},fileName({path:value})):h('p',{className:'blog-media-placeholder'},image?'把图片拖到这里，也可以粘贴截图':'把文件拖到这里'),h('div',{className:'blog-media-field-actions'},h('label',{className:'blog-media-primary blog-media-upload','aria-disabled':this.state.busy},uploadLabel,h('input',{type:'file',className:'blog-media-file-input','aria-label':uploadLabel,disabled:this.state.busy,accept:image?'image/png,image/jpeg,image/webp,image/gif,image/avif':pdf?'.pdf':undefined,onChange:e=>{const file=e.target.files[0];e.target.value='';this.sendFile(file);}})),h('button',{type:'button',disabled:this.state.busy,onClick:async()=>{this.setState({busy:true});try{const selected=await picker(image?'image':pdf?'pdf':'all',{folder:destination(this.props.entry)});if(selected)this.props.onChange(selected);}finally{this.setState({busy:false});}}},image?'选择已有图片':pdf?'选择已有 PDF':'选择已有文件'),value&&h('button',{type:'button',disabled:this.state.busy,onClick:()=>this.props.onChange('')},'移除引用')),this.state.message&&h('p',{role:'status'},this.state.message),h('details',{},h('summary',{},'链接 / 外部地址'),h('input',{id:this.props.forID,value,placeholder:'/uploads/… 或已有网址',onChange:e=>this.props.onChange(e.target.value)})));}
    });
    window.CMS.registerFieldType('r2-image',Control);
    window.CMS.registerFieldType('r2-file',Control);
    // Match images within paragraph/list text too. Anchoring this pattern to
    // the whole text node makes Lexical import ![alt](url) as ! + a link.
    const unescapeMarkup=value=>String(value||'').replace(/\\([!-/:-@[-`{-~])/g,'$1');
    const escapeLabel=value=>String(value||'').replace(/\r?\n/g,' ').replace(/[\\`*_{}\[\]()#+\-.!>|]/g,'\\$&');
    const escapeTitle=value=>String(value||'').replace(/\r?\n/g,' ').replace(/[\\"]/g,'\\$&');
    const imageURL=value=>{
      const src=String(value||'').trim();
      try {
        if(src.startsWith('/uploads/'))return src.split('/').map(part=>encodeURIComponent(decodeURIComponent(part)).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())).join('/');
        if(/^blob:https?:\/\/[^\s"'<>]+$/.test(src))return src;
        if(/^https?:\/\//.test(src))return new URL(src).href.replace(/[()'"]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
      }catch{/* Keep malformed input from interrupting editor mode changes. */}
      return '';
    };
    window.CMS.registerEditorComponent({
      id:'r2-image',label:'插入图片',icon:'image',trigger:'button',
      fields:[{name:'src',label:'图片资源',widget:'r2-image',required:true},{name:'alt',label:'图片描述',widget:'string',required:false},{name:'title',label:'图片标题（可选）',widget:'string',required:false}],
      pattern:/!\[((?:\\[^\r\n]|[^\]\\\r\n])*)\]\(((?:\/uploads\/|https?:\/\/|blob:https?:\/\/)(?:[^\s()\\]|\\[^\r\n]|\([^()\r\n]*\))+)(?:[ \t]+"((?:\\[^\r\n]|[^"\\\r\n])*)")?\)/,
      fromBlock:match=>{
        let src=unescapeMarkup(match[2]);try{src=decodeURI(src);}catch{}
        return {alt:unescapeMarkup(match[1]),src,title:unescapeMarkup(match[3])};
      },
      toBlock:({src='',alt='',title=''}={})=>{
        const url=imageURL(src);if(!url)return '';
        return '!['+escapeLabel(alt)+']('+url+(title?' "'+escapeTitle(title)+'"':'')+')';
      },
      toPreview:({src='',alt='',title=''}={})=>h('img',{src,alt,title}),
    });
    // Native rich-text drag/drop may still create temporary blobs. Move them to R2
    // before save; Sveltia discards draft files no longer referenced by blob URL.
    window.CMS.registerEventListener({name:'preSave',handler:async({entry})=>{
      if(entry.getIn(['data','access','mode'])==='password')return entry;
      const data=entry.get('data').toJS(),uploaded=new Map(),folder=destination(entry);
      const convert=async value=>{
        if(typeof value==='string'){const blobs=[...value.matchAll(/blob:https?:\/\/[^\s"'<>\])]+/g)].map(m=>m[0]);for(const url of blobs){if(!uploaded.has(url)){const blob=await(await fetch(url)).blob();const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif','application/pdf':'pdf','audio/mpeg':'mp3','video/mp4':'mp4'})[blob.type];if(!ext)throw Error('请通过 R2 资源库上传该类型文件。');uploaded.set(url,(await upload(new File([blob],'upload.'+ext,{type:blob.type}),folder,!!folder)).path);}value=value.split(url).join(uploaded.get(url));}return value;}
        if(Array.isArray(value))return Promise.all(value.map(convert));
        if(value&&typeof value==='object'){const out={};for(const [key,item] of Object.entries(value))out[key]=await convert(item);return out;}return value;
      };
      for(const [key,value] of Object.entries(data))entry=entry.setIn(['data',key],await convert(value));return entry;
    }});
    return true;
  };
  window.BlogResources={upload,picker,destination};
  if(!register()){const timer=setInterval(()=>{if(register())clearInterval(timer);},200);}
})();
