import type { Metadata } from 'next';
import { getAllPosts } from '../../lib/posts';
import { getGames } from '../../lib/games';
import { getChronologies } from '../../lib/chronologies';
import SiteSearchPanel from '../site-search-panel';
import '../site-search.css';

export const metadata: Metadata = { title: '站内搜索', description: '搜索公开文章、游戏档案与系列时间线。', alternates: { canonical: '/search/' }, robots: { index: false, follow: true } };

export default function SearchPage() {
  // Only this dedicated fallback page contains a no-JavaScript title directory.
  // Article bodies and the full search index are never root-layout client props.
  const directory = [
    ...getAllPosts().filter(post => post.visibility === 'public').map(post => ({ href: `/posts/${post.slug}/`, title: post.title })),
    ...getGames().map(game => ({ href: `/games/${game.slug}/`, title: game.title })),
    ...getChronologies().map(item => ({ href: `/chronicles/${item.id}/`, title: item.title })),
  ];
  return <main className="site-search-page container"><header><span className="section-kicker">SEARCH / PUBLIC CONTENT</span><h1>站内搜索</h1><p>在文章、游戏档案和系列时间线中寻找内容。游戏支持中文、原名与别名。</p></header>
    <SiteSearchPanel active fullPage />
    <noscript><section className="site-search-nojs"><h2>公开内容目录</h2><p>启用 JavaScript 后可按关键词筛选；也可以使用浏览器的页面查找浏览以下标题。</p><ul>{directory.map(item => <li key={item.href}><a href={item.href}>{item.title}</a></li>)}</ul></section></noscript>
  </main>;
}
