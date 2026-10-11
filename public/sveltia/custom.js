(() => {
  const register = () => {
    if (!window.CMS?.registerEditorComponent) return false;
    if (!window.h || !window.createClass || !window.CMS.getFieldType?.('select')?.control) return false;
    const h = window.h;
    const createClass = window.createClass;
    // Keep the unconfirmed IME draft local. Publishing each composition update
    // causes the CMS object field to replace its controlled value mid-candidate.
    const ImeInput = createClass({
      getInitialState: function () { return { draft: String(this.props.value ?? '') }; },
      componentDidUpdate: function (previous) {
        if (previous.value !== this.props.value && !this.composing && !this.focused) {
          const draft = String(this.props.value ?? '');
          this.lastCommitted = undefined;
          if (draft !== this.state.draft) this.setState({ draft });
        }
      },
      commit: function (value) {
        if (this.lastCommitted === value) return;
        this.lastCommitted = value;
        this.props.onChange(value);
      },
      render: function () {
        const { multiline, onChange, value, ...props } = this.props;
        return h(multiline ? 'textarea' : 'input', {
          ...props, value: this.state.draft,
          onFocus: () => { this.focused = true; },
          onBlur: event => { this.focused = false; if (!this.composing) this.commit(event.target.value); },
          onCompositionStart: () => { this.composing = true; },
          onCompositionEnd: event => { this.composing = false; this.setState({ draft: event.target.value }); this.commit(event.target.value); },
          onChange: event => {
            const draft = event.target.value;
            this.setState({ draft });
            if (!this.composing && !event.nativeEvent?.isComposing) this.commit(draft);
          },
          onKeyDown: event => { if (this.composing || event.nativeEvent?.isComposing || event.keyCode === 229) event.stopPropagation(); },
        });
      },
    });
    const SelectControl = window.CMS.getFieldType('select').control;
    const normalizePlatforms = window.GamePlatforms?.normalizePlatformList || (values => [...new Set(values || [])]);
    const sourceLabels = { rawg: 'RAWG', screenscraper: 'ScreenScraper', igdb: 'IGDB' };
    const labelSources = sources => Object.keys(sources || {}).map(source => sourceLabels[source] || source).join(' + ');
    const storeNames = ['Steam', 'GOG.com', 'Epic Store', 'Nintendo eShop', 'PlayStation Store', 'Xbox Store'];
    const storeAliases = { GOG: 'GOG.com', 'Epic Games': 'Epic Store', 'PS Store': 'PlayStation Store' };
    const presetStoreName = name => storeNames.includes(name) ? name : storeAliases[name] || '';
    const GameManual = createClass({
      getInitialState: function () { return { urlErrors: {}, customStores: {} }; },
      change: function (next) { this.props.onChange({ ...(this.props.value || {}), ...next }); },
      updateStore: function (index, key, value) {
        const current = this.props.value || {};
        const officialStores = [...(current.officialStores || [])];
        officialStores[index] = { ...(officialStores[index] || {}), [key]: value };
        this.change({ officialStores });
        const store = officialStores[index];
        let valid = false;
        try { valid = ['http:', 'https:'].includes(new URL(store.url || '').protocol); } catch { /* Incomplete URL while typing. */ }
        const error = !store.name && !store.url ? '' : !store.url ? '请填写商店链接' : !valid ? '链接必须以 http:// 或 https:// 开头' : '';
        this.setState({ urlErrors: { ...this.state.urlErrors, [index]: error } });
      },
      render: function () {
        const value = this.props.value || {};
        const stores = Array.isArray(value.officialStores) ? value.officialStores : [];
        const textInput = (index, key, placeholder, label, type = 'text') => h('label', { style: { display: 'grid', gap: '4px', minWidth: 0 } },
          h('span', null, label), h(ImeInput, { type, value: stores[index]?.[key] || '', placeholder,
            onChange: value => this.updateStore(index, key, value),
            style: { width: '100%', minHeight: '36px', padding: '6px 9px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' } }),
          key === 'url' && this.state.urlErrors[index] && h('small', { role: 'alert', style: { color: '#b7791f' } }, this.state.urlErrors[index]));
        return h('div', { style: { display: 'grid', gap: '12px' } },
          h('label', { style: { display: 'grid', gap: '5px' } }, h('span', null, '正版获取状态'), h('select', {
            value: value.availabilityStatus || 'unknown', onChange: event => this.change({ availabilityStatus: event.target.value }),
            style: { minHeight: '38px', padding: '6px 9px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' },
          }, [['available', '当前可数字购买'], ['delisted', '已从数字商店下架'], ['physical-only', '仅有实体版'], ['free', '官方免费'], ['unknown', '状态未知']].map(([key, label]) => h('option', { key, value: key }, label)))),
          h('strong', null, '正版购买渠道'),
          ...stores.map((store, index) => h('fieldset', { key: index, style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '8px', padding: '10px', border: '1px solid #68707a', borderRadius: '6px' } },
            h('div', { style: { display: 'grid', gap: '6px', minWidth: 0 } },
              h('label', { style: { display: 'grid', gap: '4px' } }, h('span', null, '渠道名称'), h('select', {
                value: this.state.customStores[index] || !presetStoreName(store.name) && store.name ? 'custom' : presetStoreName(store.name),
                onChange: event => {
                  const custom = event.target.value === 'custom';
                  this.setState({ customStores: { ...this.state.customStores, [index]: custom } });
                  this.updateStore(index, 'name', custom ? '' : event.target.value);
                },
                style: { width: '100%', minHeight: '36px', padding: '6px 9px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' },
              }, h('option', { value: '', disabled: true }, '请选择渠道'),
              ...storeNames.map(name => h('option', { key: name, value: name }, name)),
              h('option', { value: 'custom' }, '自定义'))),
              (this.state.customStores[index] || !presetStoreName(store.name) && store.name) && textInput(index, 'name', '输入渠道名称', '自定义渠道名称')),

            textInput(index, 'url', 'https://…', '商店 URL', 'url'),
            textInput(index, 'region', 'Global / JP / US / CN', '地区（可选）'),
            textInput(index, 'note', '仅日服 / 已下架…', '备注（可选）'),
            h('button', { type: 'button', onClick: () => {
              const customStores = {};
              for (const [key, custom] of Object.entries(this.state.customStores)) {
                const itemIndex = Number(key);
                if (itemIndex !== index) customStores[itemIndex > index ? itemIndex - 1 : itemIndex] = custom;
              }
              this.setState({ customStores });
              this.change({ officialStores: stores.filter((_, itemIndex) => itemIndex !== index) });
            }, style: { justifySelf: 'start', alignSelf: 'end', minHeight: '34px' } }, '删除渠道'),
          )),
          h('button', { type: 'button', onClick: () => this.change({ officialStores: [...stores, { name: '', url: '', region: '', note: '' }] }), style: { justifySelf: 'start', minHeight: '36px', padding: '6px 12px' } }, '＋ 添加正版渠道'),
          h('label', { style: { display: 'grid', gap: '5px' } }, h('span', null, '人工备注'), h(ImeInput, { multiline: true, rows: 3, value: value.notes || '', onChange: notes => this.change({ notes }), style: { width: '100%', padding: '8px 10px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' } })),
          h('small', null, '本区内容独立保存，刷新 RAWG / ScreenScraper 资料不会覆盖。'));
      },
    });
    window.CMS.registerFieldType('game-manual', GameManual);

    const GameMetadata = createClass({
      getInitialState: function () { return { loading: false, searching: false, message: '', results: [], query: '', dataSource: 'auto', pendingRefresh: null }; },
      update: function (key, value) {
        if (key === 'platforms' || key === 'selectedPlatforms') value = normalizePlatforms(value);
        const current = this.props.value || {};
        const manualFields = new Set(current.manualFields || []);
        const fieldSources = { ...(current.fieldSources || {}) };
        const isEmpty = Array.isArray(value) ? value.length === 0 : !String(value || '').trim();
        if (isEmpty) { manualFields.delete(key); delete fieldSources[key]; }
        else { manualFields.add(key); fieldSources[key] = 'manual'; }
        this.props.onChange({ ...current, [key]: value, fieldSources, manualFields: [...manualFields] });
      },
      searchGames: async function () {
        const query = String(this.state.query || '').trim();
        if (!query) { this.setState({ message: '请输入游戏名称。' }); return; }
        this.setState({ searching: true, message: '正在搜索游戏资料…', results: [] });
        try {
          const response = await fetch(`https://blog.blfy.cc/ns/api/games/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(this.state.dataSource)}`);
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `搜索失败（${response.status}）`);
          this.setState({ results: result.results || [], message: result.results?.length ? `找到 ${result.results.length} 个候选，请人工确认名称、年份和平台。${result.warnings?.length ? `（${result.warnings.join('；')}）` : ''}` : (result.warnings?.join('；') || '没有找到结果，请尝试其他语言或关键词。') });
        } catch (error) {
          this.setState({ message: error instanceof Error ? error.message : '游戏数据库暂不可用，请稍后重试。' });
        } finally { this.setState({ searching: false }); }
      },
      selectGame: async function (candidate, refresh = false) {
        this.setState({ loading: true, message: refresh ? '正在刷新游戏资料…' : '正在读取游戏资料…' });
        try {
          const response = await fetch('https://blog.blfy.cc/ns/api/games/detail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: candidate.title || this.props.value?.title || '', sources: candidate.sources || this.props.value?.sources || {}, dataSource: this.state.dataSource, refresh }) });
          const game = await response.json();
          if (!response.ok) throw new Error(game.error || `读取失败（${response.status}）`);
          const current = this.props.value || {};
          const keys = ['title', 'localizedName', 'originalName', 'alternativeNames', 'description', 'releaseDate', 'developers', 'publishers', 'platforms', 'genres', 'cover', 'screenshots', 'website'];
          const manualFields = new Set(current.manualFields || []);
          if (!current.id && !current.sources) for (const key of keys) {
            const hasValue = Array.isArray(current[key]) ? current[key].length > 0 : Boolean(String(current[key] || '').trim());
            if (hasValue) manualFields.add(key);
          }
          const next = { ...current, id: game.id, sources: game.sources || candidate.sources || {}, fieldSources: game.fieldSources || {}, updatedAt: game.updatedAt || new Date().toISOString(), manualFields: [...manualFields] };
          for (const key of keys) {
            if (manualFields.has(key)) continue;
            const hasValue = Array.isArray(current[key]) ? current[key].length > 0 : Boolean(String(current[key] || '').trim());
              if (!hasValue || refresh || current.sources) next[key] = game[key] || (['alternativeNames', 'developers', 'publishers', 'platforms', 'genres', 'screenshots'].includes(key) ? [] : '');
            }
          next.platforms = normalizePlatforms(next.platforms);
          next.selectedPlatforms = normalizePlatforms(current.selectedPlatforms).filter(platform => next.platforms.includes(platform));
          if (refresh) {
            const labels = { title: '游戏名称', localizedName: '本地化名称', originalName: '原名', alternativeNames: '别名', description: '简介', releaseDate: '发售日期', developers: '开发商', publishers: '发行商', platforms: '平台', genres: '类型', cover: '封面', screenshots: '截图', website: '官网' };
            const changes = keys.flatMap(key => {
              const before = current[key] || (Array.isArray(game[key]) ? [] : '');
              const after = key === 'platforms' ? normalizePlatforms(game[key]) : game[key] || (Array.isArray(before) ? [] : '');
              return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ key, label: labels[key], before, after, locked: manualFields.has(key), selected: !manualFields.has(key) }];
            });
            if (!changes.length) this.setState({ pendingRefresh: null, message: '资料没有变化，当前档案未修改。' });
            else this.setState({ pendingRefresh: { game, changes }, message: '请比较新旧资料，勾选要采用的字段，再确认更新。手动字段保持不变。' });
            return;
          }
          this.props.onChange(next);
          this.setState({ results: [], selected: candidate, message: `${refresh ? '游戏资料已刷新' : '游戏资料已填入'}；手动编辑的字段会保留。${game.warnings?.length ? ` 部分来源未能补充：${game.warnings.join('；')}` : ''}${game.warning ? `（上游暂不可用，当前保留缓存资料：${game.warning}）` : ''}` });
        } catch (error) {
          this.setState({ message: error instanceof Error ? error.message : '游戏资料读取失败，请稍后重试。' });
        } finally { this.setState({ loading: false }); }
      },
      applyRefresh: function () {
        const pending = this.state.pendingRefresh;
        if (!pending) return;
        const current = this.props.value || {};
        const next = { ...current, fieldSources: { ...(current.fieldSources || {}) } };
        const applied = [];
        for (const change of pending.changes) {
          if (!change.selected || change.locked || (current.manualFields || []).includes(change.key)) continue;
          // Do not replace edits made while the comparison was open.
          const before = current[change.key] || (Array.isArray(change.before) ? [] : '');
          if (JSON.stringify(before) !== JSON.stringify(change.before)) continue;
          next[change.key] = change.after;
          next.fieldSources[change.key] = pending.game.fieldSources?.[change.key] || Object.keys(pending.game.sources || {})[0] || 'manual';
          applied.push(change.key);
        }
        if (applied.length) {
          next.id = pending.game.id || current.id;
          next.sources = { ...(current.sources || {}), ...(pending.game.sources || {}) };
          next.updatedAt = pending.game.updatedAt || new Date().toISOString();
          // Keep selected versions, even if the refreshed catalog omitted them.
          next.selectedPlatforms = normalizePlatforms(current.selectedPlatforms);
          next.platforms = normalizePlatforms(next.platforms);
          this.props.onChange(next);
        }
        this.setState({ pendingRefresh: null, message: applied.length ? `已采用 ${applied.length} 个字段的变更，请保存档案。` : '未采用任何变更，当前档案保持不变。' });
      },
      render: function () {
        const value = this.props.value || {};
        const input = (key, label, type = 'text') => h('label', { key, style: { display: 'grid', gap: '5px' } }, h('span', null, label), h(ImeInput, { type, value: value[key] || '', onChange: value => this.update(key, value), style: { width: '100%', minHeight: '38px', padding: '7px 10px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' } }));
        const text = (key, label) => h('label', { key, style: { display: 'grid', gap: '5px' } }, h('span', null, label), h(ImeInput, { multiline: true, value: value[key] || '', onChange: value => this.update(key, value), rows: 3, style: { width: '100%', padding: '8px 10px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' } }));
        const stringList = (key, label) => h('label', { key, style: { display: 'grid', gap: '5px' } }, h('span', null, label), h(ImeInput, { type: 'text', value: Array.isArray(value[key]) ? value[key].join(', ') : '', onChange: value => this.update(key, value.split(/[,，]/).map(item => item.trim()).filter(Boolean)), style: { width: '100%', minHeight: '38px', padding: '7px 10px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' } }));
        const pending = this.state.pendingRefresh;
        const showValue = value => Array.isArray(value) ? value.join('、') || '（空）' : String(value || '（空）');
        return h('div', { style: { display: 'grid', gap: '10px' } },
          pending && h('section', { 'aria-label': '游戏资料变更预览', style: { display: 'grid', gap: '10px', border: '2px solid #68707a', borderRadius: '8px', padding: '12px' } },
            h('strong', null, '资料更新对比（确认前不会修改档案）'),
            ...pending.changes.map(change => h('div', { key: change.key, style: { borderBottom: '1px solid #68707a', paddingBottom: '10px', minWidth: 0 } },
              h('label', null, h('input', { type: 'checkbox', checked: change.selected, disabled: change.locked, onChange: event => this.setState({ pendingRefresh: { ...pending, changes: pending.changes.map(item => item.key === change.key ? { ...item, selected: event.target.checked } : item) } }) }), ` ${change.label}${change.locked ? '（手动字段，不覆盖）' : ''}`),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: '10px', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', maxHeight: '260px', overflowY: 'auto' } },
                h('div', null, h('small', null, '当前值'), h('p', null, showValue(change.before))), h('div', null, h('small', null, '数据源新值'), h('p', null, showValue(change.after)))))),
            h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, h('button', { type: 'button', onClick: () => this.applyRefresh() }, '确认采用勾选变更'), h('button', { type: 'button', onClick: () => this.setState({ pendingRefresh: null, message: '已取消刷新，当前档案未修改。' }) }, '取消，保留原资料'))),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '8px', alignItems: 'end' } },
            h('label', { style: { display: 'grid', gap: '5px' } }, h('span', null, '搜索游戏资料'), h('input', { type: 'search', value: this.state.query, placeholder: '支持中文、日文、英文等游戏名称', onChange: event => this.setState({ query: event.target.value }), onKeyDown: event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); this.searchGames(); } }, style: { width: '100%', minHeight: '38px', padding: '7px 10px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' } })),
            h('button', { id: this.props.forID, type: 'button', disabled: this.state.loading || this.state.searching, onClick: () => this.searchGames(), style: { minHeight: '38px', padding: '7px 14px', cursor: this.state.searching ? 'wait' : 'pointer' } }, this.state.searching ? '搜索中…' : '搜索游戏'),
          ),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', null, '数据源'), h('select', { value: this.state.dataSource, onChange: event => this.setState({ dataSource: event.target.value }), style: { minHeight: '36px', padding: '5px 9px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit' } }, [['auto', '自动'], ['rawg', 'RAWG'], ['screenscraper', 'ScreenScraper']].map(([key, label]) => h('option', { key, value: key }, label)))),
          this.state.results.length > 0 && h('div', { style: { display: 'grid', gap: '6px' } }, this.state.results.map(item => h('button', {
            key: item.id, type: 'button', disabled: this.state.loading, onClick: () => this.selectGame(item),
            style: { display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', alignItems: 'center', gap: '12px', width: '100%', minWidth: 0, textAlign: 'left', padding: '8px', cursor: 'pointer', color: 'inherit', background: 'transparent', border: '1px solid #68707a', borderRadius: '8px' },
          }, h('span', { 'aria-hidden': 'true', style: { display: 'grid', placeItems: 'center', width: '72px', height: '88px', overflow: 'hidden', borderRadius: '5px', background: 'linear-gradient(145deg,#35404d,#20262e)', color: '#b8c2cf', fontSize: '28px' } }, item.cover ? h('img', { src: item.cover, alt: '', style: { display: 'block', width: '100%', height: '100%', objectFit: 'cover' } }) : '🎮'), h('span', { style: { display: 'block', minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.5 } }, h('strong', { style: { display: 'block', marginBottom: '4px', fontSize: '1em', lineHeight: 1.35 } }, item.title), h('span', { style: { color: 'inherit', opacity: .82 } }, `${(item.platforms || []).join('、') || '平台未知'} · ${item.year || '年份未知'} · ${(item.developers || []).join('、') || '开发商未知'} · 来源：${labelSources(item.sources)}`))))),
          value.sources && h('button', { type: 'button', disabled: this.state.loading || this.state.searching, onClick: () => this.selectGame({ title: value.title, sources: value.sources }, true), style: { justifySelf: 'start', minHeight: '36px', padding: '6px 12px', cursor: this.state.loading ? 'wait' : 'pointer' } }, '刷新游戏资料'),
          input('title', '游戏名称（可手动覆盖）'), input('localizedName', '中文本地化名称'), input('originalName', '原始名称'),
          stringList('alternativeNames', '别名 / Alternative Names'), input('cover', '封面图片 URL'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '10px' } }, input('releaseDate', '发售日期', 'date'), input('website', '官方网站 URL')),
          stringList('developers', '开发商（逗号分隔）'), stringList('publishers', '发行商（逗号分隔）'),
          stringList('platforms', '平台（逗号分隔）'), stringList('genres', '类型 / Genre'), stringList('screenshots', '截图 URL（逗号分隔）'),
          h('fieldset', { style: { display: 'grid', gap: '7px', padding: '10px', border: '1px solid #68707a', borderRadius: '6px' } },
            h('legend', null, '加入游戏档案的平台（只勾选你要记录的版本）'),
            ...normalizePlatforms([...(value.platforms || []), ...(value.selectedPlatforms || [])]).map(platform => h('label', { key: platform, style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h('input', { type: 'checkbox', checked: normalizePlatforms(value.selectedPlatforms).includes(platform), onChange: event => {
                const selected = new Set(normalizePlatforms(value.selectedPlatforms));
                if (event.target.checked) selected.add(platform); else selected.delete(platform);
                this.update('selectedPlatforms', [...selected]);
              } }), platform)),
            h('small', null, '资料源的平台清单会完整保留；只有勾选的平台会生成前台游戏平台卡片。已有手动平台卡片时，以手动卡片为准。')),
          text('description', '游戏简介'), value.sources && h('small', null, `数据来源：${Object.keys(value.sources).join('、')} · 最近更新：${String(value.updatedAt || '未知').slice(0, 10)}`),
          this.state.message && h('div', { role: this.state.message.startsWith('游戏资料已填入') || this.state.message.startsWith('游戏资料已刷新') ? 'status' : 'alert', 'aria-live': 'polite', style: { padding: '9px 12px', borderRadius: '6px', border: `1px solid ${this.state.message.startsWith('游戏资料已填入') || this.state.message.startsWith('游戏资料已刷新') ? '#2e7d32' : '#b7791f'}`, background: this.state.message.startsWith('游戏资料已填入') || this.state.message.startsWith('游戏资料已刷新') ? 'rgba(46,125,50,.12)' : 'rgba(183,121,31,.12)' } }, this.state.message),
        );
      },
    });
    window.CMS.registerFieldType('game-metadata', GameMetadata);
    const normalizeName = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
    const GameArchivePicker = createClass({
      getInitialState: function () { return { entries: [], open: false, query: '', loading: false, error: '', active: 0 }; },
      componentDidMount: function () { this.alive = true; this.loadEntries(); },
      componentWillUnmount: function () { this.alive = false; },
      loadEntries: async function () {
        this.setState({ loading: true, error: '' });
        try {
          const response = await fetch('/game-dossiers.json', { cache: 'no-store' });
          if (!response.ok) throw new Error('本地游戏档案读取失败，请重试。');
          const entries = await response.json();
          if (!Array.isArray(entries)) throw new Error('本地游戏档案格式异常。');
          if (this.alive) this.setState({ entries: entries.filter(entry => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) && typeof entry.title === 'string') });
        } catch (error) {
          if (this.alive) this.setState({ error: error instanceof Error ? error.message : '本地游戏档案读取失败，请重试。' });
        } finally { if (this.alive) this.setState({ loading: false }); }
      },
      options: function () {
        const query = normalizeName(this.state.query);
        return this.state.entries.filter(entry => !query || [entry.title, entry.slug, ...(entry.names || [])].some(name => normalizeName(name).includes(query)));
      },
      choose: function (entry) { this.props.onChange(entry.slug); this.setState({ open: false, query: '', active: 0 }); this.toggle?.focus(); },
      render: function () {
        const { entries, open, query, loading, error, active } = this.state;
        const selected = entries.find(entry => entry.slug === this.props.value);
        const optional = this.props.required === false || this.props.field?.get?.('required') === false || this.props.field?.required === false;
        const options = this.options();
        const listId = `${this.props.forID || 'game-archive'}-options`;
        const style = { width: '100%', minHeight: '40px', padding: '8px 12px', border: '1px solid #68707a', borderRadius: '6px', background: 'transparent', color: 'inherit', textAlign: 'left' };
        return h('div', { onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget)) this.setState({ open: false }); } },
          h('button', { type: 'button', ref: element => { this.toggle = element; }, disabled: this.props.readonly,
            'aria-label': '选择游戏档案', 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': listId, style,
            onClick: () => { this.setState({ open: !open, query: '', active: 0 }); if (!open && !loading) this.loadEntries(); },
          }, selected?.title || (this.props.value ? `档案：${this.props.value}` : '请选择已有游戏档案'), h('span', { style: { float: 'right' }, 'aria-hidden': true }, ' ▾')),
          open && h('div', { style: { border: '1px solid #68707a', borderRadius: '6px', marginTop: '4px', padding: '8px' } },
            h('input', { ref: element => { if (element && this.searchInput !== element) { this.searchInput = element; element.focus(); } },
              type: 'search', value: query, placeholder: '搜索手动名称、原名或别名…', role: 'combobox',
              'aria-label': '筛选已有游戏档案', 'aria-expanded': true, 'aria-controls': listId, 'aria-autocomplete': 'list',
              'aria-activedescendant': options[active] ? `${listId}-${active}` : undefined, style,
              onChange: event => this.setState({ query: event.target.value, active: 0 }),
              onKeyDown: event => {
                if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) return;
                if (event.key === 'Escape') { event.preventDefault(); this.setState({ open: false }); this.toggle?.focus(); }
                else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.setState({ active: Math.max(0, Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))) }); }
                else if (event.key === 'Enter') { event.preventDefault(); if (options[active]) this.choose(options[active]); }
              },
            }),
            loading && h('small', { role: 'status' }, '正在读取本地游戏档案…'),
            error && h('div', { role: 'alert' }, error, h('button', { type: 'button', onClick: this.loadEntries }, '重试')),
            h('div', { id: listId, role: 'listbox', 'aria-label': '已有游戏档案', style: { maxHeight: '260px', overflowY: 'auto', marginTop: '6px' } },
              ...options.map((entry, index) => h('button', { key: entry.slug, id: `${listId}-${index}`, type: 'button', role: 'option',
                'aria-selected': entry.slug === this.props.value, style: { ...style, border: 0, background: index === active ? 'rgba(128,128,128,.18)' : 'transparent' },
                onMouseDown: event => event.preventDefault(), onClick: () => this.choose(entry),
              }, entry.title))),
            !loading && !error && !options.length && h('small', { role: 'status' }, entries.length ? '没有匹配的本地档案。' : '尚无已发布的游戏档案，请先保存档案并等待网站部署完成。'),
          ), optional && this.props.value && h('button', { type: 'button', disabled: this.props.readonly,
            onClick: () => { this.props.onChange(''); this.setState({ open: false, query: '', active: 0 }); },
            style: { marginTop: '6px', marginRight: '8px' },
          }, '取消关联'), h('small', null, '仅筛选本站已有档案；名称与原名均可匹配，显示档案的手动覆盖名称。新保存的档案在网站部署完成后进入列表。'));
      },
    });
    window.CMS.registerFieldType('game-archive-picker', GameArchivePicker);
    window.CMS.registerEditorComponent({
        id: 'game-card', label: '添加游戏', tooltip: '添加游戏', icon: 'sports_esports', trigger: 'button',
        fields: [
          { name: 'gameSlug', label: '选择游戏档案', widget: 'game-archive-picker', required: true },
          // Keep legacy frame identity when editing an existing article card.
          { name: 'frame', widget: 'hidden', default: 'g' },
          { name: 'title', widget: 'hidden', required: false },
          { name: 'status', label: '本文状态覆盖（可选）', widget: 'string', required: false, hint: '留空时使用档案当前状态。' },
        ],
        pattern: /^\[(g|p|n|x|s)frame\]\s*([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|([^|\]]*))?(?:\|([^|\]]*))?\s*\[\/\1frame\]$/,
        fromBlock: match => ({ frame: match[1], gameSlug: match[2], title: match[3] || '', status: match[4] || '' }),
        toBlock: ({ gameSlug = '', frame = 'g', title = '', status = '' }) => {
          const slug = String(gameSlug).trim().toLowerCase();
          const tag = `${['g', 'p', 'n', 'x', 's'].includes(frame) ? frame : 'g'}frame`;
          return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `[${tag}]${slug}|${String(title).replace(/[|\]]/g, '')}|${String(status).replace(/[|\]]/g, '')}[/${tag}]` : '';
        },
        toPreview: ({ gameSlug = '', title = '', status = '' }) => `游戏档案（${String(title) || String(gameSlug) || '请选择游戏'}${status ? ` · ${status}` : ''}）`,
      });
    window.CMS.registerEditorComponent({
      id: 'pdf', label: '插入 PDF', tooltip: '上传或选择 PDF', icon: 'picture_as_pdf', trigger: 'button',
      fields: [
        { name: 'file', label: 'PDF 文件', widget: 'file', required: true, accept: '.pdf,application/pdf', choose_url: false, pattern: ['\\.[pP][dD][fF]$', '请选择 PDF 文件'], hint: '与图片共用资源库。请选择或上传 .pdf 文件。' },
        { name: 'title', label: '文件标题', widget: 'string', required: false, default: 'PDF 文档' },
      ],
      pattern: /^\[([^\]\n]*)\]\((\/uploads\/[^\s)]+\.pdf|blob:[^\s)]+) "pdf-embed"\)$/i,
      fromBlock: match => ({ title: match[1], file: decodeURI(match[2]) }),
      toBlock: ({ file = '', title = 'PDF 文档' }) => {
        const value = String(file).trim();
        const label = String(title || 'PDF 文档').replace(/[\[\]\\\r\n]/g, ' ');
        // Sveltia stores a new upload as a blob URL until saving replaces it
        // with its permanent /uploads/ path. Keep that draft reference intact.
        if (/^blob:https?:\/\/[^\s)]+$/.test(value)) return '[' + label + '](' + value + ' "pdf-embed")';
        if (!value.startsWith('/uploads/') || !/\.pdf$/i.test(value) || /[?#\\]/.test(value)) return '';
        let parts; try { parts = value.split('/').map(part => decodeURIComponent(part)); } catch { return ''; }
        if (parts.some(part => part === '.' || part === '..' || /[\x00-\x1f\\?#/]/.test(part))) return '';
        const url = parts.map(part => encodeURIComponent(part).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())).join('/');
        return '[' + label + '](' + url + ' "pdf-embed")';
      },
      toPreview: ({ title = 'PDF 文档' }) => 'PDF 内嵌阅读：' + String(title).replace(/[<>&"']/g, ''),
    });
    window.CMS.registerEditorComponent({
      id: 'horizontal-rule', label: '插入分隔线', tooltip: '插入分隔线', icon: 'horizontal_rule', trigger: 'button',
      fields: [], collapsed: true,
      pattern: /^---$/m,
      fromBlock: () => ({}),
      // Blank lines prevent the previous paragraph becoming a Setext heading.
      toBlock: () => '\n\n---\n\n',
      toPreview: () => '<hr />',
    });
    window.CMS.registerEditorComponent({
      id: 'image-compare', label: '截图前后对比', icon: 'compare', trigger: 'button',
      fields: [
        { name: 'before', label: '之前的图片', widget: 'image', required: true },
        { name: 'after', label: '之后的图片', widget: 'image', required: true },
        { name: 'beforeLabel', label: '左侧说明', widget: 'string', required: false },
        { name: 'afterLabel', label: '右侧说明', widget: 'string', required: false },
      ],
      pattern: /^\[compare\]\s*([^|\]]+)\|([^|\]]+)(?:\|([^|\]]*))?(?:\|([^|\]]*))?\s*\[\/compare\]$/,
      fromBlock: match => ({ before: match[1], after: match[2], beforeLabel: match[3] || '之前', afterLabel: match[4] || '之后' }),
      toBlock: ({ before = '', after = '', beforeLabel = '之前', afterLabel = '之后' }) => before && after ? `[compare]${String(before).replace(/[|\]]/g, '')}|${String(after).replace(/[|\]]/g, '')}|${String(beforeLabel).replace(/[|\]]/g, '')}|${String(afterLabel).replace(/[|\]]/g, '')}[/compare]` : '',
      toPreview: ({ beforeLabel = '之前', afterLabel = '之后' }) => `截图对比：${beforeLabel} ↔ ${afterLabel}`,
    });
    return true;
  };
  if (!register()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (register() || attempts >= 50) window.clearInterval(timer);
    }, 100);
  }
})();
