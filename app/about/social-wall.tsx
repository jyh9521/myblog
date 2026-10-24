import { getSocialIcon, validateSocialLinks } from '../../lib/social-links.cjs';
import { externalLinkProps } from '../../lib/external-links';

type SocialLink = { platform: string; nickname: string; url: string; icon?: string };

export default function SocialWall({ links }: { links?: SocialLink[] }) {
  const errors = validateSocialLinks(links);
  if (errors.length) throw new Error(errors.join('\n'));
  if (!links?.length) return null;
  return <section className="social-wall" aria-labelledby="social-wall-title">
    <div className="section-title"><div><span className="section-kicker">ELSEWHERE</span><h2 id="social-wall-title">在其他地方找到我</h2><p>散落在互联网各处的据点。</p></div></div>
    <ul className="social-wall-grid">
      {links.map((link, index) => {
        const icon = getSocialIcon(link.icon || 'globe');
        return <li key={`${index}-${link.platform}`}><a className="social-link-card" href={link.url.trim()} {...externalLinkProps(link.url.trim())}>
          <span className="social-link-icon" aria-hidden="true">
            {icon ? <svg viewBox={`0 0 ${icon.width} ${icon.height}`} focusable="false">{icon.paths.map((d: string, i: number) => <path key={i} d={d} />)}</svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" focusable="false"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" /></svg>}
          </span>
          <span className="social-link-text"><span className="social-link-platform">{link.platform.trim()}</span><span className="social-link-nickname">{link.nickname.trim()}</span></span>
          <svg className="social-link-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 18 18 6M6 6h12v12" /></svg>
        </a></li>;
      })}
    </ul>
    <p className="social-icon-credit">图标：<a href="https://fontawesome.com" {...externalLinkProps('https://fontawesome.com')}>Font Awesome</a><span aria-hidden="true"> · </span><a href="/sveltia/brand-icons-LICENSE.txt">CC BY 4.0</a></p>
  </section>;
}
