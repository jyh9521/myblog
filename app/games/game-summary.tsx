import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { externalLinkProps } from '../../lib/external-links';

export default function GameSummary({ summary }: { summary: string }) {
  if (!summary.trim()) return null;
  return <div className="body game-summary"><ReactMarkdown
    remarkPlugins={[remarkGfm, remarkBreaks]}
    components={{ a: ({ href, children, title }) => <a href={href} title={title} {...externalLinkProps(href)}>{children}</a>, img: ({ src, alt, title }) => <img src={src} alt={alt || ''} title={title} loading="lazy" /> }}
  >{summary}</ReactMarkdown></div>;
}
