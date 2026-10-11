'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import PostContent from './post-content';
import { extractHeadings, extractImages } from './markdown-utils';
import type { GameRecord } from '../../lib/game-types';

export default function ProtectedPost({ privateId, title, games }: { privateId: string; title: string; games: GameRecord[] }) {
  const [body,setBody]=useState<string|null>(null),[password,setPassword]=useState(''),[busy,setBusy]=useState(true),[message,setMessage]=useState('');
  useEffect(()=>{let active=true;const controller=new AbortController();setBody(null);setBusy(true);
    fetch(`/ns/api/posts/${privateId}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).then(async r=>{
      if(r.ok){const result: {body?:unknown}=await r.json();if(active&&typeof result.body==='string')setBody(result.body);}
      else if(r.status!==401&&active)setMessage('文章暂时不可用，请稍后重试。');
    }).catch(()=>{if(active)setMessage('暂时无法连接，请稍后重试。');}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;controller.abort();};
  },[privateId]);
  async function unlock(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');
    try{const r=await fetch(`/ns/api/posts/${privateId}/unlock`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      if(!r.ok){setMessage(r.status===429?'尝试次数过多，请 10 分钟后重试。':r.status===401?'密码不正确，请重试。':'文章暂时不可用，请稍后重试。');return;}
      const result:{body?:unknown}=await r.json();if(typeof result.body!=='string')throw Error();setBody(result.body);setPassword('');
    }catch{setMessage('暂时无法连接，请稍后重试。');}finally{setBusy(false);}
  }
  const headings=useMemo(()=>extractHeadings(body||''),[body]),images=useMemo(()=>extractImages(body||''),[body]);
  if(body!==null)return <PostContent body={body} title={title} headings={headings} images={images} games={games}/>;
  return <section className="protected-post" aria-labelledby="protected-post-title"><span className="section-kicker">PROTECTED ARTICLE</span><h2 id="protected-post-title">🔒 这篇文章需要密码</h2><p>输入作者提供的密码后即可阅读。</p>
    <form onSubmit={unlock}><label htmlFor="article-password">文章密码</label><div className="protected-post-input"><input id="article-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={128} disabled={busy}/><button className="hero-button" disabled={busy}>{busy?'正在连接…':'解锁文章 →'}</button></div></form><p role="status" aria-live="polite">{message}</p></section>;
}
