(function () {
  const $ = id => document.getElementById(id), core = window.BlogMaintenance;
  let index = null, selected = new Set(), preview = null, publishBusy = false, latestCommit = '';
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
  const link = (text, href) => { const element = node('a', text); element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer'; return element; };
  function show(name) { for (const panel of ['publish', 'assets']) { $(panel).hidden = panel !== name; $(`show-${panel}`).setAttribute('aria-pressed', String(panel === name)); } }
  $('show-publish').onclick = () => show('publish'); $('show-assets').onclick = () => show('assets');
  async function json(url) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(response.status === 403 || response.status === 429 ? 'GitHub 查询限流，请稍后手动刷新' : `请求失败（HTTP ${response.status}）`);
    return response.json();
  }
  async function refreshPublish() {
    if (publishBusy) return; publishBusy = true; $('refresh-publish').disabled = true;
    try {
      const base = 'https://api.github.com/repos/jyh9521/myblog';
      const [commit, data] = await Promise.all([json(`${base}/commits/main`), json(`${base}/actions/workflows/pages.yml/runs?branch=main&per_page=20`)]);
      const runs = data.workflow_runs || [], state = core.deploymentState(commit.sha, runs);
      latestCommit = commit.sha; if (index) renderAssets();
      $('publish-status').textContent = state.label; $('publish-status').className = state.kind;
      $('publish-details').replaceChildren();
      const details = $('publish-details');
      details.append(node('p', `最新提交：${commit.sha.slice(0, 7)} · ${commit.commit.message.split('\n')[0]}`));
      details.append(link('查看已保存的提交', `https://github.com/jyh9521/myblog/commit/${commit.sha}`));
      const published = runs.find(run => run.status === 'completed' && run.conclusion === 'success');
      details.append(node('p', published ? `最近成功上线：${published.head_sha.slice(0, 7)} · ${new Date(published.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo' })}` : '近期记录中暂无成功部署。'));
      if (state.run) {
        const runUrl = `https://github.com/jyh9521/myblog/actions/runs/${state.run.id}`;
        details.append(link('查看构建与部署日志', runUrl));
        if (state.kind === 'error') {
          try { const jobs = await json(`${base}/actions/runs/${state.run.id}/jobs`); const failed = jobs.jobs.flatMap(job => job.steps.filter(step => step.conclusion === 'failure').map(step => `${job.name} / ${step.name}`)); details.append(node('p', failed.length ? `失败步骤：${failed.join('；')}。打开日志查看具体错误。` : `结束原因：${state.run.conclusion}。打开日志查看详情。`, 'error')); }
          catch (error) { details.append(node('p', `失败详情查询失败：${error.message}`)); }
        }
      }
      details.append(node('small', `查询时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo' })}（日本时间）`));
    } catch (error) { $('publish-status').textContent = `状态查询失败：${error.message}。下方可能保留上次查询结果。`; $('publish-status').className = 'error'; }
    finally { publishBusy = false; $('refresh-publish').disabled = false; }
  }
  const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
  function filtered() {
    if (!index) return [];
    const query = $('asset-query').value.trim().toLowerCase(), mode = $('asset-filter').value;
    return index.files.filter(file => (!query || [file.path, ...file.references.map(ref => ref.title)].join(' ').toLowerCase().includes(query)) && (mode === 'all' || mode === 'images' && file.image || mode === 'unused' && !file.references.length || mode === 'duplicates' && file.duplicates.length));
  }
  function invalidatePreview() { preview = null; $('cleanup').hidden = true; }
  function renderAssets() {
    $('asset-list').replaceChildren();
    if (!index) return;
    const files = filtered();
    $('asset-summary').textContent = `当前显示 ${files.length} / ${index.files.length} 个资源；未引用 ${index.files.filter(file => !file.references.length).length} 个。清单版本 ${index.commit.slice(0, 7)}，生成于 ${new Date(index.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo' })}。${latestCommit && latestCommit !== index.commit ? '清单不是最新提交，请等待部署成功后刷新再核对。' : ''}`;
    for (const file of files) {
      const row = node('article', undefined, 'asset');
      if (file.image) { const image = node('img'); image.src = file.path.split('/').map(encodeURIComponent).join('/'); image.alt = file.path.split('/').pop(); image.loading = 'lazy'; row.append(image); } else row.append(node('span', '附件'));
      const info = node('div'); info.append(node('strong', file.path, 'asset-title')); info.append(node('small', `${size(file.bytes)} · ${file.references.length ? '正在使用' : '未引用'}`));
      const label = node('label'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(file.path); checkbox.disabled = !!file.references.length;
      checkbox.setAttribute('aria-label', `选择清理 ${file.path}`); checkbox.onchange = () => { checkbox.checked ? selected.add(file.path) : selected.delete(file.path); invalidatePreview(); };
      label.append(checkbox, document.createTextNode(file.references.length ? ' 被引用，禁止加入清理清单' : ' 加入清理预览')); info.append(label);
      const refs = node('ul'); file.references.forEach(ref => { const item = node('li'); item.append(link(ref.title, ref.url)); item.append(node('small', ref.file)); refs.append(item); }); if (file.references.length) info.append(refs);
      if (file.duplicates.length) info.append(node('p', `相同内容：${file.duplicates.join('；')}`, 'path'));
      row.append(info); $('asset-list').append(row);
    }
    if (!files.length) $('asset-list').append(node('p', '没有符合筛选条件的资源。'));
  }
  async function refreshAssets() {
    $('refresh-assets').disabled = true;
    try { index = await json('/sveltia/assets.json'); selected = new Set([...selected].filter(name => index.files.some(file => file.path === name && !file.references.length))); invalidatePreview(); renderAssets(); }
    catch (error) { $('asset-summary').textContent = `资源清单读取失败：${error.message}`; }
    finally { $('refresh-assets').disabled = false; }
  }
  $('refresh-publish').onclick = refreshPublish; $('refresh-assets').onclick = refreshAssets;
  $('asset-query').oninput = renderAssets; $('asset-filter').onchange = renderAssets;
  $('select-unused').onclick = () => { filtered().filter(file => !file.references.length).forEach(file => selected.add(file.path)); invalidatePreview(); renderAssets(); };
  $('clear-selection').onclick = () => { selected.clear(); invalidatePreview(); renderAssets(); };
  $('preview-cleanup').onclick = () => { if (!index) return; preview = core.cleanupPreview(index, selected); $('cleanup').hidden = false; $('cleanup-summary').textContent = `选中 ${preview.files.length} 个未引用文件，共 ${size(preview.totalBytes)}。这是预览，尚未删除任何文件。`; $('cleanup-files').textContent = preview.files.map(file => file.path).join('\n') || '没有选中可清理文件。'; $('export-cleanup').disabled = !preview.files.length; };
  $('export-cleanup').onclick = () => { if (!preview || !preview.files.length) return; const url = URL.createObjectURL(new Blob([JSON.stringify(preview, null, 2)], { type: 'application/json' })); const download = node('a'); download.href = url; download.download = 'blog-cleanup-preview.json'; download.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  refreshPublish(); refreshAssets(); setInterval(() => { if (!document.hidden && !$('publish').hidden) refreshPublish(); }, 180000);
})();
