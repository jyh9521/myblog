---
title: PS2《真名法典：真红的圣痕》汉化测试
date: 2026-10-11
tags:
  - 汉化
  - 游戏
  - PS2
  - 真名法典
pinned: false
gameSlug: magna-carta-tears-of-blood
access:
  mode: unlisted
---

[PS2 Bios 下载](https://dl.ps2bios-download.com/ps2-bios-all-bios.zip)

[PS2 模拟器下载](https://pcsx2.net/)

测试版游戏镜像下载

[高清材质包下载](https://pan.baidu.com/s/1eQNvKb7EV_LGcOLNS5ddFg?pwd=blfy)



---



## 高清材质使用方法：

![图1](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/1.png "图1")

![图2](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/2.png "图2")

1. 打开 **设置 → 图形 → 纹理替换**。
2. 勾选 **加载纹理替换**。
3. 查看图1画线未知的目录，将高清材质包解压进去，结构是图2这种，**不要选到 `SCKA-20043` 或 `replacements` 里面**。



---



## 宽屏补丁使用方法：

![右键游戏 - 属性](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/87a35a24-a054-4a15-a16f-b13a73c25289.png "右键游戏 - 属性")

![补丁界面](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-160002.png "补丁界面")

![设置宽高比](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-160035.png "设置宽高比")

1. 打开 PCSX2，在游戏列表中找到《真名法典：真红的圣痕》。
2. 右键游戏，选择 属性。
3. 找到 补丁 页面。
4. 直接勾选启用 `Widescreen 16:9`即可。
5. 在图形设置中将 画面比例 设为 `16:9`。



---



## 60帧金手指

### 1. 打开游戏的金手指编辑器

在 PCSX2 中启动咱们的韩版游戏，然后选择：

**工具 → 编辑作弊**

![工具 - 编辑作弊](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ_1791702933578.png "工具 - 编辑作弊")

### 2. 选择文本编辑器

如果没有文件，pcsx2 会提示你创建，创建以后会弹出选择软件的界面，这里选择你用的文本编辑器即可，比如我本人用 Notepad3，选择以后确认即可。

![选择文本编辑器](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161604.png "选择文本编辑器")

### 3. 粘贴代码并保存

将下面内容粘贴进去：

```plain
[60 FPS]
author=Gabominated (NTSC-U original)
description=NTSC-K port. Might need enable EE Overclock.
patch=1,EE,201C69E4,extended,28410001
```

保存，然后关闭编辑器。

![粘贴后保存](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161626.png "粘贴后保存")

### 4. 启用金手指

停止游戏，回到游戏列表：

1. **右键游戏 → 属性**。
2. 打开 修改 页面。
3. 勾选 开启作弊。
4. 勾选列表里的 **60 FPS**。

![修改 - 开启作弊](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161708.png "修改 - 开启作弊")

### 4. 重新启动游戏

正常启动，再读取游戏内存档，即可60 FPS。

但是这个金手指我没长期测试过，不一定稳定，自己酌情使用。

![60帧](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161824.png "60帧")

有问题可以通过各种渠道反馈给我，比如[哔哩哔哩](https://space.bilibili.com/10119)、[QQ群](https://blog.blfy.cc/ns/)、本文评论区等。
