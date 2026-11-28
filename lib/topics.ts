import type { Post } from './posts';
import type { GameRecord } from './game-types';
import type { Chronology } from './chronology-types';
export type Topic = { slug: string; title: string; description: string; readingOrder: string[]; games: string[]; chronologies: string[] };
export function resolveTopics(topics: Topic[], data: { posts: Post[]; games: GameRecord[]; chronologies: Chronology[] }) {
  const seen = new Set<string>();
  if (!Array.isArray(topics)) throw Error('Topics must be an array');
  return topics.map(topic => {
    if (!topic || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.slug) || !topic.title?.trim() || !topic.description?.trim()) throw Error('Invalid topic');
    if (seen.has(topic.slug)) throw Error(`duplicate topic: ${topic.slug}`); seen.add(topic.slug);
    function refs<T>(ids: string[], records: T[], key: (record: T) => string, label: string): T[] {
      ids = ids ?? [];
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw Error(`${topic.slug}: duplicate or invalid ${label}`);
      return ids.map(id => { const record = records.find(record => key(record) === id); if (!record) throw Error(`${topic.slug}: missing/public ${label} ${id}`); return record; });
    }
    const posts = refs(topic.readingOrder, data.posts.filter(post => post.visibility === 'public'), post => post.slug, 'article');
    const games = refs(topic.games, data.games, game => game.slug, 'game');
    const chronologies = refs(topic.chronologies, data.chronologies, chronology => chronology.id, 'chronology');
    const updated = [...posts.flatMap(post => [post.date, post.updatedAt]), ...games.map(game => game.updatedAt || game.metadata?.updatedAt || '')].filter(Boolean).sort().at(-1) || '';
    return { ...topic, posts, gameRecords: games, timelines: chronologies, updated };
  });
}
