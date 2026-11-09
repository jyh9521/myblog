import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { GameMetadataProvider } from './game-providers.js';
import { boundedText } from './bounded-body.js';
import { cachedMetadata } from './metadata-cache.js';

const DAY = 86400000;
const MAX_RESPONSE = 2 * 1024 * 1024;
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const externalId = value => /^[1-9]\d{0,15}$/.test(String(value ?? '')) ? String(value) : '';
const asArray = value => Array.isArray(value) ? value : [];
const names = values => [...new Set(values.map(value => text(value)).filter(Boolean))];

export class ArchiveProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

async function upstreamJson(fetcher, url, provider, headers = {}) {
  try {
    // Workerd only accepts follow/manual. Treat 3xx as an error here so keys
    // never travel to a redirected host.
    const response = await fetcher(url, { headers: { Accept: 'application/json', ...headers }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!response.ok || Number(response.headers.get('Content-Length')) > MAX_RESPONSE) {
      await response.body?.cancel();
      if (response.status === 429) throw new ArchiveProviderError(`${provider} 请求额度或频率受限，请稍后重试。`, 429);
      if (response.status === 401 || response.status === 403) throw new ArchiveProviderError(`${provider} 拒绝了请求，请检查 Worker 密钥及 API 额度。`);
      throw new Error('unexpected response');
    }
    return JSON.parse(await boundedText(response, MAX_RESPONSE));
  } catch (error) {
    if (error instanceof ArchiveProviderError) throw error;
    // Fetch/JSON errors can contain a URL with the provider's secret query parameter.
    throw new ArchiveProviderError(`${provider} 暂未返回有效资料，请稍后重试。`);
  }
}

function isoDate(value) {
  const date = text(value);
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) return '';
  const time = Date.parse(date);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? date : '';
}

const TG_FIELDS = 'overview,genres,publishers,alternates';
const dictionaries = { developers: 'Developers', publishers: 'Publishers', genres: 'Genres', platforms: 'Platforms' };
const dictionaryName = (collection, id) => text(collection?.[externalId(id)]);
function dictionaryMap(collection) {
  if (!collection || typeof collection !== 'object') throw new ArchiveProviderError('TheGamesDB 名称目录暂不可用。');
  return Object.fromEntries(Object.values(collection).flatMap(item => {
    const id = externalId(item?.id), name = text(item?.name);
    return id && name ? [[id, name]] : [];
  }));
}

export class TheGamesDBProvider extends GameMetadataProvider {
  constructor(env, fetcher = fetch) { super(); this.env = env; this.fetcher = fetcher; }

  async request(endpoint, params = {}) {
    const key = this.env.THEGAMESDB_API_KEY;
    if (!key) throw new ArchiveProviderError('TheGamesDB 密钥尚未配置。', 503);
    const url = new URL(`https://api.thegamesdb.net/v1/${endpoint}`);
    url.search = new URLSearchParams({ ...params, apikey: key });
    const data = await upstreamJson(this.fetcher, url, 'TheGamesDB');
    if (data?.code !== 200 || !data.data) throw new ArchiveProviderError('TheGamesDB 暂未返回有效资料，请稍后重试。');
    return data;
  }

  async normalizeResponse(payload, games) {
    const platformNames = payload.include?.platform ?? {};
    const lookup = {};
    const warnings = [];
    const fields = Object.keys(dictionaries).filter(field => field === 'platforms'
      ? games.some(game => externalId(game.platform) && !text(platformNames[game.platform]?.name))
      : games.some(game => asArray(game[field]).length));
    await Promise.all(fields.map(async field => {
      try {
        const outcome = await cachedMetadata(this.env, `thegamesdb:names:v1:${field}`, 30 * DAY, async () => {
          const response = await this.request(dictionaries[field]);
          return dictionaryMap(response.data[field]);
        });
        lookup[field] = outcome.value;
      } catch { warnings.push(dictionaries[field]); }
    }));
    return games.map(game => {
      const id = externalId(game.id), title = text(game.game_title);
      const platform = text(platformNames[game.platform]?.name) || dictionaryName(lookup.platforms, game.platform);
      const mapNames = field => names(asArray(game[field]).map(value => typeof value === 'string' && !externalId(value)
        ? value : text(value?.name) || dictionaryName(lookup[field], value)));
      const result = {
        id: `thegamesdb:${id}`, title, originalName: title,
        alternativeNames: names(asArray(game.alternates).map(value => typeof value === 'string' ? value : value?.name)),
        description: text(game.overview, 12000), releaseDate: isoDate(game.release_date),
        developers: mapNames('developers'), publishers: mapNames('publishers'), genres: mapNames('genres'),
        platforms: gamePlatforms.normalizePlatformList([platform]),
        sources: { thegamesdb: { id, url: `https://thegamesdb.net/game.php?id=${id}` } },
        updatedAt: new Date().toISOString(),
      };
      result.fieldSources = Object.fromEntries(Object.entries(result).filter(([key, value]) =>
        !['id', 'sources', 'updatedAt'].includes(key) && (Array.isArray(value) ? value.length > 0 : Boolean(value)))
        .map(([key]) => [key, 'thegamesdb']));
      if (warnings.length) result.warnings = ['TheGamesDB 的部分名称暂不可用，已有字段会保留。'];
      return result;
    });
  }

  async search(query) {
    const payload = await this.request('Games/ByGameName', { name: query, fields: 'genres,publishers,alternates', include: 'platform' });
    if (!Array.isArray(payload.data.games)) throw new ArchiveProviderError('TheGamesDB 搜索结果格式异常。');
    const games = payload.data.games.filter(game => externalId(game?.id) && text(game?.game_title)).slice(0, 20);
    return this.normalizeResponse(payload, games);
  }

  async getById(id) {
    if (!externalId(id)) throw new ArchiveProviderError('TheGamesDB 游戏编号无效。', 400);
    const payload = await this.request('Games/ByGameID', { id, fields: TG_FIELDS, include: 'platform' });
    const game = asArray(payload.data.games).find(game => externalId(game?.id) === String(id) && text(game?.game_title));
    if (!game) throw new ArchiveProviderError('TheGamesDB 没有找到该游戏。', 404);
    return (await this.normalizeResponse(payload, [game]))[0];
  }
}

function steamGridImage(value) {
  try {
    const url = new URL(text(value, 2048));
    return url.protocol === 'https:' && /^cdn\d*\.steamgriddb\.com$/.test(url.hostname)
      && !url.port && !url.username && !url.password && !url.search && !url.hash ? url.href : '';
  } catch { return ''; }
}

const GRID_LIMIT = 18;
export const MAX_GRID_PAGE = 49;
export class SteamGridDBProvider {
  constructor(env, fetcher = fetch) { this.env = env; this.fetcher = fetcher; }

  async request(path, params) {
    const key = this.env.STEAMGRIDDB_API_KEY;
    if (!key) throw new ArchiveProviderError('SteamGridDB 密钥尚未配置。', 503);
    const url = new URL(`https://www.steamgriddb.com/api/v2/${path}`);
    if (params) url.search = new URLSearchParams(params);
    const data = await upstreamJson(this.fetcher, url, 'SteamGridDB', { Authorization: `Bearer ${key}` });
    if (data?.success !== true || !Array.isArray(data.data)) throw new ArchiveProviderError('SteamGridDB 暂未返回有效资料，请稍后重试。');
    return data;
  }

  async search(query) {
    // A path segment consisting only of dots would be interpreted as navigation.
    if (/^\.{1,2}$/.test(query)) return [];
    const payload = await this.request(`search/autocomplete/${encodeURIComponent(query)}`);
    return payload.data.slice(0, 20).flatMap(game => {
      const id = externalId(game?.id), title = text(game?.name);
      if (!id || !title) return [];
      const seconds = game.release_date;
      const year = Number.isFinite(seconds) && seconds !== 0 ? new Date(seconds * 1000).getUTCFullYear() : NaN;
      return [{ id, title, year: year >= 1900 && year <= 9999 ? year : null }];
    });
  }

  async grids(id, page) {
    if (!externalId(id)) throw new ArchiveProviderError('SteamGridDB 游戏编号无效。', 400);
    const payload = await this.request(`grids/game/${id}`, {
      dimensions: '600x900,660x930,342x482', types: 'static', nsfw: 'false', humor: 'false', epilepsy: 'false',
      page, limit: GRID_LIMIT,
    });
    const results = payload.data.slice(0, GRID_LIMIT).flatMap(image => {
      const id = externalId(image?.id), url = steamGridImage(image?.url);
      const width = image?.width, height = image?.height;
      if (!id || !url || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || width >= height
        || image.nsfw || image.humor || image.epilepsy || !/^image\/(?:png|jpeg|webp)$/.test(image.mime)) return [];
      return [{ id, url, thumb: steamGridImage(image.thumb) || url, width, height, author: text(image.author?.name, 80) }];
    });
    return { results, page, hasMore: page < MAX_GRID_PAGE && (page + 1) * GRID_LIMIT < Number(payload.total) };
  }
}
