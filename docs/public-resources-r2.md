# 公开资源存储

正文与前端仍由 GitHub Pages 部署。公开资源由 `blog-public-resources` Worker 从 `blog-public-assets` R2 提供，地址仍为同域 `/uploads/*`。私密文章和私密附件继续使用原 D1 服务。

## 编辑与上传

在后台图片、附件字段点击“浏览 / 上传 R2 资源”，或打开 `/sveltia/resources.html`。使用现有 GitHub 管理员身份连接后台；令牌只在当前窗口内存使用，关闭即清除。上传得到 `/uploads/cms/<SHA256>/<文件名>`，保存文章只提交文字与路径，不提交资源二进制。网页单文件上传上限 20 MiB。不要把密码文章附件上传到公开资源库。

资源库可按类型、未引用、重复内容筛选。“检查最新引用与重复”读取最新 Git 提交，清理前再次校验提交与资源哈希。资源先移至 R2 回收区，支持恢复；旧的 Git 文件清理入口不处理 R2 资源。

CMS 配置省略 `media_folder`，关闭内置 Git 媒体存储，公开上传统一走自定义 R2 控件。[Sveltia 内部存储配置](https://sveltiacms.app/en/docs/media/internal)说明了此关闭方式。

## 构建

`resources.config.json` 开启远程目录。`npm run validate` 和 `npm run build` 先同步 R2 元数据；本地没有图片文件时仍校验文章路径、读取图片尺寸。同步失败时构建失败，不发布缺失资源的页面。生成的 `public/sveltia/r2-assets.json` 不提交 Git。

```powershell
npm ci
npm test
npm run check
npm run validate
npm run build
npm --prefix workers/static-preview ci
node workers/static-preview/node_modules/wrangler/bin/wrangler.js deploy --config workers/public-resources/wrangler.jsonc
```

预览使用独立 `blog-public-assets-preview` 桶和 `workers/static-preview/wrangler.r2.jsonc`，正式配置没有静态文件兜底。公共路径包含中文和空格时按段编码；PDF 支持 HEAD、ETag 和单段 Range。

## 回退

迁移未改写 Git 历史，原资源保留在迁移前提交中，且另有本地 SHA256 清单和副本。先恢复迁移前源文件并重新构建，再调整公开资源 Worker 路由；不要先关闭资源服务。迁移后的新资源仍留在 R2，回退期间保留它们的服务或先导回 Git。回收区和私密 D1 均不自动删除。单纯 `git revert` 不等于完成线上回退。

本次证据目录中的 `ROLLBACK.sh` 用于指定的独立副本验证源码回退，不修改线上服务、Git 分支或原工作目录。
