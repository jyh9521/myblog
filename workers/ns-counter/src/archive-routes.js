import { ArchiveProviderError, TheGamesDBProvider, SteamGridDBProvider, externalId, MAX_GRID_PAGE } from './archive-providers.js';
import { cachedMetadata } from './metadata-cache.js';

const HOUR = 60 * 60 * 1000;
const searchTtl = value => value.results.length ? HOUR : 5 * 60 * 1000;
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
} });

async function requireAdmin(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
  if ((origin && origin !== url.origin) || (site && site !== 'same-origin') || request.headers.get('X-Gaming-Admin') !== '1') {
    return json({ error: '请从博客后台使用这个数据源。' }, 403);
  }
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith('__Host-gaming_admin='));
  if (!cookie) return json({ error: 'ADMIN_LOGIN_REQUIRED' }, 401);
  try {
    // Only the existing CMS admin cookie is forwarded to the accounts service;
    // neither other site cookies nor provider keys are sent to that service.
    const response = await env.GAME_ADMIN.fetch(new Request(new URL('/ns/api/accounts', url.origin), { headers: { Cookie: cookie } }));
    await response.body?.cancel();
    if (response.status === 200) return null;
    if (response.status === 401) return json({ error: 'ADMIN_LOGIN_REQUIRED' }, 401);
  } catch { /* The accounts worker may be unavailable. */ }
  return json({ error: '后台登录暂时无法验证，请稍后重试。' }, 503);
}

async function respond(request, env, action) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try { return await action(); }
  catch (error) {
    const safe = error instanceof ArchiveProviderError;
    return json({ error: safe ? error.message : '游戏资料暂不可用，请稍后重试。' }, safe ? error.status : 502);
  }
}

function cacheResult(outcome) {
  return { ...outcome.value, cache: outcome.stale ? 'stale' : outcome.cached ? 'fresh' : 'miss',
    ...(outcome.warning ? { warning: outcome.warning } : {}) };
}

export function searchTheGamesDB(request, env, query, fetcher = fetch) {
  return respond(request, env, async () => {
    const outcome = await cachedMetadata(env, `thegamesdb:search:v1:${query.toLowerCase()}`, searchTtl, async () => {
      const results = (await new TheGamesDBProvider(env, fetcher).search(query)).map(game => ({ ...game, year: game.releaseDate.slice(0, 4) }));
      return { results, warnings: [...new Set(results.flatMap(game => game.warnings || []))] };
    });
    return json(cacheResult(outcome));
  });
}

export function detailTheGamesDB(request, env, body, fetcher = fetch) {
  return respond(request, env, async () => {
    const id = externalId(body?.sources?.thegamesdb?.id);
    if (!id) return json({ error: '请先选择一个 TheGamesDB 游戏候选。' }, 400);
    const outcome = await cachedMetadata(env, `thegamesdb:detail:v1:${id}`, 7 * 24 * HOUR,
      () => new TheGamesDBProvider(env, fetcher).getById(id), body.refresh === true);
    return json(cacheResult(outcome));
  });
}

export function steamGridDBRoute(request, env, fetcher = fetch) {
  if (request.method !== 'GET') return json({ error: '只支持 GET 请求。' }, 405, { Allow: 'GET' });
  const url = new URL(request.url);
  return respond(request, env, async () => {
    const provider = new SteamGridDBProvider(env, fetcher);
    if (url.pathname.endsWith('/search')) {
      const query = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
      if (query.length < 2 || query.length > 100 || /[\u0000-\u001f]/.test(query)) return json({ error: '请输入 2–100 个字符的游戏名称。' }, 400);
      const outcome = await cachedMetadata(env, `steamgriddb:search:v1:${query.toLowerCase()}`, searchTtl,
        async () => ({ results: await provider.search(query) }));
      return json(cacheResult(outcome));
    }
    const id = externalId(url.searchParams.get('gameId')), page = url.searchParams.get('page') ?? '0';
    if (!id || !/^(0|[1-9]\d?)$/.test(page) || Number(page) > MAX_GRID_PAGE) return json({ error: '封面游戏编号或页码无效。' }, 400);
    const outcome = await cachedMetadata(env, `steamgriddb:grids:v1:${id}:${page}`, searchTtl,
      () => provider.grids(id, Number(page)));
    return json(cacheResult(outcome));
  });
}
