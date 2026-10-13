# 公开资源存储

正文与前端仍由 GitHub Pages 部署。公开资源由 `blog-public-resources` Worker 从 `blog-public-assets` R2 提供，地址仍为同域 `/uploads/*`。私密文章和私密附件继续使用原 D1 服务。

## 编辑与上传

在后台图片、附件字段点击“上传图片 / 选择已有图片”，或打开 `/sveltia/resources.html`。使用现有 GitHub 管理员身份连接后台；令牌只在当前窗口内存使用，关闭即清除。上传得到 `/uploads/cms/<SHA256>/<文件名>`，保存文章只提交文字与路径，不提交资源二进制。网页单文件上传上限 20 MiB。不要把密码文章附件上传到公开资源库。

资源库可按类型、未引用、重复内容筛选。“检查最新引用与重复”读取最新 Git 提交，清理前再次校验提交与资源哈希。资源先移至 R2 回收区，支持恢复；旧的 Git 文件清理入口不处理 R2 资源。

CMS 配置把内置媒体库的 `max_file_size` 设为 0，阻止非空文件上传到 Git；公开上传统一走自定义 R2 控件。[Sveltia 内部存储配置](https://sveltiacms.app/en/docs/media/internal)说明了媒体大小限制配置。

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

## 直观的编辑界面

图片和文件字段直接上传，支持拖放；图片字段也支持粘贴截图。选择已有文件时显示缩略图和文件名，不默认展示路径和哈希。首次上传若会话尚未验证，会弹出一次身份验证；已有会话直接上传。资源库中的引用检查、重复检测、回收区及详细信息默认收在“管理”里。移除字段引用不会删除文件。

## 文件夹整理

资源库默认从根目录开始，左侧目录树和面包屑提供导航；“全部文件”仍可平铺查看。旧资源按原路径目录展示，新上传文件默认归入“上传文件”。在当前目录可新建子目录、重命名目录、多选移动和上传；空目录可删除，非空目录拒绝删除。选图库中的上传以选择文件为目的，上传后自动返回字段；独立资源库支持连续或多文件上传，上传完成后保持当前目录打开，便于继续整理。

目录归类保存在 R2 隐藏元数据 `.catalog/folders.json`，移动和目录重命名不改变文件 key、公开 URL 或字节。重命名会同步子目录和回收区的归类信息。多文件移动使用一次条件写入，版本冲突会拒绝并要求刷新，不覆盖其他窗口的修改。相同文件名和相同内容的重复上传复用已有文件及其原归类；需要重新归类时明确执行移动。根目录搜索包含子目录。
