'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { GameRecord } from '../../lib/game-types';
import { gameStoreLabels } from '../../lib/game-types';
import { gameStatuses, matchesGameStatus } from '../../lib/game-status';
import { readShelfState, writeShelfState, shelfDefaults, shelfKeys, shelfSorts, sortShelfGames, type ShelfState } from '../../lib/game-shelf-state';

export default function GameShelf({ games }: { games: GameRecord[] }) {
  const [filters, setFilters] = useState({ ...shelfDefaults });
  const [ready, setReady] = useState(false);
  const { q: query, platform: platformFilter, status: statusFilter, year: yearFilter, genre: genreFilter } = filters;
  const update = (key: keyof ShelfState, value: string) => setFilters(current => ({ ...current, [key]: value }));
  useEffect(() => {
    const restore = () => {
      let params = new URLSearchParams(location.search);
      if (!shelfKeys.some(key => params.has(key))) {
        try { params = new URLSearchParams(sessionStorage.getItem('game-shelf-filters') || ''); } catch { /* Storage is optional. */ }
      }
      setFilters(readShelfState(params)); setReady(true);
    };
    restore(); addEventListener('popstate', restore);
    return () => removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const url = new URL(location.href);
    writeShelfState(filters, url.searchParams);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    try { sessionStorage.setItem('game-shelf-filters', writeShelfState(filters).toString()); } catch { /* Storage is optional. */ }
  }, [filters, ready]);
  const platformOptions = useMemo(() => [...new Set(games.flatMap(game => game.platforms.map(platform => `${gameStoreLabels[platform.store]} · ${platform.platform}`)))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [games]);
  const statusOptions = [...gameStatuses];
  const yearOf = (game: GameRecord) => (game.metadata?.releaseDate || game.platforms.find(platform => platform.releaseDate)?.releaseDate || '').slice(0, 4);
  const yearOptions = useMemo(() => [...new Set(games.map(yearOf).filter(year => /^\d{4}$/.test(year)))].sort((a, b) => b.localeCompare(a)), [games]);
  const genresOf = (game: GameRecord) => [...new Set([...(game.metadata?.genres || []), ...game.platforms.flatMap(platform => platform.genres || [])])];
  const genreOptions = useMemo(() => [...new Set(games.flatMap(genresOf))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [games]);
  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sortShelfGames(games.filter(game => {
      const searchText = [game.title, game.metadata?.localizedName, game.metadata?.originalName, ...(game.metadata?.alternativeNames || [])].filter(Boolean).join(' ').toLocaleLowerCase();
      const platforms = game.platforms.map(platform => `${gameStoreLabels[platform.store]} · ${platform.platform}`);
      return (!normalizedQuery || searchText.includes(normalizedQuery))
        && (platformFilter === 'all' || platforms.includes(platformFilter))
        && matchesGameStatus(game.status, statusFilter)
        && (yearFilter === 'all' || yearOf(game) === yearFilter)
        && (genreFilter === 'all' || genresOf(game).includes(genreFilter));
    }), filters.sort);
  }, [games, query, platformFilter, statusFilter, yearFilter, genreFilter, filters.sort]);

  if (!games.length) return <p className="empty-posts">还没有游戏档案，之后可在 Sveltia 后台添加。</p>;
  const select = (label: string, value: string, options: string[], onChange: (value: string) => void) => <label className="game-filter-field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}><option value="all">全部</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
  return <>
    <div className="game-filters" aria-label="筛选游戏档案">
      <label className="game-filter-field game-filter-search"><span>搜索游戏</span><input type="search" value={query} onChange={event => update('q', event.target.value)} placeholder="按游戏名称或别名搜索" /></label>
      {select('平台', platformFilter, platformOptions, value => update('platform', value))}
      {select('游玩状态', statusFilter, statusOptions, value => update('status', value))}
      {select('发售年份', yearFilter, yearOptions, value => update('year', value))}
      {select('类型', genreFilter, genreOptions, value => update('genre', value))}
      <label className="game-filter-field"><span>排序</span><select value={filters.sort} onChange={event => update('sort', event.target.value)}>{Object.entries(shelfSorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="game-filter-reset" type="button" onClick={() => setFilters({ ...shelfDefaults })}>重置筛选与排序</button>
      <p className="game-filter-count" aria-live="polite">显示 {filteredGames.length} / {games.length} 款</p>
    </div>
    {filteredGames.length ? <div className="game-shelf">{filteredGames.map(game => {
    const cover = game.platforms.find(platform => platform.cover)?.cover || game.metadata?.cover || '';
    const platformNames = [...new Set(game.platforms.map(platform => `${gameStoreLabels[platform.store]} · ${platform.platform}`))];
    const family = game.platforms[0]?.store || 'pc';
    return <article className="game-shelf-item" key={game.slug}>
      <div className="game-shelf-copy">
        <div className="game-shelf-title"><Link href={`/games/${game.slug}/`}>{game.title} ↗</Link><span>{game.status}</span></div>
        {game.summary && <p>{game.summary}</p>}
        {platformNames.length > 0 && <div className="game-shelf-platforms">{platformNames.map(label => <span key={label}>{label}</span>)}</div>}
        <div className="game-card-actions"><Link className={`game-platform-link game-platform-link-${family}`} href={`/games/${game.slug}/`}>查看游戏档案 ↗</Link>{!!game.projects?.length && <Link className="game-project-entry" href={`/games/${game.slug}/#projects`}>{game.projects.length === 1 ? 'GitHub 项目' : `相关项目 ${game.projects.length}`} ↗</Link>}</div>
      </div>
      <Link className="game-shelf-art" href={`/games/${game.slug}/`} aria-label={`查看${game.title}档案`}>
        {cover ? <img src={cover} alt={`${game.title} 封面`} loading="lazy" /> : <span aria-hidden="true">🎮</span>}
      </Link>
    </article>;
    })}</div> : <p className="empty-posts game-filter-empty">没有符合条件的游戏。试试清空搜索词或调整筛选条件。</p>}
  </>;
}
