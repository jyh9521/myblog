import type { GameRecord } from './game-types';

export const shelfDefaults = { q: '', platform: 'all', status: 'all', year: 'all', genre: 'all', sort: 'updated', page: '1' };
export const shelfPageSize = 15;
export function shelfPagination(total: number, requested: string) {
  const pages = Math.max(1, Math.ceil(total / shelfPageSize));
  const number = /^\d+$/.test(requested) ? Number(requested) : 1;
  const page = Number.isSafeInteger(number) ? Math.min(pages, Math.max(1, number)) : 1;
  const start = (page - 1) * shelfPageSize;
  return { page, pages, start, end: Math.min(total, start + shelfPageSize) };
}
export type ShelfState = typeof shelfDefaults;
export const shelfSorts = { updated: '资料最近更新', name: '名称 A–Z', 'release-new': '发售年份：新到旧', 'release-old': '发售年份：旧到新' };
export const shelfKeys = Object.keys(shelfDefaults) as (keyof ShelfState)[];
export function readShelfState(params: URLSearchParams): ShelfState {
  const state = { ...shelfDefaults };
  for (const key of shelfKeys) if (params.has(key)) state[key] = (params.get(key) || shelfDefaults[key]).slice(0, 160);
  if (!(state.sort in shelfSorts)) state.sort = shelfDefaults.sort;
  if (!/^[1-9]\d*$/.test(state.page) || !Number.isSafeInteger(Number(state.page))) state.page = '1';
  return state;
}
export function writeShelfState(state: ShelfState, params = new URLSearchParams()) {
  for (const key of shelfKeys) {
    if (state[key] === shelfDefaults[key]) params.delete(key);
    else params.set(key, state[key]);
  }
  return params;
}
export function sortShelfGames(games: GameRecord[], sort: string) {
  const date = (game: GameRecord) => game.metadata?.releaseDate || game.platforms.find(p => p.releaseDate)?.releaseDate || '';
  return [...games].sort((a, b) => {
    if (sort === 'name') return a.title.localeCompare(b.title, 'zh-CN');
    const av = sort === 'updated' ? a.updatedAt || a.metadata?.updatedAt || '' : date(a);
    const bv = sort === 'updated' ? b.updatedAt || b.metadata?.updatedAt || '' : date(b);
    if (!av || !bv) return av ? -1 : bv ? 1 : a.title.localeCompare(b.title, 'zh-CN');
    const difference = sort === 'updated' ? (Date.parse(bv) || 0) - (Date.parse(av) || 0) : sort === 'release-old' ? av.localeCompare(bv) : bv.localeCompare(av);
    return difference || a.title.localeCompare(b.title, 'zh-CN');
  });
}
