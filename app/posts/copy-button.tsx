'use client';
import { useState } from 'react';
import { copyText } from '../../lib/interaction-feedback';
export default function CopyButton({ text, className, label }: { text: string; className?: string; label: string }) {
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  async function copy() {
    setBusy(true);
    const result = await copyText(text, navigator);
    setStatus(result === 'copied' ? '已复制 ✓' : '复制失败，请选择内容手动复制');
    setBusy(false);
  }
  return <><button type="button" className={className} disabled={busy} onClick={copy}>{busy ? '正在复制…' : status === '已复制 ✓' ? status : label}</button><span className="copy-feedback" role="status">{status !== '已复制 ✓' && status}</span></>;
}
