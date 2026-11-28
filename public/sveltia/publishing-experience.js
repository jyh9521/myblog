(() => {
  'use strict';
  const core = window.BlogPublishingCore;
  if (!core) return;
  const base = 'https://api.github.com/repos/jyh9521/myblog';
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  const button = (text, action) => { const el = node('button', text); el.type = 'button'; el.onclick = action; return el; };
  const time = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo' });
  const strip = button('本地备份：正在读取…', open);
  strip.className = 'blog-draft-status'; strip.setAttribute('aria-label', '打开本地草稿与发布状态');
  document.body.append(strip);
  let dialog, summary, draftList, draftMessage, importInput, confirmImport, reloadButton, pendingImport, liveFiles;
  let localSequence = 0, networkSequence = 0, importSequence = 0, networkAbort, refreshTimer, importBusy = false;
  async function configHash() {
    const response = await fetch('/sveltia/config.yml', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('后台配置读取失败，请稍后重试。');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function refreshLocal() {
    const sequence = ++localSequence;
    try {
      const drafts = await core.readDrafts();
      if (sequence !== localSequence) return;
      const latest = Math.max(0, ...drafts.map(draft => new Date(draft.timestamp).getTime()).filter(Number.isFinite));
      const text = drafts.length ? `本地备份：${drafts.length} 份 · 最近 ${time(latest)}` : '本地备份：当前没有待恢复草稿';
      strip.textContent = text; strip.title = '仅此浏览器的原生草稿备份，不代表保存到仓库。';
      if (dialog?.open) {
        summary.textContent = text;
        draftList.replaceChildren(...drafts.map(draft => node('li', `${draft.collectionName} / ${draft.slug || '新条目'} · ${time(draft.timestamp)}`)));
      }
    } catch {
      if (sequence !== localSequence) return;
      strip.textContent = '本地备份：读取未确认';
      if (dialog?.open) summary.textContent = '本地草稿读取失败；请检查浏览器存储是否可用。编辑器继续按原有方式工作。';
    }
  }
  function scheduleLocal() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshLocal, 900); }
  function updateImportState() {
    if (!dialog?.open) return;
    const allowed = core.canImportAt(location.hash);
    importInput.disabled = !allowed || importBusy;
    confirmImport.disabled = !allowed || importBusy || !pendingImport;
    reloadButton.disabled = !allowed || importBusy;
    dialog.querySelector('[data-import-help]').textContent = allowed
      ? '请先关闭其他后台编辑标签页。导入只新增草稿；任何同名冲突会撤销整批导入，不覆盖现有备份。'
      : '请先在编辑器中处理当前改动并返回内容列表，再导入或刷新；当前编辑页不会被关闭。';
  }
  async function exportLocal() {
    const target = draftMessage;
    target.textContent = '正在读取原生本地备份与待上传附件…';
    try {
      // Sveltia debounces its own backup by 500 ms. Do not add a competing save.
      await new Promise(resolve => setTimeout(resolve, 700));
      const text = await core.exportDrafts(await core.readDrafts(), await configHash());
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = node('a'); link.href = url; link.download = `blog-local-drafts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      target.textContent = '已导出本地备份（含待上传文件）；文件只保存在你选择的下载位置。';
    } catch { target.textContent = '导出未完成：请检查本地存储、配置连接与草稿格式；原有草稿保持不变。'; }
  }
  async function chooseImport() {
    const sequence = ++importSequence, currentDialog = dialog;
    const file = importInput.files?.[0], target = draftMessage;
    pendingImport = null; updateImportState();
    if (!file || !core.canImportAt(location.hash)) return;
    try {
      if (file.size > core.MAX_TEXT) throw Error('草稿文件超过 96 MiB 限制。');
      const text = await file.text(), config = await configHash(), records = await core.parseDrafts(text, config);
      if (sequence !== importSequence || !currentDialog.open || !core.canImportAt(location.hash)) return;
      pendingImport = { text, config };
      target.textContent = `待导入 ${records.length} 份草稿，尚未写入。确认后不会自动刷新或发布到 GitHub。`;
    } catch (error) { if (sequence === importSequence && currentDialog.open) target.textContent = error instanceof SyntaxError ? '草稿文件不是有效 JSON；现有草稿保持不变。' : error.message; }
    if (sequence === importSequence) updateImportState();
  }
  async function importLocal() {
    if (importBusy || !pendingImport || !core.canImportAt(location.hash)) return;
    importBusy = true; updateImportState();
    const selected = pendingImport, target = draftMessage;
    try {
      const currentConfig = await configHash();
      if (!core.canImportAt(location.hash)) throw Error('页面已切换，请回到内容列表重新导入。');
      if (currentConfig !== selected.config) throw Error('后台配置已变化，请重新选择草稿文件。');
      const count = await core.importDrafts(selected.text, currentConfig);
      pendingImport = null; importInput.value = '';
      target.textContent = `已导入 ${count} 份草稿；没有发布。你可以稍后刷新，在原条目中选择 CMS 的“恢复”提示。`;
      reloadButton.hidden = false; await refreshLocal();
    } catch (error) { target.textContent = error.message; }
    finally { importBusy = false; updateImportState(); }
  }
  function reloadForRecovery() {
    if (!core.canImportAt(location.hash)) return;
    if (window.confirm('确认当前编辑已处理完毕？刷新后进入对应条目，选择 CMS 原生恢复；此操作不会发布。')) location.reload();
  }
  async function requestJSON(url, signal) {
    const response = await fetch(url, { signal, cache: 'no-store', redirect: 'error', credentials: url.startsWith('/') ? 'same-origin' : 'omit' });
    if (!response.ok) throw Error(response.status === 403 || response.status === 429 ? '查询限流，请稍后手动刷新' : '网络查询未完成');
    const data = await response.json();
    return { data, response };
  }
  async function refreshPublish() {
    if (!dialog?.open) return;
    networkAbort?.abort(); networkAbort = new AbortController();
    const sequence = ++networkSequence, currentDialog = dialog;
    const rows = currentDialog.querySelector('[data-publish-rows]'), detail = currentDialog.querySelector('[data-publish-detail]'), refresh = currentDialog.querySelector('[data-refresh-publish]');
    liveFiles = null; renderEntryLink();
    rows.replaceChildren(node('p', '仓库 main：查询中'), node('p', '主站：实时回读中'), node('p', 'Pages 回退：查询中'));
    detail.textContent = ''; refresh.disabled = true;
    const signal = AbortSignal.any([networkAbort.signal, AbortSignal.timeout(20000)]);
    try {
      const [commitResult, liveResult] = await Promise.allSettled([requestJSON(`${base}/commits/main`, signal), requestJSON('/hosting.json', signal)]);
      const sha = commitResult.status === 'fulfilled' ? commitResult.value.data.sha : '';
      const live = liveResult.status === 'fulfilled' ? { release: liveResult.value.data.release, hosting: liveResult.value.response.headers.get('X-Blog-Hosting') } : null;
      let run, jobs = [], workflowError = false;
      if (/^[a-f0-9]{40}$/.test(sha)) {
        try {
          const result = await requestJSON(`${base}/actions/workflows/pages.yml/runs?branch=main&head_sha=${sha}&per_page=10`, signal);
          run = result.data.workflow_runs?.find(item => item.head_sha === sha);
          if (Number.isSafeInteger(run?.id) && Number.isSafeInteger(run?.run_attempt)) {
            const result = await requestJSON(`${base}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`, signal);
            jobs = Array.isArray(result.data.jobs) ? result.data.jobs : [];
          }
        } catch { workflowError = true; }
      }
      if (sequence !== networkSequence || !currentDialog.open) return;
      const state = core.deploymentState({ sha, live, run, jobs });
      rows.replaceChildren(...Object.values(state).map(item => node('p', item.label, `blog-publish-${item.kind}`)));
      if (commitResult.status === 'fulfilled') {
        const commit = commitResult.value.data.commit, date = commit?.committer?.date, timestamp = Date.parse(date);
        detail.append(node('p', `仓库最近提交：${Number.isFinite(timestamp) ? time(timestamp) : '时间未确认'} · ${typeof commit?.message === 'string' ? commit.message.split('\n')[0].slice(0, 240) : '说明未确认'}（全仓库，不代表当前未保存编辑）`));
      }
      liveFiles = liveResult.status === 'fulfilled' ? liveResult.value.data.files : null;
      renderEntryLink();
      detail.append(node('p', `查询时间：${time(Date.now())}（日本时间）；仅手动刷新，不自动轮询。`));
      if (workflowError || commitResult.status === 'rejected' || liveResult.status === 'rejected') detail.append(node('p', '部分查询未完成或受到限流；未沿用上次成功状态。'));
      if (Number.isSafeInteger(run?.id)) {
        const link = node('a', '查看此提交的构建与部署记录'); link.href = `https://github.com/jyh9521/myblog/actions/runs/${run.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
      }
    } catch { if (sequence === networkSequence && currentDialog.open) rows.replaceChildren(node('p', '发布状态：查询未完成，请稍后手动刷新。')); }
    finally { if (sequence === networkSequence) refresh.disabled = false; }
  }
  function renderEntryLink() {
    if (!dialog?.open) return;
    const container = dialog.querySelector('[data-entry-link]');
    if (!container) return;
    container.replaceChildren();
    const href = core.publishedEntryPath(location.hash, liveFiles);
    if (href) {
      const link = node('a', '查看当前条目的已发布版本'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      container.append(link, document.createTextNode('（以线上文件清单确认路径；不含当前未保存改动）'));
    } else container.textContent = '当前条目的线上路径尚未确认；新草稿不生成预设链接。';
  }
  function open(trigger) {
    if (dialog?.open) return;
    // Safari does not focus mouse-clicked buttons. Remember the actual opener,
    // rather than assuming activeElement is the control that opened the dialog.
    const previousFocus = trigger?.currentTarget instanceof HTMLElement ? trigger.currentTarget : trigger instanceof HTMLElement ? trigger : document.activeElement;
    const currentDialog = dialog = node('dialog', undefined, 'blog-publishing-dialog'); dialog.setAttribute('aria-labelledby', 'blog-publishing-title');
    importSequence++; pendingImport = null;
    const heading = node('h2', '本地草稿与发布状态'); heading.id = 'blog-publishing-title';
    const close = button('关闭', () => dialog.close()); close.className = 'blog-publishing-close';
    const local = node('section'), localHeading = node('h3', '本地草稿'); summary = node('p', '正在读取…');
    draftList = node('ul', undefined, 'blog-draft-list'); draftMessage = node('p'); draftMessage.setAttribute('role', 'status');
    const note = node('p', '本地备份只表示此浏览器已保存恢复副本，不代表 GitHub 保存或上线。导出包含正文及待上传文件，请妥善保管；不包含登录凭据。');
    const actions = node('div', undefined, 'blog-publishing-actions'); actions.append(button('导出本地草稿', exportLocal), button('刷新本地备份', refreshLocal));
    const importLabel = node('label', '选择草稿备份文件'); importInput = node('input'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.onchange = chooseImport; importLabel.append(importInput);
    const help = node('p'); help.dataset.importHelp = '';
    confirmImport = button('确认合并导入', importLocal); reloadButton = button('刷新并进入原生恢复流程', reloadForRecovery); reloadButton.hidden = true;
    local.append(localHeading, summary, draftList, note, actions, importLabel, help, confirmImport, reloadButton, draftMessage);
    const publishing = node('section'), publishHeading = node('h3', '发布状态');
    const rows = node('div'); rows.dataset.publishRows = ''; rows.setAttribute('aria-live', 'polite');
    const detail = node('div'); detail.dataset.publishDetail = '';
    const entryLink = node('p'); entryLink.dataset.entryLink = '';
    const refresh = button('刷新发布状态', refreshPublish); refresh.dataset.refreshPublish = '';
    publishing.append(publishHeading, node('p', '以下核对仓库当前 main，不把 API 保存成功、旧提交成功或回退失败当作当前主站结果。'), rows, detail, entryLink, refresh);
    dialog.append(heading, close, local, publishing);
    dialog.addEventListener('cancel', event => { if (importBusy) event.preventDefault(); });
    close.onclick = () => { if (!importBusy) currentDialog.close(); };
    dialog.onclose = () => {
      // close is delivered asynchronously: a previous instance must not remove
      // a freshly reopened panel, abort its queries, or steal its focus.
      currentDialog.remove();
      if (dialog !== currentDialog) return;
      networkAbort?.abort(); networkSequence++; importSequence++; pendingImport = null;
      previousFocus?.isConnected && previousFocus.focus({ preventScroll: true });
    };
    document.body.append(dialog); dialog.showModal(); updateImportState(); refreshLocal(); refreshPublish();
  }
  window.BlogPublishing = Object.freeze({ open, configHash });
  // Native save deletes its backup before postSave; an existing entry can stay
  // on the same route without emitting any input/change/hashchange event.
  window.CMS?.registerEventListener?.({ name: 'postSave', handler: scheduleLocal });
  document.addEventListener('input', event => { if (!dialog?.contains(event.target)) scheduleLocal(); });
  document.addEventListener('change', scheduleLocal);
  window.addEventListener('focus', scheduleLocal);
  window.addEventListener('hashchange', () => { importSequence++; pendingImport = null; updateImportState(); renderEntryLink(); scheduleLocal(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleLocal(); });
  window.addEventListener('pagehide', () => { clearTimeout(refreshTimer); networkAbort?.abort(); });
  refreshLocal();
})();
