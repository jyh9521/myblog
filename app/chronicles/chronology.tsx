'use client';

import { useEffect, useState } from 'react';
import type { Chronology as ChronologyData } from '../../lib/chronology-types';
import { filterChronology, readableEvents, readableImage } from '../../lib/chronology';
import ChronologyFigure from './chronology-figure';

const evidenceLabels = { compiled: '资料整理', game: '游戏内记载', manual: '手册记载', inferred: '推断', disputed: '存在争议' };
const verificationLabels = { crosschecked: '剧情已对照', 'single-source': '剧情单源', conflict: '资料有分歧', corrected: '已据原作订正' };
const dateLabels = { crosschecked: '日期已对照', 'single-source': '日期单源', conflict: '纪年有分歧', undated: '日期未定' };
const mediumLabels = { 'game-capture': '原版游戏画面', 'game-transcript': '原版对白转录', 'manual-scan': '原版手册扫描', 'firsthand-guide': '原作者攻略', 'official-publication': '官方剧情介绍', 'creator-interview': '开发者访谈', secondary: '二手整理' };
const supportLabels = { event: '剧情依据', date: '纪年依据', context: '背景说明', variant: '差异对照' };
export default function Chronology({ data }: { data: ChronologyData }) {
  const allWorks = data.works.map(work => work.id);
  const [works, setWorks] = useState<string[]>([]);
  const [allowed, setAllowed] = useState<string[]>(allWorks);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const [shareFallback, setShareFallback] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setWorks((params.get('works') || '').split(',').filter(id => allWorks.includes(id)));
    setQuery(params.get('q') || '');
    if (params.has('spoilers')) setAllowed((params.get('spoilers') || '').split(',').filter(id => allWorks.includes(id)));
  // One static page instance: query parameters are reading preferences, not routes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id]);
  const toggle = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
  const visible = filterChronology(data, allowed, works, query);
  const readable = readableEvents(data, allowed);
  const workGuide = data.works.filter(work => work.synopsis && (!works.length || works.includes(work.id)));
  const catalogOnly = works.length > 0 && works.every(id => !data.events.some(event => event.works.includes(id)));
  const targetId = (id: string) => 'chronology-' + data.id + '-' + id;
  const linkedEvents = (ids: string[] = []) => visible.filter(event => ids.includes(event.id));
  async function share(eventId = '') {
    const url = new URL(window.location.href);
    url.search = '';
    if (works.length) url.searchParams.set('works', works.join(','));
    if (query.trim()) url.searchParams.set('q', query.trim());
    if (allowed.length !== allWorks.length) url.searchParams.set('spoilers', allowed.join(','));
    url.hash = eventId ? targetId('event-' + eventId) : '';
    try { await navigator.clipboard.writeText(url.href); setCopied(eventId || 'view'); setShareFallback(''); }
    catch { setShareFallback(url.href); setCopied(''); }
  }
  return <section className="lore-chronology" aria-label={data.title}>
    <p className="chronology-calendar">{data.calendarNote}</p>
    <div className="chronology-controls">
      <fieldset><legend>查看作品 <small>可多选；同一事件不重复收录</small></legend><div className="chronology-choices"><button type="button" aria-pressed={!works.length} onClick={() => setWorks([])}>全部作品</button>{data.works.map(work => <button key={work.id} type="button" aria-pressed={works.includes(work.id)} onClick={() => setWorks(toggle(works, work.id))}>{work.title}</button>)}</div></fieldset>
      <details className="chronology-spoilers"><summary>剧透设置 · 已允许 {allowed.length} / {data.works.length} 部作品</summary><p>本页默认完整展示。涉及多部作品揭秘的事件，需要全部允许才会显示；隐藏后的事件不会出现在搜索、年代导航或关联链接中。</p><div className="chronology-choices">{data.works.map(work => <label key={work.id}><input type="checkbox" checked={allowed.includes(work.id)} onChange={() => setAllowed(toggle(allowed, work.id))} />{work.title}</label>)}</div><div className="chronology-choices"><button type="button" onClick={() => setAllowed(allWorks)}>显示完整年表</button><button type="button" onClick={() => setAllowed([])}>隐藏全部剧透</button></div></details>
      <label className="chronology-search">搜索事件<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="人物、原文名称、地点或年份" /></label>
      <div className="chronology-share"><button type="button" onClick={() => share()}>复制当前视图链接</button><span role="status">{copied === 'view' ? '链接已复制' : copied ? '事件链接已复制' : ''}</span>{shareFallback && <label>复制此链接<input readOnly value={shareFallback} onFocus={event => event.target.select()} /></label>}</div>
    </div>
    {!!workGuide.length && <details className="chronology-source-library chronology-work-guide" open={works.length > 0 || undefined}><summary>重制与衍生作品 · 剧情及收录说明</summary><p>以下按作品版本分线阅读，不把重制补写、平行故事、模拟世界或时间旅行合并成旧作的同一段历史。没有精确纪年的剧情只保留作品内顺序；发行年份不作为故事年份。</p><dl>{workGuide.map(work => <div key={work.id}><dt>{work.title}<small>{work.continuity}</small></dt><dd><p>{work.synopsis}</p><p className="chronology-coverage-note">{work.coverageNote}</p><ul>{work.sources?.map(id => { const source=data.sources.find(item=>item.id===id)!; return <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>; })}</ul></dd></div>)}</dl></details>}
    <p className="chronology-count" role="status">当前显示 {visible.length} / {data.events.length} 条事件{readable.length < data.events.length ? ' · 部分剧情已隐藏' : ''}</p>
    {visible.length > 0 ? <div className="chronology-layout"><nav className="chronology-nav" aria-label="年表时代导航">{data.eras.filter(era => visible.some(event => event.era === era.id)).map(era => <a key={era.id} href={'#' + targetId('era-' + era.id)}>{era.title}<small>{visible.filter(event => event.era === era.id).length} 条</small></a>)}</nav><div className="chronology-eras">{data.eras.map(era => {
      const entries = visible.filter(event => event.era === era.id);
      if (!entries.length) return null;
      const years = [...new Set(entries.map(event => event.year))];
      return <section key={era.id} id={targetId('era-' + era.id)} className="chronology-era"><header><small>{era.calendar}</small><h2>{era.title}</h2>{era.note && <p>{era.note}</p>}</header>{readableImage(era.image, allowed, works) && <ChronologyFigure key={era.image.src} image={era.image} variant="era" />}{years.map(year => <section key={year} className="chronology-year"><h3>{year}</h3><ol>{entries.filter(event => event.year === year).map(event => <li id={targetId('event-' + event.id)} key={event.id}>
        {event.day && <span className="chronology-day">{event.day}</span>}<h4>{event.title}</h4><p>{event.summary}</p><div className="chronology-tags">{event.works.map(id => <span key={id}>{data.works.find(work => work.id === id)?.title}</span>)}{event.verification && <span className={'verification-' + event.verification}>{verificationLabels[event.verification]}</span>}{event.dateStatus && <span>{dateLabels[event.dateStatus]}</span>}</div>
        {!!event.images?.length && <div className="chronology-event-images">{event.images.filter(image => readableImage(image, allowed, works)).map(image => <ChronologyFigure key={image.src} image={image} />)}</div>}
        <details key={event.id + '-' + allowed.join('-')}><summary>事件资料与核对依据 <span>{evidenceLabels[event.evidence]}</span></summary>{event.detail && <p className="chronology-text">{event.detail}</p>}{event.note && <aside className="chronology-text">{event.note}</aside>}<ul>{event.citations?.length ? event.citations.map((citation, index) => { const source = data.sources.find(item => item.id === citation.source)!; return <li key={index}><span className="chronology-citation-kind">{supportLabels[citation.supports]}</span>{citation.medium && <span className="chronology-citation-kind">{mediumLabels[citation.medium]}</span>} <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><p>{citation.locator}{citation.note ? ' · ' + citation.note : ''}</p></li>; }) : event.sources.map(id => { const source = data.sources.find(item => item.id === id)!; return <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>; })}</ul>{linkedEvents(event.related).length > 0 && <nav aria-label="关联事件">关联事件：{linkedEvents(event.related).map(related => <a key={related.id} href={'#' + targetId('event-' + related.id)}>{related.title}</a>)}</nav>}<button className="chronology-event-share" type="button" onClick={() => share(event.id)}>复制此事件链接</button></details>
      </li>)}</ol></section>)}</section>;
    })}</div></div> : <p className="chronology-empty">{catalogOnly ? '所选作品目前仅有上方的剧情收录说明；未取得足以逐条核实的故事材料，不将玩法或角色上架当作剧情事件。' : '没有匹配事件。可清除搜索词、切换作品，或在剧透设置中允许显示剧情。'}</p>}
    <details className="chronology-source-library"><summary>资料目录与适用范围 · {data.sources.length} 项</summary><p>来源数量不等于已核实：剧情、日期和版本差异分别标注；同源转载不作为独立证据。</p><ol>{data.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>{source.kind && <small>{source.kind}</small>}{source.scope && <p>{source.scope}</p>}</li>)}</ol></details>
    {!!data.terms?.length && <details className="chronology-source-library chronology-terminology"><summary>中文译名与异译对照</summary><p>{data.terminologyNote}</p><dl>{data.terms.map(term => <div key={term.id}><dt>{term.title}<small>{term.kind}</small></dt><dd>{!!term.aliases?.length && <p>旧译或其他写法：{term.aliases.join('、')}</p>}<p>{term.note}</p></dd></div>)}</dl></details>}
    <noscript><p>完整年表可直接阅读；筛选、剧透设置和复制链接功能需要启用浏览器脚本。</p></noscript>
  </section>;
}
