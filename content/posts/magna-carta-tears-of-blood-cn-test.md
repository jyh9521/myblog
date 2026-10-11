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

## 测试准备与下载

[PS2 Bios 下载](https://dl.ps2bios-download.com/ps2-bios-all-bios.zip)

[PS2 模拟器下载](https://pcsx2.net/)

[测试版游戏镜像下载](https://pan.baidu.com/s/1XWpYIp3jNJUe7pSPTlpnVg?pwd=blfy)

[高清材质包下载](https://pan.baidu.com/s/1eQNvKb7EV_LGcOLNS5ddFg?pwd=blfy)



---



## 高清材质使用方法：

![图1](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/1.png "图1")

![图2](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/2.png "图2")

1. 打开 **设置 → 图形 → 纹理替换**。
2. 勾选 **加载纹理**。
3. 查看图1红线标出的 **搜索目录**，点击“打开…”进入该目录，将材质包内的 `SCKA-20043` 文件夹放进去。截图示例目录是 `C:\Users\noway\Downloads\Magna-Carta-Tears-Of-Blood-CN\pcsx2\textures`，这是我的本机路径，**不需要照抄**。以你的 PCSX2 实际配置为准。
4. 最终纹理文件应位于 `<纹理搜索目录>/SCKA-20043/replacements/` 下。**搜索目录本身应指向 `textures` 这一层，不要选到 `SCKA-20043` 或 `replacements`，也不要多套一层压缩包文件夹。** 图2只展示了 `SCKA-20043` 这一层，解压后还需检查内部的 `replacements` 和纹理文件。
5. 重新启动游戏，对照同一场景检查纹理是否替换。若使用游戏单独设置，请确认 **右键游戏 → 属性 → 图形 → 纹理替换** 没有覆盖全局的加载选项。汉化字形是否被材质包覆盖、材质包是否完整兼容韩版汉化，仍需实际运行核查。



---



## 宽屏补丁使用方法：

![右键游戏 - 属性](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/87a35a24-a054-4a15-a16f-b13a73c25289.png "右键游戏 - 属性")

![补丁界面](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-160002.png "补丁界面")

![设置宽高比](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-160035.png "设置宽高比")

1. 打开 PCSX2，在游戏列表中找到《真名法典：真红的圣痕》。
2. 右键游戏，选择 属性。
3. 找到 补丁 页面。
4. 勾选 `Widescreen 16:9` 右侧的 **开启**。本文截图显示的是韩版条目（作者 ElHecht，NTSC-K 移植 Arapapa）。
5. 在 **属性 → 图形 → 显示 → 高宽比** 中选择 **宽屏（16:9）**。第三张截图来自全局设置，也可以在全局设置中调整，但会影响其他游戏；单独设置优先。
6. 重新启动游戏，对照 4:3 画面检查视野和人物比例。单独设置 16:9 只会改变画面显示比例，不能证明宽屏补丁已生效。菜单、字幕、过场动画和画面边缘是否异常需要实测。

截图中的全局“应用宽屏补丁”未勾选，而游戏属性中的具名补丁已开启。请以该游戏的补丁条目为准，不要为同一效果再叠加其他来源的宽屏代码。当前 PCSX2 的内置补丁与金手指分开管理，旧教程的 `cheats_ws` 路径不适用于此处操作。



---



## 60 FPS 金手指（实验性）

**此韩版移植代码未经过长期稳定性验证，不保证全程 60 FPS，也不保证游戏逻辑保持原速。使用前备份记忆卡。** 以下代码保留原文，不代表已复核其移植地址、作者署名或 EE 超频需求；仅适用于本文记录的版本测试，其他 CRC 不应直接套用。

### 1. 打开游戏的金手指编辑器

在 PCSX2 中启动咱们的韩版游戏，然后选择：

**工具 → 编辑作弊**

![工具 - 编辑作弊](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ_1791702933578.png "工具 - 编辑作弊")

### 2. 选择文本编辑器

如果没有文件，PCSX2 会提示你创建，创建以后会弹出选择软件的界面，这里选择你用的文本编辑器即可，比如我本人用 Notepad3，选择以后确认即可。

![选择文本编辑器](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161604.png "选择文本编辑器")

### 3. 粘贴代码并保存

将下面内容粘贴进去：

```plain
[60 FPS]
author=Gabominated (NTSC-U original)
description=NTSC-K port. Might need enable EE Overclock.
patch=1,EE,201C69E4,extended,28410001
```

保存 PCSX2 为当前游戏生成的 `.pnach` 文件，然后关闭编辑器。不要另存成 `.pnach.txt`；使用“编辑作弊”可避免猜测作弊目录和文件名。

![粘贴后保存](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161626.png "粘贴后保存")

### 4. 启用金手指

停止游戏，回到游戏列表：

1. **右键游戏 → 属性**。
2. 打开 修改 页面。
3. 勾选 开启作弊。
4. 勾选列表里的 **60 FPS**。

![修改 - 开启作弊](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161708.png "修改 - 开启作弊")

### 5. 重新启动并验证

完全停止游戏后正常启动，再读取游戏内的记忆卡存档；不要用即时存档作为此次开关金手指的对照起点。确认 `60 FPS` 条目启用，并检查模拟器日志或屏幕提示是否加载作弊。加载成功只说明代码被应用，不说明效果一定正确。

代码描述中的 `Might need enable EE Overclock` 只是“可能需要 EE 超频”，没有给出经验证的配置。先保持默认 EE 设置，不要通过解除限速或快进来制造“60 帧”。

![实验截图：FPS 60、VPS 60、速度 100%，不代表长期稳定性验证](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161824.png "60帧")

### 6. 区分帧率与游戏速度

根据 [PCSX2 官方性能说明](https://pcsx2.net/docs/troubleshooting/performance)，**FPS** 是模拟器统计的游戏内部帧率，**VPS** 是视频输出速率，**速度（Speed）** 是模拟运行速度百分比。NTSC 输出通常约为 59.94 VPS（界面可能取整显示 60）；VPS 60 不等于游戏每秒生成 60 张不同画面，录屏文件标为 60 FPS 也不能单独证明这一点。

上图在一个场景显示 FPS 60、VPS 60、速度 100%，只能作为该时刻的统计记录。即使速度为 100%，改变游戏内部帧率后仍可能让移动、动画或战斗计时加速。

请按以下方法实测并记录结果：

1. 关闭金手指、保持正常限速和默认 EE 设置，从同一记忆卡存档进入同一场景。在 **设置 → 屏上显示** 中开启 FPS、VPS 和速度统计，记录基线。本文尚未给出韩版原生实际帧率的对照测量，不能把约 60 VPS 当成原生 60 FPS。
2. 开启金手指，完全重新启动后重复测试。保持相同分辨率、纹理、宽屏及其他设置，比较内部 FPS 和模拟速度是否稳定；低于 100% 说明模拟器未能保持正常速度。
3. 用现实秒表比较相同路线的移动耗时、固定动作或动画时长、战斗节奏与计时、过场音画同步。若动作耗时明显缩短，即使速度显示 100%，也应视为可能存在游戏逻辑加速。
4. 如需验证不同画面的数量，用足够帧率的录屏逐帧检查持续移动的场景，排除重复帧；同时保留上述耗时对照。不同场景、菜单和 FMV 应分别检查。
5. 遇到加速、崩溃、音画不同步或战斗异常，关闭金手指并完全重启，用备份存档继续测试。不要把短时截图当成长期稳定性结论。

## 

有问题可以通过各种渠道反馈给我，比如[哔哩哔哩](https://space.bilibili.com/10119)、[QQ群](https://blog.blfy.cc/ns/)、本文评论区等。
