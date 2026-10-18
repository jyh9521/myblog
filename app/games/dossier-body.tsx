import { dossierBlocks } from '../../lib/chronology';
import { getChronologies } from '../../lib/chronologies';
import type { GameRecord } from '../../lib/game-types';
import PostContent from '../posts/post-content';
import { extractImages } from '../posts/markdown-utils';
import { withImageSize } from '../../lib/article-image-size';
import Chronology from './chronology';

export default function DossierBody({ body, title, games }: { body: string; title: string; games: GameRecord[] }) {
  const blocks = dossierBlocks(body);
  const timelines = blocks.some(block => block.type === 'chronology') ? getChronologies() : [];
  return <section className="dossier-body" aria-label="游戏档案正文">{blocks.map((block, index) => {
    if (block.type === 'markdown') return <PostContent key={index} compact body={block.body} title={title} headings={[]} images={extractImages(block.body).map(image => withImageSize(image))} games={games} />;
    const data = timelines.find(timeline => timeline.id === block.timeline);
    if (!data || (block.work && !data.works.some(work => work.id === block.work))) throw new Error(`游戏档案年表引用无效：${block.timeline}|${block.work}`);
    return <Chronology key={`${index}-${data.id}`} data={data} defaultWork={block.work} />;
  })}</section>;
}
