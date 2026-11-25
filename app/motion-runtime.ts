import { motion, springFrames, staggerDelay, stepSpring, type SpringState } from '../lib/motion';

const controls = '.site-header nav a,button:not([disabled]),.hero-button,.m3-quick a,.tag-link,.card-tag,.game-platform-link';
const cards = '.post-card,.m3-feature,.related-card,.neighbor-card,.game-shelf-item,.timeline-directory-card,.game-platform-card';
const revealTargets = '.post-card,.game-shelf-item,.timeline-directory-card,.related-card,.gaming-profile-card';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Delegated input, bounded observer work, a single idle-free physics loop. */
export function installMotion(root: HTMLElement) {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  type Item = { state: SpringState; target: number; card: boolean };
  const states = new Map<HTMLElement, Item>();
  const animations = new Set<Animation>();
  const seen = new WeakSet<Element>();
  let frame = 0, last = 0, pressed: HTMLElement | null = null, hovered: HTMLElement | null = null;
  function tick(time: number) {
    const dt = last ? Math.min((time-last)/1000,.064) : 1/60; last=time;
    for (const [element,item] of states) {
      if (!element.isConnected) { states.delete(element); continue; }
      item.state=stepSpring(item.state,item.target,dt,motion.spatial.fast);
      const settled=Math.abs(item.state.value-item.target)<.001&&Math.abs(item.state.velocity)<.01;
      const value=settled?item.target:item.state.value;
      element.style.setProperty('--motion-press',String(value));
      // Individual transform properties don't overwrite layout transforms (e.g. arrows).
      if (item.card) element.style.translate=`0 ${-3*value}px`;
      else element.style.scale=String(1-.035*value);
      if(settled){states.delete(element);if(item.target===0){element.style.removeProperty('scale');element.style.removeProperty('translate');element.style.removeProperty('--motion-press');}}
    }
    if(states.size)frame=requestAnimationFrame(tick);else{frame=0;last=0;}
  }
  function aim(element: HTMLElement | null,target: number,card=false) {
    if(!element||preference.matches)return;
    const item=states.get(element)||{state:{value:Number(element.style.getPropertyValue('--motion-press'))||0,velocity:0},target,card};
    item.target=target;states.set(element,item);if(!frame)frame=requestAnimationFrame(tick);
  }
  const elementFor=(event: Event,selector:string) => event.target instanceof Element ? event.target.closest<HTMLElement>(selector):null;
  const down=(event:PointerEvent)=>{if(event.button!==0)return;pressed=elementFor(event,controls);aim(pressed,1);};
  const up=()=>{aim(pressed,0);pressed=null;};
  const over=(event:PointerEvent)=>{if(!finePointer.matches||event.pointerType==='touch')return;const next=elementFor(event,cards);if(next===hovered)return;aim(hovered,0,true);hovered=next;aim(hovered,1,true);};
  const out=(event:PointerEvent)=>{if(hovered&&(!(event.relatedTarget instanceof Node)||!hovered.contains(event.relatedTarget))){aim(hovered,0,true);hovered=null;}};
  const keydown=(event:KeyboardEvent)=>{if(!event.repeat&&(event.key==='Enter'||event.key===' ')&&!(event.target instanceof HTMLInputElement)&&!(event.target instanceof HTMLTextAreaElement)){pressed=elementFor(event,controls);aim(pressed,1);}};
  const keyup=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' ')up();};
  const observe = new IntersectionObserver(entries=>{
    let index=0;
    for(const entry of entries){if(!entry.isIntersecting)continue;observe.unobserve(entry.target);
      if(preference.matches||entry.boundingClientRect.top<innerHeight*.6)continue;
      const values=springFrames(motion.spatial.default);
      const animation=entry.target.animate(values.map((value,i)=>({transform:`translateY(${12*(1-value)}px)`,opacity:Math.min(1,i/12)})),{duration:600,delay:staggerDelay(index++),easing:'linear',fill:'backwards'});
      animations.add(animation);animation.finished.then(()=>animations.delete(animation),()=>animations.delete(animation));
    }
  },{threshold:.08});
  function scan(node: Element){
    const candidates=[...(node.matches(revealTargets)?[node]:[]),...node.querySelectorAll(revealTargets)];
    for(const item of candidates){if(!seen.has(item)){seen.add(item);observe.observe(item);}}
  }
  scan(root);
  // Only newly inserted subtrees, never a full DOM scan on each input or frame.
  const mutations=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)scan(node);});
  mutations.observe(root,{childList:true,subtree:true});
  function reset(){cancelAnimationFrame(frame);frame=0;last=0;for(const [element] of states){element.style.removeProperty('scale');element.style.removeProperty('translate');element.style.removeProperty('--motion-press');}for(const element of [pressed,hovered]){element?.style.removeProperty('scale');element?.style.removeProperty('translate');element?.style.removeProperty('--motion-press');}states.clear();pressed=null;hovered=null;for(const animation of animations)animation.cancel();animations.clear();}
  root.dataset.motion='ready';
  root.addEventListener('pointerdown',down);root.addEventListener('pointerover',over);root.addEventListener('pointerout',out);
  window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',reset);
  root.addEventListener('keydown',keydown);root.addEventListener('keyup',keyup);preference.addEventListener('change',reset);
  return()=>{reset();observe.disconnect();mutations.disconnect();delete root.dataset.motion;root.removeEventListener('pointerdown',down);root.removeEventListener('pointerover',over);root.removeEventListener('pointerout',out);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',reset);root.removeEventListener('keydown',keydown);root.removeEventListener('keyup',keyup);preference.removeEventListener('change',reset);};
}

export type NativeTransition = { finished: Promise<void>; ready: Promise<void>; skipTransition(): void };
type TransitionDocument = Document & { startViewTransition?: (update:()=>void|Promise<void>)=>NativeTransition };
let active: NativeTransition | undefined;
/** Theme and routing share one snapshot owner. Never stack view transitions. */
export function transition(update:()=>void|Promise<void>): NativeTransition | undefined {
  active?.skipTransition();
  const doc=document as TransitionDocument;
  if(reducedMotion()||!doc.startViewTransition){void update();return;}
  const current=doc.startViewTransition(update);active=current;
  current.ready.catch(()=>{});
  current.finished.catch(()=>{}).finally(()=>{if(active===current)active=undefined;});
  return current;
}
export function skipTransition(){active?.skipTransition();}
