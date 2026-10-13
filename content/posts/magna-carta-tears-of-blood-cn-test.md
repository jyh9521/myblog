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

[测试版游戏镜像下载](https://pan.baidu.com/s/1vzc5UsJXZuQV7wWRqK1h7Q?pwd=blfy)

[高清材质包下载](https://pan.baidu.com/s/1eQNvKb7EV_LGcOLNS5ddFg?pwd=blfy)



---



## 高清材质使用方法：

![图1](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/1.png)

![图2](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/2.png)

1. 打开 **设置 → 图形 → 纹理替换**。
2. 勾选 **加载纹理**。
3. 查看图1红线标出的 **搜索目录**，点击“打开…”进入该目录，将材质包内的 `SCKA-20043` 文件夹放进去。截图示例目录是 `C:\Users\noway\Downloads\Magna-Carta-Tears-Of-Blood-CN\pcsx2\textures`，这是我的本机路径，**不需要照抄**。以你的 PCSX2 实际配置为准。
4. 最终纹理文件应位于 `<纹理搜索目录>/SCKA-20043/replacements/` 下。**搜索目录本身应指向 `textures` 这一层，不要选到 `SCKA-20043` 或 `replacements`，也不要多套一层压缩包文件夹。** 图2只展示了 `SCKA-20043` 这一层，解压后还需检查内部的 `replacements` 和纹理文件。
5. 重新启动游戏，对照同一场景检查纹理是否替换。若使用游戏单独设置，请确认 **右键游戏 → 属性 → 图形 → 纹理替换** 没有覆盖全局的加载选项。汉化字形是否被材质包覆盖、材质包是否完整兼容韩版汉化，仍需实际运行核查。



---



## 宽屏补丁使用方法：

![右键游戏 - 属性](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/87a35a24-a054-4a15-a16f-b13a73c25289.png)

![补丁界面](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-160002.png)

![设置宽高比](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-160035.png)

1. 打开 PCSX2，在游戏列表中找到《真名法典：真红的圣痕》。
2. 右键游戏，选择 属性。
3. 找到 补丁 页面。
4. 勾选 `Widescreen 16:9` 右侧的 **开启**。本文截图显示的是韩版条目（作者 ElHecht，NTSC-K 移植 Arapapa）。
5. 在 **属性 → 图形 → 显示 → 高宽比** 中选择 **宽屏（16:9）**。第三张截图来自全局设置，也可以在全局设置中调整，但会影响其他游戏；单独设置优先。
6. 重新启动游戏，对照 4:3 画面检查视野和人物比例。单独设置 16:9 只会改变画面显示比例，不能证明宽屏补丁已生效。菜单、字幕、过场动画和画面边缘是否异常需要实测。

截图中的全局“应用宽屏补丁”未勾选，而游戏属性中的具名补丁已开启。请以该游戏的补丁条目为准，不要为同一效果再叠加其他来源的宽屏代码。当前 PCSX2 的内置补丁与金手指分开管理，旧教程的 `cheats_ws` 路径不适用于此处操作。



---



## 金手指（实验性）

### 1. 打开游戏的金手指编辑器

在 PCSX2 中启动咱们的韩版游戏，然后选择：

**工具 → 编辑作弊**

![工具 - 编辑作弊](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ_1791702933578.png)

### 2. 选择文本编辑器

如果没有文件，PCSX2 会提示你创建，创建以后会弹出选择软件的界面，这里选择你用的文本编辑器即可，比如我本人用 Notepad3，选择以后确认即可。

![选择文本编辑器](/uploads/chinesetranslationpatch/magna-carta-tears-of-blood/QQ20261011-161604.png)

### 3. 粘贴代码并保存

将下面内容粘贴进去：

```plain
gametitle=Magna Carta - Tears of Blood NTSC-K (SCKA-20043)

[60帧]
author=Gabominated (NTSC-U original)
description=解锁60帧。帧率不足时可尝试提高模拟器主处理器时钟。
// 001C69E4: slti at,v0,2 -> slti at,v0,1

// Gameplay ports: static verified; runtime pending.
// Upstream: root670/CheatDevicePS2/CheatDatabase.txt (GPL-3.0).
// Select ONE money-spend mode and ONE item mode at a time.
// JP reference: https://xterminatorex.seesaa.net/category/6006620-2.html
// Disable item modes before equipment changes (JP hang report; KR not tested).

patch=1,EE,E0010001,extended,000C3FE0
patch=1,EE,201C69E4,extended,28410001
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,201C69E4,extended,28410002

[快捷键提示：SELECT＋上开启作弊，SELECT＋下关闭作弊]
description=仅为操作说明，勾选本行没有任何效果。

[消费（下方最多启用1项）\关闭]
description=关闭本组修改：先取消同组其他项，再勾选关闭。仅恢复本组原指令，不恢复已改变的金钱、数量或HP数值。
patch=1,EE,003A06F0,word,14200004
patch=1,EE,003A06F8,word,00451023
patch=1,EE,003A0700,word,AC620000

[消费（下方最多启用1项）\不扣钱]
description=消费时不扣除金钱，但仍需满足原本的余额要求。
// spend_no_decrease; original AC620000; intUMrtsPartyDataexecSpendMoney

patch=1,EE,E0010001,extended,000C3FE0
patch=1,EE,203A0700,extended,00000000
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,203A0700,extended,AC620000

[消费（下方最多启用1项）\反加钱]
description=消费金额改为增加金钱，仍需满足原本的余额要求。
// spend_increase; original 00451023; intUMrtsPartyDataexecSpendMoney

patch=1,EE,E0010001,extended,000C3FE0
patch=1,EE,203A06F8,extended,00451021
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,203A06F8,extended,00451023

[消费（下方最多启用1项）\钱不够也能消费]
description=余额不足时也可消费，并保留现有金钱。
// spend_free; original 14200004; intUMrtsPartyDataexecSpendMoney

patch=1,EE,E0010001,extended,000C3FE0
patch=1,EE,203A06F0,extended,10000005
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,203A06F0,extended,14200004

[金钱获取（可独立启用）\获得金钱时余额变为1000000]
description=获得金钱时设为1000000；商店交易与战斗结算的触发场景待实测。无法由【消费反加钱】触发。
// gain_max_money; original 14200003; intUMrtsPartyDataexecMakeMoney
patch=1,EE,E0010001,extended,000C3FE0
patch=1,EE,203A0E78,extended,00000000
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,203A0E78,extended,14200003

[物品数量不减少（包括出售）]
description=移除或使用物品时保留原数量。
// item_no_decrease; original AC620004; intUMrtsPartyDataexecRemoveItem

patch=1,EE,E0010001,extended,000C3FE0
patch=1,EE,2039FBB0,extended,00000000
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,2039FBB0,extended,AC620004

[战斗生命值（下方最多启用1项）\关闭]
description=关闭本组修改：先取消同组其他项，再勾选关闭。仅恢复本组原指令，不恢复已改变的金钱、数量或HP数值。
patch=1,EE,00399190,word,27BDFFF0
patch=1,EE,00399194,word,FFBF0000

[战斗生命值（下方最多启用1项）\我方HP恢复9999（查询时）]
description=查询生命值时，将存活我方角色的最大及当前生命值设为9999，不复活已阵亡角色。

patch=1,EE,E0370001,extended,000C3FE0
patch=1,EE,200C1000,extended,27BDFFA0
patch=1,EE,200C1004,extended,7FA10000
patch=1,EE,200C1008,extended,7FA20010
patch=1,EE,200C100C,extended,7FA30020
patch=1,EE,200C1010,extended,7FA80030
patch=1,EE,200C1014,extended,7FA90040
patch=1,EE,200C1018,extended,7FAA0050
patch=1,EE,200C101C,extended,8F88B2CC
patch=1,EE,200C1020,extended,11000021
patch=1,EE,200C1024,extended,00000000
patch=1,EE,200C1028,extended,8C890024
patch=1,EE,200C102C,extended,11280006
patch=1,EE,200C1030,extended,00000000
patch=1,EE,200C1034,extended,1120001C
patch=1,EE,200C1038,extended,00000000
patch=1,EE,200C103C,extended,8D290028
patch=1,EE,200C1040,extended,1000FFFA
patch=1,EE,200C1044,extended,00000000
patch=1,EE,200C1048,extended,9088039C
patch=1,EE,200C104C,extended,11000006
patch=1,EE,200C1050,extended,00000000
patch=1,EE,200C1054,extended,240A0005
patch=1,EE,200C1058,extended,110A0011
patch=1,EE,200C105C,extended,00000000
patch=1,EE,200C1060,extended,10000011
patch=1,EE,200C1064,extended,00000000
patch=1,EE,200C1068,extended,8C89020C
patch=1,EE,200C106C,extended,1120000E
patch=1,EE,200C1070,extended,00000000
patch=1,EE,200C1074,extended,8D290060
patch=1,EE,200C1078,extended,1120000B
patch=1,EE,200C107C,extended,00000000
patch=1,EE,200C1080,extended,8D2A00AC
patch=1,EE,200C1084,extended,19400008
patch=1,EE,200C1088,extended,00000000
patch=1,EE,200C108C,extended,240A270F
patch=1,EE,200C1090,extended,AD2A0034
patch=1,EE,200C1094,extended,AD2A00AC
patch=1,EE,200C1098,extended,10000003
patch=1,EE,200C109C,extended,00000000
patch=1,EE,200C10A0,extended,10000001
patch=1,EE,200C10A4,extended,00000000
patch=1,EE,200C10A8,extended,7BA10000
patch=1,EE,200C10AC,extended,7BA20010
patch=1,EE,200C10B0,extended,7BA30020
patch=1,EE,200C10B4,extended,7BA80030
patch=1,EE,200C10B8,extended,7BA90040
patch=1,EE,200C10BC,extended,7BAA0050
patch=1,EE,200C10C0,extended,27BD0060
patch=1,EE,200C10C4,extended,27BDFFF0
patch=1,EE,200C10C8,extended,FFBF0000
patch=1,EE,200C10CC,extended,080E6466
patch=1,EE,200C10D0,extended,00000000
patch=1,EE,20399190,extended,08030400
patch=1,EE,20399194,extended,00000000
patch=1,EE,E0020000,extended,000C3FE0
patch=1,EE,20399190,extended,27BDFFF0
patch=1,EE,20399194,extended,FFBF0000

[战斗生命值（下方最多启用1项）\敌人HP降至1（查询时）]
description=查询生命值时，将存活敌人的当前生命值降至1，不修改最大生命值或复活已死亡敌人。

patch=1,EE,E0360001,extended,000C3FE0
patch=1,EE,200C1000,extended,27BDFFA0
patch=1,EE,200C1004,extended,7FA10000
patch=1,EE,200C1008,extended,7FA20010
patch=1,EE,200C100C,extended,7FA30020
patch=1,EE,200C1010,extended,7FA80030
patch=1,EE,200C1014,extended,7FA90040
patch=1,EE,200C1018,extended,7FAA0050
patch=1,EE,200C101C,extended,8F88B2CC
patch=1,EE,200C1020,extended,11000020
patch=1,EE,200C1024,extended,00000000
patch=1,EE,200C1028,extended,8C890024
patch=1,EE,200C102C,extended,11280006
patch=1,EE,200C1030,extended,00000000
patch=1,EE,200C1034,extended,1120001B
patch=1,EE,200C1038,extended,00000000
patch=1,EE,200C103C,extended,8D290028
patch=1,EE,200C1040,extended,1000FFFA
patch=1,EE,200C1044,extended,00000000
patch=1,EE,200C1048,extended,9088039C
patch=1,EE,200C104C,extended,11000006
patch=1,EE,200C1050,extended,00000000
patch=1,EE,200C1054,extended,240A0005
patch=1,EE,200C1058,extended,110A0005
patch=1,EE,200C105C,extended,00000000
patch=1,EE,200C1060,extended,10000010
patch=1,EE,200C1064,extended,00000000
patch=1,EE,200C1068,extended,1000000E
patch=1,EE,200C106C,extended,00000000
patch=1,EE,200C1070,extended,8C89020C
patch=1,EE,200C1074,extended,1120000B
patch=1,EE,200C1078,extended,00000000
patch=1,EE,200C107C,extended,8D290060
patch=1,EE,200C1080,extended,11200008
patch=1,EE,200C1084,extended,00000000
patch=1,EE,200C1088,extended,8D2A00AC
patch=1,EE,200C108C,extended,19400005
patch=1,EE,200C1090,extended,00000000
patch=1,EE,200C1094,extended,240A0001
patch=1,EE,200C1098,extended,AD2A00AC
patch=1,EE,200C109C,extended,10000001
patch=1,EE,200C10A0,extended,00000000
patch=1,EE,200C10A4,extended,7BA10000
patch=1,EE,200C10A8,extended,7BA20010
patch=1,EE,200C10AC,extended,7BA30020
patch=1,EE,200C10B0,extended,7BA80030
patch=1,EE,200C10B4,extended,7BA90040
patch=1,EE,200C10B8,extended,7BAA0050
patch=1,EE,200C10BC,extended,27BD0060
patch=1,EE,200C10C0,extended,27BDFFF0
patch=1,EE,200C10C4,extended,FFBF0000
patch=1,EE,200C10C8,extended,080E6466
patch=1,EE,200C10CC,extended,00000000
patch=1,EE,20399190,extended,08030400
patch=1,EE,20399194,extended,00000000
patch=1,EE,E0020000,extended,000C3FE0
patch=1,EE,20399190,extended,27BDFFF0
patch=1,EE,20399194,extended,FFBF0000

[战斗生命值（下方最多启用1项）\我方恢复9999＋敌人HP1]
description=查询生命值时，我方存活角色恢复到9999，存活敌人降至1。

patch=1,EE,E0420001,extended,000C3FE0
patch=1,EE,200C1000,extended,27BDFFA0
patch=1,EE,200C1004,extended,7FA10000
patch=1,EE,200C1008,extended,7FA20010
patch=1,EE,200C100C,extended,7FA30020
patch=1,EE,200C1010,extended,7FA80030
patch=1,EE,200C1014,extended,7FA90040
patch=1,EE,200C1018,extended,7FAA0050
patch=1,EE,200C101C,extended,8F88B2CC
patch=1,EE,200C1020,extended,1100002C
patch=1,EE,200C1024,extended,00000000
patch=1,EE,200C1028,extended,8C890024
patch=1,EE,200C102C,extended,11280006
patch=1,EE,200C1030,extended,00000000
patch=1,EE,200C1034,extended,11200027
patch=1,EE,200C1038,extended,00000000
patch=1,EE,200C103C,extended,8D290028
patch=1,EE,200C1040,extended,1000FFFA
patch=1,EE,200C1044,extended,00000000
patch=1,EE,200C1048,extended,9088039C
patch=1,EE,200C104C,extended,11000006
patch=1,EE,200C1050,extended,00000000
patch=1,EE,200C1054,extended,240A0005
patch=1,EE,200C1058,extended,110A0011
patch=1,EE,200C105C,extended,00000000
patch=1,EE,200C1060,extended,1000001C
patch=1,EE,200C1064,extended,00000000
patch=1,EE,200C1068,extended,8C89020C
patch=1,EE,200C106C,extended,11200019
patch=1,EE,200C1070,extended,00000000
patch=1,EE,200C1074,extended,8D290060
patch=1,EE,200C1078,extended,11200016
patch=1,EE,200C107C,extended,00000000
patch=1,EE,200C1080,extended,8D2A00AC
patch=1,EE,200C1084,extended,19400013
patch=1,EE,200C1088,extended,00000000
patch=1,EE,200C108C,extended,240A270F
patch=1,EE,200C1090,extended,AD2A0034
patch=1,EE,200C1094,extended,AD2A00AC
patch=1,EE,200C1098,extended,1000000E
patch=1,EE,200C109C,extended,00000000
patch=1,EE,200C10A0,extended,8C89020C
patch=1,EE,200C10A4,extended,1120000B
patch=1,EE,200C10A8,extended,00000000
patch=1,EE,200C10AC,extended,8D290060
patch=1,EE,200C10B0,extended,11200008
patch=1,EE,200C10B4,extended,00000000
patch=1,EE,200C10B8,extended,8D2A00AC
patch=1,EE,200C10BC,extended,19400005
patch=1,EE,200C10C0,extended,00000000
patch=1,EE,200C10C4,extended,240A0001
patch=1,EE,200C10C8,extended,AD2A00AC
patch=1,EE,200C10CC,extended,10000001
patch=1,EE,200C10D0,extended,00000000
patch=1,EE,200C10D4,extended,7BA10000
patch=1,EE,200C10D8,extended,7BA20010
patch=1,EE,200C10DC,extended,7BA30020
patch=1,EE,200C10E0,extended,7BA80030
patch=1,EE,200C10E4,extended,7BA90040
patch=1,EE,200C10E8,extended,7BAA0050
patch=1,EE,200C10EC,extended,27BD0060
patch=1,EE,200C10F0,extended,27BDFFF0
patch=1,EE,200C10F4,extended,FFBF0000
patch=1,EE,200C10F8,extended,080E6466
patch=1,EE,200C10FC,extended,00000000
patch=1,EE,20399190,extended,08030400
patch=1,EE,20399194,extended,00000000
patch=1,EE,E0020000,extended,000C3FE0
patch=1,EE,20399190,extended,27BDFFF0
patch=1,EE,20399194,extended,FFBF0000

[战斗其他（可独立启用）\我方统率力100（查询时）]
description=查询我方统率力时，将统率力数值设为100。可与1种生命值模式配合。
patch=1,EE,E0050001,extended,000C3FE0
patch=1,EE,200C2000,extended,3C0142C8
patch=1,EE,200C2004,extended,AC810028
patch=1,EE,200C2008,extended,081060FC
patch=1,EE,200C200C,extended,00000000
patch=1,EE,203FD758,extended,0C030800
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,203FD758,extended,0C1060FC

[内部控制（请勿手动选择或取消）\快捷键控制（已自动启用，请保持勾选）]
description=【【【请勿取消勾选】】】内部必需控制代码，已自动启用。包含64条开关初始化、原始手柄读取和状态维护代码。取消后快捷键开关金手指功能将失效。
patch=0,EE,000C3FE0,word,00000000
patch=1,EE,000C3000,word,27BDFF60
patch=1,EE,000C3004,word,7FA40000
patch=1,EE,000C3008,word,7FA50010
patch=1,EE,000C300C,word,7FA60020
patch=1,EE,000C3010,word,FFBF0030
patch=1,EE,000C3014,word,0C048200
patch=1,EE,000C3018,word,00000000
patch=1,EE,000C301C,word,7FA80040
patch=1,EE,000C3020,word,7FA90050
patch=1,EE,000C3024,word,7FAA0060
patch=1,EE,000C3028,word,7FAB0070
patch=1,EE,000C302C,word,8FA80000
patch=1,EE,000C3030,word,1500002A
patch=1,EE,000C3034,word,00000000
patch=1,EE,000C3038,word,8FA80010
patch=1,EE,000C303C,word,15000027
patch=1,EE,000C3040,word,00000000
patch=1,EE,000C3044,word,3C0B000C
patch=1,EE,000C3048,word,356B3FE0
patch=1,EE,000C304C,word,18400022
patch=1,EE,000C3050,word,00000000
patch=1,EE,000C3054,word,8FAA0020
patch=1,EE,000C3058,word,91480000
patch=1,EE,000C305C,word,1500001E
patch=1,EE,000C3060,word,00000000
patch=1,EE,000C3064,word,91480001
patch=1,EE,000C3068,word,24090041
patch=1,EE,000C306C,word,11090009
patch=1,EE,000C3070,word,00000000
patch=1,EE,000C3074,word,24090073
patch=1,EE,000C3078,word,11090006
patch=1,EE,000C307C,word,00000000
patch=1,EE,000C3080,word,24090079
patch=1,EE,000C3084,word,11090003
patch=1,EE,000C3088,word,00000000
patch=1,EE,000C308C,word,10000012
patch=1,EE,000C3090,word,00000000
patch=1,EE,000C3094,word,91480002
patch=1,EE,000C3098,word,91490003
patch=1,EE,000C309C,word,00094A00
patch=1,EE,000C30A0,word,01094025
patch=1,EE,000C30A4,word,3908FFFF
patch=1,EE,000C30A8,word,31090041
patch=1,EE,000C30AC,word,240A0041
patch=1,EE,000C30B0,word,112A0009
patch=1,EE,000C30B4,word,00000000
patch=1,EE,000C30B8,word,31090011
patch=1,EE,000C30BC,word,240A0011
patch=1,EE,000C30C0,word,152A0006
patch=1,EE,000C30C4,word,00000000
patch=1,EE,000C30C8,word,24080001
patch=1,EE,000C30CC,word,AD680000
patch=1,EE,000C30D0,word,10000002
patch=1,EE,000C30D4,word,00000000
patch=1,EE,000C30D8,word,AD600000
patch=1,EE,000C30DC,word,7BA80040
patch=1,EE,000C30E0,word,7BA90050
patch=1,EE,000C30E4,word,7BAA0060
patch=1,EE,000C30E8,word,7BAB0070
patch=1,EE,000C30EC,word,DFBF0030
patch=1,EE,000C30F0,word,03E00008
patch=1,EE,000C30F4,word,27BD00A0
patch=1,EE,0017C738,word,0C030C00


[隐身：跳过怪物发现玩家（实验）]
description=不隐藏模型、不禁用玩家主动攻击，不影响剧情强制战斗。冷启动复测。
patch=1,EE,E0040001,extended,000C3FE0
patch=1,EE,203F72C0,extended,1000002C
patch=1,EE,203F72C4,extended,00000000
patch=1,EE,203F746C,extended,10000054
patch=1,EE,203F7470,extended,00000000
patch=1,EE,E0040000,extended,000C3FE0
patch=1,EE,203F72C0,extended,8E240268
patch=1,EE,203F72C4,extended,8C830220
patch=1,EE,203F746C,extended,8C900268
patch=1,EE,203F7470,extended,8F868258

[战斗速度（最多选1项）\2倍（实验）]
description=当前模式2时将原生速度系数乘2；离开战斗按所有权恢复。可能加速判定与动画，非60帧补丁。冷启动切换。SELECT＋上开启，SELECT＋下关闭；初始关闭。
patch=0,EE,000C43F0,word,00000000
patch=0,EE,000C43F4,word,00000000
patch=0,EE,000C43F8,word,00000000
patch=1,EE,000C4000,word,27BDFFA0
patch=1,EE,000C4004,word,7FA80000
patch=1,EE,000C4008,word,7FA90010
patch=1,EE,000C400C,word,7FAA0020
patch=1,EE,000C4010,word,7FAB0030
patch=1,EE,000C4014,word,7FAC0040
patch=1,EE,000C4018,word,7FAD0050
patch=1,EE,000C401C,word,3C08000C
patch=1,EE,000C4020,word,350843F0
patch=1,EE,000C4024,word,8E290078
patch=1,EE,000C4028,word,3C0B0010
patch=1,EE,000C402C,word,012B582B
patch=1,EE,000C4030,word,15600043
patch=1,EE,000C4034,word,00000000
patch=1,EE,000C4038,word,3C0B0200
patch=1,EE,000C403C,word,012B582B
patch=1,EE,000C4040,word,1160003F
patch=1,EE,000C4044,word,00000000
patch=1,EE,000C4048,word,312B0003
patch=1,EE,000C404C,word,1560003C
patch=1,EE,000C4050,word,00000000
patch=1,EE,000C4054,word,922A024B
patch=1,EE,000C4058,word,240D0002
patch=1,EE,000C405C,word,8D0B0000
patch=1,EE,000C4060,word,112B000D
patch=1,EE,000C4064,word,00000000
patch=1,EE,000C4068,word,AD000000
patch=1,EE,000C406C,word,3C0B000C
patch=1,EE,000C4070,word,356B3FE0
patch=1,EE,000C4074,word,8D6B0000
patch=1,EE,000C4078,word,240C0001
patch=1,EE,000C407C,word,156C0030
patch=1,EE,000C4080,word,00000000
patch=1,EE,000C4084,word,154D002E
patch=1,EE,000C4088,word,00000000
patch=1,EE,000C408C,word,8D2C023C
patch=1,EE,000C4090,word,1000001A
patch=1,EE,000C4094,word,00000000
patch=1,EE,000C4098,word,8D2B023C
patch=1,EE,000C409C,word,8D0C0004
patch=1,EE,000C40A0,word,8D0D0008
patch=1,EE,000C40A4,word,3C0A000C
patch=1,EE,000C40A8,word,354A3FE0
patch=1,EE,000C40AC,word,8D4A0000
patch=1,EE,000C40B0,word,24090001
patch=1,EE,000C40B4,word,1549000B
patch=1,EE,000C40B8,word,00000000
patch=1,EE,000C40BC,word,240A0002
patch=1,EE,000C40C0,word,9229024B
patch=1,EE,000C40C4,word,152A0007
patch=1,EE,000C40C8,word,00000000
patch=1,EE,000C40CC,word,8E290078
patch=1,EE,000C40D0,word,116D000A
patch=1,EE,000C40D4,word,00000000
patch=1,EE,000C40D8,word,0160602D
patch=1,EE,000C40DC,word,10000007
patch=1,EE,000C40E0,word,00000000
patch=1,EE,000C40E4,word,8E290078
patch=1,EE,000C40E8,word,156D0014
patch=1,EE,000C40EC,word,00000000
patch=1,EE,000C40F0,word,AD2C023C
patch=1,EE,000C40F4,word,10000011
patch=1,EE,000C40F8,word,00000000
patch=1,EE,000C40FC,word,3C0B3D80
patch=1,EE,000C4100,word,018B582B
patch=1,EE,000C4104,word,1560000D
patch=1,EE,000C4108,word,00000000
patch=1,EE,000C410C,word,3C0B4080
patch=1,EE,000C4110,word,016C582B
patch=1,EE,000C4114,word,15600009
patch=1,EE,000C4118,word,00000000
patch=1,EE,000C411C,word,3C0D0080
patch=1,EE,000C4120,word,018D6821
patch=1,EE,000C4124,word,AD2D023C
patch=1,EE,000C4128,word,AD090000
patch=1,EE,000C412C,word,AD0C0004
patch=1,EE,000C4130,word,AD0D0008
patch=1,EE,000C4134,word,10000002
patch=1,EE,000C4138,word,00000000
patch=1,EE,000C413C,word,AD000000
patch=1,EE,000C4140,word,7BA80000
patch=1,EE,000C4144,word,7BA90010
patch=1,EE,000C4148,word,7BAA0020
patch=1,EE,000C414C,word,7BAB0030
patch=1,EE,000C4150,word,7BAC0040
patch=1,EE,000C4154,word,7BAD0050
patch=1,EE,000C4158,word,27BD0060
patch=1,EE,000C415C,word,8E220220
patch=1,EE,000C4160,word,C7A0003C
patch=1,EE,000C4164,word,080FF884
patch=1,EE,000C4168,word,00000000
patch=1,EE,003FE208,word,08031000
patch=1,EE,003FE20C,word,00000000

[战斗速度（最多选1项）\4倍（实验）]
description=当前模式2时将原生速度系数乘4；离开战斗按所有权恢复。可能加速判定与动画，非60帧补丁。
patch=0,EE,000C43F0,word,00000000
patch=0,EE,000C43F4,word,00000000
patch=0,EE,000C43F8,word,00000000
patch=1,EE,000C4000,word,27BDFFA0
patch=1,EE,000C4004,word,7FA80000
patch=1,EE,000C4008,word,7FA90010
patch=1,EE,000C400C,word,7FAA0020
patch=1,EE,000C4010,word,7FAB0030
patch=1,EE,000C4014,word,7FAC0040
patch=1,EE,000C4018,word,7FAD0050
patch=1,EE,000C401C,word,3C08000C
patch=1,EE,000C4020,word,350843F0
patch=1,EE,000C4024,word,8E290078
patch=1,EE,000C4028,word,3C0B0010
patch=1,EE,000C402C,word,012B582B
patch=1,EE,000C4030,word,15600043
patch=1,EE,000C4034,word,00000000
patch=1,EE,000C4038,word,3C0B0200
patch=1,EE,000C403C,word,012B582B
patch=1,EE,000C4040,word,1160003F
patch=1,EE,000C4044,word,00000000
patch=1,EE,000C4048,word,312B0003
patch=1,EE,000C404C,word,1560003C
patch=1,EE,000C4050,word,00000000
patch=1,EE,000C4054,word,922A024B
patch=1,EE,000C4058,word,240D0002
patch=1,EE,000C405C,word,8D0B0000
patch=1,EE,000C4060,word,112B000D
patch=1,EE,000C4064,word,00000000
patch=1,EE,000C4068,word,AD000000
patch=1,EE,000C406C,word,3C0B000C
patch=1,EE,000C4070,word,356B3FE0
patch=1,EE,000C4074,word,8D6B0000
patch=1,EE,000C4078,word,240C0001
patch=1,EE,000C407C,word,156C0030
patch=1,EE,000C4080,word,00000000
patch=1,EE,000C4084,word,154D002E
patch=1,EE,000C4088,word,00000000
patch=1,EE,000C408C,word,8D2C023C
patch=1,EE,000C4090,word,1000001A
patch=1,EE,000C4094,word,00000000
patch=1,EE,000C4098,word,8D2B023C
patch=1,EE,000C409C,word,8D0C0004
patch=1,EE,000C40A0,word,8D0D0008
patch=1,EE,000C40A4,word,3C0A000C
patch=1,EE,000C40A8,word,354A3FE0
patch=1,EE,000C40AC,word,8D4A0000
patch=1,EE,000C40B0,word,24090001
patch=1,EE,000C40B4,word,1549000B
patch=1,EE,000C40B8,word,00000000
patch=1,EE,000C40BC,word,240A0002
patch=1,EE,000C40C0,word,9229024B
patch=1,EE,000C40C4,word,152A0007
patch=1,EE,000C40C8,word,00000000
patch=1,EE,000C40CC,word,8E290078
patch=1,EE,000C40D0,word,116D000A
patch=1,EE,000C40D4,word,00000000
patch=1,EE,000C40D8,word,0160602D
patch=1,EE,000C40DC,word,10000007
patch=1,EE,000C40E0,word,00000000
patch=1,EE,000C40E4,word,8E290078
patch=1,EE,000C40E8,word,156D0014
patch=1,EE,000C40EC,word,00000000
patch=1,EE,000C40F0,word,AD2C023C
patch=1,EE,000C40F4,word,10000011
patch=1,EE,000C40F8,word,00000000
patch=1,EE,000C40FC,word,3C0B3D80
patch=1,EE,000C4100,word,018B582B
patch=1,EE,000C4104,word,1560000D
patch=1,EE,000C4108,word,00000000
patch=1,EE,000C410C,word,3C0B4080
patch=1,EE,000C4110,word,016C582B
patch=1,EE,000C4114,word,15600009
patch=1,EE,000C4118,word,00000000
patch=1,EE,000C411C,word,3C0D0100
patch=1,EE,000C4120,word,018D6821
patch=1,EE,000C4124,word,AD2D023C
patch=1,EE,000C4128,word,AD090000
patch=1,EE,000C412C,word,AD0C0004
patch=1,EE,000C4130,word,AD0D0008
patch=1,EE,000C4134,word,10000002
patch=1,EE,000C4138,word,00000000
patch=1,EE,000C413C,word,AD000000
patch=1,EE,000C4140,word,7BA80000
patch=1,EE,000C4144,word,7BA90010
patch=1,EE,000C4148,word,7BAA0020
patch=1,EE,000C414C,word,7BAB0030
patch=1,EE,000C4150,word,7BAC0040
patch=1,EE,000C4154,word,7BAD0050
patch=1,EE,000C4158,word,27BD0060
patch=1,EE,000C415C,word,8E220220
patch=1,EE,000C4160,word,C7A0003C
patch=1,EE,000C4164,word,080FF884
patch=1,EE,000C4168,word,00000000
patch=1,EE,003FE208,word,08031000
patch=1,EE,003FE20C,word,00000000

[战斗其他（可独立启用）\自动QTE（首键启动）]
description=选招式/目标并按首个QTE键启动后，后续拍点由原生超时分支自动Great。建议开启【战斗速度】的同时开启本项。
patch=1,EE,E0010001,extended,000C3FE0
patch=1,EE,202F8B8C,extended,24020001
patch=1,EE,E0010000,extended,000C3FE0
patch=1,EE,202F8B8C,extended,000217FE
```

保存 PCSX2 为当前游戏生成的 `.pnach` 文件，然后关闭编辑器。不要另存成 `.pnach.txt`；使用“编辑作弊”可避免猜测作弊目录和文件名。

### 4. 启用金手指

停止游戏，回到游戏列表：

1. **右键游戏 → 属性**。
2. 打开 修改 页面。
3. 勾选 开启作弊。
4. 选择需要的项目。

### 5. 重新启动并验证

在游戏中使用手柄快捷键“Select + 十字键上”启用已选择的金手指。

游戏中，开启或关闭金手指后，使用“Select + 十字键下”关闭金手指，然后再次用“Select + 十字键上”开启金手指即可验收新的启用效果。

## 问题反馈

有问题可以通过各种渠道反馈给我，比如[哔哩哔哩](https://space.bilibili.com/10119)、[QQ群](https://blog.blfy.cc/ns/)等。
