const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const matter = require('gray-matter');

function galleryHarness(images = []) {
  const components = {}, uploads = [];
  const context = {
    window: {
      CMS: { registerFieldType: (name, value) => components[name] = value, registerEditorComponent() {}, registerEventListener() {} },
      createClass: value => value,
      h: (tag, props, ...children) => ({ tag, props, children }),
      BlogAdminAuth: { request: async url => {
        const params = new URL(url, 'https://fixture.test').searchParams;
        uploads.push(params.get('name'));
        return Response.json({ path: '/uploads/' + encodeURIComponent(params.get('name')), folder: params.get('folder') });
      } },
    },
    File, Blob, AbortSignal,
  };
  vm.runInNewContext(fs.readFileSync(process.env.R2_MEDIA_SOURCE || 'public/sveltia/r2-media.js', 'utf8'), context);
  const component = components['screenshot-gallery'];
  const gallery = { ...component, state: component.getInitialState(), props: {
    draftSlug: 'screenshot-order', value: { enabled: true, images: [...images] },
    onChange: value => gallery.props.value = value,
  }, setState: patch => Object.assign(gallery.state, patch) };
  return { gallery, uploads };
}

const file = (name, lastModified = 1) => new File(['fixture'], name, { type: 'image/png', lastModified });
const names = gallery => Array.from(gallery.props.value.images, src => decodeURIComponent(src.split('/').pop()));

test('PS5 title-prefixed capture times win over reversed file modification times', async () => {
  const expected = [
    'FINAL FANTASY VII REMAKE_20260203121921.jpg',
    'FINAL FANTASY VII REMAKE_20260508094734.jpg',
    'FINAL FANTASY VII REMAKE_20260623190436.png',
  ];
  const { gallery, uploads } = galleryHarness();
  await gallery.addFiles([...expected].reverse().map((name, index) => file(name, index + 1)));
  assert.deepEqual(uploads, expected);
  assert.deepEqual(names(gallery), expected);
});

test('PS5 Unicode, spaces and underscores merge with encoded existing paths chronologically', async () => {
  const old = '星球大战 绝地：幸存者™_20250323224848.png';
  const middle = 'DEATH STRANDING 2_ ON THE BEACH_20250726105631.jpg';
  const newest = 'Ghost of Yōtei_20251010234538.jpg';
  const { gallery } = galleryHarness(['/uploads/' + encodeURIComponent(newest), '/uploads/manual.png', '/uploads/' + encodeURIComponent(old)]);
  await gallery.addFiles([file(middle)]);
  assert.deepEqual(names(gallery), [old, 'manual.png', middle, newest]);
});

test('Steam timestamp and numeric suffix ordering stays unchanged', async () => {
  const expected = ['20250326151755_1.jpg', '20250326151755_2.jpg', '20250401171118_1.jpg'];
  const { gallery } = galleryHarness();
  await gallery.addFiles([file(expected[2], 1), file(expected[0], 3), file(expected[1], 2)]);
  assert.deepEqual(names(gallery), expected);
});

test('Switch hundredths and separated timestamps keep their existing ascending order', async () => {
  const expected = ['2025032615175500_c.jpg', '2025032615175501_c.jpg', '2025-03-26_15-17-56.png'];
  const { gallery } = galleryHarness();
  await gallery.addFiles([...expected].reverse().map((name, index) => file(name, index + 1)));
  assert.deepEqual(names(gallery), expected);
});

test('unknown names and invalid PS5 dates still use modification time; equal captures remain stable', async () => {
  const expected = ['NINJA_GAIDEN_2_Black_0020.jpg', 'Title_20250230120000.png', 'Title_20250326250000.png', 'Title_20250326120000_notes.png'];
  const { gallery } = galleryHarness();
  await gallery.addFiles([...expected].reverse().map(name => file(name, expected.indexOf(name) + 1)));
  assert.deepEqual(names(gallery), expected);
  const same = ['Title_20250326120000.png', 'Title_20250326120000.jpg'];
  const equal = galleryHarness();
  await equal.gallery.addFiles(same.map(name => file(name)));
  assert.deepEqual(names(equal.gallery), same);
});

test('saved PS5 galleries are chronological, including the 96-image FFVII gallery', () => {
  let galleries = 0;
  for (const filename of fs.readdirSync('content/games')) {
    const text = fs.readFileSync('content/games/' + filename, 'utf8');
    const { data } = matter(text);
    if (!data.gameMetadata?.selectedPlatforms?.includes('PlayStation 5')) continue;
    const block = text.match(/^screenshotGallery:\r?\n(?:(?:[ \t].*|)\r?\n)*/m)?.[0] || '';
    const captures = [...block.matchAll(/^    - (\/uploads\/[^\r\n]+)$/gm)].map(match => {
      const name = decodeURIComponent(match[1].trim().split('/').pop());
      return name.match(/^.+_(20\d{12})\.(?:png|jpe?g|webp|gif|avif)$/i)?.[1];
    }).filter(Boolean);
    if (captures.length < 2) continue;
    galleries++;
    assert.deepEqual(captures, [...captures].sort(), filename);
    if (filename === 'final-fantasy-vii-remake-intergrade.md') {
      assert.equal(captures.length, 96);
      assert.equal(captures[0], '20260203121921');
      assert.equal(captures.at(-1), '20260623190436');
    }
  }
  assert.ok(galleries >= 1, 'must exercise saved PS5 galleries');
});
