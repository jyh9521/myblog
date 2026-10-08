import type { GameRecord } from '../../lib/game-types';
import { formatPlayHours } from '../../lib/game-time';

export default function GameTime({ game }: { game: GameRecord }) {
  const { playTime, completionTimes } = game;
  if (!playTime && !completionTimes) return null;
  const estimates = completionTimes ? [
    { label: '主线', hours: completionTimes.main },
    { label: '主线＋支线', hours: completionTimes.extras },
    { label: '全收集', hours: completionTimes.completionist },
  ].filter(item => item.hours !== undefined) : [];
  return <section className="game-time-section" aria-labelledby="game-time-heading">
    <h2 id="game-time-heading">游玩时长</h2>
    <div className="game-time-grid">
      {playTime && <div className="game-time-stat"><span>我的游玩时长</span><strong>{formatPlayHours(playTime.totalMinutes)} <small>小时</small></strong></div>}
      {estimates.map(item => <div className="game-time-stat" key={item.label}><span>{item.label}参考时间</span><strong>{item.hours!.toFixed(1)} <small>小时</small></strong></div>)}
    </div>
    {completionTimes && <p className="game-time-source">{estimates.length > 0 && '参考时间由博主根据 HowLongToBeat 手动记录，不代表个人实际游玩时长。'} <a href={completionTimes.url} target="_blank" rel="noopener noreferrer">在 HowLongToBeat 查看 ↗</a></p>}
  </section>;
}
