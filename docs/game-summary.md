# 游戏档案简介

## 后台工作流

1. 进入「档案与简介」。以原名或别名搜索 RAWG 与 TheGamesDB；可补充发行年份、平台、开发商。
   候选显示这些字段和资料库 ID。名称相同本身不算匹配；缺少证据或多个候选并列时显示「核对后选用」。不会自动导入第一个候选。
2. 选定版本后点击「从资料源准备简介」。按资料库 ID 读取，不按名称重新猜。
   从明确关联的商品链接读取 Steam App ID、PlayStation Store 商品 ID 或 Nintendo eShop 商品页。只有唯一且无冲突的关联商品才会预选；多个商品由编辑选择。没有关联时，可核对并填写该版本的官方商品链接，也可用数据库简介。当前 Nintendo 自动读取支持美洲 `/store/products/` 商品页；区域、下架或页面格式问题会显示错误，可改选数据库参考。
3. 优先使用商店短简介。界面根据正文判定简体、繁体、英文、简繁混用或不确定，独立于请求语言。合适的简体短简介默认不调用 AI；可手写原创简介，或主动让 Gemini 改写。其他语言的短简介走翻译，只有长介绍时走摘要。以 100–250 字为目标，资料稀少时不为凑字数补内容。
4. 核对译名、版本和事实，编辑草稿后点「采用」或「替换简介」，再点 CMS「保存」。读取资料、生成或舍弃草稿都不会覆盖已有简介。已保存的简介仍可手工修改。
5. 「资料与渠道」保留发行字段、平台卡片、封面/截图、正版渠道及更新对比；「游玩与项目」保留个人时长、评分、HLTB、时间线、项目。切换分区不清空表单，也不改变已有 Markdown 字段。

商店正文只在编辑会话中作为参考：不写入 Markdown、D1 或构建结果。保存的是审核后的正文及来源链接，不是商店长文。使用原文、翻译或改写前，按对应来源的条款确认可用范围；例如 [RAWG API 条款](https://rawg.io/tos_api)要求标注来源。[Steamworks 简介说明](https://partner.steamgames.com/doc/store/page/description)区分短简介和详细介绍。

## 保存格式与兼容性

旧的 `summary: 纯文本` 和 `gameMetadata.description` 继续可读。只有采用有来源的草稿时才写入结构化简介。例如：

```yaml
summary:
  text: 编辑审核后的中文简介
  source:
    url: https://store.steampowered.com/app/620/?l=schinese
    label: Steam
    language: zh-Hans
    kind: short
    edition: "rawg:123:"
  method: rewrite
  model: gemini-3.5-flash-lite
```

来源显示在详情页；档案列表仍读取正文字符串。切换资料库版本后保留原简介并提示复核。已有 180 份档案不需要迁移，也不会被批量翻译。

Gemini 只由 Worker 调用，使用 `GEMINI_API_KEY` Secret；可用 `GEMINI_MODEL` 覆盖默认模型。原样保存的翻译提示词及摘要/改写指令在 `workers/ns-counter/src/gemini-game-summary.js`。参见 [Gemini REST 文档](https://ai.google.dev/api/generate-content?hl=en)及 [模型文档](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)。

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
