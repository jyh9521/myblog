import fs from 'node:fs';
import path from 'node:path';
import { getAllPosts } from './posts';
import { getGames } from './games';
import { getChronologies } from './chronologies';
import { resolveTopics } from './topics';
export function getTopics() {
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content/topics.json'), 'utf8'));
  return resolveTopics(data.topics, { posts: getAllPosts(), games: getGames(), chronologies: getChronologies() });
}
