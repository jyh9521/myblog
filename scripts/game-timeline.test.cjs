const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const yaml = require('js-yaml'), React = require('react'), ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildAssetIndex } = require('./build-asset-index.cjs');
const { validateRepository } = require('./validate-content.cjs');
const config = yaml.load(fs.readFileSync('public/sveltia/config.yml', 'utf8'));

test('timeline has exactly six single-select events and reuses the article editor configuration', () => {
  const games = config.collections.find(c => c.name === 'games');
  const fields = games.fields.find(f => f.name === 'events').fields;
  const title = fields.find(f => f.name === 'title'), note = fields.find(f => f.name === 'note');
  assert.equal(title.widget, 'select'); assert.equal(title.required, true); assert.ok(!title.multiple);
  assert.deepEqual(title.options, ['开始游戏', '通关游戏', '开始汉化工作', '开始测试汉化', '已发布汉化补丁', 'AFK']);
  const body = config.collections.find(c => c.name === 'post').fields.find(f => f.name === 'body');
  assert.equal(note.widget, body.widget); assert.deepEqual(note.editor_components, body.editor_components);
  for (const name of fs.readdirSync('content/games')) {
    const data = require('gray-matter')(fs.readFileSync('content/games/' + name, 'utf8')).data;
    for (const event of data.events || []) assert.ok(title.options.includes(event.title), `${name}: ${event.title}`);
  }
  const wheel = require('gray-matter')(fs.readFileSync('content/games/the-wheel-of-time.md', 'utf8')).data;
  assert.equal(wheel.events.find(e => String(e.date).includes('2026') && e.note)?.title, '通关游戏');
});

test('shared article renderer supports compact timeline formats, line breaks and images without article chrome', async () => {
  const imports = {};
  for (const name of ['react-markdown', 'remark-gfm', 'remark-breaks']) imports[name] = { __esModule: true, ...(await import(name)) };
  const load = file => {
    const context = { exports: {}, URL, URLSearchParams, require: name => {
      if (imports[name]) return imports[name];
      if (name.startsWith('.')) {
        const full = path.resolve(path.dirname(file), name);
        if (['game-frames', 'compare-markdown', 'markdown-utils', 'external-links'].includes(path.basename(full))) return load(full + '.ts');
        if (name === './retryable-image') return { __esModule: true, default: ({ src, alt }) => React.createElement('img', { src, alt }) };
        return { __esModule: true, default: () => null, ReadingProgress: () => React.createElement('progress'), ShareButton: () => null };
      }
      return require(name);
    }};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
    return context.exports;
  };
  const Content = load('app/posts/post-content.tsx').default;
  const body = '## 标题\n\n**粗体** *斜体*\n换行\n\n1. 第一步\n2. 第二步\n\n> 引用\n\n|列|值|\n|-|-|\n|一|二|\n\n![截图](/uploads/test.png "图片说明")\n\n[外链](https://example.com)\n\n<script>alert(1)</script>';
  const props = { body, title: '事件', headings: [], images: [{src:'/uploads/test.png', alt:'截图',caption:'图片说明'}], games: [] };
  const html = renderToStaticMarkup(React.createElement(Content, {...props, compact:true}));
  for (const part of ['<h2>标题</h2>', '<strong>粗体</strong>', '<em>斜体</em>', '<br/>', '<ol>', '<li>第一步</li>', '<blockquote>', '<table>', 'src="/uploads/test.png"', '图片说明', 'target="_blank"']) assert.ok(html.includes(part), part);
  assert.doesNotMatch(html, /<progress|article-actions|post-toc|<script>/);
  assert.match(renderToStaticMarkup(React.createElement(Content,props)), /article-actions/);
  const css = fs.readFileSync('app/style.css','utf8');
  assert.doesNotMatch(css, /\.game-timeline (?:ol|li|strong|h2)[{:]/);
});

test('timeline Markdown assets are tracked and validated, including reference images, PDF and comparison images', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-timeline-'));
  try {
    for (const dir of ['content/games', 'public/uploads', 'public/sveltia']) fs.mkdirSync(path.join(root,dir),{recursive:true});
    fs.copyFileSync('public/sveltia/config.yml',path.join(root,'public/sveltia/config.yml'));
    for(const file of ['custom.js','r2-media.js','article-access.js','hltb.js','social-icons.js']) fs.copyFileSync('public/sveltia/'+file,path.join(root,'public/sveltia/'+file));
    const note = '![截图][shot]\n\n[shot]: /uploads/test.png\n\n[手册](/uploads/manual.pdf "pdf-embed")\n\n[compare]/uploads/before.png|/uploads/after.png|之前|之后[/compare]';
    const write = (text,title='通关游戏') => fs.writeFileSync(path.join(root,'content/games/test.md'),'---\n'+yaml.dump({ title:'测试游戏', events:[{title,note:text}] })+'---\n');
    for(const file of ['test.png','manual.pdf','before.png','after.png']) fs.writeFileSync(path.join(root,'public/uploads',file),'fixture');
    write(note);
    const index = await buildAssetIndex(root);
    assert.equal(index.files.length,4); for(const file of index.files) assert.equal(file.references[0].url,'/games/test/');
    assert.deepEqual((await validateRepository(root)).errors,[]);
    write(note+'\n\n![错误](/uploads/missing.png)','已通关');
    const {errors}=await validateRepository(root);
    assert.ok(errors.some(e=>e.includes('时间线事件无效'))); assert.ok(errors.some(e=>e.includes('missing.png')));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
