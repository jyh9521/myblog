type RevisionInput = { date: string; updatedAt?: string; updateNote?: string };
function validDate(value = '') {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}
export function revision(post: RevisionInput) {
  const published = validDate(post.date), candidate = validDate(post.updatedAt);
  const updated = candidate && published && candidate > published ? candidate : '';
  return { published, updated, note: updated ? (post.updateNote || '').trim() : '' };
}
/** Only point to sections the author actually wrote; never infer a patch version. */
export function patchSections(headings: { id: string; text: string }[]) {
  return [
    { label: '下载与资源', pattern: /下载|获取补丁/ },
    { label: '适用版本与安装', pattern: /安装|兼容|适用|版本要求|使用说明/ },
    { label: '更新记录', pattern: /更新记录|更新日志|修订记录|更新说明/ },
  ].flatMap(({ label, pattern }) => {
    const heading = headings.find(item => pattern.test(item.text));
    return heading ? [{ label, href: '#' + encodeURIComponent(heading.id), title: heading.text }] : [];
  });
}
