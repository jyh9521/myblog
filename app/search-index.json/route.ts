import { getAllPosts } from '../../lib/posts';
import { getGames } from '../../lib/games';
import { getChronologies } from '../../lib/chronologies';
import { buildSiteSearchIndex } from '../../lib/site-search';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildSiteSearchIndex({ posts: getAllPosts(), games: getGames(), chronologies: getChronologies() }));
}
