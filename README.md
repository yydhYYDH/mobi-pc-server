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

不同平台、架构的原生运行时文件会放到独立 staging 目录：

```text
desktop/resources-win-x64/
desktop/resources-win-arm64/
desktop/resources-linux-x64/
desktop/resources-linux-arm64/
desktop/resources-mac-x64/
desktop/resources-mac-arm64/
```

### Windows x64

在 Windows 原生 PowerShell 或 Developer PowerShell 里执行：

```powershell
cd E:\WAIC\pc_server

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

## 运行时后端

当前产品可选后端为：

- llama.cpp CUDA
- llama.cpp CPU
- MobiInfer

## MobiInfer

MobiInfer 作为独立运行时接入，用于加载 `runtime: "mobiinfer"` 的模型配置。

MobiInfer 作为 submodule 固定在当前仓库记录的 commit：

```text
798dbf4deddbb592bdf3ba07938fb31406d1578e
```

初始化或重置 MobiInfer 时，先拉 submodule，再显式 checkout 到这个 commit：

```bash
git submodule update --init 3rdparty/mobiinfer
git -C 3rdparty/mobiinfer fetch --depth 1 origin 798dbf4deddbb592bdf3ba07938fb31406d1578e
git -C 3rdparty/mobiinfer checkout --detach 798dbf4deddbb592bdf3ba07938fb31406d1578e
```

如果你是第一次完整初始化第三方依赖，也可以一次性执行：

```bash
git submodule update --init 3rdparty/mobiinfer 3rdparty/llama.cpp
```

后端默认查找：

```text
desktop/resources-linux-x64/mobiinfer/mnncli
desktop/resources-linux-arm64/mobiinfer/mnncli
desktop/resources-win-x64/mobiinfer/mnncli.exe
desktop/resources-win-arm64/mobiinfer/mnncli.exe
desktop/resources-mac-arm64/mobiinfer/mnncli
desktop/resources-mac-x64/mobiinfer/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_linux_x64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_linux_arm64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_win_x64/mnncli.exe
3rdparty/mobiinfer/apps/mnncli/build_mnncli_win_arm64/mnncli.exe
3rdparty/mobiinfer/apps/mnncli/build_mnncli_darwin_arm64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_darwin_x64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli
3rdparty/mobiinfer/apps/mnncli/build/mnncli
3rdparty/mobiinfer/build/apps/mnncli/mnncli
```

如果二进制在其他位置，启动后端前设置：

```bash
MOBIINFER_BIN=/absolute/path/to/mnncli
```

submodule 准备好后，可以尝试：

```bash
./scripts/build-mobiinfer.sh
```

该脚本会执行两阶段流程：先构建 MobiInfer 静态库，再构建 `mnncli`。默认期望的二进制路径按平台和架构区分，例如 Linux x64 是：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli_linux_x64/mnncli
```

更多集成说明见 [docs/mobiinfer.md](docs/mobiinfer.md)。

## llama.cpp

llama.cpp 作为 submodule 固定在项目记录的 commit：

```text
6eab47181cbd3532c88a105682b81b4729ab809b
```

初始化或重置 llama.cpp 时，显式 shallow fetch 这个 commit：

```bash
git submodule update --init 3rdparty/llama.cpp
git -C 3rdparty/llama.cpp fetch --depth 1 origin 6eab47181cbd3532c88a105682b81b4729ab809b
git -C 3rdparty/llama.cpp checkout --detach 6eab47181cbd3532c88a105682b81b4729ab809b
```

前端默认使用 llama.cpp 兜底后端。页面顶部和推理服务页可在 llama.cpp CUDA、llama.cpp CPU、MobiInfer 之间切换；CUDA/CPU 选项会按后端探测到的二进制动态显示。后端默认查找：

```text
3rdparty/llama.cpp/build/bin/llama-server
3rdparty/llama.cpp/build/bin/server
```

如果二进制在其他位置，启动后端前设置：

```bash
LLAMA_SERVER_BIN=/absolute/path/to/llama-server
```

CUDA 构建、模型下载和测试步骤见 [docs/llama-cpp.md](docs/llama-cpp.md)。

默认 CUDA 构建可直接执行：

```bash
./scripts/build-llama-cpp.sh
```

默认产物路径是：

```text
3rdparty/llama.cpp/build-cuda-native/bin/llama-server
```

## 模型

模型选项定义在 `configs/models.json`。开发模式下下载后的模型文件放在 `models/<model-id>/`，不提交到 Git。

桌面发布包会把模型、用户配置、日志和 ModelScope 缓存放到系统用户数据目录，避免覆盖安装或更新应用时被删除。详见 [docs/desktop-data.md](docs/desktop-data.md)。

## HarmonyOS 设备

安装 `hdc` 并确保它在 `PATH` 中，然后通过后端 API 或前端设备面板查看已连接设备。
