export const EXOPHASE_USERNAME = 'jyh9521';
export const EXOPHASE_URL = `https://www.exophase.com/user/${EXOPHASE_USERNAME}/`;
export const platformNames = {
  psn: 'PlayStation', xbox: 'Xbox', steam: 'Steam', nintendo: 'Nintendo',
  epic: 'Epic Games', gog: 'GOG', uplay: 'Ubisoft', origin: 'EA',
  blizzard: 'Blizzard', retro: 'RetroAchievements',
} as const;
export type PlatformId = keyof typeof platformNames;
export interface RecentGame {
  id: string; title: string; platform: string; lastPlayed: string;
  cover?: string; url?: string; minutes?: number;
  earned?: number; total?: number; completion?: number;
}
export interface GamingProfileData {
  refresh?: { status: 'updated' | 'unchanged' | 'retained'; checkedAt: string; reason: string };
  version: 1; username: string; displayName: string; updatedAt: string;
  stats: { hours?: number; games?: number; achievements?: number; completion?: number };
  platforms: { id: PlatformId; games: number }[];
  recent: RecentGame[];
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return;
  if (value === '') return;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : undefined;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function httpsUrl(value: unknown, exophaseOnly = false): string | undefined {
  try {
    const url = new URL(text(value));
    if (url.protocol !== 'https:' || url.username || url.password) return;
    if (exophaseOnly && url.hostname !== 'www.exophase.com') return;
    return url.href;
  } catch { return; }
}
function isoTime(value: unknown): string | undefined {
  const seconds = number(value);
  if (!seconds) return;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
// Decode only a JSON-escaped string literal; never execute upstream JavaScript.
export function embeddedJson(html: string, name: 'currentPlayerSummary' | 'playerGames'): unknown {
  const match = html.match(new RegExp(`window\\.${name}\\s*=\\s*'([^']*)'`));
  if (!match) throw new Error(`Missing public ${name} data`);
  return JSON.parse(JSON.parse(`"${match[1]}"`));
}
export function resolvePlayerId(html: string): string {
  const match = html.match(/window\.playerProfileId\s*=\s*['"]?(\d+)['"]?\s*;/);
  if (!match) throw new Error('Public profile did not provide a player ID');
  return match[1];
}
export function normalizeProfile(summary: unknown, gamesPayload: unknown, updatedAt: string): GamingProfileData {
  const source = record(summary), payload = record(gamesPayload);
  if (!Array.isArray(source.services) || !Array.isArray(payload.games) || !text(source.displayname)) {
    throw new Error('Unexpected public profile format');
  }
  const counts = new Map<PlatformId, number>();
  for (const entry of source.services) {
    const service = record(entry), id = text(service.environment_slug || service.env);
    const count = number(service.gamesplayed);
    if (Object.hasOwn(platformNames, id) && count !== undefined && count > 0) {
      counts.set(id as PlatformId, (counts.get(id as PlatformId) || 0) + count);
    }
  }
  const recent: RecentGame[] = [];
  for (const entry of payload.games) {
    const game = record(entry), meta = record(game.meta), supports = record(meta.supports);
    const lastPlayed = isoTime(game.lastplayed_utc ?? game.lastplayed);
    if (game.privacy !== 'game-visible' || !lastPlayed || !text(meta.title)) continue;
    const id = `${text(meta.environment_slug)}-${number(game.master_id)}`;
    const platforms = Array.isArray(meta.platforms) ? meta.platforms.map(p => text(record(p).name)).filter(Boolean) : [];
    const units = record(game.playtimeUnits), hours = number(units.hours), minutes = number(units.minutes);
    const total = number(game.total_awards), earned = number(game.earned_awards);
    recent.push({
      id, title: text(meta.title), platform: platforms.join(' / ') || text(meta.environment_name), lastPlayed,
      cover: httpsUrl(meta.featured_image) || httpsUrl(game.resource_standard),
      url: httpsUrl(meta.endpoint_overview, true),
      ...(supports.playtime === 1 && hours !== undefined && minutes !== undefined ? { minutes: hours * 60 + minutes } : {}),
      ...(supports.awards === 1 && total !== undefined && total > 0 && earned !== undefined ? {
        earned, total, completion: number(game.percent) !== undefined && number(game.percent)! <= 100 ? number(game.percent) : undefined,
      } : {}),
    });
  }
  recent.sort((a, b) => Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed));
  const unique = recent.filter((game, index) => recent.findIndex(g => g.id === game.id) === index).slice(0, 6);
  const completion = number(source.progress);
  return {
    version: 1, username: EXOPHASE_USERNAME, displayName: text(source.displayname), updatedAt,
    stats: { hours: number(source.playtime), games: number(source.gamesplayed), achievements: number(source.total_awards),
      completion: completion !== undefined && completion <= 100 ? completion : undefined },
    platforms: (Object.keys(platformNames) as PlatformId[]).filter(id => counts.has(id)).map(id => ({ id, games: counts.get(id)! })),
    recent: unique,
  };
}
// Validate the compact cache before it reaches React. Invalid caches fail locally.
export function parseGamingProfile(value: unknown): GamingProfileData {
  const data = record(value), stats = record(data.stats);
  if (data.version !== 1 || data.username !== EXOPHASE_USERNAME || !text(data.displayName) ||
    !Number.isFinite(Date.parse(text(data.updatedAt))) || !Array.isArray(data.platforms) || !Array.isArray(data.recent)) {
    throw new Error('Invalid gaming profile cache');
  }
  const platforms: GamingProfileData['platforms'] = data.platforms.map(entry => {
    const p = record(entry), id = text(p.id), games = number(p.games);
    if (!Object.hasOwn(platformNames, id) || games === undefined || games <= 0 || !Number.isInteger(games)) throw new Error('Invalid platform');
    return { id: id as PlatformId, games };
  });
  const recent = data.recent.slice(0, 6).map(entry => {
    const g = record(entry);
    if (!text(g.id) || !text(g.title) || !text(g.platform) || !Number.isFinite(Date.parse(text(g.lastPlayed)))) throw new Error('Invalid game');
    return { id: text(g.id), title: text(g.title), platform: text(g.platform), lastPlayed: text(g.lastPlayed),
      cover: httpsUrl(g.cover), url: httpsUrl(g.url, true), minutes: number(g.minutes),
      earned: number(g.earned), total: number(g.total), completion: number(g.completion) !== undefined && number(g.completion)! <= 100 ? number(g.completion) : undefined };
  });
  const completion = number(stats.completion);
  return { version: 1, username: EXOPHASE_USERNAME, displayName: text(data.displayName), updatedAt: text(data.updatedAt),
    stats: { hours: number(stats.hours), games: number(stats.games), achievements: number(stats.achievements),
      completion: completion !== undefined && completion <= 100 ? completion : undefined }, platforms, recent };
}
export async function loadGamingProfile(signal: AbortSignal): Promise<GamingProfileData> {
  const response = await fetch('/data/exophase.json', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Gaming profile HTTP ${response.status}`);
  const value: unknown = await response.json();
  const profile = parseGamingProfile(value);
  try {
    const statusResponse = await fetch('/data/exophase-status.json', { signal, cache: 'no-store' });
    if (statusResponse.ok) {
      const status = record(await statusResponse.json());
      if (['updated', 'unchanged', 'retained'].includes(text(status.status)) && Number.isFinite(Date.parse(text(status.checkedAt)))) {
        profile.refresh = { status: status.status as 'updated' | 'unchanged' | 'retained', checkedAt: text(status.checkedAt), reason: text(status.reason) };
      }
    }
  } catch { /* The validated snapshot stays useful if refresh diagnostics fail. */ }
  return profile;
}
