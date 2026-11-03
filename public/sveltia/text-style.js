(() => {
  const sizes = ['12', '14', '16', '18', '20', '24', '28', '32', '40', '48'];
  const colors = [['', '默认'], ['#dc2626', '红色'], ['#ea580c', '橙色'], ['#a16207', '金色'], ['#16a34a', '绿色'], ['#0284c7', '蓝色'], ['#7c3aed', '紫色'], ['#db2777', '粉色'], ['#64748b', '灰色'], ['#111827', '黑色'], ['#ffffff', '白色']];
  const colorValue = value => /^#[\da-f]{6}$/i.test(value || '') ? value.toLowerCase() : '';
  const sizeValue = value => sizes.includes(String(value)) ? String(value) : '';
  // Numeric entities keep literal Markdown, HTML, pipes and line breaks out of
  // the component syntax. Decode exactly once when reopening the component.
  const escapeText = value => String(value).replace(/[&<>"'\\`*_\[\]{}()!|~\r\n]/g, char => `&#${char.charCodeAt(0)};`);
  const unescapeText = value => value.replace(/&#(\d{1,7});/g, (entity, code) => {
    const n = Number(code);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : entity;
  });
  const preview = ({ text = '文字', color = '', size = '' } = {}) => {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.color = colorValue(color);
    span.style.fontSize = sizeValue(size) ? `${size}px` : '';
    return span;
  };

  let activeDialog;
  const edit = (initial = {}) => new Promise(resolve => {
    activeDialog?.close();
    let color = colorValue(initial.color), size = sizeValue(initial.size), result = null;
    const dialog = document.createElement('dialog');
    activeDialog = dialog;
    dialog.className = 'text-style-dialog';
    dialog.setAttribute('aria-labelledby', 'text-style-title');
    const form = document.createElement('form');
    const add = (tag, text, parent = form) => {
      const element = document.createElement(tag);
      if (text) element.textContent = text;
      parent.append(element);
      return element;
    };
    add('h2', '文字颜色与大小').id = 'text-style-title';
    add('p', '设置一段文字；点击正文中已设置的文字可再次修改。').className = 'text-style-hint';
    const textLabel = add('label', '文字');
    const text = add('textarea', '', textLabel);
    text.name = 'text'; text.rows = 2; text.required = true;
    text.value = initial.text || '';
    const colorSet = add('fieldset'); add('legend', '文字颜色', colorSet);
    const swatches = add('div', '', colorSet); swatches.className = 'text-style-options';
    const colorButtons = [];
    const button = (label, parent, onClick) => {
      const element = add('button', label, parent);
      element.type = 'button'; element.addEventListener('click', onClick);
      return element;
    };
    colors.forEach(([value, label]) => {
      const choice = button(label, swatches, () => { color = value; hex.value = value; update(); });
      const dot = add('span', '', choice); dot.className = 'text-style-swatch';
      dot.style.backgroundColor = value || 'currentColor'; dot.setAttribute('aria-hidden', 'true');
      colorButtons.push([choice, value]);
    });
    const custom = add('div', '', colorSet); custom.className = 'text-style-custom';
    const pickerLabel = add('label', '自定义颜色', custom);
    const picker = add('input', '', pickerLabel); picker.type = 'color';
    picker.addEventListener('input', () => { color = picker.value; hex.value = color; update(); });
    const hexLabel = add('label', '色值（#RRGGBB）', custom);
    const hex = add('input', '', hexLabel); hex.type = 'text'; hex.name = 'color';
    hex.placeholder = '#dc2626'; hex.pattern = '#[0-9a-fA-F]{6}'; hex.maxLength = 7;
    hex.value = color;
    hex.addEventListener('input', () => { if (hex.validity.valid) { color = colorValue(hex.value); update(); } });
    const sizeSet = add('fieldset'); add('legend', '文字大小', sizeSet);
    const sizeOptions = add('div', '', sizeSet); sizeOptions.className = 'text-style-options';
    const sizeButtons = ['', ...sizes].map(value => [button(value ? `${value} px` : '默认', sizeOptions, () => { size = value; update(); }), value]);
    const sample = add('div'); sample.className = 'text-style-sample';
    sample.setAttribute('aria-label', '文字样式预览');
    const error = add('p'); error.className = 'text-style-error'; error.setAttribute('role', 'alert');
    const actions = add('div'); actions.className = 'text-style-actions';
    button('恢复默认', actions, () => { color = ''; size = ''; hex.value = ''; update(); });
    button('取消', actions, () => dialog.close());
    const apply = add('button', '应用', actions); apply.type = 'submit'; apply.className = 'text-style-apply';
    function update() {
      picker.value = color || '#dc2626';
      for (const [choice, value] of colorButtons) choice.setAttribute('aria-pressed', String(color === value));
      for (const [choice, value] of sizeButtons) choice.setAttribute('aria-pressed', String(size === value));
      // A component is inline. Keep a multi-paragraph selection intact instead
      // of silently flattening it into one paragraph.
      const multiline = /[\r\n]/.test(text.value);
      error.textContent = multiline ? '请一次设置同一段落内的文字，不要包含换行。' : '';
      apply.disabled = multiline || !text.value.trim();
      sample.replaceChildren(preview({ text: text.value || '文字样式预览 Aa 你好', color, size }));
    }
    text.addEventListener('input', update);
    text.addEventListener('keydown', event => { if (event.isComposing || event.keyCode === 229) event.stopPropagation(); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (event.isComposing || !form.reportValidity() || apply.disabled) return;
      result = { text: text.value, color: colorValue(hex.value), size };
      dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (activeDialog === dialog) activeDialog = null;
      resolve(result);
    }, { once: true });
    dialog.append(form); document.body.append(dialog); update(); dialog.showModal();
    if (!text.value) text.focus();
    else apply.focus();
  });

  const register = () => {
    if (!window.CMS?.registerEditorComponent) return false;
    // Public Sveltia 0.256.1 API: selection, undo/redo and readonly behavior stay
    // with the existing editor. No private Lexical/DOM mutation hooks.
    window.CMS.registerEditorComponent({
      id: 'text-style', type: 'inline', label: '文字颜色与大小', icon: 'format_color_text',
      trigger: '<span data-text-color=',
      pattern: /<span data-text-color="(#[\da-fA-F]{6}|)" data-text-size="(12|14|16|18|20|24|28|32|40|48|)">([^<>\r\n]*)<\/span>/,
      fromInline: match => ({ color: colorValue(match[1]), size: sizeValue(match[2]), text: unescapeText(match[3]) }),
      toInline: ({ text = '文字', color = '', size = '' } = {}) => `<span data-text-color="${colorValue(color)}" data-text-size="${sizeValue(size)}">${escapeText(text)}</span>`,
      toPreview: preview,
      onInsert: ({ selectedText }) => edit({ text: selectedText }),
      onEdit: ({ data }) => edit(data),
    });
    return true;
  };
  if (!register()) {
    let attempts = 0;
    const timer = window.setInterval(() => { if (register() || ++attempts >= 50) window.clearInterval(timer); }, 100);
  }
})();
