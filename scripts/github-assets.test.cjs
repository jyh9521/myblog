const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { createHash, webcrypto } = require('node:crypto');
const { deleteAssets, checkedFiles } = require('../public/sveltia/asset-delete');
function load(file) {
  const context = { exports: {}, URL, require: name => name === '../../lib/game-types' ? { gameStoreLabels: { pc: 'PC' } } : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
const head = 'a'.repeat(40), created = 'b'.repeat(40);
function fixture(options = {}) {
  const data = Buffer.from('fixture image'), path = 'public/uploads/unused.png', sha256 = createHash('sha256').update(data).digest('hex');
  const preview = { commit: head, files: [{ path, sha256, bytes: data.length }] }, calls = [];
  const tree = [{ path, type: 'blob', mode: '100644', sha: 'image' }, { path: 'content/posts/test.md', type: 'blob', mode: '100644', sha: 'content' }];
  if (options.bulk) { preview.files.push({ ...preview.files[0], path: 'public/uploads/second.png' }); tree.push({ ...tree[0], path: 'public/uploads/second.png' }); }
  const request = async (url, init) => {
    const route = url.replace('https://api.github.com/repos/jyh9521/myblog', ''); calls.push({ route, ...init, parsed: init.body && JSON.parse(init.body) });
    let result;
    if (route === '/git/ref/heads/main') result = { object: { sha: options.stale ? created : head } };
    else if (route === `/git/commits/${head}`) result = { tree: { sha: 'oldTree' } };
    else if (route === '/git/trees/oldTree?recursive=1') result = { tree, truncated: !!options.truncated };
    else if (route === '/git/blobs/content') result = { encoding: 'base64', content: Buffer.from(options.encoded ? '%1!s! ![图](/uploads/%75%6e%75%73%65%64.png)' : options.reference ? '![图](/uploads/unused.png)' : 'article').toString('base64') };
    else if (route === '/git/blobs/image') result = { encoding: 'base64', content: (options.changed ? Buffer.from('changed') : data).toString('base64') };
    else if (route === '/git/trees' && init.method === 'POST') result = { sha: 'newTree' };
    else if (route === '/git/commits' && init.method === 'POST') result = { sha: created };
    else if (route === '/git/refs/heads/main') { if (options.race) return { ok: false, status: 422 }; result = {}; }
    else if (route === '/git/trees/newTree?recursive=1') result = { tree: tree.filter(entry => !preview.files.some(file => file.path === entry.path)), truncated: false };
    else throw Error('Unexpected request ' + route);
    return { ok: true, json: async () => result };
  };
  return { preview, calls, request, digest: data => webcrypto.subtle.digest('SHA-256', data) };
}
test('asset deletion creates one atomic commit, non-forced update, and verifies absent files', async () => {
  const f = fixture(); const result = await deleteAssets(f.preview, 'fixture-token', f.request, f.digest);
  assert.equal(result.sha, created);
  assert.deepEqual(f.calls.find(call => call.route === '/git/trees').parsed, { base_tree: 'oldTree', tree: [{ path: 'public/uploads/unused.png', mode: '100644', type: 'blob', sha: null }] });
  assert.deepEqual(f.calls.find(call => call.route === '/git/refs/heads/main').parsed, { sha: created, force: false });
  assert.deepEqual(f.calls.find(call => call.route === '/git/commits').parsed.parents, [head]);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
});
test('stale, referenced, changed or incomplete files abort before any write', async () => {
  for (const option of ['stale', 'reference', 'encoded', 'changed', 'truncated']) {
    const f = fixture({ [option]: true });
    await assert.rejects(deleteAssets(f.preview, 'fixture-token', f.request, f.digest));
    assert.ok(f.calls.every(call => call.method === 'GET'));
  }
});
test('multiple selected resources are removed in one commit, not sequential commits', async () => {
  const f = fixture({ bulk: true });
  const result = await deleteAssets(f.preview, 'fixture-token', f.request, f.digest);
  assert.equal(result.files.length, 2);
  assert.equal(f.calls.find(call => call.route === '/git/trees').parsed.tree.length, 2);
  assert.equal(f.calls.filter(call => call.route === '/git/commits' && call.method === 'POST').length, 1);
});
test('concurrent edit rejects ref update, without force or retrying writes', async () => {
  const f = fixture({ race: true });
  await assert.rejects(deleteAssets(f.preview, 'fixture-token', f.request, f.digest), /422/);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
  assert.equal(f.calls.at(-1).parsed.force, false);
});
test('deletion is confined to unique upload paths with expected hashes', async () => {
  const f = fixture();
  for (const path of ['content/posts/a.md', 'public/uploads/../a.png', 'public/uploads/a\\b.png', 'public/uploads//a.png']) assert.throws(() => checkedFiles({ ...f.preview, files: [{ ...f.preview.files[0], path }] }));
  assert.throws(() => checkedFiles({ ...f.preview, files: [...f.preview.files, ...f.preview.files] }));
  await assert.rejects(deleteAssets(f.preview, '', f.request, f.digest));
  assert.equal(f.calls.length, 0);
});
test('GitHub project normalization supports multiple projects, rejects foreign URLs and preserves manual names', () => {
  const { normalizeProjects } = load('lib/game-projects.ts');
  const projects = normalizeProjects([{ url: 'https://github.com/owner/repo.git', name: '汉化项目', type: '汉化补丁', releaseUrl: 'https://github.com/owner/repo/releases/latest' }, { url: 'https://github.com/owner/repo' }, { url: 'https://github.com/owner/tool', type: '工具' }, { url: 'https://github.com.evil.test/owner/repo' }, { url: 'javascript:alert(1)' }]);
  assert.equal(projects.length, 2); assert.equal(projects[0].name, '汉化项目'); assert.equal(projects[0].url, 'https://github.com/owner/repo'); assert.equal(projects[1].name, 'owner/tool');
  assert.equal(normalizeProjects([{ url: 'https://github.com/owner/repo', releaseUrl: 'https://evil.test' }])[0].releaseUrl, '');
  assert.equal(normalizeProjects(undefined).length, 0);
});
test('article cards add only a compact project link and hide it for unassociated games', () => {
  const Card = load('app/games/game-platform-card.tsx').default;
  const props = { gameTitle: '手动名称', platform: { store: 'pc', platform: 'PC', catalogUrl: '/games/test/', cover: '', genres: [] } };
  assert.ok(!renderToStaticMarkup(React.createElement(Card, props)).includes('game-project-entry'));
  const html = renderToStaticMarkup(React.createElement(Card, { ...props, projectCount: 2 }));
  assert.ok(html.includes('相关项目 2')); assert.ok(html.includes('/games/test/#projects')); assert.ok(html.includes('手动名称'));
});
