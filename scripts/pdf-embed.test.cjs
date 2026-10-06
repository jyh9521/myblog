const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const path = require('node:path'), os = require('node:os');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { buildAssetIndex } = require('./build-asset-index.cjs');
function loadPdf() {
  const context = { exports: {}, require };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/posts/pdf-embed.tsx', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context.exports;
}
function component() {
  const components = [], window = { h() {}, createClass: x => x, CMS: {
    getFieldType: () => ({ control() {} }), registerFieldType() {}, registerEditorComponent: x => components.push(x),
  } };
  vm.runInNewContext(fs.readFileSync('public/sveltia/custom.js', 'utf8'), { window });
  return components.find(x => x.id === 'pdf');
}
test('PDF toolbar uses shared file resource picker and round-trips encoded Chinese filenames', () => {
  const pdf = component();
  assert.equal(pdf.trigger, 'button'); assert.equal(pdf.fields[0].widget, 'file');
  assert.equal(pdf.fields[0].choose_url, false); assert.ok(pdf.fields[0].accept.includes('.pdf'));
  assert.equal(pdf.fields[0].media_folder, undefined);
  const block = pdf.toBlock({ file: '/uploads/手册 (1).pdf', title: '游戏说明' });
  const match = block.match(pdf.pattern); assert.ok(match);
  assert.equal(pdf.fromBlock(match).file, '/uploads/手册 (1).pdf');
  assert.equal(pdf.fromBlock(match).title, '游戏说明');
  assert.equal(pdf.toBlock(pdf.fromBlock(match)), block);
  const draft = pdf.toBlock({ file: 'blob:http://localhost:3104/1234-abcd', title: '上传草稿' });
  assert.ok(draft.includes('blob:http://localhost:3104/1234-abcd'));
  assert.equal(pdf.fromBlock(draft.match(pdf.pattern)).file, 'blob:http://localhost:3104/1234-abcd');
  assert.ok(!pdf.toPreview({ title: '<script>alert(1)</script>' }).includes('<'));
  for (const file of ['/uploads/a.png', 'https://example.test/a.pdf', '/uploads/../a.pdf', '/uploads/%2e%2e/a.pdf', '/uploads/a.pdf?x=1']) assert.equal(pdf.toBlock({ file }), '');
});
test('PDF URL validation and native download fallback never embed remote or traversal paths', () => {
  const { pdfUploadUrl, default: Pdf } = loadPdf();
  assert.equal(pdfUploadUrl('/uploads/手册 (1).PDF'), '/uploads/%E6%89%8B%E5%86%8C%20%281%29.PDF');
  for (const value of ['//evil.test/a.pdf', 'javascript:alert(1)', '/uploads/../a.pdf', '/uploads/%2e%2e/a.pdf', '/uploads/a.pdf?x', '/uploads/%00.pdf', '/uploads/a.png', '/uploads/%zz.pdf']) assert.equal(pdfUploadUrl(value), null);
  const html = renderToStaticMarkup(React.createElement(Pdf, { src: '/uploads/manual.pdf' }, 'Manual'));
  assert.ok(html.includes('/pdfjs/web/viewer.html?file=%2Fuploads%2Fmanual.pdf#zoom=page-width'));
  assert.ok(html.includes('loading="lazy"')); assert.ok(html.includes('download=""'));
  assert.ok(!renderToStaticMarkup(React.createElement(Pdf, { src: 'javascript:alert(1)' })).includes('<iframe'));
});
test('standard Markdown PDF marker renders inline, while ordinary PDF links remain downloads', async () => {
  const { default: Markdown } = await import('react-markdown'); const Pdf = loadPdf().default;
  const body = component().toBlock({ file: '/uploads/游戏说明.pdf', title: '游戏手册' }) + '\n\n[普通附件](/uploads/other.pdf)';
  const html = renderToStaticMarkup(React.createElement(Markdown, { components: {
    a: ({ href, title, children }) => title === 'pdf-embed' ? React.createElement(Pdf, { src: href }, children) : React.createElement('a', { href }, children),
  } }, body));
  assert.equal((html.match(/<iframe/g) || []).length, 1);
  assert.ok(html.includes('PDF 阅读器：游戏手册')); assert.ok(html.includes('<a href="/uploads/other.pdf">普通附件</a>'));
  assert.ok(fs.readFileSync('app/posts/post-content.tsx', 'utf8').includes("title === 'pdf-embed'"));
});
test('PDF shares asset inventory reference tracking, duplicate detection and cleanup protection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-pdf-'));
  fs.mkdirSync(path.join(root, 'content/posts'), { recursive: true }); fs.mkdirSync(path.join(root, 'public/uploads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'content/posts/test.md'), '---\ntitle: 手册文章\n---\n' + component().toBlock({ file: '/uploads/手册.pdf' }));
  for (const name of ['手册.pdf', 'unused.pdf']) fs.writeFileSync(path.join(root, 'public/uploads', name), '%PDF-fixture');
  const index = await buildAssetIndex(root), used = index.files.find(x => x.path === '/uploads/手册.pdf');
  assert.equal(used.pdf, true); assert.equal(used.image, false); assert.equal(used.references[0].title, '手册文章');
  assert.deepEqual(used.duplicates, ['/uploads/unused.pdf']);
  const { cleanupPreview } = require('../public/sveltia/maintenance-core');
  assert.equal(cleanupPreview(index, index.files.map(x => x.path)).files.length, 1);
});
test('self-hosted upstream viewer has worker/fonts/CMaps, license, blog styling and disabled PDF scripts', () => {
  for (const file of ['LICENSE', 'UPSTREAM.md', 'build/pdf.mjs', 'build/pdf.worker.mjs', 'web/viewer.html', 'web/viewer.css', 'web/viewer.mjs', 'web/blog-viewer.css']) assert.ok(fs.existsSync('public/pdfjs/' + file));
  const viewer = fs.readFileSync('public/pdfjs/web/viewer.mjs', 'utf8');
  assert.ok(viewer.includes('AppOptions.set("enableScripting", false)'));
  const html = fs.readFileSync('public/pdfjs/web/viewer.html', 'utf8');
  assert.ok(html.includes('blog-viewer.css')); assert.ok(html.includes("connect-src 'self'"));
  assert.ok(fs.readFileSync('public/pdfjs/LICENSE', 'utf8').includes('Apache License'));
  for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'locale']) assert.ok(fs.statSync('public/pdfjs/web/' + dir).isDirectory());
});
