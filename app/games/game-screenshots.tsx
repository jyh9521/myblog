'use client';

import { useEffect, useRef, useState } from 'react';
import './game-screenshots.css';

export default function GameScreenshots({ title, images }: { title: string; images: string[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = images.length;
  const go = (index: number) => {
    const target = rail.current;
    if (!target) return;
    const next = Math.max(0, Math.min(count - 1, index));
    target.scrollTo({ left: next * target.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  useEffect(() => {
    const row = thumbs.current;
    const thumb = row?.children[active] as HTMLElement | undefined;
    if (!row || !thumb) return;
    const bounds = row.getBoundingClientRect(), item = thumb.getBoundingClientRect();
    if (item.left < bounds.left) row.scrollLeft += item.left - bounds.left;
    if (item.right > bounds.right) row.scrollLeft += item.right - bounds.right;
  }, [active]);

  return <section className="game-screenshots" aria-labelledby="game-screenshots-title">
    <h2 id="game-screenshots-title">游戏截图</h2>
    <div className="game-screenshots-stage">
      <div className="game-screenshots-rail" ref={rail} tabIndex={count > 1 ? 0 : undefined} aria-label="截图浏览区"
        onScroll={event => {
          const el = event.currentTarget;
          if (el.clientWidth) setActive(Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          go(active + (event.key === 'ArrowLeft' ? -1 : 1));
        }}>
        {images.map((src, index) => <a key={src} href={src} target="_blank" rel="noopener noreferrer" tabIndex={index === active ? 0 : -1}
          aria-label={`打开第 ${index + 1} 张原图（新标签页）`}>
          <img src={src} alt={`${title} · 截图 ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} draggable={false} />
        </a>)}
      </div>
      {count > 1 && <>
        <button className="game-screenshots-prev" aria-label="上一张截图" disabled={active === 0} onClick={() => go(active - 1)}>‹</button>
        <button className="game-screenshots-next" aria-label="下一张截图" disabled={active === count - 1} onClick={() => go(active + 1)}>›</button>
        <span className="game-screenshots-count" aria-live="polite">{active + 1} / {count}</span>
      </>}
    </div>
    {count > 1 && <div className="game-screenshots-thumbs" ref={thumbs} aria-label="截图缩略图">
      {images.map((src, index) => <button type="button" key={src} aria-label={`查看第 ${index + 1} 张截图`} aria-current={index === active ? 'true' : undefined} onClick={() => go(index)}>
        <img src={src} alt="" loading="lazy" />
      </button>)}
    </div>}
  </section>;
}
