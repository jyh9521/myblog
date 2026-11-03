# 后台统一登录

在 `/sveltia/` 登录一次后，资源库上传、文件夹管理、引用检查和回收、私密文章编辑、游戏平台管理复用同一身份。独立管理页不再要求手动填写第二次 GitHub Token。

## 实现

- `public/sveltia/admin-auth.js` 是三个入口共用的认证适配层。首次管理操作自动使用 CMS 已有凭据调用原 `/ns/api/accounts/session`，服务器仍调用 GitHub `/user` 核对管理员，签发原有 8 小时 HttpOnly/Secure cookie。后续操作复用 cookie；并发操作只交换一次。
- 只有明确的 `401 ADMIN_LOGIN_REQUIRED` 才自动续接并重试一次。网络异常、服务错误、冲突、平台授权失败均不重放修改请求。CMS 登录失效或账号不匹配时，回编辑后台重新登录，不展示额外 Token 输入框。
- Git 最新引用扫描仍使用原 `X-GitHub-Read-Token`，从 CMS 当前凭据按需提供，且只发送给同源 `/ns/api/resources/references` 和 `/ns/api/resources/delete`；不发送给上传、私密文章、游戏平台、第三方地址，不允许重定向。
- 不新增 Token 持久化副本，不写入文章、URL、日志或服务器数据库。CMS 自身的已有凭据存储保持不变。GitHub API 的授权和服务器的管理员/来源/引用检查均保留。
- CMS 注销或切换账号后清理旧管理会话；跨标签页监听 storage，同标签页每秒检查已有缓存变化。进行中的会话交换结束后再清 cookie，避免迟到的登录响应覆盖注销。游戏平台页的退出按钮同时清除 CMS 登录缓存。

## CMS 兼容边界

当前 CMS 固定为原 CDN 当日版本 `@sveltia/cms@0.256.1`。其 `sveltia-cms.user` 是 JSON，包含 `backendName: github` 和 `token`；适配层只识别这一已验证形状。缓存中的用户名不作为权限依据。

Sveltia 的公开 JavaScript API 没有可供扩展调用的认证接口，因此把这一个兼容读取点集中封装，不在各功能中散布私有存储依赖。升级 CMS 时，先复核上游缓存结构、登录/注销行为，再更新版本和回归测试。

参考：[公开 API](https://sveltiacms.app/en/docs/api)、[已固定的发布包](https://unpkg.com/@sveltia/cms@0.256.1/dist/sveltia-cms.js)。

## 验证与回退

```sh
node --test scripts/admin-auth.test.cjs scripts/resource-cleanup-ui.test.cjs scripts/resource-ui.test.cjs scripts/post-access.test.cjs scripts/gaming-account-recovery.test.cjs
npm test
```

回退需一起恢复三个 HTML 入口、共用适配层及三个功能脚本；不改 D1、R2、平台授权或既有会话格式。回退后恢复原来的手工 Token 表单。
