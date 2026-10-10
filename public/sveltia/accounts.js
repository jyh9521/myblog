(function(){
  const $=id=>document.getElementById(id),ROOT='/ns/api/accounts';let pending=null,busy=false,poll=null;
  const status={disconnected:'未连接',connected:'已连接',syncing:'正在同步',expired:'登录已过期',error:'同步失败，保留旧数据'};
  const errors={ADMIN_LOGIN_REQUIRED:'请先验证管理员身份。',ADMIN_LOGIN_FAILED:'GitHub 身份验证失败，请检查 Token。',ADMIN_ONLY:'仅博客管理员可以操作。',PROVIDER_NOT_CONFIGURED:'该平台尚缺服务器配置。',INVALID_CALLBACK:'登录结果无效或已过期，请重新连接。',AUTH_EXPIRED:'平台授权已过期，请重新连接。',STEAM_LIBRARY_PRIVATE:'Steam 游戏详情未公开，请调整隐私设置后重试。',SYNC_COOLDOWN:'同步中或刚刚尝试过，请稍后刷新。',PSN_LOGIN_FAILED:'PS 登录凭证交换失败，请重新获取。',PSN_SYNC_FAILED:'PS 游戏记录请求失败，请稍后重试或重新连接。',UPSTREAM_NETWORK:'平台网络请求超时，请稍后重试。',PLAYTIME_NOT_AVAILABLE:'接口暂未返回游玩时长。',SYNC_FAILED:'同步失败，已保留上次成功数据。'};
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const explain=code=>errors[code]||(/^UPSTREAM_HTTP_\d+$/.test(code)?`平台接口返回 HTTP ${code.split('_').pop()}。`:code||'');
  const date=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'}):'尚无记录';
  async function api(path='',method='GET',body){const r=await fetch(ROOT+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Gaming-Admin':'1'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});const d=await r.json();if(!r.ok)throw Error(explain(d.error));return d;}
  function message(text){$('message').textContent=text;}
  function overview(){
    const methods={nintendo:['Nintendo','官方账号登录 + 返回链接'],psn:['PlayStation','官方账号登录 + NPSSO'],xbox:['Xbox','Microsoft 个人账号授权'],steam:['Steam','官方 OpenID 登录'],gog:['GOG','官方账号登录 + 返回链接'],epic:['Epic Games','官方账号登录 + Authorization Code']};
    $('accounts').replaceChildren(...Object.values(methods).map(([name,method])=>{const card=node('article');card.className='account';card.append(node('h2',name),node('p',method),node('small','验证管理员后可查看绑定状态、连接账号与同步记录。'));return card;}));
  }
  async function refresh(){
    clearTimeout(poll);
    try{const d=await api();$('login').hidden=true;$('refresh').hidden=false;$('logout').hidden=false;$('accounts').replaceChildren();
      for(const a of d.accounts){const card=node('article');card.className='account';card.append(node('h2',a.name),node('p',status[a.status]||a.status));
        if(a.display_name)card.append(node('p',`账号：${a.display_name}`));
        card.append(node('p',`绑定时间：${date(a.bound_at)}`),node('p',`最近尝试：${date(a.last_attempt_at)}`),node('p',`最近成功：${date(a.last_success_at)}`));
        if(a.error_code)card.append(node('p',explain(a.error_code)));
        if(a.missing.length)card.append(node('small',`待配置：${a.missing.join('、')}`));
        if(['gog','epic'].includes(a.platform))card.append(node('small','目前同步拥有的游戏数量；时长与最近游玩暂不展示。'));
        if(a.platform==='xbox')card.append(node('small','统计玩过的游戏，读取最近 6 款可用时长；不伪装为完整拥有库或总时长。'));
        const controls=node('div');controls.className='toolbar';
        if(a.platform==='steam'){const config=node('button','设置 Steam API Key');config.onclick=()=>{$('steam-key').value='';$('steam-dialog').showModal();};controls.append(config);}
        const bind=node('button',a.status==='disconnected'?'连接账号':'重新连接');bind.disabled=!!a.missing.length;bind.onclick=()=>connect(a);controls.append(bind);
        if(a.status!=='disconnected'){const sync=node('button','立即同步');sync.disabled=a.status==='syncing'||!!a.missing.length;sync.onclick=async()=>{sync.disabled=true;try{await api(`/sync/${a.platform}`,'POST');message(`${a.name} 已提交同步。`);poll=setTimeout(refresh,1500);}catch(e){message(e.message);sync.disabled=false;}};const remove=node('button','解除绑定');remove.onclick=async()=>{if(!confirm(`解除 ${a.name} 绑定并删除服务器上的凭证与缓存？`))return;try{await api(`/disconnect/${a.platform}`,'POST');message('已解除绑定。');await refresh();}catch(e){message(e.message);}};controls.append(sync,remove);}
        card.append(controls);$('accounts').append(card);
      }
      $('history-panel').hidden=false;$('history').replaceChildren(...d.history.map(h=>node('p',`${h.platform} · ${date(h.started_at)} · ${h.status==='success'?'同步成功':explain(h.error_code)||h.status}${h.games!==null?` · ${h.games} 款`:''}`)));
      if(d.accounts.some(a=>a.status==='syncing'))poll=setTimeout(refresh,3000);
    }catch(e){message(e.message);if(e.message===errors.ADMIN_LOGIN_REQUIRED){$('login').hidden=false;overview();$('history-panel').hidden=true;}}
  }
  async function connect(a){
    if(busy)return;busy=true;message(`准备连接 ${a.name}…`);
    try{const result=await api(`/bind/${a.platform}`,'POST');
      if(result.mode==='redirect'){location.assign(result.url);return;}
      pending={platform:a.platform,state:result.state};$('connect-title').textContent=`连接 ${a.name}`;$('official-login').href=result.url;$('helper-link').hidden=!result.helperUrl;if(result.helperUrl)$('helper-link').href=result.helperUrl;
      const guides={nintendo:'打开任天堂官方登录页。完成后复制“返回 APP”的链接地址（npf 开头），粘贴到下方。网页不能直接接收原生 APP 回调，因此需要这一步。',psn:'先在 PlayStation 官网登录，再打开下方凭证页面，复制返回的 npsso 值。无需输入 PS 密码到博客。',gog:'在 GOG 官方页面登录，复制最终 on_login_success 页面完整地址到下方。',epic:'在 Epic 官方页面登录，复制返回的 authorizationCode 值或完整 JSON 到下方。'};
      $('connect-guide').textContent=guides[a.platform];$('input-label').textContent=result.input==='npsso'?'NPSSO':result.input==='callback'?'完整返回链接':'Authorization Code';$('connect-input').value='';$('connect-dialog').showModal();
    }catch(e){message(e.message);}finally{busy=false;}
  }
  $('login-form').onsubmit=async e=>{e.preventDefault();const token=$('github-token').value;$('github-token').value='';const button=e.target.querySelector('button');button.disabled=true;try{await api('/session','POST',{token});message('管理员验证成功。');await refresh();}catch(e){message(e.message);}finally{button.disabled=false;}};
  $('refresh').onclick=refresh;
  $('cancel-steam').onclick=()=>$('steam-dialog').close();
  $('steam-dialog').addEventListener('close',()=>{$('steam-key').value='';});
  $('steam-form').onsubmit=async e=>{e.preventDefault();const apiKey=$('steam-key').value;$('steam-key').value='';const button=e.target.querySelector('button');button.disabled=true;try{await api('/configuration/steam','POST',{apiKey});$('steam-dialog').close();message('Steam 接口已配置，可以连接账号。');await refresh();}catch(error){message(error.message);}finally{button.disabled=false;}};
  $('logout').onclick=async()=>{try{await api('/session','DELETE');location.reload();}catch(e){message(e.message);}};
  $('cancel-connect').onclick=()=>$('connect-dialog').close();
  $('connect-dialog').addEventListener('close',()=>{pending=null;$('connect-input').value='';});
  $('connect-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('connect-form').onsubmit=async e=>{e.preventDefault();if(!pending||busy)return;busy=true;$('confirm-connect').disabled=true;$('cancel-connect').disabled=true;const input=$('connect-input').value.trim();$('connect-input').value='';try{await api(`/complete/${pending.platform}`,'POST',{state:pending.state,input});$('connect-dialog').close();message('账号连接并完成首次同步。');await refresh();}catch(e){message(e.message);$('connect-dialog').close();}finally{busy=false;$('confirm-connect').disabled=false;$('cancel-connect').disabled=false;}};
  window.addEventListener('pagehide',()=>clearTimeout(poll));refresh();
})();
