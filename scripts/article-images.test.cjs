const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');

function load(file, imports = {}, globals = {}) {
  const context = { exports: {}, process, ...globals, require: name => name in imports ? imports[name] : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}

test('local AVIF dimensions are emitted before download; encoded paths and missing/remote assets are handled', () => {
  const { withImageSize } = load('lib/article-image-size.ts');
  const image = withImageSize({ src: '/uploads/chinesetranslationpatch/nolf2/主菜单.avif', alt: '', caption: '' });
  assert.ok(image.width > 0 && image.height > 0);
  assert.deepEqual(withImageSize({ ...image, src: encodeURI(image.src) }).width, image.width);
  for (const src of ['https://example.test/image.jpg', '/missing.avif', '/../package.json', '/%2e%2e/package.json']) {
    assert.equal(withImageSize({ src }).width, undefined);
  }
});

test('TOC and lightbox updates preserve Markdown image nodes, reserved geometry and correct caption', async () => {
  const noopPlugin = () => () => {};
  let intersection;
  const { default: PostContent } = load('app/posts/post-content.tsx', {
    'react-markdown': { __esModule: true, default: (await import('react-markdown')).default },
    'remark-gfm': { __esModule: true, default: (await import('remark-gfm')).default },
    'remark-breaks': { __esModule: true, default: (await import('remark-breaks')).default },
    './game-frames': { remarkGameFrames: noopPlugin },
    './compare-markdown': { remarkImageCompare: noopPlugin },
    './markdown-utils': { remarkHeadingIds: noopPlugin },
    '../site-enhancements': { ReadingProgress: () => null, ShareButton: () => null },
    './pdf-embed': { default: () => null, __esModule: true },
    './image-compare': { default: () => null, __esModule: true },
    '../games/game-frame-card': { default: () => null, __esModule: true },
    './retryable-image': { default: load('app/posts/retryable-image.tsx').default, __esModule: true },
    '../../lib/external-links': load('lib/external-links.ts', {}, { URL }),
  }, {
    document: { getElementById: () => ({ id: 'end' }), body: { style: { overflow: '' } } },
    window: { addEventListener() {}, removeEventListener() {} },
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} disconnect() {} },
  });
  let tree;
  const props = { title: 'Test', body: '![first](/one.avif)\n\n![second](https://example.test/two.png)\n\n[External](https://example.com) [Internal](/about/)',
    headings: [{ id: 'end', text: 'End', level: 2 }], games: [],
    images: [{ src: '/one.avif', alt: 'first', caption: 'First caption', width: 1920, height: 1080 }, { src: 'https://example.test/two.png', alt: 'second', caption: 'Second caption' }],
    cover: { src: '/cover.png', alt: 'cover', caption: 'Cover', width: 800, height: 600 } };
  renderer.act(() => { tree = renderer.create(React.createElement(PostContent, props)); });
  const external = tree.root.findAllByType('a').find(link => link.props.href === 'https://example.com');
  assert.equal(external.props.target, '_blank'); assert.equal(external.props.rel, 'noopener noreferrer');
  assert.equal(tree.root.findAllByType('a').find(link => link.props.href === '/about/').props.target, undefined);
  const image = tree.root.findAllByType('img').find(x => x.props.src === '/one.avif');
  assert.equal(image.props.width, 1920);
  assert.equal(image.props.height, 1080);
  const fallback = tree.root.findAllByType('img').find(x => x.props.src.includes('two.png'));
  assert.equal(fallback.props.width, 1600);
  assert.equal(fallback.props.height, 900);
  renderer.act(() => intersection([{ isIntersecting: true, boundingClientRect: { top: 0 }, target: { id: 'end' } }]));
  renderer.act(() => tree.root.findAllByType('button').find(x => x.props.className === 'toc-toggle').props.onClick());
  assert.strictEqual(tree.root.findAllByType('img').find(x => x.props.src === '/one.avif'), image);
  renderer.act(() => tree.root.findAllByType('button').find(x => x.props['aria-label'] === '放大图片：Second caption').props.onClick());
  assert.equal(tree.root.findByProps({ className: 'lightbox-content' }).findByType('img').props.src, 'https://example.test/two.png');
  assert.strictEqual(tree.root.findAllByType('img').find(x => x.props.src === '/one.avif'), image);
  renderer.act(() => tree.unmount());
});
