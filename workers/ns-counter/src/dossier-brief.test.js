
import test from 'node:test';
import assert from 'node:assert/strict';
import { editionEvidence, rankEditions } from './game-identity.js';
import { combineCandidates, RAWGProvider } from './game-providers.js';
import { searchDossierEditions } from './archive-routes.js';
import { dossierBriefRoute } from './dossier-brief-route.js';
import { detectSynopsisLanguage, plainReference } from './summary-language.js';
import { GAME_TRANSLATION_PROMPT } from './gemini-game-summary.js';

const root = 'https://blog.example/ns/api/games';
const headers = { 'Content-Type': 'application/json', 'X-Gaming-Admin': '1',
  'Sec-Fetch-Site': 'same-origin', Cookie: '__Host-gaming_admin=fixture; other=never-forward' };
const rawRef = { provider: 'rawg', id: '5' };
const shortEn = 'The player follows the traces of a vanished crew and rebuilds a ship with the help of the island residents.';
const shortZh = '这是一款探索游戏。你将扮演一名修理师，在岛上寻找线索，修复沉没船只留下的机械零件，并帮助居民恢复港口。';
const shortTw = '這是一款冒險遊戲。玩家透過線索探索島嶼，修復損壞的船隻，並與居民攜手重建港口。';
const approved = '在《港湾手记》中，玩家循着失踪船员留下的线索走访岛上的居民。为了让船只重新起航，他们需要收集散落的零件，在居民协助下修理船体。叙事围绕寻找船员和恢复船只展开，两条线索随调查和修缮逐步交汇。';
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
  assert.equal((await dossierBriefRoute(post({ ...valid, text: 'a'.repeat(66000) }), env, never)).status, 413);
  assert.equal((await dossierBriefRoute(new Request(root + '/brief'), env, never)).status, 405);
});

test('an exact database ID reads only that database, even if an older tab asks for automatic stores', async () => {
  const { env, writes } = environment();
  const calls = [];
  const fetcher = async url => {
    calls.push(url.hostname + url.pathname);
    assert.equal(url.hostname, 'api.rawg.io');
    assert.equal(url.pathname, '/api/games/5');
    return Response.json(raw);
  };
  const response = await dossierBriefRoute(post({ action: 'source', edition: rawRef, autoStore: true }), env, fetcher);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.material.label, 'RAWG');
  assert.equal(result.material.language, 'en');
  assert.equal(result.material.mode, 'translate');
  assert.equal(result.material.text, shortEn);
  assert.equal(result.stores, undefined);
  assert.deepEqual(calls, ['api.rawg.io/api/games/5']);
  assert.equal(writes.size, 0);
});

test('when the archive has no text, the draft uses the confirmed database ID and records the real source', async () => {
  const { env, writes } = environment();
  const edition = { provider: 'thegamesdb', id: '5' };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url.hostname);
    if (url.hostname === 'api.thegamesdb.net') {
      assert.equal(url.pathname, '/v1/Games/ByGameID');
      assert.equal(url.searchParams.get('id'), '5');
      return Response.json({ code: 200, data: { games: [{ id: 5, game_title: 'Harbor', overview: shortEn }] } });
    }
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    assert.deepEqual(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text), { gameTitle: 'Harbor', officialTitle: '', originalText: shortEn });
    return geminiResponse(approved);
  };
  const response = await dossierBriefRoute(post({ action: 'draft', edition }), env, fetcher);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, 'translate');
  assert.equal(result.text, approved);
  assert.deepEqual(result.source, { url: 'https://thegamesdb.net/game.php?id=5', label: 'TheGamesDB', language: 'en', kind: 'overview', edition: 'thegamesdb:5:' });
  assert.deepEqual(calls, ['api.thegamesdb.net', 'generativelanguage.googleapis.com']);
  assert.equal(writes.size, 0);
});

test('an empty database description produces a specific message before Gemini is called', async () => {
  const { env } = environment();
  const response = await dossierBriefRoute(post({ action: 'draft', edition: rawRef }), env, async url => {
    assert.equal(url.hostname, 'api.rawg.io');
    return Response.json({ ...raw, description_raw: '' });
  });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: '这份资料没有可翻译的简介正文。' });
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
  assert.deepEqual(await (await dossierBriefRoute(post({ ...base, text: shortZh }), env, fetcher)).json(), { text: shortZh, mode: 'manual', language: 'zh-Hans', originalLanguage: 'zh-Hans' });
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

test('Salt and Sanctuary sends plain heading text and preserves the archived synopsis paragraphs', async () => {
  const { env, writes } = environment();
  // Freeze the imported heading style independently of live CMS content.
  const synopsis = [
    'Salt and Sanctuary is a 2D action role-playing game.',
    '',
    '###Plot and art style ',
    'A shipwreck leaves the protagonist on a mysterious island.',
    'The game uses a hand-painted art style.',
    '',
    '###Gameplay ',
    'Players choose a class and explore the island.',
    '',
    'The game features local multiplayer.',
  ].join('\n');
  const original = synopsis + '\n\n## Other notes ##\n#hashtag, item #42, and inline ### stay.';
  const expected = plainReference(original)
    .replace('###Plot and art style', 'Plot and art style')
    .replace('###Gameplay', 'Gameplay')
    .replace('## Other notes ##', 'Other notes');
  const sent = [];
  const draft = '盐与避难所是一款带有角色扮演元素的二维动作游戏。\n\n剧情与美术风格\n主角漂流到神秘岛屿。\n\n玩法\n玩家可以探索岛屿并选择不同的职业。';
  const response = await dossierBriefRoute(post({ action: 'draft', gameTitle: '盐与避难所', text: original }), env, async (url, options) => {
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    sent.push(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text).originalText);
    return geminiResponse(draft);
  });
  assert.equal(response.status, 200);
  assert.deepEqual(sent, [expected]);
  assert.equal((await response.json()).text, draft);
  assert.equal(writes.size, 0);
});

test('Gemini preserves the literal <3 heart in an archived introduction without retrying', async () => {
  const { env, writes } = environment();
  const originalText = 'Stay in touch with us <3\n\n' + shortEn;
  const draft = '和我们保持联系 <3\n\n' + approved;
  const requests = [];
  const response = await dossierBriefRoute(post({ action: 'draft', gameTitle: 'Harbor', text: originalText }), env, async (url, options) => {
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    requests.push(JSON.parse(options.body));
    return geminiResponse(draft);
  });
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.text, draft);
  assert.equal(result.mode, 'translate');
  assert.equal(result.originalLanguage, 'en');
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].contents[0].parts[0].text).originalText, originalText);
  assert.equal(writes.size, 0);
});

test('a literal <3 heart does not exempt HTML, headings, links or Markdown formatting', async () => {
  const { env, writes } = environment();
  for (const extra of ['<em>排版</em>', '# 额外标题', '[网页](https://example.test)', '**强调**', '<3>']) {
    let calls = 0;
    const response = await dossierBriefRoute(post({ action: 'draft', text: shortEn }), env, async () => {
      calls++;
      return geminiResponse('和我们保持联系 <3\n\n' + shortZh + '\n\n' + extra);
    });
    const result = await response.json();
    assert.equal(response.status, 502, extra);
    assert.match(result.error, /草稿含链接、标题或不支持的格式/);
    assert.equal(result.text, undefined);
    assert.equal(calls, 2);
  }
  assert.equal(writes.size, 0);
});


test('long references are translated in full rather than summarized or truncated at 6500 characters', async () => {
  const { env, writes } = environment();
  const text = (multiParagraphEn + '\n\n').repeat(9) + 'The lighthouse keeper finally reunites with the crew.';
  assert.ok(text.length > 6500 && text.length <= 12000);
  const longDraft = approved + '\n\n' + shortZh.repeat(5);
  assert.ok([...longDraft].length > 250);
  const calls = [];
  const response = await dossierBriefRoute(post({ action: 'draft', edition: rawRef, text }), env, async (url, options) => {
    calls.push(url.hostname);
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    const request = JSON.parse(options.body);
    assert.match(request.system_instruction.parts[0].text, /不做摘要，不省略原文的信息/);
    assert.equal(JSON.parse(request.contents[0].parts[0].text).originalText, text);
    assert.ok(request.generationConfig.maxOutputTokens > 1024);
    return geminiResponse(longDraft);
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.text, longDraft);
  assert.equal(result.mode, 'translate');
  assert.deepEqual(calls, ['generativelanguage.googleapis.com']);
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

test('edition evidence compares legal suffix variants without merging different studios', () => {
  const release = { ...game, developers: ['Valve Corporation'] };
  assert.equal(editionEvidence(release, { ...game, developers: ['Valve'] }).developer, 1);
  assert.equal(editionEvidence({ ...game, developers: ['Capcom Co., Ltd.'] }, { ...game, developers: ['Capcom'] }).developer, 1);
  assert.equal(editionEvidence(release, { ...game, developers: ['Valve South'] }).developer, -1);
});
test('saved archive HTML translates directly without a second edition lookup', async () => {
  const { env, writes } = environment();
  const draft = approved + '\n\n' + shortZh;
  const calls = [];
  const request = post({ action: 'draft', text: '<p>' + shortEn + '</p><p>In the end, the crew returns to the harbor.</p>', gameTitle: 'Harbor' });
  const response = await dossierBriefRoute(request, env, async (url, options) => {
    calls.push(url.hostname);
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    const payload = JSON.parse(options.body);
    assert.equal(JSON.parse(payload.contents[0].parts[0].text).originalText, shortEn + '\n\nIn the end, the crew returns to the harbor.');
    return geminiResponse(draft);
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.text, draft);
  assert.equal(result.mode, 'translate');
  assert.equal(result.originalLanguage, 'en');
  assert.equal(result.source, undefined);
  assert.deepEqual(calls, ['generativelanguage.googleapis.com']);
  assert.equal(writes.size, 0);
});


test('Gemini translates linked synopsis prose and preserves only original URLs', async () => {
  const { env, writes } = environment();
  const url = 'https://example.com/wiki/Harbor_(game)?a=1&b=2#map';
  const manual = 'https://example.org/guide';
  const trailer = 'https://example.net/trailer';
  const original = shortEn + '\n\nRead [the harbor map](' + url + '), visit ' + manual + ', or watch <' + trailer + '>.';
  let calls = 0;
  const response = await dossierBriefRoute(post({ action: 'draft', text: original }), env, async (requestUrl, options) => {
    calls++;
    assert.equal(requestUrl.hostname, 'generativelanguage.googleapis.com');
    const text = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text).originalText;
    const markers = text.match(/\[\[SOURCE_LINK_\d+\]\]/g);
    // Simulate a faithful translation that retains URLs under either protocol.
    if (!markers) return geminiResponse(approved + '\n\n请查看港口地图（' + url + '），阅读指南（' + manual + '），或观看预告片（' + trailer + '）。');
    assert.equal(markers.length, 3);
    assert.ok(text.includes('the harbor map'));
    assert.doesNotMatch(text, /https?:\/\//);
    return geminiResponse(approved + '\n\n请查看港口地图（' + markers[0] + '），阅读指南（' + markers[1] + '），或观看预告片（' + markers[2] + '）。');
  });
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.text, approved + '\n\n请查看港口地图（' + url + '），阅读指南（' + manual + '），或观看预告片（' + trailer + '）。');
  assert.equal(calls, 1);
  assert.equal(writes.size, 0);
});

test('Gemini retries a lost or changed source link and rejects a fabricated URL', async () => {
  for (const invalid of ['', '[[SOURCE_LINK_9]]', '[[SOURCE_LINK_1]][[SOURCE_LINK_1]]',
    '[[SOURCE_LINK_1]] https://unrelated.example/']) {
    const { env } = environment();
    let calls = 0;
    const response = await dossierBriefRoute(post({ action: 'draft', text: shortEn + '\n\nhttps://example.com/guide' }), env, async (_url, options) => {
      calls++;
      if (calls === 2) assert.match(JSON.parse(options.body).system_instruction.parts[0].text, /链接/);
      return geminiResponse(approved + '\n\n' + invalid);
    });
    assert.equal(response.status, 502, invalid);
    assert.equal((await response.json()).text, undefined);
    assert.equal(calls, 2);
  }
});

test('a blank primary regional entry borrows only an exact same-release sibling and cites it', async () => {
  const { env } = environment();
  const calls = [];
  const response = await dossierBriefRoute(post({ action: 'draft',
    edition: { provider: 'thegamesdb', id: '137773' }, alternateIds: ['1', '2', '3', '144567'] }), env, async url => {
    if (url.hostname === 'generativelanguage.googleapis.com') return geminiResponse(approved);
    if (url.pathname.endsWith('/Developers')) return Response.json({ code: 200, data: { developers: {} } });
    assert.equal(url.pathname, '/v1/Games/ByGameID');
    const id = url.searchParams.get('id');
    calls.push(id);
    const platform = id === '1' ? 2 : 1;
    return Response.json({ code: 200, data: { games: [{
      id: Number(id), game_title: id === '3' ? 'Harbor Deluxe' : 'Harbor', platform,
      release_date: id === '2' ? '1998-11-05' : '2026-11-05',
      developers: ['Studio'], overview: id === '137773' ? '' : shortEn,
    }] }, include: { platform: { data: { 1: { name: 'Nintendo Switch 2' }, 2: { name: 'Nintendo 64' } } } } });
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.source.edition, 'thegamesdb:144567:');
  assert.equal(result.source.url, 'https://thegamesdb.net/game.php?id=144567');
  assert.deepEqual(calls, ['137773', '1', '2', '3', '144567']);
});
