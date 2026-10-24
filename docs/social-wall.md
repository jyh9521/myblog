# 关于我：社交主页卡片墙

后台「页面 → 关于我 → 社交主页」添加项目，填写平台名称、昵称、完整 HTTP(S) 链接，搜索并点选品牌图标。拖动列表项目调整顺序。平台名称不受图标库限制，个人网站或没有对应品牌的平台使用「通用网站」图标。删除全部项目后整个区块隐藏。保存、部署后生效。

数据保存在 `content/about.md` 的 `socialLinks` 列表，直接按列表顺序展示，不根据平台或昵称重新排序；允许同一平台多个账号。初始化只复用已有 GitHub 贡献日历公开账号，不生成其他平台的示例账号。

图标采用 **Font Awesome Free Brands 7.3.1**（固定依赖版本），共 572 个去重品牌图标。对比 Simple Icons 16.35.0，后者有更多品牌，但此次安装版本不含 Xbox；统一采用同一套 Free Brands，覆盖 GitHub、Discord、YouTube、哔哩哔哩、Steam、PlayStation、Xbox。

- 上游：<https://github.com/FortAwesome/Font-Awesome>
- 作者：Fonticons, Inc.，<https://fontawesome.com>
- 图标：CC BY 4.0，<https://creativecommons.org/licenses/by/4.0/>；完整原始许可证随构建复制到 `/sveltia/brand-icons-LICENSE.txt`。
- 品牌图形保留原始路径、比例，使用统一 24px 单色展示；通用网站图标为本项目绘制。
- 上游图标与品牌商标说明：<https://github.com/FortAwesome/Font-Awesome/blob/7.x/LICENSE.txt>。

`predev`、`prebuild` 执行 `scripts/build-social-icons.cjs`，从固定 npm 依赖生成后台图标目录和许可证；生成文件不进 Git。后台仅在打开图标字段时加载本地目录，搜索不请求第三方。前台由服务端静态渲染所选 SVG 路径，不加载全库脚本、字体或第三方图标 CDN。

卡片使用博客现有色板、圆角和 section-title，适配浅色/深色；宽屏三列、平板两列、480px 以下单列。支持长昵称换行、键盘焦点和减少动态效果。外链复用全站策略。

验证：`node --test scripts/social-wall.test.cjs`、`npm test`、`npm run check`、`npm run validate`、`npm run build`。校验拒绝无平台/昵称、无效链接、非 HTTP(S) 地址、带凭据链接以及不存在的图标；未填写图标使用通用网站。

回退：还原此次相关源码和依赖文件、执行 `npm ci` 并重新构建；无需修改数据库、登录或上传资源。旧的 about.md 没有 socialLinks 字段时仍可正常构建。
