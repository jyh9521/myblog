'use client';

import { startTransition, useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { installMotion, reducedMotion, skipTransition, transition } from './motion-runtime';
import { motion, springFrames } from '../lib/motion';
import { captureArticleReturn, holdHistoryScroll, type ArticleReturn } from './article-return-motion';

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
  const restoringHistory=useRef(false);
  const returning=useRef<ArticleReturn|null>(null);
  const nativeHistoryVisual=useRef(false);
  const historyScroll=useRef<(()=>void)|null>(null);
  useEffect(()=>installMotion(document.body),[]);
  useLayoutEffect(()=>{
    document.querySelectorAll<HTMLAnchorElement>('.site-header nav a').forEach(a=>{const selected=a.pathname==='/'?pathname==='/':pathname.startsWith(a.pathname);if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    const job=pending.current;
    if(previousPath.current!==pathname)document.getElementById('site-content')?.focus({preventScroll:true});
    if(previousPath.current!==pathname&&!reducedMotion()&&!returning.current&&!nativeHistoryVisual.current){
      entrance.current?.cancel();
      // Keep the shared cover's destination geometry fixed. Its own snapshot
      // provides spatial continuity while the surrounding live content fades in.
      // History restores an existing viewport position. A parent translation
      // would be mistaken for layout by the shelf's scroll restoration observer.
      const stationary=job?.cover||restoringHistory.current;
      entrance.current=document.getElementById('site-content')?.animate(springFrames(motion.spatial.default).map(value=>({opacity:Math.min(1,.35+.65*value),transform:stationary?'none':`translateY(${12*(1-value)}px)`})),{duration:600,easing:'linear'})||null;
    }
    previousPath.current=pathname;
    restoringHistory.current=false;
    nativeHistoryVisual.current=false;
    returning.current?.arrive();
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
      const id=++generation.current;
      returning.current?.cancel();returning.current=null;
      historyScroll.current?.();historyScroll.current=null;
      restoringHistory.current=false;
      event.preventDefault();pending.current?.finish();pending.current=null;skipTransition();clearNames();
      const cover=postSlug(url.pathname)||(/^\/(?:$|posts\/?)$/.test(url.pathname)?postSlug(location.pathname):undefined);
      // Ordinary routes never need a snapshot or a rendering-suppressed update.
      // Keep SPA navigation in reduced-motion / API-less browsers as well.
      if(!cover||reducedMotion()||typeof document.startViewTransition!=='function'){
        startTransition(()=>router.push(url.pathname));return;
      }
      const source=link.querySelector<HTMLElement>('[data-motion-cover]')||link.closest('.post-card')?.querySelector<HTMLElement>('[data-motion-cover]')||(cover?coverFor(cover):null);
      nameCover(source||null);
      let job:Pending;
      let navigated=false;
      const navigate=()=>{if(navigated||generation.current!==id)return;navigated=true;startTransition(()=>router.push(url.pathname));};
      // Do not freeze input while waiting on a slow network/React commit. The
      // route keeps loading normally if its optional shared capture times out.
      const done=new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;job={path:url.pathname,cover,origin:link,finish:()=>{clearTimeout(timer);resolve();}};pending.current=job;timer=setTimeout(()=>{navigate();if(pending.current===job)pending.current=null;resolve();skipTransition();clearNames();},180);});
      const view=transition(async()=>{if(generation.current!==id)return;navigate();await done;},'route');
      view?.finished.catch(()=>{}).finally(()=>{if(generation.current===id&&!pending.current)clearNames();});
    }
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const overlayNavigate=(event:Event)=>{const href=(event as CustomEvent<string>).detail;if(typeof href==='string'&&href.startsWith('/')&&!href.startsWith('//'))startTransition(()=>router.push(href));};
    window.addEventListener('blog:overlay-navigate',overlayNavigate);
    const cancel=()=>{generation.current++;entrance.current?.cancel();pending.current?.finish();pending.current=null;returning.current?.cancel();returning.current=null;historyScroll.current?.();historyScroll.current=null;skipTransition();clearNames();};
    const history=(event:PopStateEvent)=>{
      restoringHistory.current=true;cancel();
      historyScroll.current=holdHistoryScroll();
      nativeHistoryVisual.current=Boolean((event as PopStateEvent & {hasUAVisualTransition?:boolean}).hasUAVisualTransition);
      const slug=postSlug(previousPath.current);
      if(slug&&/^\/(?:$|posts\/?)$/.test(location.pathname)&&!reducedMotion()&&!nativeHistoryVisual.current){
        returning.current=captureArticleReturn(slug);
      }
    };
    document.addEventListener('click',click,true);window.addEventListener('popstate',history);preference.addEventListener('change',cancel);
    return()=>{cancel();document.removeEventListener('click',click,true);window.removeEventListener('popstate',history);window.removeEventListener('blog:overlay-navigate',overlayNavigate);preference.removeEventListener('change',cancel);};
  },[router]);
  return null;
}
