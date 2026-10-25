'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChronologyImage } from '../../lib/chronology-types';
import RetryableImage from '../posts/retryable-image';

export default function ChronologyFigure({ image, variant = 'event', priority = false }: { image: ChronologyImage; variant?: 'cover' | 'era' | 'event'; priority?: boolean }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current, previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    return () => { if (node.open) node.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return <figure className={'chronology-figure chronology-figure-' + variant}>
    <RetryableImage key={image.src} src={image.src} alt={image.alt} width={image.width} height={image.height} lazy={!priority} onOpen={() => setOpen(true)} label={'放大图片：' + (image.caption || image.alt)} />
    <figcaption>{image.caption && <span>{image.caption}</span>}{image.credit && <small>{image.sourceUrl ? <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">{image.credit} · 图片出处 ↗</a> : image.credit}</small>}</figcaption>
    {open && <dialog ref={dialog} className="chronology-image-dialog" aria-label={image.caption || image.alt} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <button type="button" autoFocus className="chronology-image-close" onClick={() => setOpen(false)} aria-label="关闭放大图片">×</button>
      <img src={image.src} alt={image.alt} width={image.width} height={image.height} />
      <p>{image.caption || image.alt}</p>
      {image.sourceUrl && <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">{image.credit} · 图片出处 ↗</a>}
    </dialog>}
  </figure>;
}
