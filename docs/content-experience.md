# 专题、维护与回归

## 公开搜索

复用全站搜索入口。关联游戏档案的文章现在也能通过该游戏的原名和别名找到。密码文章和未列出文章仍不进入索引。

年表事件使用独立的 `/event-search-index.json`。只有读者勾选“同时检索年表事件（包含剧情与结局）”才下载并展示，不从分享网址或本地存储继承剧透同意。事件结果直接跳到对应锚点。默认搜索仍不包含剧情。

## 专题

入口 `/topics/`，内容为 `content/topics.json`，也能在 CMS“专题导读”编辑。`readingOrder` 的文章 Slug 顺序就是推荐阅读顺序；`games` 和 `chronologies` 为明确引用，不按标题猜测。空列表不显示对应区块。不存在、重复或非公开文章引用会令专题构建失败。项目与发布版复用游戏档案中人工关联的 GitHub 地址。

已整理真名法典、吸血莱恩与系列年表三个入口。专题摘要只去除 Markdown 标记，不改写原文；最近更新读取已有日期，不推断补丁版本。

## 段落链接

普通顶层正文段落提供复制按钮。锚点由规范化文本及重复次序产生，插入不相关段落不会改变已有文本的锚点；修改段落文字会改变锚点。图片、自定义游戏卡片、HTML、引用及列表段落不添加按钮。生成阶段就有锚点，直接打开链接不依赖二次滚动脚本。字号、行距、移动目录及可选阅读记忆继续使用原实现。

## 维护待办

CMS 右下角“维护待办”打开既有维护页面。构建生成 `public/sveltia/health.json`，只列公开内容的缺失资源、检测为 404/410 的外链、游戏档案待补字段，每项有页面和编辑器入口。

资源检查覆盖封面、音频、视频、附件、内联和引用式 Markdown 图片/链接、HTML 资源属性与截图对比。外链结果来自 `npm run audit:links` 的当次报告，显示检查时间；超时、限流不冒充失效。页面不是实时爬虫；重新发布后更新清单。发布状态继续分别核对仓库、主站与回退部署。

## 回归

```sh
npm ci
npx playwright install chromium
npm test
npm run check
npm run validate
npm run build
npm run test:browser
npm run backup:drill
```

浏览器依赖固定在 devDependencies，不进入站点运行时。真实固定版 Sveltia 使用官方 `test-repo` 后端和临时浏览器上下文，所有非本机请求被拦截，实际执行列表、代码、图片和游戏卡片的 Markdown / 富文本往返、保存、列表重开。同一真实浏览器还执行认证过期重试、上传 503 和资源 409 不重放检查，确认正文保持不变；底层既有测试继续运行。搜索、阅读、草稿恢复以及新增功能浏览器套件在发布前执行；手机尺寸为 390px，桌面为 1440px。

参考：[Sveltia Test Backend](https://sveltiacms.app/en/docs/backends/test)、[Playwright browsers](https://playwright.dev/docs/browsers)。

完整备份与恢复边界见 [备份恢复核对](backup-recovery.md)。
