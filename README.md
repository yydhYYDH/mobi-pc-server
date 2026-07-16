<p align="center">
  <img src="assets/icon-128.jpg" width="128" alt="图标">
</p>

<h3 align="center">
ClawMate：主动式端侧智能体系统
</h3>

<h4 align="center">
ClawMate: A Proactive On-Device Agent System
</h4>


<p align="center">
| <a href="https://arxiv.org/abs/2509.00531"><b>MobiAgent Paper</b></a> | <a href="https://arxiv.org/abs/2512.15784"><b>MobiMem Paper</b></a> | <a href="https://huggingface.co/collections/IPADS-SAI/mobimind-68b2aad150ccafd9d9e10e4d"><b>Huggingface</b></a> | <a href="https://github.com/doulujiyao12/mobiinfer"><b>MobiInfer</b></a> |
</p> 


<p align="center">
  <a href="README.en.md">English</a> | <a href="README.md">中文</a>
</p>

-----
## 关于

- 目标平台：HarmonyOS NEXT 
- HarmonyOS App：仅提供源码，不提供预构建 HAP
- 桌面应用：提供源码和预构建安装包
- 端侧推理：[MobiInfer](https://github.com/doulujiyao12/mobiinfer)
- 适用对象：开发者

前置要求：

- HarmonyOS NEXT 
- DevEco Studio + HarmonyOS Native SDK
- Python 3.10+

<p align="center">
<img src="assets/app.jpg" height="280" alt="app截屏">
<img src="assets/mobi-pc-server.png" width="280" alt="pc截屏">
</p>




## 新闻

- [2026.7.18] 🔥 我们开源了 ClawMate HarmonyOS App 和 ClawMate Desktop ！


### 演示视频


<table>
  <tr>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/399e4dea-b28c-4051-b684-85521a3b4800" controls width="220"></video>
      <br><small>自动采集并整理手机数据</small>
    </td>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/80949978-e29e-48e0-91b1-14f60c2701c7" controls width="220"></video>
      <br><small>“碰一碰”快速交换个人画像</small>
    </td>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/91e84083-a8b8-4cfe-b3ee-f4426d0ce1e7" controls width="220"></video>
      <br><small>Agent自动操作手机点奶茶</small>
    </td>
    <td align="center" width="25%">
      <video src="https://github.com/user-attachments/assets/c46ef03b-58b2-4f3a-98ae-bda7f20890ab" controls width="220"></video>
      <br><small>与千问协同购买华为Pura X手机</small>
    </td>
  </tr>
</table>

## 安装

### HarmonyOS App

HarmonyOS App 源码通过 Git submodule 管理，路径为 `clawmate-harmonyAPP/`。

```bash
git submodule update --init clawmate-harmonyAPP
```

源码仓库：[clawmate-harmonyAPP](https://github.com/doulujiyao12/mobiinfra-oh/tree/clawmate-harmonyAPP)

#### 开发环境

1. 安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)，建议使用支持 HarmonyOS NEXT / API 20+ 的版本。
2. 在 DevEco Studio 的 `Settings/Preferences > SDK > HarmonyOS > SDK Platforms` 中勾选并安装对应 API 版本的 Native SDK。
3. 把 `hdc` 对应目录加入 `PATH`，确认命令行可执行 `hdc list targets`。
4. Python 3.10+。


#### 编译运行

使用 DevEco Studio：

1. 打开仓库根目录。
2. 首次构建时让 DevEco Studio 生成根目录 `build-profile.json5`，并配置 HarmonyOS 自动签名或本机调试签名。
3. 选择 `entry` 模块和目标设备。
4. 点击 Run / Debug 安装到 HarmonyOS NEXT 手机（需要手机打开开发者模式）。


### 桌面应用
桌面应用可以直接从[Release页面](https://github.com/IPADS-SAI/ClawMate/releases)下载。

| Platform | Download |
|--|--|
|macOS (Apple Silicon) |	ClawMate-desktop-mac-arm64.dmg |
|Windows | ClawMate-desktop-windows-x64.exe |
|Linux | ClawMate-desktop-linux-x64.AppImage |

- Windows：运行 `.exe` 安装包。
- macOS：打开 `.dmg` ，将应用拖入 Applications。
- Linux：给 `.AppImage` 添加执行权限后直接运行。


安装后首次启动会把随包配置复制到用户数据目录。模型文件、日志和缓存会保存在系统用户数据目录，覆盖安装或升级应用时不会写入安装目录。

用户也可以从源码构建桌面应用，方式记录在 [build.md](docs/build.md) 文档中。

### 端侧推理引擎

ClawMate 使用 [MobiInfer](https://github.com/doulujiyao12/mobiinfer) 作为 HarmonyOS NEXT 设备侧推理引擎。MobiInfer 负责在手机端加载量化后的端侧模型，并为 ClawMate 的 GUI Agent、个人数据理解和推荐能力提供本地推理服务。

推荐使用项目默认配置的模型与运行时组合：

- 推理引擎：[MobiInfer](https://github.com/doulujiyao12/mobiinfer)
- 量化工具：[mobi-autoround](https://github.com/doulujiyao12/mobi-autoround)
- 模型来源：[MobiMind](https://www.modelscope.cn/models/fengerhu1/MobiMind-1.5-2B-W8A8-0717)

桌面端会负责模型下载、运行时启动、日志查看和 HDC 连接管理。通常不需要手动替换推理引擎；如果需要从源码构建 MobiInfer 或调试运行时，可以参考 [MobiInfer 仓库](https://github.com/doulujiyao12/mobiinfer)。
