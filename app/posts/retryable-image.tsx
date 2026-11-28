'use client';
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';

export default function RetryableImage({ src, alt, width = 1600, height = 900, imageClass, imageRef, onOpen, label, lazy = true }: {
  src: string; alt: string; width?: number; height?: number; imageClass?: string; imageRef?: RefObject<HTMLImageElement>;
  onOpen: (event?: React.MouseEvent<HTMLButtonElement>) => void; label: string; lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0), [loading, setLoading] = useState(true);
  const localRef = useRef<HTMLImageElement>(null);
  useImperativeHandle(imageRef, () => localRef.current!);
  // A cached failure can occur before hydration attaches the error handler.
  useEffect(() => {
    const image = localRef.current;
    setFailed(Boolean(image?.complete && !image.naturalWidth));
    setLoading(!image?.complete);
  }, [src, attempt]);
  const retrySrc = attempt ? `${src.split('#')[0]}${src.includes('?') ? '&' : '?'}image_retry=${attempt}` : src;
  return <span className="retryable-image" data-loading={loading || undefined} aria-busy={loading} style={{ aspectRatio: `${width} / ${height}` }}>
    <button className="image-open" type="button" onClick={onOpen} aria-label={label} disabled={failed}>
      <img ref={localRef} className={imageClass} src={retrySrc} alt={alt} width={width} height={height}
        style={{ aspectRatio: `${width} / ${height}`, objectFit: 'contain', visibility: failed ? 'hidden' : undefined }}
        decoding="async" loading={lazy && !attempt ? 'lazy' : 'eager'} onError={() => { setFailed(true); setLoading(false); }} onLoad={() => { setFailed(false); setLoading(false); }} />
    </button>
    {loading && <span className="image-loading-label" aria-hidden="true">图片加载中…</span>}
    {failed && <span className="image-load-error" role="status"><span>图片加载失败</span><button type="button" onClick={() => { setFailed(false); setLoading(true); setAttempt(value => value + 1); }}>重试加载图片</button></span>}
  </span>;
}
