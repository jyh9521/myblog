import { revision } from '../../lib/post-revision';
export default function PostRevision({ date, updatedAt, updateNote, note = false }: { date: string; updatedAt?: string; updateNote?: string; note?: boolean }) {
  const value = revision({ date, updatedAt, updateNote });
  return <span className="post-revision"><span>发布于 <time dateTime={value.published || undefined}>{value.published || '日期未设置'}</time></span>{value.updated && <span className="updated-at">更新于 <time dateTime={value.updated}>{value.updated}</time></span>}{note && value.note && <span className="revision-note">本次更新：{value.note}</span>}</span>;
}
