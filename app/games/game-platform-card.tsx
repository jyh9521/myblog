'use client';

import { gameStoreLabels, type GameManual, type GamePlatform } from '../../lib/game-types';

type Props = { gameTitle: string; status?: string; platform: GamePlatform; manual?: GameManual; compact?: boolean; projectCount?: number };

const availabilityLabels = { available: '可数字购买', delisted: '已下架', 'physical-only': '仅有实体版', free: '官方免费', unknown: '状态未知' } as const;
const safeExternalUrl = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };

export default function GamePlatformCard({ gameTitle, status = '', platform, manual, compact = false, projectCount = 0 }: Props) {
  const family = platform.store;
  const platformName = platform.platform || gameStoreLabels[family];
  const catalogUrl = /^\/games\/[a-z0-9-]+\/$/.test(platform.catalogUrl) ? platform.catalogUrl : '/games/';

  return <article className={`game-platform-card${compact ? ' is-compact' : ''}`}>
    <div className="game-platform-art">
      {platform.cover ? <img src={platform.cover} alt={`${gameTitle} 封面`} loading="lazy" /> : <span aria-hidden="true">🎮</span>}
    </div>
    <div className="game-platform-copy">
      {!compact && <div className="game-platform-heading"><strong>{gameTitle}</strong>{status && <span className="game-status-pill">{status}</span>}</div>}
      <p className="game-platform-specs">{[platformName, platform.releaseDate, platform.genres.slice(0, 2).join(' / ')].filter(Boolean).join(' · ') || gameStoreLabels[family]}</p>
      {!compact && (platform.developer || platform.publisher) && <p className="game-platform-credit" title={[platform.developer, platform.publisher].filter(Boolean).join(' · ')}>{[platform.developer, platform.publisher].filter(Boolean).join(' · ')}</p>}
      {!compact && platform.catalogSource && platform.catalogSource !== '手动资料' && <p className="game-platform-source">资料来源：{platform.catalogSource.split(' + ').map((source, index) => {
        const directLink = platform.catalogSourceLinks?.find(item => item.source.toLowerCase() === source.toLowerCase())?.url;
        const label = source.toLowerCase() === 'rawg' ? 'RAWG' : source.toLowerCase() === 'screenscraper' ? 'ScreenScraper' : source;
        return <span key={source}>{index > 0 && ' · '}{directLink ? <a href={directLink} target="_blank" rel="noopener noreferrer">{label}</a> : label}</span>;
      })}</p>}
      {!compact && manual && <>
        <p className="game-availability">正版获取状态：{availabilityLabels[manual.availabilityStatus]}</p>
        {manual.notes && <p className="game-platform-credit">{manual.notes}</p>}
        {manual.officialStores.some(store => safeExternalUrl(store.url)) && <section className="game-official-stores" aria-label="正版购买渠道">
          <strong>正版购买</strong>
          <div>{manual.officialStores.map((store, index) => {
            const href = safeExternalUrl(store.url);
            return href && store.name ? <a key={`${store.name}-${index}`} href={href} target="_blank" rel="noopener noreferrer" title={[store.region, store.note].filter(Boolean).join(' · ') || store.name}>{store.name}</a> : null;
          })}</div>
        </section>}
      </>}
      <div className="game-card-actions"><a className={`game-platform-link game-platform-link-${family}`} href={catalogUrl}>查看游戏档案 ↗</a>{projectCount > 0 && <a className="game-project-entry" href={`${catalogUrl}#projects`}>{projectCount === 1 ? 'GitHub 项目' : `相关项目 ${projectCount}`} ↗</a>}</div>
    </div>
  </article>;
}
