export function articleText(value: string) {
  return value.replace(/```[\s\S]*?```/g, ' ').replace(/\[(?:g|p|n|x|s)frame\][\s\S]*?\[\/(?:g|p|n|x|s)frame\]/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ').replace(/[#>*_~`|]/g, ' ').replace(/\s+/g, ' ').trim();
}
export const searchTerms = (query: string) => [...new Set(articleText(query).toLocaleLowerCase().split(' ').filter(Boolean))];
export function matchExcerpt(body: string, description: string, query: string, length = 160) {
  const terms = searchTerms(query), text = articleText(body), lower = text.toLocaleLowerCase();
  const matches = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const source = matches.length ? text : articleText(description || body);
  const start = matches.length ? Math.max(0, Math.min(...matches) - 45) : 0;
  return `${start ? '…' : ''}${source.slice(start, start + length)}${source.length > start + length ? '…' : ''}`;
}
export function highlightMatches(text: string, query: string): { text: string; match: boolean }[] {
  const terms = searchTerms(query), lower = text.toLocaleLowerCase(), ranges: [number, number][] = [];
  for (const term of terms) {
    let start = 0, index;
    while ((index = lower.indexOf(term, start)) >= 0) { ranges.push([index, index + term.length]); start = index + term.length; }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]); else merged.push([...range]);
  }
  const result = []; let cursor = 0;
  for (const [start, end] of merged) { if (cursor < start) result.push({ text: text.slice(cursor, start), match: false }); result.push({ text: text.slice(start, end), match: true }); cursor = end; }
  if (cursor < text.length) result.push({ text: text.slice(cursor), match: false });
  return result;
}
