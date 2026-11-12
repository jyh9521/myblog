const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Public dossier covers retain their intrinsic ratio without clipping or a backdrop', () => {
  const css = fs.readFileSync('app/style.css', 'utf8');
  assert.match(css, /\.game-shelf-item\{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--dossier-cover-width\)/);
  assert.match(css, /\.game-detail>\.game-platform-panel \.game-platform-card\{grid-template-columns:var\(--dossier-cover-width\) minmax\(0,1fr\)/);
  const frame = css.match(/\.game-shelf-art,\.game-detail>\.game-platform-panel \.game-platform-art\{([^}]*)\}/)?.[1];
  assert.match(frame, /overflow:visible/);
  assert.doesNotMatch(frame, /aspect-ratio|background|border-radius/);
  assert.match(css, /\.game-shelf-art img,\.game-detail>\.game-platform-panel \.game-platform-art img\{[^}]*width:auto;height:auto;[^}]*max-width:100%;max-height:203px;object-fit:contain/);
  assert.match(css, /@media\(max-width:700px\)\{\.game-directory,\.game-detail\{--dossier-cover-width:clamp\(68px,23vw,100px\)/);
  assert.match(css, /\.game-shelf-art:not\(:has\(img\)\),[^{}]*\{aspect-ratio:2\/3;[^}]*background:/);
  assert.match(css, /\.game-shelf-art:has\(img\),\.game-detail>\.game-platform-panel \.game-platform-art:has\(img\)\{background:none\}/);
});
