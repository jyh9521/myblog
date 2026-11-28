'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import MotionDialog from '../motion-dialog';
import { clampReadingPreferences, readReadingPosition, readReadingPreferences, removeReadingPosition, shouldOfferReadingResume, writeReadingPosition, writeReadingPreferences, type ReadingPosition, type ReadingPreferences } from '../../lib/reading-state';
import type { HeadingItem } from './markdown-utils';
import styles from './reading-tools.module.css';

// This module survives client routing. Observe traversal before a returning article mounts.
let historyArrival = '';
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { historyArrival = window.location.pathname; });
const fontSizes = [17, 19, 21], lineSpacings = [1.7, 1.95, 2.2];
function storage() { try { return window.localStorage; } catch { return null; } }

export default function ReadingTools({ bodyRef, readingKey, textLength, headings, activeHeading }: {
  bodyRef: RefObject<HTMLDivElement>; readingKey?: string; textLength: number; headings: HeadingItem[]; activeHeading: string;
}) {
  const [preferences, setPreferences] = useState<ReadingPreferences>(() => clampReadingPreferences(null));
  const latestPreferences = useRef(preferences); latestPreferences.current = preferences;
  const [ready, setReady] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [tocOpen, setTocOpen] = useState(false);
  const [inArticle, setInArticle] = useState(false), [storageMessage, setStorageMessage] = useState('');
  const [resume, setResume] = useState<ReadingPosition | null>(null);
  const settingsOpener = useRef<HTMLButtonElement>(null), tocOpener = useRef<HTMLButtonElement>(null);
  const historyRestored = useRef(false), pendingAnchor = useRef<(() => void) | null>(null);
  const longArticle = textLength >= 2500;

  useEffect(() => {
    historyRestored.current = historyArrival === window.location.pathname;
    historyArrival = '';
    setPreferences(readReadingPreferences(storage())); setReady(true);
    const node = bodyRef.current;
    const observer = new IntersectionObserver(entries => setInArticle(entries.some(entry => entry.isIntersecting)), { rootMargin: '-80px 0px 0px 0px' });
    if (node) observer.observe(node);
    const traversed = () => { historyRestored.current = true; setResume(null); };
    const pageShown = (event: PageTransitionEvent) => { if (event.persisted) traversed(); };
    window.addEventListener('popstate', traversed); window.addEventListener('hashchange', traversed); window.addEventListener('pageshow', pageShown);
    return () => {
      observer.disconnect(); window.removeEventListener('popstate', traversed); window.removeEventListener('hashchange', traversed); window.removeEventListener('pageshow', pageShown);
      pendingAnchor.current?.();
    };
  }, [bodyRef]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node || !ready) return;
    const previousSize = node.style.fontSize, previousSpacing = node.style.lineHeight;
    node.style.fontSize = `${fontSizes[preferences.fontSize]}px`; node.style.lineHeight = String(lineSpacings[preferences.lineSpacing]);
    document.documentElement.style.setProperty('--reading-font-size', node.style.fontSize);
    document.documentElement.style.setProperty('--reading-line-spacing', node.style.lineHeight);
    return () => { node.style.fontSize = previousSize; node.style.lineHeight = previousSpacing; };
  }, [bodyRef, ready, preferences.fontSize, preferences.lineSpacing]);

  function canOffer(position: ReadingPosition | null) {
    return shouldOfferReadingResume({ position, path: window.location.pathname, hash: window.location.hash,
      navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type || 'navigate',
      historyRestored: historyRestored.current, longArticle, enabled: latestPreferences.current.rememberPosition && Boolean(readingKey), scrollY: window.scrollY });
  }

  useEffect(() => {
    if (!ready || !readingKey || !longArticle || !preferences.rememberPosition) { setResume(null); return; }
    const position = readReadingPosition(storage(), readingKey);
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { if (canOffer(position)) setResume(position); }); });
    const moved = () => { if (window.scrollY > 80) setResume(null); };
    window.addEventListener('scroll', moved, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', moved); };
  }, [ready, readingKey, longArticle, preferences.rememberPosition]);

  useEffect(() => {
    if (!ready || !readingKey || !longArticle || !preferences.rememberPosition) return;
    let frame = 0, timer = 0, position: ReadingPosition | null = null;
    const flush = () => {
      window.clearTimeout(timer); timer = 0;
      if (position && latestPreferences.current.rememberPosition && !writeReadingPosition(storage(), position)) setStorageMessage('阅读位置仅用于本次阅读，浏览器未保存。');
    };
    const measure = () => {
      frame = 0;
      const node = bodyRef.current;
      if (!node || window.location.pathname !== readingKey || window.scrollY <= 200) return;
      const rect = node.getBoundingClientRect();
      if (rect.top > 0) return;
      let heading = '';
      for (const item of Array.from(node.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'))) {
        if (item.getBoundingClientRect().top <= 140) heading = item.id; else break;
      }
      position = { version: 1, path: readingKey, heading, scrollY: window.scrollY, progress: Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - window.innerHeight))), updatedAt: Date.now() };
      if (!timer) timer = window.setTimeout(flush, 750);
    };
    const scrolled = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('scroll', scrolled, { passive: true }); window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelAnimationFrame(frame); flush(); window.removeEventListener('scroll', scrolled); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden);
    };
  }, [bodyRef, ready, readingKey, longArticle, preferences.rememberPosition]);

  function changePreferences(next: ReadingPreferences) {
    const value = clampReadingPreferences(next); latestPreferences.current = value; setPreferences(value);
    const saved = writeReadingPreferences(storage(), value);
    setStorageMessage(saved ? '阅读偏好已保存在此浏览器。' : '偏好仅用于本次阅读，浏览器未保存。');
    if (!value.rememberPosition && readingKey) { removeReadingPosition(storage(), readingKey); setResume(null); }
  }
  function openSettings(event: React.MouseEvent<HTMLButtonElement>) {
    (settingsOpener as React.MutableRefObject<HTMLButtonElement | null>).current = event.currentTarget; setSettingsOpen(true);
  }
  function jumpToHeading(id: string, dialog: HTMLDialogElement | null) {
    const path = window.location.pathname;
    pendingAnchor.current?.();
    let historySettled = false, dialogClosed = !dialog?.open;
    const cleanup = () => { window.removeEventListener('blog:overlay-settled', settled); dialog?.removeEventListener('close', closed); };
    const jump = () => {
      if (!historySettled || !dialogClosed) return;
      cleanup(); pendingAnchor.current = null;
      if (window.location.pathname !== path) return;
      const target = document.getElementById(id);
      if (!target || !bodyRef.current?.contains(target)) return;
      window.location.hash = encodeURIComponent(id); target.scrollIntoView({ block: 'start', behavior: 'auto' });
      target.tabIndex = -1; target.focus({ preventScroll: true });
    };
    const settled = () => { historySettled = true; jump(); };
    const closed = () => { dialogClosed = true; jump(); };
    pendingAnchor.current = cleanup;
    window.addEventListener('blog:overlay-settled', settled, { once: true }); dialog?.addEventListener('close', closed, { once: true }); setTocOpen(false);
  }
  function continueReading() {
    const position = resume; setResume(null);
    // Recheck at click time: a late hash or history restoration always wins.
    if (!position || !canOffer(position)) return;
    const target = position.heading ? document.getElementById(position.heading) : null;
    if (target && bodyRef.current?.contains(target)) {
      target.scrollIntoView({ block: 'start', behavior: 'auto' }); target.tabIndex = -1; target.focus({ preventScroll: true });
    } else window.scrollTo({ top: Math.min(position.scrollY, document.documentElement.scrollHeight - window.innerHeight), behavior: 'auto' });
  }

  return <>
    <div className={styles.tools}><button type="button" className={styles.settingsButton} aria-label="打开阅读偏好" aria-haspopup="dialog" onClick={openSettings}><span aria-hidden="true">Aa</span> 阅读偏好</button></div>
    {resume && <aside className={styles.resume} aria-label="继续阅读提示"><p>上次读到约 {Math.round(resume.progress * 100)}%，要继续阅读吗？</p><div><button type="button" onClick={continueReading}>继续上次阅读</button><button type="button" onClick={() => setResume(null)}>从头阅读</button></div></aside>}
    {inArticle && <div className={styles.floating} aria-label="阅读工具">
      {headings.length > 0 && <button ref={tocOpener} type="button" aria-haspopup="dialog" aria-expanded={tocOpen} onClick={() => setTocOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>目录</button>}
      <button type="button" aria-label="阅读时调整偏好" aria-haspopup="dialog" onClick={openSettings}>Aa</button>
    </div>}
    <MotionDialog open={tocOpen} onClose={() => setTocOpen(false)} returnFocus={tocOpener} label="文章目录" className={`${styles.dialog} ${styles.tocDialog}`}>
      <div className={styles.dialogHeading}><h2>文章目录</h2><button type="button" aria-label="关闭文章目录" onClick={() => setTocOpen(false)}>×</button></div>
      <nav aria-label="移动文章目录"><ol className={styles.tocList}>{headings.map(heading => <li key={heading.id} style={{ paddingInlineStart: `${Math.min(heading.level - 1, 3) * 12}px` }}><a href={`#${encodeURIComponent(heading.id)}`} aria-current={activeHeading === heading.id ? 'location' : undefined} onClick={event => { event.preventDefault(); jumpToHeading(heading.id, event.currentTarget.closest('dialog')); }}>{heading.text}</a></li>)}</ol></nav>
    </MotionDialog>
    <MotionDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} returnFocus={settingsOpener} label="阅读偏好" className={styles.dialog}>
      <div className={styles.dialogHeading}><h2>阅读偏好</h2><button type="button" aria-label="关闭阅读偏好" onClick={() => setSettingsOpen(false)}>×</button></div>
      <fieldset className={styles.presets}><legend>正文字号</legend><div>{['标准', '较大', '大'].map((label, index) => <label key={label}><input type="radio" name="reading-font-size" value={index} checked={preferences.fontSize === index} onChange={() => changePreferences({ ...preferences, fontSize: index })} /><span>{label}</span></label>)}</div></fieldset>
      <fieldset className={styles.presets}><legend>行间距</legend><div>{['紧凑', '标准', '宽松'].map((label, index) => <label key={label}><input type="radio" name="reading-line-spacing" value={index} checked={preferences.lineSpacing === index} onChange={() => changePreferences({ ...preferences, lineSpacing: index })} /><span>{label}</span></label>)}</div></fieldset>
      {readingKey && longArticle && <label className={styles.remember}><input type="checkbox" checked={preferences.rememberPosition} onChange={event => changePreferences({ ...preferences, rememberPosition: event.target.checked })} /><span>记住长文章阅读位置<small>下次访问时询问是否继续，不会自动跳转。</small></span></label>}
      <p className={styles.storageNote} role="status" aria-live="polite">{storageMessage || '偏好仅保存在此浏览器，可随时调整。'}</p>
    </MotionDialog>
  </>;
}
