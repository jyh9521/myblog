# 静态托管迁移预览

## 当前边界

正式博客仍由 GitHub Pages 托管。预览使用独立 Worker `blog-static-preview`，没有正式域名 route，没有定时同步；Next.js 仍静态导出，公开文章仍用 Markdown/Sveltia/GitHub。

- 预览地址：https://blog-static-preview.342433419.workers.dev/
- CMS 只保存到 `codex/static-assets-preview` 分支，不会触发 main 的 Pages 发布。
- 计数、管理员会话、私密正文/资源使用独立 D1 `blog-static-preview` 和独立加密密钥。测试数据不会成为正式账号数据。
- 唯一生产 Service Binding 只接受 `/ns/api/accounts/public` 的 GET/HEAD，丢弃调用者 cookies、authorization、query。用于对照公开游戏平台展示。
- 其他 API 复用原 Worker 源码，但使用测试数据库。预览没有生产平台令牌、外部资料提供者密钥，不能把空账号状态或第三方登录未完成当成生产功能验收。
- 整站 `X-Robots-Tag: noindex, nofollow, noarchive`；robots 禁止抓取。预览站仍是公开网址，noindex 不是访问鉴权。
- 维护工具在预览产物中替换为只读说明，禁止调用原本针对 main 的资源删除或把 Pages 状态误当成预览发布状态。

## 重建与部署

在仓库根目录运行：

```powershell
npm ci
npm ci --prefix workers/gaming-accounts
npm ci --prefix workers/static-preview
npm test
npm run check
npm run validate
git fetch origin codex/static-assets-preview
npm --prefix workers/static-preview run prepare:site -- FETCH_HEAD
npm --prefix workers/static-preview run deploy
```

`prepare:site` 从固定 Git commit 导出独立源码副本，在副本中切换 CMS 分支，加入公开 PDF/中文资源和密码文章验收 fixture，再校验、构建、生成 SHA-256 manifest。正式 content/config/out 不被此脚本改写。Windows 上复用根 node_modules junction；保留旧预览产物，构建失败不会替换当前发布目录。

CMS 保存只更新测试分支，**目前需要手动执行上述重建/部署步骤**。尚未安装预览自动发布工作流或 CI 密钥。普通静态文件 asset-first，只有 API/auth 路径 Worker-first。

## 验证

```powershell
# 使用现有 Git Credential Manager 凭据，不把 token 输出到日志。
npm --prefix workers/static-preview run verify:browser -- --cms-only
# CMS 修改后重新 fetch / prepare / deploy，再继续以下步骤。
npm --prefix workers/static-preview run verify:live
npm --prefix workers/static-preview run verify:browser -- --render-only
```

浏览器验收使用 Playwright 的 Chrome channel；可设置 `BROWSER_CHANNEL=msedge`。HTTP 脚本验证全部产物路径、资源哈希、404/slash/noindex、真实 GitHub 身份会话、私密保存/编辑冲突/密码/撤销会话/PDF Range、计数隔离、六个平台的错误回调返回。浏览器脚本实际保存 Sveltia 测试文章，核对 Git blob 与 main ref，再验证桌面/手机布局、中文图片、PDF.js canvas/text layer 和密码文章 React 解锁与刷新。

密码 fixture 只含测试内容，密码 `preview-validation-2026`；正式密码文章没有复制到预览。重复运行失败密码测试可能触发原本的尝试限流，不能绕过生产限流；需要重置时仅清理独立测试 D1 的 `private_post_attempts`。

结果、截图和 manifest 位于 `workers/static-preview/.wrangler/`，不提交 Git。延迟数据只代表执行主机的同客户端交替测量，不代表中国大陆或多地区速度。外部平台真实账号授权、第三方 token exchange、正式域名切换仍需独立验收；错误回调测试不冒充完整 OAuth 授权。

## 回退

这阶段不改变正式站点，停止使用预览即可。预览版本可单独回滚：

```powershell
cd workers/static-preview
npx wrangler rollback <已记录的预览版本ID> --yes
```

只回滚 `blog-static-preview`；代码/资产回滚不回滚 D1 内容或加密密钥。继续发布当前产物可恢复最新预览。

仓库改动只有新增预览工程/文档、根 `test` 增加预览路由测试、`tsconfig.exclude` 排除预览独立构建副本和生成的运行时类型，以及 `.gitattributes` 将 PDF 标记为 binary，避免纯文本测试 PDF 被换行转换损坏。生产 Worker 配置、公开内容、Sveltia 原始配置、Pages 工作流保持原样。
