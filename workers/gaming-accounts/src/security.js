export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const unb64 = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export async function challenge(value) { return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
async function key(secret, usage) {
  if (!secret || unb64(secret).length !== 32) throw new Error('ENCRYPTION_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw', unb64(secret), {name:'AES-GCM'}, false, [usage]);
}
export async function seal(value, secret, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)}, await key(secret,'encrypt'), new TextEncoder().encode(JSON.stringify(value)));
  return `v1.${b64(iv)}.${b64(encrypted)}`;
}
export async function open(value, secret, context) {
  const [version, iv, data] = value.split('.');
  if(version !== 'v1') throw new Error('INVALID_CREDENTIAL');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:new TextEncoder().encode(context)},await key(secret,'decrypt'),unb64(data))));
}
export function safeUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}
export async function readJson(request, limit=16384) {
  if(!request.body) throw new Error('INVALID_INPUT');
  const reader=request.body.getReader(); let size=0; const chunks=[];
  try { while(true){ const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>limit) {await reader.cancel();throw new Error('INPUT_TOO_LARGE');} chunks.push(value); } }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size); let at=0; for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function upstream(url, options={}, fetcher=fetch) {
  let response;
  try {response=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});}catch {throw new Error('UPSTREAM_NETWORK');}
  if(!response.ok) {if(response.status===401) throw new Error('AUTH_EXPIRED'); throw new Error(`UPSTREAM_HTTP_${response.status}`);}
  // Never include upstream response bodies or URLs in errors; either may contain credentials.
  return readJson(response, 16*1024*1024);
}
