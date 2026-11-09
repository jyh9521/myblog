
import test from 'node:test';
import assert from 'node:assert/strict';
import { editionEvidence, rankEditions } from './game-identity.js';
import { combineCandidates, RAWGProvider } from './game-providers.js';
import { searchDossierEditions } from './archive-routes.js';
import { dossierBriefRoute } from './dossier-brief-route.js';
import { parseStoreLink, storeSynopsis } from './game-store-summaries.js';
import { detectSynopsisLanguage, plainReference, synopsisMaterial } from './summary-language.js';
import { GAME_TRANSLATION_PROMPT } from './gemini-game-summary.js';

const root = 'https://blog.example/ns/api/games';
const headers = { 'Content-Type': 'application/json', 'X-Gaming-Admin': '1',
  'Sec-Fetch-Site': 'same-origin', Cookie: '__Host-gaming_admin=fixture; other=never-forward' };
const rawRef = { provider: 'rawg', id: '5' };
const shortEn = 'The player follows the traces of a vanished crew and rebuilds a ship with the help of the island residents.';
const shortZh = '这是一款探索游戏。你将扮演一名修理师，在岛上寻找线索，修复沉没船只留下的机械零件，并帮助居民恢复港口。';
const shortTw = '這是一款冒險遊戲。玩家透過線索探索島嶼，修復損壞的船隻，並與居民攜手重建港口。';
const approved = '在《港湾手记》中，玩家循着失踪船员留下的线索走访岛上的居民。为了让船只重新起航，他们需要收集散落的零件，在居民协助下修理船体。叙事围绕寻找船员和恢复船只展开，两条线索随调查和修缮逐步交汇。';
const steam = 'https://store.steampowered.com/app/123/';
const psn = 'https://store.playstation.com/en-us/product/UP0102-PPSA07411_00-RE4RMAINGAME0000';
const eshop = 'https://www.nintendo.com/us/store/products/harbor-switch/';
const raw = { id: 5, name: 'Harbor', released: '2023-01-03', developers: [{ name: 'Studio' }],
  platforms: ['PC', 'PS5', 'Nintendo Switch'].map(name => ({ platform: { name } })), description_raw: shortEn };
const game = { id: 'fixture', title: 'Harbor', releaseDate: '2023-01-03', developers: ['Studio'], platforms: ['PC', 'PlayStation 5', 'Nintendo Switch'] };

function environment() {
  const writes = new Map();
  const env = { RAWG_API_KEY: 'rawg-test', THEGAMESDB_API_KEY: 'tg-test', GEMINI_API_KEY: 'gemini-test',
    GAME_ADMIN: { async fetch(request) {
      assert.equal(request.headers.get('Cookie'), '__Host-gaming_admin=fixture');
      assert.equal(request.headers.get('Authorization'), null);
      return new Response('');
    } },
    DB: { prepare() { return { bind(key, payload, cachedAt) { return {
      first: async () => writes.get(key), run: async () => { writes.set(key, { payload, cached_at: cachedAt }); },
    }; } }; } },
  };
  return { env, writes };
}
const post = (body, extra = {}) => new Request(root + '/brief', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
const steamData = (id, short, details = {}) => ({ [id]: { success: true, data: {
  steam_appid: Number(id), type: 'game', name: 'Harbor', short_description: short,
  developers: ['Studio'], platforms: { windows: true }, release_date: { date: '3 Jan, 2023' }, ...details,
} } });
const psnHtml = (id, short, long, name = 'Harbor') => '<script id="mfe-jsonld-tags" type="application/ld+json">'
  + JSON.stringify({ name, sku: id, description: short, category: 'Full Game' }) + '</script>'
  + '<script id="__NEXT_DATA__">' + JSON.stringify({ props: { pageProps: { productId: id, batarangs: {
    overview: { text: '<p data-qa="mfe-game-overview#description">' + long + '</p>' },
    info: { text: '<dd data-qa="gameInfo#releaseInformation#platform-value">PS5</dd><dd data-qa="gameInfo#releaseInformation#releaseDate-value">1/3/2023</dd>' },
  } } } }) + '</script>';
const nintendoHtml = (products, slug = 'harbor-switch') => '<script id="__NEXT_DATA__">' + JSON.stringify({
  query: { slug }, props: { pageProps: { initialApolloState: products } },
}) + '</script>';
const nintendoProduct = { __typename: 'Product', urlKey: 'harbor-switch', nsuid: '70010000001234',
  name: 'Harbor', headline: shortEn, releaseDate: '2023-01-03', softwareDeveloper: 'Studio', platform: { label: 'Nintendo Switch' } };

test('edition evidence rejects name-only, year, developer and platform mismatches and retains edition suffixes', () => {
  assert.equal(editionEvidence({ title: 'Harbor' }, game).strong, false);
  assert.equal(editionEvidence({ title: 'Harbor', releaseDate: '2023-01-03', platforms: ['PC Windows'] }, game).strong, true);
  for (const reference of [
    { title: 'Harbor', releaseDate: '2002', platforms: ['PC'] },
    { title: 'Harbor', releaseDate: '2023', platforms: ['PS2'], developers: ['Studio'] },
    { title: 'Harbor', releaseDate: '2023', platforms: ['PC'], developers: ['Another studio'] },
    { title: 'Harbor (Remastered)', releaseDate: '2023', platforms: ['PC'], developers: ['Studio'] },
  ]) assert.equal(editionEvidence(reference, game).strong, false);
});

test('ties and unresolved candidates require editorial selection and never merge distinct systems', () => {
  const titles = [game, { ...game, id: 'tie' }, { ...game, id: 'old', releaseDate: '2004-06-30' }];
  assert.deepEqual(rankEditions(titles, game).map(item => item.match.confidence), ['review', 'review', 'conflict']);
  assert.equal(rankEditions([titles[0], titles[2]], game)[0].match.confidence, 'high');
  assert.equal(combineCandidates([game], titles.slice(0, 2)).length, 3);
});

test('dossier search ranks fresh hints outside the cache; facts do not include upstream prose', async () => {
  const { env, writes } = environment();
  let queries = 0;
  const fetcher = async url => {
    queries++;
    if (url.hostname === 'api.rawg.io') return Response.json({ results: [raw, { ...raw, id: 6, released: '2004-06-30' }] });
    return Response.json({ code: 200, data: { games: [] } });
  };
  const call = year => searchDossierEditions(new Request(root + '/search?year=' + year + '&platform=PC', { headers }), env, 'Harbor', fetcher);
  let result = await (await call(2023)).json();
  assert.equal(result.results[0].id, 'rawg:5');
  assert.equal(result.results[0].match.confidence, 'high');
  assert.equal(result.results[1].match.confidence, 'conflict');
  result = await (await call(2004)).json();
  assert.equal(result.results[0].id, 'rawg:6');
  assert.equal(queries, 2);
  assert.ok([...writes.values()].every(row => !row.payload.includes(shortEn)));
});

test('RAWG direct lookup rejects a different returned game ID', async () => {
  const { env } = environment();
  const api = new RAWGProvider(env, async () => Response.json({ ...raw, id: 11 }));
  await assert.rejects(api.getCoreById('5'), /不同的游戏编号/);
});

test('actual script and regional wording distinguish Hans, Hant, mixed, English and unknown', () => {
  assert.equal(detectSynopsisLanguage(shortZh), 'zh-Hans');
  assert.equal(detectSynopsisLanguage(shortTw), 'zh-Hant');
  assert.equal(detectSynopsisLanguage(shortEn), 'en');
  assert.equal(detectSynopsisLanguage('故事在山谷中展开。玩家透過線索重建城堡，选择不同的武器与路线。'), 'zh-mixed');
  assert.equal(detectSynopsisLanguage('玩家在山谷中探索古堡。'), 'zh-und');
  assert.equal(detectSynopsisLanguage('かつて沈んだ船を探しに行く。'), 'other');
  assert.equal(plainReference('<script>not a synopsis</script><p>重&#x5efa;&nbsp;港口</p><p>循线索</p>'), '重建 港口\n\n循线索');
});

test('source rejects unauthenticated or malformed requests without external calls', async () => {
  const { env } = environment();
  const never = () => assert.fail('request must not contact an external host');
  const valid = { action: 'source', edition: rawRef };
  assert.equal((await dossierBriefRoute(post(valid, { Cookie: '' }), env, never)).status, 401);
  assert.equal((await dossierBriefRoute(post(valid, { Origin: 'https://cross-site.example' }), env, never)).status, 403);
  assert.equal((await dossierBriefRoute(post({ action: 'source', title: 'Harbor' }), env, never)).status, 400);
  assert.equal((await dossierBriefRoute(post({ ...valid, storeUrl: 'https://store.steampowered.com.evil.test/app/123/' }), env, never)).status, 400);
  assert.equal((await dossierBriefRoute(post({ ...valid, text: 'a'.repeat(33000) }), env, never)).status, 413);
  assert.equal((await dossierBriefRoute(new Request(root + '/brief'), env, never)).status, 405);
});

test('exact catalog-linked Steam product reads actual language, prioritizes short text, and never caches it', async () => {
  const { env, writes } = environment();
  const calls = [];
  const fetcher = async url => {
    calls.push(url.hostname + url.pathname);
    if (url.pathname === '/api/games/5') return Response.json(raw);
    if (url.pathname === '/api/games/5/stores') return Response.json({ results: [{ url: steam + '?tracking=foo' }] });
    assert.equal(url.pathname, '/api/appdetails');
    assert.equal(url.searchParams.get('appids'), '123');
    const locale = url.searchParams.get('l');
    return Response.json(steamData('123', locale === 'tchinese' ? shortTw : shortEn, { about_the_game: shortZh.repeat(6) }));
  };
  const response = await dossierBriefRoute(post({ action: 'source', edition: rawRef, autoStore: true }), env, fetcher);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.selectedStoreUrl, steam);
  assert.equal(result.material.language, 'zh-Hant');
  assert.equal(result.material.kind, 'short');
  assert.equal(result.material.mode, 'translate');
  assert.equal(calls.length, 5);
  assert.ok([...writes.values()].every(row => !row.payload.includes(shortTw) && !row.payload.includes('tracking')));
});

test('multiple catalog links do not auto-select; unlinked links require confirmation', async () => {
  const { env } = environment();
  const fetched = [];
  const fetcher = async url => {
    fetched.push(url.href);
    if (url.pathname === '/api/games/5') return Response.json(raw);
    if (url.pathname.endsWith('/stores')) return Response.json({ results: [{ url: steam }, { url: eshop }] });
    assert.fail('ambiguous selection must not contact a store');
  };
  const body = { action: 'source', edition: rawRef };
  const response = await dossierBriefRoute(post({ ...body, autoStore: true }), env, fetcher);
  const data = await response.json();
  assert.equal(data.stores.length, 2);
  assert.equal(data.selectedStoreUrl, '');
  assert.equal(data.material.label, 'RAWG');
  assert.equal((await dossierBriefRoute(post({ ...body, storeUrl: psn }), env, fetcher)).status, 409);
  assert.ok(fetched.every(url => url.startsWith('https://api.rawg.io/')));
});

test('store products must match identifiers and edition evidence, not promotional text or display names alone', async () => {
  const response = (data, details) => async () => Response.json(steamData('123', data, details));
  const store = parseStoreLink(steam);
  await assert.rejects(storeSynopsis(store, game, false, response(shortEn, { steam_appid: 999 })), /未返回/);
  await assert.rejects(storeSynopsis(store, game, false, response(shortEn, { type: 'dlc' })), /未返回/);
  await assert.rejects(storeSynopsis(store, game, false, response(shortEn, { release_date: { date: '2004' } })), /版本/);
  await assert.rejects(storeSynopsis(store, game, false, response(shortEn, { developers: ['Other'] })), /版本/);
  await assert.rejects(storeSynopsis(store, game, true, response(shortEn, { release_date: { date: '2004' } })), /版本/);
  const port = { ...game, platformReleaseDates: { PC: '2024-01-03' } };
  assert.equal((await storeSynopsis(store, port, true, response(shortEn, { release_date: { date: '2024' } }))).language, 'en');
  assert.equal(parseStoreLink('https://store.playstation.com/en-us/concept/10000000'), null);
  assert.equal(parseStoreLink('https://store.steampowered.com/bundle/123/'), null);
  assert.equal(parseStoreLink('https://auth@store.steampowered.com/app/123/'), null);
});

test('PlayStation and Nintendo product parsing is bound to the selected SKU and ignores upsells', async () => {
  const store = parseStoreLink(psn);
  const long = shortEn.repeat(8);
  const material = await storeSynopsis(store, game, false, async () => new Response(psnHtml(store.id, '', long, 'Harbor PS4 & PS5 (English, Japanese, Traditional Chinese)')));
  assert.equal(material.kind, 'long');
  assert.equal(material.mode, 'summarize');
  await assert.rejects(storeSynopsis(store, game, false, async () => new Response(psnHtml('other-sku', shortEn, long))), /未返回/);
  const nintendo = parseStoreLink(eshop);
  const good = nintendoHtml({ chosen: nintendoProduct, upsell: { ...nintendoProduct, urlKey: 'harbor-upgrade', headline: 'wrong product' } });
  assert.equal((await storeSynopsis(nintendo, game, false, async () => new Response(good))).kind, 'short');
  await assert.rejects(storeSynopsis(nintendo, game, false, async () => new Response(nintendoHtml({ chosen: { ...nintendoProduct, isUpgrade: true } }))), /未返回/);
  await assert.rejects(storeSynopsis(nintendo, game, false, async () => new Response(nintendoHtml({ chosen: nintendoProduct }, 'other'))), /未返回/);
});

test('a suitable Simplified Chinese reference skips AI by default; Gemini uses the editor prompt on actual translation', async () => {
  const { env, writes } = environment();
  const base = { action: 'draft', edition: rawRef, kind: 'short' };
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    assert.equal(url.search, '');
    assert.equal(options.headers['x-goog-api-key'], env.GEMINI_API_KEY);
    assert.equal(options.redirect, 'manual');
    const payload = JSON.parse(options.body);
    assert.ok(payload.system_instruction.parts[0].text.startsWith(GAME_TRANSLATION_PROMPT));
    assert.ok(payload.system_instruction.parts[0].text.includes('不添加原文不存在的剧情'));
    assert.equal(JSON.parse(payload.contents[0].parts[0].text).originalText, shortTw);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'not public' }, { text: approved }] } }] });
  };
  assert.deepEqual(await (await dossierBriefRoute(post({ ...base, text: shortZh }), env, fetcher)).json(), { mode: 'manual', language: 'zh-Hans' });
  assert.equal(calls, 0);
  const result = await (await dossierBriefRoute(post({ ...base, text: shortTw }), env, fetcher)).json();
  assert.equal(result.mode, 'translate');
  assert.equal(result.language, 'zh-Hans');
  assert.equal(result.text, approved);
  assert.equal(calls, 1);
  assert.equal(writes.size, 0);
});

const multiParagraphEn = [
  'The harbor has gone quiet after a storm, and the lighthouse keeper sets out to find the missing supply ship.',
  'You cross the breakwater, inspect the lighthouse, and retrace the crew’s last route through a chain of small islands.',
  'At each stop, you collect parts and talk to people who saw the ship before it disappeared.',
  'As the weather changes, old routes close and new paths appear along the coast. Maps and weather reports help you decide where to go next.',
  'With the tools you find, you repair boats, raise sunken equipment, and return supplies to the villages that sheltered the crew.',
  'Some conversations offer conflicting leads, so you compare clues before choosing which route to investigate.',
  'By the time the lighthouse shines again, you know what happened to the ship.',
].join('\n\n');

const geminiResponse = (text, finishReason = 'STOP') =>
  Response.json({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });

test('translation budget uses actual words and characters while preserving short references', () => {
  const manyWords = 'The crew goes to the bay. '.repeat(17).trim();
  const manyCharacters = 'Discover isolated communities, reconstruct forgotten navigational equipment, and investigate the consequences of an unexplained catastrophe. '.repeat(6).trim();
  assert.ok(manyWords.length < 650);
  assert.ok(manyCharacters.split(/\s+/).length <= 100);
  assert.equal(synopsisMaterial(manyWords, 'overview').mode, 'summarize');
  assert.equal(synopsisMaterial(manyCharacters, 'short').mode, 'summarize');
  assert.equal(synopsisMaterial(shortEn, 'overview').mode, 'translate');
  assert.equal(synopsisMaterial(shortZh, 'overview').mode, 'manual');
  assert.equal(synopsisMaterial(shortZh.repeat(5), 'overview').mode, 'summarize');
});

test('long database overview uses summary mode at both the source and draft endpoints', async () => {
  const { env, writes } = environment();
  delete env.RAWG_API_KEY;
  const edition = { provider: 'thegamesdb', id: '5' };
  const request = post({ action: 'source', edition, autoStore: true });
  assert.ok(multiParagraphEn.length > 650 && multiParagraphEn.length < 850);
  const response = await dossierBriefRoute(request, env, async url => {
    assert.equal(url.pathname, '/v1/Games/ByGameID');
    assert.equal(url.searchParams.get('id'), '5');
    return Response.json({ code: 200, data: { games: [{ id: 5, game_title: 'Harbor', overview: multiParagraphEn }] } });
  });
  assert.equal(response.status, 200);
  const { material } = await response.json();
  assert.equal(material.kind, 'overview');
  assert.equal(material.language, 'en');
  assert.equal(material.mode, 'summarize');

  const reply = await dossierBriefRoute(post({ action: 'draft', edition, kind: material.kind, text: material.text }),
    env, async (url, options) => {
      assert.equal(url.hostname, 'generativelanguage.googleapis.com');
      const request = JSON.parse(options.body);
      assert.match(request.system_instruction.parts[0].text, /不是逐句翻译/);
      assert.equal(JSON.parse(request.contents[0].parts[0].text).originalText, multiParagraphEn);
      return geminiResponse(approved);
    });
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).mode, 'summarize');
  assert.equal(writes.size, 0);
});

test('valid Simplified Chinese drafts over 250 characters reach editorial review intact', async () => {
  const { env, writes } = environment();
  const body = { action: 'draft', edition: rawRef, kind: 'overview', text: multiParagraphEn };
  const longDraft = approved + '灯塔沉寂之后，主角从防波堤出发，沿着补给船的最后航线逐一走访沿岸聚落。天气变化会封闭原有路线，也会露出通往新地点的水道。调查时还要核对互相矛盾的目击记录，判断下一步应去哪里。收集到的工具可以用来打捞沉没的设备，也能用来修复渡船。恢复照明后，调查者逐步厘清失踪事件的来龙去脉，同时将物资送还给曾收留船员的村民。航行期间，地图和天气报告也会提供参考，帮助玩家决定应先去哪里调查。';
  assert.ok([...longDraft].length > 250);
  const requests = [];
  const response = await dossierBriefRoute(post(body), env, async (url, options) => {
    requests.push(JSON.parse(options.body));
    return geminiResponse(longDraft);
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, longDraft);
  assert.equal(requests.length, 1);
  const prompt = requests[0].system_instruction.parts[0].text;
  assert.match(prompt, /100–250 字为参考/);
  assert.match(prompt, /可适当超出/);
  assert.equal(writes.size, 0);
});

test('Gemini retries one complete draft that fails the language check', async () => {
  const { env, writes } = environment();
  const body = { action: 'draft', edition: rawRef, kind: 'short', text: shortEn };
  const requests = [];
  const response = await dossierBriefRoute(post(body), env, async (url, options) => {
    requests.push(JSON.parse(options.body));
    return geminiResponse(requests.length === 1 ? shortTw : approved);
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.text, approved);
  assert.equal(result.mode, 'translate');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].contents, requests[1].contents);
  assert.match(requests[1].system_instruction.parts[0].text, /正文必须用简体字/);
  assert.equal(writes.size, 0);
});

test('Gemini blocked, interrupted and quota responses do not trigger another request', async () => {
  const { env } = environment();
  const body = { action: 'draft', edition: rawRef, kind: 'short', text: shortEn };
  for (const [upstream, status, reason] of [
    [() => geminiResponse('', 'SAFETY'), 502, /内容过滤/],
    [() => geminiResponse(approved, 'MAX_TOKENS'), 502, /输出截断/],
    [() => Response.json({ error: 'private upstream message' }, { status: 429 }), 429, /额度/],
  ]) {
    let calls = 0;
    const response = await dossierBriefRoute(post(body), env, async () => { calls++; return upstream(); });
    assert.equal(response.status, status);
    const result = await response.json();
    assert.match(result.error, reason);
    assert.equal(result.text, undefined);
    assert.equal(calls, 1);
  }
});

test('Gemini errors and persistently invalid output never return draft text', async () => {
  const { env } = environment();
  const body = { action: 'draft', edition: rawRef, kind: 'short', text: shortEn };
  const never = () => assert.fail('missing key must not call Gemini');
  assert.equal((await dossierBriefRoute(post(body), { ...env, GEMINI_API_KEY: '' }, never)).status, 503);
  const rate = await dossierBriefRoute(post(body), env, async () => Response.json({ error: 'gemini-test' }, { status: 429 }));
  assert.equal(rate.status, 429);
  assert.doesNotMatch(JSON.stringify(await rate.json()), /gemini-test/);
  for (const text of [shortEn, shortTw, '[网页](https://test.invalid) ' + shortZh]) {
    const response = await dossierBriefRoute(post(body), env,
      async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).text, undefined);
  }
});

test('Steam and catalog credits match legal suffix variants without merging different studios', async () => {
  const release = { ...game, developers: ['Valve Corporation'] };
  const store = parseStoreLink(steam);
  const steamCredit = developers => async () => Response.json(steamData('123', shortEn, { developers }));
  assert.equal(editionEvidence(release, { ...game, developers: ['Valve'] }).developer, 1);
  assert.equal(editionEvidence({ ...game, developers: ['Capcom Co., Ltd.'] }, { ...game, developers: ['Capcom'] }).developer, 1);
  assert.equal((await storeSynopsis(store, release, false, steamCredit(['Valve']))).language, 'en');
  await assert.rejects(storeSynopsis(store, release, false, steamCredit(['Valve South'])), /版本/);
});
