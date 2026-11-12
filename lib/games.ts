import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { execFileSync } from 'node:child_process';
import { normalizeGameStatus } from './game-status';
import { normalizeProjects } from './game-projects';
import { normalizePlayTime, normalizeCompletionTimes, normalizePersonalRating } from './game-time';
import gamePlatforms from '../public/sveltia/game-platforms.js';
import type { AvailabilityStatus, GameEvent, GameManual, GameMetadata, GamePlatform, GameRecord, GameStore, GameSummarySource, StoreLink } from './game-types';

const gamesDir = path.join(process.cwd(), 'content/games');
const stores = new Set<GameStore>(['pc', 'playstation', 'xbox', 'nintendo']);
let editDates: Map<string, string> | undefined;
function dossierEditDates() {
  if (editDates) return editDates;
  editDates = new Map();
  try {
    const log = execFileSync('git', ['log', '--format=DATE:%cI', '--name-only', '--', 'content/games'], { encoding: 'utf8' });
    let date = '';
    for (const line of log.split(/\r?\n/)) {
      if (line.startsWith('DATE:')) date = line.slice(5);
      else if (line.startsWith('content/games/') && !editDates.has(line)) editDates.set(line, date);
    }
  } catch { /* Exported source without Git falls back to metadata's timestamp. */ }
  return editDates;
}
const asText = (value: unknown) => String(value ?? '').trim();
const asList = (value: unknown): string[] => Array.isArray(value) ? value.map(asText).filter(Boolean) : asText(value) ? [asText(value)] : [];
const asDate = (value: unknown) => value instanceof Date
  ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
  : asText(value).slice(0, 10);

function normalizeMetadata(value: Record<string, any>): GameMetadata {
  const sources = value.sources && typeof value.sources === 'object' ? value.sources : {};
  return {
    id: asText(value.id), title: asText(value.title), localizedName: asText(value.localizedName || value.title),
    originalName: asText(value.originalName), alternativeNames: asList(value.alternativeNames), description: asText(value.description),
    releaseDate: asDate(value.releaseDate), developers: asList(value.developers || value.developer), publishers: asList(value.publishers || value.publisher),
    platforms: gamePlatforms.normalizePlatformList(value.platforms), selectedPlatforms: gamePlatforms.normalizePlatformList(value.selectedPlatforms),
    genres: asList(value.genres), cover: asText(value.cover), screenshots: asList(value.screenshots),
    website: asText(value.website), sources,
    fieldSources: value.fieldSources && typeof value.fieldSources === 'object' ? value.fieldSources : {}, updatedAt: asText(value.updatedAt),
  };
}

function normalizeManual(value: unknown): GameManual {
  const manual = value && typeof value === 'object' ? value as Record<string, any> : {};
  const officialStores = (Array.isArray(manual.officialStores) ? manual.officialStores : []).flatMap((item: any): StoreLink[] => {
    const name = asText(item?.name), url = asText(item?.url);
    try {
      const parsed = new URL(url);
      if (!name || !['http:', 'https:'].includes(parsed.protocol)) return [];
      return [{ name, url: parsed.href, region: asText(item.region) || undefined, note: asText(item.note) || undefined }];
    } catch { return []; }
  });
  const statuses: AvailabilityStatus[] = ['available', 'delisted', 'physical-only', 'free', 'unknown'];
  return {
    officialStores,
    availabilityStatus: statuses.includes(manual.availabilityStatus) ? manual.availabilityStatus : 'unknown',
    notes: asText(manual.notes),
  };
}

function parsePlatform(record: any, metadata: GameMetadata, slug: string): GamePlatform | null {
  const choice = record?.platformChoice || {};
  const selectedFamily = asText(choice.family).toLowerCase();
  const family = selectedFamily === 'steam' ? 'pc' : selectedFamily;
  const legacyStore = asText(record?.store).toLowerCase();
  const store = (family || (legacyStore === 'steam' ? 'pc' : legacyStore)) as GameStore;
  if (!stores.has(store)) return null;
  const overrides = { ...(record?.metadata || {}), ...record };
  const selectedPlatform = asText(choice.platform || record.platform);
  const platform = gamePlatforms.normalizePlatform(selectedPlatform);
  const theGamesDB = metadata.sources.thegamesdb;
  const versionMatches = (Array.isArray(theGamesDB?.versions) ? theGamesDB.versions : []).filter(version =>
    /^[1-9]\d{0,15}$/.test(asText(version?.id)) && gamePlatforms.normalizePlatform(version?.platform) === platform);
  const version = versionMatches.find(item => item.id === theGamesDB?.id) || versionMatches[0];
  const scoped = Object.entries(metadata.sources).find(([, details]) => details?.platformRelease &&
    gamePlatforms.normalizePlatform(details.platformRelease.platform) === platform &&
    /^\d{4}-\d{2}-\d{2}$/.test(asDate(details.platformRelease.releaseDate)) &&
    /^https:\/\//i.test(asText(details.platformRelease.evidence)));
  const scopedDate = !version ? scoped?.[1]?.platformRelease : undefined;
  const catalogDate = scopedDate?.releaseDate || (version && metadata.fieldSources.releaseDate !== 'manual' ? version.releaseDate : metadata.releaseDate);
  const scopedSelected = !version && !!scopedDate;
  const sourceEntries = Object.entries(metadata.sources || {}).filter(([source, details]) => {
    if (details?.platformRelease) return !!scopedDate && source === scoped?.[0];
    return !scopedSelected || source !== 'thegamesdb';
  });
  const catalogSourceLinks = sourceEntries.flatMap(([source, details]) => {
    if (!details?.id) return [];
    const url = source === 'thegamesdb' && version ? `https://thegamesdb.net/game.php?id=${encodeURIComponent(version.id)}` : details.url || (source === 'rawg'
      ? `https://rawg.io/games/${encodeURIComponent(details.id)}`
      : source === 'screenscraper' && details.systemId
        ? `https://www.screenscraper.fr/index.php?gameid=${encodeURIComponent(details.id)}&plateforme=${encodeURIComponent(details.systemId)}`
        : '');
    return url ? [{ source, url }] : [];
  });
  if (scopedDate) catalogSourceLinks.push({ source: 'officialRelease', url: scopedDate.evidence });
  const sourceNames = sourceEntries.map(([source]) => source);
  if (scopedDate) sourceNames.push('officialRelease');
  const catalogSource = sourceNames.join(' + ') || '手动资料';
  return {
    store, platform,
    catalogUrl: `/games/${encodeURIComponent(slug)}/`,
    cover: asText(overrides.cover || metadata.cover), description: asText(overrides.description || metadata.description),
    developer: asList(overrides.developers || overrides.developer || metadata.developers).join(', '),
    publisher: asList(overrides.publishers || overrides.publisher || metadata.publishers).join(', '),
    releaseDate: asDate(overrides.releaseDate || catalogDate),
    ...(scopedDate && !overrides.releaseDate ? { releaseRegion: scopedDate.region } : {}),
    genres: asList(overrides.genres || metadata.genres), catalogSource,
    catalogId: metadata.id || slug, catalogSourceLinks,
  };
}

const summarySourceHosts: Record<string, string> = {
  'store.steampowered.com': 'Steam',
  'store.playstation.com': 'PlayStation Store',
  'www.nintendo.com': 'Nintendo eShop',
  'rawg.io': 'RAWG',
  'thegamesdb.net': 'TheGamesDB',
  'www.screenscraper.fr': 'ScreenScraper',
};

export function readGameSummary(value: unknown, legacy: string): { summary: string; summarySource?: GameSummarySource } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { summary: typeof value === 'string' ? value.trim() || legacy : legacy };
  }
  const { text, source } = value as { text?: unknown; source?: { url?: unknown } };
  if (typeof text !== 'string' || !text.trim()) return { summary: legacy };
  const summary = text.trim();
  try {
    if (typeof source?.url === 'string') {
      const url = new URL(source.url);
      const label = Object.hasOwn(summarySourceHosts, url.hostname) ? summarySourceHosts[url.hostname] : '';
      if (label && url.protocol === 'https:' && !url.username && !url.password && !url.port) {
        return { summary, summarySource: { url: url.href, label } };
      }
    }
  } catch { /* Keep the editor's text even if a source URL is invalid. */ }
  return { summary };
}

export function getGames(): GameRecord[] {
  if (!fs.existsSync(gamesDir)) return [];
  return fs.readdirSync(gamesDir).filter(file => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)).flatMap(file => {
    const slug = file.slice(0, -3);
    const { data } = matter(fs.readFileSync(path.join(gamesDir, file), 'utf8'));
    const rawMetadata = data.gameMetadata && typeof data.gameMetadata === 'object' ? data.gameMetadata : {};
    const hasMetadata = Object.keys(rawMetadata).length > 0;
    const metadata = normalizeMetadata(rawMetadata);
    const manual = normalizeManual(data.manual);
    if (!data.title && !metadata.title) return [];
    const platformRecords = Array.isArray(data.platforms) ? data.platforms : [];
    const platforms = platformRecords.map(record => parsePlatform(record, metadata, slug)).filter((item): item is GamePlatform => Boolean(item))
      .filter((platform, index, entries) => entries.findIndex(item => item.store === platform.store && item.platform === platform.platform) === index);
    // Explicit platform-card records are the source of truth. Otherwise only
    // materialize platforms the editor selected, never every provider platform.
    const selectedPlatforms = platformRecords.length ? [] : metadata.selectedPlatforms;
    for (const name of selectedPlatforms) {
      if (platforms.some(platform => platform.platform.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
      const normalized = name.toLowerCase();
      const family: GameStore = (gamePlatforms.platformFamily(name) || (/playstation|ps[1-5]|psp|vita/.test(normalized) ? 'playstation' : /xbox/.test(normalized) ? 'xbox' : /nintendo|switch|wii|game ?boy|3ds|ds/.test(normalized) ? 'nintendo' : 'pc')) as GameStore;
      platforms.push(parsePlatform({ platformChoice: { family, platform: name } }, metadata, slug)!);
    }
    const events = Array.isArray(data.events) ? data.events.filter((event: any) => event?.title).map((event: any) => ({
      date: asDate(event.date), title: asText(event.title), note: asText(event.note),
    })) : [];
    return [{
      id: slug, slug,
      updatedAt: dossierEditDates().get(`content/games/${file}`) || metadata.updatedAt,
      title: asText(data.title || metadata.localizedName || metadata.title), status: normalizeGameStatus(data.status),
      ...readGameSummary(data.summary, metadata.description), metadata: hasMetadata ? metadata : null, manual, platforms, events, projects: normalizeProjects(data.projects),
      playTime: normalizePlayTime(data.playTime), completionTimes: normalizeCompletionTimes(data.hltb),
      personalRating: normalizePersonalRating(data.personalRating),
    }];
  }).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

export function getGame(slug: string) { return getGames().find(game => game.slug === slug) || null; }
