import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { editionEvidence, releaseYear } from './game-identity.js';
import { boundedText } from './bounded-body.js';

const clean = value => String(value ?? '').trim();
const list = value => (Array.isArray(value) ? value : value ? [value] : []).map(item => clean(item?.name ?? item)).filter(Boolean);
const hasJapaneseScript = value => /[\u3040-\u30ff]/.test(clean(value));
const sourceFields = (source, fields) => Object.fromEntries(fields.filter(([key, value]) => Array.isArray(value) ? value.length > 0 : Boolean(clean(value))).map(([key]) => [key, source]));
const unwrapGames = value => {
  if (Array.isArray(value)) return value.flatMap(unwrapGames);
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.jeu)) return value.jeu.flatMap(unwrapGames);
  if (value.jeu && typeof value.jeu === 'object') return [value.jeu];
  return [value];
};

function preferredTitle({ defaultName, originalName, aliases = [], localizedNames = {} }) {
  return clean(localizedNames.zhHans) || clean(localizedNames.zhHant)
    || (hasJapaneseScript(originalName) ? clean(originalName) : '')
    || clean(originalName) || clean(defaultName);
}

export function normalizeRawgGame(game) {
  const aliases = list(game.alternative_names);
  const originalName = clean(game.name_original) || clean(game.name);
  const title = preferredTitle({ defaultName: game.name, originalName, aliases });
  const platforms = gamePlatforms.normalizePlatformList((game.platforms || []).map(item => clean(item.platform?.name || item.name)));
  const developers = list(game.developers);
  const publishers = list(game.publishers);
  const normalized = {
    id: `rawg:${game.id}`, title, localizedName: '', originalName, alternativeNames: aliases,
    description: clean(game.description_raw || game.description), releaseDate: clean(game.released),
    developers, publishers, platforms, genres: list(game.genres),
    platformReleaseDates: Object.fromEntries((game.platforms || []).flatMap(item => {
      const platform = gamePlatforms.normalizePlatform(item.platform?.name || item.name), date = clean(item.released_at);
      return platform && /^\d{4}-\d{2}-\d{2}$/.test(date) ? [[platform, date]] : [];
    })),
    cover: clean(game.background_image || game.background_image_additional),
    screenshots: (Array.isArray(game.short_screenshots) ? game.short_screenshots : [])
      .map(item => clean(item?.image)).filter(Boolean),
    website: clean(game.website), sources: { rawg: {
      id: String(game.id),
      ...(clean(game.slug) ? { slug: clean(game.slug) } : {}),
      url: `https://rawg.io/games/${encodeURIComponent(String(game.id))}`,
    } },
    fieldSources: {}, updatedAt: new Date().toISOString(),
  };
  normalized.fieldSources = sourceFields('rawg', ['title', 'localizedName', 'originalName', 'alternativeNames', 'description', 'releaseDate', 'developers', 'publishers', 'platforms', 'genres', 'cover', 'screenshots', 'website'].map(key => [key, normalized[key]]));
  return normalized;
}

// ScreenScraper embeds developer credentials in media URLs. Return only our
// credential-free proxy URL; never persist an upstream authenticated URL.
function publicScreenMedia(value) {
  try {
    const url = new URL(clean(value));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.hostname === 'screenscraper.fr' || url.hostname.endsWith('.screenscraper.fr')) {
      if (!url.pathname.endsWith('/mediaJeu.php')) return '';
      const params = new URLSearchParams();
      for (const key of ['systemeid', 'jeuid', 'media']) params.set(key, url.searchParams.get(key) || '');
      return `https://blog.blfy.cc/ns/api/games/media?${params}`;
    }
    for (const key of [...url.searchParams.keys()]) if (/password|devid|ssid/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return ''; }
}

function screenNames(game) {
  const namesValue = game.noms || game.names || {};
  const names = Array.isArray(namesValue)
    ? Object.fromEntries(namesValue.map(item => [clean(item?.region || item?.lang || item?.id), item?.text || item?.nom || item?.name || '']))
    : namesValue;
  const localizedNames = {
    zhHans: clean(names.cn || names.zh || names.nom_cn || names.nom_zh_cn || names.nom_zh),
    zhHant: clean(names.tw || names.hk || names.nom_tw || names.nom_hk || names.nom_zh_tw),
  };
  const aliases = [...new Set(Object.values(names).map(value => clean(value?.text || value?.nom || value?.name || value)).filter(Boolean))];
  const originalName = clean(game.nom || game.nom_ss || game.name || game.nom_jp || names.ss || names.wor || names.us || names.eu || names.jp || aliases[0]);
  const defaultName = originalName;
  return { localizedNames, aliases, originalName, title: preferredTitle({ defaultName, originalName, aliases, localizedNames }) };
}

export function normalizeScreenScraperGame(game, system = {}) {
  const { localizedNames, aliases, originalName, title } = screenNames(game);
  const dates = game.dates || {};
  const dateValues = Object.values(dates).map(value => clean(value?.text || value?.date || value)).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value));
  const synopsis = game.synopsis || {};
  const synopsisObject = Array.isArray(synopsis)
    ? Object.fromEntries(synopsis.map(item => [clean(item?.langue || item?.lang || item?.id), item?.text || item?.synopsis || '']))
    : synopsis;
  const localizedSynopsis = Object.entries(synopsisObject).find(([key, value]) => /^(?:synopsis_)?(?:zh|cn)/i.test(key) && clean(value));
  const englishSynopsis = Object.entries(synopsisObject).find(([key, value]) => /^(?:synopsis_)?(?:en|us)$/i.test(key) && clean(value));
  const synopsisText = clean(localizedSynopsis?.[1] || englishSynopsis?.[1] || game.synopsis_en || (typeof synopsis === 'string' ? synopsis : ''));
  const genres = game.genres || {};
  const genreValues = Object.values(genres).flatMap(value => Array.isArray(value) ? value : [value])
    .flatMap(item => item?.noms ? (item.noms.filter(name => name.langue === 'en').length ? item.noms.filter(name => name.langue === 'en') : item.noms.slice(0, 1)) : [item])
    .map(item => clean(item?.text || item?.nom || item?.genre || (typeof item === 'string' ? item : ''))).filter(Boolean);
  const media = game.medias || {};
  const mediaEntries = Array.isArray(media) ? media.map(item => [clean(item?.type || item?.typeMedia || item?.id), item]) : Object.entries(media);
  const screenshots = mediaEntries.filter(([key]) => /^(ss|sstitle)$|screenshot|screen/i.test(key)).flatMap(([, value]) => {
    const entries = Array.isArray(value) ? value : [value];
    return entries.map(item => publicScreenMedia(item?.url || item?.text || item)).filter(Boolean);
  });
  const cover = mediaEntries.filter(([key]) => /boitier.*2d|box.*2d|media.*wheel|media.*marquee|mix.?vignette/i.test(key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]).map(item => publicScreenMedia(item?.url || item?.text || item)))
    .find(Boolean) || '';
  const systemId = clean(game.systeme?.id || system.id);
  const normalized = {
    id: `screenscraper:${clean(game.id)}`, title, localizedName: localizedNames.zhHans || localizedNames.zhHant,
    originalName, alternativeNames: aliases, description: synopsisText, releaseDate: dateValues.sort()[0] || '',
    developers: list(game.developpeur?.text || game.developpeur), publishers: list(game.editeur?.text || game.editeur),
    platforms: gamePlatforms.normalizePlatformList([clean(game.systeme?.text || game.systeme?.nom || system.text || system.name)]), genres: [...new Set(genreValues)],
    cover, screenshots: [...new Set(screenshots)], website: '',
    sources: { screenscraper: {
      id: clean(game.id), systemId,
      ...(clean(game.id) && systemId ? { url: `https://www.screenscraper.fr/index.php?gameid=${encodeURIComponent(clean(game.id))}&plateforme=${encodeURIComponent(systemId)}` } : {}),
    } }, fieldSources: {}, updatedAt: new Date().toISOString(),
  };
  normalized.fieldSources = sourceFields('screenscraper', ['title', 'localizedName', 'originalName', 'alternativeNames', 'description', 'releaseDate', 'developers', 'publishers', 'platforms', 'genres', 'cover', 'screenshots', 'website'].map(key => [key, normalized[key]]));
  return normalized;
}

export function mergeMetadata(primary, secondary) {
  if (!primary) return secondary;
  if (!secondary) return primary;
  const merged = { ...primary, sources: { ...primary.sources, ...secondary.sources }, fieldSources: { ...primary.fieldSources } };
  for (const key of ['localizedName', 'originalName', 'description', 'releaseDate', 'cover', 'website']) {
    if (!merged[key] && secondary[key]) { merged[key] = secondary[key]; merged.fieldSources[key] = Object.keys(secondary.sources || {})[0] || 'manual'; }
  }
  for (const key of ['alternativeNames', 'developers', 'publishers', 'platforms', 'genres', 'screenshots']) {
    merged[key] = [...new Set([...(primary[key] || []), ...(secondary[key] || [])])];
  }
  merged.platforms = gamePlatforms.normalizePlatformList(merged.platforms);
  merged.title = primary.localizedName || secondary.localizedName || primary.title || secondary.title;
  merged.updatedAt = new Date().toISOString();
  return merged;
}

export const areSameGame = (a, b) => editionEvidence(a, b).strong;

export function combineCandidates(rawg, screenscraper) {
  // Require an unambiguous match in both directions. A provider game ID can
  // represent an entire release; a ScreenScraper ID is tied to a system.
  const used = new Set();
  const results = rawg.map(game => {
    const matches = screenscraper.filter(candidate => areSameGame(game, candidate));
    const match = matches.length === 1 && rawg.filter(candidate => areSameGame(candidate, matches[0])).length === 1
      ? matches[0] : null;
    if (match) used.add(match);
    return match ? mergeMetadata(game, match) : game;
  });
  return [...results, ...screenscraper.filter(game => !used.has(game))]
    .map(game => ({ ...game, year: Number(releaseYear(game.releaseDate)) || '' }));
}

export class GameMetadataProvider {
  async search() { throw new Error('search() must be implemented by a metadata provider'); }
  async getById() { throw new Error('getById() must be implemented by a metadata provider'); }
}

export class RAWGProvider extends GameMetadataProvider {
  constructor(env, fetcher = fetch) { super(); this.env = env; this.fetcher = fetcher; }
  async request(path, params = {}) {
    if (!this.env.RAWG_API_KEY) throw new Error('RAWG_API_KEY 未配置');
    const url = new URL(`https://api.rawg.io/api/${path}`);
    url.searchParams.set('key', this.env.RAWG_API_KEY);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    try {
      const response = await this.fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('upstream'); }
      return JSON.parse(await boundedText(response, 2 * 1024 * 1024));
    } catch { throw new Error('RAWG 暂未返回有效资料，请稍后重试。'); }
  }
  async search(query) {
    const response = await this.request('games', { search: query, page_size: 12 });
    return (Array.isArray(response.results) ? response.results : [])
      .filter(game => /^[1-9]\d{0,15}$/.test(String(game?.id)) && clean(game.name))
      .slice(0, 12).map(normalizeRawgGame);
  }
  async getCoreById(id) {
    if (!/^[1-9]\d{0,15}$/.test(String(id))) throw new Error('RAWG 游戏编号无效。');
    const game = await this.request('games/' + id);
    if (String(game?.id) !== String(id) || !clean(game.name)) throw new Error('RAWG 返回了不同的游戏编号。');
    return normalizeRawgGame(game);
  }
  async getById(id) {
    const normalized = await this.getCoreById(id);
    try {
      const shots = await this.request('games/' + id + '/screenshots', { page_size: 8 });
      normalized.screenshots = [...new Set([...normalized.screenshots, ...(shots.results || []).map(item => clean(item.image)).filter(Boolean)])];
    } catch { /* Screenshots are optional enrichment. */ }
    return normalized;
  }
}

export class ScreenScraperProvider extends GameMetadataProvider {
  constructor(env, fetcher = fetch) { super(); this.env = env; this.fetcher = fetcher; }
  async request(endpoint, params = {}) {
    if (!this.env.SCREENSCRAPER_DEV_ID || !this.env.SCREENSCRAPER_DEV_PASSWORD) throw new Error('ScreenScraper 开发者凭据未配置');
    const url = new URL(`https://api.screenscraper.fr/api2/${endpoint}.php`);
    const values = {
      devid: this.env.SCREENSCRAPER_DEV_ID,
      devpassword: this.env.SCREENSCRAPER_DEV_PASSWORD,
      softname: this.env.SCREENSCRAPER_SOFTNAME || 'blfy-blog', output: 'json',
      ...(this.env.SCREENSCRAPER_USER_ID ? { ssid: this.env.SCREENSCRAPER_USER_ID } : {}),
      ...(this.env.SCREENSCRAPER_USER_PASSWORD ? { sspassword: this.env.SCREENSCRAPER_USER_PASSWORD } : {}),
      ...params,
    };
    for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    try {
      const response = await this.fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(75000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('upstream'); }
      return JSON.parse(await boundedText(response, 2 * 1024 * 1024));
    } catch {
      // Upstream may return plaintext (including its authenticated URL).
      throw new Error('ScreenScraper 暂未返回有效资料，请稍后重试（最多等待 75 秒）。');
    }
  }
  async search(query) {
    const data = await this.request('jeuRecherche', { recherche: query });
    const systemData = data?.response?.systemes?.systeme || data?.response?.systemes || [];
    const systemList = Array.isArray(systemData) ? systemData : [systemData];
    const systems = new Map(systemList.filter(Boolean).map(item => [String(item.systeme?.id || item.id), item.systeme || item]));
    const games = unwrapGames(data?.response?.jeux || data?.jeux || [])
      .filter(game => game?.id && game.notgame !== true && game.notgame !== 'true')
      .map(game => normalizeScreenScraperGame(game, systems.get(String(game.systeme?.id)) || {}));
    return games;
  }
  async getById(id, systemId) {
    if (!systemId) throw new Error('ScreenScraper 结果缺少 systemId，无法读取详情');
    const data = await this.request('jeuInfos', { gameid: id, systemeid: systemId });
    const game = data?.response?.jeu || data?.jeu;
    if (String(game?.id) !== String(id) || (game.systeme?.id && String(game.systeme.id) !== String(systemId))) {
      throw new Error('ScreenScraper 没有返回该游戏及平台。');
    }
    return normalizeScreenScraperGame(game, game.systeme || { id: systemId });
  }
}

export async function screenScraperMedia(request, env) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const params = new URL(request.url).searchParams;
  const system = params.get('systemeid') || '', game = params.get('jeuid') || '', media = params.get('media') || '';
  if (!/^\d{1,16}$/.test(system) || !/^\d{1,16}$/.test(game)
    || !/^(?:ss|sstitle|box-2D(?:-side|-back)?|wheel(?:-hd)?|screenmarquee|screenmarqueesmall|mixrbv[12])(?:\([a-z]{2,4}\))?$/.test(media)) {
    return new Response('Invalid media', { status: 400 });
  }
  if (!env.SCREENSCRAPER_DEV_ID || !env.SCREENSCRAPER_DEV_PASSWORD) return new Response('Media unavailable', { status: 503 });
  const upstream = new URL('https://api.screenscraper.fr/api2/mediaJeu.php');
  const values = { systemeid: system, jeuid: game, media, devid: env.SCREENSCRAPER_DEV_ID,
    devpassword: env.SCREENSCRAPER_DEV_PASSWORD, softname: env.SCREENSCRAPER_SOFTNAME || 'blfy-blog',
    ...(env.SCREENSCRAPER_USER_ID ? { ssid: env.SCREENSCRAPER_USER_ID } : {}),
    ...(env.SCREENSCRAPER_USER_PASSWORD ? { sspassword: env.SCREENSCRAPER_USER_PASSWORD } : {}) };
  Object.entries(values).forEach(([key, value]) => upstream.searchParams.set(key, value));
  try {
    const result = await fetch(upstream, { signal: AbortSignal.timeout(75000) });
    const type = result.headers.get('Content-Type') || '';
    if (!result.ok || !/^image\/(?:png|jpeg|jpg|webp|gif|avif|bmp)(?:;|$)/i.test(type)) {
      await result.body?.cancel();
      return new Response('Media unavailable', { status: 502 });
    }
    return new Response(result.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Media unavailable', { status: 502 }); }
}

// Reserved provider contract. Add IGDB here when credentials become available;
// routes and CMS consume only normalized GameMetadata.
export class IGDBProvider extends GameMetadataProvider {
  async search() { throw new Error('IGDB provider is not configured'); }
  async getById() { throw new Error('IGDB provider is not configured'); }
}
