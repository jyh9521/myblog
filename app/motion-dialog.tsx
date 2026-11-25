'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, stepSpring } from '../lib/motion';
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Keep native top-layer modality/focus containment while entry and exit settle. */
export default function MotionDialog({ open, onClose, returnFocus, label, className, children }: {
  open: boolean; onClose: () => void; returnFocus: RefObject<HTMLElement>; label: string; className: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null), desired = useRef(open);
  const [retained, setRetained] = useState(open);
  const internalClose = useRef<HTMLDialogElement | null>(null);
  const spatial = useRef({ value: 0, velocity: 0 }), effect = useRef({ value: 0, velocity: 0 });
  const overflow = useRef<string | null>(null), restore = useRef<HTMLElement | null>(null);
  desired.current = open;
  useClientLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) setRetained(true);
    const release = () => {
      if (overflow.current !== null) { document.body.style.overflow = overflow.current; overflow.current = null; }
      if (restore.current?.isConnected) restore.current.focus({ preventScroll: true });
      setRetained(false);
    };
    if (!open && !node.open) { release(); return; }
    if (open && !node.open) {
      restore.current = returnFocus.current || document.activeElement as HTMLElement | null;
      overflow.current = document.body.style.overflow; document.body.style.overflow = 'hidden';
      node.showModal();
    }
    node.inert = !open;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, time = performance.now();
    const paint = () => {
      node.style.opacity = String(Math.max(0, Math.min(1, effect.current.value)));
      node.style.setProperty('--dialog-shade', String(Math.max(0, Math.min(1, effect.current.value))));
      node.style.scale = String(.96 + .04 * spatial.current.value);
      node.style.translate = `0 ${20 * (1 - spatial.current.value)}px`;
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      spatial.current = { value: open ? 1 : 0, velocity: 0 }; effect.current = { value: open ? 1 : 0, velocity: 0 }; paint();
      if (!open) {
        internalClose.current = node; node.close(); node.inert = false; release();
      }
    };
    const tick = (now: number) => {
      const dt = Math.min((now - time) / 1000, .064); time = now;
      spatial.current = stepSpring(spatial.current, open ? 1 : 0, dt, motion.spatial.default);
      effect.current = stepSpring(effect.current, open ? 1 : 0, dt, motion.effects.default); paint();
      if ([spatial.current, effect.current].every(s => Math.abs(s.value - (open ? 1 : 0)) < .001 && Math.abs(s.velocity) < .01)) finish();
      else frame = requestAnimationFrame(tick);
    };
    if (preference.matches) finish(); else { paint(); frame = requestAnimationFrame(tick); }
    const changedPreference = () => { if (preference.matches) finish(); };
    preference.addEventListener('change', changedPreference);
    return () => { cancelAnimationFrame(frame); preference.removeEventListener('change', changedPreference); };
  }, [open, returnFocus]);
  useClientLayoutEffect(() => () => {
    if (dialog.current?.open) dialog.current.close();
    if (overflow.current !== null) document.body.style.overflow = overflow.current;
  }, []);
  return (open || retained) ? <dialog ref={dialog} className={className} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClose={event => { if (internalClose.current === event.currentTarget) internalClose.current = null; else if (desired.current) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>{children}</dialog> : null;
}
