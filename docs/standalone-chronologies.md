# 创世纪战独立系列时间线

访问及分享：<https://blog.blfy.cc/chronicles/genesis/>。

这是一张独立、可直接访问的页面，不增加站点导航，也不更改游戏档案的模块或正文契约。档案简介或已有时间线说明中，像普通文章链接一样填写：

```md
[创世纪战系列时间线](/chronicles/genesis/)
```

## 阅读与维护

- 默认完整展示并提示全系列剧透；支持作品多选、搜索、分时代导航、隐藏剧透。
- 复制当前视图保留作品、搜索词、剧透设置；复制事件链接附稳定锚点。无脚本仍可读完整静态正文。
- CMS“独立系列时间线”维护 `content/chronologies/genesis.json`，不再提供档案嵌入组件或 shortcode。
- 每条引证明确区分剧情、日期、背景和异说；多个攻略页面若属同作者，不算多个独立来源。
- 315条场景事件：313条覆盖原表897项破折号记录，另补2条《西风》互斥结局分支。并非897个原句的逐句翻译，而是按连续场景重写的事实摘要。
- `content/research/genesis-coverage.json` 保留底本快照SHA-256与覆盖行号；测试校验没有遗漏、重计或孤立来源。底本全文只存本地证据目录，不提交原文全文。
- 引证优先区分原版游戏画面、原版对白转录、原作者攻略、手册扫描和二手整理。资料项包括单张原图，不把每张图或每个分页算成独立作者；仍为单源的日期与手册转述不强行定论。
- `content/research/genesis-terminology.json` 保存统一中文名、旧译、原名、采用依据与证据局限。公共叙事和引证说明全中文，原名只作检索和资料存档；正文不显示外文关键词堆。
- 构建与内容验证均执行 `lib/chronology-language.cjs`，阻止英文或韩文漏入中文可见字段。译名别名也有回归测试。
- 旧PC六作范围；后出的重制、手游与《4》只用于明确标记的差异说明，不合并成一条无分支历史。

## 研究记录

- `genesis-source-audit.md`：来源层级、官方访谈与纪年冲突。
- `genesis-early-coverage.md`：神话至1262年覆盖与实机证据。
- `genesis-part-one-coverage.md`：Part I三线与跨纪年过渡。
- `genesis-part-two-audit.md`：Part II全篇、结局及冲突处理。

- `genesis-primary-early-audit.md`、`genesis-primary-middle-audit.md`、`genesis-primary-part-two-audit.md`：第二轮原典核查、已纠正内容和仍待证实的边界。
- `genesis-middle-chinese-names-audit.md`：同期中文攻略用名及同名异人辨析。

## 验证

`npm test`、`npm run check`、`npm run validate`、`npm run build`。

公开渲染与CMS配置分别验证。既有游戏档案内容无需迁移；仅撤回之前的可选模块扩展。
