
import gamePlatforms from '../../../public/sveltia/game-platforms.js';
import { ArchiveProviderError } from './archive-providers.js';
import { boundedText } from './bounded-body.js';
import { editionEvidence, releaseYear } from './game-identity.js';
import { plainReference, synopsisMaterial } from './summary-language.js';

const STEAM = 'https://store.steampowered.com';
const PSN = 'https://store.playstation.com';
const NINTENDO = 'https://www.nintendo.com';
const labels = { steam: 'Steam', psn: 'PlayStation Store', eshop: 'Nintendo eShop' };

export function parseStoreLink(value) {
  if (typeof value !== 'string' || value.length > 700) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  let kind, id, path;
  if (url.origin === STEAM) {
    const match = url.pathname.match(/^\/app\/([1-9]\d{0,11})(?:\/[^/]*)?\/?$/);
    if (match) { kind = 'steam'; id = match[1]; path = '/app/' + id + '/'; }
  } else if (url.origin === PSN) {
    const match = url.pathname.match(/^\/([a-z]{2}-[a-z]{2})\/product\/([A-Z]{2}\d{4}-[A-Z]{4}\d{5}_\d{2}-[A-Z0-9_]{16})\/?$/i)
      || url.pathname.match(/^\/product\/([A-Z]{2}\d{4}-[A-Z]{4}\d{5}_\d{2}-[A-Z0-9_]{16})\/?$/i);
    if (match) {
      id = (match[2] || match[1]).toUpperCase();
      const region = (match[2] ? match[1] : { UP: 'en-us', EP: 'en-gb', HP: 'zh-hant-hk', JP: 'ja-jp' }[id.slice(0, 2)])?.toLowerCase();
      // PlayStation also uses three-part locale identifiers such as zh-hant-hk.
      if (region) { kind = 'psn'; path = '/' + region + '/product/' + id; }
    } else {
      const localized = url.pathname.match(/^\/(zh-(?:hant|hans)-(?:hk|tw|cn|sg))\/product\/([A-Z]{2}\d{4}-[A-Z]{4}\d{5}_\d{2}-[A-Z0-9_]{16})\/?$/i);
      if (localized) { kind = 'psn'; id = localized[2].toUpperCase(); path = '/' + localized[1].toLowerCase() + '/product/' + id; }
    }
  } else if (url.origin === NINTENDO) {
    const match = url.pathname.match(/^\/(us|en-ca|fr-ca|es-mx|pt-br)\/store\/products\/([a-z0-9][a-z0-9-]{0,160})\/?$/);
    if (match) { kind = 'eshop'; id = match[1] + '/' + match[2]; path = '/' + match[1] + '/store/products/' + match[2] + '/'; }
  }
  return kind ? { kind, id, key: kind + ':' + id, url: url.origin + path, label: labels[kind] } : null;
}

export function storeFitsPlatforms(store, platforms) {
  const normalized = gamePlatforms.normalizePlatformList(platforms);
  if (!normalized.length) return true;
  if (store.kind === 'steam') return normalized.some(name => ['PC', 'Linux', 'macOS'].includes(name));
  if (store.kind === 'eshop') return normalized.some(name => /^Nintendo Switch(?: 2)?$/.test(name));
  const generations = { PPSA: 'PlayStation 5', CUSA: 'PlayStation 4', PCSA: 'PS Vita', PCSB: 'PS Vita',
    PCSE: 'PS Vita', PCSF: 'PS Vita', NPUB: 'PlayStation 3', NPEB: 'PlayStation 3' };
  const idPlatform = generations[store.id.split('-')[1].slice(0, 4)];
  // A cross-buy product can expose more platforms than its SKU; the fetched
  // page's exact platform list is checked before using any actual material.
  return normalized.some(name => gamePlatforms.platformFamily(name) === 'playstation'
    && (!idPlatform || name === idPlatform || (idPlatform === 'PlayStation 5' && name === 'PlayStation 4')));
}

function malformed(store) {
  return new ArchiveProviderError(store.label + ' 未返回该商品的有效简介。可改选数据库简介或手写。', 422);
}
async function getStoreBody(fetcher, url, limit, accept) {
  try {
    const response = await fetcher(new URL(url), { headers: { Accept: accept }, signal: AbortSignal.timeout(12000), redirect: 'manual' });
    if (!response.ok) { await response.body?.cancel(); return ''; }
    return await boundedText(response, limit);
  } catch { return ''; }
}
const htmlBody = (fetcher, url) => getStoreBody(fetcher, url, 3 * 1024 * 1024, 'text/html');

function scriptData(html, id) {
  // Match fixed first-party structured data blocks, never evaluate scripts or
  // reuse prose from related/upsell products on the same page.
  const match = html.match(new RegExp('<script\\b[^>]*\\bid=["\']' + id + '["\'][^>]*>([\\s\\S]*?)<\\/script\\s*>', 'i'));
  try { return JSON.parse(match?.[1] || 'null'); } catch { return null; }
}
function qaText(html, id, tag) {
  return html?.match(new RegExp('<' + tag + '\\b[^>]*\\bdata-qa=["\']' + id + '["\'][^>]*>([\\s\\S]*?)<\\/' + tag + '\\s*>', 'i'))?.[1] || '';
}
const names = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : typeof value === 'string' ? [value] : [];
const inputTitle = value => plainReference(value, 160).replace(/\s+/g, ' ');
const hasHanTitle = title => /\p{Script=Han}/u.test(title) && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(title);

async function steamOptions(store, fetcher) {
  const locales = ['schinese', 'tchinese', 'english'];
  return (await Promise.all(locales.map(async locale => {
    const params = new URLSearchParams({ appids: store.id, l: locale });
    const body = await getStoreBody(fetcher, STEAM + '/api/appdetails?' + params, 2 * 1024 * 1024, 'application/json');
    let data;
    try {
      const row = JSON.parse(body)?.[store.id];
      if (row?.success) data = row.data;
    } catch { /* Missing locale. */ }
    if (data?.type !== 'game' || String(data.steam_appid) !== store.id || !inputTitle(data.name)) return null;
    return {
      title: inputTitle(data.name), locale,
      releaseDate: data.release_date?.coming_soon ? '' : data.release_date?.date,
      platforms: [['windows', 'PC'], ['mac', 'macOS'], ['linux', 'Linux']].filter(([key]) => data.platforms?.[key]).map(([, name]) => name),
      developers: names(data.developers),
      short: data.short_description, long: data.about_the_game || data.detailed_description,
      url: store.url + '?l=' + locale,
    };
  }))).filter(Boolean);
}

async function psnOptions(store, fetcher) {
  const urls = [...new Set([store.url, ...(/\/[^/]+-hk\/product\//.test(store.url) ? ['zh-hans-hk', 'zh-hant-hk', 'en-hk']
    .map(locale => PSN + '/' + locale + '/product/' + store.id) : [])])];
  return (await Promise.all(urls.map(url => psnProduct(store, url, fetcher)))).filter(Boolean);
}

function psnDisplayTitle(raw) {
  let title = inputTitle(raw);
  // Region pages append a parenthetical language inventory and sometimes the
  // hardware list. Strip only recognized store badges, never edition suffixes.
  const languageList = title.match(/\s*\(([^()]*)\)$/);
  if (languageList && languageList[1].split(/[,，、]/).every(word =>
    /^(?:english|simplified chinese|traditional chinese|japanese|korean|chinese|簡體中文|简体中文|繁體中文|繁体中文|英文|英语|日文|日语|韓文|韩语)$/i.test(word.trim()))) {
    title = title.slice(0, languageList.index);
  }
  return title.replace(/\s+PS[45](?:\s*(?:&|\/|and|與|及|和)\s*PS[45])?$/i, '').trim();
}

async function psnProduct(store, url, fetcher) {
  const html = await htmlBody(fetcher, url);
  const product = scriptData(html, 'mfe-jsonld-tags');
  const page = scriptData(html, '__NEXT_DATA__')?.props?.pageProps;
  if (product?.sku !== store.id || (page?.productId && page.productId !== store.id) || !inputTitle(product.name)
    || /add[- ]?on|demo|trial|upgrade|追加內容|追加内容|試玩|试玩|体験版/i.test(product.category || '')) return null;
  const info = page?.batarangs?.info?.text;
  const prefix = 'gameInfo#releaseInformation#';
  const platformText = plainReference(qaText(info, prefix + 'platform-value', 'dd'));
  return {
    title: psnDisplayTitle(product.name), locale: /\/en-/.test(url) ? 'english' : '', releaseDate: plainReference(qaText(info, prefix + 'releaseDate-value', 'dd')),
    platforms: platformText.split(/[,，、]/).map(item => item.trim()).filter(Boolean),
    short: product.description,
    long: qaText(page?.batarangs?.overview?.text, 'mfe-game-overview#description', 'p'),
    url,
  };
}

async function nintendoOptions(store, fetcher) {
  const html = await htmlBody(fetcher, store.url);
  const data = scriptData(html, '__NEXT_DATA__');
  const slug = store.id.split('/')[1];
  if (data?.query?.slug !== slug) return [];
  const products = Object.values(data?.props?.pageProps?.initialApolloState || {}).filter(record =>
    record?.__typename === 'Product' && record.urlKey === slug && /^7\d{13}$/.test(String(record.nsuid)) && !record.isUpgrade && !record.dlcType);
  if (products.length !== 1) return [];
  const [product] = products;
  return [{
    title: inputTitle(product.name), releaseDate: product.releaseDate, developers: names(product.softwareDeveloper),
    platforms: [product.platform?.label].filter(Boolean), short: product.headline,
    long: product.description || product['description({"html":true})'], url: store.url,
  }];
}

export async function storeSynopsis(store, edition, catalogLinked, fetcher = fetch, explicitlySelected = false) {
  const options = await { steam: steamOptions, psn: psnOptions, eshop: nintendoOptions }[store.kind](store, fetcher);
  if (!options.length) throw malformed(store);
  // Prefer an independent name check in English where available; a localized
  // name can differ without being a different edition. A manually supplied
  // localized URL still requires explicit review even without comparable names.
  const basis = options.find(option => option.locale === 'english') || options[0];
  const knownDates = gamePlatforms.normalizePlatformList(basis.platforms).map(name => edition.platformReleaseDates?.[name]).filter(Boolean);
  const releaseDate = knownDates.find(date => releaseYear(date) === releaseYear(basis.releaseDate)) || knownDates[0] || edition.releaseDate;
  const catalogTitles = [edition.title, edition.originalName, ...(edition.alternativeNames || [])].filter(Boolean);
  // Catalogs sometimes append "(2023)" to same-title remakes. The suffix
  // can be an alias only if the storefront independently supplies that year.
  const matchingYear = releaseYear(releaseDate) === releaseYear(basis.releaseDate) && releaseYear(releaseDate);
  const suffix = '(' + matchingYear + ')';
  const yearAliases = matchingYear ? catalogTitles.map(name => name.endsWith(suffix) ? name.slice(0, -suffix.length).trimEnd() : name) : [];
  const evidence = editionEvidence({ ...edition, releaseDate, alternativeNames: [...catalogTitles, ...yearAliases] }, basis);
  const hasEnglishTitle = !/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(basis.title);
  const comparableTitle = [edition.title, edition.originalName, ...(edition.alternativeNames || [])].some(name => /[a-z]{3,}/i.test(name));
  const titleConflict = hasEnglishTitle && comparableTitle && evidence.title < 0;
  // An original/port year discrepancy may be accepted only when the editor
  // explicitly selects a catalog-linked item and title, hardware and developer
  // all agree. Never automatically apply even a linked conflicting release.
  const confirmedPort = explicitlySelected && catalogLinked && !knownDates.length
    && evidence.title === 1 && evidence.platform === 1 && evidence.developer === 1;
  if (evidence.platform < 0 || evidence.developer < 0 || (evidence.year < 0 && !confirmedPort)
    || (titleConflict && (!catalogLinked || evidence.year !== 1))) {
    throw new ArchiveProviderError('商店商品与已选版本的名称、年份、平台或开发商不符。请选择正确的商品或数据库来源。', 409);
  }
  const texts = options.flatMap(option => [['short', option.short], ['long', option.long]].flatMap(([kind, source]) => {
    const material = synopsisMaterial(source, kind, option.title);
    return material ? [{ ...material, url: option.url, label: store.label }] : [];
  }));
  const preference = { 'zh-Hans': 0, 'zh-und': 1, 'zh-Hant': 2, en: 3, 'zh-mixed': 4, other: 5 };
  texts.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'short' ? -1 : 1) || preference[a.language] - preference[b.language]);
  if (!texts.length) throw malformed(store);
  const title = options.find(option => option.locale === 'schinese' && hasHanTitle(option.title))?.title
    || texts.find(material => material.language === 'zh-Hans' && hasHanTitle(material.title))?.title;
  return { ...texts[0], officialTitle: title || '' };
}
