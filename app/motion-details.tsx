'use client';

import { Children, cloneElement, useEffect, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { motion, stepSpring } from '../lib/motion';
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Native no-JS disclosure with a single, interruptible height spring after hydration.
 * Only this bounded disclosure reflows; measurement never runs on every frame. */
export default function MotionDetails({ children, className, open = false }: { children: ReactNode; className?: string; open?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null), clip = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const initial = useRef(open), intent = useRef(open), setTarget = useRef<(value: boolean) => void>();
  const previousOpen = useRef(open);
  const [summary, ...body] = Children.toArray(children);
  useClientLayoutEffect(() => {
    const node = details.current, viewport = clip.current, inner = content.current;
    if (!node || !viewport || !inner) return;
    const trigger = node.querySelector('summary')!;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, time = 0, expectedNative = node.open, dirty = false;
    let observer: ResizeObserver | undefined;
    let target = node.open ? inner.getBoundingClientRect().height : 0;
    let spatial = { value: target, velocity: 0 }, effect = { value: node.open ? 1 : 0, velocity: 0 };
    intent.current = node.open;
    const nativeOpen = (value: boolean) => { expectedNative = value; node.open = value; };
    const paint = () => { viewport.style.height = `${Math.max(0, spatial.value)}px`; viewport.style.opacity = String(Math.max(0, Math.min(1, effect.value))); };
    const finish = () => {
      cancelAnimationFrame(frame); frame = 0;
      spatial = { value: target, velocity: 0 }; effect = { value: intent.current ? 1 : 0, velocity: 0 };
      if (!intent.current) nativeOpen(false);
      if (!intent.current) observer?.disconnect();
      // Closed native details already isolate focus. Keep their content searchable
      // by the browser; inert is needed only during the visual closing interval.
      viewport.inert = false;
      viewport.style.removeProperty('height'); viewport.style.removeProperty('opacity');
    };
    const tick = (now: number) => {
      if (dirty) { dirty = false; target = intent.current ? inner.getBoundingClientRect().height : 0; }
      if (preference.matches) { finish(); return; }
      const dt = Math.min((now - time) / 1000, .064); time = now;
      spatial = stepSpring(spatial, target, dt, motion.spatial.default);
      effect = stepSpring(effect, intent.current ? 1 : 0, dt, motion.effects.default); paint();
      if (Math.abs(spatial.value - target) < .25 && Math.abs(spatial.velocity) < .5 && Math.abs(effect.value - (intent.current ? 1 : 0)) < .001) finish();
      else frame = requestAnimationFrame(tick);
    };
    const schedule = () => { if (!frame) { time = performance.now(); frame = requestAnimationFrame(tick); } };
    const aim = (value: boolean) => {
      intent.current = value; trigger.setAttribute('aria-expanded', String(value));
      if (!value && viewport.contains(document.activeElement)) trigger.focus({ preventScroll: true });
      viewport.inert = !value;
      if (value) nativeOpen(true);
      if (value) observe();
      target = value ? inner.getBoundingClientRect().height : 0;
      if (preference.matches) finish(); else { paint(); schedule(); }
    };
    setTarget.current = aim;
    viewport.inert = false; trigger.setAttribute('aria-expanded', String(intent.current));
    // Observe natural content, not the animated clip. Late images and reflow from
    // viewport changes retarget once in RAF without a ResizeObserver feedback loop.
    function observe() {
      observer ||= new ResizeObserver(() => { if (intent.current) { dirty = true; schedule(); } });
      observer.observe(inner!);
    }
    if (intent.current) observe();
    const changedPreference = () => { if (preference.matches) { target = intent.current ? inner.getBoundingClientRect().height : 0; finish(); } };
    const nativeToggle = () => {
      if (node.open === expectedNative) return;
      // Find-in-page / native programmatic opening remains functional.
      expectedNative = node.open; aim(node.open);
    };
    preference.addEventListener('change', changedPreference); node.addEventListener('toggle', nativeToggle);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); setTarget.current = undefined; preference.removeEventListener('change', changedPreference); node.removeEventListener('toggle', nativeToggle); };
  }, []);
  useClientLayoutEffect(() => { if (open !== previousOpen.current) { previousOpen.current = open; setTarget.current?.(open); } }, [open]);
  return <details ref={details} className={className} open={initial.current || undefined}>
    {cloneElement(summary as ReactElement<{ onClick?: (event: React.MouseEvent) => void }>, { onClick: event => { if (!setTarget.current) return; event.preventDefault(); setTarget.current(!intent.current); } })}
    <div className="motion-details-clip" ref={clip}><div className="motion-details-content" ref={content}>{body}</div></div>
  </details>;
}
