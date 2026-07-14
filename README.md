
<p align="center">
  <img src="assets/icon-128.jpg" width="128" alt="图标">
</p>

<p align="center">
  你的智伴：自主感知，自主决策与主动式服务，实现全时陪伴的数字分身
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.md">中文</a>
</p>

-----
## 关于
你的智伴(ClawMate) 是一款面向 HarmonyOS NEXT 的端侧智能体应用，支持图库分析、个人画像、推荐事项和数字分身等能力，形成从“理解个人数据”到“执行真实手机操作”的完整移动智能体体验。

<p align="center">
<img src="assets/app.jpg" height="280" alt="app截屏">
<img src="assets/mobi-pc-server.png" width="280" alt="pc截屏">
</p>

本仓库提供鸿蒙和桌面应用的安装包，并提供桌面应用的源码。

## 安装
### 鸿蒙和桌面应用
鸿蒙和桌面应用可以直接从[Release页面](https://github.com/yydhYYDH/mobi-pc-server/releases)下载。

| Platform | Download |
|--|--|
| HarmonyOS NEXT |	ClawMate.hap |
|macOS (Apple Silicon) |	ClawMate-desktop-mac-arm64.dmg |
|Windows | ClawMate-desktop-windows-x64.exe |
|Linux | ClawMate-desktop-linux-x64.AppImage |

## 桌面应用技术栈

- 前端：React + Vite + TypeScript
- 后端：FastAPI
- 桌面壳：Electron
- 原生运行时：`3rdparty/mobiinfer` 下的 MobiInfer，`3rdparty/llama.cpp` 下的 llama.cpp
- 模型来源：ModelScope
- 设备桥接：HarmonyOS `hdc`

## 目录结构

```text
frontend/        浏览器控制台页面
backend/         本地 API 服务和进程封装
desktop/         Electron 桌面启动壳
configs/         模型目录和静态配置
models/          下载后的模型文件，不提交到 Git
logs/            运行日志，不提交到 Git
3rdparty/mobiinfer  普通目录，放置 MobiInfer 预编译运行时文件
3rdparty/llama.cpp 普通目录，放置 llama.cpp 预编译运行时文件
docs/            项目文档
scripts/         开发脚本
```

## 开发运行

需要 Node.js 20 或更新版本：

启动后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

前端默认访问后端地址：

```text
http://127.0.0.1:8000
```

启动桌面开发版：

```bash
cd desktop
npm install
npm run dev
```

## 打包

打包 HarmonyOS 设备功能需要 `hdc`。可通过以下任一方式获取：

1. 安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)，并通过其 SDK 管理器安装对应的 HarmonyOS SDK 和设备工具。
2. 从华为官方 [DevEco Studio 资源与开发工具](https://developer.huawei.com/consumer/cn/deveco-studio/resources/) 下载 **Command Line Tools**，解压后取得 `hdc`。

将 `hdc` 所在目录加入系统环境变量，或在打包前显式指定其路径。

首先拉取预编译好的llama.cpp和mobiinfer

```bash
git lfs pull
```

尝试一键运行脚本：
* Linux/Mac:
```bash
scripts/release.sh
```

* Win

```bash
scripts/windows/release.ps1
```

更多详细打包的信息见：
- Windows：[docs/packaging-windows.md](docs/packaging-windows.md)
- macOS：[docs/packaging-macos.md](docs/packaging-macos.md)
- Linux/WSL：[docs/packaging-linux.md](docs/packaging-linux.md)

