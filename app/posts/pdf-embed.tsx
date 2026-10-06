import type { ReactNode } from 'react';

// Only local upload URLs may be passed to the self-hosted reader.
export function pdfUploadUrl(value: string): string | null {
  try {
    if (!value.startsWith('/uploads/') || /[?#\\]/.test(value)) return null;
    const decoded = decodeURIComponent(value);
    if (!/\.pdf$/i.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..') || /[\x00-\x1f\\?#]/.test(decoded)) return null;
    return decoded.split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())).join('/');
  } catch { return null; }
}

export default function PdfEmbed({ src, children }: { src: string; children?: ReactNode }) {
  const url = pdfUploadUrl(src);
  if (!url) return <span className="article-pdf-error">PDF 地址无效，请重新选择资源库中的 PDF 文件。</span>;
  const title = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : 'PDF 文档';
  return <span className="article-pdf">
    <span className="article-pdf-toolbar"><strong>{children || 'PDF 文档'}</strong><span>
      <a href={url} target="_blank" rel="noopener noreferrer">新窗口打开 ↗</a>
      <a href={url} download>下载 PDF ↓</a>
    </span></span>
    <iframe src={`/pdfjs/web/viewer.html?file=${encodeURIComponent(url)}#zoom=page-width`} title={`PDF 阅读器：${title}`} loading="lazy" />
    <span className="article-pdf-note">支持翻页、缩放和搜索；加载失败时可使用上方的打开或下载按钮。</span>
  </span>;
}
