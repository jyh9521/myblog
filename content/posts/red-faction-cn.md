---
aliases:
  - /posts/red-faction/
title: 《红色派系》简体中文汉化补丁
date: 2026-08-07
description: |-
  > Red Faction Simplified Chinese Patch
  > 《红色派系》简体中文汉化补丁
  > 基于 Alpine Faction 1.3.0
cover: /uploads/chinesetranslationpatch/redfaction/封面图.avif
tags:
  - 汉化补丁
  - 红色派系
  - 游戏
pinned: false
gameSlug: red-faction
patch:
  compatibility: 限定Alpine Faction为1.3.0
  downloads:
    - label: GitHub
      url: https://github.com/jyh9521/Red-Faction-CN/releases
    - label: Google Drive
      url: https://drive.google.com/drive/folders/1JDfhMGhs5HTHCkhHoeR22HzveU327Glu
    - label: 百度网盘
      url: https://pan.baidu.com/s/1SzdjlZazSV4AnQyTkLxeFQ?pwd=1658
  enabled: false
  gameVersions: Steam版
  issues: |-
    1. Alpine Faction的选项里，「网格光照」的选项字不全
    引擎那处的字符串缓冲区只有 8 字节。「逐像素」的 UTF-8 编码要 9 字节，最后一个字被截断，落单的字节被当成别的字符渲染了出来。
    功能本身完全正常，选项该干什么还干什么，只是显示不全。
    改的话得动引擎里的缓冲区大小。为了一个纯显示问题去动内存布局，性价比太低，所以保留了。

    2. 文字太小
    打开游戏选项 - 高级 - 界面：大号 HUD
    上方游戏自带字幕框的文本，可以使用键盘的 M 键来打开日志查看。
  releaseDate: 2026-08-07
  version: v1.0
---

## **一、项目背景**

《红色派系》是 Volition 在 2001 年推出的第一人称射击游戏，当年靠 Geo-Mod 可破坏地形出名。Steam 和 GOG 都有卖，不过依旧从来没有过官方中文和民间汉化。

应其乐坛友@cowcow78925 邀请，研究了一下《红色派系》的汉化可行性，查阅了一些资料以后，最终把基底定为了 Alpine Faction ，这是社区维护多年的现代化补丁，修了大量引擎年久失修的问题，也支持现代系统和宽屏。

碎碎念（

这个补丁做到一半的时候，我在多人游戏里撞上一个必崩的 bug， 排查了几天，日志断在半截，什么都不留，崩溃处理器也不触发。

最后是自己挂了一个异常记录器才逮到：某个格式化字符串里有个 Windows-1252 的字节，在中文/日文系统上编译时会被当成双字节序列的开头，运行时直接抛异常。

这个 bug 跟汉化没关系，是上游本来就有的，所以我给上游报了 issue，提了 PR，现在已经被上游合并了，后来那个救了我的异常记录器，我也整理成独立的 PR 提了上去。

这是我做这个项目最有成就感的部分，比翻完多少条文本都强。



---



## **二、技术说明**

### **1. 字体层**

原版 .vf 位图字体按 Windows-1252 的字节值查表，塞不下汉字。

改动集中在 gr_font.cpp，字形索引从字节值改成 Unicode 码点，加了 UTF-8 解码器，绘制、测量、字符串截断全部改成逐码点处理。

Alpine Faction 本来就有一条 TTF 渲染路径，而且已经在按 Unicode 码点查字形了，只是输入端被卡在那 256 个 Windows-1252 字节值上，所以这更像是把它已有的设计往外扩，而不是推倒重写。

字体是 Noto Sans CJK SC 的子集，只保留译文里实际用到的 1500 个码点，不是为了省体积，而是因为引擎构造字体时会把全部字形一次性栅格化进一张纹理图集，边长按 2 的幂增长。 多收几百个用不到的字，图集就可能从 4096² 顶成 8192²，游戏又是 32 位程序，扛不住这种浪费。

### **2. 断行层**

原版的 gr_split_str 只在空格处断行。中文没有空格，会被整段截断，或者直接冲出边界。

所以我替换成了符合 CJK 规则的版本，可以在两个汉字之间断句，但不会把 ，。！？ 甩到行首，也不会让 （「 落在行尾。

### **3. 字幕层**

这一层是原版和 Alpine 都没有的东西，也是这个汉化补丁的精华所在。

#### **NPC 语音字幕（364 条）**

游戏里路人 NPC 说话、广播喊话，原版一个字的字幕都没有。不是没有翻译，是游戏根本就没这个功能。

我的做法是挂到声音播放上，按 wav 文件名查表显示。并且自建了一条独立的字幕通道，不占左上角的剧情框，也不占底部的拾取提示。一开始我图省事复用了底部通道，结果广播和"拾取了弹药"互相顶掉，只好另起炉灶。

#### **即时演算过场字幕（61 条 / 7 场）**

游戏里有 8 场即时演算过场（格里芬办公室、卡佩克实验室那些）。

这些过场的音频是整场混成一个文件流式播放的，没有逐句的文件名可以查表。更麻烦的是，游戏对这些台词一个字的文本都没有提供。

所以我只能做时间轴，记下音轨开始播放的时刻，按经过的毫秒数查表出字幕， 这 61 句是逐句听写后翻译的。

顺带一提，过场播放时引擎不画 HUD，所以字幕还得从过场自己的每帧函数里再驱动一次， 这个坑让我以为是字幕没生成，白查了一轮。

### **4. 那 573 条根本没有文本的语音**

游戏自带的文本表里，有 573 条语音连英文原文都没有，训练关的 PS2 版指令、亨德里克斯的部分台词，都属于这一类。

这些是用语音识别转写后人工校对的。

还有个意外发现，游戏自带的文本有时候比语音短。比如格里芬那句，文本写的是 "You lead the way."，实际语音说的是 "You lead the way, you've got the gun."。后半句从来没有过文本，自然也没人翻译过，当然我也没翻译，我感觉无伤大雅（

### **5. MOD 兼容**

补丁的改动全部在显示层（字形查表、断行、字符串测量），没有碰网络协议、存档格式和游戏逻辑，所以理论上兼容所有 MOD。

高清材质包可以正常共存， 中文标牌包故意用 zz_ 开头命名，因为引擎是按文件名顺序加载 client_mods，后加载的覆盖先加载的，为了排在所有的 MOD 之后加载才以 zz 开头命名。



---



## **三、汉化内容**

![汉化内容](/uploads/chinesetranslationpatch/redfaction/%E6%B1%89%E5%8C%96%E5%86%85%E5%AE%B9.avif "汉化内容")

这应该是我除了很久以前做的《喋血街头2》汉化以外，汉化的最完整的游戏了。



---



## **四、已知问题**

### **1. Alpine Faction的选项里，「网格光照」的选项字不全**

引擎那处的字符串缓冲区只有 8 字节。「逐像素」的 UTF-8 编码要 9 字节，最后一个字被截断，落单的字节被当成别的字符渲染了出来。

功能本身完全正常，选项该干什么还干什么，只是显示不全。

改的话得动引擎里的缓冲区大小。为了一个纯显示问题去动内存布局，性价比太低，所以保留了。

### **2. 文字太小**

打开游戏选项 - 高级 - 界面：大号 HUD

上方游戏自带字幕框的文本，可以使用键盘的 M 键来打开日志查看。



---



## **五、安装和运行**

### **1. 准备**

需要正版《红色派系》（Steam / GOG 都行）和 Alpine Faction 1.3.0。

[gframe]red-faction||[/gframe]

本补丁不含任何原版游戏文件。

建议装补丁前先在 Steam 里验证一次游戏文件完整性，确保游戏目录是干净的。

### **2. 安装Alpine Faction**

中途会让你选择游戏路径下的 RF.exe，默认是在\steamapps\common\Red Faction\，下一步会弹出下面的窗口，点击 OK 即可。

![点击OK](/uploads/chinesetranslationpatch/redfaction/af1.avif "点击OK")

在这一步建议保持默认即可，至少建议保留第二个选项，这样可以从 Steam 来启动游戏。

![安装选项](/uploads/chinesetranslationpatch/redfaction/af2.avif "安装选项")

### **3.覆盖补丁**

关掉游戏，然后将 AlpineFaction.dll 覆盖到 **Alpine Faction 安装目录**，默认是 C:\Program Files (x86)\Alpine Faction\

![覆盖原文件](/uploads/chinesetranslationpatch/redfaction/af3.avif "覆盖原文件")

将 client_mods 和 data 文件夹 复制到游戏目录，默认是 ...\steamapps\common\Red Faction\client_mods\ ，如果提示覆盖则全部覆盖。

### **4. 启动游戏**

直接通过Steam启动，默认会打开 Alpine Faction，点击 Play 即可进入游戏，不需要任何额外设置， 菜单、字幕、物品名应该全是中文。

推荐注册一个 factionfiles 账号并关联，这样可以使用 Alpine Faction 的成就系统，游戏本身是没有 Steam 成就的。

![Alpine Faction主界面](/uploads/chinesetranslationpatch/redfaction/af4.avif "Alpine Faction主界面")

### **（可选）高清贴图**

https://www.factionfiles.com/ff.php?action=file&id=7630

下载解压后将文件复制到游戏根目录的 client_mods 即可。



---



## **六、截图**

![主菜单](/uploads/chinesetranslationpatch/redfaction/主菜单.avif "主菜单")

![开头动画的硬字幕](/uploads/chinesetranslationpatch/redfaction/开头动画的硬字幕.avif "开头动画的硬字幕")

![对话字幕1](/uploads/chinesetranslationpatch/redfaction/对话字幕1.avif "对话字幕1")

![对话字幕2](/uploads/chinesetranslationpatch/redfaction/对话字幕2.avif "对话字幕2")

![这张图展示的比较完整，上方游戏自带的字幕框，右侧汉化的贴图，下方白色我做的字幕通道，下方绿色游戏自带的拾取和武器文本通道。](/uploads/chinesetranslationpatch/redfaction/对话字幕3.avif "对话字幕3")

![日志界面](/uploads/chinesetranslationpatch/redfaction/日志界面.avif "日志界面")

![汉化的贴图1](/uploads/chinesetranslationpatch/redfaction/汉化的贴图1.avif "汉化的贴图1")

![汉化的贴图2](/uploads/chinesetranslationpatch/redfaction/汉化的贴图2.avif "汉化的贴图2")

![即时演算动画字幕](/uploads/chinesetranslationpatch/redfaction/即时演算动画字幕.avif "即时演算动画字幕")



---



## **七、下载地址**

[GitHub](https://github.com/jyh9521/Red-Faction-CN/releases)

[Google Drive](https://drive.google.com/drive/folders/1JDfhMGhs5HTHCkhHoeR22HzveU327Glu)

[百度网盘](https://pan.baidu.com/s/1SzdjlZazSV4AnQyTkLxeFQ?pwd=1658) 提取码:1658



---



## **八、许可与来源**

- AlpineFaction.dll 是 Alpine Faction 的修改版，遵循 MPL-2.0。 
- 修改后的完整源码：[网页链接​](https://www.bilibili.com/york/link-middle-page?navhide=1&rid=1233745371742601221&r_type=0&redirect_url=https%3A%2F%2Fgithub.com%2Fjyh9521%2Falpinefaction%2Ftree%2Frf-cn&spm_id_from=333.1369.0.0)   上游项目：[网页链接​](https://www.bilibili.com/york/link-middle-page?navhide=1&rid=1233745371742601221&r_type=0&redirect_url=https%3A%2F%2Fgithub.com%2FGooberRF%2Falpinefaction&spm_id_from=333.1369.0.0)
- 本补丁中的部分中文化贴图基于 **Red Faction AI Upscale Texture Pack v1** 制作。
- 原始 AI 高清化贴图由 **Captain_Dagon** 制作，其发布版本在 ModDB 标注为 **Public Domain**：https://www.moddb.com/games/red-faction/addons/red-faction-ai-upscale-textures
- 本补丁使用的是由 **Goober** 重打包、修复及改进的版本：www.factionfiles.com/ff.php?action=file&id=7630
- 本人已获得 Goober 对相关贴图进行修改及随本汉化补丁免费再分发的明确许可，感谢 Captain_Dagon 与 Goober 的工作与授权。 授权记录：
- ![Discord](/uploads/chinesetranslationpatch/redfaction/discord.avif "Discord")
- 中文字体是 Noto Sans CJK SC 的子集，遵循 SIL Open Font License 1.1，版权 © 2014-2021 Adobe。 
-  全部中文译文、语音转写、构建工具采用 CC BY-SA 4.0，欢迎拿去做繁体版或其他语言，请保留署名并同样开放。 
-  《红色派系》版权归 Volition 及 THQ Nordic 所有，本项目与两者无任何隶属关系。
