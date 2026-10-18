export type ChronologyWork = { id: string; title: string };
export type ChronologyEra = { id: string; title: string; calendar: string; note?: string };
export type ChronologySource = { id: string; title: string; url: string };
export type ChronologyEvent = {
  id: string; era: string; year: string; yearOrder: number; day?: string; order: number;
  title: string; summary: string; detail?: string; note?: string; keywords?: string[];
  works: string[]; spoilerWorks: string[]; sources: string[]; related?: string[];
  evidence: 'compiled' | 'game' | 'manual' | 'inferred' | 'disputed';
};
export type Chronology = {
  id: string; title: string; description: string; calendarNote: string;
  works: ChronologyWork[]; eras: ChronologyEra[]; sources: ChronologySource[]; events: ChronologyEvent[];
};
