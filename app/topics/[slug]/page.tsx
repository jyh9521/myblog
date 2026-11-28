import { notFound } from 'next/navigation';
import { getTopics } from '../../../lib/topic-data';
import { articleText } from '../../../lib/article-search';
export function generateStaticParams() { return getTopics().map(topic => ({ slug: topic.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, topic = getTopics().find(topic => topic.slug === slug);
  return { title: topic?.title, description: topic?.description, alternates: { canonical: `/topics/${slug}/` } };
}
export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, topic = getTopics().find(topic => topic.slug === slug);
  if (!topic) notFound();
  const updates = [...topic.posts].sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date)).slice(0, 4);
  const projects = [...new Map(topic.gameRecords.flatMap(game => game.projects || []).map(project => [project.url, project])).values()];
  return <main className="article-shell"><div className="container topic-page"><nav aria-label="面包屑"><a href="/topics/">专题导读</a> / <span>{topic.title}</span></nav>
    <header><span className="section-kicker">精选阅读与资料</span><h1>{topic.title}</h1><p>{topic.description}</p></header>
    {topic.posts.length > 0 && <section><h2>推荐阅读顺序</h2><ol className="topic-reading">{topic.posts.map(post => <li key={post.slug}><a href={`/posts/${post.slug}/`}>{post.title}</a>{post.description && <p>{articleText(post.description)}</p>}</li>)}</ol></section>}
    {topic.gameRecords.length > 0 && <section><h2>游戏档案</h2><div className="topic-grid">{topic.gameRecords.map(game => <article className="topic-card" key={game.slug}><h3><a href={`/games/${game.slug}/`}>{game.title}</a></h3><p>{game.platforms.map(platform => platform.platform).join(' · ')}</p></article>)}</div></section>}
    {projects.length > 0 && <section><h2>关联项目与发布版</h2><ul className="topic-links">{projects.map(project => <li key={project.url}><a href={project.url} target="_blank" rel="noopener noreferrer">{project.name}</a>{project.description && <p>{project.description}</p>}{project.releaseUrl && <a href={project.releaseUrl} target="_blank" rel="noopener noreferrer">查看发布版</a>}</li>)}</ul></section>}
    {topic.timelines.length > 0 && <section><h2>系列年表</h2><p>含剧情与结局，请按游玩进度调整年表内的剧透设置。</p><ul className="topic-links">{topic.timelines.map(timeline => <li key={timeline.id}><a href={`/chronicles/${timeline.id}/`}>{timeline.title}</a></li>)}</ul></section>}
    {updates.length > 0 && <section><h2>最近更新</h2><ul className="topic-links">{updates.map(post => <li key={post.slug}><time dateTime={(post.updatedAt || post.date).slice(0, 10)}>{(post.updatedAt || post.date).slice(0, 10)}</time> · <a href={`/posts/${post.slug}/`}>{post.title}</a>{post.updateNote && <p>{post.updateNote}</p>}</li>)}</ul></section>}
  </div></main>;
}
