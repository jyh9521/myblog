'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { saveShelfPosition, restoreShelfPosition } from '../../lib/game-shelf-scroll';
import type { GameRecord } from '../../lib/game-types';
import { gameStoreLabels } from '../../lib/game-types';
import { gameStatuses, matchesGameStatus, normalizeGameStatuses, type GameStatus } from '../../lib/game-status';
import { readShelfState, writeShelfState, shelfDefaults, shelfKeys, shelfSorts, sortShelfGames, shelfPagination, shelfPageSize, type ShelfState } from '../../lib/game-shelf-state';

const shelfBadges: Record<GameStatus, { tone: string; mark: string }> = {
  '想玩': { tone: 'wishlist', mark: '☆' },
  '正在玩': { tone: 'playing', mark: '▶' },
  '已通关': { tone: 'complete', mark: '✓' },
  '暂时搁置': { tone: 'paused', mark: 'Ⅱ' },
  'AFK': { tone: 'afk', mark: '◷' },
  '考虑制作补丁': { tone: 'considering', mark: '◇' },
  '正在制作补丁': { tone: 'patching', mark: '◐' },
  '已制作补丁': { tone: 'patched', mark: '✦' },
};

export default function GameShelf({ games }: { games: GameRecord[] }) {
  const [filters, setFilters] = useState({ ...shelfDefaults });
  const [ready, setReady] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const paging = useRef(false);
  const { q: query, platform: platformFilter, status: statusFilter, year: yearFilter } = filters;
  const update = (key: keyof ShelfState, value: string) => setFilters(current => ({ ...current, [key]: value, page: key === 'page' ? value : '1' }));
  useLayoutEffect(() => {
    if (paging.current) {
      paging.current = false;
      filterRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [filters.page]);
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
  useLayoutEffect(() => {
    if (ready) return restoreShelfPosition();
  }, [ready]);
  const platformOptions = useMemo(() => [...new Set(games.flatMap(game => game.platforms.map(platform => `${gameStoreLabels[platform.store]} · ${platform.platform}`)))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [games]);
  const statusOptions = [...gameStatuses];
  const yearOf = (game: GameRecord) => (game.metadata?.releaseDate || game.platforms.find(platform => platform.releaseDate)?.releaseDate || '').slice(0, 4);
  const yearOptions = useMemo(() => [...new Set(games.map(yearOf).filter(year => /^\d{4}$/.test(year)))].sort((a, b) => b.localeCompare(a)), [games]);
  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sortShelfGames(games.filter(game => {
      const searchText = [game.title, game.metadata?.localizedName, game.metadata?.originalName, ...(game.metadata?.alternativeNames || [])].filter(Boolean).join(' ').toLocaleLowerCase();
      const platforms = game.platforms.map(platform => `${gameStoreLabels[platform.store]} · ${platform.platform}`);
      return (!normalizedQuery || searchText.includes(normalizedQuery))
        && (platformFilter === 'all' || platforms.includes(platformFilter))
        && matchesGameStatus(game.status, statusFilter)
        && (yearFilter === 'all' || yearOf(game) === yearFilter);
    }), filters.sort);
  }, [games, query, platformFilter, statusFilter, yearFilter, filters.sort]);
  const pagination = shelfPagination(filteredGames.length, filters.page);
  useEffect(() => {
    if (ready && filters.page !== String(pagination.page)) setFilters(current => ({ ...current, page: String(pagination.page) }));
  }, [ready, filters.page, pagination.page]);
  const changePage = (page: number) => { paging.current = true; update('page', String(page)); };
  const pageControls = (position: string) => pagination.pages > 1 && <nav className="game-pagination" aria-label={`游戏档案分页${position}`}>
    <button type="button" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)}>← 上一页</button>
    <label><span>第</span><select aria-label={`选择游戏档案页码${position}`} value={pagination.page} onChange={event => changePage(Number(event.target.value))}>{Array.from({ length: pagination.pages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select><span>/ {pagination.pages} 页</span></label>
    <button type="button" disabled={pagination.page === pagination.pages} onClick={() => changePage(pagination.page + 1)}>下一页 →</button>
  </nav>;

  if (!games.length) return <p className="empty-posts">还没有游戏档案，之后可在 Sveltia 后台添加。</p>;
  const select = (label: string, value: string, options: string[], onChange: (value: string) => void) => <label className="game-filter-field"><span>{label}</span><select data-filter={label} value={value} onChange={event => onChange(event.target.value)}><option value="all">全部</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
  const activeFilters = ([['platform', '平台', platformFilter], ['status', '游玩状态', statusFilter], ['year', '发售年份', yearFilter]] as const).filter(([, , value]) => value !== 'all');
  return <>
    <div ref={filterRef} className="game-filters" aria-label="筛选游戏档案">
      <label className="game-filter-field game-filter-search"><span>搜索游戏</span><input type="search" value={query} onChange={event => update('q', event.target.value)} placeholder="按游戏名称或别名搜索" /></label>
      <label className="game-filter-field"><span>排序</span><select value={filters.sort} onChange={event => update('sort', event.target.value)}>{Object.entries(shelfSorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="game-filter-reset" type="button" onClick={() => setFilters({ ...shelfDefaults })}>重置筛选与排序</button>
      <div className="m3-advanced-fields" role="group" aria-label="详细筛选">
      {select('平台', platformFilter, platformOptions, value => update('platform', value))}
      {select('游玩状态', statusFilter, statusOptions, value => update('status', value))}
      {select('发售年份', yearFilter, yearOptions, value => update('year', value))}
      </div>
      {activeFilters.length > 0 &&
        <div className="m3-active-filters" role="group" aria-label="已选筛选条件">
          {activeFilters.map(([key, label, value]) =>
            <button key={key} type="button" aria-label={`清除${label}筛选：${value}`} onClick={event => { event.currentTarget.closest('.game-filters')?.querySelector<HTMLSelectElement>(`select[data-filter="${label}"]`)?.focus(); update(key, 'all'); }}>{label}：{value}<span aria-hidden="true"> ×</span></button>)}
        </div>}
      <p className="game-filter-count" aria-live="polite">共 {filteredGames.length} / {games.length} 款 · 本页 {filteredGames.length ? pagination.start + 1 : 0}–{pagination.end} 款 · 每页 {shelfPageSize} 款</p>
    </div>
    {pageControls('顶部')}
    {filteredGames.length ? <div className="game-shelf">{filteredGames.slice(pagination.start, pagination.end).map(game => {
    const cover = game.platforms.find(platform => platform.cover)?.cover || game.metadata?.cover || '';
    const platformNames = [...new Set(game.platforms.map(platform => `${gameStoreLabels[platform.store]} · ${platform.platform}`))];
    const family = game.platforms[0]?.store || 'pc';
    return <article className="game-shelf-item" data-game-slug={game.slug} key={game.slug} onClickCapture={event => { if ((event.target as Element).closest('a')) saveShelfPosition(); }}>
      <div className="game-shelf-copy">
        <div className="m3-shelf-badges">{normalizeGameStatuses(game.status).map(status => { const badge = shelfBadges[status]; return <span key={status} className="m3-shelf-badge" data-tone={badge.tone}><span aria-hidden="true">{badge.mark}</span>{status}</span>; })}</div><div className="game-shelf-title"><Link href={`/games/${game.slug}/`}>{game.title}</Link></div>
        {game.summary && <p>{game.summary}</p>}
        {platformNames.length > 0 && <div className="game-shelf-platforms">{platformNames.map(label => <span key={label}>{label}</span>)}</div>}
        <div className="game-card-actions"><Link className={`game-platform-link game-platform-link-${family}`} href={`/games/${game.slug}/`}>查看游戏档案 ↗</Link>{!!game.projects?.length && <Link className="game-project-entry" href={`/games/${game.slug}/#projects`}>{game.projects.length === 1 ? 'GitHub 项目' : `相关项目 ${game.projects.length}`} ↗</Link>}</div>
      </div>
      <Link className="game-shelf-art" href={`/games/${game.slug}/`} aria-label={`查看${game.title}档案`}>
        {cover ? <img src={cover} alt={`${game.title} 封面`} loading="lazy" /> : <span aria-hidden="true">🎮</span>}
      </Link>
    </article>;
    })}</div> : <p className="empty-posts game-filter-empty">没有符合条件的游戏。试试清空搜索词或调整筛选条件。</p>}
    {pageControls('底部')}
  </>;
}
