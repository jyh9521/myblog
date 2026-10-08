import type { PlayTime, CompletionTimes, PersonalRating } from './game-time';
export type GameStore = 'pc' | 'playstation' | 'xbox' | 'nintendo';
export type GameSource = 'rawg' | 'screenscraper' | 'igdb';
export type StoreLink = { name: string; url: string; region?: string; note?: string };
export type AvailabilityStatus = 'available' | 'delisted' | 'physical-only' | 'free' | 'unknown';
export type GameManual = { officialStores: StoreLink[]; availabilityStatus: AvailabilityStatus; notes: string };
export type GamePlatform = {
  store: GameStore;
  platform: string;
  catalogUrl: string;
  cover: string;
  description: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  genres: string[];
  catalogSource: string;
  catalogId: string;
  catalogSourceLinks?: { source: string; url: string }[];
};
export type GameMetadata = {
  id: string;
  title: string;
  localizedName: string;
  originalName: string;
  alternativeNames: string[];
  description: string;
  releaseDate: string;
  developers: string[];
  publishers: string[];
  platforms: string[];
  selectedPlatforms: string[];
  genres: string[];
  cover: string;
  screenshots: string[];
  website: string;
  sources: Partial<Record<GameSource, { id: string; systemId?: string; slug?: string; url?: string }>>;
  fieldSources: Record<string, string>;
  updatedAt: string;
};
export type GameEvent = { date: string; title: string; note: string };
export type GameProject = { url: string; name: string; type: string; description: string; releaseUrl: string };
export type GameRecord = { id: string; slug: string; title: string; status: string; summary: string; metadata: GameMetadata | null; manual: GameManual; platforms: GamePlatform[]; events: GameEvent[]; projects?: GameProject[]; playTime?: PlayTime | null; personalRating?: PersonalRating | null; completionTimes?: CompletionTimes | null };

export const gameStoreLabels: Record<GameStore, string> = {
  pc: 'PC', playstation: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo',
};

export const gamePlatforms: Record<GameStore, string[]> = {
  pc: ['PC', 'Windows', 'macOS', 'Linux'],
  playstation: ['PS5 Pro', 'PS5', 'PS4 Pro', 'PS4', 'PS3', 'PS Vita', 'PSP', 'PS2', 'PS1'],
  xbox: ['Xbox Series X|S', 'Xbox One X', 'Xbox One', 'Xbox 360', '初代 Xbox'],
  nintendo: ['Switch 2', 'Switch', '3DS', 'DS', 'Wii U', 'Wii', 'GameCube', 'Game Boy Advance', 'Game Boy'],
};
