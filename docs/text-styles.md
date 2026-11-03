# 正文文字颜色与大小

文章正文、游戏时间线说明和「关于我」正文共用此能力，不迁移旧文章，不更换编辑器。

1. 在富文本模式选中同一段落内的一段文字，打开工具栏的「插入」菜单，选择「文字颜色与大小」。未选择文字时可以在弹窗里输入。
2. 点选预设颜色，或使用取色器 / `#RRGGBB` 色值。点选字号：默认、12、14、16、18、20、24、28、32、40、48 px。弹窗实时预览。
3. 点击「应用」，然后按原来的方式保存文章。点击正文中已设置的文字可以再次编辑其文字、颜色和大小；「恢复默认」同时恢复主题文字颜色和继承字号，点击「应用」确认。「取消」或 Escape 关闭弹窗。
4. 样式片段作为一个可编辑的行内组件存在。一次处理一段不含换行的文字；标题、列表、图片、链接等其他内容保持原编辑方式。选区通过 CMS 的 `selectedText` API 取得纯文本，而不是保留选区内部的 Markdown 标记；如需粗体或斜体，可将样式片段整体放在相应 Markdown 标记内。

## 存储与渲染

继续使用 Markdown；仅样式片段写成以下可读形式：

```html
<span data-text-color="#dc2626" data-text-size="24">强调文字</span>
```

空属性值表示继承主题默认。片段文字中的 HTML / Markdown 符号转义为数值实体，重新打开时仅解码一次，防止符号变成标签、链接或图片。新功能不改写未编辑的旧文章。

编辑器使用已固定的 Sveltia CMS 0.256.1 的公开行内组件 API：`onInsert({ selectedText })`、`onEdit({ data })`、`toInline`、`fromInline`、`toPreview`，沿用 CMS 的保存、撤销和只读行为，不访问私有 Lexical 对象。参考：[官方行内组件文档](https://sveltiacms.app/en/docs/api/editor-components#pattern-based-inline-components)。

前台 `remarkTextStyles` 只识别上述精确属性顺序及允许的值；只生成 `color` 和 `font-size`，不启用通用 HTML 解析或任意 CSS。其他原始 HTML 继续按原有方式转义。样式处理先于目录 ID 生成；文章完整模式、时间线 compact 模式、关于页使用相同转换。

## 检查

```sh
node --test scripts/text-style.test.cjs scripts/game-timeline.test.cjs scripts/article-images.test.cjs
npm test
npm run check
npm run validate
npm run build
```

本地浏览器验收应使用独立的 CMS `test-repo` 存储，实际保存并刷新后重开，检查颜色、字号、自定义色、取消、撤销、恢复默认和 Markdown 往返；不为验收改写正式文章。
