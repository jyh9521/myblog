'use client';

import { useId, useState } from 'react';
import type { Chronology as ChronologyData } from '../../lib/chronology-types';
import { filterChronology, readableEvents } from '../../lib/chronology';

const evidenceLabels = { compiled: '资料整理', game: '游戏内记载', manual: '手册记载', inferred: '推断', disputed: '存在争议' };
export default function Chronology({ data, defaultWork = '' }: { data: ChronologyData; defaultWork?: string }) {
  const instance = useId().replace(/:/g, '');
  const [works, setWorks] = useState<string[]>(defaultWork ? [defaultWork] : []);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const toggle = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
  const visible = filterChronology(data, allowed, works, query);
  const readable = readableEvents(data, allowed);
  const targetId = (id: string) => `chronology-${instance}-${id}`;
  const linkedEvents = (ids: string[] = []) => visible.filter(event => ids.includes(event.id));
  return <section className="lore-chronology" aria-label={data.title}>
    <header className="chronology-header"><span className="section-kicker">WORLD CHRONICLE</span><h2>{data.title}</h2><p>{data.description}</p><p className="chronology-calendar">{data.calendarNote}</p></header>
    <div className="chronology-controls">
      <fieldset><legend>查看作品 <small>仅筛选事件，不会解锁剧透</small></legend><div className="chronology-choices"><button type="button" aria-pressed={!works.length} onClick={() => setWorks([])}>全部作品</button>{data.works.map(work => <button key={work.id} type="button" aria-pressed={works.includes(work.id)} onClick={() => setWorks(toggle(works, work.id))}>{work.title}</button>)}</div></fieldset>
      <details className="chronology-spoilers"><summary>剧透设置 · 已允许 {allowed.length} / {data.works.length} 部作品</summary><p>勾选即允许显示该作品的剧情。涉及多部作品的事件，需要全部勾选才会显示；默认隐藏所有剧情。</p><div className="chronology-choices">{data.works.map(work => <label key={work.id}><input type="checkbox" checked={allowed.includes(work.id)} onChange={() => setAllowed(toggle(allowed, work.id))} />{work.title}</label>)}</div><button type="button" onClick={() => setAllowed([])}>隐藏全部剧透</button></details>
      <label className="chronology-search">搜索已解锁的事件<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="人物、原名、地点或年份" /></label>
    </div>
    <p className="chronology-count" role="status">当前显示 {visible.length} 条事件{readable.length < data.events.length ? ' · 还有剧情受剧透设置保护' : ''}</p>
    {visible.length > 0 ? <div className="chronology-layout"><nav className="chronology-nav" aria-label="年表时代导航">{data.eras.filter(era => visible.some(event => event.era === era.id)).map(era => <a key={era.id} href={`#${targetId('era-' + era.id)}`}>{era.title}</a>)}</nav><div className="chronology-eras">{data.eras.map(era => {
      const entries = visible.filter(event => event.era === era.id);
      if (!entries.length) return null;
      const years = [...new Set(entries.map(event => event.year))];
      return <section key={era.id} id={targetId('era-' + era.id)} className="chronology-era"><header><small>{era.calendar}</small><h3>{era.title}</h3>{era.note && <p>{era.note}</p>}</header>{years.map(year => <section key={year} className="chronology-year"><h4>{year}</h4><ol>{entries.filter(event => event.year === year).map(event => <li id={targetId('event-' + event.id)} key={event.id}>
        {event.day && <span className="chronology-day">{event.day}</span>}<h5>{event.title}</h5><p>{event.summary}</p><div className="chronology-tags">{event.works.map(id => <span key={id}>{data.works.find(work => work.id === id)?.title}</span>)}</div>
        <details key={`${event.id}-${allowed.join('-')}`}><summary>详细资料与来源 <span>{evidenceLabels[event.evidence]}</span></summary>{event.detail && <p className="chronology-text">{event.detail}</p>}{event.note && <aside className="chronology-text">{event.note}</aside>}<ul>{event.sources.map(id => { const source = data.sources.find(item => item.id === id)!; return <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>; })}</ul>{linkedEvents(event.related).length > 0 && <nav aria-label="关联事件">关联事件：{linkedEvents(event.related).map(related => <a key={related.id} href={`#${targetId('event-' + related.id)}`}>{related.title}</a>)}</nav>}</details>
      </li>)}</ol></section>)}</section>;
    })}</div></div> : <p className="chronology-empty">没有可显示的事件。请检查作品筛选、搜索词，或在剧透设置中允许已游玩的作品。</p>}
    <noscript><p>年表的筛选和剧透解锁需要启用 JavaScript；资料原文可通过下方链接阅读。</p></noscript>
    <footer className="chronology-sources">资料来源（外部原文含全系列剧透）：{data.sources.map(source => <a href={source.url} key={source.id} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>)}</footer>
  </section>;
}
