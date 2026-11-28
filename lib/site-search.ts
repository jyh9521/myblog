import { articleText, matchExcerpt } from './article-search';
import type { Post } from './posts';
import type { GameRecord } from './game-types';
import type { Chronology } from './chronology-types';

export type SiteSearchKind = 'post' | 'game' | 'chronology';
export type SiteSearchEntry = {
  id: string; kind: SiteSearchKind; title: string; href: string;
  description: string; aliases: string[]; keywords: string[]; body: string;
};
export type SiteSearchIndex = { version: 1; entries: SiteSearchEntry[] };
export type SiteSearchResult = SiteSearchEntry & { excerpt: string };
const kinds: SiteSearchKind[] = ['post', 'game', 'chronology'];
export const siteSearchLabels: Record<SiteSearchKind, string> = { post: '文章', game: '游戏档案', chronology: '系列时间线' };
const paths: Record<SiteSearchKind, string> = { post: 'posts', game: 'games', chronology: 'chronicles' };
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const text = (value: string) => articleText(value || '');
const names = (values: (string | undefined)[]) => [...new Set(values.map(value => text(value || '')).filter(Boolean))];

/** An explicit allowlist: never serialize whole content records into the public index. */
export function buildSiteSearchIndex({ posts, games, chronologies }: {
  posts: Post[]; games: GameRecord[]; chronologies: Chronology[];
}): SiteSearchIndex {
  const entries: SiteSearchEntry[] = [], seen = new Set<string>();
  function add(kind: SiteSearchKind, slug: string, data: Omit<SiteSearchEntry, 'id' | 'kind' | 'href'>) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
    const id = `${kind}:${slug}`;
    if (seen.has(id)) return;
    seen.add(id); entries.push({ id, kind, href: `/${paths[kind]}/${slug}/`, ...data });
  }
  for (const post of posts) {
    if (post.visibility !== 'public') continue;
    const game = games.find(game => game.slug === post.gameSlug), metadata = game?.metadata;
    add('post', post.slug, { title: text(post.title), description: text(post.description), aliases: names([game?.title, metadata?.title, metadata?.localizedName, metadata?.originalName, ...(metadata?.alternativeNames || [])]), keywords: names(post.tags), body: text(post.body) });
  }
  for (const game of games) {
    const metadata = game.metadata;
    const platforms = names(game.platforms.map(item => item.platform));
    add('game', game.slug, {
      title: text(game.title), description: platforms.join(' · '),
      aliases: names([metadata?.title, metadata?.localizedName, metadata?.originalName, ...(metadata?.alternativeNames || [])]),
      keywords: names([...platforms, ...(metadata?.genres || []), ...(metadata?.developers || [])]), body: '',
    });
  }
  for (const chronology of chronologies) {
    const works = names(chronology.works.flatMap(work => [work.title, work.originalTitle]));
    // Titles only: even an event title, work synopsis or calendar note may reveal a spoiler.
    add('chronology', chronology.id, { title: text(chronology.title), description: `作品：${names(chronology.works.map(work => work.title)).join(' · ')}`, aliases: works, keywords: [], body: '' });
  }
  return { version: 1, entries };
}

export const cleanSiteQuery = (query: string) => query.slice(0, 160);
export function siteSearchHref(query: string) {
  const q = cleanSiteQuery(query).trim();
  return q ? `/search/?${new URLSearchParams({ q })}` : '/search/';
}

export function searchSiteIndex(index: SiteSearchIndex, query: string, perGroup = 6) {
  const q = normalize(cleanSiteQuery(query)), terms = [...new Set(q.split(' ').filter(Boolean))].slice(0, 12);
  const limit = Math.max(1, Math.min(20, Number.isFinite(perGroup) ? Math.floor(perGroup) : 6));
  const groups = kinds.map(kind => ({ kind, label: siteSearchLabels[kind], total: 0, results: [] as SiteSearchResult[] }));
  if (!terms.length) return { groups, total: 0, shown: 0 };
  for (const group of groups) {
    const matches = index.entries.filter(entry => entry.kind === group.kind).flatMap(entry => {
      const title = normalize(entry.title), aliases = entry.aliases.map(normalize);
      const description = normalize(entry.description), keywords = normalize(entry.keywords.join(' ')), body = normalize(entry.body);
      const all = [title, ...aliases, description, keywords, body].join(' ');
      if (!terms.every(term => all.includes(term))) return [];
      const exact = title === q ? 1000 : aliases.includes(q) ? 900 : 0;
      const score = exact + terms.reduce((sum, term) => sum + (title.startsWith(term) ? 100 : title.includes(term) ? 80 : aliases.some(alias => alias.includes(term)) ? 70 : keywords.includes(term) ? 40 : description.includes(term) ? 20 : 1), 0);
      return [{ entry, score }];
    }).sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
    group.total = matches.length;
    group.results = matches.slice(0, limit).map(({ entry }) => ({ ...entry, excerpt: entry.kind === 'post' ? matchExcerpt(entry.body, entry.description, q) : entry.description }));
  }
  return { groups, total: groups.reduce((sum, group) => sum + group.total, 0), shown: groups.reduce((sum, group) => sum + group.results.length, 0) };
}

/** Runtime validation keeps a corrupt or incompatible static download retryable. */
export function isSiteSearchIndex(value: unknown): value is SiteSearchIndex {
  if (!value || typeof value !== 'object') return false;
  const index = value as SiteSearchIndex;
  return index.version === 1 && Array.isArray(index.entries) && index.entries.length <= 10000 && index.entries.every(entry => {
    if (!entry || !kinds.includes(entry.kind) || typeof entry.id !== 'string') return false;
    const prefix = `${entry.kind}:`, slug = entry.id.slice(prefix.length);
    return entry.id.startsWith(prefix) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      && entry.href === `/${paths[entry.kind]}/${slug}/`
      && ['title', 'description', 'body'].every(key => typeof entry[key as 'title'] === 'string')
      && [entry.aliases, entry.keywords].every(list => Array.isArray(list) && list.every(item => typeof item === 'string'));
  });
}

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing' | 'defaultPrevented'>;
type ShortcutTarget = { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null;
export function isSiteSearchShortcut(event: ShortcutEvent, target: ShortcutTarget, dialogOpen: boolean) {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey
    && !event.repeat && !event.isComposing && !event.defaultPrevented && !dialogOpen
    && !/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') && !target?.isContentEditable
    && !target?.closest?.('[contenteditable="true"], [role="textbox"], [role="combobox"]');
}
