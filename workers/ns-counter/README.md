# Blog Cloudflare Worker

Worker 路由同时提供访问计数与游戏资料 API。Sveltia CMS 通过规范化接口使用 RAWG、ScreenScraper、TheGamesDB 与 SteamGridDB，密钥留在 Worker。

## 游戏元数据 Provider

- `src/game-providers.js` 定义 `GameMetadataProvider`、`RAWGProvider`、`ScreenScraperProvider`、`IGDBProvider` 与统一字段转换、匹配/合并逻辑。
- `src/archive-providers.js` 的 TheGamesDB 只提供文字和发行资料；SteamGridDB 单独提供封面。自动模式仍按 RAWG → ScreenScraper 查询。
- `GAME_ADMIN` 服务绑定使用现有 `blog-gaming-accounts` 登录来保护两项新增 API；浏览器无需再次输入 GitHub 令牌。预览 Worker 调用隔离的同进程账号接口，不使用生产会话。
- `IGDBProvider` 仅保留扩展接口；当前 Worker 没有 IGDB 专用路由或 Durable Object，也不要求 Twitch/IGDB 密钥。
- D1 `game_metadata_cache` 缓存搜索结果 1 小时、详情 7 天；发布到 `content/games/<slug>.md` 的档案是静态站点运行时数据源。
- Markdown `gameMetadata` 存放外部资料；顶层 `manual` 独立存放 `officialStores`、`availabilityStatus` 和人工备注，刷新 API 资料不会修改该字段。

### 本地凭据

复制 `.dev.vars.example` 为 `.dev.vars` 并填写：

```dotenv
RAWG_API_KEY=
THEGAMESDB_API_KEY=
STEAMGRIDDB_API_KEY=
SCREENSCRAPER_DEV_ID=
SCREENSCRAPER_DEV_PASSWORD=
SCREENSCRAPER_SOFTNAME=
SCREENSCRAPER_USER_ID=
SCREENSCRAPER_USER_PASSWORD=
```

生产环境使用 Cloudflare Worker → Settings → Variables and Secrets 添加同名值；密钥字段设为 Secret。RAWG 与 ScreenScraper 凭据可以分开缺省。ScreenScraper 的 `softname` 应填申请后注册/确认的调用程序名称；用户账号凭据可选。

部署新增缓存表和 Worker：

```powershell
npx wrangler d1 migrations apply ns-counter --remote
npx wrangler deploy
```

游戏 API：`GET /ns/api/games/search?q=<名称>&source=auto|rawg|screenscraper|thegamesdb`，`POST /ns/api/games/detail`（JSON: `{ "title": "...", "sources": {...}, "dataSource": "auto", "refresh": true }`）。TheGamesDB 详情按 `sources.thegamesdb.id` 查询，名称目录缓存 30 天，无需 D1 schema 迁移。

封面 API：`GET /ns/api/games/covers/search?q=<名称>` 查询 SteamGridDB 游戏，`GET /ns/api/games/covers?gameId=<ID>&page=0` 返回静态竖版封面，每页最多 18 张。只返回公开 CDN URL，不代理或存储图片。游戏候选和封面列表缓存 1 小时，空结果 5 分钟；失败时有可用缓存则返回旧数据。Worker 的游戏接口失败不会影响静态页面渲染。

## 访问计数

`POST /ns/api/counter` 原子增加页面访问量并记录匿名随机访客 ID；`GET` 只读取页面访问总数。D1 数据库与迁移配置位于 `wrangler.toml` / `migrations/`。

## HLTB 参考时间

`GET /ns/api/hltb/search?q=原名` 返回候选；`GET /ns/api/hltb/detail?id=数字ID` 按明确关联读取详情。D1 详情缓存 14 天、搜索缓存 7 天，失败保留旧数据并冷却 1 小时；首次请求无缓存时冷却 60 秒，返回 Retry-After 和界面重试提示。网络或 500/502/503/504 错误只自动重试一次。没有有效缓存时返回 503，不影响静态页面。适配器使用原生 Fetch，公开搜索协议的 MIT 授权保存在 `licenses/`；不是直接运行 Python 包。详见仓库 `docs/game-time.md`。

部署使用 `npx wrangler@4.148.0` 或支持 `exports` 的新版，以保留原 `IgdbApi` 命名空间。旧版 4.98.0 会忽略声明导致部署失败。
