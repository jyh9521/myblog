'use client';

import { useRef, useState } from 'react';
import type { ChronologyImage } from '../../lib/chronology-types';
import RetryableImage from '../posts/retryable-image';
import MotionDialog from '../motion-dialog';

export default function ChronologyFigure({ image, variant = 'event', priority = false }: { image: ChronologyImage; variant?: 'cover' | 'era' | 'event'; priority?: boolean }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  return <figure className={'chronology-figure chronology-figure-' + variant}>
    <RetryableImage key={image.src} src={image.src} alt={image.alt} width={image.width} height={image.height} lazy={!priority} onOpen={event => { if (event) opener.current = event.currentTarget; setOpen(true); }} label={'放大图片：' + (image.caption || image.alt)} />
    <figcaption>{image.caption && <span>{image.caption}</span>}{image.credit && <small>{image.sourceUrl ? <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">{image.credit} · 图片出处 ↗</a> : image.credit}</small>}</figcaption>
    <MotionDialog open={open} onClose={() => setOpen(false)} returnFocus={opener} className="chronology-image-dialog" label={image.caption || image.alt}>
      <button type="button" autoFocus className="chronology-image-close" onClick={() => setOpen(false)} aria-label="关闭放大图片">×</button>
      <img src={image.src} alt={image.alt} width={image.width} height={image.height} />
      <p>{image.caption || image.alt}</p>
      {image.sourceUrl && <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">{image.credit} · 图片出处 ↗</a>}
    </MotionDialog>
  </figure>;
}
