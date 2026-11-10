(() => {
  const register = () => {
    if (!window.CMS?.registerFieldType || !window.h || !window.createClass) return false;
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
          onKeyDown: event => { if (this.composing || event.nativeEvent?.isComposing || event.keyCode === 229) event.stopPropagation(); else props.onKeyDown?.(event); },
        });
      },
    });
    const normalizePlatforms = window.GamePlatforms?.normalizePlatformList || (values => [...new Set(values || [])]);
    const sourceLabels = { rawg: 'RAWG', screenscraper: 'ScreenScraper', thegamesdb: 'TheGamesDB', igdb: 'IGDB' };
    const archiveRequest = (path, options) => {
      if (!window.BlogAdminAuth?.request) throw new Error('请从博客后台登录后使用数据源。');
      return window.BlogAdminAuth.request(path, options);
    };
    const storeNames = ['Steam', 'GOG.com', 'Epic Store', 'Nintendo eShop', 'PlayStation Store', 'Xbox Store'];
    const storeAliases = { GOG: 'GOG.com', 'Epic Games': 'Epic Store', 'PS Store': 'PlayStation Store' };
    const presetStoreName = name => storeNames.includes(name) ? name : storeAliases[name] || '';
    const GameManual = createClass({
      getInitialState: function () { return { customStores: {} }; },
      change: function (next) { this.props.onChange({ ...(this.props.value || {}), ...next }); },
      updateStore: function (index, key, value) {
        const current = this.props.value || {};
        const officialStores = [...(current.officialStores || [])];
        officialStores[index] = { ...(officialStores[index] || {}), [key]: value };
        this.change({ officialStores });
      },
      render: function () {
        const value = this.props.value || {};
        const stores = Array.isArray(value.officialStores) ? value.officialStores : [];
        const textInput = (index, key, placeholder, label, type = 'text') => h('label', { className: 'dossier-label' },
          h('span', null, label), h(ImeInput, { type, value: stores[index]?.[key] || '', placeholder,
            onChange: value => this.updateStore(index, key, value),
            className: 'dossier-input' }),
          key === 'url' && stores[index]?.url && !safeUrl(stores[index].url) && h('small', { className: 'dossier-error' }, '请填写完整的 http:// 或 https:// 链接。'));
        return h('section', { className: 'dossier-stack', 'aria-label': '正版渠道与获取状态' },
          h('label', { className: 'dossier-label' }, h('span', null, '正版获取状态'), h('select', {
            value: value.availabilityStatus || 'unknown', onChange: event => this.change({ availabilityStatus: event.target.value }),
            className: 'dossier-input',
          }, [['available', '当前可数字购买'], ['delisted', '已从数字商店下架'], ['physical-only', '仅有实体版'], ['free', '官方免费'], ['unknown', '状态未知']].map(([key, label]) => h('option', { key, value: key }, label)))),

          ...stores.map((store, index) => h('fieldset', { key: index, className: 'dossier-card dossier-form-grid' },
            h('div', { className: 'dossier-stack' },
              h('label', { className: 'dossier-label' }, h('span', null, '渠道名称'), h('select', {
                value: this.state.customStores[index] || !presetStoreName(store.name) && store.name ? 'custom' : presetStoreName(store.name),
                onChange: event => {
                  const custom = event.target.value === 'custom';
                  this.setState({ customStores: { ...this.state.customStores, [index]: custom } });
                  this.updateStore(index, 'name', custom ? '' : event.target.value);
                },
                className: 'dossier-input',
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
            }, className: 'dossier-button dossier-secondary' }, '删除渠道'),
          )),
          h('button', { type: 'button', onClick: () => this.change({ officialStores: [...stores, { name: '', url: '', region: '', note: '' }] }), className: 'dossier-button dossier-secondary' }, '＋ 添加正版渠道'),
          h('label', { className: 'dossier-label' }, h('span', null, '人工备注'), h(ImeInput, { multiline: true, rows: 3, value: value.notes || '', onChange: notes => this.change({ notes }), className: 'dossier-input' })),
          h('small', null, '本区内容独立保存，刷新外部游戏资料不会覆盖。'));
      },
    });


    const coverRoot = '/ns/api/games/covers';
    const GameCoverPicker = createClass({
      getInitialState: function () {
        return { open: false, query: '', loading: false, games: [], grids: [], game: null, page: 0, hasMore: false, message: '', error: false };
      },
      componentWillUnmount: function () { this.version = (this.version || 0) + 1; },
      toggle: function () {
        this.version = (this.version || 0) + 1;
        this.setState(this.state.open ? { open: false, loading: false, message: '', error: false }
          : { ...this.getInitialState(), open: true, query: String(this.props.suggestedQuery || '').slice(0, 100) });
      },
      load: async function (path, pending, apply) {
        if (this.state.loading) return;
        const version = this.version = (this.version || 0) + 1;
        this.setState({ ...pending, loading: true, error: false });
        try {
          const response = await archiveRequest(path);
          const result = await response.json();
          if (!response.ok) throw new Error(result.error === 'ADMIN_LOGIN_REQUIRED' ? '请重新登录博客后台。' : result.error || 'SteamGridDB 搜索失败。');
          if (version === this.version) apply(result);
        } catch (error) {
          if (version === this.version) this.setState({ error: true, message: error instanceof Error ? error.message : 'SteamGridDB 暂不可用，请稍后重试。' });
        } finally { if (version === this.version) this.setState({ loading: false }); }
      },
      search: function () {
        const query = this.state.query.trim();
        if (query.length < 2) { this.setState({ message: '请输入至少两个字符。', error: true }); return; }
        return this.load(`${coverRoot}/search?q=${encodeURIComponent(query)}`,
          { games: [], grids: [], game: null, page: 0, hasMore: false, message: '正在搜索 SteamGridDB 游戏…' }, result => {
            const games = result.results || [];
            this.setState({ games, message: (games.length ? '请选择游戏或版本。' : '没有找到游戏，试试原名或英文名。') + (result.warning ? ' 当前显示缓存结果。' : '') });
          });
      },
      loadGrids: function (game, page = 0) {
        return this.load(`${coverRoot}?gameId=${encodeURIComponent(game.id)}&page=${page}`,
          { game, ...(page === 0 ? { grids: [], page: 0, hasMore: false } : {}), message: '正在读取竖版封面…' }, result => {
            const grids = result.results || [];
            this.setState({ grids, page, hasMore: Boolean(result.hasMore),
              message: (grids.length ? `第 ${page + 1} 页 · ${grids.length} 张竖版封面` : '此页没有可用的竖版封面。') + (result.warning ? ' 当前显示缓存结果。' : '') });
          });
      },
      select: function (grid) {
        this.props.onSelect(grid.url);
        this.setState({ open: false, error: false, message: '已填入 SteamGridDB 封面 URL，请保存档案。' });
      },
      render: function () {
        const { open, query, loading, games, grids, game, page, hasMore, message, error } = this.state;
        return h('div', { className: 'game-cover-search' },
          h('button', { className: 'dossier-button dossier-secondary game-cover-search-toggle', type: 'button', 'aria-expanded': open, onClick: () => this.toggle() }, open ? '收起封面搜索' : '搜索 SteamGridDB 封面'),
          open && h('section', { className: 'game-cover-panel', 'aria-label': 'SteamGridDB 封面搜索' },
            h('div', { className: 'game-cover-query' },
              h('label', null, 'SteamGridDB 游戏名称', h('input', { type: 'search', value: query, maxLength: 100, disabled: loading,
                placeholder: '输入游戏原名或英文名', onChange: event => this.setState({ query: event.target.value }),
                onKeyDown: event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); this.search(); } },
              })),
              h('button', { type: 'button', disabled: loading, onClick: () => this.search() }, '搜索游戏')),
            games.length > 0 && h('div', { className: 'game-cover-games' }, ...games.map(item => h('button', { key: item.id, type: 'button', disabled: loading,
              'aria-pressed': game?.id === item.id, onClick: () => this.loadGrids(item),
            }, item.title, item.year ? ` (${item.year})` : ''))),
            grids.length > 0 && h('div', { className: 'game-cover-grids' }, ...grids.map((grid, index) => h('button', { key: grid.id, type: 'button', disabled: loading,
              'aria-label': `选用封面 ${index + 1}，${grid.width} × ${grid.height}${grid.author ? `，${grid.author}` : ''}`, onClick: () => this.select(grid),
            }, h('img', { src: grid.thumb, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }), h('small', null, `${grid.width} × ${grid.height}`, grid.author ? ` · ${grid.author}` : '')))),
            game && h('div', { className: 'game-cover-pagination' },
              page > 0 && h('button', { type: 'button', disabled: loading, onClick: () => this.loadGrids(game, page - 1) }, '上一页封面'),
              hasMore && h('button', { type: 'button', disabled: loading, onClick: () => this.loadGrids(game, page + 1) }, '下一页封面'),
              h('a', { href: `https://www.steamgriddb.com/game/${encodeURIComponent(game.id)}`, target: '_blank', rel: 'noopener noreferrer' }, '在 SteamGridDB 查看原页'))),
          message && h('small', { role: error ? 'alert' : 'status' }, message));
      },
    });

    const entryValue = (props, field) => {
      const value = props.entry?.getIn?.(['data', field]);
      return value?.toJS?.() ?? value;
    };
    const isComposing = event => event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229;
    const onEnter = action => event => {
      if (event.key !== 'Enter') return;
      event.stopPropagation();
      if (!isComposing(event)) { event.preventDefault(); action(); }
    };
    const safeUrl = value => {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
      } catch { return ''; }
    };
    const externalLink = (url, label) => safeUrl(url) ? h('a', { href: safeUrl(url), target: '_blank', rel: 'noopener noreferrer' }, label + ' ↗') : null;
    const button = (label, action, options = {}) => h('button', {
      type: 'button', className: 'dossier-button ' + (options.primary ? 'dossier-primary' : 'dossier-secondary'),
      onClick: action, disabled: options.disabled,
    }, label);
    const status = (message, error) => message ? h('p', { className: error ? 'dossier-message dossier-error' : 'dossier-message', role: error ? 'alert' : 'status' }, message) : null;
    const labelInput = (label, props) => h('label', { className: 'dossier-label' }, h('span', null, label), h(ImeInput, { className: 'dossier-input', ...props }));
    const details = (label, children) => h('details', { className: 'dossier-disclosure' }, h('summary', null, label), ...children);
    const listText = (value, separator) => Array.isArray(value) ? value.join(separator) : typeof value === 'string' ? value : '';
    const hasValue = value => Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
    const idString = value => /^[1-9]\d{0,15}$/.test(String(value ?? '')) ? String(value) : '';
    const briefProviders = ['rawg', 'thegamesdb', 'screenscraper'];
    const editionFor = (metadata, provider) => {
      if (!briefProviders.includes(provider)) return null;
      const source = metadata?.sources?.[provider];
      const id = idString(source?.id), systemId = idString(source?.systemId);
      return id && (provider !== 'screenscraper' || systemId) ? { provider, id, ...(systemId ? { systemId } : {}) } : null;
    };
    const getEdition = metadata => briefProviders.map(provider => editionFor(metadata, provider)).find(Boolean) || null;
    const editionRefKey = edition => edition ? [edition.provider, edition.id, edition.systemId || ''].join(':') : '';
    const editionKey = metadata => editionRefKey(getEdition(metadata));
    const sourceTags = sources => Object.entries(sources || {}).filter(([, source]) => source?.id)
      .map(([key, source]) => (sourceLabels[key] || key) + ' #' + source.id + (source.systemId ? '/' + source.systemId : '')).join(' · ');
    const platformRecordTags = sources => {
      const records = sources?.thegamesdb?.versions;
      const versions = Array.isArray(records) ? records.filter(version => version?.platform && /^[1-9]\d{0,15}$/.test(version.id)) : [];
      if (versions.length < 2) return null;
      return h('small', null, '平台记录：' + versions.map(version =>
        [version.platform, version.releaseDate, '#' + version.id].filter(Boolean).join(' ')).join('；'));
    };
    const formatFields = {
      title: '资料库名称', localizedName: '中文本地化名称', originalName: '原始名称', alternativeNames: '别名 / Alternative Names',
      releaseDate: '发售日期', developers: '开发商', publishers: '发行商', platforms: '平台', genres: '类型', cover: '封面',
      screenshots: '截图', website: '官网',
    };
    const showValue = value => Array.isArray(value) ? value.join('、') || '（空）' : String(value || '（空）');
    const checks = { title: '名称', year: '年份', platform: '平台', developer: '开发商' };

    const GameMetadata = createClass({
      getInitialState() {
        const value = this.props?.value || {};
        return { busy: '', message: '', error: false, results: [], query: '', dataSource: 'identity',
          searchOpen: !value.id && !getEdition(value), pendingRefresh: null,
          year: String(value.releaseDate || '').slice(0, 4), platform: normalizePlatforms(value.selectedPlatforms)[0] || '',
          developer: Array.isArray(value.developers) ? value.developers[0] || '' : listText(value.developers, '') };
      },
      componentWillUnmount() { this.disposed = true; },
      update(key, value, source = 'manual') {
        if (key === 'platforms' || key === 'selectedPlatforms') value = normalizePlatforms(value);
        const current = this.props.value || {};
        if (JSON.stringify(current[key]) === JSON.stringify(value) || (!hasValue(current[key]) && !hasValue(value))) return;
        const manualFields = new Set(current.manualFields || []);
        const fieldSources = { ...(current.fieldSources || {}) };
        if (hasValue(value)) { manualFields.add(key); fieldSources[key] = source; }
        else { manualFields.delete(key); delete fieldSources[key]; }
        this.props.onChange({ ...current, [key]: value, fieldSources, manualFields: [...manualFields] });
      },
      async run(action, handler) {
        if (this.state.busy) return;
        this.setState({ busy: action, message: '', error: false });
        try { await handler(); }
        catch (error) { if (!this.disposed) this.setState({ message: error.message || '游戏资料暂不可用。', error: true }); }
        finally { if (!this.disposed) this.setState({ busy: '' }); }
      },
      async searchGames() {
        const current = this.props.value || {};
        const query = String(this.state.query || current.originalName || entryValue(this.props, 'title') || current.title || '').trim();
        const { dataSource: source, year, platform, developer } = this.state;
        if (query.length < 2 || query.length > 100) { this.setState({ message: '请输入 2–100 个字符的游戏名称。', error: true }); return; }
        if (year && !/^(?:19|20)\d{2}$/.test(year)) { this.setState({ message: '请输入四位发行年份。', error: true }); return; }
        return this.run('search', async () => {
          this.setState({ results: [], query, searchOpen: true });
          let path = '/ns/api/games/search?q=' + encodeURIComponent(query) + '&source=' + encodeURIComponent(source);
          const usesArchive = ['identity', 'thegamesdb'].includes(source);
          for (const [key, value] of Object.entries({ year, platform, developer })) if (usesArchive && value) path += '&' + key + '=' + encodeURIComponent(value);
          const response = usesArchive ? await archiveRequest(path) : await fetch(path);
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || '搜索失败。');
          if (this.disposed) return;
          const results = data.results || [];
          this.setState({ results, message: (results.length
            ? '找到 ' + results.length + ' 个候选。请对照发行年份、平台和开发商后选用。'
            : '没有找到候选。试试游戏原名，或切换资料库。') + (data.warnings?.length ? ' ' + data.warnings.join('；') : '')
            + (data.warning ? ' 当前显示缓存结果。' : '') });
        });
      },
      async selectGame(candidate, refresh = false) {
        return this.run('detail', async () => {
          const sources = candidate.sources || this.props.value?.sources || {};
          const dataSource = sources.thegamesdb ? 'thegamesdb' : sources.rawg && sources.screenscraper ? 'auto'
            : sources.rawg ? 'rawg' : 'screenscraper';
          if (!getEdition({ sources })) throw new Error('请先选择带有资料库编号的版本。');
          const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            title: candidate.title || this.props.value?.title || '', sources, dataSource, refresh,
          }) };
          const response = dataSource === 'thegamesdb' ? await archiveRequest('/ns/api/games/detail', options) : await fetch('/ns/api/games/detail', options);
          const game = await response.json();
          if (!response.ok) throw new Error(game.error === 'ADMIN_LOGIN_REQUIRED' ? '请重新登录博客后台。' : game.error || '读取失败。');
          if (this.disposed) return;
          const current = this.props.value || {};
          const keys = Object.keys(formatFields).filter(key => (dataSource !== 'thegamesdb' || !['cover', 'screenshots'].includes(key)) && hasValue(game[key]));
          const manualFields = new Set(current.manualFields || []);
          if (!getEdition(current)) for (const key of keys) if (hasValue(current[key])) manualFields.add(key);
          const valueOf = key => key === 'platforms' ? normalizePlatforms(game[key]) : game[key];
          const fieldSource = key => game.fieldSources?.[key] || Object.keys(game.sources || sources)[0] || 'manual';
          const warning = game.warning || (Array.isArray(game.warnings) ? game.warnings.join('；') : '');
          if (refresh) {
            const changes = keys.flatMap(key => {
              const before = current[key], after = valueOf(key);
              return JSON.stringify(before) === JSON.stringify(after) ? [] : [{
                key, before, after, locked: manualFields.has(key), selected: !manualFields.has(key),
              }];
            });
            this.setState({ pendingRefresh: changes.length ? { edition: editionKey(current), changes, game, sources } : null,
              message: (changes.length ? '请勾选要采用的字段。简介与手动内容不会自动覆盖。' : '资料没有变化。') + (warning ? ' ' + warning : '') });
            return;
          }
          const next = { ...current, id: game.id, sources: game.sources || sources, updatedAt: game.updatedAt || new Date().toISOString(),
            fieldSources: { ...current.fieldSources }, manualFields: [...manualFields] };
          for (const key of keys) if (!manualFields.has(key)) {
            next[key] = valueOf(key);
            next.fieldSources[key] = fieldSource(key);
          }
          const changedEdition = editionKey(current) && editionKey(current) !== editionKey(next);
          // Don't retain imported metadata from a different edition when the
          // new source lacks a field. Hand-entered and locked fields stay put.
          if (changedEdition) for (const key of Object.keys(formatFields)) {
            if (!keys.includes(key) && !manualFields.has(key) && current.fieldSources?.[key] && !['manual', 'steamgriddb'].includes(current.fieldSources[key])) {
              delete next[key];
              delete next.fieldSources[key];
            }
          }
          next.platforms = normalizePlatforms(next.platforms);
          next.selectedPlatforms = normalizePlatforms(current.selectedPlatforms);
          this.props.onChange(next);
          this.setState({ results: [], searchOpen: false, pendingRefresh: null,
            message: (changedEdition ? '已更换游戏版本；原简介仍保留，请复核。' : '已确认游戏版本。接下来可翻译简介。') + (warning ? ' ' + warning : '') });
        });
      },
      applyRefresh() {
        const pending = this.state.pendingRefresh;
        if (!pending) return;
        const current = this.props.value || {};
        const next = { ...current, fieldSources: { ...current.fieldSources } };
        let count = 0;
        if (editionKey(current) === pending.edition) for (const change of pending.changes) {
          if (!change.selected || change.locked || (current.manualFields || []).includes(change.key)
            || JSON.stringify(current[change.key]) !== JSON.stringify(change.before)) continue;
          next[change.key] = change.after;
          next.fieldSources[change.key] = pending.game.fieldSources?.[change.key] || Object.keys(pending.sources)[0] || 'manual';
          count++;
        }
        if (count) {
          next.updatedAt = pending.game.updatedAt || new Date().toISOString();
          next.selectedPlatforms = normalizePlatforms(current.selectedPlatforms);
          next.platforms = normalizePlatforms(next.platforms);
          this.props.onChange(next);
        }
        this.setState({ pendingRefresh: null, message: count ? '已采用 ' + count + ' 项变更。' : '资料未修改。' });
      },
      render() {
        const value = this.props.value || {};
        const { busy, results, pendingRefresh } = this.state;
        const edition = getEdition(value);
        const heading = value.title || value.originalName;
        const field = (key, label = formatFields[key], type = 'text', list = false) => h('div', { key }, labelInput(label, {
          type, value: list ? listText(value[key], ', ') : value[key] || '',
          onChange: text => this.update(key, list ? text.split(/[,，]/).map(item => item.trim()).filter(Boolean) : text),
        }));
        // All inputs stay mounted when switching views; Sveltia retains its
        // native save/preview/validation logic and existing front matter keys.
        return h('div', { className: 'dossier-stack' },
          h('section', { className: 'dossier-stack', 'data-dossier-pane': 'core', 'aria-label': '核对游戏版本' },
            edition && h('div', { className: 'dossier-card dossier-identity' },
              h('div', null, h('span', { className: 'dossier-kicker' }, '已关联版本'), h('strong', null, heading || '游戏版本'),
                h('small', null, [String(value.releaseDate || '').slice(0, 4), listText(value.platforms, ' / '), listText(value.developers, '、')].filter(Boolean).join(' · ') || '发行资料待补充'),
                h('small', null, sourceTags(value.sources)), platformRecordTags(value.sources)),
              externalLink(value.sources[edition.provider]?.url, '资料库')),
            h('details', { className: 'dossier-disclosure', open: this.state.searchOpen,
              onToggle: event => { if (event.currentTarget.open !== this.state.searchOpen) this.setState({ searchOpen: event.currentTarget.open }); } },
              h('summary', { id: this.props.forID }, edition ? '更换游戏版本' : '搜索并确认游戏版本'),
              h('div', { className: 'dossier-stack' },
                h('div', { className: 'dossier-row' }, labelInput('游戏原名或别名', {
                  type: 'search', value: this.state.query, placeholder: value.originalName || entryValue(this.props, 'title') || '例如 Resident Evil 4',
                  maxLength: 100, disabled: !!busy, onChange: query => this.setState({ query, results: [], message: '' }), onKeyDown: onEnter(() => this.searchGames()),
                }), button(busy === 'search' ? '搜索中…' : '查找版本', () => this.searchGames(), { primary: true, disabled: !!busy })),
                details('按年份、平台或开发商筛选', [h('div', { className: 'dossier-form-grid' },
                  labelInput('发行年份', { inputMode: 'numeric', maxLength: 4, value: this.state.year, onChange: year => this.setState({ year }) }),
                  labelInput('平台', { maxLength: 80, value: this.state.platform, placeholder: '例如 PS5', onChange: platform => this.setState({ platform }) }),
                  labelInput('开发商', { maxLength: 100, value: this.state.developer, onChange: developer => this.setState({ developer }) }),
                  h('label', { className: 'dossier-label' }, h('span', null, '资料库'), h('select', {
                    className: 'dossier-input', value: this.state.dataSource, disabled: !!busy,
                    onChange: event => this.setState({ dataSource: event.target.value, results: [], message: '' }),
                  }, [['identity', 'RAWG + TheGamesDB'], ['rawg', 'RAWG'], ['thegamesdb', 'TheGamesDB'], ['screenscraper', 'ScreenScraper']].map(([id, label]) =>
                    h('option', { key: id, value: id }, label)))))]),
                results.length > 0 && h('div', { className: 'dossier-candidates', 'aria-label': '候选游戏版本' }, results.map(item => h('button', {
                  key: item.id, type: 'button', className: 'dossier-candidate', disabled: !!busy, onClick: () => this.selectGame(item),
                }, h('span', null, h('strong', null, item.title),
                  h('small', null, [item.releaseDate || item.year || '年份未知', (item.platforms || []).join(' / ') || '平台未知',
                    (item.developers || []).join('、') || '开发商未知'].join(' · ')),
                  h('small', null, sourceTags(item.sources)),
                  platformRecordTags(item.sources),
                  item.match?.conflicts?.length > 0 && h('small', { className: 'dossier-error' }, '需核对：' + item.match.conflicts.map(key => checks[key]).join('、') + '不同')),
                h('span', { className: 'dossier-badge' }, item.match?.confidence === 'high' ? '较高匹配 · 选用' : '核对后选用')))))),
            !pendingRefresh && status(this.state.message, this.state.error)),
          h('section', { className: 'dossier-stack', 'data-dossier-pane': 'details', 'aria-label': '发行资料与封面' },
            h('div', { className: 'dossier-form-grid' },
              field('title'), field('localizedName'), field('originalName'), field('releaseDate', '发售日期', 'date'),
              field('developers', '开发商（逗号分隔）', 'text', true), field('publishers', '发行商（逗号分隔）', 'text', true),
              field('platforms', '平台（逗号分隔）', 'text', true), field('genres', '类型 / Genre', 'text', true),
              field('alternativeNames', formatFields.alternativeNames, 'text', true), field('website', '官方网站 URL', 'url')),
            normalizePlatforms([...normalizePlatforms(value.platforms), ...normalizePlatforms(value.selectedPlatforms)]).length > 0 && h('fieldset', { className: 'dossier-card' },
              h('legend', null, '展示的平台版本'), h('div', { className: 'dossier-actions' },
                ...normalizePlatforms([...normalizePlatforms(value.platforms), ...normalizePlatforms(value.selectedPlatforms)]).map(platform => h('label', { key: platform },
                  h('input', { type: 'checkbox', checked: normalizePlatforms(value.selectedPlatforms).includes(platform), onChange: event => {
                    const selected = new Set(normalizePlatforms(value.selectedPlatforms));
                    if (event.target.checked) selected.add(platform); else selected.delete(platform);
                    this.update('selectedPlatforms', [...selected]);
                  } }), ' ' + platform)))),
            details('封面与截图' + (value.cover ? ' · 已设封面' : ''), [
              h('div', { className: 'game-cover-field' }, field('cover', '封面图片 URL', 'url'),
                h(GameCoverPicker, { suggestedQuery: value.originalName || value.title || this.state.query, onSelect: url => this.update('cover', url, 'steamgriddb') }),
                value.fieldSources?.cover === 'steamgriddb' && h('small', null, '已选 SteamGridDB 封面 · 刷新时保留')),
              field('screenshots', '截图 URL（逗号分隔）', 'text', true)]),
            edition && h('div', { className: 'dossier-actions' }, button(busy === 'detail' ? '读取中…' : '刷新外部资料',
              () => this.selectGame({ title: value.title, sources: value.sources }, true), { disabled: !!busy }),
            h('small', null, value.updatedAt ? '上次更新：' + String(value.updatedAt).slice(0, 10) : '')),
            pendingRefresh && h('section', { className: 'dossier-card dossier-stack', 'aria-label': '游戏资料变更预览' },
              h('strong', null, '资料更新对比'),
              ...pendingRefresh.changes.map(change => h('div', { key: change.key, className: 'dossier-change' },
                h('label', null, h('input', { type: 'checkbox', checked: change.selected, disabled: change.locked,
                  onChange: event => this.setState({ pendingRefresh: { ...pendingRefresh, changes: pendingRefresh.changes.map(item =>
                    item.key === change.key ? { ...item, selected: event.target.checked } : item) } }),
                }), ' ' + formatFields[change.key] + (change.locked ? '（保留手填）' : '')),
                h('div', { className: 'dossier-form-grid' }, h('div', null, h('small', null, '当前'), h('p', null, showValue(change.before))),
                  h('div', null, h('small', null, '新值'), h('p', null, showValue(change.after)))))),
              h('div', { className: 'dossier-actions' }, button('确认采用勾选变更', () => this.applyRefresh(), { primary: true }),
                button('取消，保留原资料', () => this.setState({ pendingRefresh: null, message: '资料未修改。' })))),
            status(this.state.message, this.state.error)));
      },
    });


    const languageLabels = { 'zh-Hans': '简体中文', 'zh-Hant': '繁体中文', 'zh-und': '中文（简繁未定）',
      'zh-mixed': '简繁混用', en: '英文', other: '其他或未确定' };
    const summaryText = value => typeof value === 'string' ? value : typeof value?.text === 'string' ? value.text : '';
    const textLength = value => [...value.trim()].length;
    const usableSource = source => safeUrl(source?.url) && typeof source.label === 'string' ? source : null;
    const briefContext = props => {
      const metadata = entryValue(props, 'gameMetadata') || {};
      const edition = getEdition(metadata);
      const current = summaryText(props.value).trim();
      const legacy = !current && typeof metadata.description === 'string' ? metadata.description.trim() : '';
      const provider = metadata.fieldSources?.description;
      const importedEdition = legacy && editionFor(metadata, provider);
      const importedSource = importedEdition && {
        url: metadata.sources[provider]?.url, label: sourceLabels[provider], kind: 'overview', edition: editionRefKey(importedEdition),
      };
      const source = usableSource(current ? props.value?.source : importedSource);
      const gameTitle = entryValue(props, 'title') || metadata.title || '';
      const officialTitle = metadata.localizedName || '';
      const text = current || legacy;
      const key = JSON.stringify([editionRefKey(edition), gameTitle, officialTitle, text, source]);
      return { metadata, edition, current, legacy, text, source, gameTitle, officialTitle, key };
    };
    const GameBrief = createClass({
      getInitialState() {
        return { busy: false, context: '', draft: '', result: null, error: false, message: '' };
      },
      componentDidUpdate(previous) {
        if (briefContext(previous).key !== briefContext(this.props).key) {
          this.revision = (this.revision || 0) + 1;
          if (this.state.context) this.setState(this.getInitialState());
        }
      },
      componentWillUnmount() { this.disposed = true; },
      async generate() {
        if (this.state.busy) return;
        const reference = briefContext(this.props);
        if (!reference.text && !reference.edition) return;
        const revision = this.revision || 0;
        const isCurrent = () => !this.disposed && (this.revision || 0) === revision && briefContext(this.props).key === reference.key;
        this.setState({ ...this.getInitialState(), busy: true, context: reference.key });
        try {
          const response = await archiveRequest('/ns/api/games/brief', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'draft', gameTitle: reference.gameTitle, officialTitle: reference.officialTitle,
              ...(reference.text ? { text: reference.text } : { edition: reference.edition }) }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error === 'ADMIN_LOGIN_REQUIRED' ? '请重新登录博客后台。' : data.error || '简介翻译失败。');
          if (!isCurrent()) return;
          if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('没有返回可审核的简介草稿。');
          if (data.mode === 'manual' && reference.current) {
            this.setState({ message: '当前简介已是简体中文，未调用 Gemini。' });
            return;
          }
          this.setState({ draft: data.text, result: data, message: data.mode === 'manual'
            ? '原文已是简体中文，未调用 Gemini。请审核后再采用。'
            : '译稿尚未写入档案。请核对译名和正文，再采用。' });
        } catch (error) {
          if (isCurrent()) this.setState({ message: error.message || '简介翻译失败。', error: true });
        } finally { if (isCurrent()) this.setState({ busy: false }); }
      },
      applyDraft() {
        const reference = briefContext(this.props);
        const { draft, result, context, busy } = this.state;
        const text = draft.trim();
        if (!result || context !== reference.key || !text || busy) return;
        const source = usableSource(result.source) || reference.source;
        this.props.onChange({
          text,
          ...(source ? { source: { ...source, language: source.language || result.originalLanguage } } : {}),
          method: result.mode, ...(result.model ? { model: result.model } : {}),
        });
        this.setState({ ...this.getInitialState(), message: '已采用简介；点击 CMS 的「保存」后写入档案。' });
      },
      changeText(text) {
        const current = this.props.value;
        if (text !== summaryText(current)) this.props.onChange(text.trim() && typeof current?.text === 'string' ? { ...current, text } : text);
      },
      render() {
        const { metadata, edition, text: referenceText, legacy, source } = briefContext(this.props);
        const text = summaryText(this.props.value);
        const { busy, draft, result } = this.state;
        const savedSource = usableSource(this.props.value?.source);
        const stale = savedSource?.edition && !Object.keys(metadata.sources || {})
          .some(provider => editionRefKey(editionFor(metadata, provider)) === savedSource.edition);
        const draftSource = usableSource(result?.source) || source;
        return h('div', { className: 'dossier-stack' },
          labelInput('公开简介正文', { id: this.props.forID, multiline: true, rows: 4, value: text,
            placeholder: '写游戏简介，或翻译档案里已有的简介', onChange: value => this.changeText(value) }),
          h('div', { className: 'dossier-caption' },
            h('small', null, textLength(text) + ' 字'),
            savedSource && externalLink(savedSource.url, '参考：' + savedSource.label)),
          stale && status('已保存简介的来源属于先前版本。请复核正文和来源。', true),
          legacy && details('查看档案原有简介（仍在前台显示）', [h('p', { className: 'dossier-reference' }, legacy)]),
          !result && (referenceText || edition) && h('div', { className: 'dossier-actions' },
            button(busy ? '正在准备简体草稿…' : referenceText ? '用 Gemini 翻译现有简介' : '翻译资料库简介',
              () => this.generate(), { primary: true, disabled: busy })),
          !referenceText && !edition && h('small', null, '可直接填写简介，或确认游戏版本后读取资料库原文。'),
          result && h('section', { className: 'dossier-stack dossier-review', 'aria-label': '简介草稿' },
            h('div', { className: 'dossier-caption' },
              h('small', null, '原文：' + (languageLabels[result.originalLanguage] || '语言未确定')),
              draftSource && externalLink(draftSource.url, '参考：' + draftSource.label)),
            labelInput('待审核草稿', { multiline: true, rows: 5, value: draft, onChange: draft => this.setState({ draft }) }),
            h('small', null, textLength(draft) + ' 字' + (result.mode === 'translate' ? ' · Gemini 译稿' : ' · 简体原文')),
            h('div', { className: 'dossier-actions' },
              button(text.trim() ? '用此草稿替换简介' : '采用这段简介', () => this.applyDraft(), { primary: true, disabled: !draft.trim() || busy }),
              button('舍弃草稿', () => this.setState(this.getInitialState())))),
          status(this.state.message, this.state.error));
      },
    });

    const views = [['core', '档案与简介'], ['details', '资料与渠道'], ['activity', '游玩与项目']];
    const DossierNavigation = createClass({
      getInitialState() { return { active: 'core' }; },
      render() {
        return h('nav', {
          className: 'dossier-tabs', 'aria-label': '游戏档案编辑分区', 'data-dossier-view': this.state.active,
        }, views.map(([key, label]) => h('button', { key, type: 'button', 'aria-pressed': this.state.active === key,
          onClick: () => this.setState({ active: key }),
        }, label)));
      },
    });
    const GameDossierPreview = props => {
      const value = entryValue(props, 'summary'), metadata = entryValue(props, 'gameMetadata') || {};
      const title = entryValue(props, 'title') || metadata.localizedName || metadata.title || '未命名档案';
      const summary = summaryText(value).trim() || metadata.description || '';
      const states = entryValue(props, 'status');
      const statusText = Array.isArray(states) ? states.join(' · ') : states;
      const editionLine = [String(metadata.releaseDate || '').slice(0, 4), listText(metadata.selectedPlatforms, ' / '),
        listText(metadata.developers, '、')].filter(Boolean).join(' · ');
      const cover = safeUrl(metadata.cover) || (/^\/uploads\/[^/]/.test(metadata.cover || '') ? metadata.cover : '');
      return h('article', { 'aria-label': '游戏档案预览', style: { display: 'grid', gap: '16px', lineHeight: 1.65, overflowWrap: 'anywhere', padding: 'clamp(8px, 3vw, 20px)' } },
        h('header', { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
          cover && h('img', { key: cover, src: cover, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer',
            onError: event => { event.currentTarget.hidden = true; },
            style: { width: '72px', height: '100px', objectFit: 'cover', borderRadius: '8px' } }),
          h('div', { style: { minWidth: 0 } },
            statusText && h('small', null, statusText),
            h('h1', { style: { margin: '3px 0', lineHeight: 1.25 } }, title),
            editionLine && h('small', null, editionLine))),
        h('section', { style: { borderTop: '1px solid color-mix(in srgb, currentColor 25%, transparent)', paddingTop: '12px' } },
          h('strong', null, '游戏简介'),
          h('p', { style: { whiteSpace: 'pre-wrap', margin: '7px 0' } }, summary || '还没有填写简介。'),
          value?.source && externalLink(value.source.url, '简介参考：' + value.source.label)));
    };
    window.CMS.registerPreviewTemplate?.('games', GameDossierPreview);
    window.CMS.registerFieldType('game-dossier-nav', DossierNavigation, () => null);
    window.CMS.registerFieldType('game-metadata', GameMetadata);
    window.CMS.registerFieldType('game-manual', GameManual);
    window.CMS.registerFieldType('game-brief', GameBrief, ({ value }) => h('p', { className: 'dossier-brief-preview' }, summaryText(value)));
    return true;

  };
  if (!register()) {
    let attempts = 0;
    const timer = window.setInterval(() => { if (register() || ++attempts >= 50) window.clearInterval(timer); }, 100);
  }
})();
