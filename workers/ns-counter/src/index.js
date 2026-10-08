import { RAWGProvider, ScreenScraperProvider, screenScraperMedia, areSameGame, combineCandidates, mergeMetadata } from "./game-providers.js";
import { DurableObject } from "cloudflare:workers";
import { hltbRoute } from './hltb.js';

// Keep the already-provisioned namespace export during the provider migration.
// The old IGDB endpoints are retired; this stub prevents a destructive DO
// deletion while allowing RAWG/ScreenScraper routes to deploy without Twitch.
export class IgdbApi extends DurableObject {
  async fetch() {
    return Response.json({ error: "IGDB API 已停用。" }, { status: 410 });
  }
}

const jsonHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
async function readMetadataCache(env, key) {
  try {
    const row = await env.DB.prepare("SELECT payload, cached_at FROM game_metadata_cache WHERE cache_key = ?").bind(key).first();
    return row ? { value: JSON.parse(row.payload), cachedAt: Number(row.cached_at) } : null;
  } catch { return null; }
}
async function writeMetadataCache(env, key, value) {
  try {
    await env.DB.prepare("INSERT INTO game_metadata_cache (cache_key, payload, cached_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at")
      .bind(key, JSON.stringify(value), Date.now()).run();
  } catch { /* Metadata fetch stays available if the optional cache migration is pending. */ }
}
async function cachedMetadata(env, key, ttlMs, producer, force = false) {
  const cached = await readMetadataCache(env, key);
  if (!force && cached && Date.now() - cached.cachedAt < ttlMs) return { value: cached.value, cached: true, stale: false };
  try {
    const value = await producer();
    await writeMetadataCache(env, key, value);
    return { value, cached: false, stale: false };
  } catch (error) {
    if (cached) return { value: cached.value, cached: true, stale: true, warning: error instanceof Error ? error.message : "上游数据源暂不可用" };
    throw error;
  }
}
function jsonError(message, status = 502) { return Response.json({ error: message }, { status, headers: jsonHeaders }); }
const CACHE_SEARCH_MS = 60 * 60 * 1000;
const CACHE_EMPTY_SEARCH_MS = 5 * 60 * 1000;
const CACHE_DETAIL_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/ns/api/hltb/')) return hltbRoute(request, env);
    if (url.pathname === "/ns/api/games/media") return screenScraperMedia(request, env);
    if (url.pathname === "/ns/api/games/search") {
      if (request.method !== "GET") return jsonError("只支持 GET 请求。", 405);
      const query = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 100);
      if (query.length < 2) return jsonError("请输入至少两个字符。", 400);
      const source = (url.searchParams.get("source") || "auto").toLowerCase();
      if (!['auto', 'rawg', 'screenscraper'].includes(source)) return jsonError("数据源选项无效。", 400);
      const cacheKey = `game-search:v4:${source}:${query.toLocaleLowerCase()}`;
      const cached = await readMetadataCache(env, cacheKey);
      if (cached) {
        const cacheTtl = cached.value.results?.length ? CACHE_SEARCH_MS : CACHE_EMPTY_SEARCH_MS;
        if (Date.now() - cached.cachedAt < cacheTtl) return Response.json({ ...cached.value, cache: "fresh" }, { headers: jsonHeaders });
      }
      const warnings = [];
      let rawg = [], screenscraper = [];
      if (source !== 'screenscraper') {
        try { rawg = await new RAWGProvider(env).search(query); }
        catch (error) { warnings.push(error instanceof Error ? error.message : "RAWG 查询失败"); }
      }
      if (source !== 'rawg') {
        try { screenscraper = await new ScreenScraperProvider(env).search(query); }
        catch (error) { warnings.push(error instanceof Error ? error.message : "ScreenScraper 查询失败"); }
      }
      const value = { results: combineCandidates(rawg, screenscraper), providers: {
        rawg: source === 'screenscraper' ? 'skipped' : rawg.length ? 'ok' : 'empty',
        screenscraper: source === 'rawg' ? 'skipped' : screenscraper.length ? 'ok' : 'empty',
      }, warnings };
      if (value.results.length || warnings.length === 0) {
        await writeMetadataCache(env, cacheKey, value);
        return Response.json({ ...value, cache: "miss" }, { headers: jsonHeaders });
      }
      if (cached) return Response.json({ ...cached.value, cache: "stale", warnings }, { headers: jsonHeaders });
      return Response.json(value, { headers: jsonHeaders });
    }
    if (url.pathname === "/ns/api/games/detail") {
      if (request.method !== "POST") return jsonError("只支持 POST 请求。", 405);
      let requestBody;
      try { requestBody = await request.json(); } catch { return jsonError("游戏资料请求格式无效。", 400); }
      const title = String(requestBody?.title || "").trim().slice(0, 160);
      const source = String(requestBody?.dataSource || 'auto').toLowerCase();
      if (!['auto', 'rawg', 'screenscraper'].includes(source)) return jsonError("数据源选项无效。", 400);
      const sources = requestBody?.sources && typeof requestBody.sources === "object" ? requestBody.sources : {};
      const rawgId = source !== 'screenscraper' ? String(sources.rawg?.id || "").slice(0, 100) : '';
      const ssId = source !== 'rawg' ? String(sources.screenscraper?.id || "").replace(/\D/g, "").slice(0, 16) : '';
      const systemId = source !== 'rawg' ? String(sources.screenscraper?.systemId || "").replace(/\D/g, "").slice(0, 16) : '';
      if (!rawgId && !ssId && !title) return jsonError("请先选择候选游戏。", 400);
      const cacheIdentity = `${source}:` + ([rawgId && `rawg:${rawgId}`, ssId && `screenscraper:${systemId}:${ssId}`].filter(Boolean).sort().join("|") || `title:${title.toLocaleLowerCase()}`);
      try {
        const outcome = await cachedMetadata(env, `game-detail:v3:${cacheIdentity}`, CACHE_DETAIL_MS, async () => {
          const errors = [];
          let result = null;
          if (rawgId) {
            try { result = await new RAWGProvider(env).getById(rawgId); }
            catch (error) { errors.push(error instanceof Error ? error.message : "RAWG 详情读取失败"); }
          }
          let ssRef = ssId ? { id: ssId, systemId } : null;
          let ssProvider = new ScreenScraperProvider(env);
          if (source === 'auto' && !ssRef && title && (!result || !result.cover || !result.description || !result.releaseDate || !result.developers?.length)) {
            try {
              const candidates = await ssProvider.search(title);
              const matched = candidates.find(candidate => result ? areSameGame(result, candidate) : candidate.title.localeCompare(title, undefined, { sensitivity: "accent" }) === 0);
              if (matched) ssRef = matched.sources.screenscraper;
            } catch (error) { errors.push(error instanceof Error ? error.message : "ScreenScraper 搜索失败"); }
          }
          const needsSupplement = !result || !result.cover || !result.description || !result.releaseDate || !result.developers?.length || !result.publishers?.length || !result.platforms?.length || !result.genres?.length;
          if (ssRef?.id && ssRef.systemId && (source !== 'auto' || needsSupplement)) {
            try {
              const supplement = await ssProvider.getById(ssRef.id, ssRef.systemId);
              result = mergeMetadata(result, supplement);
            } catch (error) { errors.push(error instanceof Error ? error.message : "ScreenScraper 详情读取失败"); }
          }
          if (!result) throw new Error(errors.join("；") || "没有可用数据源返回该游戏资料。");
          return { ...result, id: result.id || `game:${rawgId || ssId}`, title: result.localizedName || result.title || title, warnings: errors, updatedAt: new Date().toISOString() };
        }, Boolean(requestBody.refresh));
        return Response.json({ ...outcome.value, cache: outcome.stale ? "stale" : outcome.cached ? "fresh" : "miss", ...(outcome.warning ? { warning: outcome.warning } : {}) }, { headers: jsonHeaders });
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : "游戏资料暂不可用。", 502);
      }
    }
    if (url.pathname !== "/ns/api/counter") return new Response("Not found", { status: 404 });
    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT count FROM visit_counter WHERE id = 'ns'").first();
      return Response.json({ pageViews: Number(row?.count || 0) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } });

    let visitorId = "";
    try {
      const body = await request.json();
      if (typeof body?.visitorId === "string" && /^[\w-]{16,128}$/.test(body.visitorId)) visitorId = body.visitorId;
    } catch { /* A malformed visitor ID still counts as a page view. */ }

    const row = await env.DB.prepare(
      "INSERT INTO visit_counter (id, count) VALUES ('ns', 1) " +
      "ON CONFLICT(id) DO UPDATE SET count = count + 1 RETURNING count"
    ).first();
    if (visitorId) await env.DB.prepare("INSERT INTO visit_visitors (visitor_id) VALUES (?) ON CONFLICT(visitor_id) DO NOTHING").bind(visitorId).run();
    const unique = await env.DB.prepare("SELECT COUNT(*) AS count FROM visit_visitors").first();
    return Response.json({ pageViews: Number(row.count), uniqueVisitors: Number(unique?.count || 0) }, { headers: { "Cache-Control": "no-store" } });
  },
};
