# 博客维护

网站由 Next.js 静态导出，通过 GitHub Actions 主发布到 Cloudflare Workers Static Assets，并同步 GitHub Pages 回退副本。

## 编辑文章

打开 https://blog.blfy.cc/sveltia/ ，使用 GitHub 访问令牌登录 Sveltia CMS。文章保存在 `content/posts/*.md`，公开图片和附件通过 R2 资源库上传，地址仍为 `/uploads/*`；二进制文件不再提交 Git。保存后会提交到 `main`，发布工作流自动重新构建网站。文章网址为 `/posts/<文件名>/`。

编辑器配置位于 `public/sveltia/config.yml`。访问令牌请只输入后台登录页面，勿写入仓库或文章。

正文支持设置文字颜色和大小：选中文字，在「插入」菜单选择「文字颜色与大小」，点选颜色和字号后应用。支持自定义色值、实时预览及恢复默认；点击已设置的文字可再次编辑。详见 [正文文字颜色与大小](docs/text-styles.md)。

## 游戏资料数据库

游戏资料由 Cloudflare Worker 查询 RAWG、TheGamesDB、ScreenScraper。默认的「搜索全部来源」并行查询三库；发行年份、平台和开发商初始为空，编辑需要时可填写。以 TheGamesDB 为蓝本，只补入唯一匹配且没有明确冲突的记录；未匹配的候选仍可单独选用。选用后按来源 ID 重新核对详情，不导入资料库简介，不覆盖手动字段。SteamGridDB 单独用于封面。每条记录保存在 `content/games/<slug>.md`；`manual` 继续保存正版渠道与备注。已审核的中文简介随档案保存，前台不请求第三方 API。

TheGamesDB 中能够核对为同一作品的跨平台记录在搜索结果中合为一条。合并保留各平台的编号与发行日期；选用前可填写目标平台或年份，让对应记录作为主资料。按完整版本名、开发商和发行时间核对，不用简称或别名强行合并；同名不同年代、不同工作室或有歧义的记录继续分列。搜索最多读取 TheGamesDB 的前四页，结果不完整时会提示。重新搜索并选用后可在「资料与渠道」勾选实际要展示的平台；既有档案不自动迁移。

复制根目录 `.env.example` 中的变量到 `workers/ns-counter/.dev.vars` 用于本地 Worker 调试；生产环境在 Cloudflare Worker 的 Secrets 中设置同名变量。`.dev.vars` 和 `.env` 已被 Git 忽略，不要提交密钥。

必需/可选变量：

- `RAWG_API_KEY`：RAWG API key。申请入口：[RAWG API Docs](https://rawg.io/apidocs)。
- `THEGAMESDB_API_KEY`：TheGamesDB 资料检索与刷新。参见 [TheGamesDB API](https://api.thegamesdb.net/)。
- `STEAMGRIDDB_API_KEY`：SteamGridDB 游戏与竖版封面检索。参见 [SteamGridDB API v2](https://www.steamgriddb.com/api/v2)。
- `GEMINI_API_KEY`：仅在 Worker 的 Secret 中配置。用于简体中文简介翻译、摘要与改写。默认模型为 `gemini-3.5-flash-lite`，可通过可选环境变量 `GEMINI_MODEL` 修改。没有配置时仍可使用来源预览和手写简介。
- `SCREENSCRAPER_DEV_ID` / `SCREENSCRAPER_DEV_PASSWORD`：ScreenScraper API 开发者凭据。
- `SCREENSCRAPER_SOFTNAME`：ScreenScraper 登记/确认的客户端名称；若申请信息未另行指定，可填 `blfy-blog`。
- `SCREENSCRAPER_USER_ID` / `SCREENSCRAPER_USER_PASSWORD`：可选的 ScreenScraper 用户账号凭据。

缺少某个来源的凭据或来源暂时失败时，全部来源搜索会保留其他来源的结果并提示。三个资料库也可单独选择；ScreenScraper 的开发者凭据和 softname 按其官方 WebAPI 申请流程获取。

RAWG 的 API 文档提供个人/爱好项目申请入口；其免费方案限制为非商业项目，并要求在使用数据的页面链接回 RAWG。本站游戏卡片会显示来源链接。ScreenScraper 需先注册账号，再通过官方论坛联系团队介绍应用并申请开发者 ID、密码和登记的 `softname`；官方说明 API 面向免费分发的软件，其他用途需事先取得许可。

本地开发可复制 `workers/ns-counter/.dev.vars.example` 为 `.dev.vars`。Cloudflare 部署可在 Worker 目录运行以下命令分别录入密钥（按提示粘贴值）：

```powershell
npx wrangler secret put RAWG_API_KEY
npx wrangler secret put THEGAMESDB_API_KEY
npx wrangler secret put STEAMGRIDDB_API_KEY
npx wrangler secret put SCREENSCRAPER_DEV_ID
npx wrangler secret put SCREENSCRAPER_DEV_PASSWORD
npx wrangler secret put SCREENSCRAPER_USER_ID
npx wrangler secret put SCREENSCRAPER_USER_PASSWORD
```

`SCREENSCRAPER_SOFTNAME` 是非敏感配置，可在 Cloudflare Worker Variables 中设置，或用 `npx wrangler secret put SCREENSCRAPER_SOFTNAME` 存为 Secret。未使用的 Provider 无需创建对应变量。

游戏元数据缓存存放在 Worker 已绑定的 D1 数据库 `game_metadata_cache` 表：搜索结果保留 1 小时，详情保留 7 天；手动刷新可绕过详情缓存。资料被保存后由仓库中的 Markdown 游戏档案成为页面读取的本地数据源。按需更新 D1 schema 后发布 Worker：

```powershell
cd workers/ns-counter
npx wrangler d1 migrations apply ns-counter --remote
npx wrangler deploy
```

后台操作：在「档案与简介」核对版本并准备中文简介。简体短简介默认不调用 AI；Gemini 草稿由编辑审核并采用后再保存。详见 [简介工作流](docs/game-summary.md)。

在「资料与渠道 → 封面与截图」中点击「搜索 SteamGridDB 封面」，按游戏名搜索、选定游戏版本，再从缩略图选择封面。只回填原图 URL 并记录封面来源；不会上传图片、修改其他游戏字段或自动保存。该封面会保留在资料刷新前后，也可继续手填或替换 URL。版本搜索、简介工具和封面搜索使用现有博客后台登录；未配置或服务出错时，手动编辑及已有档案仍可用。

文章编辑器统一使用「添加游戏」入口。点击后默认显示下拉框，展开后输入名称筛选已有游戏档案，选项优先显示顶层 `title`（手动名称覆盖），支持按该名称、资料库名称、原名或 slug 搜索。保存的是档案 slug，而非名称快照；前台强制使用档案最新的手动覆盖名称，本文状态覆盖仍可选填。新卡片格式为 `[gframe]档案slug||[/gframe]`，平台与按钮颜色取自该档案首个已选平台；旧的 `pframe/nframe/xframe/sframe` 卡片继续正常显示和编辑，保留原平台。

文章选择器读取构建生成的 /game-dossiers.json 本地档案索引，只包含 slug、显示名称和检索名称，不请求外部游戏数据库。新档案保存并部署完成后进入列表。原名和别名仅用于匹配，列表显示名称取自档案 title。资料搜索仅在游戏档案编辑界面使用。

RAWG / ScreenScraper / TheGamesDB 是资料来源；Steam、GOG、Nintendo eShop、PlayStation Store 等是手动维护的正版渠道，两者保存在不同字段。游戏资料搜索导入后，可在 `selectedPlatforms` 中只勾选自己要记录的版本；资料源返回的平台列表仍保存在资料元数据中，但不会自动展开成一堆前台卡片。存在手动 `platforms` 卡片时，手动记录优先，不再从元数据重复生成卡片。

## 本地预览

## 发布检查与资料对比

- 发布前依次执行 `npm test`、`npm run check`、`npm run validate` 和构建。内容检查会阻止不存在的游戏关联、卡片引用、站内图片/附件/链接及 CMS 配置错误，并把具体文件和原因写入 GitHub Actions 日志与 `content-validation` 附件。
- `npm run audit:links` 在线检查外链，404/410 会提示失效；超时、反爬和限流标记为“未确认”，不阻断正常发布。ScreenScraper 动态图片不在每次发布时批量抓取，以免消耗 API 配额。
- 「游戏档案 → 资料与渠道 → 刷新外部资料」现在先展示旧值/新值。勾选字段并确认后才填入表单，最后仍需保存。取消或不勾选任何字段不会修改资料，手动编辑字段不覆盖。直接搜索并导入新游戏的流程保留。
- 游戏档案支持按资料更新时间、名称、发售年份排序；筛选与排序写入网址，可分享该网址。在同一浏览器标签页从详情返回时会恢复上一次筛选；“重置筛选与排序”清空记忆。
- 独立标签页及顶部/底部导航入口已移除；文章标签和文章列表中的标签筛选保留。没有新增历史网址跳转功能。

### 修改文章网址名

文章的 `/posts/wish-list/` 中，`wish-list` 是 Markdown 文件名（slug），与文章标题独立。
打开后台文章编辑器，在右侧 **Slug** 面板点击铅笔，输入新的小写英文、数字或连字符名称，再保存。
后台会重命名文章文件，部署完成后新网址生效。此入口也适用于已经发布的文章；旧网址不会自动跳转。

### ScreenScraper 接入与导入

在「档案与简介 → 搜索并确认游戏版本 → 按年份、平台或开发商筛选」的资料库选择 **ScreenScraper**，输入名称并点击「查找版本」。
上游检索可能较慢，单次最多等待 75 秒；候选会显示名称及具体平台，需选中正确版本后再导入。
导入后勾选要展示的平台、填写手动覆盖名称，再保存档案；部署后本地游戏选择器和前台读取已保存的档案。新档案的 Slug 默认按资料库名称生成，例如 `Dynasty Warriors: Origins` → `dynasty-warriors-origins`、`Bro’s` → `bros`。手动指定 Slug 后优先使用手动值；更新已有档案的资料不会改动其网址。
封面和截图经本站 `/ns/api/games/media` 图片代理读取，开发者密码仅在 Worker 中使用，不写入文章、档案或浏览器响应。
开发者密码用于 `SCREENSCRAPER_DEV_PASSWORD`；Debug Password 不作为成员账号密码使用。

需要 Node.js 22。运行 `npm ci` 和 `npm run dev`；发布前可运行 `npm run check` 与 `npm run build`。静态网站输出在 `out/`。

## 原 TinaCloud 连接清理

网站构建和编辑已不使用 TinaCloud。确认 Sveltia 正常编辑和 Pages 部署后，可在 GitHub 仓库 Settings → Secrets and variables → Actions 删除旧的 `TINA_TOKEN` secret 和 `TINA_CLIENT_ID` variable，并在 GitHub Settings → Applications 中撤销 TinaCloud App 对本仓库的访问；TinaCloud 控制台中的旧项目也可以删除。

文章图片在构建时读取本地文件或 R2 目录中的尺寸并预留空间；远程或无有效尺寸的图片使用固定 16:9 容器完整显示，不会在加载后挤动正文。目录高亮变化不会重建正文图片。

## 发布状态、图片资源与文章搜索

后台右下角“发布状态 / 图片资源”打开只读维护工具。发布状态按 main 最新提交匹配 Workers 主发布与 Pages 回退副本流程，区分已保存待部署、部署中、已上线和失败，并提供失败步骤与日志入口。

公开资源清单从 R2 同步并展示大小、重复内容及引用。使用后台右下角“资源库”上传、筛选和检查最新引用；未引用资源可移至可恢复回收区。旧 Git 清理入口不再删除公开资源，私密附件仍走原私密服务。配置、构建与回退说明见 [公开资源存储](docs/public-resources-r2.md)。

文章正文和封面图片加载失败时保留原有尺寸及图注，显示重试按钮。文章搜索展示匹配正文附近的摘要并高亮关键词。没有加入阅读位置记忆。

## 关联 GitHub 项目

游戏档案内的“关联 GitHub 项目”支持多个仓库，填写仓库地址、展示名称、类型、说明及可选 Releases 地址。留空名称使用 owner/repo。详情页显示源码和发布版按钮，档案列表和文章卡片只显示紧凑入口，不扩大卡片高度；没有项目时隐藏。不实时请求 GitHub。项目关联不会被 RAWG / ScreenScraper 刷新覆盖。
