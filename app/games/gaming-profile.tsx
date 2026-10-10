'use client';
import {useEffect,useState} from 'react';
import {loadGamingProfile,platformNames,platformOrder,type GamingProfileData,type RecentGame} from '../../lib/gaming-profile';
import {gamingProfileMessages,type GamingProfileLocale} from '../../lib/gaming-profile-i18n';
function Cover({game,fallback}:{game:RecentGame;fallback:string}) {
  const [failed,setFailed]=useState(false);
  return <div className="gaming-cover">{game.cover&&!failed?<img src={game.cover} alt="" width={480} height={270} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className="gaming-cover-fallback">{fallback}</div>}</div>;
}
export function GamingProfileContent({data,locale='zh-CN'}:{data:GamingProfileData;locale?:GamingProfileLocale}) {
  const t=gamingProfileMessages[locale],format=new Intl.NumberFormat(locale,{maximumFractionDigits:1});
  const date=(v:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(new Date(v));
  const accounts=platformOrder.flatMap(p=>data.accounts.filter(a=>a.platform===p));
  const recent=accounts.flatMap(a=>a.recent).filter(g=>g.lastPlayed).sort((a,b)=>Date.parse(b.lastPlayed!)-Date.parse(a.lastPlayed!)).slice(0,6);
  if(!accounts.length)return <p className="gaming-status">{t.empty}</p>;
  return <>
    <ul className="gaming-platform-grid gaming-account-grid">{accounts.map(a=><li key={a.platform}>
      <span className="gaming-platform-name">{platformNames[a.platform]}</span><span className="gaming-account-name">{a.displayName}</span>
      <strong>{format.format(a.games)}</strong><span className="gaming-platform-unit">{a.countKind==='owned'?t.owned:t.played}</span>
      {a.minutes!==undefined&&<p>{t.hours}：{format.format(a.minutes/60)} {t.hour}{!a.timeComplete&&<small> · {t.partial}</small>}</p>}
      <p className="gaming-updated">{t.updated}<br/><time dateTime={a.updatedAt}>{date(a.updatedAt)}</time>{Date.now()-Date.parse(a.updatedAt)>48*3600000&&<span> · {t.stale}</span>}</p>
    </li>)}</ul><p className="gaming-updated">{t.sourceNote}</p>
    <div className="gaming-recent-section"><h3>{t.recent}</h3>{recent.length?<ul className="gaming-recent-grid">{recent.map(g=>{
      const content=<><Cover game={g} fallback={t.cover}/><div className="gaming-game-copy"><span className="gaming-game-platform">{platformNames[g.platform]}</span><h4>{g.title}</h4><p>{t.lastPlayed} <time dateTime={g.lastPlayed}>{date(g.lastPlayed!)}</time></p>{g.minutes!==undefined&&<p>{format.format(g.minutes/60)} {t.hour}</p>}{g.earned!==undefined&&<p>{t.achievements} {g.earned}{g.total!==undefined?` / ${g.total}`:''}</p>}</div></>;
      return <li key={`${g.platform}:${g.id}`}>{g.url?<a className="gaming-game-card" href={g.url} target="_blank" rel="noopener noreferrer">{content}</a>:<div className="gaming-game-card">{content}</div>}</li>;
    })}</ul>:<p className="gaming-status">{t.noRecent}</p>}</div>
  </>;
}
export default function GamingProfile({locale='zh-CN'}:{locale?:GamingProfileLocale}) {
  const [data,setData]=useState<GamingProfileData|null>(null),[failed,setFailed]=useState(false);const t=gamingProfileMessages[locale];
  useEffect(()=>{const c=new AbortController();let active=true;const timeout=setTimeout(()=>c.abort(),15000);loadGamingProfile(c.signal).then(d=>{if(active)setData(d);}).catch(()=>{if(active)setFailed(true);}).finally(()=>clearTimeout(timeout));return ()=>{active=false;c.abort();clearTimeout(timeout);};},[]);
  return <section className="gaming-profile-card" aria-labelledby="gaming-profile-title" lang={locale}><div className="section-title gaming-profile-heading"><div><span className="section-kicker">GAMING PROFILE</span><h2 id="gaming-profile-title">{t.title}</h2></div></div><div aria-live="polite" aria-busy={!data&&!failed}>{data?<GamingProfileContent data={data} locale={locale}/>:<p className="gaming-status">{failed?t.error:t.loading}</p>}</div></section>;
}
