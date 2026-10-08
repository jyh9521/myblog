'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { remarkGameFrames } from './game-frames';
import { remarkImageCompare } from './compare-markdown';
import { remarkHeadingIds, type ArticleImage, type HeadingItem } from './markdown-utils';
import { ReadingProgress, ShareButton } from '../site-enhancements';
import ImageCompare from './image-compare';
import GameFrameCard from '../games/game-frame-card';
import RetryableImage from './retryable-image';
import PdfEmbed from './pdf-embed';
import { externalLinkProps } from '../../lib/external-links';
import type { GameRecord } from '../../lib/game-types';

type Props = { body: string; title: string; headings: HeadingItem[]; images: ArticleImage[]; games: GameRecord[]; cover?: ArticleImage; audio?: string; video?: string; attachment?: string };

export default function PostContent({ body, title, headings, images, games, cover, audio, video, attachment }: Props) {
  const [tocOpen, setTocOpen] = useState(false);
  const [activeImage, setActiveImage] = useState<number | null>(null);
  const [activeHeading, setActiveHeading] = useState('');
  const touchStart = useRef<number | null>(null);
  const coverRef = useRef<HTMLImageElement>(null);
  const galleryImages = cover ? [cover, ...images] : images;
  const galleryOffset = cover ? 1 : 0;
  const imageGroups = [...new Set(galleryImages.map(image => image.group || '未分类'))].map(group => ({ group, firstIndex: galleryImages.findIndex(image => (image.group || '未分类') === group) }));

  useEffect(() => {
    if (activeImage === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveImage(null);
      if (event.key === 'ArrowRight') setActiveImage(index => index === null ? null : (index + 1) % galleryImages.length);
      if (event.key === 'ArrowLeft') setActiveImage(index => index === null ? null : (index - 1 + galleryImages.length) % galleryImages.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [activeImage, galleryImages.length]);

  useEffect(() => {
    const elements = headings.map(item => document.getElementById(item.id)).filter((item): item is HTMLElement => Boolean(item));
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveHeading(visible.target.id);
    }, { rootMargin: '-15% 0px -75% 0px' });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  useEffect(() => {
    const image = coverRef.current;
    if (!image || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (image.isConnected) image.style.transform = `translateY(${Math.min(18, scrollY * 0.025)}px) scale(1.035)`; }); };
    update(); addEventListener('scroll', update, { passive: true });
    return () => { removeEventListener('scroll', update); cancelAnimationFrame(frame); image.style.transform = ''; };
  }, [cover?.src]);

  const currentImage = activeImage === null ? null : galleryImages[activeImage];
  // Keep component identities stable when TOC highlighting or the lightbox changes.
  const markdownComponents = useMemo(() => ({
    pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => <CodeBlock {...props}>{children}</CodeBlock>,
    img: ({ src, alt, title }: { src?: string; alt?: string; title?: string }) => {
      const imageIndex = images.findIndex(image => image.src === src);
      const index = Math.max(0, imageIndex) + galleryOffset;
      const image = images[imageIndex];
      const imageSrc = src || image?.src || '';
      const caption = title || image?.caption || alt || image?.alt || '';
      return <span className="article-figure"><span className="article-image-button">
        <RetryableImage key={imageSrc} src={imageSrc} alt={alt || image?.alt || ''} width={image?.width} height={image?.height} onOpen={() => setActiveImage(index)} label={`放大图片：${caption || `第 ${index + 1} 张`}`} />
      </span>{caption && <span className="article-image-caption">{caption}</span>}</span>;
    },
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 {...props}>{children}</h1>,
    a: ({ href = '', title, children }: { href?: string; title?: string; children?: React.ReactNode }) => {
      if (title === 'pdf-embed') return <PdfEmbed src={href}>{children}</PdfEmbed>;
      const game = href.match(/game-frame\.invalid\/(g|p|n|x|s)\?([^#]*)/);
      if (game) { const params = new URLSearchParams(game[2]); const slug = params.get('slug') || ''; return <GameFrameCard frame={game[1]} game={games.find(item => item.slug === slug)} title={params.get('title') || ''} status={params.get('status') || ''} />; }
      const compare = href.match(/image-compare\.invalid\/compare\?([^#]*)/);
      if (compare) { const params = new URLSearchParams(compare[1]); return <ImageCompare before={params.get('before') || ''} after={params.get('after') || ''} beforeLabel={params.get('beforeLabel') || '之前'} afterLabel={params.get('afterLabel') || '之后'} />; }
      return <a href={href} title={title} {...externalLinkProps(href)}>{children}</a>;
    },
  }), [images, games, galleryOffset]);

  return <>
    <ReadingProgress />
    {cover && <span className="article-cover-button">
      <span className="article-cover-viewport"><RetryableImage key={cover.src} src={cover.src} alt={cover.alt} width={cover.width} height={cover.height} imageRef={coverRef} imageClass="cover cover-parallax" lazy={false} onOpen={() => setActiveImage(0)} label={`放大封面图片：${cover.caption}`} /></span><span className="article-image-caption">{cover.caption}</span>
    </span>}
    <div className="article-content">
      <div className="article-actions"><span>阅读文章</span><ShareButton title={title} /></div>
      {headings.length > 0 && <nav className={`post-toc${tocOpen ? ' is-open' : ''}`} aria-label="文章目录">
        <button className="toc-toggle" type="button" aria-expanded={tocOpen} onClick={() => setTocOpen(open => !open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg><span>文章目录</span>
        </button>
        <ol className="post-toc-list">{headings.map(heading => <li key={heading.id} className={`toc-level-${heading.level}${activeHeading === heading.id ? ' is-active' : ''}`}>
          <a href={`#${encodeURIComponent(heading.id)}`} onClick={() => setTocOpen(false)}>{heading.text}</a>
        </li>)}</ol>
      </nav>}
      <div className="body"><ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkHeadingIds, remarkGameFrames, remarkImageCompare]} components={markdownComponents}>{body}</ReactMarkdown></div>
      {audio && <section className="media"><h2>音频</h2><audio controls src={audio} /></section>}
      {video && <section className="media"><h2>视频</h2><video controls src={video} /></section>}
      {attachment && <p className="media"><a href={attachment} download {...externalLinkProps(attachment)}>下载附件 ↗</a></p>}
    </div>
    {currentImage && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="文章图片浏览器" onClick={() => setActiveImage(null)} onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={event => {
      if (touchStart.current === null) return;
      const delta = event.changedTouches[0].clientX - touchStart.current;
      if (Math.abs(delta) > 48) setActiveImage(index => index === null ? null : (index + (delta < 0 ? 1 : -1) + galleryImages.length) % galleryImages.length);
      touchStart.current = null;
    }}>
      <button className="lightbox-close" type="button" aria-label="关闭图片浏览器" onClick={() => setActiveImage(null)}><span aria-hidden="true">×</span></button>
      {imageGroups.length > 1 && <nav className="image-group-nav" aria-label="图片分组">{imageGroups.map(item => <button type="button" key={item.group} className={currentImage.group === item.group ? 'active' : ''} onClick={event => { event.stopPropagation(); setActiveImage(item.firstIndex); }}>{item.group}</button>)}</nav>}
      {galleryImages.length > 1 && <button className="lightbox-arrow lightbox-prev" type="button" aria-label="上一张图片" onClick={event => { event.stopPropagation(); setActiveImage(index => index === null ? null : (index - 1 + galleryImages.length) % galleryImages.length); }}>‹</button>}
      <div className="lightbox-content" onClick={event => event.stopPropagation()}>
        <img src={currentImage.src} alt={currentImage.alt} />
        {currentImage.caption && <p className="lightbox-caption">{currentImage.caption}</p>}
        <span className="lightbox-count">{activeImage! + 1} / {galleryImages.length}</span>
      </div>
      {galleryImages.length > 1 && <button className="lightbox-arrow lightbox-next" type="button" aria-label="下一张图片" onClick={event => { event.stopPropagation(); setActiveImage(index => index === null ? null : (index + 1) % galleryImages.length); }}>›</button>}
    </div>}
  </>;
}

function CodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const value = String((children as React.ReactElement<{ children?: React.ReactNode }>)?.props?.children ?? '');
  async function copy() { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  return <div className="code-block"><button type="button" className="code-copy" onClick={copy}>{copied ? '已复制 ✓' : '复制代码'}</button><pre {...props}>{children}</pre></div>;
}
