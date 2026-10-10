const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('footer removes duplicate navigation and retains identity, statistics and top navigation', () => {
  const layout=fs.readFileSync('app/layout.tsx','utf8');
  const footer=layout.slice(layout.indexOf('<footer'),layout.indexOf('</footer>'));
  assert.ok(!footer.includes('footer-links'));
  for(const label of ['RSS 订阅','游戏档案','关于我','NS群群号发布页'])assert.ok(!footer.includes(label));
  assert.equal((footer.match(/className="footer-admin"/g) || []).length, 1);
  assert.ok(footer.includes('className="footer-admin" href="/sveltia/">管理</a>'));
  assert.ok(footer.includes('footer-brand'));assert.ok(footer.includes('<VisitorCounter />'));assert.ok(footer.includes('<FooterEasterEgg />'));
  assert.ok(layout.includes('aria-label="主导航"'));assert.ok(layout.includes('<BackToTop />'));
  assert.ok(!fs.readFileSync('app/style.css','utf8').includes('.footer-links'));
});
