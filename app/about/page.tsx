import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import GitHubContributionCalendar from './github-calendar';
import GiscusComments from '../comments/giscus-comments';
import { externalLinkProps } from '../../lib/external-links';

export const metadata = { title: '关于我' };

export default function About() {
  const source = fs.readFileSync(path.join(process.cwd(), 'content/about.md'), 'utf8');
  const { data, content } = matter(source);
  return <main className="article-shell">
    <div className="container article">
      <div className="about-card">
        <img className="about-avatar" src="/avatar.jpg" alt="伯翎飞云的头像" />
        <div><span className="section-kicker">ABOUT ME</span><h1>{String(data.title || '关于我')}</h1><p>{String(data.intro || '')}</p></div>
      </div>
      <div className="article-content"><div className="body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children, title }) => <a href={href} title={title} {...externalLinkProps(href)}>{children}</a> }}>{content}</ReactMarkdown></div></div>
      <GitHubContributionCalendar />
      <GiscusComments />
    </div>
  </main>;
}
