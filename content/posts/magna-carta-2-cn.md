---
title: XBOX 360《真名法典2》简体中文汉化补丁
date: 2026-11-03
cover: /uploads/cms/79fe9d9befa72d0e284c9c244c3b2f9f1705f078b50220c36245e00c79afbbe8/%E5%B0%81%E9%9D%A2%E5%9B%BE.png
tags:
  - 游戏
  - 汉化
  - 真名法典
pinned: false
gameSlug: magna-carta-2
access:
  mode: unlisted
---

## 安装方法

1. 下载韩版双盘镜像、DLC 包与汉化补丁。
2. 解压DLC包。
3. 打开汉化补丁，选择镜像与 DLC，确认无误后点击“检查文件并继续”。![选择镜像与 DLC](/uploads/cms/ca55437ba67c35d459c274da5379aaddfb88aeab02104fbe186b6910b2d5b674/%E9%80%89%E6%8B%A9%E9%95%9C%E5%83%8F%E5%92%8CDLC.png)
4. 选择输出格式与输出文件夹，汉化补丁提供 zar 与 xex 两种格式选择，请按需选择。确认无误后点击“开始安装”。![选择格式](/uploads/cms/5b7c9689f2d336067e4b6774a150c07b242e291e8e72e73d3222efbadf22fa76/%E9%80%89%E6%8B%A9%E6%A0%BC%E5%BC%8F.png)
5. 等待安装……![安装中……](/uploads/cms/9c5a6e82735e05b37822bd2b19973dad31885c6bb288fe90863cfe6833946590/%E7%AD%89%E5%BE%85%E5%AE%89%E8%A3%85.png)
6. 安装完成后即可使用自己喜欢的方式来游玩。“部署与换碟说明”可以查看对应格式的使用方法。![安装完成](/uploads/cms/f7f5308a9cef55de825202564205f22c74cd81ad0ff68c8a0f4cd5edcd3763b8/%E5%AE%89%E8%A3%85%E5%AE%8C%E6%88%90.png)
7. zar 和 xex 两种格式的输出目录结构如下图所示。![输出目录（zar）](/uploads/cms/4ece443fad6a594cb0de5d9e0027ecf0858197fe1c1e5a694dfb11444b57d807/%E8%BE%93%E5%87%BA%E7%9B%AE%E5%BD%95%EF%BC%88zar%EF%BC%89.png)![输出目录（xex）](/uploads/cms/253b3298fd14d63887ca94179eaf3a016aff45947c69a2c974aafb28f9d1fb27/%E8%BE%93%E5%87%BA%E7%9B%AE%E5%BD%95%20%EF%BC%88xex%EF%BC%89.png)
8. （模拟器用户）打开 xenia，选择 Content - Install Content，在弹出的窗口中选择 DLC 并进行安装，共有两个 DLC。![安装 DLC](/uploads/cms/3d3fc8b0e3738e3936eb2dac17357b915fec62b29312bac7395a2d4d519def65/%E5%AE%89%E8%A3%85DLC.png)![短剧包](/uploads/cms/97f7baaa8af5a75e090cc591616bf2347b2c6326cb711fc989eb15624667bbd4/%E7%9F%AD%E5%89%A7%E5%8C%85.png)![特殊武器包](/uploads/cms/1e09c7754e056f82581286fc93bdb6933eafa5a82f93f4577069e4535bd37f81/%E7%89%B9%E6%AE%8A%E6%AD%A6%E5%99%A8%E5%8C%85.png)



---



## 模拟器设置 + 补丁

### 模拟器设置

请使用最新版本的 [Xenia Canary](https://github.com/xenia-canary/xenia-canary/releases/latest/download/xenia_canary_windows.7z)，打不开的话请自己寻找科学的上网方式，不要问我为什么下载不了，我<span data-text-color="#dc2626" data-text-size="18">不会回答</span>任何相关问题。

下载以后，将模拟器解压至一个没有中文的目录中，双击运行`xenia_canary.exe`后，目录根目录会生成一个`xenia-canary.config.toml`文件，关闭模拟器，打开此文件。

搜索`gpu = `，在后面的冒号内输入`d3d12`，如图所示：

![GPU 设置](/uploads/cms/b54acddc6c84681b968326d9daeb6449f5bf0723bfb4bc63f5eb45ddcee05918/d3d12.png)

随后搜索`render_target_path_d3d12 = `，在后面的冒号内输入`rtv`，如图所示：

![rtv](/uploads/cms/cdf9f7ca69c9af0764d683193e97eafb36150ba61e6bf8d681a186a91b9d6c46/rtv.png)

### 如果想要提高画面分辨率

搜索`draw_resolution_scale`，找到下面两项，将后面的数字修改为对应数字即可。

根据估算，修改为`2`的情况下，分辨率可能是2K分辨率，修改为`3`则为4K分辨率。

x 轴和 y 轴可以进行数字混搭，并不一定非要是两个相同的数字，具体可以自己实测。

![分辨率设置](/uploads/cms/4b4c5a74827041b1ab25c62d4f0096c1961ba2171e6be9855c11c65557aa8ba6/%E5%88%86%E8%BE%A8%E7%8E%87.png)

修改完毕后，保存，关闭此文件即可。

其他相关问题，如创建 Profile、Console settings等，请问 AI，不要问我，我<span data-text-color="#dc2626" data-text-size="18">不会回答</span>任何相关问题。

### 补丁

补丁目前实现60帧、MSAA 阴影渲染错误和后处理，稳定性有待测试，默认关闭，如有需要请参考下文使用。

在模拟器文件夹的根目录，新建一个文件夹，重命名为`patches`，如图所示：

![patches 文件夹](/uploads/cms/a558c27ba9c055ae5dc1987fcc49f9a5a47907cac81317622057a435f06ed1dd/patches.png)

打开 patches 文件夹，新建一个文件，重命名为`4E4D0811 - Magna Carta II KOR Graphics Candidates.patch.toml`，如图所示：

![补丁文件](/uploads/cms/93a71d08647f26d68e8e72566b84a44fb47cd7616e4f12a5131a6f6704c8507a/%E8%A1%A5%E4%B8%81%E6%96%87%E4%BB%B6.png)

用任意文本编辑器打开此文件，将下面的代码粘贴进去，保存。

```toml
# 《真名法典2》韩版图形补丁：true 为启用对应补丁，false 为关闭，各项可分别选择。
# 版本匹配字段和写入地址／数值保持原样；运行时补丁不改写原版 XEX 或 ISO。
title_name = "Magna Carta II KOR Graphics Candidates"
title_id = "4E4D0811"
hash = "0FAA852250B131D1"

# 作用：把双刷新间隔改为单刷新间隔，60Hz下目标为60帧。
[[patch]]
name = "60帧"
desc = "将双刷新间隔改为单刷新间隔；60Hz下目标为60帧。长时间游玩的时序与稳定性仍需实测。"
is_enabled = false
author = "boma（原60帧与分块渲染修复思路）；伯翎飞云"

[[patch.be32]]
address = 0x8237c264
value = 0x39600001

# 类型：兼容性修复，针对动态光照和阴影的错误黑影／着色，不是画质增强。
# 做法：同时关闭分块渲染路径并重置模式；mode=0本身不代表关闭抗锯齿。
[[patch]]
name = "光照／阴影异常修复"
desc = "兼容性修复，针对动态光照和阴影的异常黑影／错误着色，绕过MSAA分块渲染路径。"
is_enabled = false
author = "boma（原60帧与分块渲染修复思路）；伯翎飞云"

[[patch.be32]]
address = 0x8320ad30
value = 0x00000000

[[patch.be32]]
address = 0x8320ad98
value = 0x00000000

# 类型：关闭后处理链的独立实验方案，不是增加后处理效果。
# 做法：跳过每个视图的后处理代理构建，使用原有空链出口。
# 边界：不等于关闭所有GPU效果；与美版原分支的等价性仍未证实。
[[patch]]
name = "关闭后处理链（实验）"
desc = "跳过每个视图的后处理代理构建，使用原有空链出口；这是韩版独立实验实现，未证明与美版原分支完全等价，画面与稳定性待实测。"
is_enabled = false
author = "伯翎飞云"

[[patch.be32]]
address = 0x8249b3c4
value = 0x480001bc
```

在需要开启的补丁下方，找到`is_enabled =` ，将对应的`false`改为`true`，保存，再次启动游戏，即可让补丁生效。



---



## 截图

![主界面](/uploads/cms/2b4a7fd3cb67e47453fa044aea83f34f1f4df8601cd9b8eaf700e21772671371/%E4%B8%BB%E7%95%8C%E9%9D%A2.png)

![读档界面](/uploads/cms/83760e0ba7f1a8fb69b2fdf5f1325c9094f2a296a1a9e0e03e9b088e01cacdc4/%E8%AF%BB%E6%A1%A3%E7%95%8C%E9%9D%A2.png)

![游戏选项](/uploads/cms/1551de984bb2b2fe0727fa12324022474b4218059e0dcebcdf0390fdba2bf655/%E6%B8%B8%E6%88%8F%E9%80%89%E9%A1%B9.png)

![按键设置](/uploads/cms/194ae3864bb00e97880f1ad61a6596a772bcd9160715e853cae4f94e50f4423b/%E6%8C%89%E9%94%AE%E8%AE%BE%E7%BD%AE.png)

![DLC 界面](/uploads/cms/ea2edb89000cc163467fa3d5eb95b1339bfcab584119eb61302efd065aa0f384/DLC%E7%95%8C%E9%9D%A2.png)

![过场动画字幕 1](/uploads/cms/4f1a5d2a5dc2881fd3b7eda9fcf991529c900ed0d84ced84b948acafce0cb5e9/%E8%BF%87%E5%9C%BA%E5%8A%A8%E7%94%BB%E5%AD%97%E5%B9%951.png)

![载入界面之一](/uploads/cms/218c6a9580022d085f267de5867dd900a3a6c2544ac9593c9b5b40fd72470690/%E8%BD%BD%E5%85%A5%E7%95%8C%E9%9D%A2%E4%B9%8B%E4%B8%80.png)

![过场动画字幕 2](/uploads/cms/16e9860d2e9e4732d6df8626f1136fa2cf221628a7823fd3133048e6569694d1/%E8%BF%87%E5%9C%BA%E5%8A%A8%E7%94%BB%E5%AD%97%E5%B9%952.png)

![人物对话](/uploads/cms/2814c8995257d600ba89f4c4a3fa5915a5e7b6812c2ce249080b492a5b0ef85b/%E4%BA%BA%E7%89%A9%E5%AF%B9%E8%AF%9D.png)

![教程界面](/uploads/cms/a033031dab055d894274785d924987504f0d8db030365a3f6cff03848f03fe6a/%E6%95%99%E7%A8%8B%E7%95%8C%E9%9D%A2.png)

![游戏画面](/uploads/cms/03fcf0fb40ea744129532f4593189a6a31f11c89ab8bbbb4df4ea947cd0b32b7/%E6%B8%B8%E6%88%8F%E7%94%BB%E9%9D%A2.png)

![地图界面](/uploads/cms/0c426cd3625e47bcfa8bcdf1ede28d2bb06868302a20227c1b1b8e7ce4236679/%E5%9C%B0%E5%9B%BE%E7%95%8C%E9%9D%A2.png)

![主菜单](/uploads/cms/ea4c1cd00a0b36852922095fea2f5b0eba8331a02ebc29dfc242ce6b91368804/%E4%B8%BB%E8%8F%9C%E5%8D%95.png)

![编队界面](/uploads/cms/47f845572b1df6368443ddbdb679ec1959cc9774d1f58fdc5e2e9737df0ddd33/%E7%BC%96%E9%98%9F%E7%95%8C%E9%9D%A2.png)

![道具界面](/uploads/cms/8511502c6167f1786a98b30fc8d288330526fb727a54bd435bdb05c17c550c26/%E9%81%93%E5%85%B7%E7%95%8C%E9%9D%A2.png)

![装备界面](/uploads/cms/3bc66b234e3aa48498e2e99b781ef8e1bc7b37b305f6ad4656eea767b6605683/%E8%A3%85%E5%A4%87%E7%95%8C%E9%9D%A2.png)

![NPC 对话](/uploads/cms/e699de24cbc281b4d13db3b62614d8eaf5f3d62b00d5a1613020567a1a6bb902/NPC%E5%AF%B9%E8%AF%9D.png)

![任务说明](/uploads/cms/5df7af6ca87d27530cc17e413163bd3bff02190b98c65babc23c3e21ba652b1e/%E4%BB%BB%E5%8A%A1%E8%AF%B4%E6%98%8E.png)

![任务图片](/uploads/cms/a39ce12b3950517df0da74b588e5ecab1a78cb03547ec0fa34b2d3e09babd365/%E4%BB%BB%E5%8A%A1%E5%9B%BE%E7%89%87.png)

![存档界面](/uploads/cms/06b17ad418a2b31164d4b4034b09c4df6d059e5f8bf777bc81e58d05257dce00/%E5%AD%98%E6%A1%A3%E7%95%8C%E9%9D%A2.png)

![战斗模式](/uploads/cms/239a4f74cd997f9bb06f0f8688a86624f60b3e11da4323e8faf8e40f8cbae797/%E6%88%98%E6%96%97%E6%A8%A1%E5%BC%8F.png)

![提交任务界面](/uploads/cms/f9692a49e86c3bf8e49d93393775661c4a9f2da5f51d8023e550b3f7997ab331/%E6%8F%90%E4%BA%A4%E4%BB%BB%E5%8A%A1.png)

![升级界面](/uploads/cms/8f3a44d0fd3122af84589b39fa50a2a71342963f28993c42e48e8f11d912d6fb/%E5%8D%87%E7%BA%A7%E7%95%8C%E9%9D%A2.png)



---



## 下载地址

GitHub

[Google Drive](https://drive.google.com/drive/folders/1pI9oXo5wawn_nHbvsPYA0Nk_LoblOdjT?usp=sharing)

[百度网盘](https://pan.baidu.com/s/1mXQ12OxhCnkfilNeeq4TkQ?pwd=blfy) 提取码: blfy

[夸克网盘](https://pan.quark.cn/s/4b4a32fea5ee) 提取码：ANbA
