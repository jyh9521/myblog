export default function GameSectionNav({ active }: { active: 'library' | 'timelines' }) {
  return <nav className="game-section-nav" aria-label="游戏档案子板块"><a href="/games/" aria-current={active === 'library' ? 'page' : undefined}>游戏收藏<span>收藏与游玩记录</span></a><a href="/games/timelines/" aria-current={active === 'timelines' ? 'page' : undefined}>游戏时间线<span>系列剧情与世界历史</span></a></nav>;
}
