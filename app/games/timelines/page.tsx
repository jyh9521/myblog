import type { Metadata } from 'next';
import { getChronologies } from '../../../lib/chronologies';
import GameSectionNav from '../game-section-nav';

export const metadata: Metadata = { title: '游戏时间线 · 游戏档案', description: '按故事年代阅读游戏系列的主要剧情、结局与版本分线。', alternates: { canonical: '/games/timelines/' } };
export default function GameTimelinesPage() {
  const timelines = getChronologies();
  return <main className="article-shell"><div className="container game-directory game-timelines">
    <nav className="game-breadcrumb" aria-label="面包屑"><a href="/games/">游戏档案</a><span aria-hidden="true">/</span><span aria-current="page">游戏时间线</span></nav>
    <header className="timeline-directory-title"><span className="section-kicker">游戏档案 · 系列历史</span><h1>游戏时间线</h1><p>沿着故事发生的顺序，重访一个系列的世界。</p><p className="timeline-directory-note">主线、外传与重制分别整理，主要剧情和结局一并收录；进入后可按作品筛选，并隐藏尚未游玩的剧情。</p></header>
    <GameSectionNav active="timelines" />
    <section className="timeline-directory-grid" aria-label="系列时间线">{timelines.map((data, index) => <article key={data.id} className={'timeline-directory-card timeline-series-' + data.id}>
      <a className="timeline-card-link" href={'/chronicles/' + data.id + '/'}>{data.cover && <div className="timeline-card-art"><img src={data.cover.src} alt={data.cover.alt} width={data.cover.width} height={data.cover.height} loading={index ? 'lazy' : 'eager'} /><span className="timeline-card-badge">系列年表</span></div>}
        <div className="timeline-card-body"><h2>{data.title}</h2><p>{data.excerpt || data.description}</p><div className="timeline-card-stats"><span>{data.works.length} 项作品与衍生载体</span><span>{data.events.length} 条事件</span></div><span className="timeline-card-action">阅读系列时间线 <span aria-hidden="true">↗</span></span></div>
      </a>{data.cover?.credit && <p className="timeline-card-credit">{data.cover.sourceUrl ? <a href={data.cover.sourceUrl} target="_blank" rel="noopener noreferrer">{data.cover.credit} · 封面出处 ↗</a> : data.cover.credit}</p>}
    </article>)}</section>
    <aside className="timeline-directory-footnote"><h2>先选作品，再看年代</h2><p>这里整理的是游戏世界中的历史，不是发售顺序或个人通关记录。平行世界、重制补写与时间旅行保留各自分线；未确定的年代会明确标注。</p></aside>
  </div></main>;
}
