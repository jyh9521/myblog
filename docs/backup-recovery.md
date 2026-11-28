# 备份与恢复核对

## 明确区分

- Git 历史保存源代码和 Markdown；不包含迁移到 R2 的媒体，也不包含 D1 的私密数据。
- R2 回收区不是完整备份，Pages 回退站不是数据库备份。
- 本工具校验和恢复已导出文件，不宣称已经抓取全部云端对象或完成生产业务验收。
- 本次 `backup:drill` 是合成样例：真实 Git bundle 克隆、资源字节比对、SQLite SQL 导入查询。报告明确标记 `fixture`。

## 生产导出准备

在同一维护窗口暂停 CMS 编辑、上传和会写 D1 的同步任务，记录 Git SHA、R2 完整对象清单及每个 D1 数据库。通过已有 Cloudflare 运维凭据只读导出，包含 R2 的目录元数据/回收区和所有实际使用的 D1，而不是只有公开图片清单。导出期间有写入时重新做一致性核对。

暂存目录结构：

```text
staging/
  git/repository.bundle        # git bundle create ... --all
  r2/<bucket>/<object-key>     # 保留原始 key 和 .catalog 等元数据
  d1/<database>.sql            # 每个数据库的完整 SQL 导出
```

先把云端清单的对象数量、键、字节/hash 与导出目录比对。`scope=production` 只是操作者对来源的标注，不是工具对导出完整性的认证。不要把上述目录或快照上传到公共 Git 仓库、站点 public 或公共报告。

## 创建、校验、文件恢复

```sh
node scripts/backup-snapshot.cjs create STAGING SNAPSHOT SOURCE_GIT_SHA production
node scripts/backup-snapshot.cjs verify SNAPSHOT
node scripts/backup-snapshot.cjs restore SNAPSHOT EMPTY_RECOVERY_DIRECTORY
```

路径为独立本地目录。创建与恢复拒绝目录重叠、符号链接和非空目标；manifest 使用 SHA-256 与字节数，恢复前先核对全部条目，拒绝路径穿越和重复路径。输出 `RESTORE_STATUS.json` 的 `level=file-restore-only` 仅证明文件恢复校验。

进一步在独立验证环境克隆恢复的 Git bundle，导入 D1 SQL，检查表/行数与关键查询，核对 R2 对象清单并逐项验证文章附件和后台读取。确认后才另行安排生产切换。本工具不会覆写生产数据库、桶或仓库。

维护面板可读取本地 `RESTORE_STATUS.json`；文件只在浏览器读取，不上传，不覆盖全站生产状态。未完成生产恢复时始终显示“尚未验证”，不会用 fixture 报告代替。

## 离线演练

```sh
npm run backup:drill
```

输出 `reports/recovery-drill.json`；临时样例目录在退出时清理。CI 在部署前运行同一演练。实际生产凭据、SQL、附件和密钥均不进入此测试。
