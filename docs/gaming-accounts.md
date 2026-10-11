# 游戏平台账号

## 结构

GitHub Pages 提供 `/sveltia/accounts.html` 管理页和 `/games/` 展示页。独立 Worker
`blog-gaming-accounts` 提供 `/ns/api/accounts*` 和 `/api/auth/*`，使用独立 D1
`gaming-accounts`，不改访问计数、游戏元数据、HLTB 的数据库或路由。

前台只读取 `/ns/api/accounts/public` 的白名单字段，每个平台最多 6 条最近记录，
页面再选最近 6 款并懒加载封面。拥有库与游玩历史分别标记，不合并成“拥有总数”。
没有时长或日期的记录不推测。未连接平台不显示卡片。

## 管理员

后台右下角“游戏平台账号”打开独立账号管理页。首次使用自己的 GitHub Token
验证账号 `jyh9521`；服务器只请求 GitHub `/user`，不保存该 Token。登录成功后
使用 8 小时的加密 HttpOnly、Secure、SameSite=Lax、host-only Cookie。
登录每 IP 每分钟最多 10 次，所有修改要求同源 Origin 和自定义请求头。
不读取 CMS 私有存储、不把平台凭证放 localStorage。

## 平台连接与当前数据范围

| 平台 | 连接 | 当前读取 | 需要实测的部分 |
| --- | --- | --- | --- |
| Steam | 官方 OpenID 登录，自动回到 `/api/auth/steam/callback` | 公开拥有库、时长、接口提供的最近时间 | 游戏详情需公开；需要自己的 Steam Web API key |
| Xbox | Microsoft 个人账号 OAuth + PKCE、Xbox 用户令牌、XSTS | 游玩历史、最近 6 款可用时长、成就数量 | Web 应用 Client Secret 必需；历史不等于拥有库，未汇总为总时长 |
| Nintendo | 官方网页登录后，复制返回 APP 的 `npf…://auth` 链接 | 任天堂返回的游戏名、封面、时长、最近日期 | 官方 APP 私有接口，地区/版本可能影响字段；网页登录没有原生协议接收器 |
| PS | 官网登录，凭证页面复制 NPSSO，服务器交换并保存 refresh token | 游玩历史、ISO 8601 时长、最近日期、封面 | 非公开开发者接口；账号实际权限和历史覆盖需实测 |
| GOG | 官方登录，复制 `on_login_success` 返回地址 | 拥有游戏数量 | Galaxy 客户端兼容接口；未实现可靠的时长与最近记录 |
| Epic | 官方登录，复制 authorizationCode 或返回 JSON | 游戏库数量、累计游玩时长 | Launcher 客户端兼容接口；实测时长接口只有 accountId/artifactId/totalTime，没有最后游玩日期，不使用购买日期冒充游玩日期 |

Nintendo、PS、GOG、Epic 的辅助方式不是已注册的第三方网站 OAuth。
它们的客户端兼容协议不能承诺长期稳定，不会标成“官方公开 API”。
账号绑定验证平台身份；一般在首次数据读取成功后入库。Xbox 在 Microsoft/XSTS 身份验证成功后，即使游戏列表读取失败也保留加密授权，后台可重试同步；不覆盖已有其他绑定或旧缓存。
不得在博客输入平台密码。NPSSO、返回链接、令牌都是敏感凭证，不要分享。

Xbox 已登记的 Client ID 为 `e9040407-8937-442e-b89a-2f888e574c74`，回调为
`https://blog.blfy.cc/api/auth/xbox/callback`。Microsoft Entra 中账户类型为个人
Microsoft 账户，平台为 Web。Client Secret **值**直接填 Cloudflare Secret
`MICROSOFT_CLIENT_SECRET`（不是 Secret ID）；不要提交 Git 或写进客户端。

## 部署

```powershell
cd workers/gaming-accounts
npm ci
npx wrangler d1 migrations apply gaming-accounts --remote
npx wrangler secret put CREDENTIAL_KEY
npx wrangler secret put STEAM_API_KEY
npx wrangler secret put MICROSOFT_CLIENT_SECRET
npx wrangler secret put GOG_CLIENT_ID
npx wrangler secret put GOG_CLIENT_SECRET
npx wrangler secret put EPIC_CLIENT_ID
npx wrangler secret put EPIC_CLIENT_SECRET
npx wrangler types
npm run check
npm test
npx wrangler deploy
```

`CREDENTIAL_KEY` 是 32 字节随机数的 base64url 编码，生成一次后妥善保存。
凭证与授权验证器使用 AES-256-GCM，不同平台使用不同 additionalData 上下文。
不要随意更换密钥；更换后已有凭证需要重新绑定。密钥只保存于 Worker Secret。
GOG/Epic 客户端兼容参数来自下列开源实现，仅在 Worker Secrets 配置。
缺失配置时后台禁用连接并展示缺少的变量名。
Steam Key 也可在账号管理页点击“设置 Steam API Key”，服务器会将它加密保存到
D1，不回传到浏览器。Worker Secret 中配置的 Key 优先于 D1 配置。

游戏档案列表默认每页 15 款，上下都有分页控件。筛选或排序变化会回到第一页；
页码随筛选写入 URL，进入独立档案后返回时保留原页码和滚动位置。

## 同步与异常

Worker Cron 每 6 小时执行，后台也可以手动同步。记录绑定时间、最近尝试、
最近成功与最近 30 天的同步日志。平台失败只改变状态，不删除旧数据。
短期访问令牌过期后刷新；令牌轮换即使后续数据读取失败也保存新 refresh token。
使用 D1 原子同步租约防止重复请求；手动同步有一分钟冷却。
解除绑定删除平台凭证、缓存、授权状态和同步日志。不会删除手工编辑的游戏档案。
管理员看到结构化错误码，错误不包含上游响应正文、凭证或带凭证的 URL。

## 实现参考与验证边界

- [Microsoft Xbox 网站认证](https://learn.microsoft.com/en-us/gaming/gdk/docs/services/fundamentals/s2s-auth-calls/service-authentication/live-website-authentication)
- [Steam OpenID](https://partner.steamgames.com/doc/features/auth)
- [OpenXbox 时长统计](https://github.com/OpenXbox/xbox-webapi-python)
- [PSN API，MIT，协议参考](https://github.com/achievements-app/psn-api)
- [Nintendo 登录协议参考](https://github.com/raycast/extensions/tree/main/extensions/switch-game-play-history)
- [GOG 客户端协议参考](https://github.com/Heroic-Games-Launcher/heroic-gogdl)
- [Epic 客户端协议参考](https://github.com/legendary-gl/legendary)

适配器使用原生 Fetch 独立实现，未复制上述项目的完整客户端。
自动测试使用受控接口响应和真实 SQLite 表验证授权状态、加密、缓存保留和并发。
它们不是六个平台真实账号验收。真实账号仍需管理员自行登录；自动测试从不绑定
测试账号到生产数据库，也不把测试游戏写入生产展示数据。

## 连接流程补充

- Nintendo 使用纯手动返回链接流程，不要求本地助手或云端浏览器。仅在官方页面输入密码，在账号选择页复制 `npf5c38e31cd085304b://auth#…` 返回链接，粘贴到原后台弹窗完成连接。按钮是否支持复制链接取决于官方页面与浏览器；若只能得到官网地址，后台会提示且不消耗授权请求。服务器仍校验 state、PKCE、有效期及一次性消费。授权保存于服务器，换电脑无需重复绑定，失效或撤销时才重新连接。历史助手 fragment 接收兼容保留，但不再作为默认操作方式。
- GOG 登录停在 `on_login_success` 是客户端协议预期行为，复制完整地址回原后台弹窗再提交，不是网站自动 OAuth 回调。
- Sony 使用有界请求解析授权 Location，兼容 redirect 和 redirect/ 两种返回形式，分别报告授权、令牌和资料读取阶段。
- Xbox 新令牌不会立即重复刷新，授权请求携带 Xbox contract header，游戏记录接口带必需的 Accept-Language；失败回到后台显示阶段码，不再停在 JSON 页面。首次连接失败也记录同步历史，保留已有绑定。
- Steam 仅请求最近六款游戏的成就数，避免逐次请求整个库；缺失或失败不填写虚假的零。

## 区域商店商品链接

最近游玩卡片在同步时由 Worker 自动匹配商品页，公开读取只使用缓存，不进行商店搜索。

- Xbox：台湾目录按 XboxTitleId 查询 Microsoft ProductId；缺少 ID 映射时，只接受唯一、名称完全匹配的商店游戏，不匹配豪华版或 DLC。
- PlayStation：港服 title-container 按 CUSA/PPSA 查询；空结果使用港服目录检索，仍同时核对原始 title ID 与完整名称，并验证港服商品详情页。
- Nintendo：官方 `/apps/{titleId}/JP` 解析日服商品 ID；区域差异、Switch 2 升级版使用日本元数据索引进行确定性匹配。共用 title ID 的不同版本不会默认取第一条。

D1 `gaming_store_links` 保存商品 URL、来源及有效期。成功缓存 30 天，明确未找到缓存 1 天，临时失败 1 小时后重试；已有有效链接不会因请求失败而删除。每次最多处理最近 6 款。

日本索引由 `scripts/update-nintendo-store-catalogue.mjs` 生成，数据源为
[TitleDB 日本区元数据](https://github.com/blawar/titledb)，只保留标题、title ID 和日服商品 ID，不复制图片、简介或游戏文件。
`public/data/nintendo-store-catalogue.json` 仅由 Worker 在需要时读取，浏览器不下载该目录。
`nintendo-store-catalogue.yml` 每 6 小时更新并支持手动触发；生成失败保留旧文件，内容不变不提交。发生变化后显式触发 Pages 部署。

后台对应平台卡片的“商店链接”按钮可以修改最近游玩的商品 URL，也可恢复自动匹配。手动修正保存在 D1，换电脑保留且不被同步覆盖；仅接受日服 eShop、台湾 Xbox Store、港服 PS Store 的 HTTPS 商品页。链接修正不改变游玩数据的最近成功同步时间。

旧缓存可用管理员接口 `POST /ns/api/accounts/store-links/refresh`（`{"platform":"xbox"}` 等）补全链接；该接口不接触账号授权，不伪造游玩数据刷新时间。
