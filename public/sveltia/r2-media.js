(() => {
  const ROOT='/ns/api/resources';
  const errors={ADMIN_LOGIN_REQUIRED:'上传需要验证编辑身份。',REFERENCE_TOKEN_REQUIRED:'请在管理面板验证身份后检查引用。',INVALID_ORIGIN:'当前站点来源不匹配。',INPUT_TOO_LARGE:'单文件上限为 20 MiB。',INVALID_FILE_TYPE:'文件类型或内容无效。',RESOURCE_REFERENCED:'最新文章仍引用此文件。',REFERENCE_SOURCE_CHANGED:'文章已更新，请重新检查引用。',RESOURCE_CHANGED:'资源已变化，请刷新后重试。'};
  const element=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
  const fileName=file=>{try{return decodeURIComponent(file.path.split('/').pop());}catch{return file.path.split('/').pop();}};
  const size=bytes=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
  const validateSelection=(file,mode)=>{if(mode==='image'&&!/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name))throw Error('请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。');if(mode==='pdf'&&!/\.pdf$/i.test(file.name))throw Error('请选择 PDF 文件。');};
  async function api(path,options={}) {const response=await fetch(ROOT+path,{...options,credentials:'same-origin',cache:'no-store',headers:{'X-Gaming-Admin':'1',...options.headers},signal:AbortSignal.timeout(120000)});const data=await response.json();if(!response.ok){const error=Error(errors[data.error]||data.error||'操作失败');error.status=response.status;throw error;}return data;}
  async function login(value) {const r=await fetch('/ns/api/accounts/session',{method:'POST',credentials:'same-origin',headers:{'X-Gaming-Admin':'1','Content-Type':'application/json'},body:JSON.stringify({token:value})});if(!r.ok)throw Error('身份验证失败，请检查 GitHub Token。');}
  let loginPromise;
  function requestLogin() {
    if(loginPromise)return loginPromise;
    loginPromise=new Promise(resolve=>{
      const dialog=element('dialog',undefined,'blog-media-dialog blog-media-auth'),form=element('form'),token=element('input'),status=element('p'),submit=element('button','验证并继续','blog-media-primary'),cancel=element('button','取消');let accepted=false;
      dialog.setAttribute('aria-label','验证上传身份');token.type='password';token.autocomplete='off';token.required=true;token.setAttribute('aria-label','上传身份 GitHub Token');token.placeholder='GitHub Token';submit.type='submit';cancel.type='button';status.setAttribute('role','status');
      form.onsubmit=async e=>{e.preventDefault();const value=token.value;token.value='';submit.disabled=true;try{await login(value);accepted=true;dialog.close();}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
      cancel.onclick=()=>dialog.close();dialog.onclose=()=>{token.value='';dialog.remove();resolve(accepted);};
      form.append(token,status,submit,cancel);dialog.append(element('h2','验证上传身份'),element('p','首次上传时验证一次，随后使用当前浏览器会话，无需逐个文件登录。'),form);document.body.append(dialog);dialog.showModal();token.focus();
    }).finally(()=>{loginPromise=null;});return loginPromise;
  }
  async function upload(file) {
    if(file.size>20*1024*1024)throw Error(errors.INPUT_TOO_LARGE);
    let dimensions={};if(file.type.startsWith('image/'))try{const bitmap=await createImageBitmap(file);dimensions={'X-Image-Width':String(bitmap.width),'X-Image-Height':String(bitmap.height)};bitmap.close();}catch{}
    const send=()=>api('/upload?name='+encodeURIComponent(file.name),{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream',...dimensions},body:file});
    try{return await send();}catch(error){if(error.status!==401)throw error;if(!await requestLogin())throw Error('已取消上传');return send();}
  }
  function picker(mode='all') {
    return new Promise(resolve=>{
      const dialog=element('dialog',undefined,'blog-media-dialog'),heading=element('div',undefined,'blog-media-heading'),title=element('h2',mode==='image'?'选择图片':mode==='pdf'?'选择 PDF':'选择文件'),status=element('p',undefined,'blog-media-status'),search=element('input'),filter=element('select'),list=element('div',undefined,'blog-media-grid'),count=element('p',undefined,'blog-media-count'),uploadInput=element('input'),uploadLabel=element('label',mode==='image'?'上传图片':'上传文件','blog-media-primary blog-media-upload'),tools=element('div',undefined,'blog-media-toolbar'),drop=element('div','也可以把文件拖到这里上传','blog-media-drop'),manage=element('details',undefined,'blog-media-management'),loginForm=element('form'),token=element('input'),loginButton=element('button','验证管理身份'),scan=element('button','检查最新引用'),close=element('button','关闭', 'blog-media-close');
      dialog.setAttribute('aria-label','资源库');search.type='search';search.placeholder='搜索文件名';search.setAttribute('aria-label','搜索文件');filter.setAttribute('aria-label','文件类型');
      for(const [value,label] of [['all','全部类型'],['image','图片'],['pdf','PDF'],['audio','音频'],['video','视频']]){const option=element('option',label);option.value=value;filter.append(option);}filter.value=mode==='image'?'image':mode==='pdf'?'pdf':'all';
      uploadInput.type='file';uploadInput.className='blog-media-file-input';uploadInput.setAttribute('aria-label',mode==='image'?'上传图片':'上传文件');if(mode==='image')uploadInput.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';if(mode==='pdf')uploadInput.accept='.pdf';uploadLabel.append(uploadInput);
      token.type='password';token.autocomplete='off';token.placeholder='GitHub Token（仅检查和清理时需要）';token.setAttribute('aria-label','管理身份 GitHub Token');loginButton.type='submit';loginForm.append(token,loginButton);status.setAttribute('role','status');close.type=scan.type='button';let files=[],commit='',busy=false,selected=false,readToken='',view='';
      const readHeaders=()=>({'X-GitHub-Read-Token':readToken});const select=file=>{if(busy)return;selected=true;resolve(file.path);dialog.close();};
      const render=()=>{
        list.replaceChildren();const query=search.value.toLocaleLowerCase();const visible=files.filter(f=>(mode!=='image'||f.image)&&(mode!=='pdf'||f.pdf)&&fileName(f).toLocaleLowerCase().includes(query)&&(filter.value==='all'||filter.value==='image'&&f.image||filter.value==='pdf'&&f.pdf||f.contentType?.startsWith(filter.value+'/'))&&(!view||view==='unused'&&commit&&!f.references?.length||view==='duplicates'&&f.duplicates?.length));
        count.textContent=`${visible.length} 个文件${view==='unused'?' · 最新文章未引用':view==='duplicates'?' · 内容重复':''}`;
        if(!visible.length)list.append(element('p',view==='unused'&&!commit?'请先在管理面板检查最新引用。':'没有匹配的文件。可以上传新文件，或换个关键词。','blog-media-empty'));
        for(const file of visible){const card=element('div',undefined,'blog-media-card'),choose=element('button',undefined,'blog-media-choice'),preview=element('div',undefined,'blog-media-thumb');choose.type='button';choose.setAttribute('aria-label','选择 '+fileName(file));choose.onclick=()=>select(file);choose.disabled=busy;
          if(file.image){const image=element('img');image.src=file.path;image.alt='';image.loading='lazy';preview.append(image);}else preview.append(element('span',file.pdf?'PDF':file.contentType?.startsWith('audio/')?'音频':file.contentType?.startsWith('video/')?'视频':'文件','blog-media-file-icon'));
          const name=element('strong',fileName(file),'blog-media-name');name.title=fileName(file);choose.append(preview,name,element('span',size(file.bytes),'blog-media-size'));card.append(choose);
          if(manage.open){const info=element('details',undefined,'blog-media-file-info');info.append(element('summary','详细信息'),element('p',decodeURI(file.path)),element('p',file.sha256||'哈希待校验'));if(commit)info.append(element('p',file.references?.length?`引用 ${file.references.length} 处`:'当前文章未引用'));if(file.duplicates?.length)info.append(element('p',`相同内容：${file.duplicates.length} 项`));card.append(info);
            if(commit&&file.sha256&&!file.references?.length){const remove=element('button','移至回收区','blog-media-remove');remove.type='button';remove.disabled=busy;remove.onclick=async()=>{if(busy||!window.confirm('当前文章未引用此文件；草稿或外部链接可能仍在使用。移至可恢复回收区？'))return;busy=true;render();try{const result=await api('/delete',{method:'POST',headers:{...readHeaders(),'Content-Type':'application/json'},body:JSON.stringify({key:file.key,sha256:file.sha256,commit})});files=files.filter(f=>f.key!==file.key);const restore=element('button','恢复刚移除的文件');restore.type='button';restore.onclick=async()=>{if(busy)return;busy=true;restore.disabled=true;try{await api('/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:result.key,trashKey:result.trashKey})});files.push(file);status.textContent='文件已恢复。';}catch(error){status.textContent=error.message;}finally{busy=false;render();}};status.replaceChildren(document.createTextNode('已移至回收区。 '),restore);}catch(error){status.textContent=error.message;}finally{busy=false;render();}};card.append(remove);}
          }list.append(card);
        }
      };
      const load=async()=>{status.textContent='正在加载文件…';try{files=(await api('/catalog')).files;status.textContent='';render();}catch(error){status.textContent=error.message;}};
      loginForm.onsubmit=async e=>{e.preventDefault();const value=token.value;token.value='';loginButton.disabled=true;try{await login(value);readToken=value;status.textContent='管理身份已验证。';}catch(error){status.textContent=error.message;}finally{loginButton.disabled=false;}};
      const sendFile=async file=>{if(!file||busy)return;busy=true;uploadInput.disabled=true;uploadLabel.setAttribute('aria-disabled','true');status.textContent='正在上传 '+file.name+'…';render();try{validateSelection(file,mode);const result=await upload(file);busy=false;select(result);}catch(error){status.textContent=error.message;}finally{busy=false;uploadInput.disabled=false;uploadLabel.removeAttribute('aria-disabled');uploadInput.value='';render();}};
      uploadInput.onchange=()=>sendFile(uploadInput.files[0]);dialog.ondragover=e=>{e.preventDefault();drop.classList.add('is-dragging');};dialog.ondragleave=()=>drop.classList.remove('is-dragging');dialog.ondrop=e=>{e.preventDefault();drop.classList.remove('is-dragging');sendFile(e.dataTransfer?.files?.[0]);};
      scan.onclick=async()=>{if(busy)return;busy=true;scan.disabled=true;status.textContent='正在检查最新文章引用…';try{const result=await api('/references',{headers:readHeaders()});files=result.files;commit=result.commit;status.textContent='引用检查完成：'+commit.slice(0,8)+'。';}catch(error){status.textContent=error.message;}finally{busy=false;scan.disabled=false;render();}};
      const showView=(label,value)=>{const button=element('button',label);button.type='button';button.onclick=()=>{view=value;render();};return button;};manage.append(element('summary','管理：引用、重复文件与回收'),element('p','管理操作才需要检查最新引用。验证信息只留在当前窗口，关闭即清除。'),loginForm,scan,showView('查看未引用','unused'),showView('查看重复','duplicates'),showView('显示全部',''));
      manage.ontoggle=render;search.oninput=render;filter.onchange=()=>{view='';render();};close.onclick=()=>dialog.close();dialog.onclose=()=>{token.value='';readToken='';if(!selected)resolve(null);dialog.remove();};
      heading.append(title,close);tools.append(search,filter,uploadLabel);dialog.append(heading,tools,drop,count,status,list,manage,element('p','此处文件为公开资源。密码文章请继续使用私密资源入口。','blog-media-note'));document.body.append(dialog);dialog.showModal();load();
    });
  }
  const register=()=>{
    if(!window.CMS?.registerFieldType||!window.createClass||!window.h)return false;
    const h=window.h;
    const Control=window.createClass({
      getInitialState(){return {busy:false,message:''};},
      async sendFile(file){if(!file||this.state.busy)return;this.setState({busy:true,message:'正在上传 '+file.name+'…'});try{validateSelection(file,this.props.field.get('widget')==='r2-image'?'image':String(this.props.field.get('accept')||'').includes('pdf')?'pdf':'all');const result=await upload(file);this.props.onChange(result.path);this.setState({message:'上传完成'});}catch(error){this.setState({message:error.message});}finally{this.setState({busy:false});}},
      render(){const image=this.props.field.get('widget')==='r2-image',pdf=String(this.props.field.get('accept')||'').includes('pdf'),value=this.props.value||'',uploadLabel=image?'上传图片':pdf?'上传 PDF':'上传文件';return h('div',{className:'blog-media-field',onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();this.sendFile(e.dataTransfer?.files?.[0]);},onPaste:e=>{if(e.clipboardData?.files?.length){e.preventDefault();this.sendFile(e.clipboardData.files[0]);}}},image&&value?h('img',{src:value,alt:'图片预览',className:'blog-media-field-preview'}):value?h('p',{className:'blog-media-current-file'},fileName({path:value})):h('p',{className:'blog-media-placeholder'},image?'把图片拖到这里，也可以粘贴截图':'把文件拖到这里'),h('div',{className:'blog-media-field-actions'},h('label',{className:'blog-media-primary blog-media-upload','aria-disabled':this.state.busy},uploadLabel,h('input',{type:'file',className:'blog-media-file-input','aria-label':uploadLabel,disabled:this.state.busy,accept:image?'image/png,image/jpeg,image/webp,image/gif,image/avif':pdf?'.pdf':undefined,onChange:e=>{const file=e.target.files[0];e.target.value='';this.sendFile(file);}})),h('button',{type:'button',disabled:this.state.busy,onClick:async()=>{this.setState({busy:true});try{const selected=await picker(image?'image':pdf?'pdf':'all');if(selected)this.props.onChange(selected);}finally{this.setState({busy:false});}}},image?'选择已有图片':pdf?'选择已有 PDF':'选择已有文件'),value&&h('button',{type:'button',disabled:this.state.busy,onClick:()=>this.props.onChange('')},'移除引用')),this.state.message&&h('p',{role:'status'},this.state.message),h('details',{},h('summary',{},'链接 / 外部地址'),h('input',{id:this.props.forID,value,placeholder:'/uploads/… 或已有网址',onChange:e=>this.props.onChange(e.target.value)})));}
    });
    window.CMS.registerFieldType('r2-image',Control);
    window.CMS.registerFieldType('r2-file',Control);
    window.CMS.registerEditorComponent({id:'r2-image',label:'插入图片',icon:'image',trigger:'button',fields:[{name:'src',label:'图片资源',widget:'r2-image',required:true},{name:'alt',label:'图片描述',widget:'string',required:false}],pattern:/^!\[([^\]\n]*)\]\((\/uploads\/[^\s)]+)\)$/,fromBlock:m=>({alt:m[1],src:decodeURI(m[2])}),toBlock:({src='',alt=''})=>{if(!src.startsWith('/uploads/'))return '';const url=src.split('/').map(p=>encodeURIComponent(decodeURIComponent(p))).join('/');return `![${String(alt).replace(/[\[\]\r\n]/g,' ')}](${url})`;},toPreview:({src='',alt=''})=>h('img',{src,alt})});
    // Native rich-text drag/drop may still create temporary blobs. Move them to R2
    // before save; Sveltia discards draft files no longer referenced by blob URL.
    window.CMS.registerEventListener({name:'preSave',handler:async({entry})=>{
      if(entry.getIn(['data','access','mode'])==='password')return entry;
      const data=entry.get('data').toJS(),uploaded=new Map();
      const convert=async value=>{
        if(typeof value==='string'){const blobs=[...value.matchAll(/blob:https?:\/\/[^\s"'<>\])]+/g)].map(m=>m[0]);for(const url of blobs){if(!uploaded.has(url)){const blob=await(await fetch(url)).blob();const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif','application/pdf':'pdf','audio/mpeg':'mp3','video/mp4':'mp4'})[blob.type];if(!ext)throw Error('请通过 R2 资源库上传该类型文件。');uploaded.set(url,(await upload(new File([blob],'upload.'+ext,{type:blob.type}))).path);}value=value.split(url).join(uploaded.get(url));}return value;}
        if(Array.isArray(value))return Promise.all(value.map(convert));
        if(value&&typeof value==='object'){const out={};for(const [key,item] of Object.entries(value))out[key]=await convert(item);return out;}return value;
      };
      for(const [key,value] of Object.entries(data))entry=entry.setIn(['data',key],await convert(value));return entry;
    }});
    return true;
  };
  window.BlogResources={upload,picker};
  if(window.CMS&&!register()){const timer=setInterval(()=>{if(register())clearInterval(timer);},200);}
})();
