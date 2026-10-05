import type { GameProject } from './game-types';

export function normalizeProjects(value: unknown): GameProject[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    try {
      const url = new URL(String(item?.url || '').trim());
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password) return [];
      const match = url.pathname.match(/^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)\/?$/);
      if (!match || ['.', '..'].includes(match[2])) return [];
      const repo = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
      if (seen.has(repo.toLowerCase())) return [];
      seen.add(repo.toLowerCase());
      const repositoryUrl = `https://github.com/${repo}`;
      let releaseUrl = '';
      if (item.releaseUrl) {
        const release = new URL(String(item.releaseUrl));
        if (release.origin === 'https://github.com' && !release.username && !release.password && (release.pathname === `/${repo}/releases` || release.pathname.startsWith(`/${repo}/releases/`))) releaseUrl = release.href;
      }
      const types = ['汉化补丁', '工具', '现代化补丁', '其他'];
      return [{ url: repositoryUrl, name: String(item.name || '').trim() || repo, type: types.includes(item.type) ? item.type : '其他', description: String(item.description || '').trim(), releaseUrl }];
    } catch { return []; }
  });
}
