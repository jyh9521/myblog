import type { Chronology } from './chronology-types';
import { articleText, matchExcerpt } from './article-search';
export type EventEntry = { id: string; title: string; series: string; body: string; href: string };
export type EventIndex = { version: 1; entries: EventEntry[] };
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase();
export function buildEventIndex(chronologies: Chronology[]): EventIndex {
  return { version: 1, entries: chronologies.flatMap(data => data.events.map(event => ({
    id: `${data.id}:${event.id}`, title: event.title, series: data.title,
    body: articleText([event.year, event.summary, event.detail, event.note, ...(event.keywords || []), ...event.works.map(id => data.works.find(work => work.id === id)?.title)].filter(Boolean).join(' ')),
    href: `/chronicles/${data.id}/#chronology-${data.id}-event-${encodeURIComponent(event.id)}`,
  }))) };
}
export function isEventIndex(value: unknown): value is EventIndex {
  const index = value as EventIndex;
  return !!index && index.version === 1 && Array.isArray(index.entries) && index.entries.length <= 20000 && index.entries.every(entry => {
    if (!entry || !['id', 'title', 'series', 'body', 'href'].every(key => typeof entry[key as keyof EventEntry] === 'string')) return false;
    const parts = entry.id.split(':');
    return parts.length === 2 && parts.every(id => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) && entry.href === `/chronicles/${parts[0]}/#chronology-${parts[0]}-event-${parts[1]}`;
  });
}
export function searchEvents(index: EventIndex, query: string) {
  const q = normalized(query.slice(0, 160)).trim(), terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return index.entries.filter(entry => terms.every(term => normalized(`${entry.title} ${entry.series} ${entry.body}`).includes(term)))
    .sort((a, b) => Number(normalized(b.title).includes(q)) - Number(normalized(a.title).includes(q)) || a.id.localeCompare(b.id))
    .map(entry => ({ ...entry, excerpt: matchExcerpt(entry.body, entry.series, query) }));
}
