const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Read the actual theme and code declarations, rather than duplicating the
// intended palette in a fixture. Browser computed styles are verified separately.
const css = fs.readFileSync(process.env.CODE_THEME_CSS || 'app/style.css', 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
function declarations(selector) {
  return Object.fromEntries(rules.filter(([, selectors]) => selectors.trim().split(',').map(s => s.trim()).includes(selector))
    .flatMap(([, , body]) => body.split(';').filter(Boolean).map(declaration => {
      const colon = declaration.indexOf(':');
      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
    })));
}
function style(theme, kind) {
  const variables = { ...declarations(':root'), ...(theme === 'dark' ? declarations(':root[data-theme="dark"]') : {}) };
  const resolve = value => value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert.ok(variables[name], `Missing theme variable ${name}`); return resolve(variables[name]);
  });
  const inline = declarations('.body code'), pre = declarations('.body pre');
  let parent = { color: variables['--ink'], ...pre };
  if (kind === 'fenced') parent = { ...parent, ...declarations('.code-block pre') };
  const code = kind === 'inline' ? inline : { ...inline, ...declarations('.body pre code') };
  let color = code.color;
  if (!color || color === 'inherit') color = kind === 'inline' ? variables['--ink'] : parent.color;
  let background = code.background;
  if (!background || ['none', 'transparent'].includes(background)) background = parent.background;
  return { color: resolve(color), background: resolve(background) };
}
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast({ color, background }) {
  const values = [luminance(color), luminance(background)].sort((a, b) => a - b);
  return (values[1] + .05) / (values[0] + .05);
}
function readable(theme, kind) {
  const colors = style(theme, kind), ratio = contrast(colors);
  assert.ok(ratio >= 4.5, `${theme} ${kind}: color=${colors.color} background=${colors.background} contrast=${ratio.toFixed(2)} < 4.5`);
  return colors;
}

test('night mode inline code stays readable against its own background', () => {
  const colors = readable('dark', 'inline');
  assert.ok(luminance(colors.background) < .1, 'Night inline code should not retain a bright day background');
});
test('night mode plain pre/code stays readable on About and shared body consumers', () => {
  readable('dark', 'plain');
});
test('day mode inline code keeps the existing day palette', () => {
  assert.deepEqual(readable('light', 'inline'), { color: '#22252b', background: '#f3f4f7' });
});
test('fenced code keeps its dark panel, inherited foreground and transparent inner code in both themes', () => {
  for (const theme of ['light', 'dark']) assert.deepEqual(readable(theme, 'fenced'), { color: '#e7e9ed', background: '#171a21' });
  assert.equal(declarations('.body pre code').background, 'none');
  assert.equal(declarations('.body pre code').padding, '0');
});
