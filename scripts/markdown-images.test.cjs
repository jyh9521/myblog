const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function component() {
  let image;
  const window = { h: (type, props) => ({ type, props }), createClass: value => value, CMS: {
    registerFieldType() {}, registerEventListener() {}, registerEditorComponent: value => { image = value; },
  } };
  vm.runInNewContext(fs.readFileSync(process.env.MARKDOWN_IMAGE_SOURCE || 'public/sveltia/r2-media.js', 'utf8'), { window, URL });
  assert.equal(image.id, 'r2-image'); return image;
}
async function images(markdown) {
  const { unified } = await import('unified'), { default: parse } = await import('remark-parse');
  const nodes = node => [node, ...(node.children || []).flatMap(nodes)];
  return nodes(unified().use(parse).parse(markdown)).filter(node => node.type === 'image');
}
test('R2 images match after prose and ordered/nested list prefixes instead of becoming exclamation plus link', () => {
  const image = component(), syntax = '![选择格式](/uploads/settings.png)';
  assert.equal(image.fields[0].widget, 'r2-image'); assert.equal(image.trigger, 'button');
  for (const prefix of ['正文。', '1. 正文。', '   - **正文** ', '> 引用 ']) {
    const match = (prefix + syntax + '后文').match(image.pattern);
    assert.ok(match, prefix); assert.equal(match[0], syntax);
  }
});
test('adjacent images in one paragraph match separately without consuming their neighbours', () => {
  const image = component(), pattern = new RegExp(image.pattern.source, 'g');
  const first = '![之前](/uploads/before.png)', second = '![之后](/uploads/after.png)';
  assert.deepEqual([...('前文' + first + second + '后文').matchAll(pattern)].map(match => match[0]), [first, second]);
});
test('image alt, title and literal Markdown punctuation survive a serializer/import roundtrip', async () => {
  const image = component();
  for (const alt of ['选择格式', '图 [一] \\ *原文*', '日本語 🙂']) {
    const data = { src: '/uploads/image.png', alt, title: '图片 "标题" \\ 原文' };
    const markdown = image.toBlock(data), parsed = await images(markdown);
    assert.equal(parsed.length, 1); assert.equal(parsed[0].alt, data.alt); assert.equal(parsed[0].title, data.title);
    const match = markdown.match(image.pattern); assert.ok(match);
    const restored = image.fromBlock(match);
    assert.equal(restored.alt, data.alt); assert.equal(restored.title, data.title);
    assert.equal(image.toBlock(restored), markdown);
    assert.equal(image.toPreview(data).props.title, data.title);
  }
  assert.ok(image.fields.some(field => field.name === 'title'));
});
test('encoded and literal parentheses, Unicode and spaces in R2 paths remain one valid image', async () => {
  const image = component();
  for (const src of ['/uploads/图 (1).png', '/uploads/%E5%9B%BE%20(1).png', '/uploads/图[一]#?.png']) {
    const markdown = image.toBlock({ src, alt: '图' });
    const parsed = await images(markdown); assert.equal(parsed.length, 1);
    assert.equal(decodeURIComponent(parsed[0].url), decodeURIComponent(src));
    assert.ok(markdown.match(image.pattern));
    assert.equal(image.toBlock(image.fromBlock(markdown.match(image.pattern))), markdown);
  }
  assert.ok('文字![图](/uploads/image(1).png)后文'.match(image.pattern));
});
test('ordinary external and temporary native-paste images stay images through the same contract', async () => {
  const image = component();
  for (const src of ['https://example.test/image(1).png?size=2&mode=raw', 'http://example.test/image.png', 'blob:https://blog.blfy.cc/1234-abcd']) {
    const markdown = image.toBlock({ src, alt: '图' }), parsed = await images(markdown);
    assert.equal(parsed.length, 1); assert.equal(decodeURI(parsed[0].url), decodeURI(src));
    assert.ok(markdown.match(image.pattern));
    assert.equal(image.toBlock(image.fromBlock(markdown.match(image.pattern))), markdown);
  }
});
test('empty, invalid and executable URL schemes do not throw or create image markup', () => {
  const image = component(); assert.equal(image.toBlock({}), '');
  for (const src of ['javascript:alert(1)', 'data:text/html,<script>x</script>', '//foreign.test/x.png', '/uploads/%ZZ.png']) {
    assert.equal(image.toBlock({ src, alt: '图' }), '');
  }
});
test('every real article image is recognized in inline/list context and keeps its alt/title', async () => {
  const image = component(), source = fs.readFileSync('content/posts/magna-carta-2-cn.md', 'utf8');
  const all = await images(source); assert.ok(all.length > 20);
  for (const node of all) {
    const syntax = source.slice(node.position.start.offset, node.position.end.offset);
    const match = ('列表文字。' + syntax + '后文').match(image.pattern);
    assert.ok(match, syntax); assert.equal(match[0], syntax);
    const restored = image.fromBlock(match), [after] = await images(image.toBlock(restored));
    assert.equal(decodeURI(after.url), decodeURI(node.url));
    assert.equal(after.alt || '', node.alt || ''); assert.equal(after.title || '', node.title || '');
  }
});
test('CMS and resources load the cache-busted image roundtrip implementation', () => {
  for (const name of ['index.html', 'resources.html']) {
    const source = fs.readFileSync(process.env.MARKDOWN_IMAGE_HTML_ROOT ? process.env.MARKDOWN_IMAGE_HTML_ROOT + '/' + name : 'public/sveltia/' + name, 'utf8');
    assert.match(source, /r2-media\.js\?v=entry-folders-20261113/);
  }
});
