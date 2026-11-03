const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const ts = require('typescript'), yaml = require('js-yaml');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Minimal UI doubles exercise event wiring; native dialog/selection/save are
// additionally checked in a real browser with the pinned CMS, not inferred here.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.events = {}; this.style = {}; this.value = ''; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, listener) { this.events[name] = listener; }
  dispatch(name, extra = {}) { return this.events[name]?.({ preventDefault() {}, stopPropagation() {}, ...extra }); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  focus() { this.focused = true; }
  get validity() { return { valid: !this.value || !this.pattern || new RegExp(`^(?:${this.pattern})$`).test(this.value) }; }
  reportValidity() { return all(this).every(node => node.validity.valid && (!node.required || node.value)); }
}
const all = root => [root, ...root.children.flatMap(all)];
function cms(available = true) {
  let component, retry;
  const body = new Element('body');
  const window = { setInterval: fn => { retry = fn; return 1; }, clearInterval() {}, CMS: available ? { registerEditorComponent: definition => { component = definition; } } : null };
  vm.runInNewContext(fs.readFileSync('public/sveltia/text-style.js', 'utf8'), { window, document: { body, createElement: tag => new Element(tag) } });
  return { get component() { return component; }, body, window, retry: () => retry() };
}
function markdownUtils() {
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/posts/markdown-utils.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
async function render(value, headings = false) {
  const { default: Markdown } = await import('react-markdown');
  const { default: gfm } = await import('remark-gfm');
  const { remarkTextStyles, remarkHeadingIds } = markdownUtils();
  return renderToStaticMarkup(React.createElement(Markdown, { remarkPlugins: [gfm, remarkTextStyles, ...(headings ? [remarkHeadingIds] : [])] }, value));
}

test('public inline component registers at startup and retries asynchronous CMS loading', () => {
  const { component } = cms();
  assert.equal(component.id, 'text-style'); assert.equal(component.type, 'inline');
  assert.equal(component.label, '文字颜色与大小'); assert.equal(typeof component.onInsert, 'function'); assert.equal(typeof component.onEdit, 'function');
  const delayed = cms(false); let registered;
  delayed.window.CMS = { registerEditorComponent: value => { registered = value; } }; delayed.retry();
  assert.equal(registered.id, component.id);
});

test('every color/size/default round-trips including literal HTML, Markdown, entities, emoji and CJK', () => {
  const { component } = cms();
  for (const color of ['', '#dc2626', '#12ABef']) for (const size of ['', '12', '14', '16', '18', '20', '24', '28', '32', '40', '48']) {
    const data = { text: '中文 日本語 🙂 <img onerror="x"> &amp; &#38; *粗体* [链接](url) `代码` \\ | [/span]', color, size };
    const block = component.toInline(data), match = block.match(component.pattern);
    assert.ok(match); assert.equal(match[0], block);
    const restored = component.fromInline(match);
    assert.equal(restored.text, data.text); assert.equal(restored.color, color.toLowerCase()); assert.equal(restored.size, size);
    assert.equal(component.toInline(restored), block);
    assert.equal(component.toPreview(restored).textContent, data.text);
  }
  assert.ok(component.toInline({}).match(component.pattern));
});

test('invalid style values never become CSS, including injection through the serialized contract', async () => {
  const { component } = cms();
  const block = component.toInline({ text: '<script>alert(1)</script>', color: 'red;background:url(x)', size: '99999' });
  assert.match(block, /data-text-color="" data-text-size=""/);
  assert.equal(component.toPreview({ color: 'red', size: 'expression(x)' }).style.fontSize, '');
  const html = await render(block);
  assert.doesNotMatch(html, /<script|<img|style=/);
  assert.match(html, /&lt;script&gt;/);
  for (const raw of [
    '<span data-text-color="#dc2626" data-text-size="9999">bad</span>',
    '<span data-text-color="red;background:url(x)" data-text-size="24">bad</span>',
    '<span data-text-color="#dc2626" data-text-size="24" onclick="alert(1)">bad</span>',
    '<span style="position:fixed">bad</span>', '<script>alert(1)</script>',
  ]) assert.doesNotMatch(await render(raw), /<span|<script|onclick="/);
});

test('public rendering keeps literal text, surrounding markup and adjacent styled spans', async () => {
  const { component } = cms();
  const block = component.toInline({ text: '中文*[测试]* & <b>原文</b> |', color: '#DC2626', size: '24' });
  const html = await render(`前文 **粗体** ${block}${component.toInline({ text: '默认' })} *斜体* [链接](https://example.com)`);
  assert.match(html, /<strong>粗体<\/strong>/); assert.match(html, /<em>斜体<\/em>/);
  assert.match(html, /<span style="color:#dc2626;font-size:24px">中文\*\[测试\]\* &amp; &lt;b&gt;原文&lt;\/b&gt; \|<\/span><span>默认<\/span>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /<b>|data-text-color/);
  const table = await render(`|内容|\n|---|\n|${block}|`);
  assert.match(table, /<td><span style=/);
  const code = await render('`' + block + '`\n\n```html\n' + block + '\n```');
  assert.doesNotMatch(code, /<span style=/); assert.match(code, /&lt;span/);
});

test('styles work inside Markdown formatting and heading anchors match generated TOC IDs', async () => {
  const { component } = cms(), { extractHeadings } = markdownUtils();
  const block = component.toInline({ text: '汉化 & 测试', size: '28' });
  const body = `## ${block}\n\n**${block}**\n\n${block}`;
  const html = await render(body, true);
  assert.match(html, new RegExp(`<h2 id="${extractHeadings(body)[0].id}">`));
  assert.match(html, /<strong><span style="font-size:28px">汉化 &amp; 测试<\/span><\/strong>/);
  assert.equal(extractHeadings(body)[0].text, '汉化 & 测试');
});

test('selection dialog applies preset/custom styles, defaults and updates text without dropdowns', async () => {
  const { component, body } = cms();
  let pending = component.onInsert({ selectedText: '选中的文字' });
  let dialog = body.children[0];
  const find = (tag, text) => all(dialog).find(node => node.tag === tag && (!text || node.textContent === text));
  assert.equal(find('textarea').value, '选中的文字'); assert.equal(find('select'), undefined);
  find('button', '红色').dispatch('click'); find('button', '24 px').dispatch('click');
  find('form').dispatch('submit');
  const result = await pending; assert.deepEqual({ ...result }, { text: '选中的文字', color: '#dc2626', size: '24' });
  assert.equal(body.children.length, 0);
  pending = component.onEdit({ data: result }); dialog = body.children[0];
  const hex = all(dialog).find(node => node.name === 'color'); hex.value = '#12ABef'; hex.dispatch('input');
  find('form').dispatch('submit'); assert.equal((await pending).color, '#12abef');
  pending = component.onEdit({ data: result }); dialog = body.children[0];
  find('button', '恢复默认').dispatch('click'); find('form').dispatch('submit');
  assert.deepEqual({ ...await pending }, { text: '选中的文字', color: '', size: '' });
});

test('cancel leaves data unchanged, invalid custom colors and multiline/empty text block apply', async () => {
  const { component, body } = cms();
  const data = { text: '保留', color: '#dc2626', size: '24' };
  let pending = component.onEdit({ data }); let dialog = body.children[0];
  const button = label => all(dialog).find(node => node.tag === 'button' && node.textContent === label);
  button('蓝色').dispatch('click'); button('取消').dispatch('click');
  assert.equal(await pending, null); assert.equal(data.color, '#dc2626');
  pending = component.onInsert({ selectedText: '多段\n文字' }); dialog = body.children[0];
  assert.equal(button('应用').disabled, true); dialog.close(); await pending;
  pending = component.onInsert({ selectedText: '' }); dialog = body.children[0];
  assert.equal(button('应用').disabled, true); dialog.close(); await pending;
  pending = component.onEdit({ data }); dialog = body.children[0];
  const hex = all(dialog).find(node => node.name === 'color'); hex.value = '#fff'; hex.dispatch('input');
  all(dialog).find(node => node.tag === 'form').dispatch('submit'); assert.equal(dialog.open, true);
  dialog.close(); assert.equal(await pending, null);
});

test('CMS assets/config and all rich text consumers enable the same bounded format', () => {
  const config = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8'));
  const body = config.collections.find(c => c.name === 'post').fields.find(f => f.name === 'body');
  const note = config.collections.find(c => c.name === 'games').fields.find(f => f.name === 'events').fields.find(f => f.name === 'note');
  assert.ok(body.editor_components.includes('text-style')); assert.deepEqual(note.editor_components, body.editor_components);
  const index = fs.readFileSync('public/sveltia/index.html', 'utf8');
  for (const file of ['text-style.js', 'text-style.css']) assert.ok(index.includes(`/sveltia/${file}?v=`));
  for (const file of ['app/posts/post-content.tsx', 'app/about/page.tsx']) assert.match(fs.readFileSync(file, 'utf8'), /remarkPlugins=\{\[[^\]]*remarkTextStyles/);
  assert.match(fs.readFileSync('scripts/validate-content.cjs', 'utf8'), /'text-style.js'/);
});
