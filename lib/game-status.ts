// Current state is separate from dated milestones and patch-release notes.
export const gameStatuses = ['想玩', '正在玩', '已通关', '暂时搁置', 'AFK', '考虑制作补丁', '正在制作补丁', '已制作补丁'] as const;
export type GameStatus = typeof gameStatuses[number];

export function normalizeGameStatuses(value: unknown): GameStatus[] {
  const parts = (Array.isArray(value) ? value : [value]).flatMap(item => String(item ?? '').split(/[、,，;；]/)).map(part => part.trim());
  const selected = new Set(parts.map(part => {
    if (part === '已弃坑' || part === '已弃玩' || part.toUpperCase() === 'AFK') return 'AFK';
    if (part === '搁置' || part === '暂停游玩') return '暂时搁置';
    if (part === '已发布汉化补丁' || part === '已发布补丁') return '已制作补丁';
    return part;
  }));
  const statuses = gameStatuses.filter(status => selected.has(status));
  return statuses.length ? statuses : ['想玩'];
}

// Display format shared by cards and archive headers, including legacy strings.
export function normalizeGameStatus(value: unknown): string {
  return normalizeGameStatuses(value).join('、');
}

export function matchesGameStatus(value: unknown, filter: string): boolean {
  return filter === 'all' || normalizeGameStatuses(value).some(status => status === filter);
}
