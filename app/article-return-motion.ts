import { motion, springFrames } from '../lib/motion';

/** A live, non-interactive cover bridge for history traversal. Unlike a native
 * View Transition, it can capture BEFORE Next commits its own popstate update.
 * It never writes scroll position or history state. */
export type ArticleReturn = { arrive: () => void; cancel: () => void };
type Rect = { x: number; y: number; width: number; height: number };
const visible = (r: Rect) => r.width > 0 && r.height > 0 && r.y < innerHeight && r.y + r.height > 0 && r.x < innerWidth && r.x + r.width > 0;
const coversFor = (slug: string) => Array.from(document.querySelectorAll<HTMLElement>('[data-motion-cover]')).filter(e => e.dataset.motionCover === slug);
const findCover = (slug: string) => {const covers=coversFor(slug);return covers.find(e=>visible(e.getBoundingClientRect()))||covers[0];};
const sameRect = (a: Rect, b: Rect) => ['x','y','width','height'].every(k => Math.abs(a[k as keyof Rect]-b[k as keyof Rect]) < .5);

export function captureArticleReturn(slug: string): ArticleReturn | null {
  const source = findCover(slug);
  const image = source instanceof HTMLImageElement ? source : source?.querySelector('img');
  if (!source || !image?.complete || !image.naturalWidth) return null;
  // The outer aspect-ratio placeholder can be taller than img's max-height.
  // Capture the actual rendered image, not that empty reserved space.
  const from = image.getBoundingClientRect();
  // Deep reading has no visible cover to move. Do not invent a flying image
  // from outside the viewport, or scroll the article back to its heading.
  if (!visible(from)) return null;
  const sourceStyle = getComputedStyle(image), imageStyle = sourceStyle;
  const nw = image.naturalWidth, nh = image.naturalHeight;
  const fit = (r: Rect, contain: boolean) => (contain ? Math.min : Math.max)(r.width/nw,r.height/nh);
  const startScale = fit(from, imageStyle.objectFit === 'contain');
  const startRadius = parseFloat(sourceStyle.borderTopLeftRadius) || 0;
  const layer = document.createElement('div'), copy = image.cloneNode(false) as HTMLImageElement;
  // The existing global smooth-scroll rule also animates browser restoration in
  // Chromium/Firefox. Keep the SAME browser-owned position, but restore it before
  // the shared cover lands, not concurrently with a second scrolling animation.
  const root=document.documentElement,scrollBehavior=root.style.scrollBehavior;
  root.style.scrollBehavior='auto';
  layer.dataset.motionReturn = 'captured';layer.setAttribute('aria-hidden','true');
  layer.style.cssText = 'position:fixed;left:0;top:0;overflow:hidden;pointer-events:none;z-index:2;transform-origin:0 0;contain:layout paint;';
  copy.removeAttribute('data-motion-cover');copy.removeAttribute('id');copy.removeAttribute('class');copy.alt='';
  copy.removeAttribute('srcset');copy.removeAttribute('sizes');copy.src=image.currentSrc||image.src;copy.loading='eager';
  copy.style.cssText = `position:absolute;left:0;top:0;display:block;width:${nw}px;height:${nh}px;max-width:none;max-height:none;margin:0;transform-origin:0 0;object-fit:fill;`;
  layer.append(copy);
  const hidden = new Map<HTMLElement, string>();
  const neutralImages = new Map<HTMLElement, string>();
  const revealOwners = new Set<HTMLElement>();
  const hide = (e: HTMLElement) => { if(!hidden.has(e))hidden.set(e,e.style.visibility);e.style.visibility='hidden'; };
  let stopped=false,frame=0,timer:ReturnType<typeof setTimeout>,animations:Animation[]=[];
  const cancel = () => {
    if(stopped)return;stopped=true;clearTimeout(timer);cancelAnimationFrame(frame);
    animations.forEach(a=>a.cancel());layer.remove();hidden.forEach((value,e)=>{e.style.visibility=value;});
    // Restoring the CSS hover target starts its ordinary smooth image zoom from
    // identity, instead of jumping 2.5% at the shared-cover handoff.
    neutralImages.forEach((value,e)=>{e.style.transform=value;});
    revealOwners.forEach(e=>e.removeAttribute('data-motion-return-target'));
    if(root.style.scrollBehavior==='auto')root.style.scrollBehavior=scrollBehavior;
    window.removeEventListener('resize',cancel);window.removeEventListener('wheel',cancel);window.removeEventListener('touchstart',cancel);window.removeEventListener('keydown',cancel);
  };
  const paint = (r:Rect,scale:number) => {
    layer.style.width=`${r.width}px`;layer.style.height=`${r.height}px`;layer.style.transform=`translate(${r.x}px,${r.y}px)`;
    layer.style.borderRadius=`${startRadius}px`;
    copy.style.transform=`translate(${(r.width-nw*scale)/2}px,${(r.height-nh*scale)/2}px) scale(${scale})`;
  };
  paint(from,startScale);document.body.append(layer);hide(source);
  window.addEventListener('resize',cancel);window.addEventListener('wheel',cancel,{passive:true});window.addEventListener('touchstart',cancel,{passive:true});window.addEventListener('keydown',cancel);
  // A slow/missing destination must never leave a floating or hidden image.
  timer=setTimeout(cancel,1000);
  return {cancel,arrive:()=>{
    if(stopped)return;
    // Home can display the same article in both featured and latest. Hide both
    // until restoration identifies the visible occurrence, never choose by order.
    for(const destination of coversFor(slug))if(destination!==source){
      hide(destination);
      if(destination instanceof HTMLImageElement&&destination.closest('.post-visual')){
        neutralImages.set(destination,destination.style.transform);destination.style.transform='none';
      }
      const owner=destination.closest<HTMLElement>('.post-card,.m3-feature');
      if(owner){owner.setAttribute('data-motion-return-target','');revealOwners.add(owner);}
    }
    let previous:Rect|null=null,stable=0,attempts=0;
    const settle=()=>{
      if(stopped)return;
      const target=findCover(slug);
      if(!target||target===source){cancel();return;}
      const clip=target.closest<HTMLElement>('.post-visual');
      const to=(clip||target).getBoundingClientRect();
      // Next/browser owns restoration. Observe its settled geometry, without
      // translating a parent or feeding animated rects into scroll restoration.
      stable=previous&&sameRect(previous,to)?stable+1:0;previous=to;
      if(stable<2&&++attempts<12){frame=requestAnimationFrame(settle);return;}
      if(!visible(to)){cancel();return;}
      hide(target);clearTimeout(timer);
      const targetImage=target instanceof HTMLImageElement?target:target.querySelector('img');
      const endScale=fit(to,targetImage?getComputedStyle(targetImage).objectFit==='contain':false);
      const featured=target.closest<HTMLElement>('.m3-feature');
      const radiusStyle=getComputedStyle(clip||featured||target);
      const endRadius=parseFloat(radiusStyle.borderTopLeftRadius)||0;
      const endBottomRadius=featured&&!clip?0:endRadius;
      const outer:Keyframe[]=[],inner:Keyframe[]=[];
      for(const value of springFrames(motion.spatial.default)){
        const mix=(a:number,b:number)=>a+(b-a)*value;
        const w=mix(from.width,to.width),h=mix(from.height,to.height),sx=w/to.width,sy=h/to.height,k=mix(startScale,endScale),radius=mix(startRadius,endRadius);
        const bottom=mix(startRadius,endBottomRadius);
        outer.push({transform:`translate(${mix(from.x,to.x)}px,${mix(from.y,to.y)}px) scale(${sx},${sy})`,borderRadius:`${radius/sx}px ${radius/sx}px ${bottom/sx}px ${bottom/sx}px / ${radius/sy}px ${radius/sy}px ${bottom/sy}px ${bottom/sy}px`});
        // Cancel the outer non-uniform scale: artwork keeps its natural aspect
        // ratio as its crop changes from the article frame to the card frame.
        inner.push({transform:`translate(${(w-nw*k)/(2*sx)}px,${(h-nh*k)/(2*sy)}px) scale(${k/sx},${k/sy})`});
      }
      layer.style.width=`${to.width}px`;layer.style.height=`${to.height}px`;layer.dataset.motionReturn='moving';
      animations=[layer.animate(outer,{duration:600,easing:'linear',fill:'both'}),copy.animate(inner,{duration:600,easing:'linear',fill:'both'})];
      animations.forEach(animation=>{void animation.finished.catch(()=>{});});
      animations[0].finished.then(cancel,cancel);timer=setTimeout(cancel,750);
    };
    frame=requestAnimationFrame(settle);
  }};
}
