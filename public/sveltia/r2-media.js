(() => {
  const ROOT='/ns/api/resources';
  const errors={ADMIN_LOGIN_REQUIRED:'请先连接后台管理员身份。',REFERENCE_TOKEN_REQUIRED:'请在当前资源窗口连接后台，再读取最新仓库引用。',INVALID_ORIGIN:'当前站点来源不匹配。',INPUT_TOO_LARGE:'公开资源单文件上限为 20 MiB。',INVALID_FILE_TYPE:'文件类型或文件内容无效。',RESOURCE_REFERENCED:'最新仓库内容仍引用或提及该文件。',REFERENCE_SOURCE_CHANGED:'仓库已更新，请重新检查引用。',RESOURCE_CHANGED:'资源已变化，请刷新后重试。'};
  async function api(path,options={}) {const response=await fetch(ROOT+path,{...options,credentials:'same-origin',cache:'no-store',headers:{'X-Gaming-Admin':'1',...options.headers},signal:AbortSignal.timeout(120000)});const data=await response.json();if(!response.ok)throw Error(errors[data.error]||data.error||'资源操作失败');return data;}
  async function upload(file) {
    let dimensions={};if(file.type.startsWith('image/'))try{const bitmap=await createImageBitmap(file);dimensions={'X-Image-Width':String(bitmap.width),'X-Image-Height':String(bitmap.height)};bitmap.close();}catch{}
    return api('/upload?name='+encodeURIComponent(file.name),{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream',...dimensions},body:file});
  }
  const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  function picker(mode='all') {
    return new Promise(resolve=>{
      const dialog=element('dialog'),title=element('h2','R2 公开资源库'),status=element('p'),search=element('input'),filter=element('select'),list=element('div'),uploadInput=element('input'),uploadLabel=element('label','上传到 R2（不提交文件进 Git）'),login=element('form'),token=element('input'),loginButton=element('button','连接后台'),scan=element('button','检查最新引用与重复'),close=element('button','关闭资源库');
      dialog.setAttribute('aria-label','R2 公开资源库');dialog.style.cssText='width:min(1050px,94vw);max-height:88vh;border:1px solid #777;border-radius:12px;padding:20px;overflow:auto';
      search.type='search';search.placeholder='搜索文件名';search.setAttribute('aria-label','搜索 R2 文件');search.style.cssText='width:65%;padding:8px';
      for(const [value,label] of [['all','全部'],['image','仅图片'],['pdf','仅 PDF'],['unused','未引用'],['duplicates','重复内容']]){const o=element('option',label);o.value=value;filter.append(o);}filter.value=mode==='image'?'image':mode==='pdf'?'pdf':'all';
      uploadInput.type='file';uploadInput.setAttribute('aria-label','上传 R2 文件');if(mode==='image')uploadInput.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';if(mode==='pdf')uploadInput.accept='.pdf';uploadLabel.append(uploadInput);
      token.type='password';token.autocomplete='off';token.placeholder='GitHub Token，仅用于验证管理员';token.setAttribute('aria-label','R2 管理员 GitHub Token');loginButton.type='submit';login.append(token,loginButton);
      status.setAttribute('role','status');close.type=scan.type='button';let files=[],commit='',busy=false,selected=false,readToken='';
      const readHeaders=()=>({'X-GitHub-Read-Token':readToken});
      const select=file=>{selected=true;resolve(file.path);dialog.close();};
      const render=()=>{
        list.replaceChildren();const query=search.value.toLowerCase();
        for(const file of files.filter(f=>(f.path.toLowerCase().includes(query))&&(filter.value==='all'||filter.value==='image'&&f.image||filter.value==='pdf'&&f.pdf||filter.value==='unused'&&commit&&!f.references?.length||filter.value==='duplicates'&&f.duplicates?.length))) {
          const row=element('div');row.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #7774';
          if(file.image){const image=element('img');image.src=file.path;image.alt='';image.loading='lazy';image.style.cssText='width:72px;height:55px;object-fit:contain';row.append(image);}
          const info=element('div');info.style.flex='1';info.append(element('strong',decodeURI(file.path)),element('p',`${(file.bytes/1024).toFixed(1)} KiB · ${file.sha256?.slice(0,12)||'待校验'}${file.duplicates?.length?' · 重复 '+file.duplicates.length+' 项':''}${commit?' · '+(file.references?.length?'引用 '+file.references.length+' 处':'当前仓库未引用'):''}`));
          const choose=element('button','选择资源');choose.type='button';choose.onclick=()=>select(file);row.append(info,choose);
          if(commit&&file.sha256&&!file.references?.length){const remove=element('button','移至回收区');remove.type='button';remove.onclick=async()=>{if(busy||!window.confirm('只按最新仓库引用判断未使用；草稿或外部链接可能仍在使用。移至可恢复回收区？'))return;busy=true;remove.disabled=true;try{const result=await api('/delete',{method:'POST',headers:{...readHeaders(),'Content-Type':'application/json'},body:JSON.stringify({key:file.key,sha256:file.sha256,commit})});files=files.filter(f=>f.key!==file.key);render();const restore=element('button','恢复刚移除的资源');restore.type='button';restore.onclick=async()=>{try{await api('/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:result.key,trashKey:result.trashKey})});files.push(file);render();status.textContent='资源已恢复。';restore.remove();}catch(e){status.textContent=e.message;}};status.replaceChildren(document.createTextNode('已移至回收区，原字节保留。 '),restore);}catch(e){status.textContent=e.message;}finally{busy=false;remove.disabled=false;}};row.append(remove);}
          list.append(row);
        }
      };
      const load=async()=>{try{files=(await api('/catalog')).files;render();}catch(e){status.textContent=e.message;}};
      login.onsubmit=async e=>{e.preventDefault();const value=token.value;token.value='';loginButton.disabled=true;try{const r=await fetch('/ns/api/accounts/session',{method:'POST',credentials:'same-origin',headers:{'X-Gaming-Admin':'1','Content-Type':'application/json'},body:JSON.stringify({token:value})});if(!r.ok)throw Error('管理员验证失败，请检查 Token。');readToken=value;status.textContent='管理员已连接；读取令牌仅留在当前窗口内存，关闭后清除。';}catch(e){status.textContent=e.message;}finally{loginButton.disabled=false;}};
      uploadInput.onchange=async()=>{const file=uploadInput.files[0];if(!file||busy)return;busy=true;uploadInput.disabled=true;status.textContent='正在上传到 R2…';try{const result=await upload(file);status.textContent='已上传到 R2；保存文章只提交文字和资源引用。';await load();select(result);}catch(e){status.textContent=e.message;}finally{busy=false;uploadInput.disabled=false;uploadInput.value='';}};
      scan.onclick=async()=>{if(busy)return;busy=true;scan.disabled=true;status.textContent='正在读取最新 Git 提交并检查引用…';try{const result=await api('/references',{headers:readHeaders()});files=result.files;commit=result.commit;status.textContent='引用检查完成：'+commit.slice(0,8)+'。移除操作还会重新核对。';render();}catch(e){status.textContent=e.message;}finally{busy=false;scan.disabled=false;}};
      search.oninput=filter.onchange=render;close.onclick=()=>dialog.close();dialog.onclose=()=>{token.value='';readToken='';if(!selected)resolve(null);dialog.remove();};
      dialog.append(title,element('p','公开资源；密码文章请继续使用“私密资源上传”。'),login,uploadLabel,search,filter,scan,status,list,close);document.body.append(dialog);dialog.showModal();load();
    });
  }
  const register=()=>{
    if(!window.CMS?.registerFieldType||!window.createClass||!window.h)return false;
    const h=window.h;
    const Control=window.createClass({
      getInitialState(){return {busy:false,message:''};},
      render(){const image=this.props.field.get('widget')==='r2-image',pdf=String(this.props.field.get('accept')||'').includes('pdf');return h('div',{style:{display:'grid',gap:'8px'}},h('input',{id:this.props.forID,value:this.props.value||'',placeholder:'/uploads/… 或已有资源网址',onChange:e=>this.props.onChange(e.target.value),style:{width:'100%',padding:'8px'}}),h('button',{type:'button',disabled:this.state.busy,onClick:async()=>{this.setState({busy:true});try{const value=await picker(image?'image':pdf?'pdf':'all');if(value)this.props.onChange(value);}finally{this.setState({busy:false});}}},'浏览 / 上传 R2 资源'),image&&this.props.value&&h('img',{src:this.props.value,alt:'资源预览',style:{maxWidth:'240px',maxHeight:'150px',objectFit:'contain'}}));}
    });
    window.CMS.registerFieldType('r2-image',Control);
    window.CMS.registerFieldType('r2-file',Control);
    window.CMS.registerEditorComponent({id:'r2-image',label:'插入 R2 图片',icon:'image',trigger:'button',fields:[{name:'src',label:'图片资源',widget:'r2-image',required:true},{name:'alt',label:'图片描述',widget:'string',required:false}],pattern:/^!\[([^\]\n]*)\]\((\/uploads\/[^\s)]+)\)$/,fromBlock:m=>({alt:m[1],src:decodeURI(m[2])}),toBlock:({src='',alt=''})=>{if(!src.startsWith('/uploads/'))return '';const url=src.split('/').map(p=>encodeURIComponent(decodeURIComponent(p))).join('/');return `![${String(alt).replace(/[\[\]\r\n]/g,' ')}](${url})`;},toPreview:({src='',alt=''})=>h('img',{src,alt})});
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
