'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MotionDialog from './motion-dialog';
import SiteSearchPanel from './site-search-panel';
import { isSiteSearchShortcut } from '../lib/site-search';
import './site-search.css';

export default function SiteSearch() {
  const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false);
  const trigger = useRef<HTMLAnchorElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setMounted(true);
    const onKey = (event: KeyboardEvent) => {
      if (!isSiteSearchShortcut(event, event.target as HTMLElement, !!document.querySelector('dialog[open]'))) return;
      event.preventDefault(); returnFocus.current = document.activeElement as HTMLElement; setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <>
    <a ref={trigger} className="site-search-trigger" href="/search/" aria-label="站内搜索" aria-haspopup="dialog" aria-expanded={open} onClick={event => {
      if (!mounted || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault(); returnFocus.current = trigger.current; setOpen(true);
    }}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><span className="site-search-trigger-text">搜索</span><kbd>⌘/Ctrl K</kbd></a>
    {mounted && createPortal(<MotionDialog open={open} onClose={() => setOpen(false)} returnFocus={returnFocus} label="站内搜索" className="site-search-dialog">
      <div className="site-search-dialog-content"><div className="site-search-heading"><h2>站内搜索</h2><button type="button" className="site-search-close" aria-label="关闭站内搜索" onClick={() => setOpen(false)}>×</button></div><SiteSearchPanel active={open} onClose={() => setOpen(false)} /></div>
    </MotionDialog>, document.body)}
  </>;
}
