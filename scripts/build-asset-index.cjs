const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const matter = require('gray-matter');
const { execFileSync } = require('node:child_process');
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isSymbolicLink() ? [] : entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
function assetPath(value, base) {
  try {
    const url = new URL(value, `https://blog.blfy.cc${base}`);
    if (url.origin !== 'https://blog.blfy.cc' || !url.pathname.startsWith('/uploads/')) return null;
    return decodeURIComponent(url.pathname);
  } catch { return null; }
}
async function buildAssetIndex(root = process.cwd()) {
  const { unified } = await import('unified');
  const { default: remarkParse } = await import('remark-parse');
  const parser = unified().use(remarkParse), references = new Map();
  for (const file of walk(path.join(root, 'content')).filter(file => file.endsWith('.md'))) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const { data, content } = matter(fs.readFileSync(file, 'utf8'));
    const slug = path.basename(file, '.md'), type = relative.includes('/posts/') ? 'posts' : relative.includes('/games/') ? 'games' : '';
    const route = type ? `/${type}/${slug}/` : `/${slug}/`;
    const ref = { file: relative, title: String(data.title || slug), url: route };
    const collect = value => { const key = typeof value === 'string' ? assetPath(value, route) : null; if (key) { if (!references.has(key)) references.set(key, new Map()); references.get(key).set(relative, ref); } };
    const visitData = value => { if (Array.isArray(value)) value.forEach(visitData); else if (value && typeof value === 'object') Object.values(value).forEach(visitData); else collect(value); };
    visitData(data);
    const visit = node => { collect(node.url); if (node.type === 'html') for (const match of node.value.matchAll(/(?:src|href)=["']([^"']+)["']/g)) collect(match[1]); if (node.type === 'text') for (const match of node.value.matchAll(/\[compare\]([^|\]]+)\|([^|\]]+)/g)) { collect(match[1]); collect(match[2]); } (node.children || []).forEach(visit); };
    visit(parser.parse(content));
  }
  const files = walk(path.join(root, 'public/uploads')).filter(file => !path.basename(file).startsWith('.')).map(file => {
    const url = '/' + path.relative(path.join(root, 'public'), file).replaceAll('\\', '/');
    const bytes = fs.readFileSync(file);
    return { path: url, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), image: /\.(avif|png|jpe?g|gif|webp|svg|bmp)$/i.test(file), pdf: /\.pdf$/i.test(file), references: [...(references.get(url)?.values() || [])] };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const groups = new Map(); files.forEach(file => { if (!groups.has(file.sha256)) groups.set(file.sha256, []); groups.get(file.sha256).push(file.path); });
  files.forEach(file => { file.duplicates = groups.get(file.sha256).filter(name => name !== file.path); });
  let commit = 'local'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  return { commit, generatedAt: new Date().toISOString(), files };
}
module.exports = { buildAssetIndex, assetPath };
if (require.main === module) buildAssetIndex().then(index => {
  const target = path.join(process.cwd(), 'public/sveltia/assets.json');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(index));
  console.log(`Asset index: ${index.files.length} files, ${index.files.filter(file => !file.references.length).length} unreferenced, ${index.files.filter(file => file.duplicates.length).length} duplicate-group files.`);
}).catch(error => { console.error(error); process.exitCode = 1; });
