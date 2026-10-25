import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getChronologies } from '../../../lib/chronologies';
import Chronology from '../chronology';

export function generateStaticParams() { return getChronologies().map(data => ({ slug: data.id })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = getChronologies().find(item => item.id === slug);
  return data ? { title: data.title, description: data.description, alternates: { canonical: `/chronicles/${data.id}/` }, openGraph: { title: data.title, description: data.description, url: `/chronicles/${data.id}/`, type: 'article' } } : {};
}
export default async function ChroniclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = getChronologies().find(item => item.id === slug);
  if (!data) notFound();
  return <main className="chronicle-shell"><div className="container chronicle-container"><header className="chronicle-title"><a className="back" href="/">← 返回博客</a><span className="section-kicker">系列历史档案</span><h1>{data.title}</h1><p>{data.description}</p><p className="chronicle-warning">本页包含全系列重大剧情与结局。默认展示完整年表；可在剧透设置中隐藏尚未游玩的作品。</p><div className="chronicle-stats"><span>{data.events.length} 条事件与剧情概述</span><span>{data.works.length} 项作品与衍生载体</span><span>{data.sources.length} 项来源资料</span></div></header><Chronology data={data} /></div></main>;
}
