const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const yaml = require('js-yaml');
const origin = 'https://blog.blfy.cc';
const filesIn = (dir, extension = '.md') => fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file.endsWith(extension)) : [];

async function validateRepository(root = process.cwd()) {
  const errors = [], warnings = [], remote = new Set();
  const postsDir = path.join(root, 'content/posts'), gamesDir = path.join(root, 'content/games');
  const posts = filesIn(postsDir), games = new Set(filesIn(gamesDir).map(file => file.slice(0, -3)));
  const routes = new Set(['/', '/posts/', '/games/', '/about/', '/ns/', '/sveltia/', '/feed.xml', '/game-dossiers.json',
    ...posts.map(file => `/posts/${file.slice(0, -3)}/`), ...[...games].map(slug => `/games/${slug}/`)]);
  const error = (file, text) => errors.push(`${file}: ${text}`);
  let config;
  try { config = yaml.load(fs.readFileSync(path.join(root, 'public/sveltia/config.yml'), 'utf8')); }
  catch (e) { error('CMS config', `YAML 格式错误：${e.message}`); }
  const custom = ['custom.js', 'hltb.js'].map(file => fs.existsSync(path.join(root, 'public/sveltia', file)) ? fs.readFileSync(path.join(root, 'public/sveltia', file), 'utf8') : '').join('\n');
  if (config) {
    if (config.backend?.name !== 'github' || !config.backend.repo || !config.backend.branch) error('CMS config', 'GitHub backend 配置不完整');
    if (!Array.isArray(config.collections)) error('CMS config', 'collections 必须为数组');
    const builtin = new Set(['string', 'text', 'richtext', 'markdown', 'boolean', 'datetime', 'image', 'file', 'list', 'object', 'select', 'number', 'hidden', 'relation', 'map', 'color', 'code', 'uuid']);
    const registered = new Set([...custom.matchAll(/registerFieldType\(['"]([^'"]+)/g)].map(match => match[1]));
    const collections = config.collections || [];
    const fieldExists = (fields, dotted) => {
      const [head, ...tail] = dotted.split('.');
      const field = fields?.find(item => item.name === head);
      return !!field && (!tail.length || fieldExists(field.fields, tail.join('.')));
    };
    const inspectFields = (fields, label) => {
      if (!Array.isArray(fields)) { error(label, 'fields 必须为数组'); return; }
      const names = new Set();
      for (const field of fields) {
        if (!field.name || names.has(field.name)) error(label, `字段名缺失或重复：${field.name}`);
        names.add(field.name);
        if (!builtin.has(field.widget || 'string') && !registered.has(field.widget)) error(label, `未注册组件：${field.widget}`);
        if (field.pattern) { try { new RegExp(field.pattern[0]); } catch { error(label, `${field.name} 的 pattern 无效`); } }
        if (field.widget === 'relation') {
          const target = collections.find(item => item.name === field.collection);
          if (!target) error(label, `${field.name} 引用不存在的 collection：${field.collection}`);
          for (const search of field.search_fields || []) if (!fieldExists(target?.fields, search)) error(label, `${field.name} 引用未声明的检索字段：${search}`);
        }
        for (const component of field.editor_components || []) if (!['image', 'code-block'].includes(component) && !custom.includes(`id: '${component}'`)) error(label, `未注册编辑器按钮：${component}`);
        if (field.fields) inspectFields(field.fields, `${label}.${field.name}`);
      }
    };
    const names = new Set();
    for (const collection of collections) {
      if (!collection.name || names.has(collection.name)) error('CMS config', `collection 名缺失或重复：${collection.name}`);
      names.add(collection.name);
      if (collection.fields) inspectFields(collection.fields, `CMS ${collection.name}`);
      for (const file of collection.files || []) inspectFields(file.fields, `CMS ${collection.name}.${file.name}`);
    }
  }
  const { unified } = await import('unified');
  const { default: remarkParse } = await import('remark-parse');
  const parser = unified().use(remarkParse);
  const checkUrl = (value, file, base, kind = '链接') => {
    if (!value || typeof value !== 'string' || /^(?:mailto:|tel:|#)/i.test(value)) return;
    let url;
    try { url = new URL(value, `${origin}${base}`); } catch { error(file, `${kind}网址无效：${value}`); return; }
    if (!['http:', 'https:'].includes(url.protocol)) { error(file, `${kind}协议无效：${value}`); return; }
    if (url.origin !== origin) { remote.add(url.href); return; }
    // Worker-backed images are not static files; their availability is checked separately.
    if (url.pathname === '/ns/api/games/media') { remote.add(url.href); return; }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { error(file, `路径编码错误：${value}`); return; }
    const normalized = pathname.endsWith('/') || path.extname(pathname) ? pathname : `${pathname}/`;
    if (routes.has(normalized)) return;
    const asset = path.resolve(root, 'public', `.${pathname}`);
    if (!asset.startsWith(path.resolve(root, 'public') + path.sep) || !fs.existsSync(asset) || fs.statSync(asset).isDirectory()) error(file, `${kind}不存在：${value}`);
  };
  const entries = [...posts.map(file => ['posts', file]), ...filesIn(gamesDir).map(file => ['games', file]), ...filesIn(path.join(root, 'content')).map(file => ['', file])];
  for (const [folder, name] of entries) {
    const filename = `content/${folder ? folder + '/' : ''}${name}`, full = path.join(root, filename);
    let data, content;
    try { ({ data, content } = matter(fs.readFileSync(full, 'utf8'))); } catch (e) { error(filename, `frontmatter 错误：${e.message}`); continue; }
    const base = folder ? `/${folder}/${name.slice(0, -3)}/` : '/about/';
    if (folder === 'games' && data.personalRating !== undefined && data.personalRating !== null && String(data.personalRating).trim() !== '') {
      const score = Number(data.personalRating);
      if (!['number', 'string'].includes(typeof data.personalRating) || !Number.isFinite(score) || score < 0 || score > 10) error(filename, '个人评分必须是 0–10 之间的数字');
    }
    if (data.gameSlug && !games.has(data.gameSlug)) error(filename, `关联的游戏档案不存在：${data.gameSlug}`);
    if (data.projects !== undefined && !Array.isArray(data.projects)) error(filename, '关联 GitHub 项目必须为列表');
    const projectRepos = new Set();
    for (const project of Array.isArray(data.projects) ? data.projects : []) {
      try {
        const url = new URL(project.url);
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || !/^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)) throw Error('填写完整 HTTPS GitHub 仓库地址');
        const repo = url.pathname.replace(/\/$/, '').replace(/\.git$/, '');
        if (projectRepos.has(repo.toLowerCase())) throw Error('仓库重复');
        projectRepos.add(repo.toLowerCase());
        if (project.releaseUrl) {
          const release = new URL(project.releaseUrl);
          // GitHub owner/repository identities are case-insensitive; release tags are not.
          const releaseParts = release.pathname.split('/');
          const releaseRepo = `/${releaseParts[1]}/${releaseParts[2]}`;
          if (release.origin !== url.origin || release.username || release.password || releaseRepo.toLowerCase() !== repo.toLowerCase() || releaseParts[3] !== 'releases') throw Error('发布页必须属于该仓库的 Releases');
        }
        checkUrl(project.url, filename, base, '项目'); checkUrl(project.releaseUrl, filename, base, '项目发布页');
      } catch (e) { error(filename, `GitHub 项目无效：${e.message}`); }
    }
    for (const key of ['cover', 'audio', 'video', 'attachment']) checkUrl(data[key], filename, base, key);
    const tree = parser.parse(content);
    const definitions = new Map();
    const walk = (node, fn) => { fn(node); for (const child of node.children || []) walk(child, fn); };
    walk(tree, node => { if (node.type === 'definition') definitions.set(node.identifier, node.url); });
    walk(tree, node => {
      if (['image', 'link'].includes(node.type)) checkUrl(node.url, filename, base, node.type === 'image' ? '图片' : '链接');
      if (['imageReference', 'linkReference'].includes(node.type)) checkUrl(definitions.get(node.identifier), filename, base);
      if (node.type === 'html') for (const match of node.value.matchAll(/(?:src|href)=["']([^"']+)["']/g)) checkUrl(match[1], filename, base);
      if (node.type === 'text') {
        for (const match of node.value.matchAll(/\[([gpnxs])frame\]([^|\]]+)/g)) if (!games.has(match[2].trim())) error(filename, `卡片引用不存在的游戏档案：${match[2]}`);
        for (const match of node.value.matchAll(/\[compare\]([^|\]]+)\|([^|\]]+)/g)) { checkUrl(match[1], filename, base, '对比图片'); checkUrl(match[2], filename, base, '对比图片'); }
      }
    });
    for (const record of data.platforms || []) checkUrl(record?.cover || record?.metadata?.cover, filename, base, '卡片封面');
    const metadata = data.gameMetadata || {};
    checkUrl(metadata.cover, filename, base, '游戏封面');
    for (const url of metadata.screenshots || []) checkUrl(url, filename, base, '游戏截图');
  }
  return { errors, warnings, remote: [...remote], postCount: posts.length, gameCount: games.size };
}

module.exports = { validateRepository };
if (require.main === module) validateRepository().then(result => {
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/content-check.json', JSON.stringify(result, null, 2));
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.log(`Content check: ${result.postCount} posts, ${result.gameCount} games, ${result.errors.length} errors; ${result.remote.length} external/media URLs listed for optional online audit.`);
  process.exitCode = result.errors.length ? 1 : 0;
}).catch(e => { console.error(`Content check failed: ${e.message}`); process.exitCode = 1; });
