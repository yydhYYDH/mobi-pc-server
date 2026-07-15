# macOS 打包说明

本文档说明如何在 macOS 上从源码构建发布包。当前分别生成 Intel (`x64`) 和 Apple Silicon (`arm64`) 安装包，不生成 universal 包。

`backend`、`mobiinfer`、`llama.cpp` 都需要在目标平台源码构建，不能直接复用其他平台的二进制文件。macOS 默认构建 Metal 版 llama.cpp，不使用 CUDA。

## 前置要求

- Node.js 20 或更新版本。
- Python 3.11 或 3.12。
- Git。
- Xcode Command Line Tools。
- CMake。
- Ninja 或 Make。
- HarmonyOS `hdc`，可通过 DevEco Studio 或 Command Line Tools 获取。

```bash
node --version
python3 --version
git --version
xcode-select -p
cmake --version
```

如未安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

## 初始化源码子模块

在仓库根目录执行：

```bash
git submodule update --init --depth 1 3rdparty/mobiinfer 3rdparty/llama.cpp
```

## 资源目录

macOS Apple Silicon 的桌面端资源会进入：

```text
desktop/resources-mac-arm64/
  backend/                  pc-server-backend
  mobiinfer/                mnncli
  llama-cpp/cpu/            Metal 版 llama-server；如上游构建产生 .dylib，也会放在这里
  hdc/                      hdc
  frontend/                 frontend/dist
```

Intel 使用 `desktop/resources-mac-x64/`。这些目录是打包阶段产物，可以删除后重新生成，不建议手动长期维护。

## 一键打包

把 `hdc` 所在目录加入 `PATH`，或通过 `HDC_BIN_DARWIN` 指定实际路径。

Apple Silicon：

```bash
scripts/release.sh --arch arm64
```

Intel：

```bash
scripts/release.sh --arch x64
```

如果 `hdc` 不在 `PATH`：

```bash
HDC_BIN_DARWIN=/path/to/hdc scripts/release.sh --arch arm64
```

脚本会执行依赖安装、构建后端、构建 MobiInfer、构建 Metal 版 llama.cpp、构建前端并生成 Electron 安装包。产物位于：

```text
desktop/release/
```

## 分阶段手动打包

如果不使用一键脚本，可以按下面的顺序手动执行。这里以 Apple Silicon 为例，Intel 时把 `arm64` 替换为 `x64`。

先设置目标平台、架构和 `hdc`：

```bash
export PC_SERVER_DESKTOP_TARGET_PLATFORM=darwin
export PC_SERVER_DESKTOP_TARGET_ARCH=arm64
export HDC_BIN_DARWIN=/path/to/hdc
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

再构建 Metal 版 llama.cpp，并复制到桌面资源目录：

```bash
LLAMA_CPP_BUILD_MODE=metal \
LLAMA_CPP_INSTALL_DIR="$PWD/desktop/resources-mac-arm64/llama-cpp/cpu" \
scripts/build-llama-cpp.sh
```

当前脚本会传入 `-DBUILD_SHARED_LIBS=OFF`，因此正常情况下只需要 `llama-server` 本体；如果上游或某个后端仍生成运行所需 `.dylib`，脚本会跟随 `bin/` 目录一起复制。

然后构建后端：

```bash
scripts/build-backend.sh
```

最后构建前端并调用桌面端 npm 打包：

```bash
npm --prefix frontend run build
npm --prefix desktop run build-mac-arm
```

Intel 对应命令为：

```bash
npm --prefix desktop run build-mac-x64
```

手动流程完成后，安装包和 unpacked 目录同样位于：

```text
desktop/release/
```

阶段产物通常在这些位置：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli_darwin_arm64/mnncli
3rdparty/llama.cpp/build-darwin-arm64-metal/bin/
backend/dist/pc-server-backend
desktop/resources-mac-arm64/
```

## 仅重新打包

已有同一平台和架构的构建产物时，可以跳过原生构建：

```bash
scripts/release.sh --arch arm64 --skip-backend --skip-mobiinfer --skip-llama-cpp
```

手动流程中也可以只重新执行：

```bash
npm --prefix frontend run build
npm --prefix desktop run build-mac-arm
```

注意：后端和原生运行时必须与目标架构一致。Apple Silicon 上构建 Intel 包时，应使用 Intel Mac 或 Rosetta x64 Python/工具链；仅传入 `--arch x64` 不会把当前 arm64 Python 生成的后端转换为 x64。

## 发布说明

当前本地打包跳过 macOS 代码签名。未签名或未公证的应用可能被 Gatekeeper 阻止打开；对外发布需要配置 Apple Developer ID、Hardened Runtime、entitlements 和 notarization。
