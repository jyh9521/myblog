(() => {
  // Compatibility adapter for the pinned Sveltia CMS 0.256.1 user cache.
  // Read the existing credential only; never create a second persistent copy.
  const KEY='sveltia-cms.user',SESSION='/ns/api/accounts/session';
  const messages={CMS_LOGIN_REQUIRED:'请先在编辑后台登录，再回来继续操作。',ADMIN_LOGIN_FAILED:'后台登录已失效，请返回编辑后台重新登录。',ADMIN_ONLY:'当前登录账号不是博客管理员。',LOGIN_RATE_LIMIT:'登录请求较频繁，请稍后再试。',CMS_LOGIN_CHANGED:'后台登录已切换，请重试本次操作。'};
  const failure=code=>Object.assign(Error(messages[code]||'后台连接失败，请稍后重试。'),{code});
  const credential=()=>{
    try {
      const user=JSON.parse(localStorage.getItem(KEY)||'null');
      return user?.backendName==='github'&&typeof user.token==='string'&&user.token.length>=20&&user.token.length<=512&&!/\s/.test(user.token)?user.token:'';
    } catch { return ''; }
  };
  const transport=fetch.bind(globalThis);
  let granted='',pending=null,generation=0,sessionVersion=0,observed=credential(),revoking=Promise.resolve();
  const revoke=()=>transport(SESSION,{method:'DELETE',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',headers:{'X-Gaming-Admin':'1'},signal:AbortSignal.timeout(15000)});
  function observe() {
    const current=credential();
    if(current===observed)return;
    const previous=observed;observed=current;granted='';generation++;
    if(previous) {
      // Finish an in-flight exchange before clearing its cookie. This prevents
      // a late login response from undoing a sign-out/account switch.
      const exchange=pending;
      revoking=revoking.then(()=>exchange?.catch(()=>{})).then(revoke).catch(()=>{});
    }
  }
  async function connect() {
    observe();await revoking;
    const token=credential();
    if(!token)throw failure('CMS_LOGIN_REQUIRED');
    if(granted===token)return;
    if(pending){await pending;return connect();}
    const version=generation;
    pending=(async()=>{
      const response=await transport(SESSION,{method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json','X-Gaming-Admin':'1'},body:JSON.stringify({token}),signal:AbortSignal.timeout(20000)});
      if(!response.ok){let code;try{code=(await response.json()).error;}catch{}throw failure(code);}
      if(version!==generation||credential()!==token)throw failure('CMS_LOGIN_CHANGED');
      granted=token;sessionVersion++;
    })().finally(()=>{pending=null;});
    return pending;
  }
  async function request(path,options={}) {
    const url=new URL(path,location.origin);
    if(url.origin!==location.origin||url.username||url.password||!/^\/ns\/api\/(?:accounts(?:\/|$)|resources(?:\/|$)|posts\/admin(?:\/|$)|games\/(?:search|detail|brief|covers(?:\/search)?)$)/.test(url.pathname))throw failure('INVALID_ADMIN_ENDPOINT');
    await connect();
    const send=()=>{
      const token=credential();
      if(!token||token!==granted)throw failure('CMS_LOGIN_CHANGED');
      const headers=new Headers(options.headers);headers.set('X-Gaming-Admin','1');
      headers.delete('X-GitHub-Read-Token');
      // The existing server verifies fresh Git references before recycling.
      // Supply the CMS credential only to these two same-origin endpoints.
      if(['/ns/api/resources/references','/ns/api/resources/delete'].includes(url.pathname))headers.set('X-GitHub-Read-Token',token);
      return transport(url.pathname+url.search,{...options,headers,credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal:options.signal||AbortSignal.timeout(120000)});
    };
    const version=sessionVersion;
    let response=await send();
    if(response.status===401) {
      let code;try{code=(await response.clone().json()).error;}catch{}
      // Only a rejected admin cookie permits one replay. Never replay a failed
      // mutation, a provider error or a conflict with an uncertain outcome.
      if(code==='ADMIN_LOGIN_REQUIRED') {
        if(version===sessionVersion)granted='';
        await connect();response=await send();
      }
    }
    return response;
  }
  async function signOut() {
    // Sveltia itself uses this empty value on sign-out. No credential is copied.
    localStorage.setItem(KEY,'{}');
    for(const key of ['decap-cms-user','netlify-cms-user'])localStorage.removeItem(key);
    const hadCredential=!!observed;observe();await revoking;
    if(!hadCredential)await revoke();
  }
  window.BlogAdminAuth=Object.freeze({request,signOut});
  window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)observe();});
  window.addEventListener('focus',observe);
  // Native storage events cover other tabs, not Sveltia sign-out in this tab.
  const timer=setInterval(observe,1000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
