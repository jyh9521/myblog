'use client';

import { startTransition, useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { installMotion, reducedMotion, skipTransition, transition } from './motion-runtime';

type Pending = { path: string; finish: () => void; cover?: string; origin: HTMLElement | null };
const postSlug=(path:string)=>path.match(/^\/posts\/([^/]+)\/?$/)?.[1];
function coverFor(slug: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-motion-cover]')).find(element=>element.dataset.motionCover===slug) || null;
}
function nameCover(element:HTMLElement|null){if(element)element.style.viewTransitionName='article-cover';}
function clearNames(){document.querySelectorAll<HTMLElement>('[data-motion-cover]').forEach(element=>element.style.removeProperty('view-transition-name'));}

export default function MotionProvider(){
  const pathname=usePathname(),router=useRouter();
  const pending=useRef<Pending|null>(null);
  const generation=useRef(0);
  const previousPath=useRef(pathname);
  const entrance=useRef<Animation|null>(null);
  useEffect(()=>installMotion(document.body),[]);
  useLayoutEffect(()=>{
    document.querySelectorAll<HTMLAnchorElement>('.site-header nav a').forEach(a=>{const selected=a.pathname==='/'?pathname==='/':pathname.startsWith(a.pathname);if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    const job=pending.current;
    if(previousPath.current!==pathname&&!job&&!reducedMotion()){
      entrance.current?.cancel();
      entrance.current=document.getElementById('site-content')?.animate([{opacity:.85,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.2,0,0,1)'})||null;
    }
    previousPath.current=pathname;
    if(job&&pathname.replace(/\/$/,'')===job.path.replace(/\/$/,'')){
      clearNames();if(job.cover)nameCover(coverFor(job.cover));
      const content=document.getElementById('site-content');content?.focus({preventScroll:true});
      pending.current=null;job.finish();
    }
  },[pathname]);
  useEffect(()=>{
    function click(event:MouseEvent){
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!(event.target instanceof Element))return;
      const link=event.target.closest<HTMLAnchorElement>('a[href]');if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self'||link.hasAttribute('data-motion-native'))return;
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||url.pathname===location.pathname||url.hash||url.search||!/^\/(?:$|posts\/|games\/|about\/|ns\/|chronicles\/)/.test(url.pathname))return;
      if(reducedMotion()||typeof document.startViewTransition!=='function')return;
      const id=++generation.current;
      event.preventDefault();pending.current?.finish();pending.current=null;skipTransition();clearNames();
      const cover=postSlug(url.pathname)||postSlug(location.pathname);
      const source=link.querySelector<HTMLElement>('[data-motion-cover]')||link.closest('.post-card')?.querySelector<HTMLElement>('[data-motion-cover]')||(cover?coverFor(cover):null);
      nameCover(source||null);
      let job:Pending;
      const done=new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;job={path:url.pathname,cover,origin:link,finish:()=>{clearTimeout(timer);resolve();}};pending.current=job;timer=setTimeout(()=>{if(pending.current===job)pending.current=null;resolve();skipTransition();clearNames();},1800);});
      const view=transition(async()=>{if(pending.current!==job)return;startTransition(()=>router.push(url.pathname));await done;});
      view?.finished.catch(()=>{}).finally(()=>{if(generation.current===id&&!pending.current)clearNames();});
    }
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const cancel=()=>{generation.current++;entrance.current?.cancel();pending.current?.finish();pending.current=null;skipTransition();clearNames();};
    document.addEventListener('click',click,true);window.addEventListener('popstate',cancel);preference.addEventListener('change',cancel);
    return()=>{cancel();document.removeEventListener('click',click,true);window.removeEventListener('popstate',cancel);preference.removeEventListener('change',cancel);};
  },[router]);
  return null;
}
