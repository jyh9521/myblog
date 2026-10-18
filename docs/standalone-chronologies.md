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
- 构建与内容验证均执行 `lib/chronology-language.cjs`，除作者明确指定的两项原文外，阻止英文或韩文漏入中文可见字段。译名别名也有回归测试。
- 原电脑版六作保留315条原条目。另增44条有具体出处的重制、外传与手游剧情概述，共359条；21项作品／衍生载体中包含只作目录说明的对战、棋盘、放置及联动产品，不把它们冒称21部独立正史。
- 各新增版本分区限定关联作品，模式校验阻止其他版本混入；模拟世界与方舟外层分层说明，发行时间不冒充故事日期。
- 作品指南说明原创、改编、联动和仍待核的收录边界；原第三代手机四集合并识别，阿修罗计划与现名西风狂诗曲视为同一应用。
- `content/research/genesis-extensions.json` 记录原315条对象哈希、44条新增清单、未发布差异与排误。

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

## 重制与衍生作品核查

- `genesis-gray-remnant-research.md`：重制主线、克楼乌外传吸收与未核的动作差异。
- `genesis-mobile-spinoffs-research.md`：功能机外传、第三代手机四集、现代手游、宇宙传奇章题及联动。
- `genesis-later-games-research.md`：第四作时空旅行及安塔利亚战争改编边界。
- `genesis-extensions-integration.md`：本轮实际发布范围、暂缓内容与验证。

## 作者确认译名

本轮按作者指定采用伊奥琳、西拉诺、达卡玛、梅尔茜迪斯、萨菲·阿尔·丁、因弗诺、光明使者、迦娜、浪川、克楼乌；两项原文保留为 `G.S.`、`Ra MKⅢ`。旧译只作为词表旧称和隐藏检索别名，不再用作正文当前名称。
