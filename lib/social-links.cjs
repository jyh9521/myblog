const { fab } = require('@fortawesome/free-brands-svg-icons');

// Trusted, pinned package data. No remote SVGs or user-provided markup.
const icons = new Map(Object.values(fab).map(icon => [icon.iconName, icon]));
const labels = { github: 'GitHub', discord: 'Discord', youtube: 'YouTube', bilibili: '哔哩哔哩 / Bilibili', steam: 'Steam', playstation: 'PlayStation / PSN', xbox: 'Xbox', qq: 'QQ', weixin: '微信 / WeChat', weibo: '微博 / Weibo', 'x-twitter': 'X / Twitter', 'itch-io': 'itch.io' };
const featured = ['github', 'discord', 'youtube', 'bilibili', 'steam', 'playstation', 'xbox', 'x-twitter', 'bluesky', 'mastodon', 'twitch', 'telegram', 'weibo', 'qq', 'weixin'];
function getSocialIcon(name) {
  const icon = icons.get(name);
  if (!icon) return null;
  const [width, height, , , paths] = icon.icon;
  return { slug: icon.iconName, label: labels[icon.iconName] || icon.iconName, width, height, paths: Array.isArray(paths) ? paths : [paths] };
}
function socialIconCatalog() {
  return [...icons.keys()].sort((a, b) => {
    const rank = x => featured.includes(x) ? featured.indexOf(x) : featured.length;
    return rank(a) - rank(b) || a.localeCompare(b);
  }).map(getSocialIcon);
}
function validSocialUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return false;
  try { const url = new URL(value.trim()); return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
function validateSocialLinks(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return ['社交主页必须是列表'];
  return value.flatMap((item, index) => {
    const errors = [], prefix = `社交主页第 ${index + 1} 项`;
    if (!item || typeof item !== 'object') return [`${prefix}格式错误`];
    for (const [field, label] of [['platform', '平台'], ['nickname', '昵称']]) {
      if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`${prefix}缺少${label}`);
    }
    if (!validSocialUrl(item.url)) errors.push(`${prefix}链接须为完整 HTTP(S) 地址且不包含账号密码`);
    if (item.icon && item.icon !== 'globe' && !icons.has(item.icon)) errors.push(`${prefix}图标不存在：${item.icon}`);
    return errors;
  });
}
module.exports = { getSocialIcon, socialIconCatalog, validSocialUrl, validateSocialLinks };
