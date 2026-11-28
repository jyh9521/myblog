'use client';
import { useEffect, useRef, useState } from 'react';
import { downloadState } from '../../lib/interaction-feedback';
import { externalLinkProps } from '../../lib/external-links';
export default function DownloadLink({ href }: { href: string }) {
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const bypass = useRef(false), request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function download(event: React.MouseEvent<HTMLAnchorElement>) {
    if (bypass.current || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
    const link = event.currentTarget, url = new URL(link.href);
    if (url.origin !== location.origin) { setStatus('已打开下载地址；若未开始，请检查浏览器的下载提示。'); return; }
    event.preventDefault(); if (request.current) return;
    setBusy(true); setStatus('正在检查附件…');
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url.href, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
      const result = downloadState(response.status);
      if (result === 'failed') { setStatus(`附件暂时不可用（${response.status}），请稍后重试。`); return; }
      setStatus(result === 'ready' ? '附件可访问，已交给浏览器下载。' : '已打开下载地址；请检查浏览器的下载提示。');
      bypass.current = true; link.click(); bypass.current = false;
    } catch { setStatus('附件检查失败，请检查网络后重试。'); }
    finally { clearTimeout(timer); request.current = null; setBusy(false); }
  }
  return <span className="download-control"><a href={href} download {...externalLinkProps(href)} aria-disabled={busy} onClick={download}>{busy ? '正在检查…' : '下载附件 ↗'}</a><span role="status">{status}</span></span>;
}
