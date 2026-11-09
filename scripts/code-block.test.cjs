const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const yaml = require('js-yaml');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');

function component() {
  const components = [];
  const window = { h: () => null, createClass: definition => definition, CMS: {
    getFieldType: () => ({ control() {} }), registerFieldType() {},
    registerEditorComponent: definition => components.push(definition),
  } };
  vm.runInNewContext(fs.readFileSync(process.env.CODE_BLOCK_CUSTOM || 'public/sveltia/custom.js', 'utf8'), {
    window, document: { createElement: tag => ({ tag, style: {}, textContent: '' }) },
  });
  const block = components.find(definition => definition.id === 'multiline-code-block');
  assert.ok(block, 'Missing explicit multiline code block button');
  return block;
}
async function parse(value) {
  const { unified } = await import('unified'), { default: markdown } = await import('remark-parse');
  return unified().use(markdown).parse(value);
}
async function render(value) {
  const { default: Markdown } = await import('react-markdown');
  const { default: breaks } = await import('remark-breaks');
  return renderToStaticMarkup(React.createElement(Markdown, { remarkPlugins: [breaks] }, value));
}
const sample = '# 配置注释：空行和缩进必须保留\n\ntitle_name = "配置测试"\ntitle_id = "4E4D0811"\n\n[[patch]]\nname = "多行代码"\n  is_enabled = true\n';

test('multiline code has a direct block button and a plain multiline text field', () => {
  const block = component();
  assert.equal(block.trigger, 'button'); assert.equal(block.label, '插入代码块');
  assert.notEqual(block.type, 'inline');
  assert.equal(block.fields.find(field => field.name === 'code').widget, 'text');
  assert.equal(block.fields.find(field => field.name === 'code').required, true);
  assert.equal(block.toBlock({}), '');
});
test('the screenshot-shaped configuration saves as one fenced block, including blank lines and indentation', async () => {
  const block = component(), markdown = block.toBlock({ code: sample, language: 'toml' });
  const tree = await parse(markdown);
  assert.equal(tree.children.length, 1); assert.equal(tree.children[0].type, 'code');
  assert.equal(tree.children[0].lang, 'toml'); assert.equal(tree.children[0].value, sample);
  const html = await render(markdown);
  assert.equal((html.match(/<pre>/g) || []).length, 1);
  assert.equal((html.match(/<code\b/g) || []).length, 1);
  assert.match(html, /language-toml/); assert.doesNotMatch(html, /<p>|<br\s*\/?>/);
});
test('code round-trips without smart quotes, trimmed whitespace or interpreted Markdown/HTML', async () => {
  const block = component();
  for (const code of [sample, '\n\n', '  \t  ', '\n先头空行\n末尾空行\n\n', '日语 日本語 🙂\n<script>alert("x")</script>\n**not bold** &amp;', '"quotes" \'quotes\' `ticks` \\ path']) {
    const markdown = block.toBlock({ code }), restored = block.fromBlock(markdown.match(block.pattern));
    assert.equal(restored.code, code); assert.equal(block.toBlock(restored), markdown);
    assert.equal((await parse(markdown)).children[0].value, code);
    assert.equal(block.toPreview({ code }).textContent, code);
  }
  const html = await render(block.toBlock({ code: '<img src=x onerror=alert(1)>\n**literal**' }));
  assert.doesNotMatch(html, /<img|<strong>/); assert.match(html, /&lt;img/);
});
test('nested fences and long backtick runs never close the surrounding code block', async () => {
  const block = component();
  for (let length = 3; length <= 16; length++) {
    const code = `before\n${'`'.repeat(length)}md\n**literal**\n${'`'.repeat(length)}\n~~~\nafter\n`;
    const markdown = block.toBlock({ code, language: 'markdown' });
    const tree = await parse(markdown);
    assert.equal(tree.children.length, 1); assert.equal(tree.children[0].value, code);
    assert.equal(block.fromBlock(markdown.match(block.pattern)).code, code);
  }
});
test('existing backtick/tilde fences import independently without swallowing adjacent prose or blocks', async () => {
  const block = component();
  for (const fence of ['```', '````', '~~~']) {
    const first = `${fence}toml\nfirst\n\n  second\n${fence}`;
    const match = (first + '\n\n后文\n\n```js\nlast\n```').match(block.pattern);
    assert.equal(match[0], first); assert.equal(block.fromBlock(match).code, 'first\n\n  second');
    assert.equal(block.fromBlock(match).language, 'toml');
  }
  const tree = await parse('前文\n\n' + block.toBlock({ code: sample }) + '\n\n后文');
  assert.deepEqual(tree.children.map(node => node.type), ['paragraph', 'code', 'paragraph']);
});
test('line endings normalize to Markdown LF without changing the code or injecting language markup', async () => {
  const block = component();
  const markdown = block.toBlock({ code: 'a\r\nb\r\n\r\nc\r', language: 'toml\n```\n# injected' });
  assert.equal((await parse(markdown)).children.length, 1);
  assert.equal((await parse(markdown)).children[0].value, 'a\nb\n\nc\n');
  assert.equal(block.fromBlock(markdown.match(block.pattern)).language, '');
  for (const language of ['toml', 'bash', 'c++', 'c#', 'objective-c', 'text']) {
    const value = block.toBlock({ code: 'x', language });
    assert.equal((await parse(value)).children[0].lang, language);
  }
});
test('article and timeline editors share the new button and describe inline versus block code', () => {
  const config = yaml.load(fs.readFileSync(process.env.CODE_BLOCK_CONFIG || 'public/sveltia/config.yml', 'utf8'));
  const body = config.collections.find(c => c.name === 'post').fields.find(f => f.name === 'body');
  const note = config.collections.find(c => c.name === 'games').fields.find(f => f.name === 'events').fields.find(f => f.name === 'note');
  for (const field of [body, note]) {
    assert.ok(field.editor_components.includes('multiline-code-block'));
    assert.ok(field.editor_components.includes('code-block'), 'Keep existing standard fences supported');
    assert.match(field.hint, /插入代码块/); assert.match(field.hint, /行内/);
  }
  assert.match(fs.readFileSync('public/sveltia/index.html', 'utf8'), /custom\.js\?v=[\w-]+/);
});
test('the reported article configuration is one TOML block rather than separate inline code spans', async () => {
  const article = fs.readFileSync(process.env.CODE_BLOCK_ARTICLE || 'content/posts/magna-carta-2-cn.md', 'utf8');
  const tree = await parse(article);
  const blocks = tree.children.filter(node => node.type === 'code' && node.value.includes('title_name = "Magna Carta II KOR Graphics Candidates"'));
  assert.equal(blocks.length, 1, 'The reported configuration must be a single fenced block');
  assert.equal(blocks[0].lang, 'toml');
  assert.match(blocks[0].value, /^# 《真名法典2》韩版图形补丁：/);
  assert.match(article, /`xenia_canary\.exe`/, 'Keep unrelated inline code unchanged');
});
test('the actual article component renders one copy panel and copies all code lines', async () => {
  const ts = require('typescript'), renderer = require('react-test-renderer');
  const load = (file, imports = {}, globals = {}) => {
    const context = { exports: {}, URL, URLSearchParams, ...globals, require: name => name in imports ? imports[name] : require(name) };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, context);
    return context.exports;
  };
  const imports = {};
  for (const name of ['react-markdown', 'remark-gfm', 'remark-breaks']) imports[name] = { __esModule: true, default: (await import(name)).default };
  for (const name of ['game-frames', 'compare-markdown', 'markdown-utils']) imports['./' + name] = load('app/posts/' + name + '.ts');
  for (const name of ['./pdf-embed', './image-compare', '../games/game-frame-card', './retryable-image']) imports[name] = { __esModule: true, default: () => null };
  imports['../site-enhancements'] = { ReadingProgress: () => null, ShareButton: () => null };
  imports['../../lib/external-links'] = load('lib/external-links.ts');
  let copied;
  const { default: PostContent } = load('app/posts/post-content.tsx', imports, {
    document: {}, IntersectionObserver: class { observe() {} disconnect() {} },
    navigator: { clipboard: { writeText: async text => { copied = text; } } }, setTimeout() {},
  });
  const props = { compact: true, body: component().toBlock({ code: sample, language: 'toml' }), title: '', headings: [], images: [], games: [] };
  let tree;
  renderer.act(() => { tree = renderer.create(React.createElement(PostContent, props)); });
  assert.equal(tree.root.findAllByType('pre').length, 1);
  assert.equal(tree.root.findAllByType('code').length, 1);
  const buttons = tree.root.findAllByType('button').filter(button => button.props.className === 'code-copy');
  assert.equal(buttons.length, 1);
  await renderer.act(async () => { await buttons[0].props.onClick(); });
  assert.equal(copied, sample + '\n');
  renderer.act(() => tree.unmount());
});
