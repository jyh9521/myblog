// Native Worker adapter based on HowLongToBeat-PythonAPI's public search protocol.
// Upstream attribution/license: ../licenses/howlongtobeatpy-MIT.txt
const BASE = 'https://howlongtobeat.com';
const DAY = 86400000;
export const DETAIL_TTL = 14 * DAY;
export const SEARCH_TTL = 7 * DAY;
const headers = { 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/`, Origin: BASE };
export function normalizeHltb(game) {
  const id = Number(game?.game_id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof game.game_name !== 'string' || !game.game_name.trim()) return null;
  const hours = key => { const value = Number(game[key]); return Number.isFinite(value) && value > 0 ? Math.round(value / 36) / 100 : null; };
  return { id, title: game.game_name.trim().slice(0, 200), url: `${BASE}/game/${id}`,
    main: hours('comp_main'), extras: hours('comp_plus'), completionist: hours('comp_100'),
    platforms: String(game.profile_platform || '').slice(0, 300), type: String(game.game_type || '').slice(0, 40) };
}
async function boundedText(response) {
  if (!response.ok) throw new Error(`HLTB HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('HLTB response too large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export class HltbProvider {
  constructor(fetcher = (...args) => fetch(...args)) { this.fetcher = fetcher; }
  async read(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try { return await boundedText(await this.fetcher(`${BASE}${path}`, { ...options, headers: { ...headers, ...options.headers }, redirect: 'manual', signal: controller.signal })); }
    finally { clearTimeout(timer); }
  }
  async search(query) {
    const html = await this.read('/');
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(match => match[1]).filter(path => /^\/_next\/static\/chunks\/[\w.-]+\.js$/.test(path)).slice(0, 6);
    let endpoint = '/api/search/site';
    for (const script of scripts) {
      const source = await this.read(script);
      const match = source.match(/fetch\s*\(\s*["'](\/api\/[a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["']/);
      if (match) { endpoint = match[1].replace(/\/$/, ''); break; }
    }
    const auth = JSON.parse(await this.read(`${endpoint}/init?t=${Date.now()}`));
    if (typeof auth.token !== 'string' || !auth.token) throw new Error('HLTB initialization invalid');
    const key = Object.entries(auth).find(([name]) => /key/i.test(name))?.[1];
    const value = Object.entries(auth).find(([name]) => /val/i.test(name))?.[1];
    const body = { searchType: 'games', searchTerms: query.split(/\s+/), searchPage: 1, size: 20,
      searchOptions: { games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main', rangeTime: { min: 0, max: 0 }, gameplay: { perspective: '', flow: '', genre: '', difficulty: '' }, rangeYear: { min: '', max: '' }, modifier: '' }, users: { sortCategory: 'postcount' }, lists: { sortCategory: 'follows' }, filter: '', sort: 0, randomizer: 0 }, useCache: true };
    const authHeaders = { 'Content-Type': 'application/json', 'x-auth-token': auth.token };
    if (typeof key === 'string' && key && ['string', 'number'].includes(typeof value) && !['__proto__', 'constructor', 'prototype'].includes(key)) {
      body[key] = value; authHeaders['x-hp-key'] = key; authHeaders['x-hp-val'] = String(value);
    }
    const data = JSON.parse(await this.read(endpoint, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) }));
    if (!Array.isArray(data.data)) throw new Error('HLTB search shape invalid');
    return { results: data.data.slice(0, 20).map(normalizeHltb).filter(Boolean) };
  }
  async detail(id) {
    const html = await this.read(`/game/${id}`);
    const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
    if (!match) throw new Error('HLTB detail shape invalid');
    const rows = JSON.parse(match[1]).props?.pageProps?.game?.data?.game;
    const game = Array.isArray(rows) ? rows.find(row => Number(row.game_id) === id) : null;
    const result = normalizeHltb(game);
    if (!result) throw new Error('HLTB matching game missing');
    return result;
  }
}
export async function cachedHltb(db, key, ttl, producer, now = Date.now()) {
  const row = await db.prepare('SELECT payload, cached_at, retry_after FROM hltb_cache WHERE cache_key = ?').bind(key).first();
  let previous = null;
  try { if (row?.payload) previous = JSON.parse(row.payload); } catch { /* Invalid cache is never displayed. */ }
  const result = (value, cache, timestamp) => ({ ...value, cache, updatedAt: new Date(timestamp).toISOString() });
  if (previous && now - Number(row.cached_at) < ttl) return result(previous, 'fresh', row.cached_at);
  if (Number(row?.retry_after) > now) {
    if (previous) return result(previous, 'stale', row.cached_at);
    throw new Error('HLTB temporarily unavailable');
  }
  // D1's atomic lease prevents concurrent refreshes across Worker isolates.
  const lease = await db.prepare('INSERT INTO hltb_cache (cache_key, retry_after) VALUES (?, ?) ON CONFLICT(cache_key) DO UPDATE SET retry_after = excluded.retry_after WHERE hltb_cache.retry_after <= ? RETURNING cache_key').bind(key, now + 120000, now).first();
  if (!lease) {
    if (previous) return result(previous, 'stale', row.cached_at);
    throw new Error('HLTB refresh in progress');
  }
  try {
    const value = await producer();
    await db.prepare('UPDATE hltb_cache SET payload = ?, cached_at = ?, retry_after = 0 WHERE cache_key = ?').bind(JSON.stringify(value), now, key).run();
    return result(value, 'miss', now);
  } catch (error) {
    await db.prepare('UPDATE hltb_cache SET retry_after = ? WHERE cache_key = ?').bind(now + 3600000, key).run();
    console.warn(JSON.stringify({ event: 'hltb_refresh_failed', key, error: /^HLTB (HTTP \d+|response too large|initialization invalid|search shape invalid|detail shape invalid|matching game missing)$/.test(error?.message || '') ? error.message : `source unavailable (${error?.name || 'Error'})` }));
    if (previous) return result(previous, 'stale', row.cached_at);
    throw error;
  }
}
export async function hltbRoute(request, env, provider = new HltbProvider()) {
  const responseHeaders = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  const json = (data, status = 200) => Response.json(data, { status, headers: responseHeaders });
  if (request.method !== 'GET') return json({ error: '只支持 GET 请求。' }, 405);
  const url = new URL(request.url);
  const search = url.pathname === '/ns/api/hltb/search';
  if (!search && url.pathname !== '/ns/api/hltb/detail') return json({ error: 'Not found' }, 404);
  const q = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
  const rawId = url.searchParams.get('id') || '';
  if (search ? q.length < 2 || q.length > 100 : !/^[1-9]\d{0,8}$/.test(rawId)) return json({ error: search ? '请输入 2–100 个字符。' : 'HLTB 游戏 ID 无效。' }, 400);
  try {
    const value = await cachedHltb(env.DB, search ? `search:${q.toLowerCase()}` : `game:${rawId}`, search ? SEARCH_TTL : DETAIL_TTL, () => search ? provider.search(q) : provider.detail(Number(rawId)));
    return json(value);
  } catch { return json({ error: '暂时无法获取 HLTB 数据，请稍后重试。' }, 503); }
}
