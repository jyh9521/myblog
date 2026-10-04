import type { Plugin } from 'unified';

export type HeadingItem = { id: string; text: string; level: number };
export type ArticleImage = { src: string; alt: string; caption: string; group?: string; width?: number; height?: number };

function plainHeading(value: string) {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1')
    .replace(/[*_~]/g, '').replace(/<[^>]*>/g, '').trim();
}

function makeSlug(value: string) {
  return plainHeading(value).toLowerCase().replace(/[^\p{L}\p{N}\p{M}-]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function uniqueSlug(value: string, seen: Map<string, number>) {
  const base = makeSlug(value);
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

export function extractHeadings(markdown: string): HeadingItem[] {
  const seen = new Map<string, number>();
  const headings: HeadingItem[] = [];
  let fence = '';
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1].slice(0, 3);
      else if (fenceMatch[1].startsWith(fence)) fence = '';
      continue;
    }
    if (fence) continue;
    const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    const setext = !match && line.trim() ? lines[index + 1]?.match(/^\s*(=+|-+)\s*$/) : null;
    if (!match && !setext) continue;
    const text = plainHeading(match ? match[2] : line.trim());
    const level = match ? match[1].length : setext?.[1].startsWith('=') ? 1 : 2;
    headings.push({ id: uniqueSlug(text, seen), text, level });
  }
  return headings;
}

export function extractImages(markdown: string): ArticleImage[] {
  const images: ArticleImage[] = [];
  const pattern = /!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)/g;
  let group = '未分类';
  let fence = '';
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) { if (!fence) fence = fenceMatch[1].slice(0, 3); else if (fenceMatch[1].startsWith(fence)) fence = ''; continue; }
    if (fence) continue;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) group = plainHeading(heading[1]);
    for (const match of line.matchAll(pattern)) images.push({ src: match[2], alt: match[1], caption: match[3] || match[1] || '文章配图', group });
  }
  return images;
}

function nodeText(node: any): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || '';
  return Array.isArray(node.children) ? node.children.map(nodeText).join('') : '';
}

// Keep heading IDs identical to extractHeadings while traversing the parsed Markdown AST.
export const remarkHeadingIds: Plugin = () => (tree: any) => {
  const seen = new Map<string, number>();
  const visit = (node: any) => {
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) {
      if (child.type === 'heading') {
        child.data ||= {};
        child.data.hProperties ||= {};
        child.data.hProperties.id = uniqueSlug(nodeText(child), seen);
      }
      visit(child);
    }
  };
  visit(tree);
};
