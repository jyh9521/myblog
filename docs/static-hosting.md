# 静态托管与回退

## 架构

- GitHub `main` 保存文章、配置、源码；Sveltia 编辑方式不变。
- `pages.yml` 构建一次 Next.js 静态导出，先发布 `blog-static-host`，核验版本和资源 SHA256，再发布同一输出到 GitHub Pages 回退副本。
- `blog.blfy.cc/*` 指向纯静态 Worker，无 JavaScript 入口、无数据库绑定、无回源代理。页面和 JS/CSS 直接由 Workers Static Assets 服务。
- 原 `/ns/api/*`、`/api/auth/*`、`/uploads/*` 的更具体路由仍优先匹配原 Workers；R2、私密 D1、登录 cookie、定时同步保持不变。
- DNS 保留原 proxied GitHub Pages CNAME，作为回退入口；日常请求由 Worker 路由截获，并不读取 Pages 原站。
- `_next/static` 指纹资源允许长期缓存；普通静态文件沿用必须重新验证的默认缓存策略；CMS 文件 `no-cache`，避免旧脚本问题。

## 发布

仓库 Actions Secret：`CLOUDFLARE_API_TOKEN`。
权限限定 BLFY 账户的 Workers Scripts Write、blfy.cc 的 Workers Routes Write 和 Zone Read。
此流水线不部署其他后端 Worker，也不修改 R2/D1 数据。

```sh
npm ci
npm ci --prefix workers/gaming-accounts
npm ci --prefix workers/static-preview
npm test
npm run check
npm run validate
npm run build
node scripts/prepare-static-host.cjs
node workers/static-preview/node_modules/wrangler/bin/wrangler.js deploy --config workers/static-host/wrangler.jsonc
# BLOG_RELEASE 使用本次构建的完整 Git SHA
BLOG_RELEASE=$(git rev-parse HEAD) node scripts/verify-static-host.cjs https://blog.blfy.cc
```

线上 `/hosting.json` 展示发布 SHA 和静态文件哈希清单，响应头 `X-Blog-Hosting: workers-static-assets` 证明由 Worker 提供；仅看到清单不足以区分 Pages 副本。
后台发布状态保持使用同一个 workflow ID，成功表示主发布验证及回退副本更新全部完成。

## 运维回退

1. 暂停自动发布，避免下一次提交重新挂载静态路由。
2. 在 blfy.cc 的 Workers Routes 删除**仅** `blog.blfy.cc/* → blog-static-host`；保留所有接口及上传路由。
3. 原 CNAME 立即作为静态页面入口，核验首页、CMS、附件、接口。无需移动 DNS、数据库或文件。
4. 排障后重新部署配置即可恢复 Workers 主托管；既有 Worker 版本也可通过 Cloudflare 部署回退恢复。

GitHub Pages 副本若更新失败，主站可能已成功上线，但流水线保持失败状态，以便维护者处理回退副本。
Workers 和 GitHub Pages 不是两套内容源：所有修改继续通过同一个 Git 仓库构建，不手工修改线上输出。
