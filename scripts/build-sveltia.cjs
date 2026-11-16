const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');

const version = '0.256.1';
const sourceHash = 'b1692493e7bb56303a5bfab08f09d334f2ed0e85b96b17d0f2e2cccb10724cb6';
const output = 'public/sveltia/sveltia-cms-0.256.1-draft-slug.js';

// 0.256.1's custom controls get the original entry slug, not the live draft
// slug. Forward the value used by the sidebar: explicit edit, then template.
// Use a distinct prop so existing CMS controls retain their entry semantics.
const marker = 'let u=i?e4({draft:i,locale:a}):void 0;return{value:r,field:Z2(n),';
const replacement = 'let u=i?e4({draft:i,locale:a}):void 0;return{value:r,field:Z2(n),...(i?.collectionName===`games`?{draftSlug:(R4(i,a)||H4({draft:i,templateOnly:!0}).defaultLocaleSlug)}:{}),';

const patches = [
  { name: 'draft slug', marker, replacement },
  {
    // At the beginning of a nonempty list item, split before the item instead
    // of leaving an empty numbered item in the preceding list.
    name: 'ordered list start boundary',
    marker: 'if(!n.canBeEmpty()||!i(n,`first`))return e}let r=bb(',
    replacement: 'if(Nw(n)||!n.canBeEmpty()||!i(n,`first`))return e}let r=bb(',
  },
  {
    // Lexical's caret-based block insertion copies a ListNode without running
    // its structure-split hook. Count the items left in the original list after
    // moving the trailing children, including non-1 starts and nested lists.
    name: 'ordered list block split',
    marker: '&&o.insert(t(n).splice(0,0,r))}var s;return o}function yh(',
    replacement: '&&(()=>{let e=t(n).splice(0,0,r);Aw(e)&&e.INTERNAL_$afterStructureSplit(n,n.getChildren());o.insert(e)})()}var s;return o}function yh(',
  },
  {
    // Enter on an empty list item removes that item. Continue at its number,
    // rather than resetting the list that follows the new paragraph to 1.
    name: 'ordered list empty item exit',
    marker: 'n.length?e.registerCommand(Od,()=>Dfe(),2):void 0',
    replacement: 'n.length?e.registerCommand(Od,()=>Dfe(!0),2):void 0',
  },
  {
    // Inserting a block on the empty item made by one Enter should use that
    // space, just as exiting the item with a second Enter would do.
    name: 'ordered list empty block insertion',
    marker: 'iO=e=>{let t=$()??Qy();t&&!$()&&ig(t.clone());let n=Q(t)?t.anchor.getNode():null;',
    replacement: 'iO=e=>{let t=$()??Qy();t&&!$()&&ig(t.clone());Q(t)&&Dfe(!0)&&(t=$());let n=Q(t)?t.anchor.getNode():null;',
  },
];

function patch(source) {
  for (const { name, marker, replacement } of patches) {
    if (source.split(marker).length !== 2) throw Error(`Sveltia ${name} changed; review the patch.`);
    source = source.replace(marker, replacement);
  }
  return source;
}

function verifySource(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== sourceHash) throw Error('Sveltia upstream SHA-256 mismatch');
  return bytes.toString('utf8');
}

async function loadSource() {
  // Reuse a previously generated bundle only if reversing our patches yields
  // the exact pinned upstream bytes. This also works with the older slug patch.
  try {
    let source = readFileSync(output, 'utf8');
    for (const { marker, replacement } of [...patches].reverse()) source = source.replace(replacement, marker);
    return verifySource(Buffer.from(source));
  } catch {}
  const urls = [
    `https://unpkg.com/@sveltia/cms@${version}/dist/sveltia-cms.js`,
    `https://cdn.jsdelivr.net/npm/@sveltia/cms@${version}/dist/sveltia-cms.js`,
  ];
  let failure;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return verifySource(bytes);
    } catch (error) {
      failure = error;
      console.error(`${url}: ${error.message}`);
    }
  }
  throw failure;
}

async function build() {
  writeFileSync(output, patch(await loadSource()));
  console.log(`Built ${output}`);
}

if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { patch, loadSource, build };
