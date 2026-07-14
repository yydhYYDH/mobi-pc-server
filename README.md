# 你的智伴

PC 侧控制台应用，用于启动和管理本地推理服务、从 ModelScope 下载模型，并通过 `hdc` 连接 HarmonyOS 设备。

英文版 README 保留在 [README.en.md](README.en.md)。

## 技术栈

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
3rdparty/mobiinfer  作为 Git submodule 引入的 mobiinfer 上游源码
3rdparty/llama.cpp 作为 Git submodule 引入的 llama.cpp 上游源码
docs/            项目文档
scripts/         开发脚本
```

## 开发运行

需要 Node.js 20 或更新版本：

```bash
nvm install 20
nvm use 20
```

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

开发模式下，Electron 会启动 Vite 前端和 FastAPI 后端，等待
`http://127.0.0.1:5173` 与 `http://127.0.0.1:8000/api/health` 可用后打开桌面窗口。

如果后端已经单独启动，不希望 Electron 再启动后端：

```bash
PC_SERVER_SKIP_BACKEND=1 npm run dev
```

如果前端已经单独启动，不希望 Electron 再启动前端：

```bash
PC_SERVER_SKIP_FRONTEND=1 npm run dev
```

桌面开发常用环境变量：

```text
PC_SERVER_BACKEND_HOST=127.0.0.1
PC_SERVER_BACKEND_PORT=8000
PC_SERVER_FRONTEND_URL=http://127.0.0.1:5173
PC_SERVER_SKIP_BACKEND=1
PC_SERVER_SKIP_FRONTEND=1
```

## 打包

打包前先安装前端和桌面端依赖：

```bash
cd frontend
npm install

cd ../desktop
npm install
```

打包 HarmonyOS 设备功能还需要 `hdc`。可通过以下任一方式获取：

1. 安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)，并通过其 SDK 管理器安装对应的 HarmonyOS SDK 和设备工具。
2. 从华为官方 [DevEco Studio 资源与开发工具](https://developer.huawei.com/consumer/cn/deveco-studio/resources/) 下载 **Command Line Tools**，解压后取得 `hdc`。

将 `hdc` 所在目录加入系统环境变量，或在打包前显式指定其路径。

编译并加载submodule:

初始化/更新两个 Git 子模块源码：
```bash
git submodule update --init --depth 1 3rdparty/mobiinfer 3rdparty/llama.cpp
```


submodule 准备好后，可以尝试构建mobiinfer和llama.cpp：

```bash
./scripts/build-mobiinfer.sh
./scripts/build-llama-cpp.sh
```

`build-mobiinfer.sh`脚本会执行两阶段流程：先构建 MobiInfer 静态库，再构建 `mnncli`。

### Windows x64

在 Windows 原生 PowerShell 或 Developer PowerShell 里执行：

```powershell
cd pc_server

.\scripts\windows\build-backend.ps1
.\scripts\windows\build-mobiinfer.ps1 -Architecture x64 -OpenSslRoot "C:\Program Files\OpenSSL-Win64"
.\scripts\windows\build-llama-cpp.ps1 -Mode cpu -Architecture x64

# 可选：需要 CUDA 版 llama.cpp 时再构建
.\scripts\windows\build-llama-cpp.ps1 -Mode cuda -Architecture x64 -CudaArch 89

cd desktop
npm run build-win-x64
```

产物会写到 `desktop/release/`。Windows arm64 对应使用 `-Architecture arm64` 和 `npm run build-win-arm`。

### macOS

Apple Silicon：

```bash
cd /path/to/pc_server

PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin PC_SERVER_DESKTOP_TARGET_ARCH=arm64 ./scripts/build-backend.sh
PC_SERVER_DESKTOP_TARGET_ARCH=arm64 ./scripts/build-mobiinfer.sh
LLAMA_CPP_BUILD_MODE=metal PC_SERVER_DESKTOP_TARGET_ARCH=arm64 \
  LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-mac-arm64/llama-cpp/cpu" \
  ./scripts/build-llama-cpp.sh

cd desktop
npm run build-mac-arm
```

Intel Mac 把 `arm64` 换成 `x64`，资源目录换成 `desktop/resources-mac-x64/llama-cpp/cpu`，最后执行 `npm run build-mac-x64`。

### Linux x64

```bash
cd /mnt/e/WAIC/pc_server

PC_SERVER_DESKTOP_TARGET_PLATFORM=linux PC_SERVER_DESKTOP_TARGET_ARCH=x64 ./scripts/build-backend.sh
PC_SERVER_DESKTOP_TARGET_ARCH=x64 ./scripts/build-mobiinfer.sh
LLAMA_CPP_BUILD_MODE=cpu PC_SERVER_DESKTOP_TARGET_ARCH=x64 \
  LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-linux-x64/llama-cpp/cpu" \
  ./scripts/build-llama-cpp.sh

# 可选：需要 CUDA 版 llama.cpp 时再构建
LLAMA_CPP_BUILD_MODE=cuda PC_SERVER_DESKTOP_TARGET_ARCH=x64 \
  LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-linux-x64/llama-cpp/cuda" \
  ./scripts/build-llama-cpp.sh

cd desktop
npm run build-linux-x64
```

Linux arm64 把 `x64` 换成 `arm64`，资源目录换成 `desktop/resources-linux-arm64/...`，最后执行 `npm run build-linux-arm`。

更详细说明见：

- Windows：[docs/packaging-windows.md](docs/packaging-windows.md)
- macOS：[docs/packaging-macos.md](docs/packaging-macos.md)
- Linux/WSL：[docs/packaging-linux.md](docs/packaging-linux.md)



## 模型

模型选项定义在 `configs/models.json`。开发模式下下载后的模型文件放在 `models/<model-id>/`，不提交到 Git。

桌面发布包会把模型、用户配置、日志和 ModelScope 缓存放到系统用户数据目录，避免覆盖安装或更新应用时被删除。详见 [docs/desktop-data.md](docs/desktop-data.md)。

## HarmonyOS 设备

安装 `hdc` 并确保它在 `PATH` 中，然后通过后端 API 或前端设备面板查看已连接设备。
