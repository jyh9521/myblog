// Store catalogue resolution runs only while syncing, never on a public read.
// Identifiers are preferred; name fallback is exact after typography normalization.
const DAY=86400000;
const REGIONS={xbox:'TW',psn:'HK',nintendo:'JP'};
export function normalizedTitle(value) {
  return typeof value==='string'?value.normalize('NFKC').toLowerCase().replace(/[™®©]/g,'').replace(/[^\p{L}\p{N}]/gu,''):'';
}
export function regionalProductUrl(platform,value) {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return undefined;
    if(platform==='nintendo'&&u.hostname==='store-jp.nintendo.com'&&/^\/item\/software\/D\d{14}$/.test(u.pathname))return u.href;
    const paths={xbox:/^\/zh-TW\/games\/store\/[^/]+\/[A-Z0-9]{12}$/i,psn:/^\/zh-hant-hk\/(?:product\/[A-Z0-9_-]+|concept\/\d+)$/i,nintendo:/^\/JP\/ja\/titles\/\d{14}$/};
    const hosts={xbox:'www.xbox.com',psn:'store.playstation.com',nintendo:'ec.nintendo.com'};
    return u.hostname===hosts[platform]&&paths[platform]?.test(u.pathname)?u.href:undefined;
  }catch{return undefined;}
}
async function boundedText(response,limit=2*1024*1024) {
  if(!response.ok)throw Error('STORE_HTTP_'+response.status);
  const reader=response.body?.getReader();if(!reader)throw Error('STORE_EMPTY');
  const decoder=new TextDecoder();let total=0,text='';
  try {while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw Error('STORE_TOO_LARGE');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
  finally{await reader.cancel().catch(()=>{});}
}
async function json(url,fetcher) {
  const r=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
  return JSON.parse(await boundedText(r));
}
export async function xboxStore(game,fetcher=fetch) {
  if(!/^\d{1,10}$/.test(game.id))return null;
  const u=new URL('https://displaycatalog.mp.microsoft.com/v7.0/products/lookup');
  u.search=new URLSearchParams({alternateId:'XboxTitleId',value:game.id,market:'TW',languages:'zh-TW',fieldsTemplate:'Browse'}).toString();
  const data=await json(u.href,fetcher);
  if(!Array.isArray(data.Products))throw Error('STORE_INVALID_RESPONSE');
  const products=data.Products.filter(p=>/^[A-Z0-9]{12}$/.test(p.ProductId||''));
  const unique=[...new Map(products.map(p=>[p.ProductId,p])).values()];
  // Never pick the first of multiple editions/platform variants arbitrarily.
  const exact=unique.filter(p=>p.LocalizedProperties?.some(l=>normalizedTitle(l.ProductTitle)===normalizedTitle(game.title)));
  const product=unique.length===1?unique[0]:exact.length===1?exact[0]:null;
  if(!product){
    if(unique.length)return null;
    const search=new URL('https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest');
    search.search=new URLSearchParams({languages:'en-US',market:'TW',platformdependencyname:'windows.xbox',productFamilyNames:'Games',query:game.title,topProducts:'10'}).toString();
    const found=await json(search.href,fetcher);
    if(!Array.isArray(found.Results))throw Error('STORE_INVALID_RESPONSE');
    const matches=found.Results.flatMap(r=>r.Products||[]).filter(p=>p.Type==='Game'&&/^[A-Z0-9]{12}$/.test(p.ProductId||'')&&normalizedTitle(p.Title)===normalizedTitle(game.title));
    const candidates=[...new Map(matches.map(p=>[p.ProductId,p])).values()];
    if(candidates.length!==1)return null;
    return {url:`https://www.xbox.com/zh-TW/games/store/game/${candidates[0].ProductId}`,cover:candidates[0].Icon?.replace(/^\/\//,'https://'),source:'xbox-name-exact:TW'};
  }
  const images=product.LocalizedProperties?.flatMap(p=>p.Images||[])||[];
  const image=images.find(i=>['TitledHeroArt','SuperHeroArt','BoxArt'].includes(i.ImagePurpose));
  const cover=typeof image?.Uri==='string'?image.Uri.replace(/^\/\//,'https://'):undefined;
  return {url:`https://www.xbox.com/zh-TW/games/store/${encodeURIComponent(game.title.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'game')}/${product.ProductId}`,cover,source:'xbox-title-id:TW'};
}
export async function psnStore(game,fetcher=fetch) {
  if(!/^(?:CUSA|PPSA)\d{5}_\d{2}$/.test(game.id))return null;
  const r=await fetcher(`https://store.playstation.com/store/api/chihiro/00_09_000/titlecontainer/HK/ch/999/${game.id}`,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  let product,source='psn-title-container:HK';
  if([204,404].includes(r.status)){
    await r.body?.cancel();
    const query=game.title.normalize('NFKC').replace(/[’'™®©]/g,'').trim();
    const search=await json(`https://store.playstation.com/store/api/chihiro/00_09_000/tumbler/HK/en/999/${encodeURIComponent(query)}?size=30`,fetcher);
    if(!Array.isArray(search.links))throw Error('STORE_INVALID_RESPONSE');
    const matches=search.links.filter(p=>normalizedTitle(p.name)===normalizedTitle(game.title)&&p.id?.includes(`-${game.id}-`));
    const unique=[...new Map(matches.map(p=>[p.id,p])).values()];
    if(unique.length!==1)return null;
    product={...unique[0],container_type:'product'};source='psn-title-search-exact:HK';
  }else product=JSON.parse(await boundedText(r));
  const id=product.id;
  if(typeof id!=='string'||!new RegExp(`^[A-Z]{2}\\d{4}-${game.id}-[A-Z0-9_]+$`).test(id)||product.container_type!=='product')return null;
  const url=`https://store.playstation.com/zh-hant-hk/product/${id}`;
  // Some title-container responses are global. Verify the actual Hong Kong PDP.
  const page=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(page.status===404){await page.body?.cancel();return null;}
  const html=await boundedText(page);
  const match=html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  const data=match?JSON.parse(match[1]):null;
  const props=data?.props?.pageProps;
  if(props?.statusCode!==200||props.productId!==id||props.locale!=='zh-hant-hk'||!/<title>[^<]+<\/title>/.test(html))return null;
  return {url,source};
}
export async function nintendoStore(game,fetcher=fetch) {
  if(!/^[0-9a-f]{16}$/i.test(game.id))return null;
  const r=await fetcher(`https://ec.nintendo.com/apps/${game.id.toLowerCase()}/JP`,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  try{
    if(r.status===404)return null;
    if(![301,302,303,307,308].includes(r.status))throw Error('STORE_HTTP_'+r.status);
    const location=r.headers.get('Location');
    const url=location?regionalProductUrl('nintendo',new URL(location,'https://ec.nintendo.com').href):undefined;
    if(!url)throw Error('STORE_INVALID_REDIRECT');
    // Switch 2 upgrades can share the base game's ID. Resolve their edition
    // explicitly from the Japanese catalogue instead of using a base redirect.
    if(/(?:switch\s*2|スイッチ\s*2)/i.test(game.title))return null;
    return {url,source:'nintendo-title-redirect:JP'};
  }finally{await r.body?.cancel();}
}
// A compact, preprocessed Japanese catalogue avoids scanning the large source
// inside a Worker. This static file contains identifiers and names, not images.
export async function nintendoCatalogue(games,fetcher=fetch) {
  const response=await fetcher('https://blog.blfy.cc/data/nintendo-store-catalogue.json',{redirect:'manual',signal:AbortSignal.timeout(12000)});
  const data=JSON.parse(await boundedText(response,5*1024*1024));
  if(data.version!==1||!data.byId||!data.byTitle)throw Error('STORE_INVALID_CATALOGUE');
  const matches=new Map();
  for(const g of games){
    const id=g.id.toLowerCase();
    const fromId=(Array.isArray(data.byId[id])?data.byId[id]:[]).filter(e=>Array.isArray(e)&&e.length===2).map(e=>({id,title:e[1],nsuid:e[0]}));
    const fromTitle=(Array.isArray(data.byTitle[normalizedTitle(g.title)])?data.byTitle[normalizedTitle(g.title)]:[]).filter(e=>Array.isArray(e)&&e.length===2).map(e=>({id:e[1],title:g.title,nsuid:e[0]}));
    const rows=[...fromId,...fromTitle];
    matches.set(g.id,rows.filter(e=>typeof e?.id==='string'&&typeof e.title==='string'&&/^\d{14}$/.test(e.nsuid)));
  }
  return matches;
}
export function catalogueChoice(game,entries) {
  const exact=entries.filter(e=>normalizedTitle(e.title)===normalizedTitle(game.title));
  const byId=entries.filter(e=>e.id===game.id.toLowerCase());
  const candidates=exact.length?exact:/(?:switch\s*2|スイッチ\s*2)/i.test(game.title)?[]:byId;
  const unique=[...new Map(candidates.map(e=>[e.nsuid,e])).values()];
  return unique.length===1?{url:`https://ec.nintendo.com/JP/ja/titles/${unique[0].nsuid}`,source:'nintendo-jp-catalogue:JP'}:null;
}
export async function enrichStoreLinks(data,env,fetcher=fetch,now=Date.now()) {
  if(!REGIONS[data.platform]||!data.recent?.length)return data;
  const pending=[];
  for(const game of data.recent.slice(0,6)){
    let row;
    try{row=await env.DB.prepare('SELECT * FROM gaming_store_links WHERE platform=? AND game_id=?').bind(data.platform,game.id).first();}catch{continue;}
    const cached=(row?.title===game.title||row?.source==='manual')&&regionalProductUrl(data.platform,row?.url);
    if(cached){game.url=cached;if(!game.cover&&row.cover?.startsWith('https://'))game.cover=row.cover;}
    if((row?.title===game.title||row?.source==='manual')&&row.expires_at>now)continue;
    pending.push({game,row,cached});
  }
  const misses=[];
  for(const item of pending){
    try {item.result=await ({xbox:xboxStore,psn:psnStore,nintendo:nintendoStore}[data.platform])(item.game,fetcher);if(data.platform==='nintendo'&&!item.result)misses.push(item);}
    catch(e){item.failed=true;item.failure=/^STORE_[A-Z_0-9]+$/.test(e.message)?e.message:e.name==='TypeError'?'STORE_TYPE_ERROR':'STORE_FAILED';}
  }
  if(misses.length){
    try{const catalogue=await nintendoCatalogue(misses.map(i=>i.game),fetcher);for(const item of misses)item.result=catalogueChoice(item.game,catalogue.get(item.game.id)||[]);}
    catch(e){for(const item of misses){item.failed=true;item.failure=/^STORE_[A-Z_0-9]+$/.test(e.message)?e.message:e.name==='TypeError'?'STORE_TYPE_ERROR':'STORE_FAILED';}}
  }
  for(const {game,row,cached,result,failed,failure} of pending){
    const url=regionalProductUrl(data.platform,result?.url);
    if(url){game.url=url;if(!game.cover&&result.cover?.startsWith('https://'))game.cover=result.cover;}
    // Transient failures and missing mappings never erase a verified old link.
    const keep=url||cached||null,cover=result?.cover||row?.cover||null;
    try{await env.DB.prepare('INSERT INTO gaming_store_links(platform,game_id,title,url,cover,source,checked_at,expires_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(platform,game_id) DO UPDATE SET title=excluded.title,url=excluded.url,cover=excluded.cover,source=excluded.source,checked_at=excluded.checked_at,expires_at=excluded.expires_at WHERE gaming_store_links.source<>\'manual\'').bind(data.platform,game.id,game.title,keep,cover,url?result.source:cached?row.source:failed?'retry:'+failure:'not-found',now,now+(url?30*DAY:failed?3600000:DAY)).run();}catch{/* Store enrichment must not break account synchronization. */}
  }
  // A manual correction made during a catalogue fetch takes precedence as well.
  for(const {game} of pending){try{const latest=await env.DB.prepare('SELECT url,source FROM gaming_store_links WHERE platform=? AND game_id=?').bind(data.platform,game.id).first();if(latest?.source==='manual'){const url=regionalProductUrl(data.platform,latest.url);if(url)game.url=url;}}catch{}}
  return data;
}
