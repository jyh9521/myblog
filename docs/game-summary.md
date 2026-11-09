# 游戏档案简介

## 后台工作流

1. 在「档案与简介」直接点「用 Gemini 翻译现有简介」。优先翻译「公开简介正文」；它为空时，使用档案已有的 `gameMetadata.description`。这一步不重新查资料库，不查询任何商店。
2. 档案无正文时，以原名或别名搜索 RAWG、TheGamesDB 等资料库，按发行年份、平台、开发商与资料库编号核对版本。名称相同本身不算匹配。确认版本后点「翻译资料库简介」，仅按该版本的资料库编号读取原文。
3. Worker 去掉原文 HTML 标签，按实际正文识别简体、繁体、简繁混用和英文。合适的简体原文直接进入人工审核，不调用 Gemini；其他语言完整翻译为简体中文，尽量保留分段和专名。不会因原文较长切换为摘要，250 字不是上限。
4. 核对、编辑后点「采用」，再点 CMS「保存」。生成或舍弃草稿都不会覆盖原有正文。翻译途中若更改游戏版本或正文，旧草稿会作废。
5. 「资料与渠道」中的手填正版链接、发行资料、封面和截图继续保留；购买链接不参与简介读取。切换编辑分区不清空表单。

没有现成正文时，按资料库编号读取的参考文本不写入 D1 或 Markdown；只保存审核后采用的译文和已知来源链接。已有简介和来源标记无需迁移。使用资料库内容时遵守相应来源条款，例如 [RAWG API 条款](https://rawg.io/tos_api)。

## 保存格式与兼容性

旧的 `summary: 纯文本` 和 `gameMetadata.description` 继续可读。采用译稿时保存正文、方法与已知来源；档案没有可信链接时不补造来源。例如：

```yaml
summary:
  text: 编辑审核后的中文简介
  source:
    url: https://rawg.io/games/portal-2
    label: RAWG
    language: en
    kind: overview
    edition: "rawg:123:"
  method: translate
  model: gemini-3.5-flash-lite
```

来源显示在详情页；档案列表仍读取正文字符串。切换资料库版本后保留原简介并提示复核。已有档案不需要迁移，也不会被批量翻译。

Gemini 只由 Worker 调用，使用 `GEMINI_API_KEY` Secret；可用 `GEMINI_MODEL` 覆盖默认模型。原样保留的翻译提示词及完整翻译指令在 `workers/ns-counter/src/gemini-game-summary.js`。参见 [Gemini REST 文档](https://ai.google.dev/api/generate-content?hl=en)及 [模型文档](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)。

## 正文排版

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
