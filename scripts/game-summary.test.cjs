const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

async function loadSummary() {
  const imports = {};
  for (const name of ['react-markdown', 'remark-gfm', 'remark-breaks', 'rehype-raw', 'rehype-sanitize']) {
    imports[name] = { __esModule: true, ...(await import(name)) };
  }
  function load(file) {
    const context = { exports: {}, URL, require: name => imports[name] || require(name) };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, context);
    return context.exports;
  }
  imports['../../lib/external-links'] = load('lib/external-links.ts');
  const component = load(process.env.SUMMARY_SOURCE || 'app/games/game-summary.tsx').default;
  return summary => renderToStaticMarkup(React.createElement(component, { summary }));
}

test('game summary renders real Markdown and HTML with sanitized attributes', async () => {
  const render = await loadSummary();
  const baseline = process.env.SUMMARY_BASELINE === '1';
  assert.equal(render('  \n'), '');
  const markdown = render('**加粗** and *斜体*\n下一行\n\n- 第一项\n- 第二项');
  assert.match(markdown, /<strong>加粗<\/strong>/);
  assert.match(markdown, /<em>斜体<\/em>/);
  assert.match(markdown, /<br\/>/);
  assert.match(markdown, /<ul>/);
  assert.match(render('| A | B |\n| - | - |\n| 1 | 2 |'), /<table>/);
  assert.match(render('~~删除~~'), /<del>删除<\/del>/);
  const html = render('**Markdown** 和 <em>HTML</em><br>换行');
  assert.match(html, baseline ? /&lt;em&gt;HTML/ : /<em>HTML<\/em><br\/>换行/);
  const block = render('<div>\n\n**块内加粗**\n\n</div>');
  assert.match(block, /<strong>块内加粗<\/strong>/);
  if (!baseline) {
    assert.match(block, /<div>\s*<p>/);
    assert.match(render('<details><summary>展开</summary>内容</details>'), /<details><summary>展开<\/summary>内容<\/details>/);
    const malicious = render('<script>alert(1)</script><iframe src="https://evil.example"></iframe>\n\n<a href="javascript:alert(1)" onclick="alert(1)">链接</a><img src="javascript:alert(1)" onerror="alert(1)"><span style="position:fixed" class="overlay">文字</span>');
    assert.doesNotMatch(malicious, /<script|<iframe|javascript:|onclick|onerror|position:fixed|overlay|alert\(1\)/);
    assert.match(malicious, /文字/);
  }
  for (const source of ['[外链](https://example.com)', '<a href="https://example.com">外链</a>']) {
    if (baseline && source.startsWith('<')) continue;
    assert.match(render(source), /target="_blank" rel="noopener noreferrer"/);
  }
  assert.doesNotMatch(render('[内部](/games/example/)'), /target="_blank"/);
  assert.match(render('![图片](/uploads/test.png "标题")'), /alt="图片" title="标题" loading="lazy"/);
  assert.match(render('`<em>原样</em>`'), /<code>&lt;em&gt;原样&lt;\/em&gt;<\/code>/);
  console.log(baseline ? 'SUMMARY_BASELINE: Markdown rendered; HTML escaped' : 'SUMMARY_MODIFIED: Markdown + HTML rendered; unsafe markup removed');
});

test('reviewed summary and provenance round-trip without changing legacy strings or exposing unsafe URLs', () => {
  const context = { exports: {}, URL, process, require: name => name.startsWith('./') || name.startsWith('../public/') ? {} : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/games.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, context);
  const { readGameSummary } = context.exports;
  assert.equal(readGameSummary(' **原有**简介 ', '旧资料').summary, '**原有**简介');
  assert.equal(readGameSummary(undefined, '旧资料').summary, '旧资料');
  const text = '审核后的简体中文简介。';
  const source = { url: 'https://store.steampowered.com/app/620/?l=schinese', label: '任意输入不能改掉来源名称' };
  const matter = require('gray-matter');
  const saved = matter(matter.stringify('', { summary: { text, source, method: 'rewrite' } })).data.summary;
  assert.equal(readGameSummary(saved, '旧资料').summary, text);
  assert.equal(readGameSummary(saved, '旧资料').summarySource.label, 'Steam');
  for (const url of ['javascript:alert(1)', 'https://store.steampowered.com.fake/app/620/', 'https://token@store.steampowered.com/app/620/']) {
    assert.equal(readGameSummary({ text, source: { url } }, '').summarySource, undefined);
  }
  assert.doesNotMatch(fs.readFileSync('app/games/[slug]/page.tsx', 'utf8'), /summarySource.*dangerouslySetInnerHTML/);
});
