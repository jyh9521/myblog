(() => {
  const register = () => {
    if (!window.CMS?.registerEditorComponent) return false;
    if (!window.h || !window.createClass || !window.CMS.getFieldType?.('select')?.control) return false;
    // Inline PDF/image components must wait for the same R2 widgets as fields.
    // Do not freeze a native Git media widget during asynchronous CMS startup.
    if (!window.CMS.getFieldType('r2-file')?.control || !window.CMS.getFieldType('r2-image')?.control) return false;
    const h = window.h;
    const createClass = window.createClass;
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
    window.CMS.registerFieldType('chronology-evidence', createClass({
      render: function () {
        return h('fieldset', { id: this.props.forID }, h('legend', null, '依据类型'),
          [['compiled', '资料整理（尚未核对一手资料）'], ['game', '游戏内记载'], ['manual', '手册记载'], ['inferred', '推断'], ['disputed', '存在争议']].map(([value, label]) =>
            h('label', { key: value, style: { display: 'block', padding: '7px' } }, h('input', { type: 'radio', name: this.props.forID, checked: (this.props.value || 'compiled') === value, disabled: this.props.readonly, onChange: () => this.props.onChange(value) }), label)));
      },
    }));

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
        { name: 'file', label: 'PDF 文件', widget: 'r2-file', required: true, accept: '.pdf,application/pdf', choose_url: false, pattern: ['\\.[pP][dD][fF]$', '请选择 PDF 文件'], hint: '通过 R2 资源库上传或选择 PDF，支持文件夹和改名。' },
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
      id: 'multiline-code-block', label: '插入代码块', tooltip: '一次粘贴整段代码，保留空行与缩进', icon: 'code_blocks', trigger: 'button',
      fields: [
        { name: 'language', label: '语言（可选）', widget: 'string', required: false, hint: '例如 toml、json、bash；留空为纯文本。' },
        { name: 'code', label: '整段代码', widget: 'text', required: true, hint: '把全部代码一次粘贴在这里；换行、空行、缩进和引号原样保留。' },
      ],
      // Standard fenced Markdown keeps the public renderer/copy button reusable.
      // Match one whole block, not individual paragraphs or neighbouring blocks.
      pattern: /^(`{3,}|~{3,})([\w+.#-]*)[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/m,
      fromBlock: match => ({ language: match[2], code: match[3].replace(/\r\n?/g, '\n') }),
      toBlock: ({ code = '', language = '' } = {}) => {
        code = String(code).replace(/\r\n?/g, '\n');
        if (!code) return '';
        language = String(language).trim();
        if (!/^[\w+.#-]{0,40}$/.test(language)) language = '';
        // A pasted Markdown example may itself contain fences. Use a longer
        // delimiter, and never trim the code or convert straight quotes.
        const length = (code.match(/`+/g) || []).reduce((size, run) => Math.max(size, run.length + 1), 3);
        const fence = '`'.repeat(length);
        return fence + language + '\n' + code + '\n' + fence;
      },
      toPreview: ({ code = '' } = {}) => {
        const pre = document.createElement('pre');
        pre.textContent = String(code);
        pre.style.whiteSpace = 'pre'; pre.style.overflow = 'auto'; pre.style.maxHeight = '28rem';
        return pre;
      },
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
        { name: 'before', label: '之前的图片', widget: 'r2-image', required: true },
        { name: 'after', label: '之后的图片', widget: 'r2-image', required: true },
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
