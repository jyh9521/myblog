import GameShelf from './game-shelf';
import GamingProfile from './gaming-profile';
import GameSectionNav from './game-section-nav';
import { getGames } from '../../lib/games';

export const metadata = { title: '游戏档案' };
export default function GamesPage() {
  const games = getGames();
  return <main className="m3-archive">
    <header className="m3-archive-banner"><div className="container m3-archive-wrap">
      <div><span className="section-kicker">GAME LIBRARY / PLAY LOG</span><h1>游戏档案</h1><p>跨平台收藏、游玩状态与相关博客记录。</p></div>
      <div className="m3-archive-side"><strong>{games.length} 款游戏</strong><a href="#gaming-profile-title">跨平台游戏资料 ↓</a><a href="/games/timelines/">系列时间线 ↗</a></div>
    </div></header>
    <div className="container game-directory m3-archive-wrap">
      <section id="library" aria-label="档案目录"><GameShelf games={games} /></section>
      <GameSectionNav active="library" />
      <GamingProfile />
    </div>
  </main>;
}
