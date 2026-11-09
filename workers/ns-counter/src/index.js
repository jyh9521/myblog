import { RAWGProvider, ScreenScraperProvider, screenScraperMedia, areSameGame, combineCandidates, mergeMetadata } from "./game-providers.js";
import { DurableObject } from "cloudflare:workers";
import { hltbRoute } from './hltb.js';
import { cachedMetadata, readMetadataCache, writeMetadataCache } from './metadata-cache.js';
import { detailTheGamesDB, metadataOnly, searchDossierEditions, searchTheGamesDB, steamGridDBRoute } from './archive-routes.js';
import { dossierBriefRoute } from './dossier-brief-route.js';

// Keep the already-provisioned namespace export during the provider migration.
// The old IGDB endpoints are retired; this stub prevents a destructive DO
// deletion while allowing RAWG/ScreenScraper routes to deploy without Twitch.
export class IgdbApi extends DurableObject {
  async fetch() {
    return Response.json({ error: "IGDB API 已停用。" }, { status: 410 });
  }
}

const jsonHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function jsonError(message, status = 502) { return Response.json({ error: message }, { status, headers: jsonHeaders }); }
const CACHE_SEARCH_MS = 60 * 60 * 1000;
const CACHE_EMPTY_SEARCH_MS = 5 * 60 * 1000;
const CACHE_DETAIL_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/ns/api/games/brief') return dossierBriefRoute(request, env);
    if (url.pathname.startsWith('/ns/api/hltb/')) return hltbRoute(request, env);
    if (url.pathname === "/ns/api/games/media") return screenScraperMedia(request, env);
    if (url.pathname === '/ns/api/games/covers/search' || url.pathname === '/ns/api/games/covers') return steamGridDBRoute(request, env);
    if (url.pathname === "/ns/api/games/search") {
      if (request.method !== "GET") return jsonError("只支持 GET 请求。", 405);
      const query = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 100);
      if (query.length < 2) return jsonError("请输入至少两个字符。", 400);
      const source = (url.searchParams.get("source") || "auto").toLowerCase();
      if (source === 'identity') return searchDossierEditions(request, env, query);
      if (source === 'thegamesdb') return searchTheGamesDB(request, env, query);
      if (!['auto', 'rawg', 'screenscraper'].includes(source)) return jsonError("数据源选项无效。", 400);
      const cacheKey = `game-search:v5:${source}:${query.toLocaleLowerCase()}`;
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
      const value = { results: combineCandidates(rawg, screenscraper).map(metadataOnly), providers: {
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
      if (source === 'thegamesdb') return detailTheGamesDB(request, env, requestBody);
      if (!['auto', 'rawg', 'screenscraper'].includes(source)) return jsonError("数据源选项无效。", 400);
      const sources = requestBody?.sources && typeof requestBody.sources === "object" ? requestBody.sources : {};
      const id = value => /^[1-9]\d{0,15}$/.test(String(value ?? '')) ? String(value) : '';
      const rawgId = source !== 'screenscraper' ? id(sources.rawg?.id) : '';
      const ssId = source !== 'rawg' ? id(sources.screenscraper?.id) : '';
      const systemId = source !== 'rawg' ? id(sources.screenscraper?.systemId) : '';
      if (!rawgId && (!ssId || !systemId)) return jsonError("请先选择有明确编号及平台的候选游戏。", 400);
      const cacheIdentity = [source, rawgId, ssId, systemId].join(':');
      try {
        const outcome = await cachedMetadata(env, `game-detail:v4:${cacheIdentity}`, CACHE_DETAIL_MS, async () => {
          const errors = [];
          let result = null;
          if (rawgId) {
            try { result = await new RAWGProvider(env).getById(rawgId); }
            catch (error) { errors.push(error instanceof Error ? error.message : "RAWG 详情读取失败"); }
          }
          if (rawgId && !result) throw new Error(errors.join("；") || "无法读取所选 RAWG 游戏。");
          if (ssId && systemId) {
            try {
              const supplement = await new ScreenScraperProvider(env).getById(ssId, systemId);
              if (!result || areSameGame(result, supplement)) result = mergeMetadata(result, supplement);
              else errors.push("辅助资料未通过版本核对，已略过。");
            } catch (error) { errors.push(error instanceof Error ? error.message : "ScreenScraper 详情读取失败"); }
          }
          if (!result) throw new Error(errors.join("；") || "没有可用数据源返回该游戏资料。");
          return { ...metadataOnly(result), id: result.id || `game:${rawgId || ssId}`, title: result.localizedName || result.title || title, warnings: errors, updatedAt: new Date().toISOString() };
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
