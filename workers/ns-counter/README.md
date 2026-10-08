# Blog Cloudflare Worker

Worker 路由同时提供访问计数与游戏元数据 API。博客前端和 Sveltia CMS 只调用规范化接口，不直接访问 RAWG、ScreenScraper 或 IGDB。

## 游戏元数据 Provider

- `src/game-providers.js` 定义 `GameMetadataProvider`、`RAWGProvider`、`ScreenScraperProvider`、`IGDBProvider` 与统一字段转换、匹配/合并逻辑。
- CMS 数据源选择支持自动、RAWG、ScreenScraper；自动模式按 RAWG → ScreenScraper 查询，ScreenScraper 仅补缺失字段。
- `IGDBProvider` 仅保留扩展接口；当前 Worker 没有 IGDB 专用路由或 Durable Object，也不要求 Twitch/IGDB 密钥。
- D1 `game_metadata_cache` 缓存搜索结果 1 小时、详情 7 天；发布到 `content/games/<slug>.md` 的档案是静态站点运行时数据源。
- Markdown `gameMetadata` 存放外部资料；顶层 `manual` 独立存放 `officialStores`、`availabilityStatus` 和人工备注，刷新 API 资料不会修改该字段。

### 本地凭据

复制 `.dev.vars.example` 为 `.dev.vars` 并填写：

```dotenv
RAWG_API_KEY=
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

游戏 API：`GET /ns/api/games/search?q=<名称>&source=auto|rawg|screenscraper`，`POST /ns/api/games/detail`（JSON: `{ "title": "...", "sources": {...}, "dataSource": "auto", "refresh": true }`）。外部 API 错误会在可用时回退到缓存；Worker 的游戏接口失败不会影响静态文章渲染。

## 访问计数

`POST /ns/api/counter` 原子增加页面访问量并记录匿名随机访客 ID；`GET` 只读取页面访问总数。D1 数据库与迁移配置位于 `wrangler.toml` / `migrations/`。

## HLTB 参考时间

`GET /ns/api/hltb/search?q=原名` 返回候选；`GET /ns/api/hltb/detail?id=数字ID` 按明确关联读取详情。D1 详情缓存 14 天、搜索缓存 7 天，失败保留旧数据并冷却 1 小时；首次请求无缓存时冷却 60 秒，返回 Retry-After 和界面重试提示。网络或 500/502/503/504 错误只自动重试一次。没有有效缓存时返回 503，不影响静态页面。适配器使用原生 Fetch，公开搜索协议的 MIT 授权保存在 `licenses/`；不是直接运行 Python 包。详见仓库 `docs/game-time.md`。

部署使用 `npx wrangler@4.148.0` 或支持 `exports` 的新版，以保留原 `IgdbApi` 命名空间。旧版 4.98.0 会忽略声明导致部署失败。
