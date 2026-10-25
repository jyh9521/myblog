import type { Chronology, ChronologyEvent, ChronologyImage } from './chronology-types';

export function readableImage(image: ChronologyImage | undefined, allowed: string[], works: string[]): image is ChronologyImage {
  return !!image && image.spoilerWorks.every(work => allowed.includes(work)) &&
    (!works.length || image.works.some(work => works.includes(work)));
}

export function readableEvents(data: Chronology, allowed: string[]): ChronologyEvent[] {
  // A reading aid, not access control: the underlying timeline is public data.
  // Gate before search/group/link so locked titles cannot leak through the UI.
  return data.events.filter(event => event.spoilerWorks.every(work => allowed.includes(work)));
}
export function filterChronology(data: Chronology, allowed: string[], works: string[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return readableEvents(data, allowed).filter(event => (!works.length || event.works.some(work => works.includes(work))) &&
    terms.every(term => [event.title, event.summary, event.detail, event.note, event.year, event.day, ...event.works.map(id=>data.works.find(work=>work.id===id)?.title), ...(event.keywords || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)))
    .sort((a, b) => data.eras.findIndex(era => era.id === a.era) - data.eras.findIndex(era => era.id === b.era) || a.yearOrder - b.yearOrder || a.order - b.order);
}
