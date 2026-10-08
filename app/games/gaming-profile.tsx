'use client';

import { useEffect, useState } from 'react';
import { EXOPHASE_URL, EXOPHASE_USERNAME, loadGamingProfile, platformNames, type GamingProfileData, type RecentGame, type PlatformId } from '../../lib/gaming-profile';
import { gamingProfileMessages, type GamingProfileLocale } from '../../lib/gaming-profile-i18n';

function ControllerIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M7 6h10c2 0 3 2 3.5 5l1 6c.3 2-1.5 3-3 1.5L16 16H8l-2.5 2.5C4 20 2.2 19 2.5 17l1-6C4 8 5 6 7 6Z"/><path d="M7 9v6m-3-3h6m6-1h.01m3 3h.01" strokeLinecap="round"/></svg>;
}
function Cover({ game, fallback }: { game: RecentGame; fallback: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="gaming-cover">
    {game.cover && !failed ? <img src={game.cover} alt="" width={480} height={270} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <div className="gaming-cover-fallback"><ControllerIcon /><span>{fallback}</span></div>}
  </div>;
}
export function GamingProfileContent({ data, locale = 'zh-CN' }: { data: GamingProfileData; locale?: GamingProfileLocale }) {
  const t = gamingProfileMessages[locale], format = new Intl.NumberFormat(locale);
  const platformOrder: PlatformId[] = ['nintendo', 'psn', 'xbox', 'steam', 'gog'];
  const visiblePlatforms = platformOrder.flatMap(id => data.platforms.filter(platform => platform.id === id && platform.games > 0));
  const date = (value: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(new Date(value));
  const metrics = [
    { label: t.hours, value: data.stats.hours, suffix: t.hour },
    { label: t.games, value: data.stats.games },
    { label: t.achievements, value: data.stats.achievements },
    { label: t.completion, value: data.stats.completion, suffix: '%' },
  ];
  const stale = Date.now() - Date.parse(data.updatedAt) > 48 * 3600000;
  return <>
    <div className="gaming-identity"><span className="gaming-identity-icon"><ControllerIcon /></span><div><h3>{data.displayName}</h3><span>{data.username}</span></div></div>
    <dl className="gaming-metrics">{metrics.filter(metric => metric.value !== undefined).map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{format.format(metric.value!)}{metric.suffix && <small>{metric.suffix}</small>}</dd></div>)}</dl>
    {visiblePlatforms.length > 0 && <div className="gaming-platform-section"><h3>{t.platforms}</h3><ul className="gaming-platform-grid">{visiblePlatforms.map(platform => <li key={platform.id}>
      <span className="gaming-platform-name">{platform.id === 'xbox' ? 'XBOX' : platformNames[platform.id]}</span>
      <strong>{format.format(platform.games)}</strong><span className="gaming-platform-unit">{t.games}</span>
    </li>)}</ul></div>}
    <div className="gaming-recent-section"><h3>{t.recent}<small>Recently Played</small></h3>
      {data.recent.length === 0 ? <p className="gaming-status">{t.empty}</p> : <ul className="gaming-recent-grid">{data.recent.map(game => {
        const content = <><Cover game={game} fallback={t.cover} /><div className="gaming-game-copy"><span className="gaming-game-platform">{game.platform}</span><h4>{game.title}</h4><p>{t.lastPlayed} <time dateTime={game.lastPlayed}>{date(game.lastPlayed)}</time></p>
          {game.minutes !== undefined && <p>{format.format(Math.floor(game.minutes / 60))} {t.hour} {format.format(game.minutes % 60)} {t.minute}</p>}
          {game.total !== undefined && game.total > 0 && game.earned !== undefined && <div className="gaming-game-progress"><span>{t.achievements} {format.format(game.earned)} / {format.format(game.total)}</span>{game.completion !== undefined && <><progress max={100} value={game.completion} aria-label={t.completion} /><small>{format.format(game.completion)}%</small></>}</div>}
        </div></>;
        return <li key={game.id}>{game.url ? <a className="gaming-game-card" href={game.url} target="_blank" rel="noopener noreferrer">{content}</a> : <div className="gaming-game-card">{content}</div>}</li>;
      })}</ul>}
    </div>
    <p className="gaming-updated">{t.updated} <time dateTime={data.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(data.updatedAt))}</time>{stale && <span> · {t.stale}</span>}</p>
    {data.refresh && <p className="gaming-updated" role="status">{data.refresh.status === 'retained' && <span>{t.blocked} {data.refresh.reason} </span>}{t.checked} <time dateTime={data.refresh.checkedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(data.refresh.checkedAt))}</time></p>}
  </>;
}
export default function GamingProfile({ locale = 'zh-CN' }: { locale?: GamingProfileLocale }) {
  const [data, setData] = useState<GamingProfileData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const t = gamingProfileMessages[locale];
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    loadGamingProfile(controller.signal).then(profile => {
      if (mounted) { setData(profile); setStatus('ready'); }
    }).catch(() => { if (mounted) setStatus('error'); }).finally(() => clearTimeout(timeout));
    return () => { mounted = false; clearTimeout(timeout); controller.abort(); };
  }, []);
  return <section className="gaming-profile-card" aria-labelledby="gaming-profile-title" lang={locale}>
    <div className="section-title gaming-profile-heading"><div><span className="section-kicker">GAMING PROFILE</span><h2 id="gaming-profile-title">{t.title}</h2></div><a className="read-more" href={EXOPHASE_URL} target="_blank" rel="noopener noreferrer">{t.view} ↗</a></div>
    <div aria-live="polite" aria-busy={status === 'loading'}>{data ? <GamingProfileContent data={data} locale={locale} /> : <p className="gaming-status">{status === 'error' ? t.error : t.loading}</p>}</div>
    {status === 'error' && <p className="gaming-updated">{EXOPHASE_USERNAME}</p>}
  </section>;
}
