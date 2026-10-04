(function (root) {
  function deploymentState(sha, runs) {
    const run = runs.find(run => run.head_sha === sha);
    if (!run) return { label: '已保存到 GitHub，等待部署', kind: 'pending', run: null };
    if (run.status !== 'completed') return { label: ['queued', 'waiting', 'pending'].includes(run.status) ? '已保存，部署排队中' : '正在构建或部署', kind: 'pending', run };
    return { label: run.conclusion === 'success' ? '已上线' : run.conclusion === 'cancelled' ? '部署已取消，修改仍在 GitHub' : '发布失败，修改仍在 GitHub', kind: run.conclusion === 'success' ? 'success' : 'error', run };
  }
  function cleanupPreview(index, paths) {
    const selected = new Set(paths);
    const eligible = index.files.filter(file => selected.has(file.path) && !file.references.length);
    return { commit: index.commit, generatedAt: index.generatedAt, action: 'review-only-no-files-deleted', files: eligible.map(file => ({ path: `public${file.path}`, sha256: file.sha256, bytes: file.bytes })), totalBytes: eligible.reduce((sum, file) => sum + file.bytes, 0) };
  }
  const api = { deploymentState, cleanupPreview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlogMaintenance = api;
})(typeof window !== 'undefined' ? window : globalThis);
