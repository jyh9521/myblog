(() => {
  const ROOT='/ns/api/posts', editors=new Map();
  const validId=id=>/^[a-f0-9]{32}$/.test(id||'');
  const marker=id=>`<!-- blfy-access:password:${id} -->`;
  const errors={ADMIN_LOGIN_REQUIRED:'请先连接博客后台。',WRONG_PASSWORD:'密码错误。',INVALID_PASSWORD:'密码需要 6–128 个字符；已有密码留空可保留。',INVALID_BODY:'私密正文不能为空，最大 512 KB。',EDIT_CONFLICT:'正文已在其他窗口修改，请重新载入后再编辑。',INPUT_TOO_LARGE:'文件最大 5 MB。',INVALID_FILE_TYPE:'仅支持 PDF、PNG、JPEG、GIF、WebP。',SAVE_POST_FIRST:'请先保存私密正文，再上传文件。'};
  async function api(path,options={}) {
    const r=await fetch(ROOT+path,{credentials:'same-origin',cache:'no-store',...options,headers:{'X-Gaming-Admin':'1',...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
    const result=await r.json();if(!r.ok)throw Error(errors[result.error]||'操作失败，请稍后重试。');return result;
  }
  const register=()=>{
    if(!window.CMS?.registerFieldType||!window.createClass||!window.h)return false;
    const h=window.h, style={width:'100%',padding:'8px 10px',border:'1px solid #68707a',borderRadius:'8px',background:'transparent',color:'inherit'};
    const Control=window.createClass({
      getInitialState(){return {body:'',password:'',token:'',loaded:false,dirty:false,revision:undefined,busy:false,message:'',assets:[]};},
      componentDidMount(){this.track();},
      componentDidUpdate(previous){this.track();if(previous.value?.privateId!==this.props.value?.privateId){this.setState({body:'',password:'',loaded:false,dirty:false,revision:undefined,assets:[],message:''});}},
      componentWillUnmount(){if(this.trackedId&&editors.get(this.trackedId)===this)editors.delete(this.trackedId);},
      track(){const id=this.props.value?.privateId;if(this.trackedId!==id){if(this.trackedId&&editors.get(this.trackedId)===this)editors.delete(this.trackedId);this.trackedId=id;}if(validId(id))editors.set(id,this);},
      async load(){if(this.state.dirty&&!window.confirm('重新载入会放弃当前未保存的私密正文，继续吗？'))return;this.setState({busy:true,message:''});try{const result=await api('/admin/'+this.props.value.privateId);this.setState({body:result.body,revision:result.revision,loaded:true,dirty:false});await this.assets();}catch(e){this.setState({message:e.message});}finally{this.setState({busy:false});}},
      async assets(){const result=await api('/admin/'+this.props.value.privateId+'/assets');this.setState({assets:result.assets});},
      async save(body=this.state.body,revision=this.state.revision){const result=await api('/admin/'+this.props.value.privateId,{method:'POST',body:JSON.stringify({body,password:this.state.password,revision})});this.setState({revision:result.revision,password:'',body,loaded:true,dirty:false,message:'私密正文已保存；还需保存文章，发布标题与访问方式。'});return result;},
      async action(task){this.setState({busy:true,message:''});try{await task();}catch(e){this.setState({message:e.message});}finally{this.setState({busy:false});}},
      insert(asset){const label=asset.name.replace(/[\[\]"\r\n]/g,'');const url=ROOT+'/assets/'+this.props.value.privateId+'/'+asset.id;const content=asset.mime==='application/pdf'?`[${label}](${url} "pdf-embed")`:`![${label}](${url})`;this.setState({body:this.state.body+'\n\n'+content+'\n',dirty:true});},
      render(){const access=this.props.value||{},mode=access.mode||'public';return h('div',{style:{display:'grid',gap:'10px'}},
        h('label',null,'访问方式',h('select',{style,value:mode,disabled:this.state.busy,onChange:e=>{
          const next=e.target.value;if(mode==='password'&&next!=='password'&&!window.confirm('切换为公开或仅链接可见后，正文会进入公开 Git 仓库；私密正文请先载入并复制到原正文编辑器。继续吗？'))return;
          this.props.onChange({mode:next,...(next==='password'?{privateId:validId(access.privateId)?access.privateId:crypto.randomUUID().replaceAll('-','')}: {})});
        }},[['public','公开'],['password','密码访问'],['unlisted','仅链接可见']].map(([value,label])=>h('option',{key:value,value},label)))),
        mode==='unlisted'&&h('div',null,h('p',null,'不出现在列表、搜索、RSS 或推荐中；分享文章的预览网址即可。拿到链接的人可以阅读。'),h('button',{type:'button',onClick:()=>this.action(async()=>{const slug=this.props.entry?.get?.('slug')||this.props.entry?.slug||this.lastSlug;if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug||''))throw Error('请先保存文章，然后从预览按钮复制文章网址。');await navigator.clipboard.writeText(location.origin+'/posts/'+slug+'/');this.setState({message:'分享链接已复制。'});})},'复制分享链接')),
        mode==='password'&&h('div',{style:{display:'grid',gap:'10px'}},
          h('p',null,'首次转换：设置密码并保存文章，原正文会自动转入私密存储。之后点“载入私密正文”在此编辑 Markdown；原正文框仅保留引用。标题、摘要、封面仍公开。已经公开过的 Git 历史和公共资源不会因切换密码而消失。'),
          h('button',{type:'button',disabled:this.state.busy,onClick:()=>this.load()},'载入私密正文'),
          h('label',null,'设置 / 修改文章密码（已有密码留空保留）',h('input',{type:'password',autoComplete:'new-password',maxLength:128,value:this.state.password,style,onChange:e=>this.setState({password:e.target.value})})),
          h('label',null,'私密正文（Markdown）',h('textarea',{rows:14,style:{...style,fontFamily:'monospace'},value:this.state.body,placeholder:'首次转换可直接使用原正文；重新编辑前请载入私密正文。',onChange:e=>this.setState({body:e.target.value,dirty:true})})),
          h('button',{type:'button',disabled:this.state.busy||!this.state.body.trim(),onClick:()=>this.action(()=>this.save())},'保存私密正文'),
          h('p',null,'私密图片 / PDF：最大 5 MB，不上传到公共资源库。'),
          h('input',{type:'file',accept:'.pdf,.png,.jpg,.jpeg,.gif,.webp',disabled:this.state.busy,onChange:e=>{const file=e.target.files[0];e.target.value='';if(!file)return;this.action(async()=>{const form=new FormData();form.append('file',file);const result=await api('/admin/'+access.privateId+'/assets',{method:'POST',body:form});this.insert(result);await this.assets();});}}),
          h('button',{type:'button',disabled:this.state.busy,onClick:()=>this.action(()=>this.assets())},'刷新私密资源'),
          ...this.state.assets.map(asset=>h('div',{key:asset.id},h('span',null,asset.name+' '),h('button',{type:'button',onClick:()=>this.insert(asset)},'插入'),h('button',{type:'button',onClick:()=>{if(window.confirm('删除此私密资源？引用它的图片或 PDF 将失效。'))this.action(async()=>{await api('/admin/'+access.privateId+'/assets/'+asset.id,{method:'DELETE'});await this.assets();});}},'删除'))),
          h('details',null,h('summary',null,'连接后台（会话未登录时使用）'),h('p',null,'使用自己的 GitHub token 验证博客管理员身份；不写入文章、不保存在浏览器。'),h('input',{type:'password',autoComplete:'off',value:this.state.token,style,onChange:e=>this.setState({token:e.target.value})}),h('button',{type:'button',disabled:this.state.busy,onClick:()=>this.action(async()=>{const r=await fetch('/ns/api/accounts/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Gaming-Admin':'1'},body:JSON.stringify({token:this.state.token})});this.setState({token:''});if(!r.ok)throw Error('后台登录失败，请检查 token。');this.setState({message:'后台已连接。'});})},'连接后台'))),
        h('p',{role:'status','aria-live':'polite'},this.state.busy?'正在处理…':this.state.message));}
    });
    window.CMS.registerFieldType('article-access',Control);
    window.CMS.registerEventListener({name:'preSave',handler:async({entry})=>{
      if(entry.get('collection')!=='post'&&entry.get('collectionName')!=='post')return entry;
      const access=entry.getIn(['data','access'])?.toJS?.()||entry.getIn(['data','access'])||{},mode=access.mode||'public',raw=entry.getIn(['data','body'])||'';
      if(!['public','unlisted','password'].includes(mode))throw Error('文章访问方式无效。');
      if(mode!=='password') {if(!raw.trim())throw Error('正文不能为空。');if(/^\s*<!-- blfy-access:password:/.test(raw))throw Error('请先载入私密正文并复制到原正文编辑器，再保存公开文章。');return entry;}
      if(!validId(access.privateId))throw Error('私密正文引用无效，请重新选择密码访问。');
      if(entry.getIn(['data','audio'])||entry.getIn(['data','video'])||entry.getIn(['data','attachment']))throw Error('密码文章请清空公共附件字段，改用私密资源上传。');
      const editor=editors.get(access.privateId),publicDraft=raw.trim()===marker(access.privateId)?'':raw;
      if(editor)editor.lastSlug=entry.get('slug');
      if(editor&&(editor.state.dirty||editor.state.password||publicDraft)) {
        let body=editor.state.loaded||editor.state.dirty?editor.state.body:publicDraft,revision=editor.state.revision;
        if(!body&&!editor.state.loaded){const current=await api('/admin/'+access.privateId);revision=current.revision;body=current.body;}
        await editor.save(body,revision);
      } else await api('/admin/'+access.privateId);
      return entry.setIn(['data','body'],marker(access.privateId));
    }});
    return true;
  };
  if(!register()){const timer=setInterval(()=>{if(register())clearInterval(timer);},200);}
})();
