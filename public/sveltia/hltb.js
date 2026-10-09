(function () {
  const register = () => {
    if (!window.CMS?.registerFieldType || !window.h || !window.createClass) return false;
    const h = window.h;
    const api = 'https://blog.blfy.cc/ns/api/hltb';
    const inputStyle = { width: '100%', minHeight: '38px', padding: '8px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' };
    const Hltb = window.createClass({
      getInitialState() { return { query: '', results: [], busy: false, message: '' }; },
      componentWillUnmount() { this.controller?.abort(); },
      change(patch) { this.props.onChange({ ...(this.props.value || {}), ...patch }); },
      async search() {
        if (this.state.busy) return;
        const query = this.state.query.trim();
        if (query.length < 2 || query.length > 100) { this.setState({ message: '请输入 2–100 个字符，建议使用游戏原名。' }); return; }
        this.controller?.abort(); this.controller = new AbortController();
        this.setState({ busy: true, results: [], message: '' });
        try {
          const response = await fetch(`${api}/search?q=${encodeURIComponent(query)}`, { signal: this.controller.signal });
          const data = await response.json();
          if (!response.ok || !Array.isArray(data.results)) throw new Error((data.error || '搜索失败') + (Number.isFinite(data.retryAfter) && data.retryAfter > 0 ? ` 请在 ${Math.ceil(data.retryAfter)} 秒后重试。` : ''));
          this.setState({ results: data.results, message: data.results.length ? `已按名称相似度排序${data.matchedQuery ? `，匹配关键词：${data.matchedQuery}` : ''}。请核对版本、平台后选择；不会自动关联第一个候选。` : '没有找到游戏，请尝试原名或手动填写链接。' });
        } catch (error) { if (error.name !== 'AbortError') this.setState({ message: error.message || '搜索暂不可用' }); }
        finally { this.setState({ busy: false }); }
      },
      async select(game) {
        if (this.state.busy) return;
        this.setState({ busy: true, message: '正在读取游戏参考时间…' });
        this.controller?.abort(); this.controller = new AbortController();
        try {
          const response = await fetch(`${api}/detail?id=${game.id}`, { signal: this.controller.signal });
          const data = await response.json();
          if (!response.ok || data.id !== game.id) throw new Error((data.error || '游戏资料不匹配') + (Number.isFinite(data.retryAfter) && data.retryAfter > 0 ? ` 请在 ${Math.ceil(data.retryAfter)} 秒后重试。` : ''));
          // Manual reference fields remain overrides, independent of the snapshot.
          this.change({ id: game.id, url: game.url, title: game.title, auto: true, snapshot: { id: game.id, main: data.main, extras: data.extras, completionist: data.completionist, updatedAt: data.updatedAt } });
          this.setState({ results: [], message: data.cache === 'stale' ? '已关联，当前使用旧缓存。手动时间仍优先显示。' : '已关联并读取参考时间。手动时间仍优先显示。' });
        } catch (error) { if (error.name !== 'AbortError') this.setState({ message: error.message || '读取失败' }); }
        finally { this.setState({ busy: false }); }
      },
      link(value) {
        // Changing game identity must never carry the old automatic snapshot.
        let id;
        try { const u = new URL(value); if (u.protocol === 'https:' && ['howlongtobeat.com', 'www.howlongtobeat.com'].includes(u.hostname)) id = Number(u.pathname.match(/^\/game\/([1-9]\d*)\/?$/)?.[1] || u.searchParams.get('id')); } catch {}
        this.change({ url: value, id: Number.isSafeInteger(id) && id > 0 ? id : undefined, snapshot: undefined, title: undefined });
      },
      render() {
        const value = this.props.value || {};
        return h('div', { style: { display: 'grid', gap: '12px' } },
          h('label', null, '搜索 HLTB 游戏（支持名称片段、商店名称）', h('input', { style: inputStyle, value: this.state.query, onChange: e => this.setState({ query: e.target.value }), onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent?.isComposing && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); this.search(); } } })),
          h('button', { type: 'button', disabled: this.state.busy, onClick: () => this.search() }, this.state.busy ? '正在查询…' : '搜索并选择 HLTB 游戏'),
          h('div', { style: { display: 'grid', gap: '6px' } }, ...this.state.results.map(game => h('button', { key: game.id, type: 'button', disabled: this.state.busy, onClick: () => this.select(game), style: { ...inputStyle, textAlign: 'left' } }, `${game.title} · ID ${game.id} · ${game.type} · ${game.platforms}`))),
          h('p', { role: 'status', 'aria-live': 'polite' }, this.state.message),
          value.id && h('strong', null, `已关联：${value.title || 'HLTB 游戏'}（ID ${value.id}）`),
          h('label', null, 'HLTB 游戏链接', h('input', { type: 'url', style: inputStyle, value: value.url || '', onChange: e => this.link(e.target.value) })),
          h('label', null, h('input', { type: 'checkbox', checked: value.auto !== false, onChange: e => this.change({ auto: e.target.checked }) }), ' 自动读取 D1 缓存参考时间（14 天更新；失败保留旧数据）'),
          value.snapshot && h('small', null, `已保存参考快照：主线 ${value.snapshot.main ?? '—'} / 主线＋支线 ${value.snapshot.extras ?? '—'} / 全收集 ${value.snapshot.completionist ?? '—'} 小时；${value.snapshot.updatedAt || ''}`),
          ...[['main', '主线'], ['extras', '主线＋支线'], ['completionist', '全收集']].map(([key, label]) => h('label', { key }, `${label}手动覆盖（小时）`, h('input', { type: 'number', min: 0, step: 'any', style: inputStyle, value: value[key] ?? '', onChange: e => this.change({ [key]: e.target.value === '' ? undefined : Number(e.target.value) }) }))),
          h('small', null, '留空使用自动数据；手动填写优先。个人累计游玩时长独立保存。只有明确关联后前台才读取 ID，不按名称重新搜索。'),
          h('button', { type: 'button', onClick: () => { this.controller?.abort(); this.props.onChange({}); this.setState({ results: [], message: '已取消关联。' }); } }, '取消 HLTB 关联'));
      },
    });
    window.CMS.registerFieldType('hltb-game', Hltb);
    return true;
  };
  if (!register()) { let attempts = 0; const timer = window.setInterval(() => { if (register() || ++attempts >= 50) window.clearInterval(timer); }, 100); }
})();
