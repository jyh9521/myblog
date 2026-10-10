import {upstream} from './security.js';
// Protocol parameters from psn-api (MIT). Fetch is bounded and injectable on Workers.
const BASE='https://ca.account.sony.com/api/authz/v3/oauth';
const CLIENT='09515159-7237-4370-9b40-3806e67c0891';
const REDIRECT='com.scee.psxandroid.scecompcall://redirect';
const BASIC='Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
function identity(token){try{const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return /^\d+$/.test(payload.sub)?payload.sub:undefined;}catch{return undefined;}}
export async function psnToken(body,fetcher=fetch){
  let t;try{t=await upstream(BASE+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:BASIC},body:new URLSearchParams({...body,token_format:'jwt'}).toString()},fetcher);}catch{throw new Error('PSN_TOKEN_FAILED');}
  if(!t.access_token||!t.refresh_token)throw new Error('PSN_TOKEN_FAILED');
  return {accessToken:t.access_token,refreshToken:t.refresh_token,expiresAt:Date.now()+Number(t.expires_in||0)*1000,accountId:identity(t.id_token)||identity(t.access_token)};
}
export async function psnLogin(npsso,fetcher=fetch){
  let response;try{response=await fetcher(BASE+'/authorize?'+new URLSearchParams({access_type:'offline',client_id:CLIENT,redirect_uri:REDIRECT,response_type:'code',scope:'psn:mobile.v2.core psn:clientapp'}),{headers:{Cookie:'npsso='+npsso},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new Error('PSN_AUTHORIZE_FAILED');}
  let url;try{url=new URL(response.headers.get('location'));}catch{throw new Error('PSN_AUTHORIZE_FAILED');}
  const code=url.searchParams.get('code');
  if(url.protocol!=='com.scee.psxandroid.scecompcall:'||url.hostname!=='redirect'||!code)throw new Error('PSN_AUTHORIZE_FAILED');
  return psnToken({code,redirect_uri:REDIRECT,grant_type:'authorization_code'},fetcher);
}
export function psnRequest(path,c,fetcher=fetch){return upstream('https://m.np.playstation.com/api'+path,{headers:{Authorization:'Bearer '+c.accessToken,'Content-Type':'application/json'}},fetcher);}
