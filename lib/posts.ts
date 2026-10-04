import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const postsDir = path.join(process.cwd(), 'content/posts');
const formatDate = (value: unknown) => value instanceof Date
  ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
  : String(value || '').slice(0, 10);

export function hasLocalAsset(url: string): boolean {
  if (/^https?:\/\//.test(url)) return true;
  if (!url || !url.startsWith('/') || url.startsWith('//')) return false;
  const relative = url.slice(1);
  if (relative.split('/').includes('..')) return false;
  return fs.existsSync(path.join(process.cwd(), 'public', relative));
}

export type Post = {
  slug: string;
  title: string;
  date: string;
  updatedAt: string;
  updateNote: string;
  gameSlug: string;
  description: string;
  cover: string;
  tags: string[];
  pinned: boolean;
  body: string;
  audio: string;
  video: string;
  attachment: string;
};

export function getPost(slug: string): Post | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const file = path.join(postsDir, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, 'utf8'));
  const date = formatDate(data.date);
  const updatedAt = formatDate(data.updatedAt);
  return {
    slug,
    title: String(data.title || slug),
    date,
    updatedAt,
    updateNote: String(data.updateNote || ''),
    gameSlug: String(data.gameSlug || ''),
    description: String(data.description || ''),
    cover: String(data.cover || ''),
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean).map(String) : [],
    pinned: data.pinned === true,
    body: content,
    audio: String(data.audio || ''),
    video: String(data.video || ''),
    attachment: String(data.attachment || ''),
  };
}

export function getAllPosts(): Post[] {
  if (!fs.existsSync(postsDir)) return [];
  return fs.readdirSync(postsDir)
    .filter(name => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(name))
    .flatMap(name => {
      const post = getPost(name.slice(0, -3));
      return post ? [post] : [];
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));
}
