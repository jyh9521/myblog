'use client';
import { useEffect, useState } from 'react';
import type { GameRecord } from '../../lib/game-types';
import { formatPlayHours } from '../../lib/game-time';

export default function GameTime({ game }: { game: GameRecord }) {
  const { playTime, completionTimes, personalRating } = game;
  const [automatic, setAutomatic] = useState<{ id: number; main?: number; extras?: number; completionist?: number; updatedAt: string; stale: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const id = completionTimes?.id;
  const auto = completionTimes?.auto;
  useEffect(() => {
    if (!id || !auto) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setMessage('HLTB 请求超时，已有参考数据仍保留。'); }, 35000);
    setMessage('正在读取 HLTB 参考时间…');
    fetch(`https://blog.blfy.cc/ns/api/hltb/detail?id=${id}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('HLTB 暂不可用');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('id' in data) || data.id !== id) throw new Error('HLTB 数据不匹配');
        const row = data as Record<string, unknown>;
        const time = (key: string) => typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] > 0 ? row[key] : undefined;
        if (typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error('HLTB 时间无效');
        if (!controller.signal.aborted) {
          setAutomatic({ id, main: time('main'), extras: time('extras'), completionist: time('completionist'), updatedAt: row.updatedAt, stale: row.cache === 'stale' });
          setMessage(row.cache === 'stale' ? 'HLTB 暂不可用，展示已保存的参考数据。' : '');
        }
      }).catch(() => { if (!controller.signal.aborted) setMessage('HLTB 暂不可用，已有参考数据仍保留。'); })
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, auto]);
  if (!playTime && !completionTimes && !personalRating) return null;
  const cached = automatic?.id === id ? automatic : completionTimes?.snapshot;
  const estimates = completionTimes ? [
    { label: '主线', hours: completionTimes.main ?? (auto ? cached?.main : undefined), manual: completionTimes.main !== undefined },
    { label: '主线＋支线', hours: completionTimes.extras ?? (auto ? cached?.extras : undefined), manual: completionTimes.extras !== undefined },
    { label: '全收集', hours: completionTimes.completionist ?? (auto ? cached?.completionist : undefined), manual: completionTimes.completionist !== undefined },
  ].filter(item => item.hours !== undefined) : [];
  return <section className="game-time-section" aria-labelledby="game-time-heading">
    <h2 id="game-time-heading">{personalRating ? (playTime || completionTimes ? '游玩时长与个人评分' : '个人评分') : '游玩时长'}</h2>
    <div className="game-time-grid">
      {playTime && <div className="game-time-stat"><span>我的游玩时长</span><strong>{formatPlayHours(playTime.totalMinutes)} <small>小时</small></strong></div>}
      {personalRating && <div className="game-time-stat personal-rating-stat"><span>我的评分</span><strong>{personalRating.score.toFixed(2)} <small>/ 10</small></strong><p>个人好评度 <b>{personalRating.percent}%</b></p><div className="personal-rating-bar" role="meter" aria-label="个人好评度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={personalRating.percent} aria-valuetext={`${personalRating.percent}%`}><span style={{ width: `${personalRating.percent}%` }} /></div></div>}
      {estimates.map(item => <div className="game-time-stat" key={item.label}><span>{item.label}参考时间</span><strong>{item.hours!.toFixed(1)} <small>小时</small></strong></div>)}
    </div>
    {personalRating && <p className="game-time-source">个人好评度＝我的评分 ÷ 10 × 100%，仅代表我的评价，不是玩家群体好评率。</p>}
    {completionTimes && <p className="game-time-source">{estimates.length > 0 && (estimates.some(item => item.manual) ? '参考时间来自 HowLongToBeat；手动记录优先，不代表个人实际游玩时长。' : '参考时间来自 HowLongToBeat，不代表个人实际游玩时长。')} {auto && cached?.updatedAt && <span>数据更新时间：{cached.updatedAt.slice(0, 10)}。 </span>}<a href={completionTimes.url} target="_blank" rel="noopener noreferrer">在 HowLongToBeat 查看 ↗</a></p>}
    {auto && <p className="game-time-source" role="status">{message}</p>}
  </section>;
}
