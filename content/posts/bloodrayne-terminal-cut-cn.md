---
aliases:
  - /posts/bloodrayne-terminal-cut-cn-patch/
title: 《吸血莱恩：终极剪辑版》简体中文汉化补丁
date: 2026-07-30
description: |-
  > BloodRayne: Terminal Cut Simplified Chinese Patch
  > 《吸血莱恩：终极剪辑版》简体中文汉化补丁
cover: /uploads/chinesetranslationpatch/bloodrayne/cover.avif
tags:
  - 汉化补丁
  - 吸血莱恩
  - 游戏
pinned: false
gameSlug: bloodrayne-terminal-cut
---

## 一、项目背景

《BloodRayne》是 Terminal Reality 在 2002 年推出的第三人称动作游戏，不过这次汉化的是 Steam 版《BloodRayne: Terminal Cut》，也就是官方后来推出的现代系统修复版。
相比老版，此版本可以很好地支持现代 Windows 系统，也支持宽屏和更高分辨率，但它依然没有官方简体中文。
不过后来官方更新了日语支持，通过日语入口，游戏也能很好地支持双字节显示，汉化难度非常低，文本也不多，所以就做了个汉化，测试倒是测了好久……
我已经使用英文文本+英语语音完整通关测试过，但是日文版没有，所以我建议还是玩英文文本+英语语音。
首先肯定是因为我完整测试过了。
其次，英文文本和日文文本原文在台词节奏、人物语气、表达细节上不一样，而且英文文本说话人前面有名字，日文文本没有。



---



## 二、技术说明 + MOD支持

其实没什么好说的，毕竟原生支持双字节，所以翻译文本，导入之后，重新做个位图字库就行了（
理论上是兼容所有原版 MOD 的，下面的截图我也是用了N网的高清贴图材质 + 面部修复游玩并且截图的。
具体的 MOD 请自行去N网转区翻阅。



---



## 三、已知问题

### 1. 目标名单界面底部的人名和部分德语军衔仍可能显示英文 / 德文

普通任务文本、目标完成提示、人物对白都已经汉化，但目标名单界面底部显示的人名和部分德语军衔，疑似由 rayne1.exe 硬编码或专用逻辑绘制，但是因为完全不影响任何流程，所以懒得改exe了（避免引入其他bug（

### 2. 视频字幕需要额外硬字幕视频包

游戏没有可用的 BIK 字幕系统，所以视频字幕只能做硬字幕。
如果你只安装这个汉化包，不额外覆盖带字幕的 BIK 视频，那么原版视频不会自动显示中文字幕。
有需要的话，请自行下载“硬字幕视频.7z”，解压并覆盖到游戏的 video 文件夹内。
工具里的“视频字幕：基于英文 / 基于日文”只是为了配合硬字幕视频包切换，不是外挂字幕开关。

### 3. 高清贴图可能导致内存不足

如果装了高清贴图包，读取某些关卡时可能遇到：
STextureEntry::loadOptimized - Out of memory
这不是中文文本本身导致的，而是 32 位游戏加载大贴图时撞上内存上限。
请在附带工具的“游戏修复”页启用 4GB / LAA 补丁。
启用后会改善很多，我实测通关是没问题，但也没法保证所有高清贴图组合都绝对不会爆内存。

### 4. 高 DPI 下鼠标左右键可能失效

如果你的 Windows 显示缩放不是 100%，游戏中可能出现鼠标左键、右键都不工作的问题。
键盘攻击键正常，但鼠标攻击无效。
打开附带的工具，在“游戏修复”页启用高 DPI 鼠标修复。
这个修复写入的是当前用户的 Windows 兼容性设置，不会修改游戏 exe。

### 5. 个别字幕行太长可能导致卡住或闪退

这个游戏的语音字幕系统对单行长度很敏感，我在测试中确认过，某些行即使能显示出来，也可能在字幕结束后卡住，最后导致闪退。
目前通关测试中遇到的已知问题都已经处理。
但如果还有漏网之鱼导致闪退，请使用附带的工具自助修改文本（



---



## 四、截图

![启动界面](/uploads/chinesetranslationpatch/bloodrayne/%E5%90%AF%E5%8A%A8%E7%95%8C%E9%9D%A2.png "启动界面")

![主菜单](/uploads/chinesetranslationpatch/bloodrayne/%E4%B8%BB%E8%8F%9C%E5%8D%95.png "主菜单")

![开场动画的硬字幕](/uploads/chinesetranslationpatch/bloodrayne/%E5%BC%80%E5%9C%BA%E5%8A%A8%E7%94%BB%E7%9A%84%E7%A1%AC%E5%AD%97%E5%B9%95.png "开场动画的硬字幕")

![按键说明](/uploads/chinesetranslationpatch/bloodrayne/%E6%8C%89%E9%94%AE%E8%AF%B4%E6%98%8E.png "按键说明")

![剧情动画1](/uploads/chinesetranslationpatch/bloodrayne/%E5%89%A7%E6%83%85%E5%8A%A8%E7%94%BB1.png "剧情动画1")

![剧情动画2](/uploads/chinesetranslationpatch/bloodrayne/%E5%89%A7%E6%83%85%E5%8A%A8%E7%94%BB2.png "剧情动画2")

![残留的英文 / 德文](/uploads/chinesetranslationpatch/bloodrayne/%E6%AE%8B%E7%95%99%E7%9A%84%E8%8B%B1%E6%96%87%20%E5%BE%B7%E6%96%87.png "残留的英文 / 德文")



---



## 五、安装和运行

### 1. 准备游戏

需要 Steam 版：
[sframe]bloodrayne-terminal-cut|吸血莱恩：终极剪辑版|[/sframe]
建议安装补丁前先在 Steam 里验证一次游戏文件完整性，确保游戏目录是干净的。

### 2. 覆盖汉化包

把汉化包内所有文件复制到游戏根目录，出现同名文件时选择覆盖。
游戏目录一般是：
`C:\Program Files (x86)\Steam\steamapps\common\BloodRayne Terminal Cut`

### 3. 启动游戏

直接启动游戏，选择Japanese即可。 默认就是基于英文文本的简体中文版本。



---



## 六、小工具说明

为了汉化方便，依旧是做了个小工具，随着补丁一起放出。
附带的工具叫：
`BloodRayneCNTool.exe`
功能比较多，简单说一下。

### 1. 切换

![切换](/uploads/chinesetranslationpatch/bloodrayne/%E5%88%87%E6%8D%A2.avif "切换")

毕竟汉化占用了日语的槽位，避免有些玩家想听日语语音，所以干脆做了个切换的功能。
可以分别选择：
文本：

- 基于英文
- 基于日文
语音：
- 英文语音
- 日文语音
视频字幕：
- 基于英文
- 基于日文
点“应用切换”后生效。
根目录默认是基于英文文本。 如果你不知道怎么选，保持默认即可。

### 2. 文本编辑

![文本编辑](/uploads/chinesetranslationpatch/bloodrayne/%E6%96%87%E6%9C%AC%E7%BC%96%E8%BE%91.avif "文本编辑")

如果你觉得某句翻译不顺眼，或者发现漏翻、换行不舒服、闪退的文本之类的，可以直接在工具里改。
功能包括：

- 下拉框选择英文文本 / 日文文本；
- 搜索框支持按 ID、原文、中文译文搜索；
- 表格里可以直接改中文列；
- 也可以选中一行，在下面的大编辑框里修改；
- 大编辑框里显示真正的换行，不用手动对着 \n 改；
- 改过的行会高亮；
- 可以勾选“只看改过的”复查；
- 点击“保存译文”写回 TSV；
- 点击“导入游戏”重新生成并写入游戏。

#### **注意：**

- 不要删除或修改 %1!s!、%2!d! 这类占位符；
- @@xxx@@ 这类是游戏按钮名通配符，也不要乱动；
- 工具会检测占位符和字幕单行长度，明显危险的文本会阻止保存；
- 导入前会自动备份当前 JAPANESE.POD；
- 导入后会重新打开产物，逐条反读校验，失败则不覆盖游戏目录。

### 3. 游戏字体

![游戏字体](/uploads/chinesetranslationpatch/bloodrayne/%E6%B8%B8%E6%88%8F%E5%AD%97%E4%BD%93.avif "游戏字体")

可以更换游戏的字体。

工具支持：

- 扫描系统已安装字体；
- 手动选择字体文件；
- 支持 .ttf / .otf / .ttc；
- 自动检查当前游戏用到的全部汉字；
- 缺字会用红字提示，并显示缺字示例；
- 不缺字才允许应用；
- 可以恢复默认字体。

#### 注意： 

如果使用微软雅黑之类系统字体生成产物，请只自己使用，不要拿去公开分发。
正式补丁默认字体使用可再分发的开源字体路线。

### 4. 游戏修复

![游戏修复](/uploads/chinesetranslationpatch/bloodrayne/%E6%B8%B8%E6%88%8F%E4%BF%AE%E5%A4%8D.avif "游戏修复")

这里有两个功能：

#### 高 DPI 鼠标修复： 

解决高 DPI 缩放下鼠标左右键不工作的问题。

#### 4GB / LAA 补丁：

 给 rayne1.exe 开启 Large Address Aware。 首次启用前会备份原版 exe，可以一键恢复。



---



## 七、卸载方法

最简单的方法：
在 Steam 里对游戏执行“验证游戏文件完整性”。
这样会恢复被覆盖的游戏文件。

如果只想撤销工具里的修复：

- 高 DPI 鼠标修复：工具里点恢复；
- 4GB / LAA 补丁：工具里点恢复原版 exe；
- 字体：工具里点恢复默认字体。



---



## 八、下载地址

[GitHub](https://github.com/jyh9521/BloodRayne-CN/releases)

[Google Drive](https://drive.google.com/drive/folders/1FpmyZvV-k7htEoqOBngdFk05sHvxpyRA?usp=sharing)

[百度网盘](https://pan.baidu.com/s/1y_qW8251118PmGrfHLCmZw?pwd=vncg) 提取码: vncg
