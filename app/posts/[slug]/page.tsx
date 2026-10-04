import Link from 'next/link';
import { notFound } from 'next/navigation';
import PostContent from '../post-content';
import { extractHeadings, extractImages } from '../markdown-utils';
import { getAllPosts, getPost, hasLocalAsset } from '../../../lib/posts';
import { getGames } from '../../../lib/games';
import GiscusComments from '../../comments/giscus-comments';
import { withImageSize } from '../../../lib/article-image-size';

export function generateStaticParams() {
  return getAllPosts().map(post => ({ slug: post.slug }));
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const chronological = getAllPosts().sort((a, b) => b.date.localeCompare(a.date));
  const index = chronological.findIndex(item => item.slug === slug);
  const previous = chronological[index + 1];
  const next = index > 0 ? chronological[index - 1] : undefined;
  const related = chronological.filter(item => item.slug !== slug && item.tags.some(tag => post.tags.includes(tag)))
    .sort((a, b) => b.tags.filter(tag => post.tags.includes(tag)).length - a.tags.filter(tag => post.tags.includes(tag)).length || b.date.localeCompare(a.date))
    .slice(0, 3);
  const headings = extractHeadings(post.body);
  const images = extractImages(post.body).map(image => withImageSize(image));
  const games = getGames();
  return <main className="article-shell">
    <div className="container article">
      <Link className="back" href="/">← 返回文章列表</Link>
      <header className="article-header">
        <div className="post-meta"><time>{post.date.slice(0, 10)}</time>{post.updatedAt && <><span className="meta-line" /><span className="updated-at">更新于 {post.updatedAt.slice(0, 10)}</span></>}<span className="meta-line" />{post.tags.length ? post.tags.map(tag => <Link className="tag-link" key={tag} href={`/posts/?tag=${encodeURIComponent(tag)}`}>{tag}</Link>) : '博客'}</div>
        <h1>{post.title}</h1>
        {post.description && <p className="intro">{post.description}</p>}
        {post.updateNote && <p className="update-note">更新说明：{post.updateNote}</p>}
        {post.gameSlug && <Link className="game-reference" href={`/games/${post.gameSlug}/`}>🎮 查看游戏档案与时间线 ↗</Link>}
      </header>
      <PostContent body={post.body} title={post.title} headings={headings} images={images} games={games} cover={hasLocalAsset(post.cover) ? withImageSize({ src: post.cover, alt: post.title, caption: post.title, group: '封面' }) : undefined} audio={post.audio} video={post.video} attachment={post.attachment} />
      {(previous || next) && <nav className="post-neighbor-nav" aria-label="上一篇和下一篇">
        {previous ? <Link href={`/posts/${previous.slug}/`} className="neighbor-card neighbor-previous"><span>← 上一篇 · 更早</span><strong>{previous.title}</strong></Link> : <span />}
        {next ? <Link href={`/posts/${next.slug}/`} className="neighbor-card neighbor-next"><span>下一篇 · 更新 →</span><strong>{next.title}</strong></Link> : <span />}
      </nav>}
      {related.length > 0 && <section className="related-posts"><div className="section-title"><div><span className="section-kicker">KEEP READING</span><h2>相关文章</h2></div></div>
        <div className="related-grid">{related.map(item => <Link key={item.slug} className="related-card" href={`/posts/${item.slug}/`}><span>{item.tags.find(tag => post.tags.includes(tag)) || '文章'}</span><strong>{item.title}</strong><small>{item.date.slice(0, 10)} · 阅读文章 →</small></Link>)}</div>
      </section>}
      <GiscusComments />
      <Link className="article-end" href="/">← 查看更多文章</Link>
    </div>
  </main>;
}
