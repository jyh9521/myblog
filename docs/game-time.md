# 游戏时长与 HowLongToBeat

在后台「游戏档案」中编辑：

- **我的游玩时长**：累计小时（非负数，支持小数）和分钟（0–59 整数）。可只填一项，不填不展示；明确填写 0 会展示 0.0 小时。存储原始小时、分钟，前台才换算并四舍五入到一位小数。可直接填 3.8 小时，分钟留空；如果同时填写则相加，例如 3.8 小时加 12 分钟显示 4.0 小时。
- **HowLongToBeat 关联与参考通关时间**：填写对应游戏的 `https://howlongtobeat.com/game/数字ID` 链接，也兼容旧版 `game.php?id=数字ID`。主线、主线＋支线、全收集使用小时数，支持小数。

HLTB 区域支持名称搜索，显示候选的 ID、版本类型和平台。请核对后明确选择，系统保存 `id`、链接与自动数据快照；不会自动选择第一个结果。也可手动填写游戏详情链接，系统从链接解析 ID。

自动模式：GitHub Pages 上的前台只按保存的 ID 请求 `GET /ns/api/hltb/detail?id=ID`，不按名称搜索。Cloudflare Worker 读取 D1，详情缓存 14 天，搜索结果缓存 7 天；访问过期记录才刷新。原数据保留：已有缓存刷新失败后冷却 1 小时；尚无缓存时只冷却 60 秒，并向界面返回剩余等待时间。上游网络或 500/502/503/504 错误自动重试一次，403/429 等不立即重试。D1 原子租约抑制并发刷新。前台有 CMS 保存的快照作为离线兜底，并显示数据日期。打开页面仍会请求 Worker，但缓存有效时不请求 HLTB。

手动字段始终优先，留空使用自动数据。可以取消自动读取或取消关联；取消自动读取时不展示旧自动快照。未填写、零值或非法参考时间不显示。没有合法链接时不显示参考时间。刷新 RAWG / ScreenScraper 不会覆盖本区。

## Worker 兼容性

没有把 Python 包直接装入 JavaScript Worker。`howlongtobeatpy` 的 requests/aiohttp/BeautifulSoup 运行模型与现有 Worker 不同；TypeScript 库 1.1.1 在实测中使用已失效的初始化路径，返回 404。本项目使用原生 Fetch 的小型适配器：按 Python 项目的公开搜索协议发现路径、初始化并搜索（MIT 授权文本随附）；详情按 ID 从游戏页面公开嵌入 JSON 提取，不再额外按名称搜索。上游初始化凭据仅留在请求内，不落库、不返回客户端、不写日志。此适配器不依赖 Python 服务、公开 CORS Proxy 或个人登录信息。

Worker：`workers/ns-counter/src/hltb.js`；D1：新增 `migrations/0003_hltb_cache.sql`，不改变计数器或游戏资料表。源网站可变动；无缓存时故障返回 503，有缓存时返回 `cache: stale`，不伪造时间。

部署（复用已有 Worker 和 D1）：

```sh
npx wrangler@4.148.0 d1 migrations apply ns-counter --remote --config workers/ns-counter/wrangler.toml
npx wrangler@4.148.0 deploy --config workers/ns-counter/wrangler.toml
```

Wrangler 旧版 4.98.0 会忽略现有 `exports` 声明，导致 Durable Object 协调失败；部署使用上述版本，保留原 `IgdbApi` 命名空间。运行时不额外引入该库或 Wrangler 依赖。

这些字段独立于游戏资料来源和时间线，刷新 RAWG / ScreenScraper 资料不会覆盖。旧档案不需要迁移。填写后保存并等待 GitHub Pages 部署，在该游戏详情页标题下查看「游玩时长」。

验证：`npm test`、`npm run check`、`npm run validate`、`npm run build`。

## 个人评分

游戏档案中的 personalRating 为独立可选字段，范围 0–10。前台将评分四舍五入至两位小数，个人好评度按该评分 ÷ 10 × 100% 换算，例如 8.00 → 80%，8.12 → 81.2%。留空不展示，明确填写 0 会展示 0.00 / 10 和 0%。个人评分卡片在游玩时长区内；没有时间记录也能单独显示。不代表玩家群体好评率；资料源刷新、HLTB 与 Exophase 不会修改个人评分。
