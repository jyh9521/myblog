(function (root) {
  const base = 'https://api.github.com/repos/jyh9521/myblog';
  function bytes(content) { return Uint8Array.from(atob(content.replace(/\s/g, '')), char => char.charCodeAt(0)); }
  function checkedFiles(preview) {
    if (!preview || !/^[a-f0-9]{40}$/.test(preview.commit) || !preview.files?.length) throw Error('请先生成非空清理预览');
    const seen = new Set();
    return preview.files.map(file => {
      if (!file.path.startsWith('public/uploads/') || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(file.sha256) || seen.has(file.path)) throw Error('清理清单路径或哈希无效');
      seen.add(file.path); return file;
    });
  }
  async function deleteAssets(preview, token, request = fetch, digest = data => crypto.subtle.digest('SHA-256', data)) {
    const files = checkedFiles(preview);
    if (!token?.trim()) throw Error('请填写 GitHub 访问令牌');
    async function api(path, method = 'GET', body) {
      const response = await request(base + path, { method, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.trim()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw Error(`GitHub 请求失败（HTTP ${response.status}）；请检查令牌、分支保护或最新提交后重试`);
      return response.json();
    }
    const head = await api('/git/ref/heads/main');
    if (head.object.sha !== preview.commit) throw Error('仓库已有新提交，请等待部署完成，刷新清单后重新选择');
    const commit = await api(`/git/commits/${preview.commit}`);
    const tree = await api(`/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw Error('仓库文件清单不完整，本次未删除');
    const entries = new Map(tree.tree.map(entry => [entry.path, entry]));
    // Fresh immutable content scan is deliberately conservative: even a filename
    // mentioned in prose or a code example protects the resource from deletion.
    const contentEntries = tree.tree.filter(entry => entry.type === 'blob' && (entry.path.startsWith('content/') || /^(app|lib)\/.*\.(tsx?|jsx?|css)$/.test(entry.path) || entry.path === 'public/sveltia/config.yml'));
    const texts = [];
    for (const entry of contentEntries) {
      const blob = await api(`/git/blobs/${entry.sha}`);
      if (blob.encoding !== 'base64') throw Error('引用文件读取不完整，本次未删除');
      let text = new TextDecoder().decode(bytes(blob.content));
      text = text.replace(/\\u([a-f0-9]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
      text = text.replace(/(?:%[a-f0-9]{2})+/gi, value => { try { return decodeURIComponent(value); } catch { return value; } });
      texts.push(text);
    }
    const deletions = [];
    for (const file of files) {
      const entry = entries.get(file.path);
      if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw Error(`文件已变化：${file.path}`);
      const name = file.path.split('/').pop();
      if (texts.some(text => text.includes(file.path.slice(6)) || text.includes(name))) throw Error(`最新内容仍引用或提及该文件：${file.path}`);
      const blob = await api(`/git/blobs/${entry.sha}`);
      if (blob.encoding !== 'base64') throw Error('资源读取不完整，本次未删除');
      const data = bytes(blob.content);
      const hash = Array.from(new Uint8Array(await digest(data)), value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256 || data.length !== file.bytes) throw Error(`文件内容已变化：${file.path}`);
      deletions.push({ path: file.path, mode: entry.mode, type: 'blob', sha: null });
    }
    // One commit for the entire selection; no partial file deletion. A concurrent
    // edit cannot be overwritten because the final ref update is non-forced.
    const newTree = await api('/git/trees', 'POST', { base_tree: commit.tree.sha, tree: deletions });
    const created = await api('/git/commits', 'POST', { message: `Delete ${files.length} unreferenced upload resources`, tree: newTree.sha, parents: [preview.commit] });
    await api('/git/refs/heads/main', 'PATCH', { sha: created.sha, force: false });
    const verified = await api(`/git/trees/${newTree.sha}?recursive=1`);
    if (verified.truncated || files.some(file => verified.tree.some(entry => entry.path === file.path))) throw Error(`删除提交已创建，请核对 https://github.com/jyh9521/myblog/commit/${created.sha}`);
    return { sha: created.sha, url: `https://github.com/jyh9521/myblog/commit/${created.sha}`, files: files.map(file => file.path) };
  }
  const api = { checkedFiles, deleteAssets };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BlogAssetDelete = api;
})(typeof window !== 'undefined' ? window : globalThis);
