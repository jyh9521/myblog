import { hasLocalAsset, type Post } from './posts';

export type HomeContent = {
  featured: Post | null;
  updates: Post[];
  feed: Post[];
};

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
}

/** Use recorded dates only; an invalid or stale update must not invent freshness. */
export function homePostDate(post: Post): string {
  const published = validDate(post.date);
  const updated = validDate(post.updatedAt);
  return updated > published ? updated : published;
}

/** Listing summaries come from authored metadata, never the article body. */
export function updateSummary(post: Post): string {
  if (post.visibility === 'password') return '这篇文章需要密码访问。';
  const plainText = (value: string) => value.replace(/^[ \t]*(?:>[ \t]*)+/gm, '').replace(/\s+/g, ' ').trim();
  return plainText(post.updateNote) || plainText(post.description) || '阅读全文，查看完整内容。';
}

/** Separate the newest covered article, three recent entries, and the remaining feed. */
export function buildHomeContent(posts: readonly Post[]): HomeContent {
  const seen = new Set<string>();
  const listed = posts
    .filter(post => post.visibility === 'public' || post.visibility === 'password')
    .sort((a, b) => homePostDate(b).localeCompare(homePostDate(a)) || a.slug.localeCompare(b.slug))
    .filter(post => {
      if (seen.has(post.slug)) return false;
      seen.add(post.slug);
      return true;
    });

  // Publication date chooses the lead article; maintenance dates only order the other groups.
  const featured = listed
    .filter(post => post.visibility === 'public' && validDate(post.date) && hasLocalAsset(post.cover))
    .sort((a, b) => validDate(b.date).localeCompare(validDate(a.date)) || a.slug.localeCompare(b.slug))[0] || null;
  const remaining = listed.filter(post => post.slug !== featured?.slug);
  return { featured, updates: remaining.slice(0, 3), feed: remaining.slice(3) };
}
