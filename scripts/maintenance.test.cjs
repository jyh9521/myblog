const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const ts = require('typescript'), React = require('react'), renderer = require('react-test-renderer');
const { deploymentState, cleanupPreview } = require('../public/sveltia/maintenance-core');
const { buildAssetIndex } = require('./build-asset-index.cjs');
function load(file) {
  const context = { exports: {}, require };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  return context.exports;
}
test('publication distinguishes saved, pending, deployed, cancelled and failed exact commits', () => {
  assert.equal(deploymentState('new', [{ head_sha: 'old', status: 'completed', conclusion: 'success' }]).kind, 'pending');
  for (const status of ['queued', 'waiting', 'in_progress']) assert.equal(deploymentState('new', [{ head_sha: 'new', status }]).kind, 'pending');
  assert.equal(deploymentState('new', [{ head_sha: 'new', status: 'completed', conclusion: 'success' }]).label, '已上线');
  for (const conclusion of ['failure', 'cancelled', 'timed_out']) assert.equal(deploymentState('new', [{ head_sha: 'new', status: 'completed', conclusion }]).kind, 'error');
});
test('asset inventory follows YAML, Markdown, encoded filenames and compare references; duplicates are content-based', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-assets-'));
  for (const dir of ['content/posts', 'content/games', 'public/uploads']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'content/posts/a.md'), '---\ntitle: Article\ncover: /uploads/cover.png\n---\n![图](/uploads/%E5%9B%BE.png)\n[compare]/uploads/before.png|/uploads/after.png|before|after[/compare]\n');
  fs.writeFileSync(path.join(root, 'content/games/b.md'), '---\ntitle: Game\ngameMetadata:\n  cover: /uploads/game.png\n---\n');
  for (const name of ['cover.png', '图.png', 'before.png', 'after.png', 'game.png', 'unused.png']) fs.writeFileSync(path.join(root, 'public/uploads', name), name === 'unused.png' ? 'cover.png' : name);
  const index = await buildAssetIndex(root);
  assert.equal(index.files.length, 6);
  assert.equal(index.files.find(file => file.path === '/uploads/图.png').references[0].title, 'Article');
  assert.equal(index.files.find(file => file.path === '/uploads/game.png').references[0].url, '/games/b/');
  assert.equal(index.files.filter(file => !file.references.length).length, 1);
  assert.deepEqual(index.files.find(file => file.path === '/uploads/unused.png').duplicates, ['/uploads/cover.png']);
  const preview = cleanupPreview(index, index.files.map(file => file.path));
  assert.equal(preview.files.length, 1); assert.equal(preview.action, 'review-only-no-files-deleted');
  assert.ok(fs.existsSync(path.join(root, preview.files[0].path)));
});
test('excerpt finds body matches and highlights all overlapping terms without rendering HTML', () => {
  const { articleText, matchExcerpt, highlightMatches } = load('lib/article-search.ts');
  const body = '开头'.repeat(90) + 'Modernizer 技术说明，安装 Modernizer。' + '后文'.repeat(90);
  const excerpt = matchExcerpt(body, '不相关摘要', 'modernizer');
  assert.ok(excerpt.includes('Modernizer 技术说明')); assert.ok(excerpt.startsWith('…'));
  assert.ok(highlightMatches(excerpt, 'modernizer').some(part => part.match && part.text === 'Modernizer'));
  assert.equal(articleText('[链接](https://example.test) ![图](/a.png)'), '链接 图');
  assert.equal(highlightMatches('<script>alert(1)</script>', 'alert').map(part => part.text).join(''), '<script>alert(1)</script>');
  assert.equal(highlightMatches('Modernizer', 'modern modernizer').filter(part => part.match).length, 1);
});
test('failed image keeps dimensions, displays retry and returns to normal after successful load', () => {
  const Image = load('app/posts/retryable-image.tsx').default; let tree;
  renderer.act(() => { tree = renderer.create(React.createElement(Image, { src: '/test.png', alt: 'Test', width: 800, height: 600, onOpen() {}, label: '放大图片' })); });
  const before = tree.root.findByType('img');
  renderer.act(() => before.props.onError());
  assert.equal(tree.root.findByType('img').props.width, 800); assert.equal(tree.root.findByType('img').props.height, 600);
  assert.equal(tree.root.findByProps({ role: 'status' }).findAllByType('button')[0].children[0], '重试加载图片');
  renderer.act(() => tree.root.findByProps({ role: 'status' }).findByType('button').props.onClick());
  assert.ok(tree.root.findByType('img').props.src.includes('image_retry=1'));
  renderer.act(() => tree.root.findByType('img').props.onLoad());
  assert.equal(tree.root.findAllByProps({ role: 'status' }).length, 0);
  assert.equal(tree.root.findByType('img').props.height, 600);
  renderer.act(() => tree.unmount());
});
test('maintenance tools expose read-only review and are linked from CMS without implementing reading memory', () => {
  assert.ok(fs.readFileSync('public/sveltia/index.html', 'utf8').includes('maintenance-launcher.js'));
  const code = fs.readFileSync('public/sveltia/maintenance.js', 'utf8');
  assert.ok(!code.includes("method: 'DELETE'")); assert.ok(!code.includes('localStorage'));
  assert.ok(code.includes('失败步骤')); assert.ok(code.includes('180000'));
});

test('cached image failure before hydration displays retry', () => {
  const Image = load('app/posts/retryable-image.tsx').default; let tree;
  renderer.act(() => { tree = renderer.create(React.createElement(Image, { src: '/missing.png', alt: 'Test', onOpen() {}, label: '放大图片' }), { createNodeMock: element => element.type === 'img' ? { complete: true, naturalWidth: 0 } : null }); });
  assert.equal(tree.root.findAllByProps({ role: 'status' }).length, 1);
  renderer.act(() => tree.unmount());
});
