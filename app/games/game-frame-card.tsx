'use client';

import GamePlatformCard from './game-platform-card';
import type { GameMetadata, GamePlatform, GameRecord, GameStore } from '../../lib/game-types';

const families: Record<string, GameStore> = { p: 'playstation', n: 'nintendo', x: 'xbox', s: 'pc' };
const matches: Record<GameStore, RegExp> = {
  pc: /windows|pc|mac|linux|computer|dos|pc-98|x68000|fm towns/i,
  playstation: /playstation|ps[1-5]|vita|psp/i,
  xbox: /xbox/i,
  nintendo: /nintendo|switch|wii|3ds|game boy|ds/i,
};

export default function GameFrameCard({ frame, game, title = '', status = '' }: { frame: string; game?: GameRecord; title?: string; status?: string }) {
  const family = frame === 'g' ? game?.platforms[0]?.store || 'pc' : families[frame] || 'pc';
  if (!game) return <span className="game-frame-placeholder is-error"><span className="game-frame-placeholder-copy"><strong>本地游戏档案未找到</strong><small>请在 CMS 游戏档案中保存资料，并在文章卡片中引用档案 slug。</small></span><a className={`game-frame-cta game-platform-link-${family}`} href="/games/">查看游戏档案 ↗</a></span>;

  const metadata = game.metadata as GameMetadata | null;
  const platform = game.platforms.find(item => item.store === family) || {
    store: family, platform: frame === 'g' ? '未选择平台' : metadata?.platforms.find(name => matches[family].test(name)) || metadata?.platforms[0] || family,
    catalogUrl: `/games/${game.slug}/`, cover: metadata?.cover || '', description: metadata?.description || '',
    developer: metadata?.developers.join(', ') || '', publisher: metadata?.publishers.join(', ') || '',
    releaseDate: metadata?.releaseDate || '', genres: metadata?.genres || [],
    catalogSource: Object.keys(metadata?.sources || {}).join(' + ') || '手动资料', catalogId: metadata?.id || game.slug,
    catalogSourceLinks: Object.entries(metadata?.sources || {}).flatMap(([source, details]) => {
      if (!details?.id) return [];
      const url = details.url || (source === 'rawg'
        ? `https://rawg.io/games/${encodeURIComponent(details.id)}`
        : source === 'screenscraper' && details.systemId
          ? `https://www.screenscraper.fr/index.php?gameid=${encodeURIComponent(details.id)}&plateforme=${encodeURIComponent(details.systemId)}`
          : '');
      return url ? [{ source, url }] : [];
    }),
  } satisfies GamePlatform;
  return <GamePlatformCard gameTitle={game.title} status={status || game.status} platform={platform} manual={game.manual} projectCount={game.projects?.length || 0} />;
}
