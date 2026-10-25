export type ChronologyWork = { id: string; title: string; continuity?: string; synopsis?: string; coverageNote?: string; sources?: string[]; originalTitle?: string };
export type ChronologyImage = {
  src: string; alt: string; caption?: string; credit?: string; sourceUrl?: string;
  width: number; height: number; works: string[]; spoilerWorks: string[];
};
export type ChronologyEra = { id: string; title: string; calendar: string; note?: string; works?: string[]; image?: ChronologyImage };
export type ChronologySource = { id: string; title: string; url: string; kind?: string; scope?: string; family?: string; originalTitle?: string };
export type ChronologyCitation = { source: string; locator: string; supports: 'event' | 'date' | 'context' | 'variant'; note?: string; originalLocator?: string; originalNote?: string; medium?: 'game-capture' | 'game-transcript' | 'manual-scan' | 'firsthand-guide' | 'official-publication' | 'creator-interview' | 'secondary' };
export type ChronologyTerm = { id: string; title: string; kind: string; note: string; aliases?: string[] };
export type ChronologyEvent = {
  id: string; era: string; year: string; yearOrder: number; day?: string; order: number;
  title: string; summary: string; detail?: string; note?: string; keywords?: string[];
  works: string[]; spoilerWorks: string[]; sources: string[]; related?: string[];
  evidence: 'compiled' | 'game' | 'manual' | 'inferred' | 'disputed';
  citations?: ChronologyCitation[];
  verification?: 'crosschecked' | 'single-source' | 'conflict' | 'corrected';
  dateStatus?: 'crosschecked' | 'single-source' | 'conflict' | 'undated';
  sourceLines?: number[];
  images?: ChronologyImage[];
};
export type Chronology = {
  id: string; title: string; description: string; calendarNote: string;
  works: ChronologyWork[]; eras: ChronologyEra[]; sources: ChronologySource[]; events: ChronologyEvent[];
  terminologyNote?: string; terms?: ChronologyTerm[];
  excerpt?: string; cover?: ChronologyImage;
};
