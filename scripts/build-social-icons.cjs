const fs = require('node:fs');
const path = require('node:path');
const { socialIconCatalog } = require('../lib/social-links.cjs');
const destination = path.join(__dirname, '../public/sveltia');
fs.mkdirSync(destination, { recursive: true });
const icons = socialIconCatalog();
fs.writeFileSync(path.join(destination, 'social-icon-catalog.json'), JSON.stringify(icons));
fs.copyFileSync(path.join(path.dirname(require.resolve('@fortawesome/free-brands-svg-icons')), 'LICENSE.txt'), path.join(destination, 'brand-icons-LICENSE.txt'));
console.log(`Social icons: ${icons.length} local brand icons generated.`);
