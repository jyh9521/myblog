(function(){
  const $=id=>document.getElementById(id),ROOT='/ns/api/accounts';let pending=null,busy=false,poll=null,current=null;
  const status={disconnected:'未连接',connected:'已连接',syncing:'正在同步',expired:'登录已过期',error:'同步失败，保留旧数据'};
  const errors={ADMIN_LOGIN_REQUIRED:'请先验证管理员身份。',ADMIN_LOGIN_FAILED:'GitHub 身份验证失败，请检查 Token。',ADMIN_ONLY:'仅博客管理员可以操作。',PROVIDER_NOT_CONFIGURED:'该平台尚缺服务器配置。',INVALID_CALLBACK:'登录结果无效或已过期，请重新连接。',AUTH_EXPIRED:'平台授权已过期，请重新连接。',STEAM_LIBRARY_PRIVATE:'Steam 游戏详情未公开，请调整隐私设置后重试。',SYNC_COOLDOWN:'同步中或刚刚尝试过，请稍后刷新。',PSN_LOGIN_FAILED:'PS 登录凭证交换失败，请重新获取。',PSN_SYNC_FAILED:'PS 游戏记录请求失败，请稍后重试或重新连接。',UPSTREAM_NETWORK:'平台网络请求超时，请稍后重试。',PLAYTIME_NOT_AVAILABLE:'接口暂未返回游玩时长。',SYNC_FAILED:'同步失败，已保留上次成功数据。'};
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const stages={NINTENDO_SESSION:'Nintendo 会话交换',NINTENDO_TOKEN:'Nintendo 令牌交换',NINTENDO_PROFILE:'Nintendo 资料',NINTENDO_HISTORY:'Nintendo 游玩记录',XBOX_TOKEN:'Microsoft 令牌交换',XBOX_USER_AUTH:'Xbox 用户授权',XBOX_XSTS:'Xbox XSTS 授权',XBOX_HISTORY:'Xbox 游戏记录',XBOX_PROFILE:'Xbox 资料',PSN_AUTHORIZE:'PS NPSSO 授权',PSN_TOKEN:'PS 令牌交换',PSN_HISTORY:'PS 游戏记录',PSN_PROFILE:'PS 资料',PSN_IDENTITY:'PS 身份'};
  const explain=code=>errors[code]||Object.entries(stages).filter(([key])=>String(code).startsWith(key+'_')).map(([key,label])=>label+'失败（'+String(code).slice(key.length+1)+'）。'+(/^(PSN|XBOX|NINTENDO)_(HISTORY|PROFILE)$/.test(key)?'若账号已显示绑定时间，可关闭弹窗后点击“立即同步”，无需重复登录。':'请重新开始连接。'))[0]||(/^UPSTREAM_HTTP_\d+$/.test(code)?`平台接口返回 HTTP ${code.split('_').pop()}。`:code||'');
  const date=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'}):'尚无记录';
  async function api(path='',method='GET',body){const r=await fetch(ROOT+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Gaming-Admin':'1'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});const d=await r.json();if(!r.ok)throw Error(explain(d.error));return d;}
  function message(text){$('message').textContent=text;if($('connect-dialog').open)$('connect-message').textContent=text;}
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
        if(a.platform==='gog')card.append(node('small','目前同步拥有的游戏数量；时长与最近游玩暂不展示。'));
        if(a.platform==='epic')card.append(node('small','同步累计游玩时长；当前接口没有返回最后游玩日期，不使用购买日期替代最近游玩。'));
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
    if(busy)return;current=a;busy=true;message(`准备连接 ${a.name}…`);
    try{const result=await api(`/bind/${a.platform}`,'POST');
      if(result.mode==='redirect'){location.assign(result.url);return;}
      pending={platform:a.platform,state:result.state};$('connect-message').textContent='';$('restart-connect').hidden=true;$('confirm-connect').disabled=false;$('nintendo-help').hidden=a.platform!=='nintendo';$('connect-title').textContent=`连接 ${a.name}`;$('official-login').hidden=false;$('official-login').href=result.url;$('helper-link').hidden=!result.helperUrl;if(result.helperUrl)$('helper-link').href=result.helperUrl;
      const guides={nintendo:'无需安装软件。打开任天堂官方页面登录，复制最终返回的 npf…://auth#… 完整链接，回到本弹窗粘贴并完成连接。密码只在任天堂官方页面输入。',psn:'先在 PlayStation 官网登录，再打开下方凭证页面，复制返回的 npsso 值。无需输入 PS 密码到博客。',gog:'GOG 不会自动返回博客。登录后复制地址栏中 on_login_success 的完整链接，返回本弹窗粘贴，再点击完成连接并同步。',epic:'在 Epic 官方页面登录，复制返回的 authorizationCode 值或完整 JSON 到下方。'};
      $('connect-guide').textContent=guides[a.platform];$('input-label').textContent=result.input==='npsso'?'NPSSO':result.input==='callback'?'完整返回链接':'Authorization Code';$('connect-input').value='';if(!$('connect-dialog').open)$('connect-dialog').showModal();
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
  function validNintendoResult(input,state){try{const u=new URL(input),p=new URLSearchParams(u.hash.slice(1));return input.length<=8192&&u.protocol==='npf5c38e31cd085304b:'&&u.hostname==='auth'&&!u.username&&!u.password&&!u.port&&(u.pathname===''||u.pathname==='/')&&p.get('state')===state&&!!p.get('session_token_code')&&!/\s/.test(p.get('session_token_code'));}catch{return false;}}
  $('connect-form').onsubmit=async e=>{e.preventDefault();if(!pending||busy)return;const input=$('connect-input').value.trim();if(pending.platform==='nintendo'&&!validNintendoResult(input,pending.state)){message('请粘贴本次任天堂登录返回的完整 npf…://auth#… 链接（包含 state 和 session_token_code），不是官网地址。若已重新开始连接，请重新打开官方登录页获取链接。');return;}busy=true;$('confirm-connect').disabled=true;$('cancel-connect').disabled=true;message('正在交换授权并首次同步，请稍候…');try{await api(`/complete/${pending.platform}`,'POST',{state:pending.state,input});$('connect-dialog').close();message('账号连接并完成首次同步。');await refresh();}catch(e){message(e.message);$('connect-input').value='';pending=null;$('restart-connect').hidden=false;await refresh();}finally{busy=false;$('confirm-connect').disabled=!pending;$('cancel-connect').disabled=false;}};
  $('restart-connect').onclick=()=>connect(current);
  const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
  const callback=fragment.get('nintendo-result');
  history.replaceState(null,'',location.pathname);
  if(params.has('error'))message(explain(params.get('error')));
  if(params.has('connected'))message('账号连接并完成首次同步。');
  if(callback){try{const u=new URL(callback),state=new URLSearchParams(u.hash.slice(1)).get('state');if(u.protocol!=='npf5c38e31cd085304b:'||u.hostname!=='auth'||!state)throw Error('INVALID_CALLBACK');pending={platform:'nintendo',state};current={platform:'nintendo',name:'Nintendo'};$('connect-title').textContent='完成 Nintendo 连接';$('connect-guide').textContent='已收到任天堂返回链接，请点击完成连接并同步。';$('official-login').hidden=true;$('helper-link').hidden=true;$('input-label').textContent='任天堂登录结果';$('connect-input').value=callback;$('connect-dialog').showModal();}catch{message(errors.INVALID_CALLBACK);}}
  window.addEventListener('pagehide',()=>clearTimeout(poll));refresh();
})();
