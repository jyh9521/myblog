'use client';
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';

export default function RetryableImage({ src, alt, width = 1600, height = 900, imageClass, imageRef, onOpen, label, lazy = true }: {
  src: string; alt: string; width?: number; height?: number; imageClass?: string; imageRef?: RefObject<HTMLImageElement>;
  onOpen: () => void; label: string; lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const localRef = useRef<HTMLImageElement>(null);
  useImperativeHandle(imageRef, () => localRef.current!);
  // A cached failure can occur before hydration attaches the error handler.
  useEffect(() => { if (localRef.current?.complete && !localRef.current.naturalWidth) setFailed(true); }, [src, attempt]);
  const retrySrc = attempt ? `${src.split('#')[0]}${src.includes('?') ? '&' : '?'}image_retry=${attempt}` : src;
  return <span className="retryable-image" style={{ aspectRatio: `${width} / ${height}` }}>
    <button className="image-open" type="button" onClick={onOpen} aria-label={label} disabled={failed}>
      <img ref={localRef} className={imageClass} src={retrySrc} alt={alt} width={width} height={height}
        style={{ aspectRatio: `${width} / ${height}`, objectFit: 'contain', visibility: failed ? 'hidden' : undefined }}
        loading={lazy && !attempt ? 'lazy' : 'eager'} onError={() => setFailed(true)} onLoad={() => setFailed(false)} />
    </button>
    {failed && <span className="image-load-error" role="status"><span>图片加载失败</span><button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试加载图片</button></span>}
  </span>;
}
