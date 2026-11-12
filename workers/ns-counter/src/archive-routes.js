import { ArchiveProviderError, TheGamesDBProvider, SteamGridDBProvider, externalId, MAX_GRID_PAGE, MAX_THEGAMESDB_VERSIONS } from './archive-providers.js';
import { RAWGProvider } from './game-providers.js';
import { rankEditions, releaseYear } from './game-identity.js';
import { cachedMetadata } from './metadata-cache.js';
import { preferTheGamesDBVersion } from './thegamesdb-versions.js';

const HOUR = 60 * 60 * 1000;
const searchTtl = value => value.results.length ? HOUR : 5 * 60 * 1000;
export const archiveJson = (body, status = 200, headers = {}) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
} });

async function requireAdmin(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
  if ((origin && origin !== url.origin) || (site && site !== 'same-origin') || request.headers.get('X-Gaming-Admin') !== '1') {
    return archiveJson({ error: '请从博客后台使用这个数据源。' }, 403);
  }
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith('__Host-gaming_admin='));
  if (!cookie) return archiveJson({ error: 'ADMIN_LOGIN_REQUIRED' }, 401);
  try {
    // Only the existing CMS admin cookie is forwarded to the accounts service;
    // neither other site cookies nor provider keys are sent to that service.
    const response = await env.GAME_ADMIN.fetch(new Request(new URL('/ns/api/accounts', url.origin), { headers: { Cookie: cookie } }));
    await response.body?.cancel();
    if (response.status === 200) return null;
    if (response.status === 401) return archiveJson({ error: 'ADMIN_LOGIN_REQUIRED' }, 401);
  } catch { /* The accounts worker may be unavailable. */ }
  return archiveJson({ error: '后台登录暂时无法验证，请稍后重试。' }, 503);
}

export async function withArchiveAdmin(request, env, action) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try { return await action(); }
  catch (error) {
    const safe = error instanceof ArchiveProviderError;
    return archiveJson({ error: safe ? error.message : '游戏资料暂不可用，请稍后重试。' }, safe ? error.status : 502);
  }
}

function cacheResult(outcome) {
  return { ...outcome.value, cache: outcome.stale ? 'stale' : outcome.cached ? 'fresh' : 'miss',
    ...(outcome.warning ? { warning: outcome.warning } : {}) };
}

// Database prose stays a transient reference; metadata imports only factual fields.
export function metadataOnly(game) {
  const { description, ...facts } = game;
  const { description: proseSource, ...fieldSources } = facts.fieldSources || {};
  return { ...facts, fieldSources };
}

function editionHints(request, query) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year') || '';
  const platform = (searchParams.get('platform') || '').trim().slice(0, 80);
  const developer = (searchParams.get('developer') || '').trim().slice(0, 100);
  if (year && !/^(?:19|20)\d{2}$/.test(year)) throw new ArchiveProviderError('请输入四位发行年份。', 400);
  return { title: query, releaseDate: year, platforms: platform ? [platform] : [], developers: developer ? [developer] : [] };
}

function rankedCatalog(outcome, hints) {
  const value = cacheResult(outcome);
  const games = value.results.map(result => {
    const game = preferTheGamesDBVersion(result, hints);
    return { ...game, year: releaseYear(game.releaseDate) };
  });
  return archiveJson({ ...value, results: rankEditions(games, hints) });
}

async function cachedTheGamesDBSearch(env, query, fetcher) {
  return cachedMetadata(env, 'thegamesdb:search:v5:' + query.toLowerCase(), searchTtl, async () => {
    const { results, warnings } = await new TheGamesDBProvider(env, fetcher).searchCatalog(query);
    return { results: results.map(metadataOnly), warnings };
  });
}

export function searchDossierEditions(request, env, query, fetcher = fetch) {
  return withArchiveAdmin(request, env, async () => {
    const hints = editionHints(request, query);
    const outcome = await cachedMetadata(env, 'dossier:editions:v4:' + query.toLowerCase(), searchTtl, async () => {
      const [rawg, catalog] = await Promise.allSettled([
        new RAWGProvider(env, fetcher).search(query), cachedTheGamesDBSearch(env, query, fetcher),
      ]);
      if (rawg.status === 'rejected' && catalog.status === 'rejected') {
        throw new ArchiveProviderError('RAWG 与 TheGamesDB 暂不可用。请试用其他来源或手动填写。', 503);
      }
      const catalogValue = catalog.status === 'fulfilled' ? cacheResult(catalog.value) : null;
      return { results: [...(rawg.status === 'fulfilled' ? rawg.value.map(metadataOnly) : []), ...(catalogValue?.results || [])],
        warnings: [...(rawg.status === 'rejected' ? ['RAWG 暂不可用'] : []),
          ...(catalogValue ? [...catalogValue.warnings, ...(catalogValue.warning ? [catalogValue.warning] : [])] : ['TheGamesDB 暂不可用'])] };
    });
    return rankedCatalog(outcome, hints);
  });
}

export function searchTheGamesDB(request, env, query, fetcher = fetch) {
  return withArchiveAdmin(request, env, async () => {
    const hints = editionHints(request, query);
    return rankedCatalog(await cachedTheGamesDBSearch(env, query, fetcher), hints);
  });
}

export function detailTheGamesDB(request, env, body, fetcher = fetch) {
  return withArchiveAdmin(request, env, async () => {
    const source = body?.sources?.thegamesdb;
    const id = externalId(source?.id);
    if (!id) return archiveJson({ error: '请先选择一个 TheGamesDB 游戏候选。' }, 400);
    const versions = source.versions ?? [];
    if (!Array.isArray(versions) || versions.length > MAX_THEGAMESDB_VERSIONS || versions.some(version => !externalId(version?.id))) {
      return archiveJson({ error: 'TheGamesDB 平台记录无效，请重新搜索。' }, 400);
    }
    // Trust only the IDs, never the browser's platform names or release dates.
    const ids = [...new Set(versions.map(version => externalId(version.id)))].filter(value => value !== id).sort();
    if (ids.length >= MAX_THEGAMESDB_VERSIONS) return archiveJson({ error: 'TheGamesDB 平台记录过多，请重新搜索。' }, 400);
    const outcome = await cachedMetadata(env, `thegamesdb:detail:v5:${[id, ...ids].join(',')}`, 7 * 24 * HOUR,
      async () => metadataOnly(await new TheGamesDBProvider(env, fetcher).getByVersionIds(id, ids)), body.refresh === true);
    return archiveJson(cacheResult(outcome));
  });
}

export function steamGridDBRoute(request, env, fetcher = fetch) {
  if (request.method !== 'GET') return archiveJson({ error: '只支持 GET 请求。' }, 405, { Allow: 'GET' });
  const url = new URL(request.url);
  return withArchiveAdmin(request, env, async () => {
    const provider = new SteamGridDBProvider(env, fetcher);
    if (url.pathname.endsWith('/search')) {
      const query = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
      if (query.length < 2 || query.length > 100 || /[\u0000-\u001f]/.test(query)) return archiveJson({ error: '请输入 2–100 个字符的游戏名称。' }, 400);
      const outcome = await cachedMetadata(env, `steamgriddb:search:v1:${query.toLowerCase()}`, searchTtl,
        async () => ({ results: await provider.search(query) }));
      return archiveJson(cacheResult(outcome));
    }
    const id = externalId(url.searchParams.get('gameId')), page = url.searchParams.get('page') ?? '0';
    if (!id || !/^(0|[1-9]\d?)$/.test(page) || Number(page) > MAX_GRID_PAGE) return archiveJson({ error: '封面游戏编号或页码无效。' }, 400);
    const outcome = await cachedMetadata(env, `steamgriddb:grids:v1:${id}:${page}`, searchTtl,
      () => provider.grids(id, Number(page)));
    return archiveJson(cacheResult(outcome));
  });
}
