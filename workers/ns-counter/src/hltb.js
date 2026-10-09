// Native Worker adapter based on HowLongToBeat-PythonAPI's public search protocol.
// Upstream attribution/license: ../licenses/howlongtobeatpy-MIT.txt
const BASE = 'https://howlongtobeat.com';
const DAY = 86400000;
export const DETAIL_TTL = 14 * DAY;
export const SEARCH_TTL = 7 * DAY;
const headers = { 'User-Agent': 'Mozilla/5.0', Referer: `${BASE}/`, Origin: BASE };
// Store titles often carry typography and edition suffixes absent from HLTB.
export function normalizeSearchName(value) {
  return String(value).replace(/[™®©]/g, '').normalize('NFKC').toLowerCase()
    .replace(/[’‘`´]/g, "'").replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function searchQueries(value) {
  const normalized = normalizeSearchName(value);
  const queries = [normalized, normalized.replace(/'/g, '')];
  const base = normalized.replace(/\s+(?:director'?s cut|game of the year(?: edition)?|goty(?: edition)?|(?:digital )?(?:deluxe|definitive|ultimate|complete|standard|collector'?s|enhanced|special|anniversary) edition)$/, '').trim();
  if (base !== normalized) queries.push(base);
  else {
    const words = normalized.split(' ');
    // Keep sequel numbers even when broadening a long subtitle.
    if (words.length >= 3) queries.push([...words.slice(0, 2), ...words.slice(2).filter(word => /\d/.test(word))].join(' '));
  }
  return [...new Set(queries)].filter(query => query.length >= 2).slice(0, 3);
}
function matchScore(query, title) {
  const a = normalizeSearchName(query).replace(/'/g, '');
  const b = normalizeSearchName(title).replace(/'/g, '');
  if (a === b) return 1;
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length, 1);
}
export function rankSearchResults(results, query) {
  return [...new Map(results.map(game => [game.id, game])).values()]
    .sort((a, b) => matchScore(query, b.title) - matchScore(query, a.title) || a.id - b.id);
}

class HltbUnavailable extends Error {
  constructor(retryAt) { super('HLTB temporarily unavailable'); this.retryAt = retryAt; }
}
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
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try { return await boundedText(await this.fetcher(`${BASE}${path}`, { ...options, headers: { ...headers, ...options.headers }, redirect: 'manual', signal: controller.signal })); }
      catch (error) {
        error.stage = path.split('?')[0];
        // Retry transient transport/server failures once, not invalid data or authorization errors.
        if (attempt || !(error?.name === 'AbortError' || error?.name === 'TypeError' || /^HLTB HTTP (500|502|503|504)$/.test(error?.message || ''))) throw error;
      } finally { clearTimeout(timer); }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  async search(query) {
    const queries = searchQueries(query);
    if (!queries.length) return { results: [] };
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
    for (const candidate of queries) {
      body.searchTerms = candidate.split(/\s+/);
      const data = JSON.parse(await this.read(endpoint, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) }));
      if (!Array.isArray(data.data)) throw new Error('HLTB search shape invalid');
      const results = data.data.slice(0, 20).map(normalizeHltb).filter(Boolean);
      if (results.length) return { results: rankSearchResults(results, query), matchedQuery: candidate };
    }
    return { results: [], matchedQuery: queries[queries.length - 1] };
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
    throw new HltbUnavailable(Number(row.retry_after));
  }
  // D1's atomic lease prevents concurrent refreshes across Worker isolates.
  const lease = await db.prepare('INSERT INTO hltb_cache (cache_key, retry_after) VALUES (?, ?) ON CONFLICT(cache_key) DO UPDATE SET retry_after = excluded.retry_after WHERE hltb_cache.retry_after <= ? RETURNING cache_key').bind(key, now + 120000, now).first();
  if (!lease) {
    if (previous) return result(previous, 'stale', row.cached_at);
    throw new HltbUnavailable(now + 120000);
  }
  try {
    const value = await producer();
    await db.prepare('UPDATE hltb_cache SET payload = ?, cached_at = ?, retry_after = 0 WHERE cache_key = ?').bind(JSON.stringify(value), now, key).run();
    return result(value, 'miss', now);
  } catch (error) {
    const retryAt = now + (previous ? 3600000 : 60000);
    await db.prepare('UPDATE hltb_cache SET retry_after = ? WHERE cache_key = ?').bind(retryAt, key).run();
    console.warn(JSON.stringify({ event: 'hltb_refresh_failed', key, stage: /^\/[a-zA-Z0-9_./-]*$/.test(error?.stage || '') ? error.stage : undefined, error: /^HLTB (HTTP \d+|response too large|initialization invalid|search shape invalid|detail shape invalid|matching game missing)$/.test(error?.message || '') ? error.message : `source unavailable (${error?.name || 'Error'})` }));
    if (previous) return result(previous, 'stale', row.cached_at);
    throw new HltbUnavailable(retryAt);
  }
}
export async function hltbRoute(request, env, provider = new HltbProvider()) {
  const responseHeaders = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  const json = (data, status = 200) => Response.json(data, { status, headers: responseHeaders });
  if (request.method !== 'GET') return json({ error: '只支持 GET 请求。' }, 405);
  const url = new URL(request.url);
  const search = url.pathname === '/ns/api/hltb/search';
  if (!search && url.pathname !== '/ns/api/hltb/detail') return json({ error: 'Not found' }, 404);
  const rawQuery = (url.searchParams.get('q') || '').trim();
  const q = normalizeSearchName(rawQuery);
  const rawId = url.searchParams.get('id') || '';
  if (search ? q.length < 2 || rawQuery.length > 100 : !/^[1-9]\d{0,8}$/.test(rawId)) return json({ error: search ? '请输入 2–100 个字符。' : 'HLTB 游戏 ID 无效。' }, 400);
  try {
    const value = await cachedHltb(env.DB, search ? `search:v2:${q}` : `game:${rawId}`, search ? SEARCH_TTL : DETAIL_TTL, () => search ? provider.search(q) : provider.detail(Number(rawId)));
    return json(value);
  } catch (error) {
    const retryAfter = error instanceof HltbUnavailable ? Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1000)) : 60;
    return Response.json({ error: '暂时无法获取 HLTB 数据。', retryAfter }, { status: 503, headers: { ...responseHeaders, 'Retry-After': String(retryAfter) } });
  }
}
