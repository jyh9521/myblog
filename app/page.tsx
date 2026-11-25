import Link from 'next/link';
import { getAllPosts, hasLocalAsset } from '../lib/posts';
import { buildHomeContent, homePostDate, updateSummary } from '../lib/home-content';
import { getGames } from '../lib/games';
import { getChronologies } from '../lib/chronologies';
import './home.css';

export default function Home() {
  const posts = getAllPosts();
  const { featured, updates, feed } = buildHomeContent(posts);
  const listed = [...(featured ? [featured] : []), ...updates, ...feed];
  const topics = [...new Set(listed.flatMap(post => post.tags))].slice(0, 6);
  const games = getGames();
  const relatedSlugs = new Set([featured, ...updates].flatMap(post => post?.gameSlug ? [post.gameSlug] : []));
  const gamePreview = [...games.filter(game => relatedSlugs.has(game.slug)), ...games.filter(game => !relatedSlugs.has(game.slug))].slice(0, 3);
  const timelines = getChronologies().slice(0, 2);
  return <main className="m3-home home-content container">
    <header className="home-intro">
      <div><h1>游戏、汉化与开发记录<span aria-hidden="true">.</span></h1><p>好奇心，一直在线。记录做过的项目，也分享沿途的发现。</p></div>
      <form className="home-search" action="/posts/" method="get" role="search">
        <label className="sr-only" htmlFor="home-query">搜索文章标题和正文</label>
        <input id="home-query" name="q" type="search" placeholder="搜索文章…" />
        <button type="submit">搜索 <span aria-hidden="true">↗</span></button>
      </form>
    </header>
    <section className={`home-lead-grid${featured ? '' : ' home-lead-empty'}`} aria-label="最新文章与近期更新">
      {featured && <Link className="m3-feature" href={`/posts/${featured.slug}/`}>
        <img data-motion-cover={featured.slug} src={featured.cover} alt="" width={960} height={516} loading="eager" />
        <div className="home-feature-copy">
          <div className="home-meta"><span>最新文章</span><time dateTime={featured.date}>{featured.date}</time><span>{featured.tags[0]}</span></div>
          <h2>{featured.title}</h2><p>{updateSummary({ ...featured, updatedAt: '', updateNote: '' })}</p>
          <div className="home-feature-action">阅读文章 <span aria-hidden="true">↗</span></div>
        </div>
      </Link>}
      {updates.length > 0 && <aside className="home-updates" aria-labelledby="home-updates-title">
        <div className="home-section-heading"><h2 id="home-updates-title">近期更新</h2><span>新文章与内容修订</span></div>
        <ol>{updates.map(post => <li key={post.slug}><Link className="home-update-link" href={`/posts/${post.slug}/`}>
          <div className="home-meta"><time dateTime={homePostDate(post)}>{homePostDate(post)}</time><span>{post.updatedAt && homePostDate(post) > post.date ? '更新' : '发布'}</span>{post.visibility === 'password' && <span>密码访问</span>}</div>
          <h3>{post.title}</h3><p>{updateSummary(post)}</p><span className="home-update-arrow" aria-hidden="true">↗</span>
        </Link></li>)}</ol>
      </aside>}
    </section>
    <section className="home-feed" id="latest" aria-labelledby="home-feed-title">
      <div className="home-feed-heading"><div><span className="section-kicker">继续阅读</span><h2 id="home-feed-title">更多内容</h2></div><Link className="home-all" href="/posts/">全部 {listed.length} 篇文章 <span aria-hidden="true">→</span></Link></div>
      <nav className="home-categories" aria-label="按主题浏览文章">{topics.map(tag => <Link key={tag} href={`/posts/?tag=${encodeURIComponent(tag)}`}>{tag}</Link>)}</nav>
      {feed.length > 0 ? <div className="post-grid">{feed.map((post, index) => <article key={post.slug} className="post-card">
        <Link className={`post-visual visual-${index % 3}`} href={`/posts/${post.slug}/`} aria-label={`阅读：${post.title}`}>
          {hasLocalAsset(post.cover) ? <img data-motion-cover={post.slug} src={post.cover} alt="" width={600} height={340} loading="lazy" /> : <span className="visual-mark" aria-hidden="true">✦</span>}
          <span className="visual-arrow" aria-hidden="true">↗</span>
        </Link>
        <div className="home-card-copy"><div className="post-meta"><time dateTime={homePostDate(post)}>{homePostDate(post)}</time>{post.visibility === 'password' ? <span>密码访问</span> : post.tags[0] && <span>{post.tags[0]}</span>}</div>
          <h3><Link href={`/posts/${post.slug}/`}>{post.title}</Link></h3><p>{updateSummary(post)}</p><Link className="read-more" href={`/posts/${post.slug}/`}>阅读全文 <span aria-hidden="true">→</span></Link>
        </div>
      </article>)}</div> : <p className="home-empty">{listed.length ? '更多文章整理中，先看看上面的内容吧。' : '文章即将发布。'}</p>}
    </section>
    <section className="home-explore" aria-label="游戏档案与系列时间线">
      <div className="home-explore-panel"><div className="home-section-heading"><h2>游戏档案</h2><Link href="/games/">浏览 {games.length} 款游戏 →</Link></div><p>从文章里的作品出发，查看平台、版本与游玩记录。</p>
        <ul>{gamePreview.map(game => <li key={game.slug}><Link className="home-preview-link" href={`/games/${game.slug}/`}>{game.metadata?.cover && <img src={game.metadata.cover} alt="" width={56} height={64} loading="lazy" />}<span>{game.title}</span><span aria-hidden="true">↗</span></Link></li>)}</ul>
      </div>
      <div className="home-explore-panel"><div className="home-section-heading"><h2>系列时间线</h2><Link href="/games/timelines/">查看全部 →</Link></div><p>按故事发生的顺序，重访一个系列的世界。</p>
        <ul>{timelines.map(timeline => <li key={timeline.id}><Link className="home-preview-link" href={`/chronicles/${timeline.id}/`}>{timeline.cover && <img src={timeline.cover.src} alt="" width={80} height={56} loading="lazy" />}<span>{timeline.title}<small>{timeline.works.length} 项作品与衍生载体</small></span><span aria-hidden="true">↗</span></Link></li>)}</ul>
      </div>
    </section>
  </main>;
}
