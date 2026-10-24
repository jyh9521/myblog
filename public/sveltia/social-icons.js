(() => {
  let catalogPromise;
  const load = () => catalogPromise || (catalogPromise = fetch('/sveltia/social-icon-catalog.json').then(r => {
    if (!r.ok) throw Error('图标库加载失败');
    return r.json();
  }).catch(error => { catalogPromise = undefined; throw error; }));
  const register = () => {
    if (!window.CMS?.registerFieldType || !window.createClass || !window.h) return false;
    const h = window.h;
    const Control = window.createClass({
      getInitialState() { return { query: '', icons: [], error: '', loaded: false }; },
      componentDidMount() { this.alive = true; this.loadIcons(); },
      componentWillUnmount() { this.alive = false; },
      loadIcons() {
        this.setState({ error: '' });
        load().then(icons => { if (this.alive) this.setState({ icons, loaded: true }); })
          .catch(() => { if (this.alive) this.setState({ error: '图标库加载失败，请重试；现有图标选择不会丢失。' }); });
      },
      render() {
        const selected = this.props.value || 'globe', query = this.state.query.trim().toLowerCase();
        const current = this.state.icons.find(icon => icon.slug === selected);
        const matches = this.state.icons.filter(icon => `${icon.slug} ${icon.label}`.toLowerCase().includes(query));
        const glyph = icon => icon ? h('svg', { viewBox: `0 0 ${icon.width} ${icon.height}`, 'aria-hidden': true, focusable: false }, icon.paths.map((d, i) => h('path', { key: i, d })))
          : h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true }, h('circle', { cx: 12, cy: 12, r: 9 }), h('ellipse', { cx: 12, cy: 12, rx: 4, ry: 9 }), h('path', { d: 'M3 12h18M5 6.5h14M5 17.5h14' }));
        const choice = icon => {
          const slug = icon?.slug || 'globe', label = icon?.label || '通用网站';
          return h('button', { key: slug, type: 'button', 'aria-pressed': selected === slug, className: 'social-icon-choice', onClick: () => this.props.onChange(slug) }, glyph(icon), h('span', null, label));
        };
        return h('div', { className: 'social-icon-picker' },
          h('div', { className: 'social-icon-current' }, glyph(current), h('span', null, `当前图标：${selected === 'globe' ? '通用网站' : current?.label || selected}`)),
          h('input', { type: 'search', 'aria-label': '搜索平台图标', placeholder: '搜索图标，例如 GitHub、哔哩哔哩、Xbox…', value: this.state.query, onChange: e => this.setState({ query: e.target.value }) }),
          h('div', { className: 'social-icon-choices', role: 'group', 'aria-label': '选择平台图标' }, choice(null), ...matches.slice(0, 36).map(choice)),
          h('p', { role: 'status' }, this.state.error || (!this.state.loaded ? '正在加载本地图标库…' : `${matches.length} 个匹配图标${matches.length > 36 ? '，当前展示前 36 个，请搜索缩小范围' : ''}`)),
          this.state.error && h('button', { type: 'button', onClick: () => this.loadIcons() }, '重试加载图标'),
          h('small', null, 'Font Awesome Free Brands · ', h('a', { href: 'https://fontawesome.com', target: '_blank', rel: 'noopener noreferrer' }, 'Fonticons'), ' · ', h('a', { href: '/sveltia/brand-icons-LICENSE.txt', target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 4.0')));
      }
    });
    window.CMS.registerFieldType('social-icon', Control);
    return true;
  };
  if (!register()) { const timer = setInterval(() => { if (register()) clearInterval(timer); }, 200); }
})();
