import type { Metadata } from 'next';
import { getTopics } from '../../lib/topic-data';
export const metadata: Metadata = { title: '专题导读', description: '按主题串起文章、游戏档案、汉化项目与系列年表。', alternates: { canonical: '/topics/' } };
export default function Topics() {
  return <main className="article-shell"><div className="container topic-page"><header><span className="section-kicker">从这里开始阅读</span><h1>专题导读</h1><p>把分散的记录串起来，按主题找到下一篇值得读的内容。</p></header>
    <div className="topic-grid">{getTopics().map(topic => <article className="topic-card" key={topic.slug}><h2><a href={`/topics/${topic.slug}/`}>{topic.title}</a></h2><p>{topic.description}</p><small>{topic.posts.length} 篇导读 · {topic.gameRecords.length} 个游戏 · {topic.timelines.length} 部年表</small>{topic.updated && <p className="topic-date">内容最近更新：<time dateTime={topic.updated.slice(0, 10)}>{topic.updated.slice(0, 10)}</time></p>}</article>)}</div>
  </div></main>;
}
