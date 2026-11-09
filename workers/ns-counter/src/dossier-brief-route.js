
import { ArchiveProviderError, TheGamesDBProvider, externalId } from './archive-providers.js';
import { archiveJson, withArchiveAdmin } from './archive-routes.js';
import { BodyTooLarge, boundedText } from './bounded-body.js';
import { editionEvidence } from './game-identity.js';
import { RAWGProvider, ScreenScraperProvider } from './game-providers.js';
import { parseStoreLink, storeFitsPlatforms, storeSynopsis } from './game-store-summaries.js';
import { geminiDraft } from './gemini-game-summary.js';
import { cachedMetadata } from './metadata-cache.js';
import { plainReference, synopsisMaterial } from './summary-language.js';

const ref = value => {
  const provider = value?.provider, id = externalId(value?.id), systemId = externalId(value?.systemId);
  if (!id || !['rawg', 'thegamesdb', 'screenscraper'].includes(provider) || (provider === 'screenscraper' && !systemId)) return null;
  return { provider, id, ...(provider === 'screenscraper' ? { systemId } : {}) };
};
const LABEL = { rawg: 'RAWG', thegamesdb: 'TheGamesDB', screenscraper: 'ScreenScraper' };

async function loadEdition(edition, env, fetcher) {
  try {
    if (edition.provider === 'rawg') return await new RAWGProvider(env, fetcher).getCoreById(edition.id);
    if (edition.provider === 'thegamesdb') return await new TheGamesDBProvider(env, fetcher).getById(edition.id);
    return await new ScreenScraperProvider(env, fetcher).getById(edition.id, edition.systemId);
  } catch (error) {
    if (error instanceof ArchiveProviderError) throw error;
    throw new ArchiveProviderError(LABEL[edition.provider] + ' 未能按已确认的编号读取资料。', 502);
  }
}

async function linkedStores(edition, catalog, env, fetcher) {
  if (!env.RAWG_API_KEY) return { stores: [], warning: '' };
  const rawg = new RAWGProvider(env, fetcher);
  const key = ['brief:store-ids:v2', edition.provider, edition.id, edition.systemId || ''].join(':');
  try {
    const outcome = await cachedMetadata(env, key, 60 * 60 * 1000, async () => {
      let rawgId = edition.provider === 'rawg' ? edition.id : '';
      if (!rawgId) {
        const query = catalog.originalName || catalog.title;
        const results = await rawg.search(query);
        const candidates = results.filter(candidate => editionEvidence(catalog, candidate).strong);
        // A name match, one corroborating field, or multiple plausible
        // candidates cannot associate the catalog record with a store ID.
        if (candidates.length !== 1) return [];
        const id = candidates[0].sources.rawg.id;
        const details = await rawg.getCoreById(id);
        if (!editionEvidence(catalog, details).strong) return [];
        rawgId = id;
      }
      const stores = (await rawg.storeUrls(rawgId)).map(parseStoreLink)
        .filter(store => store && storeFitsPlatforms(store, catalog.platforms));
      return [...new Map(stores.map(store => [store.key, { ...store, linkedBy: 'RAWG #' + rawgId }])).values()];
    });
    return { stores: outcome.value, warning: outcome.stale ? '商店商品暂用已核对的缓存。' : '' };
  } catch { return { stores: [], warning: '商店目录暂不可用；可手动核对商品链接或选数据库简介。' }; }
}

async function readSource(input, edition, env, fetcher) {
  const store = input.storeUrl ? parseStoreLink(input.storeUrl) : null;
  if (input.storeUrl && !store) return archiveJson({ error: '请填写支持的 Steam、PlayStation Store 或 Nintendo eShop 商品链接，不要填写商店首页。' }, 400);
  const catalog = await loadEdition(edition, env, fetcher);
  const identity = { title: catalog.title, releaseDate: catalog.releaseDate, platforms: catalog.platforms, developers: catalog.developers };
  const linked = await linkedStores(edition, catalog, env, fetcher);
  const { stores } = linked;
  let warning = linked.warning, material, selectedStoreUrl = '';
  // Exactly one catalog-linked product can be preselected. Multiple links can
  // represent different ports/regions; let the editor pick one.
  if (!store && input.autoStore === true && stores.length === 1) {
    try {
      material = await storeSynopsis(stores[0], catalog, true, fetcher);
      selectedStoreUrl = stores[0].url;
    } catch (error) {
      warning = error instanceof ArchiveProviderError ? error.message : '商品简介暂不可用。';
    }
  } else if (!store && input.autoStore === true && stores.length > 1) {
    warning = '有多个商店商品。请核对平台或商品编号后选择。';
  }
  if (store) {
    if (!storeFitsPlatforms(store, catalog.platforms)) return archiveJson({ error: '该商店不对应已选游戏版本的平台。' }, 409);
    const catalogLinked = stores.some(candidate => candidate.key === store.key);
    if (!catalogLinked && input.confirmed !== true) return archiveJson({ error: '没有相同的商品编号。请先对照年份、平台和开发商，再明确确认此链接。' }, 409);
    material = await storeSynopsis(store, catalog, catalogLinked, fetcher, true);
    selectedStoreUrl = store.url;
  } else if (!material) {
    const source = synopsisMaterial(catalog.description, 'long', catalog.title);
    material = source ? { ...source, url: catalog.sources[edition.provider].url, label: LABEL[edition.provider], officialTitle: '' } : null;
    // These providers expose an overview, not a short field. A brief overview
    // can still be translated directly; longer ones get an original summary.
    if (material && [...material.text].length <= (material.language.startsWith('zh-') ? 250 : 850)) {
      material = { ...material, ...synopsisMaterial(material.text, 'short', catalog.title), kind: 'overview' };
    }
  }
  return archiveJson({ identity, edition, material, stores, selectedStoreUrl, warning });
}

export function dossierBriefRoute(request, env, fetcher = fetch) {
  if (request.method !== 'POST') return archiveJson({ error: '只支持 POST 请求。' }, 405, { Allow: 'POST' });
  return withArchiveAdmin(request, env, async () => {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return archiveJson({ error: '简介请求需要 JSON。' }, 415);
    let input;
    try { input = JSON.parse(await boundedText(request, 32 * 1024)); }
    catch (error) { return archiveJson({ error: '简介请求格式不正确或超过长度限制。' }, error instanceof BodyTooLarge ? 413 : 400); }
    const edition = ref(input?.edition);
    if (!edition) return archiveJson({ error: '请先选择并确认数据库中的游戏版本。' }, 400);
    if (input.action === 'source') return readSource(input, edition, env, fetcher);
    if (input.action !== 'draft' || !['short', 'long', 'overview'].includes(input.kind)) {
      return archiveJson({ error: '简介草稿请求无效。' }, 400);
    }
    const material = synopsisMaterial(input.text, input.kind === 'overview' ? 'short' : input.kind);
    if (!material) return archiveJson({ error: '来源缺少足够的简介正文。' }, 422);
    if (material.mode === 'manual' && input.rewrite !== true) {
      return archiveJson({ mode: 'manual', language: material.language });
    }
    const mode = material.mode === 'manual' ? 'rewrite' : material.mode;
    const gameTitle = plainReference(input.gameTitle, 160).replace(/\s+/g, ' ');
    const officialTitle = plainReference(input.officialTitle, 160).replace(/\s+/g, ' ');
    return archiveJson(await geminiDraft(env, material, { mode, gameTitle, officialTitle }, fetcher));
  });
}
