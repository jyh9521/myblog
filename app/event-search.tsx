'use client';
import { useEffect, useState } from 'react';
import { isEventIndex, searchEvents, type EventIndex } from '../lib/chronology-search';
export default function EventSearch({ query }: { query: string }) {
  const [enabled, setEnabled] = useState(false), [index, setIndex] = useState<EventIndex | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0), [limit, setLimit] = useState(20);
  // Consent is deliberately not restored from a shared URL or local storage.
  useEffect(() => {
    if (!enabled || index) return;
    const controller = new AbortController(); setError(false);
    fetch('/event-search-index.json', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error('index'); const data: unknown = await response.json();
      if (!isEventIndex(data)) throw Error('schema'); if (!controller.signal.aborted) setIndex(data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [enabled, index, retry]);
  useEffect(() => setLimit(20), [query]);
  const results = enabled && index ? searchEvents(index, query) : [];
  return <section className="event-search" aria-label="年表事件检索">
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> 同时检索年表事件（包含剧情与结局）</label>
    {enabled && <>
      <p role="status">{error ? '事件索引加载失败。' : !index ? '正在加载事件索引…' : !query.trim() ? '输入关键词查找事件。' : `年表事件：${results.length} 项`}</p>
      {error && <button type="button" onClick={() => setRetry(value => value + 1)}>重试事件检索</button>}
      <ul className="event-results">{results.slice(0, limit).map(result => <li key={result.id}><a href={result.href} data-search-result="true" data-overlay-navigate="true"><strong>{result.title}</strong><small>{result.series}</small><span>{result.excerpt}</span></a></li>)}</ul>
      {results.length > limit && <button type="button" onClick={() => setLimit(value => value + 20)}>显示更多事件</button>}
    </>}
  </section>;
}
