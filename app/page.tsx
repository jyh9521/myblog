import Link from 'next/link';
import { getAllPosts, hasLocalAsset } from '../lib/posts';
import { DailyPick } from './site-enhancements';
import Achievements from './achievements';

export default function Home() {
  const posts = getAllPosts();
  const dated = [...posts].sort((a, b) => a.date.localeCompare(b.date));
  return <main>
    <section className="hero-shell">
      <div className="hero container">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> 伯翎飞云 · 游戏 / 技术 / 日常</span>
          <h1>好奇心，<br />一直在线<span className="hero-stop">。</span></h1>
          <p>记录玩过的游戏、做过的项目，还有生活中值得分享的发现。</p>
          <Link className="hero-button" href="#latest">浏览文章 <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-tile tile-one">PLAY</div>
          <div className="hero-tile tile-two">CREATE</div>
          <div className="hero-spark spark-one">✦</div>
          <div className="hero-spark spark-two">✳</div>
        </div>
      </div>
    </section>
    <section className="container latest" id="latest">
      {!!dated.length && <DailyPick items={dated.map(post => ({ href: `/posts/${post.slug}/`, title: post.title }))} />}
      <div className="section-title">
        <div><span className="section-kicker">DISCOVER</span><h2>最新文章</h2></div>
        <span className="article-count">共 {posts.length} 篇</span>
      </div>
      {posts.length ? <div className="post-grid">{posts.map((post, index) =>
        <article key={post.slug} className="post-card">
          <Link className={`post-visual visual-${index % 3}`} href={`/posts/${post.slug}/`} aria-label={`阅读：${post.title}`}>
            {hasLocalAsset(post.cover) ? <img src={post.cover} alt="" /> : <span className="visual-mark" aria-hidden="true">{index % 2 ? '✦' : '●'}</span>}
            <span className="visual-arrow" aria-hidden="true">↗</span>
          </Link>
          <div className="post-meta">{post.pinned && <span className="pinned-badge">置顶</span>}{post.visibility === 'password' && <span className="locked-post-badge">🔒 密码访问</span>}<time>{post.date.slice(0, 10)}</time><span className="meta-line" />{post.tags?.[0] ? <Link className="tag-link" href={`/posts/?tag=${encodeURIComponent(post.tags[0])}`}>{post.tags[0]}</Link> : '博客'}</div>
          <h3><Link href={`/posts/${post.slug}/`}>{post.title}</Link></h3>
          {post.description && <p>{post.description}</p>}
          <Link className="read-more" href={`/posts/${post.slug}/`}>阅读全文 <span aria-hidden="true">→</span></Link>
        </article>
      )}</div> : <p className="empty-posts">文章即将发布。</p>}
    </section>
    <Achievements />
  </main>;
}
