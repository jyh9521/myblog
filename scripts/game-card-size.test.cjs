const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Public dossier covers use portrait frames without letterboxing', () => {
  const css = fs.readFileSync('app/style.css', 'utf8');
  assert.match(css, /\.game-shelf-item\{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--dossier-cover-width\)/);
  assert.match(css, /\.game-detail>\.game-platform-panel \.game-platform-card\{grid-template-columns:var\(--dossier-cover-width\) minmax\(0,1fr\)/);
  assert.match(css, /\.game-shelf-art,\.game-detail>\.game-platform-panel \.game-platform-art\{[^}]*width:100%;aspect-ratio:9\/16/);
  assert.match(css, /\.game-shelf-art img,\.game-detail>\.game-platform-panel \.game-platform-art img\{[^}]*width:100%;height:100%;[^}]*object-fit:cover/);
  assert.match(css, /@media\(max-width:700px\)\{\.game-directory,\.game-detail\{--dossier-cover-width:clamp\(68px,23vw,100px\)/);
  assert.match(css, /\.game-shelf-art:not\(:has\(img\)\)\{background:/);
  assert.match(css, /\.game-detail>\.game-platform-panel \.game-platform-art:has\(img\)\{background:none\}/);
});
