const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');

const version = '0.256.1';
const sourceHash = 'b1692493e7bb56303a5bfab08f09d334f2ed0e85b96b17d0f2e2cccb10724cb6';
const output = 'public/sveltia/sveltia-cms-0.256.1-draft-slug.js';

// 0.256.1's custom controls get the original entry slug, not the live draft
// slug. Forward the value used by the sidebar: explicit edit, then template.
// Use a distinct prop so existing CMS controls retain their entry semantics.
const marker = 'let u=i?e4({draft:i,locale:a}):void 0;return{value:r,field:Z2(n),';
const replacement = 'let u=i?e4({draft:i,locale:a}):void 0;return{value:r,field:Z2(n),...(i?.collectionName===`games`?{draftSlug:(R4(i,a)||H4({draft:i,templateOnly:!0}).defaultLocaleSlug)}:{}),';

function patch(source) {
  if (source.split(marker).length !== 2) throw Error('Sveltia widget bridge changed; review the draft slug patch.');
  return source.replace(marker, replacement);
}

async function build() {
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
      if (createHash('sha256').update(bytes).digest('hex') !== sourceHash) throw Error('Sveltia upstream SHA-256 mismatch');
      writeFileSync(output, patch(bytes.toString('utf8')));
      console.log(`Built ${output}`);
      return;
    } catch (error) {
      failure = error;
      console.error(`${url}: ${error.message}`);
    }
  }
  throw failure;
}

if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { patch };
