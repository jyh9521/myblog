'use client';

import Link from 'next/link';
import { useLayoutEffect, useMemo, useState } from 'react';
import type { Post } from '../../lib/posts';
import { articleText, searchTerms, matchExcerpt, highlightMatches } from '../../lib/article-search';

function searchable(value: string) {
  return articleText(value).toLocaleLowerCase();
}

export default function ArchiveSearch({ posts }: { posts: Post[] }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const tags = useMemo(() => [...new Set(posts.flatMap(post => post.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [posts]);

  useLayoutEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('tag') || '';
    if (tags.includes(initial)) setTag(initial);
  }, [tags]);

  const filtered = useMemo(() => {
    const terms = searchTerms(query);
    return posts.filter(post => {
      const text = searchable(`${post.title} ${post.description} ${post.body}`);
      return (!tag || post.tags.includes(tag)) && terms.every(term => text.includes(term));
    });
  }, [posts, query, tag]);

  function selectTag(next: string) {
    setTag(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('tag', next); else url.searchParams.delete('tag');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  return <>
    <div className="archive-controls">
      <label className="archive-search"><span className="sr-only">搜索文章标题和正文</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题和正文" />
        {query && <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => setQuery('')}>×</button>}
      </label>
      <div className="tag-filters" aria-label="按标签筛选文章">
        <button type="button" className={!tag ? 'active' : ''} aria-pressed={!tag} onClick={() => selectTag('')}>全部</button>
        {tags.map(item => <button type="button" key={item} className={tag === item ? 'active' : ''} aria-pressed={tag === item} onClick={() => selectTag(tag === item ? '' : item)}>{item}</button>)}
      </div>
      <p className="archive-result-count">{filtered.length === posts.length ? `共 ${posts.length} 篇文章` : `找到 ${filtered.length} 篇文章`}</p>
    </div>
    {filtered.length ? <div className="post-grid">{filtered.map((post, index) =>
      <article key={post.slug} className="post-card">
        <Link className={`post-visual visual-${index % 3}`} href={`/posts/${post.slug}/`} aria-label={`阅读：${post.title}`}>
          {post.cover ? <img src={post.cover} alt="" /> : <span className="visual-mark" aria-hidden="true">{index % 2 ? '✦' : '●'}</span>}
          <span className="visual-arrow" aria-hidden="true">↗</span>
        </Link>
        <div className="post-meta archive-card-meta">{post.pinned && <span className="pinned-badge">置顶</span>}<time>{post.date.slice(0, 10)}</time><span className="meta-line" />{post.tags.length ? post.tags.map(item => <button type="button" className="card-tag" key={item} onClick={() => selectTag(item)}>{item}</button>) : '博客'}</div>
        <h3><Link href={`/posts/${post.slug}/`}><MatchedText text={post.title} query={query} /></Link></h3>
        {query.trim() ? <p className="search-excerpt"><MatchedText text={matchExcerpt(post.body, post.description, query)} query={query} /></p> : post.description && <p>{post.description}</p>}
        <Link className="read-more" href={`/posts/${post.slug}/`}>阅读全文 <span aria-hidden="true">→</span></Link>
      </article>
    )}</div> : <div className="archive-empty"><span aria-hidden="true">⌕</span><strong>没有找到匹配的文章</strong><p>试试其他关键词或清除标签筛选。</p><button type="button" onClick={() => { setQuery(''); selectTag(''); }}>清除筛选</button></div>}
  </>;
}

function MatchedText({ text, query }: { text: string; query: string }) {
  return <>{highlightMatches(text, query).map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : part.text)}</>;
}
