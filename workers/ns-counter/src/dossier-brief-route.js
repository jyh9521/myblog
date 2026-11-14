import { ArchiveProviderError, TheGamesDBProvider, externalId } from './archive-providers.js';
import { archiveJson, withArchiveAdmin } from './archive-routes.js';
import { BodyTooLarge, boundedText } from './bounded-body.js';
import { RAWGProvider, ScreenScraperProvider } from './game-providers.js';
import { developerKey } from './game-identity.js';
import { geminiDraft } from './gemini-game-summary.js';
import { charCount, plainReference, synopsisMaterial } from './summary-language.js';

const MAX_REFERENCE_CHARS = 12000;
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

function checkedMaterial(raw, kind, title) {
  const material = synopsisMaterial(raw, kind, title);
  if (material && charCount(material.text) > MAX_REFERENCE_CHARS) {
    throw new ArchiveProviderError('原文过长，请分段翻译。', 413);
  }
  return material;
}

async function readSource(edition, env, fetcher) {
  const catalog = await loadEdition(edition, env, fetcher);
  const identity = { title: catalog.title, releaseDate: catalog.releaseDate, platforms: catalog.platforms, developers: catalog.developers };
  const material = checkedMaterial(catalog.description, 'overview', catalog.title);
  return { identity, edition, material: material && {
    ...material, url: catalog.sources[edition.provider]?.url, label: LABEL[edition.provider],
  } };
}

const titleKey = title => (title || '').normalize('NFKC').toLowerCase()
  .replace(/[™®©]/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');

function sameRelease(a, b) {
  const title = titleKey(a.title);
  return Boolean(title && title === titleKey(b.title) && a.releaseDate && a.releaseDate === b.releaseDate &&
    a.platforms?.length === 1 && b.platforms?.length === 1 && a.platforms[0] === b.platforms[0] &&
    a.developers?.map(developerKey).some(key => key && b.developers?.map(developerKey).includes(key)));
}

async function readDraftSource(edition, alternateIds, env, fetcher) {
  const primary = await readSource(edition, env, fetcher);
  if (primary.material || edition.provider !== 'thegamesdb' || !Array.isArray(alternateIds)) return primary;
  const ids = [...new Set(alternateIds.slice(0, 5).map(externalId))].filter(id => id && id !== edition.id);
  let upstreamError;
  for (const id of ids) {
    try {
      const alternative = await readSource({ provider: edition.provider, id }, env, fetcher);
      if (alternative.material && sameRelease(primary.identity, alternative.identity)) return alternative;
    } catch (error) {
      if (!(error instanceof ArchiveProviderError) || error.status >= 500) upstreamError ||= error;
    }
  }
  if (upstreamError) throw upstreamError;
  return primary;
}

export function dossierBriefRoute(request, env, fetcher = fetch) {
  if (request.method !== 'POST') return archiveJson({ error: '只支持 POST 请求。' }, 405, { Allow: 'POST' });
  return withArchiveAdmin(request, env, async () => {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return archiveJson({ error: '简介请求需要 JSON。' }, 415);
    let input;
    try { input = JSON.parse(await boundedText(request, 64 * 1024)); }
    catch (error) { return archiveJson({ error: '简介请求格式不正确或超过长度限制。' }, error instanceof BodyTooLarge ? 413 : 400); }
    if (!['source', 'draft'].includes(input?.action)) return archiveJson({ error: '简介请求无效。' }, 400);
    if (input.storeUrl) return archiveJson({ error: '简介工具已改用档案或资料库原文，请刷新后台。' }, 400);
    const edition = ref(input.edition);
    if (input.action === 'source') {
      if (!edition) return archiveJson({ error: '请先确认资料库中的游戏版本。' }, 400);
      return archiveJson(await readSource(edition, env, fetcher));
    }

    // Text from the open entry needs no upstream identity lookup. Only a
    // missing excerpt can trigger a lookup, and only by the confirmed ID.
    const hasText = typeof input.text === 'string' && input.text.trim();
    if (!hasText && !edition) return archiveJson({ error: '请先填写简介，或确认资料库中的游戏版本。' }, 400);
    const fetched = !hasText ? await readDraftSource(edition, input.alternateIds, env, fetcher) : null;
    const material = fetched ? fetched.material : checkedMaterial(input.text, 'archive', '');
    if (!material) return archiveJson({ error: '这份资料没有可翻译的简介正文。' }, 422);
    const source = fetched && material.url ? {
      url: material.url, label: material.label, language: material.language, kind: material.kind,
      edition: [fetched.edition.provider, fetched.edition.id, fetched.edition.systemId || ''].join(':'),
    } : null;
    const reference = { originalLanguage: material.language, ...(source ? { source } : {}) };
    if (material.mode === 'manual') {
      return archiveJson({ text: material.text, mode: 'manual', language: material.language, ...reference });
    }
    const title = value => plainReference(value, 160).replace(/\s+/g, ' ');
    const legacyTitle = title(input.gameTitle);
    const englishTitle = [title(input.englishTitle), legacyTitle, title(material.title)]
      .find(name => /[a-z]/i.test(name) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(name)) || '';
    const preferredChineseTitle = title(input.preferredChineseTitle) ||
      (/\p{Script=Han}/u.test(legacyTitle) ? legacyTitle : title(input.officialTitle));
    return archiveJson({ ...await geminiDraft(env, material, { englishTitle, preferredChineseTitle }, fetcher), ...reference });
  });
}
