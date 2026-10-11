# 游戏档案简介

游戏详情页的简介支持普通文本、Markdown 和 HTML 混写。已有简介无需迁移；
游戏列表仍显示纯文本摘要，本规则仅适用于详情页。

```markdown
这是 **Markdown 加粗** 和 <em>HTML 斜体</em>。

第一行<br>第二行

<div>

这里也支持 **Markdown**，块级 HTML 内外请留空行。

</div>
```

支持 Markdown 列表、表格、删除线、链接、图片和普通换行，以及常见 HTML
排版标签（如 `p`、`br`、`strong`、`em`、`ul`、`details`、`summary`）。
代码块和行内代码中的 HTML 保持原样，不作为标签解析。

渲染顺序为 Markdown → HTML 解析 → 默认白名单清理 → 页面组件。
脚本、iframe、事件属性、危险 URL 和自定义 style/class 属性会被过滤。
所有简介沿用本站排版；外部网页链接继续在新标签页打开，图片保持延迟加载。

实现：`app/games/game-summary.tsx`。验证：
`node --test scripts/game-summary.test.cjs`、`npm test`、`npm run check`、
`npm run validate`、`npm run build`。
