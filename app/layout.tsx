import type { Metadata } from 'next';
import BackToTop from './back-to-top';
import ExternalLinks from './external-links';
import { FooterEasterEgg, ThemeToggle } from './site-enhancements';
import VisitorCounter from './visitor-counter';
import './style.css';

export const metadata: Metadata = {
  title: { default: "伯翎飞云的博客", template: "%s | 伯翎飞云的博客" },
  description: '个人博客', metadataBase: new URL('https://blog.blfy.cc'),
  alternates: { types: { 'application/rss+xml': '/feed.xml' } }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>
    <ExternalLinks />
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/" aria-label="伯翎飞云的博客首页"><img className="brand-icon" src="/avatar.jpg" alt="" /><span>伯翎飞云<span className="brand-dot">.</span></span></a>
      <nav aria-label="主导航"><a href="/">首页</a><a href="/posts/">文章</a><a href="/games/">游戏档案</a><a href="/about/">关于我</a><a href="/ns/" aria-label="NS群群号发布页"><span className="nav-label-full">NS群群号发布页</span><span className="nav-label-short" aria-hidden="true">NS群号</span></a><ThemeToggle /></nav>
    </div></header>
    {children}
    <BackToTop />
    <footer className="site-footer"><div className="footer-inner"><div><a className="footer-brand" href="/">伯翎飞云<span>.</span></a><p>关于游戏、技术和生活的个人记录。</p></div><a className="footer-admin" href="/sveltia/">管理</a></div><div className="footer-bottom">© 伯翎飞云 · <FooterEasterEgg /> · <VisitorCounter /></div></footer>
  </body></html>;
}
