export const platformNames = {nintendo:'Nintendo',psn:'PlayStation',xbox:'Xbox',steam:'Steam',gog:'GOG',epic:'Epic Games'} as const;
export type PlatformId = keyof typeof platformNames;
export const platformOrder: PlatformId[] = ['nintendo','psn','xbox','steam','gog','epic'];
export interface RecentGame {id:string;title:string;platform:PlatformId;lastPlayed?:string;cover?:string;url?:string;minutes?:number;earned?:number;total?:number;}
export interface PlatformAccount {platform:PlatformId;displayName:string;games:number;countKind:'owned'|'played';minutes?:number;timeComplete:boolean;updatedAt:string;recent:RecentGame[];}
export interface GamingProfileData {version:2;accounts:PlatformAccount[];}
function record(v:unknown):Record<string,unknown> {return v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};}
const number=(v:unknown):number|undefined=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:undefined;
const text=(v:unknown):string=>typeof v==='string'?v:'';
const date=(v:unknown):string|undefined=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():undefined;
export function httpsUrl(v:unknown):string|undefined {try{const u=new URL(text(v));return u.protocol==='https:'&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}}
export function parseGamingProfile(value:unknown):GamingProfileData {
  const data=record(value);
  if(data.version!==2||!Array.isArray(data.accounts)||data.accounts.length>6)throw Error('Invalid gaming profile');
  const seen=new Set<string>();
  const accounts=data.accounts.map(entry=>{
    const a=record(entry),p=text(a.platform),games=number(a.games),updatedAt=date(a.updatedAt);
    if(!Object.hasOwn(platformNames,p)||seen.has(p)||games===undefined||!Number.isInteger(games)||!updatedAt||!Array.isArray(a.recent)||!['owned','played'].includes(text(a.countKind)))throw Error('Invalid account');
    seen.add(p);const platform=p as PlatformId;
    const recent=a.recent.slice(0,6).map(entry=>{
      const g=record(entry);if(!text(g.id)||!text(g.title))throw Error('Invalid game');
      return {id:text(g.id),title:text(g.title),platform,lastPlayed:date(g.lastPlayed),cover:httpsUrl(g.cover),url:httpsUrl(g.url),minutes:number(g.minutes),earned:number(g.earned),total:number(g.total)};
    });
    return {platform,displayName:text(a.displayName),games,countKind:a.countKind as 'owned'|'played',minutes:number(a.minutes),timeComplete:a.timeComplete===true,updatedAt,recent};
  });
  return {version:2,accounts};
}
export async function loadGamingProfile(signal?:AbortSignal):Promise<GamingProfileData> {
  const response=await fetch('/ns/api/accounts/public',{signal,cache:'no-store'});
  if(!response.ok)throw Error(`Gaming profile HTTP ${response.status}`);
  return parseGamingProfile(await response.json());
}

// Regional storefronts take priority. Unknown catalog IDs use the store's own
// search rather than constructing a product URL that may point at another game.
export function gameStoreLink(game:RecentGame):{url:string;search:boolean}|undefined {
  const query=encodeURIComponent(game.title.trim());
  const url=httpsUrl(game.url);const u=url?new URL(url):undefined;
  if(game.platform==='nintendo') {
    if(u?.hostname==='store-jp.nintendo.com')return {url:u.href,search:false};
    return {url:`https://store-jp.nintendo.com/search?q=${query}`,search:true};
  }
  if(game.platform==='xbox') {
    if(u?.hostname==='www.xbox.com' && /^\/[a-z]{2}-[a-z]{2}\/games\/store\//i.test(u.pathname)) {
      u.pathname=u.pathname.replace(/^\/[a-z]{2}-[a-z]{2}\//i,'/zh-TW/');return {url:u.href,search:false};
    }
    return {url:`https://www.xbox.com/zh-TW/search/results?q=${query}`,search:true};
  }
  if(game.platform==='psn') {
    if(u?.hostname==='store.playstation.com' && /^\/[^/]+\/(product|concept)\//.test(u.pathname)) {
      u.pathname=u.pathname.replace(/^\/[^/]+\//,'/zh-hant-hk/');return {url:u.href,search:false};
    }
    return {url:`https://store.playstation.com/zh-hant-hk/search/${query}`,search:true};
  }
  return url?{url,search:false}:undefined;
}
