import GameShelf from './game-shelf';
import GamingProfile from './gaming-profile';
import { getGames } from '../../lib/games';

export const metadata = { title: '游戏档案' };
export default function GamesPage() { return <main className="article-shell"><div className="container game-directory"><span className="section-kicker">PLAY LOG</span><h1>游戏档案</h1><p>跨平台收藏、游玩状态与相关博客记录。</p><GamingProfile /><GameShelf games={getGames()} /></div></main>; }
