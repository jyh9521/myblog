'use client';
import { cloneElement, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { motion, stepSpring } from '../lib/motion';

/** Retain the last dialog through exit; retarget its effects spring on reopen. */
export default function MotionPresence({ children, returnFocus }: { children: ReactElement | null; returnFocus?: RefObject<HTMLElement> }) {
  const open=Boolean(children),last=useRef(children),node=useRef<HTMLDivElement>(null);
  const state=useRef({value:0,velocity:0});
  const opener=useRef<HTMLElement|null>(null);
  const [retained,setRetained]=useState(open);
  if(children)last.current=children;
  useLayoutEffect(()=>{
    const element=node.current;if(!element)return;
    if(open)setRetained(true);
    element.inert=!open; element.style.pointerEvents=open?'':'none';
    if(open)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden','true');
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,lastTime=performance.now();
    const paint=()=>{element.style.opacity=String(state.current.value);const panel=element.querySelector<HTMLElement>('.lightbox-content');if(panel)panel.style.scale=String(.985+.015*state.current.value);};
    const finish=()=>{cancelAnimationFrame(frame);state.current={value:open?1:0,velocity:0};paint();if(!open)setRetained(false);};
    const tick=(time:number)=>{state.current=stepSpring(state.current,open?1:0,Math.min((time-lastTime)/1000,.064),motion.effects.default);lastTime=time;paint();if(Math.abs(state.current.value-(open?1:0))<.001&&Math.abs(state.current.velocity)<.01)finish();else frame=requestAnimationFrame(tick);};
    if(preference.matches)finish();else{paint();frame=requestAnimationFrame(tick);}
    preference.addEventListener('change',finish);
    return()=>{cancelAnimationFrame(frame);preference.removeEventListener('change',finish);};
  },[open]);
  useLayoutEffect(()=>{
    // Restore in the layout setup, after React's commit restoreSelection.
    // Cleanup runs too early and React can refocus the retained closing dialog.
    if(!open){if(opener.current?.isConnected)opener.current.focus({preventScroll:true});return;}
    if(!node.current)return;
    const element=node.current;
    // Safari pointer activation need not focus a button, so the trigger supplies
    // its currentTarget explicitly rather than relying only on activeElement.
    opener.current=returnFocus?.current || document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]'));
    focusable()[0]?.focus({preventScroll:true});
    const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const items=focusable(),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
    element.addEventListener('keydown',trap);
    return()=>element.removeEventListener('keydown',trap);
  },[open]);
  return (open||retained)&&last.current?cloneElement(last.current as ReactElement<{ref:typeof node}>,{ref:node}):null;
}
