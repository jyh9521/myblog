BLFY's blog.

## 在文章内插入 PDF

编辑文章正文时点击工具栏的 **插入 PDF**，在 PDF 文件字段点击 **浏览**，
从与图片共用的资源库选择现有 PDF，或点击 **上传** 添加新文件。填写文件标题后保存文章。
部署完成后，正文显示内嵌阅读器，支持翻页、缩放、搜索、打印，以及新窗口打开和下载。
编辑器预览使用简洁的 PDF 标题占位；完整阅读器在文章前台显示。

资源保存在现有 `/public/uploads` 中，公开路径是 `/uploads`。
资源管理工具提供“仅 PDF”筛选，按照正文引用判断正在使用和未引用，
复用已有重复检测及未引用资源删除流程。仅移除正文组件不会删除源文件。

Markdown 格式（普通 PDF 链接仍保持普通链接，不会自动变成阅读器）：

```markdown
[游戏手册](/uploads/manual.pdf "pdf-embed")
```

文件名包含中文或空格时，工具栏自动编码路径。上传尚未保存时，
编辑器使用临时 blob URL；Sveltia 保存时转换为永久资源路径。

阅读器复用本地托管的 Mozilla PDF.js 6.4.299（Apache-2.0），
上游版本、下载地址、校验值及本地改动见 `public/pdfjs/UPSTREAM.md`。
仅文章包含 PDF 时才加载 iframe 和 PDF.js；预留固定阅读区高度，避免加载导致正文跳动。
库、worker、字体、CMap、WASM 与翻译均由本站托管。PDF 内脚本执行关闭。

验证：`npm test && npm run check && npm run validate && npm run build`。
