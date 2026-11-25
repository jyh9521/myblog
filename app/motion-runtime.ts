import { motion, springFrames, staggerDelay, createInteraction, stepInteraction, interactionSettled, interactionVisuals, type InteractionState, type InteractionTargets } from '../lib/motion';

const controls = '.site-header nav a,button:not([disabled]),.hero-button,.m3-quick a,.home-search button,.home-categories a,.card-tag,.game-platform-link,.tag-cloud a,.game-section-nav a,.m3-directory-intro>a';
const cards = '.post-card,.m3-feature,.related-card,.neighbor-card,.game-shelf-item,.timeline-directory-card,.game-platform-card,.gaming-game-card,.social-link-card';
const revealTargets = '.post-card,.game-shelf-item,.timeline-directory-card,.related-card,.gaming-profile-card';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Delegated input, bounded observer work, a single idle-free physics loop. */
export function installMotion(root: HTMLElement) {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  type Item = { state: InteractionState; target: InteractionTargets; card: boolean };
  const states = new Map<HTMLElement, Item>();
  let records = new WeakMap<HTMLElement, Item>();
  const painted = new Set<HTMLElement>();
  const animations = new Set<Animation>();
  const seen = new WeakSet<Element>();
  let frame = 0, last = 0, pressed: HTMLElement | null = null;
  let hovered: HTMLElement[] = [], pointer: number | null = null;
  const disabled=(element:HTMLElement)=>element.matches(':disabled,[aria-disabled=true]');
  function clear(element:HTMLElement){for(const property of ['scale','translate','--motion-shade','--motion-elevation'])element.style.removeProperty(property);painted.delete(element);states.delete(element);records.delete(element);}
  function tick(time: number) {
    const dt = Math.min((time-last)/1000,.064); last=time;
    for (const [element,item] of states) {
      if (!element.isConnected || disabled(element)) { clear(element); continue; }
      item.state=stepInteraction(item.state,item.target,dt);
      const settled=interactionSettled(item.state,item.target);
      if(settled)item.state=createInteraction(item.target.hover,item.target.press);
      const value=interactionVisuals(item.state,item.card);
      element.style.setProperty('--motion-shade',String(value.shade));
      element.style.setProperty('--motion-elevation',String(value.elevation));
      // Individual transform properties don't overwrite layout transforms (e.g. arrows).
      element.style.translate=`0 ${value.lift}px`;
      element.style.scale=String(value.scale);
      if(settled){states.delete(element);if(item.target.hover===0&&item.target.press===0)clear(element);}
    }
    if(states.size)frame=requestAnimationFrame(tick);else{frame=0;last=0;}
  }
  function aim(element: HTMLElement | null,channel:keyof InteractionTargets,target: number) {
    if(!element||!element.isConnected||disabled(element)||preference.matches)return;
    const item=records.get(element)||{state:createInteraction(),target:{hover:0,press:0},card:element.matches(cards)};
    item.target[channel]=target;records.set(element,item);states.set(element,item);painted.add(element);
    if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}
  }
  const elementFor=(event: Event,selector:string) => event.target instanceof Element ? event.target.closest<HTMLElement>(selector):null;
  const release=()=>{aim(pressed,'press',0);pressed=null;pointer=null;};
  const down=(event:PointerEvent)=>{if(event.button!==0||!event.isPrimary)return;release();pointer=event.pointerId;pressed=elementFor(event,controls)||elementFor(event,cards);aim(pressed,'press',1);};
  const up=(event:PointerEvent)=>{if(pointer===event.pointerId)release();};
  function setHover(target:EventTarget|null){
    const next:HTMLElement[]=[];
    if(target instanceof Element && root.contains(target))for(const selector of [controls,cards]){const element=target.closest<HTMLElement>(selector);if(element&&!disabled(element)&&!next.includes(element))next.push(element);}
    for(const element of hovered)if(!next.includes(element))aim(element,'hover',0);
    for(const element of next)if(!hovered.includes(element))aim(element,'hover',1);
    hovered=next;
  }
  const over=(event:PointerEvent)=>{if(finePointer.matches&&event.pointerType!=='touch')setHover(event.target);};
  const out=(event:PointerEvent)=>{if(finePointer.matches&&event.pointerType!=='touch')setHover(event.relatedTarget);};
  const cancel=(event:PointerEvent)=>{up(event);setHover(null);};
  const keydown=(event:KeyboardEvent)=>{
    if(event.repeat||event.defaultPrevented||!['Enter',' '].includes(event.key)||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
    const element=elementFor(event,controls)||elementFor(event,cards);
    if(!element||event.key===' '&&!element.matches('button,[role=button]'))return;
    release();pressed=element;aim(pressed,'press',1);
  };
  const keyup=(event:KeyboardEvent)=>{if(pointer===null&&(event.key==='Enter'||event.key===' '))release();};
  const observe = new IntersectionObserver(entries=>{
    let index=0;
    for(const entry of entries){if(!entry.isIntersecting)continue;observe.unobserve(entry.target);
      if(preference.matches||entry.target.hasAttribute('data-motion-return-target')||entry.boundingClientRect.top<innerHeight*.6)continue;
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
  const mutations=new MutationObserver(changes=>{for(const record of changes){if(record.type==='attributes'&&record.target instanceof HTMLElement&&disabled(record.target))clear(record.target);for(const node of record.addedNodes)if(node instanceof Element)scan(node);}for(const element of painted)if(!element.isConnected)clear(element);});
  mutations.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-disabled']});
  function reset(){cancelAnimationFrame(frame);frame=0;last=0;for(const element of painted)clear(element);states.clear();records=new WeakMap();pressed=null;hovered=[];pointer=null;for(const animation of animations)animation.cancel();animations.clear();}
  root.dataset.motion='ready';
  root.addEventListener('pointerdown',down);root.addEventListener('pointerover',over);root.addEventListener('pointerout',out);
  window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',reset);
  root.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);preference.addEventListener('change',reset);finePointer.addEventListener('change',reset);
  return()=>{reset();observe.disconnect();mutations.disconnect();delete root.dataset.motion;root.removeEventListener('pointerdown',down);root.removeEventListener('pointerover',over);root.removeEventListener('pointerout',out);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',reset);root.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);preference.removeEventListener('change',reset);finePointer.removeEventListener('change',reset);};
}

export type NativeTransition = { finished: Promise<void>; ready: Promise<void>; skipTransition(): void };
type TransitionDocument = Document & { startViewTransition?: (update:()=>void|Promise<void>)=>NativeTransition };
let active: NativeTransition | undefined;
/** Only shared elements use snapshots. Whole-page theme snapshots suppress native
 * hit testing and lose rapid pointer input even with pointer-events:none. */
export function transition(update:()=>void|Promise<void>,kind:'route'|'theme'='theme'): NativeTransition | undefined {
  active?.skipTransition();
  const doc=document as TransitionDocument;
  if(kind==='theme'||reducedMotion()||!doc.startViewTransition){void update();return;}
  document.documentElement.dataset.motionTransition=kind;
  const current=doc.startViewTransition(update);active=current;
  current.ready.catch(()=>{});
  current.finished.catch(()=>{}).finally(()=>{if(active===current){active=undefined;delete document.documentElement.dataset.motionTransition;}});
  return current;
}
export function skipTransition(){active?.skipTransition();}
