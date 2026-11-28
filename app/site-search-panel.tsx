'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cleanSiteQuery, searchSiteIndex, siteSearchHref, type SiteSearchIndex } from '../lib/site-search';
import { loadSiteSearchIndex } from '../lib/site-search-client';
import { highlightMatches } from '../lib/article-search';
import EventSearch from './event-search';

export default function SiteSearchPanel({ active, fullPage = false, onClose }: { active: boolean; fullPage?: boolean; onClose?: () => void }) {
  const [query, setQuery] = useState(''), [index, setIndex] = useState<SiteSearchIndex | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle'), [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null), results = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    // React's autoFocus runs before the parent calls showModal(); focus only
    // after native modality is established, and never steal full-page focus.
    if (active && !fullPage) input.current?.focus({ preventScroll: true });
  }, [active, fullPage]);
  useEffect(() => {
    if (!fullPage) return;
    const readQuery = () => setQuery(cleanSiteQuery(new URLSearchParams(window.location.search).get('q') || ''));
    readQuery(); window.addEventListener('popstate', readQuery);
    return () => window.removeEventListener('popstate', readQuery);
  }, [fullPage]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    setStatus('loading');
    loadSiteSearchIndex().then(data => { if (current) { setIndex(data); setStatus('ready'); } }, () => { if (current) setStatus('error'); });
    return () => { current = false; };
  }, [active, retry]);
  const matches = useMemo(() => index ? searchSiteIndex(index, query, fullPage ? 20 : 6) : null, [index, query, fullPage]);
  function selectQuery(value: string) {
    const next = cleanSiteQuery(value); setQuery(next);
    if (!fullPage) return;
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('q', next); else url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.isDefaultPrevented() || event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = Array.from(results.current?.querySelectorAll<HTMLAnchorElement>('a[data-search-result]') || []);
    if (!links.length) return;
    event.preventDefault();
    const position = links.indexOf(event.target as HTMLAnchorElement);
    if (position < 0) links[event.key === 'ArrowDown' ? 0 : links.length - 1].focus();
    else if (position === 0 && event.key === 'ArrowUp') input.current?.focus();
    else links[Math.max(0, Math.min(links.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
  }
  return <div className="site-search-panel">
    <form className="site-search-form" role="search" action="/search/" method="get" onSubmit={event => {
      event.preventDefault(); results.current?.querySelector<HTMLAnchorElement>('a[data-search-result]')?.focus();
    }}>
      <label htmlFor={`${id}-query`}>搜索文章、游戏档案与时间线</label>
      <div className="site-search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
        <input ref={input} id={`${id}-query`} name="q" type="search" autoFocus={!fullPage} autoComplete="off" spellCheck={false} maxLength={160}
          placeholder="标题、游戏别名或关键词" value={query} aria-describedby={`${id}-status`} onChange={event => selectQuery(event.target.value)} onKeyDown={event => {
            // Chromium's search input otherwise consumes the first Escape to
            // clear its value, preventing the surrounding dialog's cancel event.
            if (event.key === 'Escape' && onClose && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onClose(); }
            else moveFocus(event);
          }} />
        {query && <button type="button" aria-label="清空站内搜索" onClick={() => { selectQuery(''); input.current?.focus(); }}>×</button>}
      </div>
    </form>
    <p className="site-search-status" id={`${id}-status`} role="status" aria-live="polite">
      {status === 'loading' || status === 'idle' ? '正在加载公开搜索索引…' : status === 'error' ? '搜索索引暂时未加载。' : !query.trim() ? '输入关键词开始搜索。只检索公开内容，时间线仅匹配名称，不展示剧情。' : matches?.total ? `找到 ${matches.total} 项结果${matches.total > matches.shown ? `，当前显示 ${matches.shown} 项` : ''}。` : '没有找到匹配的结果，试试其他关键词。'}
    </p>
    {status === 'error' && <div className="site-search-error" role="alert"><p>网络连接或索引加载失败，你可以重试或直接浏览目录。</p><button type="button" onClick={() => setRetry(value => value + 1)}>重新加载</button><a href="/posts/" data-overlay-navigate="true">浏览文章</a><a href="/games/" data-overlay-navigate="true">浏览游戏档案</a></div>}
    <div className="site-search-results" ref={results} onKeyDown={moveFocus} aria-busy={status === 'loading'}>
      {status === 'ready' && matches?.groups.map(group => group.total > 0 && <section className="site-search-group" key={group.kind} aria-labelledby={`${id}-${group.kind}`}>
        <h2 id={`${id}-${group.kind}`}>{group.label}<span>{group.total}</span></h2>
        <ul>{group.results.map(result => <li key={result.id}><a href={result.href} data-search-result="true" data-overlay-navigate="true">
          <strong><MatchedText value={result.title} query={query} /></strong>{result.excerpt && <span><MatchedText value={result.excerpt} query={query} /></span>}
        </a></li>)}</ul>
        {group.total > group.results.length && <p className="site-search-more">还有 {group.total - group.results.length} 项{fullPage ? '，请增加关键词缩小范围。' : '，可在完整搜索页查看更多。'}</p>}
      </section>)}
      {active && <EventSearch query={query} />}
    </div>
    {!fullPage && <div className="site-search-footer"><span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span><a href={siteSearchHref(query)} data-overlay-navigate="true">打开完整搜索页 ↗</a></div>}
  </div>;
}

function MatchedText({ value, query }: { value: string; query: string }) {
  return <>{highlightMatches(value, query).map((part, position) => part.match ? <mark key={position}>{part.text}</mark> : part.text)}</>;
}
