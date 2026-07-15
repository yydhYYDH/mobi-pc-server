# Linux 打包说明

本文档说明如何在 Linux 或 WSL 环境中从源码构建 Linux 发布包。`backend`、`mobiinfer`、`llama.cpp` 都需要在目标平台源码构建，不能直接复用 Windows 或 macOS 的二进制文件。

## 前置要求

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Git、CMake。
- Ninja 或 Make。
- `patchelf`，用于将 llama.cpp 的运行时库路径修正为包内相对路径。
- 可构建 C/C++ 原生项目的编译器工具链。
- HarmonyOS `hdc`，可通过 DevEco Studio 或 Command Line Tools 获取。
- CUDA Toolkit，仅在构建 CUDA 版 llama.cpp 时需要。

```bash
node --version
python3 --version
git --version
cmake --version
patchelf --version
```

Ubuntu/Debian 可通过下面的命令安装 `patchelf`：

```bash
sudo apt install patchelf
```

## 初始化源码子模块

在仓库根目录执行：

```bash
git submodule update --init --depth 1 3rdparty/mobiinfer 3rdparty/llama.cpp
```

MobiInfer 和 llama.cpp 都由本仓库的打包流程从子模块源码构建。

## 资源目录

Linux x64 的桌面端资源会进入：

```text
desktop/resources-linux-x64/
  backend/                  pc-server-backend
  mobiinfer/                mnncli
  llama-cpp/cpu/            llama-server；如上游构建产生 .so，也会放在这里
  llama-cpp/cuda/           CUDA 版 llama-server；如上游构建产生 .so，也会放在这里，可选
  hdc/                      hdc
  frontend/                 frontend/dist
```

arm64 使用 `desktop/resources-linux-arm64/`。这些目录是打包阶段产物，可以删除后重新生成，不建议手动长期维护。

## 一键打包

把 `hdc` 所在目录加入 `PATH`，或通过 `HDC_BIN_LINUX` 指定实际路径。

x64 CPU 包：

```bash
scripts/release.sh --arch x64
```

x64 CPU + CUDA 包：

```bash
scripts/release.sh --arch x64 --cuda
```

arm64 包：

```bash
scripts/release.sh --arch arm64
```

如果 `hdc` 不在 `PATH`：

```bash
HDC_BIN_LINUX=/path/to/hdc scripts/release.sh --arch x64
```

脚本会执行依赖安装、构建后端、构建 MobiInfer、构建 llama.cpp、构建前端并生成 Electron 安装包。产物位于：

```text
desktop/release/
```

## 分阶段手动打包

如果不使用一键脚本，可以按下面的顺序手动执行。这里以 Linux x64 为例，arm64 时把 `x64` 替换为 `arm64`。

先设置目标平台、架构和 `hdc`：

```bash
export PC_SERVER_DESKTOP_TARGET_PLATFORM=linux
export PC_SERVER_DESKTOP_TARGET_ARCH=x64
export HDC_BIN_LINUX=/path/to/hdc
```

安装前端和桌面端依赖：

```bash
npm --prefix frontend ci
npm --prefix desktop ci
```

先构建 MobiInfer：

```bash
scripts/build-mobiinfer.sh
```

再构建 llama.cpp CPU 运行时，并复制到桌面资源目录：

```bash
LLAMA_CPP_BUILD_MODE=cpu \
LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-linux-x64/llama-cpp/cpu" \
scripts/build-llama-cpp.sh
```

当前脚本会传入 `-DBUILD_SHARED_LIBS=OFF`，因此正常情况下只需要 `llama-server` 本体；如果上游或某个后端仍生成运行所需 `.so`，脚本会跟随 `bin/` 目录一起复制。

需要 CUDA 包时，再构建 CUDA 运行时：

```bash
LLAMA_CPP_BUILD_MODE=cuda \
LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-linux-x64/llama-cpp/cuda" \
scripts/build-llama-cpp.sh
```

然后构建后端：

```bash
scripts/build-backend.sh
```

最后构建前端并调用桌面端 npm 打包：

```bash
npm --prefix frontend run build
npm --prefix desktop run build-linux-x64
```

arm64 对应命令为：

```bash
npm --prefix desktop run build-linux-arm
```

手动流程完成后，安装包和 `linux-unpacked` 目录同样位于：

```text
desktop/release/
```

阶段产物通常在这些位置：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli_linux_x64/mnncli
3rdparty/llama.cpp/build-linux-x64-cpu/bin/
3rdparty/llama.cpp/build-linux-x64-cuda/bin/
backend/dist/pc-server-backend
desktop/resources-linux-x64/
```

## 仅重新打包

已有同一平台和架构的构建产物时，可以跳过原生构建：

```bash
scripts/release.sh --arch x64 --skip-backend --skip-mobiinfer --skip-llama-cpp
```

手动流程中也可以只重新执行：

```bash
npm --prefix frontend run build
npm --prefix desktop run build-linux-x64
```

注意：Linux 后端和原生运行时必须在 Linux 环境构建。WSL 可用于构建 Linux 包，但产物不能用于 Windows 包。发布脚本不支持跨架构构建，`--arch` 必须与当前主机架构一致。
